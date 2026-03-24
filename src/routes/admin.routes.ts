import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { adminController } from "../controllers/admin.controller.js";
import { adminAuthController } from "../controllers/admin-auth.controller.js";
import {
  uploadRedeemableItemImage,
  handleUploadError,
} from "../middleware/upload.middleware.js";

const router = Router();

// Strict rate limiter: 5 attempts per 15 minutes per IP
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many admin login attempts, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin authentication routes (no auth required, but rate limited)
router.post("/auth/login", adminLoginLimiter, adminAuthController.login.bind(adminAuthController));

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

// Badge management
router.post("/users/:id/assign-origin-badge", adminController.assignOriginBadge.bind(adminController));

// Redeemable Items
router.get("/redeemable-items", adminController.getAllRedeemableItems.bind(adminController));
router.get("/redeemable-items/:id", adminController.getRedeemableItemById.bind(adminController));
router.post(
  "/redeemable-items",
  uploadRedeemableItemImage,
  handleUploadError,
  adminController.createRedeemableItem.bind(adminController)
);
router.put(
  "/redeemable-items/:id",
  uploadRedeemableItemImage,
  handleUploadError,
  adminController.updateRedeemableItem.bind(adminController)
);
router.delete("/redeemable-items/:id", adminController.deleteRedeemableItem.bind(adminController));

// Redemptions
router.get("/redemptions", adminController.getAllRedemptions.bind(adminController));
router.get("/redemptions/:id", adminController.getRedemptionById.bind(adminController));
router.patch("/redemptions/:id/status", adminController.updateRedemptionStatus.bind(adminController));

export default router;



