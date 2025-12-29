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
   * Get user's active status with fallback to focus sessions
   * @param userId User ID
   * @returns User status information
   */
  async getUserActiveStatus(userId: number): Promise<UserStatusResponse> {
    try {
      // Get cached status from User table
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

      // Get active focus session (source of truth)
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
        orderBy: {
          startedAt: "desc",
        },
      });

      const hasActiveFocusSession = !!activeSession;

      return {
        userId: user.id,
        isOnline: user.isOnline,
        hasActiveFocusSession,
        activeFocusSessionId: activeSession?.id || null,
        statusUpdatedAt: user.statusUpdatedAt,
      };
    } catch (error) {
      console.error(`Error getting user active status for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Sync user's cached status with actual focus sessions
   * Useful for ensuring consistency
   * @param userId User ID
   */
  async syncUserStatus(userId: number): Promise<void> {
    try {
      const hasActiveSession = await this.getUserStatusFromFocusSessions(userId);
      await this.updateUserStatus(userId, hasActiveSession);
    } catch (error) {
      console.error(`Error syncing user status for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get active users with optional filters
   * @param options Filter options
   * @returns Array of active users with status
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

      // Filter by workspace if provided
      if (options.workspaceId) {
        whereClause.workspaceMemberships = {
          some: {
            workspaceId: options.workspaceId,
          },
        };
      }

      // Filter by team if provided
      if (options.teamId) {
        whereClause.teamMemberships = {
          some: {
            teamId: options.teamId,
            status: "ACTIVE",
          },
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
        orderBy: {
          statusUpdatedAt: "desc",
        },
      });

      return users;
    } catch (error) {
      console.error("Error getting active users:", error);
      throw error;
    }
  }

  /**
   * Get workspace members' status
   * @param workspaceId Workspace ID
   * @returns Array of workspace members with status
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

      return workspace.memberships.map((membership) => ({
        userId: membership.user.id,
        name: membership.user.name,
        role: membership.role,
        isOnline: membership.user.isOnline,
        statusUpdatedAt: membership.user.statusUpdatedAt,
      }));
    } catch (error) {
      console.error(`Error getting workspace members status for workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Get team members' status
   * @param teamId Team ID
   * @returns Array of team members with status
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
            where: {
              status: "ACTIVE",
            },
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

      return team.memberships.map((membership) => ({
        userId: membership.user.id,
        name: membership.user.name,
        role: membership.role,
        status: membership.status,
        isOnline: membership.user.isOnline,
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

