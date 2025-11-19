/**
 * Permission Middleware
 * 
 * Middleware functions to check user permissions before allowing access
 */

import type { Request, Response, NextFunction } from "express";
import permissionService from "../services/permission.service.js";
import dataClassificationService from "../services/data-classification.service.js";

/**
 * Check if user has required role in a team
 */
export const requireTeamRole = (
  teamIdParam: string = "teamId",
  ...allowedRoles: Array<"MEMBER" | "TEAM_MANAGER" | "ADMIN">
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req.user as any)?.userId || (req.user as any)?.id;
      
      if (!userId) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User authentication required"
        });
      }

      const teamId = parseInt(req.params[teamIdParam] || req.body[teamIdParam] || req.query[teamIdParam]);
      
      if (!teamId || isNaN(teamId)) {
        return res.status(400).json({
          error: "Bad Request",
          message: "Team ID is required and must be a valid number"
        });
      }

      const role = await permissionService.getTeamRole(userId, teamId);

      if (!role) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You are not a member of this team"
        });
      }

      if (!allowedRoles.includes(role)) {
        return res.status(403).json({
          error: "Forbidden",
          message: `You need one of these roles: ${allowedRoles.join(", ")}. Your role: ${role}`,
          requiredRoles: allowedRoles,
          yourRole: role
        });
      }

      // Attach role to request for use in controllers
      (req as any).teamRole = role;
      (req as any).teamId = teamId;

      next();
    } catch (error) {
      console.error("Error in requireTeamRole middleware:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to check team permissions"
      });
    }
  };
};

/**
 * Check if user can access a team (any role)
 */
export const requireTeamAccess = (teamIdParam: string = "teamId") => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req.user as any)?.userId || (req.user as any)?.id;
      
      if (!userId) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User authentication required"
        });
      }

      const teamId = parseInt(req.params[teamIdParam] || req.body[teamIdParam] || req.query[teamIdParam]);
      
      if (!teamId || isNaN(teamId)) {
        return res.status(400).json({
          error: "Bad Request",
          message: "Team ID is required and must be a valid number"
        });
      }

      // Check if user has team access (member, team manager, workspace manager, or workspace owner)
      const hasAccess = await permissionService.hasTeamAccess(userId, teamId);

      if (!hasAccess) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You don't have access to this team"
        });
      }

      const role = await permissionService.getTeamRole(userId, teamId);
      (req as any).teamRole = role;
      (req as any).teamId = teamId;

      next();
    } catch (error) {
      console.error("Error in requireTeamAccess middleware:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to check team access"
      });
    }
  };
};

/**
 * Check if user can view team analytics
 */
export const requireTeamAnalyticsAccess = (
  teamIdParam: string = "teamId",
  dataType: string
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req.user as any)?.userId || (req.user as any)?.id;
      
      if (!userId) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User authentication required"
        });
      }

      const teamId = parseInt(req.params[teamIdParam] || req.body[teamIdParam] || req.query[teamIdParam]);
      
      if (!teamId || isNaN(teamId)) {
        return res.status(400).json({
          error: "Bad Request",
          message: "Team ID is required and must be a valid number"
        });
      }

      const permission = await permissionService.canViewTeamAnalytics(userId, teamId, dataType);

      if (!permission.allowed) {
        return res.status(403).json({
          error: "Forbidden",
          message: permission.reason || "You don't have permission to view team analytics",
          requiredRole: "TEAM_MANAGER or ADMIN",
          yourRole: permission.role || "MEMBER"
        });
      }

      (req as any).teamRole = permission.role;
      (req as any).teamId = teamId;

      next();
    } catch (error) {
      console.error("Error in requireTeamAnalyticsAccess middleware:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to check analytics permissions"
      });
    }
  };
};

/**
 * Check if user can view specific user data
 */
export const requireUserDataAccess = (
  targetUserIdParam: string = "userId",
  dataType: string,
  teamIdParam?: string
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requesterId = (req.user as any)?.userId || (req.user as any)?.id;
      
      if (!requesterId) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User authentication required"
        });
      }

      const targetUserId = parseInt(
        req.params[targetUserIdParam] || 
        req.body[targetUserIdParam] || 
        req.query[targetUserIdParam]
      );
      
      if (!targetUserId || isNaN(targetUserId)) {
        return res.status(400).json({
          error: "Bad Request",
          message: "Target user ID is required and must be a valid number"
        });
      }

      const teamId = teamIdParam 
        ? parseInt(req.params[teamIdParam] || req.body[teamIdParam] || req.query[teamIdParam])
        : undefined;

      const permission = await permissionService.canViewUserData(
        requesterId,
        targetUserId,
        dataType,
        teamId
      );

      if (!permission.allowed) {
        return res.status(403).json({
          error: "Forbidden",
          message: permission.reason || "You don't have permission to view this data"
        });
      }

      next();
    } catch (error) {
      console.error("Error in requireUserDataAccess middleware:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to check data access permissions"
      });
    }
  };
};

