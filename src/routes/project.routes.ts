import { Router } from "express";
import * as projectController from "../controllers/project.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

// All project routes are protected and require authentication
router.use(authenticateToken);

// GET /api/projects - Get all projects for logged-in user (with pagination and filters)
router.get("/", projectController.getProjects);

// GET /api/projects/stats - Get project statistics for logged-in user
router.get("/stats", projectController.getProjectStats);

// GET /api/projects/:id - Get specific project by ID (only if it belongs to logged-in user)
router.get("/:id", projectController.getProject);

// POST /api/projects - Create a new project for logged-in user
router.post("/", projectController.createProject);

// PUT /api/projects/:id - Update project by ID (only if it belongs to logged-in user)
router.put("/:id", projectController.updateProject);

// DELETE /api/projects/:id - Delete project by ID (only if it belongs to logged-in user)
router.delete("/:id", projectController.deleteProject);

// GET /api/projects/:id/tasks - Get all tasks for a specific project
router.get("/:id/tasks", projectController.getProjectTasks);

// GET /api/projects/:id/objectives - Get all objectives for a specific project
router.get("/:id/objectives", projectController.getProjectObjectives);

// GET /api/projects/:id/key-results - Get all OKRs (key results) for a specific project
router.get("/:id/key-results", projectController.getProjectKeyResults);

export default router;
