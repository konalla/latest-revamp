import { Router } from "express";
import * as taskController from "../controllers/task.controller";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

// All task routes are protected and require authentication
router.use(authenticateToken);

// GET /api/tasks - Get all tasks for logged-in user
router.get("/", taskController.getAllTasks);

// GET /api/tasks/stats - Get task statistics for logged-in user
router.get("/stats", taskController.getTaskStats);

// GET /api/tasks/project/:projectId - Get all tasks for a specific project
router.get("/project/:projectId", taskController.getTasksByProject);

// GET /api/tasks/objective/:objectiveId - Get all tasks for a specific objective
router.get("/objective/:objectiveId", taskController.getTasksByObjective);

// GET /api/tasks/okr/:okrId - Get all tasks for a specific OKR
router.get("/okr/:okrId", taskController.getTasksByOkr);

// GET /api/tasks/:id - Get specific task by ID (only if it belongs to logged-in user)
router.get("/:id", taskController.getTask);

// POST /api/tasks - Create a new task for logged-in user
router.post("/", taskController.createTask);

// PUT /api/tasks/:id - Update task by ID (only if it belongs to logged-in user)
router.put("/:id", taskController.updateTask);

// PUT /api/tasks/:id/toggle - Toggle task completion status
router.put("/:id/toggle", taskController.toggleTaskCompletion);

// PUT /api/tasks/positions - Update multiple task positions (for drag-and-drop reordering)
router.put("/positions", taskController.updateTaskPositions);

// DELETE /api/tasks/:id - Delete task by ID (only if it belongs to logged-in user)
router.delete("/:id", taskController.deleteTask);

export default router;
