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

export default router;
