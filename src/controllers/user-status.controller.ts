import type { Request, Response } from "express";
import userStatusService from "../services/user-status.service.js";
import prisma from "../config/prisma.js";

/**
 * Get current user's active status
 * GET /api/users/me/status
 */
export const getCurrentUserStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId || req.user?.id;
    
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const status = await userStatusService.getUserActiveStatus(userId);
    res.json(status);
  } catch (error: any) {
    console.error("Error getting current user status:", error);
    res.status(500).json({ error: error.message || "Failed to get user status" });
  }
};

/**
 * Get user's active status by user ID
 * GET /api/users/:userId/status
 */
export const getUserStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const requesterId = req.user?.userId || req.user?.id;
    const targetUserId = parseInt(req.params.userId);

    if (!requesterId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (isNaN(targetUserId)) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    // Check permission - users can view status of:
    // 1. Themselves (always allowed)
    // 2. Users in the same workspace/team (check if they share a workspace or team)
    if (requesterId !== targetUserId) {
      // Check if users share a workspace or team
      const sharedWorkspace = await prisma.workspaceMembership.findFirst({
        where: {
          userId: requesterId,
          workspace: {
            memberships: {
              some: {
                userId: targetUserId,
              },
            },
          },
        },
      });

      const sharedTeam = await prisma.teamMembership.findFirst({
        where: {
          userId: requesterId,
          status: "ACTIVE",
          team: {
            memberships: {
              some: {
                userId: targetUserId,
                status: "ACTIVE",
              },
            },
          },
        },
      });

      if (!sharedWorkspace && !sharedTeam) {
        res.status(403).json({
          error: "Forbidden",
          message: "You can only view status of users in your workspace or team",
        });
        return;
      }
    }

    const status = await userStatusService.getUserActiveStatus(targetUserId);
    res.json(status);
  } catch (error: any) {
    console.error("Error getting user status:", error);
    res.status(500).json({ error: error.message || "Failed to get user status" });
  }
};

/**
 * Get list of active users (with optional filters)
 * GET /api/users/active?workspaceId=123&teamId=456
 */
export const getActiveUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const requesterId = req.user?.userId || req.user?.id;

    if (!requesterId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const workspaceId = req.query.workspaceId ? parseInt(req.query.workspaceId as string) : undefined;
    const teamId = req.query.teamId ? parseInt(req.query.teamId as string) : undefined;

    // Get active users based on filters
    const activeUsers = await userStatusService.getActiveUsers({
      workspaceId,
      teamId,
      requesterId,
    });

    res.json({ users: activeUsers });
  } catch (error: any) {
    console.error("Error getting active users:", error);
    res.status(500).json({ error: error.message || "Failed to get active users" });
  }
};

/**
 * Get workspace members' status
 * GET /api/workspaces/:workspaceId/members/status
 */
export const getWorkspaceMembersStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const requesterId = req.user?.userId || req.user?.id;
    const workspaceId = parseInt(req.params.workspaceId);

    if (!requesterId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (isNaN(workspaceId)) {
      res.status(400).json({ error: "Invalid workspace ID" });
      return;
    }

    // Check if user has access to this workspace
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    });

    if (!workspace) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }

    const isOwner = workspace.ownerId === requesterId;
    const isMember = await prisma.workspaceMembership.findFirst({
      where: {
        userId: requesterId,
        workspaceId,
      },
    });

    if (!isOwner && !isMember) {
      res.status(403).json({
        error: "Forbidden",
        message: "You don't have permission to view workspace members",
      });
      return;
    }

    const membersStatus = await userStatusService.getWorkspaceMembersStatus(workspaceId);
    res.json({ members: membersStatus });
  } catch (error: any) {
    console.error("Error getting workspace members status:", error);
    res.status(500).json({ error: error.message || "Failed to get workspace members status" });
  }
};

/**
 * Get team members' status
 * GET /api/teams/:teamId/members/status
 */
export const getTeamMembersStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const requesterId = req.user?.userId || req.user?.id;
    const teamId = parseInt(req.params.teamId);

    if (!requesterId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (isNaN(teamId)) {
      res.status(400).json({ error: "Invalid team ID" });
      return;
    }

    // Check if user has access to this team
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { workspace: true },
    });

    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const isWorkspaceOwner = team.workspace.ownerId === requesterId;
    const isTeamMember = await prisma.teamMembership.findFirst({
      where: {
        userId: requesterId,
        teamId,
        status: "ACTIVE",
      },
    });

    if (!isWorkspaceOwner && !isTeamMember) {
      res.status(403).json({
        error: "Forbidden",
        message: "You don't have permission to view team members",
      });
      return;
    }

    const membersStatus = await userStatusService.getTeamMembersStatus(teamId);
    res.json({ members: membersStatus });
  } catch (error: any) {
    console.error("Error getting team members status:", error);
    res.status(500).json({ error: error.message || "Failed to get team members status" });
  }
};
