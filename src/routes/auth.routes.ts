import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import * as authController from "../controllers/auth.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { rateLimitConfig } from "../config/security.config.js";

const router = Router();

// Rate limiters for auth endpoints
// Uses IP-based rate limiting (not per-user) to prevent:
// - Brute force attacks trying multiple accounts from same IP
// - Distributed attacks across multiple IPs still limited per IP
const authLimiter = rateLimit({
  ...rateLimitConfig.auth,
  // IP-based limiting is correct for authentication (prevents account enumeration)
  // Use ipKeyGenerator helper to properly handle IPv6 addresses
  keyGenerator: (req, res) => `ip:${ipKeyGenerator(req.ip || '')}`,
});

const passwordResetLimiter = rateLimit({
  ...rateLimitConfig.passwordReset,
  // IP-based limiting prevents email spam attacks
  // Use ipKeyGenerator helper to properly handle IPv6 addresses
  keyGenerator: (req, res) => `ip:${ipKeyGenerator(req.ip || '')}`,
});

// Apply strict rate limiting to authentication endpoints
router.post("/register", authLimiter, authController.register);
router.post("/check-availability", authLimiter, authController.checkAvailability);
router.post("/login", authLimiter, authController.login);
router.post("/logout", authenticateToken, authController.logout);
router.post("/forgot-password", passwordResetLimiter, authController.forgotPassword);
router.post("/reset-password", passwordResetLimiter, authController.resetPassword);

export default router;
