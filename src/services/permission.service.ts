/**
 * Permission Service
 * 
 * Handles permission checks based on user roles and data classification
 */

import prisma from "../config/prisma.js";
import dataClassificationService from "./data-classification.service.js";

export type TeamRole = "MEMBER" | "MANAGER" | "ADMIN";

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
  ): Promise<{ allowed: boolean; reason?: string; role?: TeamRole }> {
    // Check if user is a team member
    const role = await this.getTeamRole(requesterId, teamId);
    
    if (!role) {
      return {
        allowed: false,
        reason: "You must be a member of this team to view team analytics"
      };
    }

    // MEMBER role cannot view team analytics
    if (role === "MEMBER") {
      return {
        allowed: false,
        reason: "You need MANAGER or ADMIN role to view team analytics",
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
   * Check if user can manage team (add/remove members, update roles)
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

    // Workspace owner can manage any team
    if (team.workspace.ownerId === userId) {
      return true;
    }

    // Team ADMIN can manage the team
    const role = await this.getTeamRole(userId, teamId);
    return role === "ADMIN";
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

    // Only workspace owner can assign ADMIN role
    if (roleToAssign === "ADMIN") {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        include: { workspace: true }
      });

      if (team && team.workspace.ownerId !== userId) {
        return {
          allowed: false,
          reason: "Only workspace owner can assign ADMIN role"
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Get all teams user is a member of (ADMIN or MANAGER role)
   * Only returns teams with ACTIVE membership status
   */
  async getUserTeams(userId: number): Promise<Array<{ teamId: number; role: TeamRole }>> {
    const memberships = await prisma.teamMembership.findMany({
      where: {
        userId,
        status: "ACTIVE",
        role: {
          in: ["ADMIN", "MANAGER"]
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
}

export default new PermissionService();

