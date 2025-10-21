import { Router } from "express";
import { 
  getCurrentAiFocusSession, 
  getFocusPlan,
  createFocusSession,
  updateSessionStatus,
  endFocusSession,
  pauseSession,
  resumeSession,
  getFocusPatterns
} from "../controllers/focus.controller.js";
import { authenticateToken, optionalAuth } from "../middleware/auth.middleware.js";

const router = Router();

// GET /api/ai-focus/session - requires auth
router.get("/ai-focus/session", authenticateToken, getCurrentAiFocusSession);

// POST /api/ai-focus/session - Create Focus Session
router.post("/ai-focus/session", authenticateToken, createFocusSession);

// PUT /api/ai-focus/session/{id} - Update Session Status
router.put("/ai-focus/session/:id", authenticateToken, updateSessionStatus);

// POST /api/ai-focus/session/{id}/end - End Focus Session
router.post("/ai-focus/session/:id/end", authenticateToken, endFocusSession);

// POST /api/ai-focus/session/{id}/pause - Pause Session
router.post("/ai-focus/session/:id/pause", authenticateToken, pauseSession);

// POST /api/ai-focus/session/{id}/resume - Resume Session
router.post("/ai-focus/session/:id/resume", authenticateToken, resumeSession);

// GET /api/focus/plan - optional auth with bypass header support
router.get("/focus/plan", optionalAuth, getFocusPlan);

// GET /api/focus/patterns - optional auth with bypass header support
router.get("/focus/patterns", optionalAuth, getFocusPatterns);

export default router;


