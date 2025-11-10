import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { uploadProfilePhoto, handleUploadError } from "../middleware/upload.middleware.js";

const router = Router();

// Public routes
router.post("/", userController.createUser);
router.get("/", userController.getUsers);

// Protected routes (require JWT token)
router.get("/me", authenticateToken, userController.getCurrentUser);
router.post("/profile/photo", authenticateToken, uploadProfilePhoto, handleUploadError, userController.uploadProfilePhoto);

// Public routes continued (/:id must come after /me to avoid conflicts)
router.get("/:id", userController.getUser);
router.put("/:id", authenticateToken, userController.updateUser);
router.delete("/:id", authenticateToken, userController.deleteUser);
router.patch("/change-password", authenticateToken, userController.changePassword);

export default router;
