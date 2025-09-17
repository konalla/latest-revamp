import { Router } from "express";
import * as objectiveController from "../controllers/objective.controller";
import { authenticateToken } from "../middleware/auth.middleware";

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

// POST /api/objectives - Create a new objective for logged-in user
router.post("/", objectiveController.createObjective);

// PUT /api/objectives/:id - Update objective by ID (only if it belongs to logged-in user)
router.put("/:id", objectiveController.updateObjective);

// PUT /api/objectives/positions - Update multiple objective positions (for drag-and-drop reordering)
router.put("/positions", objectiveController.updateObjectivePositions);

// DELETE /api/objectives/:id - Delete objective by ID (only if it belongs to logged-in user)
router.delete("/:id", objectiveController.deleteObjective);

export default router;
