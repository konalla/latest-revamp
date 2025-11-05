import { Router } from "express";
import * as okrController from "../controllers/okr.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requireWriteAccess } from "../middleware/subscription.middleware.js";

const router = Router();

// All OKR routes are protected and require authentication
router.use(authenticateToken);

// GET /api/okrs - Get all OKRs for logged-in user (across all objectives)
router.get("/", okrController.getAllOkrs);

// GET /api/okrs/stats - Get OKR statistics for logged-in user
router.get("/stats", okrController.getOkrStats);

// GET /api/okrs/objective/:objectiveId - Get all OKRs for a specific objective
router.get("/objective/:objectiveId", okrController.getOkrsByObjective);

// GET /api/okrs/:id - Get specific OKR by ID (only if it belongs to logged-in user)
router.get("/:id", okrController.getOkr);

// POST /api/okrs - Create a new OKR for logged-in user (requires write access)
router.post("/", requireWriteAccess, okrController.createOkr);

// PUT /api/okrs/:id - Update OKR by ID (only if it belongs to logged-in user) (requires write access)
router.put("/:id", requireWriteAccess, okrController.updateOkr);

// PUT /api/okrs/:id/progress - Update OKR progress (currentValue, confidence score, and progress history) (requires write access)
router.put("/:id/progress", requireWriteAccess, okrController.updateOkrProgress);

// PUT /api/okrs/positions - Update multiple OKR positions (for drag-and-drop reordering) (requires write access)
router.put("/positions", requireWriteAccess, okrController.updateOkrPositions);

// DELETE /api/okrs/:id - Delete OKR by ID (only if it belongs to logged-in user) (requires write access)
router.delete("/:id", requireWriteAccess, okrController.deleteOkr);

export default router;
