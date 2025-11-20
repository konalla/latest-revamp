/**
 * Permission Service
 * 
 * Handles permission checks based on user roles and data classification
 */

import prisma from "../config/prisma.js";
import dataClassificationService from "./data-classification.service.js";

export type TeamRole = "MEMBER" | "TEAM_MANAGER" | "ADMIN";
export type WorkspaceRole = "WORKSPACE_MANAGER";

export class PermissionService {
  /**
   * Get user's role in a team
   */
  async getTeamRole(userId: number, teamId: number): Promise<TeamRole | null> {
    try {
      const membership = await prisma.teamMembership.findUnique({
        where: {
          userId_teamId: { userId, teamId }
        }
      });

      if (!membership || membership.status !== "ACTIVE") {
        return null;
      }

      return membership.role as TeamRole;
    } catch (error) {
      console.error("Error getting team role:", error);
      return null;
    }
  }

  /**
   * Check if user is a member of a team
   */
  async isTeamMember(userId: number, teamId: number): Promise<boolean> {
    const role = await this.getTeamRole(userId, teamId);
    return role !== null;
  }

  /**
   * Check if user can view another user's data
   */
  async canViewUserData(
    requesterId: number,
    targetUserId: number,
    dataType: string,
    teamId?: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    // User can always view their own data
    if (requesterId === targetUserId) {
      return { allowed: true };
    }

    // Check data classification
    const classification = dataClassificationService.classifyDataType(dataType);
    
    // SENSITIVE data can never be viewed by others
    if (classification === "SENSITIVE") {
      return {
        allowed: false,
        reason: "Sensitive data can only be viewed by the data owner"
      };
    }

    // For PERSONAL and NON_PERSONAL data, check if users are in the same team
    if (teamId) {
      const requesterRole = await this.getTeamRole(requesterId, teamId);
      const targetRole = await this.getTeamRole(targetUserId, teamId);

      // Both must be team members
      if (!requesterRole || !targetRole) {
        return {
          allowed: false,
          reason: "Both users must be members of the same team"
        };
      }

      // For PERSONAL data, even team members can't view individual data
      // Only aggregated views are allowed
      if (classification === "PERSONAL") {
        return {
          allowed: false,
          reason: "Personal data cannot be viewed individually. Only aggregated team data is available."
        };
      }

      // NON_PERSONAL data can be viewed
      if (classification === "NON_PERSONAL") {
        return { allowed: true };
      }
    }

    return {
      allowed: false,
      reason: "Insufficient permissions to view this data"
    };
  }

  /**
   * Check if user can view aggregated team data
   */
  async canViewTeamAnalytics(
    requesterId: number,
    teamId: number,
    dataType: string
  ): Promise<{ allowed: boolean; reason?: string; role?: TeamRole | "WORKSPACE_MANAGER" }> {
    // Check if user is a team member
    const role = await this.getTeamRole(requesterId, teamId);
    
    // If not a team member, check if user is workspace manager or owner
    if (!role) {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        include: { workspace: true }
      });

      if (!team) {
        return {
          allowed: false,
          reason: "Team not found"
        };
      }

      // Check if workspace owner
      if (team.workspace.ownerId === requesterId) {
        // Workspace owner can view analytics (treat as ADMIN for data classification)
        const canShare = dataClassificationService.canShareDataType(dataType, "ADMIN");
        if (!canShare) {
          const classification = dataClassificationService.classifyDataType(dataType);
          return {
            allowed: false,
            reason: `${classification} data cannot be shared in team views`,
            role: "ADMIN"
          };
        }
        return {
          allowed: true,
          role: "ADMIN"
        };
      }

      // Check if workspace manager
      const isWManager = await this.isWorkspaceManager(requesterId, team.workspaceId);
      if (isWManager) {
        // Workspace manager can view analytics (treat as TEAM_MANAGER for data classification)
        const canShare = dataClassificationService.canShareDataType(dataType, "TEAM_MANAGER");
        if (!canShare) {
          const classification = dataClassificationService.classifyDataType(dataType);
          return {
            allowed: false,
            reason: `${classification} data cannot be shared in team views`,
            role: "WORKSPACE_MANAGER"
          };
        }
        return {
          allowed: true,
          role: "WORKSPACE_MANAGER"
        };
      }

      return {
        allowed: false,
        reason: "You must be a member of this team, workspace manager, or workspace owner to view team analytics"
      };
    }

    // MEMBER role cannot view team analytics
    if (role === "MEMBER") {
      return {
        allowed: false,
        reason: "You need TEAM_MANAGER or ADMIN role to view team analytics",
        role
      };
    }

    // Check if data type can be shared
    const canShare = dataClassificationService.canShareDataType(dataType, role);
    
    if (!canShare) {
      const classification = dataClassificationService.classifyDataType(dataType);
      return {
        allowed: false,
        reason: `${classification} data cannot be shared in team views`,
        role
      };
    }

    return {
      allowed: true,
      role
    };
  }

  /**
   * Check if user is workspace manager
   */
  async isWorkspaceManager(userId: number, workspaceId: number): Promise<boolean> {
    try {
      const membership = await prisma.workspaceMembership.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId }
        }
      });
      return !!membership;
    } catch (error) {
      console.error("Error checking workspace manager:", error);
      return false;
    }
  }

  /**
   * Check if user is workspace owner or admin
   */
  async isWorkspaceOwnerOrAdmin(userId: number, workspaceId: number): Promise<boolean> {
    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId }
      });
      return workspace?.ownerId === userId;
    } catch (error) {
      console.error("Error checking workspace owner:", error);
      return false;
    }
  }

  /**
   * Check if user can manage team (add/remove members, update roles, delete team)
   */
  async canManageTeam(userId: number, teamId: number): Promise<boolean> {
    // Check if user is workspace owner
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { workspace: true }
    });

    if (!team) {
      return false;
    }

    // Workspace owner/admin can manage any team
    if (team.workspace.ownerId === userId) {
      return true;
    }

    // Workspace manager can manage any team in the workspace
    const isWManager = await this.isWorkspaceManager(userId, team.workspaceId);
    if (isWManager) {
      return true;
    }

    // Team ADMIN or TEAM_MANAGER can manage the team
    const role = await this.getTeamRole(userId, teamId);
    return role === "ADMIN" || role === "TEAM_MANAGER";
  }

  /**
   * Check if user can manage workspace (assign workspace managers, create/delete teams)
   */
  async canManageWorkspace(userId: number, workspaceId: number): Promise<boolean> {
    // Workspace owner/admin can manage workspace
    const isOwner = await this.isWorkspaceOwnerOrAdmin(userId, workspaceId);
    if (isOwner) {
      return true;
    }

    // Workspace manager can manage workspace
    return await this.isWorkspaceManager(userId, workspaceId);
  }

  /**
   * Check if user can assign a specific role
   */
  async canAssignRole(
    userId: number,
    teamId: number,
    roleToAssign: TeamRole
  ): Promise<{ allowed: boolean; reason?: string }> {
    const canManage = await this.canManageTeam(userId, teamId);
    
    if (!canManage) {
      return {
        allowed: false,
        reason: "You don't have permission to manage this team"
      };
    }

    // Only workspace owner/admin can assign ADMIN role
    if (roleToAssign === "ADMIN") {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        include: { workspace: true }
      });

      if (team && team.workspace.ownerId !== userId) {
        return {
          allowed: false,
          reason: "Only workspace owner/admin can assign ADMIN role"
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check if user can assign workspace manager role
   */
  async canAssignWorkspaceManager(userId: number, workspaceId: number): Promise<{ allowed: boolean; reason?: string }> {
    // Only workspace owner/admin can assign workspace managers
    const isOwner = await this.isWorkspaceOwnerOrAdmin(userId, workspaceId);
    if (!isOwner) {
      return {
        allowed: false,
        reason: "Only workspace owner/admin can assign workspace managers"
      };
    }
    return { allowed: true };
  }

  /**
   * Get all teams user is a member of (ADMIN or TEAM_MANAGER role)
   * Only returns teams with ACTIVE membership status
   */
  async getUserTeams(userId: number): Promise<Array<{ teamId: number; role: TeamRole }>> {
    const memberships = await prisma.teamMembership.findMany({
      where: {
        userId,
        status: "ACTIVE",
        role: {
          in: ["ADMIN", "TEAM_MANAGER"]
        }
      },
      select: {
        teamId: true,
        role: true
      }
    });

    return memberships.map(m => ({
      teamId: m.teamId,
      role: m.role as TeamRole
    }));
  }

  /**
   * Get all workspaces user is a manager of
   */
  async getUserWorkspaces(userId: number): Promise<Array<{ workspaceId: number; role: WorkspaceRole }>> {
    const memberships = await prisma.workspaceMembership.findMany({
      where: {
        userId
      },
      select: {
        workspaceId: true,
        role: true
      }
    });

    return memberships.map(m => ({
      workspaceId: m.workspaceId,
      role: m.role as WorkspaceRole
    }));
  }

  /**
   * Check if user has access to a team (either as team member, team manager, workspace manager, or workspace owner)
   */
  async hasTeamAccess(userId: number, teamId: number): Promise<boolean> {
    // Check if user is team member
    const teamRole = await this.getTeamRole(userId, teamId);
    if (teamRole) {
      return true;
    }

    // Check if user is workspace manager or owner
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { workspace: true }
    });

    if (!team) {
      return false;
    }

    // Check if workspace owner
    if (team.workspace.ownerId === userId) {
      return true;
    }

    // Check if workspace manager
    return await this.isWorkspaceManager(userId, team.workspaceId);
  }
}

export default new PermissionService();

