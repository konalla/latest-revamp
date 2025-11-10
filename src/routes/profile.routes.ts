import { Router } from "express";
import * as profileController from "../controllers/profile.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

// Protected routes (require JWT token)
router.post("/update-completion", authenticateToken, profileController.updateProfileCompletion);

export default router;
