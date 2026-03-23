import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import * as userController from "../controllers/user.controller.js";
import * as userStatusController from "../controllers/user-status.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { uploadProfilePhoto, handleUploadError } from "../middleware/upload.middleware.js";

const router = Router();

// Ownership middleware: allow only the user themselves or an admin
const requireOwnerOrAdmin = (req: Request, res: Response, next: NextFunction) => {
  const requesterId = (req.user as any)?.userId ?? (req.user as any)?.id;
  const targetId = parseInt(req.params.id!);
  if (!requesterId) return res.status(401).json({ message: "Authentication required" });
  if (requesterId === targetId || (req.user as any)?.role === "ADMIN") return next();
  return res.status(403).json({ message: "Access denied" });
};

// Admin-only: list all users (user registration is via /api/auth/register)
router.get("/", authenticateToken, requireAdmin, userController.getUsers);
router.post("/", authenticateToken, requireAdmin, userController.createUser);

// Protected: current user profile (before /:id to avoid conflicts)
router.get("/me", authenticateToken, userController.getCurrentUser);
router.post("/profile/photo", authenticateToken, uploadProfilePhoto, handleUploadError, userController.uploadProfilePhoto);
router.patch("/change-password", authenticateToken, userController.changePassword);

// User status routes
router.get("/me/status", authenticateToken, userStatusController.getCurrentUserStatus);
router.get("/active", authenticateToken, userStatusController.getActiveUsers);

// Protected: get/update/delete specific user (/:id must come after /me)
router.get("/:id", authenticateToken, userController.getUser);
router.get("/:userId/status", authenticateToken, userStatusController.getUserStatus);
router.put("/:id", authenticateToken, requireOwnerOrAdmin, userController.updateUser);
router.delete("/:id", authenticateToken, requireAdmin, userController.deleteUser);

export default router;
