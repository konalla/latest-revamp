import { Router } from "express";
import analyticsController from "../controllers/analytics.controller.js";
import { optionalAuth } from "../middleware/auth.middleware.js";

const router = Router();

// Conditional authentication middleware
function conditionalAuth(req: any, res: any, next: any) {
  // Allow skipping authentication for testing
  const skipAuth = req.headers['x-skip-auth'] === 'true' || 
                  req.headers['x-bypass-auth'] === 'true';
  
  if (skipAuth) {
    console.log("Authentication bypassed for analytics endpoint");
    req.user = { userId: 1 }; // Use admin ID for testing
    return next();
  }
  
  // Check if user is authenticated
  if (!req.user || !req.user.userId) {
    console.log("No user ID found and auth not skipped");
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  next();
}

// GET /api/analytics/productivity - Personal productivity analytics
router.get("/productivity", optionalAuth, conditionalAuth, analyticsController.getProductivityAnalytics.bind(analyticsController));

// GET /api/analytics/okr - OKR analytics
router.get("/okr", optionalAuth, conditionalAuth, analyticsController.getOkrAnalytics.bind(analyticsController));

// GET /api/analytics/focus - Focus analytics
router.get("/focus", optionalAuth, conditionalAuth, analyticsController.getFocusAnalytics.bind(analyticsController));

// GET /api/analytics/trends - Trends analytics
router.get("/trends", optionalAuth, conditionalAuth, analyticsController.getTrendsAnalytics.bind(analyticsController));

// GET /api/analytics/productivity/team/:teamId - Team productivity analytics (aggregated) - Returns array of all teams where user is ADMIN or MANAGER
// Note: teamId parameter is kept for backward compatibility but is ignored - returns all teams
router.get("/productivity/team/:teamId", optionalAuth, conditionalAuth, analyticsController.getTeamProductivityAnalytics.bind(analyticsController));

// GET /api/analytics/focus/team/:teamId - Team focus analytics (aggregated)
router.get("/focus/team/:teamId", optionalAuth, conditionalAuth, analyticsController.getTeamFocusAnalytics.bind(analyticsController));

// GET /api/analytics/productivity/my-teams - Aggregate productivity across all teams user manages
router.get("/productivity/my-teams", optionalAuth, conditionalAuth, analyticsController.getMyTeamsProductivityAnalytics.bind(analyticsController));

// GET /api/analytics/productivity/workspace/:workspaceId - Workspace productivity analytics (all teams combined)
router.get("/productivity/workspace/:workspaceId", optionalAuth, conditionalAuth, analyticsController.getWorkspaceProductivityAnalytics.bind(analyticsController));

// GET /api/analytics/productivity/all-workspaces - Cross-workspace productivity analytics (admin/owner only)
router.get("/productivity/all-workspaces", optionalAuth, conditionalAuth, analyticsController.getAllWorkspacesProductivityAnalytics.bind(analyticsController));

// GET /api/analytics/focus/workspace/:workspaceId - Workspace focus analytics (all teams combined)
router.get("/focus/workspace/:workspaceId", optionalAuth, conditionalAuth, analyticsController.getWorkspaceFocusAnalytics.bind(analyticsController));

// GET /api/analytics/focus/all-workspaces - Cross-workspace focus analytics (admin/owner only)
router.get("/focus/all-workspaces", optionalAuth, conditionalAuth, analyticsController.getAllWorkspacesFocusAnalytics.bind(analyticsController));

export default router;
