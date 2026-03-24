import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import * as userController from "../controllers/user.controller.js";
import * as userStatusController from "../controllers/user-status.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { uploadProfilePhoto, handleUploadError } from "../middleware/upload.middleware.js";

const router = Router();

// Ownership check: user can only modify their own record, admins can modify any
const requireOwnerOrAdmin = (req: Request, res: Response, next: NextFunction) => {
  const requestedId = parseInt(req.params.id);
  const callerId = req.user?.id;
  const callerRole = (req.user as any)?.role;
  if (callerRole === "ADMIN" || callerId === requestedId) return next();
  return res.status(403).json({ message: "Forbidden" });
};

// Admin-only: list all users
router.get("/", authenticateToken, requireAdmin, userController.getUsers);

// Admin-only: create user directly (use /api/auth/register for self-registration)
router.post("/", authenticateToken, requireAdmin, userController.createUser);

// Protected routes
router.get("/me", authenticateToken, userController.getCurrentUser);
router.post("/profile/photo", authenticateToken, uploadProfilePhoto, handleUploadError, userController.uploadProfilePhoto);

// User status routes
router.get("/me/status", authenticateToken, userStatusController.getCurrentUserStatus);
router.get("/active", authenticateToken, userStatusController.getActiveUsers);

// /:id routes must come after /me to avoid conflicts
router.get("/:id", authenticateToken, userController.getUser);
router.get("/:userId/status", authenticateToken, userStatusController.getUserStatus);
router.put("/:id", authenticateToken, requireOwnerOrAdmin, userController.updateUser);
router.delete("/:id", authenticateToken, requireAdmin, userController.deleteUser);
router.patch("/change-password", authenticateToken, userController.changePassword);

export default router;
