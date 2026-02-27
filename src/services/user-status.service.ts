import prisma from "../config/prisma.js";

export interface UserStatusResponse {
  userId: number;
  isOnline: boolean;
  hasActiveFocusSession: boolean;
  activeFocusSessionId: number | null;
  statusUpdatedAt: Date | null;
}

export class UserStatusService {
  /**
   * Update user's online status based on focus sessions
   * User is online if they have an active focus session (status = 'active' or 'paused')
   * @param userId User ID
   * @param isOnline Whether user should be online
   */
  async updateUserStatus(userId: number, isOnline: boolean): Promise<void> {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          isOnline,
          statusUpdatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`Error updating user status for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Derive user status from focus sessions (source of truth)
   * @param userId User ID
   * @returns Whether user has an active focus session
   */
  async getUserStatusFromFocusSessions(userId: number): Promise<boolean> {
    try {
      const activeSession = await prisma.focusSession.findFirst({
        where: {
          userId,
          status: {
            in: ["active", "paused"],
          },
        },
        select: {
          id: true,
        },
      });

      return !!activeSession;
    } catch (error) {
      console.error(`Error getting user status from focus sessions for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Derive user status from focus room sessions (source of truth)
   * User is "in session" if they are a participant in a room that has an active (ACTIVE or PAUSED) focus room session
   */
  async getUserStatusFromFocusRoomSessions(userId: number): Promise<boolean> {
    try {
      const participantInActiveRoom = await prisma.focusRoomParticipant.findFirst({
        where: {
          userId,
          status: { not: "LEFT" },
          room: {
            sessions: {
              some: {
                status: { in: ["ACTIVE", "PAUSED"] },
              },
            },
          },
        },
        select: { id: true },
      });
      return !!participantInActiveRoom;
    } catch (error) {
      console.error(`Error getting user status from focus room sessions for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Get derived online status from actual sessions (focus + focus room).
   * This is the source of truth; User.isOnline is a cache that can become stale.
   */
  async getDerivedOnlineStatus(userId: number): Promise<boolean> {
    const [fromFocus, fromRoom] = await Promise.all([
      this.getUserStatusFromFocusSessions(userId),
      this.getUserStatusFromFocusRoomSessions(userId),
    ]);
    return fromFocus || fromRoom;
  }

  /**
   * Batch get derived online status for multiple users (for list endpoints).
   */
  async getDerivedOnlineStatusBatch(userIds: number[]): Promise<Map<number, boolean>> {
    if (userIds.length === 0) return new Map();

    const [focusUserIds, roomUserIds] = await Promise.all([
      prisma.focusSession
        .findMany({
          where: {
            userId: { in: userIds },
            status: { in: ["active", "paused"] },
          },
          select: { userId: true },
          distinct: ["userId"],
        })
        .then((rows) => new Set(rows.map((r) => r.userId))),
      prisma.focusRoomParticipant
        .findMany({
          where: {
            userId: { in: userIds },
            status: { not: "LEFT" },
            room: {
              sessions: {
                some: { status: { in: ["ACTIVE", "PAUSED"] } },
              },
            },
          },
          select: { userId: true },
          distinct: ["userId"],
        })
        .then((rows) => new Set(rows.map((r) => r.userId))),
    ]);

    const result = new Map<number, boolean>();
    for (const id of userIds) {
      result.set(id, focusUserIds.has(id) || roomUserIds.has(id));
    }
    return result;
  }

  /**
   * Get user's active status (source of truth: derived from focus + focus room sessions)
   * Returns derived isOnline so users never appear "online" when they have no active session.
   * Also syncs the User.isOnline cache when it drifts from the derived value.
   */
  async getUserActiveStatus(userId: number): Promise<UserStatusResponse> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          isOnline: true,
          statusUpdatedAt: true,
        },
      });

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Source of truth: active focus session OR participant in active focus room session
      const [activeFocusSession, activeRoomParticipation] = await Promise.all([
        prisma.focusSession.findFirst({
          where: {
            userId,
            status: { in: ["active", "paused"] },
          },
          select: { id: true },
          orderBy: { startedAt: "desc" },
        }),
        prisma.focusRoomParticipant.findFirst({
          where: {
            userId,
            status: { not: "LEFT" },
            room: {
              sessions: {
                some: { status: { in: ["ACTIVE", "PAUSED"] } },
              },
            },
          },
          select: { id: true },
        }),
      ]);

      const hasActiveFocusSession = !!activeFocusSession;
      const hasActiveFocusRoomSession = !!activeRoomParticipation;
      const derivedIsOnline = hasActiveFocusSession || hasActiveFocusRoomSession;

      // Sync cache if it was stale (e.g. user closed tab without ending session)
      if (user.isOnline !== derivedIsOnline) {
        this.updateUserStatus(userId, derivedIsOnline).catch((err) =>
          console.error(`Error syncing user status for ${userId}:`, err)
        );
      }

      return {
        userId: user.id,
        isOnline: derivedIsOnline,
        hasActiveFocusSession,
        activeFocusSessionId: activeFocusSession?.id ?? null,
        statusUpdatedAt: user.statusUpdatedAt,
      };
    } catch (error) {
      console.error(`Error getting user active status for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Sync user's cached status with actual sessions (focus + focus room)
   */
  async syncUserStatus(userId: number): Promise<void> {
    try {
      const derived = await this.getDerivedOnlineStatus(userId);
      await this.updateUserStatus(userId, derived);
    } catch (error) {
      console.error(`Error syncing user status for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get active users with optional filters.
   * Uses derived online status (focus + focus room sessions) so only users with an actual session appear online.
   */
  async getActiveUsers(options: {
    workspaceId?: number;
    teamId?: number;
    requesterId: number;
  }): Promise<Array<{
    id: number;
    name: string;
    username: string;
    isOnline: boolean;
    statusUpdatedAt: Date | null;
  }>> {
    try {
      let whereClause: any = {
        isOnline: true,
      };

      if (options.workspaceId) {
        whereClause.workspaceMemberships = {
          some: { workspaceId: options.workspaceId },
        };
      }
      if (options.teamId) {
        whereClause.teamMemberships = {
          some: { teamId: options.teamId, status: "ACTIVE" },
        };
      }

      const users = await prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          username: true,
          isOnline: true,
          statusUpdatedAt: true,
        },
        orderBy: { statusUpdatedAt: "desc" },
      });

      const userIds = users.map((u) => u.id);
      const derivedStatus = await this.getDerivedOnlineStatusBatch(userIds);

      // Optionally sync cache for users who are marked online in DB but actually offline (stale)
      const staleOnlineUserIds = users.filter((u) => !(derivedStatus.get(u.id) ?? false)).map((u) => u.id);
      if (staleOnlineUserIds.length > 0) {
        Promise.all(
          staleOnlineUserIds.map((id) =>
            this.updateUserStatus(id, false).catch((err) =>
              console.error(`Error syncing stale user status for ${id}:`, err)
            )
          )
        ).catch(() => {});
      }

      return users
        .map((u) => ({
          ...u,
          isOnline: derivedStatus.get(u.id) ?? false,
        }))
        .filter((u) => u.isOnline);
    } catch (error) {
      console.error("Error getting active users:", error);
      throw error;
    }
  }

  /**
   * Get workspace members' status.
   * isOnline is derived from actual focus + focus room sessions.
   */
  async getWorkspaceMembersStatus(workspaceId: number): Promise<Array<{
    userId: number;
    name: string;
    role: string;
    isOnline: boolean;
    statusUpdatedAt: Date | null;
  }>> {
    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: {
          memberships: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  isOnline: true,
                  statusUpdatedAt: true,
                },
              },
            },
          },
        },
      });

      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`);
      }

      const userIds = workspace.memberships.map((m) => m.user.id);
      const derivedStatus = await this.getDerivedOnlineStatusBatch(userIds);

      return workspace.memberships.map((membership) => ({
        userId: membership.user.id,
        name: membership.user.name,
        role: membership.role,
        isOnline: derivedStatus.get(membership.user.id) ?? false,
        statusUpdatedAt: membership.user.statusUpdatedAt,
      }));
    } catch (error) {
      console.error(`Error getting workspace members status for workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Get team members' status.
   * isOnline is derived from actual focus + focus room sessions.
   */
  async getTeamMembersStatus(teamId: number): Promise<Array<{
    userId: number;
    name: string;
    role: string;
    status: string;
    isOnline: boolean;
    statusUpdatedAt: Date | null;
  }>> {
    try {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        include: {
          memberships: {
            where: { status: "ACTIVE" },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  isOnline: true,
                  statusUpdatedAt: true,
                },
              },
            },
          },
        },
      });

      if (!team) {
        throw new Error(`Team ${teamId} not found`);
      }

      const userIds = team.memberships.map((m) => m.user.id);
      const derivedStatus = await this.getDerivedOnlineStatusBatch(userIds);

      return team.memberships.map((membership) => ({
        userId: membership.user.id,
        name: membership.user.name,
        role: membership.role,
        status: membership.status,
        isOnline: derivedStatus.get(membership.user.id) ?? false,
        statusUpdatedAt: membership.user.statusUpdatedAt,
      }));
    } catch (error) {
      console.error(`Error getting team members status for team ${teamId}:`, error);
      throw error;
    }
  }
}

const userStatusService = new UserStatusService();
export default userStatusService;

