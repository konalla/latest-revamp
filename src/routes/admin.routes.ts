import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { adminController } from "../controllers/admin.controller.js";
import { adminAuthController } from "../controllers/admin-auth.controller.js";

const router = Router();

// Admin authentication routes (no auth required)
router.post("/auth/login", adminAuthController.login.bind(adminAuthController));

// All other admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

// Dashboard
router.get("/dashboard/stats", adminController.getDashboardStats.bind(adminController));

// Users
router.get("/users", adminController.getAllUsers.bind(adminController));
router.get("/users/:id", adminController.getUserDetails.bind(adminController));

// Projects
router.get("/projects", adminController.getAllProjects.bind(adminController));
router.get("/projects/:id", adminController.getProjectDetails.bind(adminController));

// Tasks
router.get("/tasks", adminController.getAllTasks.bind(adminController));
router.get("/tasks/:id", adminController.getTaskDetails.bind(adminController));

// OKRs
router.get("/okrs", adminController.getAllOkrs.bind(adminController));
router.get("/okrs/:id", adminController.getOkrDetails.bind(adminController));

// Objectives
router.get("/objectives", adminController.getAllObjectives.bind(adminController));
router.get("/objectives/:id", adminController.getObjectiveDetails.bind(adminController));

// Workspaces
router.get("/workspaces", adminController.getAllWorkspaces.bind(adminController));
router.get("/workspaces/:id", adminController.getWorkspaceDetails.bind(adminController));

// Teams
router.get("/teams", adminController.getAllTeams.bind(adminController));
router.get("/teams/:id", adminController.getTeamDetails.bind(adminController));

// Subscriptions
router.get("/subscriptions", adminController.getAllSubscriptions.bind(adminController));
router.get("/subscriptions/:id", adminController.getSubscriptionDetails.bind(adminController));

export default router;



