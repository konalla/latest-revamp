import { Router } from "express";
import * as taskController from "../controllers/task.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requireTaskCreationAccess, requireWriteAccess } from "../middleware/subscription.middleware.js";

const router = Router();

// All task routes are protected and require authentication
router.use(authenticateToken);

// GET /api/tasks - Get all tasks for logged-in user (paginated)
router.get("/", taskController.getAllTasks);

// GET /api/tasks/all - Get all tasks without pagination
router.get("/all", taskController.getAllTasksWithoutPagination);

// GET /api/tasks/stats - Get task statistics for logged-in user
router.get("/stats", taskController.getTaskStats);

// GET /api/tasks/archived - Get archived (completed) tasks for logged-in user
router.get("/archived", taskController.getArchivedTasks);

// GET /api/tasks/project/:projectId - Get all tasks for a specific project
router.get("/project/:projectId", taskController.getTasksByProject);

// GET /api/tasks/objective/:objectiveId - Get all tasks for a specific objective
router.get("/objective/:objectiveId", taskController.getTasksByObjective);

// GET /api/tasks/okr/:okrId - Get all tasks for a specific OKR
router.get("/okr/:okrId", taskController.getTasksByOkr);

// GET /api/tasks/:id - Get specific task by ID (only if it belongs to logged-in user)
router.get("/:id", taskController.getTask);

// POST /api/tasks - Create a new task for logged-in user (requires task creation access)
router.post("/", requireTaskCreationAccess, taskController.createTask);

// POST /api/tasks/bulk - Create multiple tasks in bulk with AI classification (requires task creation access)
router.post("/bulk", requireTaskCreationAccess, taskController.createBulkTasks);

// POST /api/tasks/batch-update - Update multiple tasks in batch (requires write access)
router.post("/batch-update", requireWriteAccess, taskController.batchUpdateTasks);

// PATCH /api/tasks/:id - Restore task (set completed: false) (requires write access)
router.patch("/:id", requireWriteAccess, taskController.restoreTask);

// PUT /api/tasks/:id - Update task by ID (only if it belongs to logged-in user) (requires write access)
router.put("/:id", requireWriteAccess, taskController.updateTask);

// PUT /api/tasks/:id/toggle - Toggle task completion status (requires write access)
router.put("/:id/toggle", requireWriteAccess, taskController.toggleTaskCompletion);

// PUT /api/tasks/positions - Update multiple task positions (for drag-and-drop reordering) (requires write access)
router.put("/positions", requireWriteAccess, taskController.updateTaskPositions);

// DELETE /api/tasks/:id - Delete task by ID (only if it belongs to logged-in user) (requires write access)
router.delete("/:id", requireWriteAccess, taskController.deleteTask);

export default router;
