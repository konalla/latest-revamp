import type { Request, Response } from "express";
import { CognitiveLoadService } from "../services/cognitive-load.service.js";
import type { CognitiveLoadError } from "../types/cognitive-load.types.js";
import permissionService from "../services/permission.service.js";
import aggregationService from "../services/aggregation.service.js";
import prisma from "../config/prisma.js";

export class CognitiveLoadController {
  private cognitiveLoadService: CognitiveLoadService;

  constructor() {
    this.cognitiveLoadService = new CognitiveLoadService();
  }

  /**
   * Get user's cognitive load meter
   * GET /api/cognitive-load/meter
   * SENSITIVE data - only user can view their own data
   */
  async getCognitiveLoadMeter(req: Request, res: Response): Promise<void> {
    try {
      const requesterId = (req.user as any)?.userId || (req.user as any)?.id;
      
      if (!requesterId) {
        console.error('No user ID found in cognitive load meter request');
        res.status(401).json({ 
          error: 'Unauthorized - no user ID',
          details: 'User authentication required to access cognitive load data'
        });
        return;
      }

      // Check if user is trying to view another user's data
      const targetUserId = req.query.userId 
        ? parseInt(req.query.userId as string) 
        : requesterId;

      if (targetUserId !== requesterId) {
        // Check permission (should always fail for SENSITIVE data)
        const permission = await permissionService.canViewUserData(
          requesterId,
          targetUserId,
          "cognitive_load.meter"
        );

        if (!permission.allowed) {
          res.status(403).json({
            error: "Forbidden",
            message: permission.reason || "You can only view your own cognitive load data",
            code: "SENSITIVE_DATA_ACCESS_DENIED"
          });
          return;
        }
      }

      console.log(`Getting cognitive load meter for user ID: ${targetUserId}`);
      const meterData = await this.cognitiveLoadService.getUserCognitiveLoadMeter(targetUserId);
      
      res.json(meterData);
    } catch (error) {
      console.error('Error getting cognitive load meter:', error);
      
      const errorResponse: CognitiveLoadError = {
        error: 'Failed to retrieve cognitive load meter',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      res.status(500).json(errorResponse);
    }
  }

  /**
   * Generate workload forecast
   * GET /api/cognitive-load/forecast
   */
  async generateWorkloadForecast(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        console.error('No user ID found in workload forecast request');
        res.status(401).json({ 
          error: 'Unauthorized - no user ID',
          details: 'User authentication required to generate workload forecast'
        });
        return;
      }

      const days = req.query.days ? parseInt(req.query.days as string) : 7;
      
      // Validate days parameter
      if (isNaN(days) || days < 1 || days > 30) {
        res.status(400).json({
          error: 'Invalid days parameter',
          details: 'Days must be a number between 1 and 30'
        });
        return;
      }

      console.log(`Generating workload forecast for user ${userId} for ${days} days`);
      const forecast = await this.cognitiveLoadService.generateWorkloadForecast(userId, days);
      
      res.json(forecast);
    } catch (error) {
      console.error('Error generating workload forecast:', error);
      
      const errorResponse: CognitiveLoadError = {
        error: 'Failed to generate workload forecast',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      res.status(500).json(errorResponse);
    }
  }

  /**
   * Assess burnout risk
   * GET /api/cognitive-load/burnout-risk
   */
  async assessBurnoutRisk(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        console.error('No user ID found in burnout risk assessment request');
        res.status(401).json({ 
          error: 'Unauthorized - no user ID',
          details: 'User authentication required to assess burnout risk'
        });
        return;
      }

      console.log(`Assessing burnout risk for user ${userId}`);
      const riskAssessment = await this.cognitiveLoadService.assessBurnoutRisk(userId);
      
      res.json(riskAssessment);
    } catch (error) {
      console.error('Error assessing burnout risk:', error);
      
      const errorResponse: CognitiveLoadError = {
        error: 'Failed to assess burnout risk',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      res.status(500).json(errorResponse);
    }
  }

  /**
   * Get adaptive recommendations
   * GET /api/cognitive-load/recommendations
   */
  async getAdaptiveRecommendations(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        console.error('No user ID found in adaptive recommendations request');
        res.status(401).json({ 
          error: 'Unauthorized - no user ID',
          details: 'User authentication required to generate adaptive recommendations'
        });
        return;
      }

      console.log(`Generating adaptive recommendations for user ${userId}`);
      const recommendations = await this.cognitiveLoadService.generateAdaptiveRecommendations(userId);
      
      res.json(recommendations);
    } catch (error) {
      console.error('Error generating adaptive recommendations:', error);
      
      const errorResponse: CognitiveLoadError = {
        error: 'Failed to generate adaptive recommendations',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      res.status(500).json(errorResponse);
    }
  }

  /**
   * Update cognitive load meter
   * PUT /api/cognitive-load/meter
   */
  async updateCognitiveLoadMeter(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        console.error('No user ID found in cognitive load meter update request');
        res.status(401).json({ 
          error: 'Unauthorized - no user ID',
          details: 'User authentication required to update cognitive load meter'
        });
        return;
      }

      const updateData = req.body;
      
      // Validate required fields if provided
      if (updateData.currentWorkloadScore !== undefined) {
        if (typeof updateData.currentWorkloadScore !== 'number' || 
            updateData.currentWorkloadScore < 0 || 
            updateData.currentWorkloadScore > 100) {
          res.status(400).json({
            error: 'Invalid currentWorkloadScore',
            details: 'Current workload score must be a number between 0 and 100'
          });
          return;
        }
      }

      if (updateData.burnoutRiskScore !== undefined) {
        if (typeof updateData.burnoutRiskScore !== 'number' || 
            updateData.burnoutRiskScore < 0 || 
            updateData.burnoutRiskScore > 100) {
          res.status(400).json({
            error: 'Invalid burnoutRiskScore',
            details: 'Burnout risk score must be a number between 0 and 100'
          });
          return;
        }
      }

      console.log(`Updating cognitive load meter for user ${userId}`);
      const updatedMeter = await this.cognitiveLoadService.updateCognitiveLoadMeter(userId, updateData);
      
      res.json(updatedMeter);
    } catch (error) {
      console.error('Error updating cognitive load meter:', error);
      
      const errorResponse: CognitiveLoadError = {
        error: 'Failed to update cognitive load meter',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      res.status(500).json(errorResponse);
    }
  }

  /**
   * Get user focus preferences
   * GET /api/cognitive-load/focus-preferences
   */
  async getFocusPreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        console.error('No user ID found in focus preferences request');
        res.status(401).json({ 
          error: 'Unauthorized - no user ID',
          details: 'User authentication required to access focus preferences'
        });
        return;
      }

      console.log(`Getting focus preferences for user ${userId}`);
      const preferences = await this.cognitiveLoadService.getUserFocusPreferences(userId);
      
      res.json(preferences);
    } catch (error) {
      console.error('Error getting focus preferences:', error);
      
      const errorResponse: CognitiveLoadError = {
        error: 'Failed to retrieve focus preferences',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      res.status(500).json(errorResponse);
    }
  }

  /**
   * Update user focus preferences
   * PUT /api/cognitive-load/focus-preferences
   */
  async updateFocusPreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        console.error('No user ID found in focus preferences update request');
        res.status(401).json({ 
          error: 'Unauthorized - no user ID',
          details: 'User authentication required to update focus preferences'
        });
        return;
      }

      const updateData = req.body;
      
      // Validate focus duration
      if (updateData.preferredFocusDuration !== undefined) {
        if (typeof updateData.preferredFocusDuration !== 'number' || 
            updateData.preferredFocusDuration < 5 || 
            updateData.preferredFocusDuration > 120) {
          res.status(400).json({
            error: 'Invalid preferredFocusDuration',
            details: 'Preferred focus duration must be a number between 5 and 120 minutes'
          });
          return;
        }
      }

      // Validate break duration
      if (updateData.preferredBreakDuration !== undefined) {
        if (typeof updateData.preferredBreakDuration !== 'number' || 
            updateData.preferredBreakDuration < 1 || 
            updateData.preferredBreakDuration > 60) {
          res.status(400).json({
            error: 'Invalid preferredBreakDuration',
            details: 'Preferred break duration must be a number between 1 and 60 minutes'
          });
          return;
        }
      }

      console.log(`Updating focus preferences for user ${userId}`);
      const updatedPreferences = await this.cognitiveLoadService.updateUserFocusPreferences(userId, updateData);
      
      res.json(updatedPreferences);
    } catch (error) {
      console.error('Error updating focus preferences:', error);
      
      const errorResponse: CognitiveLoadError = {
        error: 'Failed to update focus preferences',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      res.status(500).json(errorResponse);
    }
  }

  /**
   * Get user productivity patterns
   * GET /api/cognitive-load/productivity-patterns
   */
  async getProductivityPatterns(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        console.error('No user ID found in productivity patterns request');
        res.status(401).json({ 
          error: 'Unauthorized - no user ID',
          details: 'User authentication required to access productivity patterns'
        });
        return;
      }

      console.log(`Getting productivity patterns for user ${userId}`);
      const patterns = await this.cognitiveLoadService.getUserProductivityPatterns(userId);
      
      res.json(patterns);
    } catch (error) {
      console.error('Error getting productivity patterns:', error);
      
      const errorResponse: CognitiveLoadError = {
        error: 'Failed to retrieve productivity patterns',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      res.status(500).json(errorResponse);
    }
  }

  /**
   * Get team cognitive load summary (aggregated, anonymized)
   * GET /api/cognitive-load/team/:teamId/summary
   * SENSITIVE data - only aggregated, anonymized metrics
   */
  async getTeamCognitiveLoadSummary(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.user as any)?.userId || (req.user as any)?.id;
      
      if (!userId) {
        res.status(401).json({ 
          error: 'Unauthorized',
          message: 'User authentication required'
        });
        return;
      }

      const teamIdParam = req.params.teamId;
      if (!teamIdParam) {
        res.status(400).json({ 
          error: 'Bad Request',
          message: 'teamId is required'
        });
        return;
      }
      const teamId = parseInt(teamIdParam);
      if (isNaN(teamId)) {
        res.status(400).json({ 
          error: 'Bad Request',
          message: 'Invalid team ID'
        });
        return;
      }

      // Check permission - only TEAM_MANAGER and ADMIN can view team cognitive load
      const permission = await permissionService.canViewTeamAnalytics(
        userId,
        teamId,
        "cognitive_load.meter"
      );

      if (!permission.allowed) {
        res.status(403).json({
          error: "Forbidden",
          message: permission.reason || "You don't have permission to view team cognitive load data",
          requiredRole: "TEAM_MANAGER or ADMIN",
          yourRole: permission.role || "MEMBER",
          code: "TEAM_COGNITIVE_LOAD_ACCESS_DENIED"
        });
        return;
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

      // Get aggregated, anonymized data
      const summary = await aggregationService.aggregateTeamCognitiveLoad(teamId);
      
      // Build response with role and permissions metadata
      const response: any = {
        ...summary,
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
          canViewIndividualMemberData: false, // Never allowed for cognitive load
          canManageTeamMembers: permission.role === "ADMIN"
        },
        // Access level description
        accessLevel: permission.role === "ADMIN" 
          ? "ADMIN - Full team management access" 
          : "TEAM_MANAGER - Team analytics access only"
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error getting team cognitive load summary:', error);
      
      res.status(500).json({
        error: 'Failed to retrieve team cognitive load summary',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  }

  /**
   * Health check for cognitive load service
   * GET /api/cognitive-load/health
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      res.json({
        status: 'healthy',
        service: 'cognitive-load',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    } catch (error) {
      console.error('Error in cognitive load health check:', error);
      res.status(500).json({
        status: 'unhealthy',
        service: 'cognitive-load',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get cognitive load summary across all teams user manages (aggregated, anonymized)
   * GET /api/cognitive-load/my-teams/summary
   * SENSITIVE data - only aggregated, anonymized metrics across all teams
   */
  async getMyTeamsCognitiveLoadSummary(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.user as any)?.userId || (req.user as any)?.id;
      
      if (!userId) {
        res.status(401).json({ 
          error: 'Unauthorized',
          message: 'User authentication required'
        });
        return;
      }

      // Get aggregated, anonymized data across all teams
      const summary = await aggregationService.aggregateMyTeamsCognitiveLoad(userId);

      // Determine highest role across all teams
      const userTeams = await permissionService.getUserTeams(userId);
      const teamsWithAccess = userTeams.filter(t => t.role === "TEAM_MANAGER" || t.role === "ADMIN");
      const hasAdminRole = teamsWithAccess.some(t => t.role === "ADMIN");
      const highestRole = hasAdminRole ? "ADMIN" : "TEAM_MANAGER";
      
      // Build response with role and permissions metadata
      const response: any = {
        ...summary,
        // Explicit role information (highest role across all teams)
        userRole: highestRole,
        // Permissions object
        permissions: {
          canViewTeamAnalytics: true,
          canViewTeamMembers: hasAdminRole,
          canViewIndividualMemberData: false,
          canManageTeamMembers: hasAdminRole
        },
        // Access level description
        accessLevel: hasAdminRole 
          ? "ADMIN - Full team management access in some teams" 
          : "TEAM_MANAGER - Team analytics access only"
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error getting my teams cognitive load summary:', error);
      
      res.status(500).json({
        error: 'Failed to retrieve teams cognitive load summary',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  }

  /**
   * Get workspace cognitive load summary (aggregated, anonymized)
   * GET /api/cognitive-load/workspace/:workspaceId/summary
   * For workspace managers - combines all teams in the workspace
   */
  async getWorkspaceCognitiveLoadSummary(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.user as any)?.userId || (req.user as any)?.id;
      
      if (!userId) {
        res.status(401).json({ 
          error: 'Unauthorized',
          message: 'User authentication required'
        });
        return;
      }

      const workspaceIdParam = req.params.workspaceId;
      if (!workspaceIdParam) {
        res.status(400).json({ 
          error: 'Bad Request',
          message: 'workspaceId is required'
        });
        return;
      }

      const workspaceId = parseInt(workspaceIdParam);
      if (isNaN(workspaceId)) {
        res.status(400).json({ 
          error: 'Bad Request',
          message: 'Invalid workspace ID'
        });
        return;
      }

      // Verify user has access to workspace (owner or workspace manager)
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId }
      });

      if (!workspace) {
        res.status(404).json({ error: "Workspace not found" });
        return;
      }

      const isOwner = workspace.ownerId === userId;
      const isWorkspaceManager = await prisma.workspaceMembership.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId }
        }
      });

      if (!isOwner && !isWorkspaceManager) {
        res.status(403).json({
          error: "Forbidden",
          message: "Only workspace owner/admin or workspace manager can view workspace cognitive load data",
          requiredRole: "WORKSPACE_MANAGER or ADMIN"
        });
        return;
      }

      // Get aggregated, anonymized data for all teams in workspace
      const summary = await aggregationService.aggregateWorkspaceCognitiveLoad(workspaceId);
      
      // Build response with role and permissions metadata
      const response: any = {
        ...summary,
        workspace: {
          id: workspace.id,
          name: workspace.name,
          ownerId: workspace.ownerId
        },
        userRole: isOwner ? "ADMIN" : "WORKSPACE_MANAGER",
        permissions: {
          canViewWorkspaceAnalytics: true,
          canViewTeamAnalytics: true,
          canViewTeamMembers: true,
          canViewIndividualMemberData: false,
          canManageWorkspace: true
        },
        accessLevel: isOwner 
          ? "ADMIN - Full workspace access" 
          : "WORKSPACE_MANAGER - Workspace analytics access"
      };

      res.json(response);
    } catch (error) {
      console.error('Error getting workspace cognitive load summary:', error);
      
      const errorResponse: CognitiveLoadError = {
        error: 'Failed to retrieve workspace cognitive load summary',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      res.status(500).json(errorResponse);
    }
  }

  /**
   * Get all workspaces cognitive load summary (aggregated, anonymized)
   * GET /api/cognitive-load/all-workspaces/summary
   * For admin/owner - combines all workspaces they own
   */
  async getAllWorkspacesCognitiveLoadSummary(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.user as any)?.userId || (req.user as any)?.id;
      
      if (!userId) {
        res.status(401).json({ 
          error: 'Unauthorized',
          message: 'User authentication required'
        });
        return;
      }

      // Get aggregated, anonymized data across all workspaces
      const summary = await aggregationService.aggregateAllWorkspacesCognitiveLoad(userId);
      
      // Build response with role and permissions metadata
      const response: any = {
        ...summary,
        userRole: "ADMIN",
        permissions: {
          canViewWorkspaceAnalytics: true,
          canViewCrossWorkspaceAnalytics: true,
          canViewTeamAnalytics: true,
          canViewTeamMembers: true,
          canViewIndividualMemberData: false,
          canManageWorkspace: true
        },
        accessLevel: "ADMIN - Cross-workspace analytics dashboard"
      };

      res.json(response);
    } catch (error) {
      console.error('Error getting all workspaces cognitive load summary:', error);
      
      const errorResponse: CognitiveLoadError = {
        error: 'Failed to retrieve all workspaces cognitive load summary',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      res.status(500).json(errorResponse);
    }
  }
}
