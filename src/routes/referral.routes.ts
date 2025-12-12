import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { referralInviteRateLimit } from "../middleware/referral-rate-limit.middleware.js";
import * as referralController from "../controllers/referral.controller.js";

const router = Router();

// Public endpoints (no authentication required)
router.get("/program-status", referralController.getProgramStatus);
router.get("/leaderboard", referralController.getLeaderboard);
router.post("/track-click", referralController.trackReferralClick);

// Protected endpoints (authentication required)
router.use(authenticateToken);

router.get("/status", referralController.getReferralStatus);
router.post("/generate", referralController.generateReferralCode);
router.post("/register", referralController.registerReferral);
router.post("/complete-onboarding", referralController.completeReferralOnboarding);
router.post("/restore-badge", referralController.restoreBadge);
router.post("/create", referralInviteRateLimit, referralController.createReferralInvitation);

export default router;

