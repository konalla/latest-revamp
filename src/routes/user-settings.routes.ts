import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import {
  getUserSettingsController,
  createUserSettingsController,
  updateUserSettingsController,
  deleteUserSettingsController,
} from "../controllers/user-settings.controller.js";

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/user-settings - Get user settings
router.get("/", getUserSettingsController);

// POST /api/user-settings - Create user settings
router.post("/", createUserSettingsController);

// PUT /api/user-settings - Update user settings
router.put("/", updateUserSettingsController);

// DELETE /api/user-settings - Delete user settings
router.delete("/", deleteUserSettingsController);

export default router;
