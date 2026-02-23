import { Router } from "express";
import { 
  getCurrentAiFocusSession, 
  getFocusPlan,
  createFocusSession,
  updateSessionStatus,
  endFocusSession,
  pauseSession,
  resumeSession,
  getFocusPatterns,
  getFocusSessionsWithInsights,
  beaconEndSession
} from "../controllers/focus.controller.js";
import { authenticateToken, optionalAuth } from "../middleware/auth.middleware.js";
import { requireWriteAccess } from "../middleware/subscription.middleware.js";

const router = Router();

// GET /api/ai-focus/session - requires auth
router.get("/ai-focus/session", authenticateToken, getCurrentAiFocusSession);

// POST /api/ai-focus/session - Create Focus Session (requires write access)
router.post("/ai-focus/session", authenticateToken, requireWriteAccess, createFocusSession);

// PUT /api/ai-focus/session/{id} - Update Session Status (requires write access)
router.put("/ai-focus/session/:id", authenticateToken, requireWriteAccess, updateSessionStatus);

// POST /api/ai-focus/session/{id}/end - End Focus Session (requires write access)
router.post("/ai-focus/session/:id/end", authenticateToken, requireWriteAccess, endFocusSession);

// POST /api/ai-focus/session/{id}/pause - Pause Session (requires write access)
router.post("/ai-focus/session/:id/pause", authenticateToken, requireWriteAccess, pauseSession);

// POST /api/ai-focus/session/{id}/resume - Resume Session (requires write access)
router.post("/ai-focus/session/:id/resume", authenticateToken, requireWriteAccess, resumeSession);

// GET /api/focus/plan - optional auth with bypass header support
router.get("/focus/plan", optionalAuth, getFocusPlan);

// GET /api/focus/patterns - optional auth with bypass header support
router.get("/focus/patterns", optionalAuth, getFocusPatterns);

// GET /api/focus-sessions/with-insights - Get all focus sessions with insights (requires auth)
router.get("/focus-sessions/with-insights", authenticateToken, getFocusSessionsWithInsights);

// POST /api/ai-focus/session/beacon-end - Lightweight endpoint for sendBeacon on browser close
// No auth middleware -- token is verified from request body
router.post("/ai-focus/session/beacon-end", beaconEndSession);

export default router;


