import type { Request, Response } from "express";
import analyticsService from "../services/analytics.service.js";
import aggregationService from "../services/aggregation.service.js";
import permissionService from "../services/permission.service.js";
import prisma from "../config/prisma.js";

class AnalyticsController {
  /**
   * GET /api/analytics/productivity - Personal productivity analytics
   */
  async getProductivityAnalytics(req: Request, res: Response): Promise<void> {
    try {
      console.log("GET /api/analytics/productivity - Fetching productivity analytics");
      
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      
      // Parse the timeframe - it can be a string like '30days' or a number of days
      let days = 30; // Default to 30 days
      const timeframe = req.query.timeframe as string || '30days';
      
      if (timeframe) {
        try {
          // Convert to days if it's a number
          if (/^\d+$/.test(timeframe)) {
            days = parseInt(timeframe, 10);
          } else if (timeframe.endsWith('days')) {
            // Parse '30days' format
            days = parseInt(timeframe.replace('days', ''), 10);
          }
        } catch (parseError) {
          console.warn("Invalid timeframe format, using default 30 days:", parseError);
        }
      }
      
      console.log(`Fetching productivity analytics for user ${userId} with ${days} days timeframe`);
      const data = await analyticsService.getProductivityAnalytics(userId, days);
      
      // Set JSON content type to ensure client processes response as JSON
      res.setHeader('Content-Type', 'application/json');
      res.json(data);
    } catch (error) {
      console.error("Error fetching productivity analytics:", error);
      res.status(500).json({ 
        error: "Failed to fetch productivity analytics",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * GET /api/analytics/okr - OKR analytics
   */
  async getOkrAnalytics(req: Request, res: Response): Promise<void> {
    try {
      console.log("GET /api/analytics/okr - Fetching OKR analytics");
      
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      
      console.log(`Fetching OKR analytics for user ${userId}`);
      const data = await analyticsService.getOkrAnalytics(userId);
      
      // Set JSON content type to ensure client processes response as JSON
      res.setHeader('Content-Type', 'application/json');
      res.json(data);
    } catch (error) {
      console.error("Error fetching OKR analytics:", error);
      res.status(500).json({ 
        error: "Failed to fetch OKR analytics",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * GET /api/analytics/focus - Focus analytics
   */
  async getFocusAnalytics(req: Request, res: Response): Promise<void> {
    try {
      console.log("GET /api/analytics/focus - Fetching focus analytics");
      
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      
      // Parse the timeframe - it can be a string like '30days' or a number of days
      let days = 30; // Default to 30 days
      const timeframe = req.query.timeframe as string || '30days';
      
      if (timeframe) {
        try {
          // Convert to days if it's a number
          if (/^\d+$/.test(timeframe)) {
            days = parseInt(timeframe, 10);
          } else if (timeframe.endsWith('days')) {
            // Parse '30days' format
            days = parseInt(timeframe.replace('days', ''), 10);
          }
        } catch (parseError) {
          console.warn("Invalid timeframe format, using default 30 days:", parseError);
        }
      }
      
      console.log(`Fetching focus analytics for user ${userId} with ${days} days timeframe`);
      const data = await analyticsService.getFocusAnalytics(userId, days);
      
      // Set JSON content type to ensure client processes response as JSON
      res.setHeader('Content-Type', 'application/json');
      res.json(data);
    } catch (error) {
      console.error("Error fetching focus analytics:", error);
      res.status(500).json({ 
        error: "Failed to fetch focus analytics",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * GET /api/analytics/trends - Trends analytics
   */
  async getTrendsAnalytics(req: Request, res: Response): Promise<void> {
    try {
      console.log("GET /api/analytics/trends - Fetching trends analytics");
      
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      
      // Parse the timeframe - it can be a string like '30days' or a number of days
      let days = 30; // Default to 30 days
      const timeframe = req.query.days as string || req.query.timeframe as string || '30';
      
      if (timeframe) {
        try {
          // Convert to days if it's a number
          if (/^\d+$/.test(timeframe)) {
            days = parseInt(timeframe, 10);
          } else if (timeframe.endsWith('days')) {
            // Parse '30days' format
            days = parseInt(timeframe.replace('days', ''), 10);
          }
        } catch (parseError) {
          console.warn("Invalid timeframe format, using default 30 days:", parseError);
        }
      }
      
      console.log(`Fetching trends analytics for user ${userId} with ${days} days timeframe`);
      const data = await analyticsService.getTrendsAnalytics(userId, days);
      
      // Set JSON content type to ensure client processes response as JSON
      res.setHeader('Content-Type', 'application/json');
      res.json(data);
    } catch (error) {
      console.error("Error fetching trends analytics:", error);
      res.status(500).json({ 
        error: "Failed to fetch trends analytics",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * GET /api/analytics/productivity/team/:teamId - Team productivity analytics (aggregated)
   * Returns array of all teams where user is ADMIN or TEAM_MANAGER
   */
  async getTeamProductivityAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.user as any)?.userId || (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Parse timeframe
      let days = 30;
      const timeframe = req.query.timeframe as string || req.query.days as string || '30';
      if (timeframe) {
        try {
          if (/^\d+$/.test(timeframe)) {
            days = parseInt(timeframe, 10);
          } else if (timeframe.endsWith('days')) {
            days = parseInt(timeframe.replace('days', ''), 10);
          }
        } catch (parseError) {
          console.warn("Invalid timeframe format, using default 30 days:", parseError);
        }
      }

      // Get all teams where user is ADMIN or TEAM_MANAGER
      const userTeams = await permissionService.getUserTeams(userId);
      const teamsWithAccess = userTeams.filter(t => t.role === "TEAM_MANAGER" || t.role === "ADMIN");

      if (teamsWithAccess.length === 0) {
        res.json({
          teams: [],
          totalTeams: 0,
          message: "You are not a TEAM_MANAGER or ADMIN of any teams"
        });
        return;
      }

      // Get productivity analytics for each team
      const teamsData = await Promise.all(
        teamsWithAccess.map(async ({ teamId, role }) => {
          // Get team details (name and workspace)
          const team = await prisma.team.findUnique({
            where: { id: teamId },
            include: {
              workspace: {
                select: {
                  id: true,
                  name: true,
                  ownerId: true
                }
              }
            }
          });

          if (!team) {
            return null;
          }

          // Get aggregated data
          const aggregatedData = await aggregationService.aggregateTeamProductivity(teamId, days);

          // Build response for this team
          const teamResponse: any = {
            ...aggregatedData,
            // Team identification
            team: {
              id: team.id,
              name: team.name,
              workspaceId: team.workspaceId,
              workspace: {
                id: team.workspace.id,
                name: team.workspace.name,
                ownerId: team.workspace.ownerId
              }
            },
            // Explicit role information
            userRole: role,
            // Permissions object - clearly shows what user can do
            permissions: {
              canViewTeamAnalytics: true,
              canViewTeamMembers: role === "ADMIN",
              canViewIndividualMemberData: false, // Never allowed
              canManageTeamMembers: role === "ADMIN",
              canUpdateMemberRoles: role === "ADMIN"
            },
            // Access level description
            accessLevel: role === "ADMIN" 
              ? "ADMIN - Full team management access" 
              : "TEAM_MANAGER - Team analytics access only"
          };

          // If ADMIN, include team member list
          if (role === "ADMIN") {
            const teamMembers = await aggregationService.getTeamMembersBasicInfo(teamId);
            teamResponse.teamMembers = teamMembers;
          }

          return teamResponse;
        })
      );

      // Filter out null values (teams that weren't found)
      const validTeamsData = teamsData.filter(team => team !== null);

      res.json({
        teams: validTeamsData,
        totalTeams: validTeamsData.length
      });
    } catch (error) {
      console.error("Error fetching team productivity analytics:", error);
      res.status(500).json({
        error: "Failed to fetch team productivity analytics",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * GET /api/analytics/focus/team/:teamId - Team focus analytics (aggregated)
   */
  async getTeamFocusAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.user as any)?.userId || (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const teamId = parseInt(req.params.teamId);
      if (!teamId || isNaN(teamId)) {
        res.status(400).json({ error: "Bad Request", message: "Invalid team ID" });
        return;
      }

      // Check permission
      const permission = await permissionService.canViewTeamAnalytics(
        userId,
        teamId,
        "analytics.focus"
      );

      if (!permission.allowed) {
        res.status(403).json({
          error: "Forbidden",
          message: permission.reason || "You don't have permission to view team analytics",
          requiredRole: "TEAM_MANAGER or ADMIN",
          yourRole: permission.role || "MEMBER"
        });
        return;
      }

      // Parse timeframe
      let days = 30;
      const timeframe = req.query.timeframe as string || req.query.days as string || '30';
      if (timeframe) {
        try {
          if (/^\d+$/.test(timeframe)) {
            days = parseInt(timeframe, 10);
          } else if (timeframe.endsWith('days')) {
            days = parseInt(timeframe.replace('days', ''), 10);
          }
        } catch (parseError) {
          console.warn("Invalid timeframe format, using default 30 days:", parseError);
        }
      }

      // Get team details (name and workspace)
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        include: {
          workspace: {
            select: {
              id: true,
              name: true,
              ownerId: true
            }
          }
        }
      });

      if (!team) {
        res.status(404).json({ error: "Team not found" });
        return;
      }

      // Get aggregated data
      const aggregatedData = await aggregationService.aggregateTeamFocus(teamId, days);

      // Build response with role and permissions metadata
      const response: any = {
        ...aggregatedData,
        // Team identification
        team: {
          id: team.id,
          name: team.name,
          workspaceId: team.workspaceId,
          workspace: {
            id: team.workspace.id,
            name: team.workspace.name,
            ownerId: team.workspace.ownerId
          }
        },
        // Explicit role information
        userRole: permission.role,
        // Permissions object
        permissions: {
          canViewTeamAnalytics: true,
          canViewTeamMembers: permission.role === "ADMIN",
          canViewIndividualMemberData: false,
          canManageTeamMembers: permission.role === "ADMIN"
        },
        // Access level description
        accessLevel: permission.role === "ADMIN" 
          ? "ADMIN - Full team management access" 
          : "TEAM_MANAGER - Team analytics access only"
      };

      res.json(response);
    } catch (error) {
      console.error("Error fetching team focus analytics:", error);
      res.status(500).json({
        error: "Failed to fetch team focus analytics",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * GET /api/analytics/productivity/my-teams - Aggregate productivity across all teams user manages
   */
  async getMyTeamsProductivityAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.user as any)?.userId || (req.user as any)?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Parse timeframe
      let days = 30;
      const timeframe = req.query.timeframe as string || req.query.days as string || '30';
      if (timeframe) {
        try {
          if (/^\d+$/.test(timeframe)) {
            days = parseInt(timeframe, 10);
          } else if (timeframe.endsWith('days')) {
            days = parseInt(timeframe.replace('days', ''), 10);
          }
        } catch (parseError) {
          console.warn("Invalid timeframe format, using default 30 days:", parseError);
        }
      }

      // Get aggregated data across all teams
      const aggregatedData = await aggregationService.aggregateMyTeamsProductivity(userId, days);

      // Determine highest role across all teams
      const userTeams = await permissionService.getUserTeams(userId);
      const teamsWithAccess = userTeams.filter(t => t.role === "TEAM_MANAGER" || t.role === "ADMIN");
      const hasAdminRole = teamsWithAccess.some(t => t.role === "ADMIN");
      const highestRole = hasAdminRole ? "ADMIN" : "TEAM_MANAGER";

      // Build response with role and permissions metadata
      const response: any = {
        ...aggregatedData,
        // Explicit role information (highest role across all teams)
        userRole: highestRole,
        // Permissions object
        permissions: {
          canViewTeamAnalytics: true,
          canViewTeamMembers: hasAdminRole, // True if user is ADMIN in at least one team
          canViewIndividualMemberData: false,
          canManageTeamMembers: hasAdminRole,
          canUpdateMemberRoles: hasAdminRole
        },
        // Access level description
        accessLevel: hasAdminRole 
          ? "ADMIN - Full team management access in some teams" 
          : "TEAM_MANAGER - Team analytics access only"
      };

      res.json(response);
    } catch (error) {
      console.error("Error fetching my teams productivity analytics:", error);
      res.status(500).json({
        error: "Failed to fetch teams productivity analytics",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export default new AnalyticsController();
