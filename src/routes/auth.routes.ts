import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/logout", authenticateToken, authController.logout);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

export default router;
