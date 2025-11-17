import { Router } from "express";
import * as objectiveController from "../controllers/objective.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requireWriteAccess } from "../middleware/subscription.middleware.js";

const router = Router();

// All objective routes are protected and require authentication
router.use(authenticateToken);

// GET /api/objectives - Get all objectives for logged-in user (across all projects)
router.get("/", objectiveController.getAllObjectives);

// GET /api/objectives/stats - Get objective statistics for logged-in user
router.get("/stats", objectiveController.getObjectiveStats);

// GET /api/objectives/project/:projectId - Get all objectives for a specific project
router.get("/project/:projectId", objectiveController.getObjectivesByProject);

// GET /api/objectives/:id - Get specific objective by ID (only if it belongs to logged-in user)
router.get("/:id", objectiveController.getObjective);

// GET /api/objectives/:id/tasks - Get all tasks for a specific objective
router.get("/:id/tasks", objectiveController.getObjectiveTasks);

// GET /api/objectives/:id/okrs - Get all OKRs for a specific objective
router.get("/:id/okrs", objectiveController.getObjectiveOkrs);

// POST /api/objectives - Create a new objective for logged-in user (requires write access)
router.post("/", requireWriteAccess, objectiveController.createObjective);

// PUT /api/objectives/:id - Update objective by ID (only if it belongs to logged-in user) (requires write access)
router.put("/:id", requireWriteAccess, objectiveController.updateObjective);

// PUT /api/objectives/positions - Update multiple objective positions (for drag-and-drop reordering) (requires write access)
router.put("/positions", requireWriteAccess, objectiveController.updateObjectivePositions);

// DELETE /api/objectives/:id - Delete objective by ID (only if it belongs to logged-in user) (requires write access)
router.delete("/:id", requireWriteAccess, objectiveController.deleteObjective);

export default router;
