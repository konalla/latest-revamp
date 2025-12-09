import { Router } from "express";
import { CognitiveLoadController } from "../controllers/cognitive-load.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();
const cognitiveLoadController = new CognitiveLoadController();

// Custom middleware to conditionally apply authentication for cognitive load routes
function conditionalAuth(req: any, res: any, next: any) {
  // Check for environment variables that bypass authentication
  if (process.env.SKIP_AUTH_FOR_DASHBOARD === 'true' || process.env.ENABLE_PUBLIC_DASHBOARD === 'true') {
    console.log('Bypassing authentication for cognitive load routes due to environment flags');
    
    // If no user is authenticated but we need user ID, set a default
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      // Create a minimal user object for unauthenticated requests
      req.user = { id: 1 }; // Use ID 1 as default user
      console.log('Using default user ID for unauthenticated dashboard access');
    }
    
    return next();
  }
  
  // Otherwise apply the normal authentication
  return authenticateToken(req, res, next);
}

// Health check endpoint (no auth required)
router.get('/health', cognitiveLoadController.healthCheck.bind(cognitiveLoadController));

// Cognitive Load Meter endpoints
router.get('/meter', conditionalAuth, cognitiveLoadController.getCognitiveLoadMeter.bind(cognitiveLoadController));
router.put('/meter', conditionalAuth, cognitiveLoadController.updateCognitiveLoadMeter.bind(cognitiveLoadController));

// Pre-session coaching endpoint
router.get('/pre-session-coaching', conditionalAuth, cognitiveLoadController.getPreSessionCoaching.bind(cognitiveLoadController));

// Workload Forecast endpoint
router.get('/forecast', conditionalAuth, cognitiveLoadController.generateWorkloadForecast.bind(cognitiveLoadController));

// Burnout Risk Assessment endpoint
router.get('/burnout-risk', conditionalAuth, cognitiveLoadController.assessBurnoutRisk.bind(cognitiveLoadController));

// Adaptive Recommendations endpoint
router.get('/recommendations', conditionalAuth, cognitiveLoadController.getAdaptiveRecommendations.bind(cognitiveLoadController));

// Focus Preferences endpoints
router.get('/focus-preferences', conditionalAuth, cognitiveLoadController.getFocusPreferences.bind(cognitiveLoadController));
router.put('/focus-preferences', conditionalAuth, cognitiveLoadController.updateFocusPreferences.bind(cognitiveLoadController));

// Productivity Patterns endpoint
router.get('/productivity-patterns', conditionalAuth, cognitiveLoadController.getProductivityPatterns.bind(cognitiveLoadController));

// Team Cognitive Load Summary endpoint (aggregated, anonymized)
router.get('/team/:teamId/summary', conditionalAuth, cognitiveLoadController.getTeamCognitiveLoadSummary.bind(cognitiveLoadController));

// My Teams Cognitive Load Summary endpoint (aggregated across all teams user manages)
router.get('/my-teams/summary', conditionalAuth, cognitiveLoadController.getMyTeamsCognitiveLoadSummary.bind(cognitiveLoadController));

// Workspace Cognitive Load Summary endpoint (aggregated across all teams in workspace)
router.get('/workspace/:workspaceId/summary', conditionalAuth, cognitiveLoadController.getWorkspaceCognitiveLoadSummary.bind(cognitiveLoadController));

// All Workspaces Cognitive Load Summary endpoint (aggregated across all workspaces - admin/owner only)
router.get('/all-workspaces/summary', conditionalAuth, cognitiveLoadController.getAllWorkspacesCognitiveLoadSummary.bind(cognitiveLoadController));

export default router;
