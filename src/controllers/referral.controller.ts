import type { Request, Response } from "express";
import { referralService } from "../services/referral.service.js";
import { badgeIdService } from "../services/badge-id.service.js";
import { sendReferralInvitationEmail } from "../services/referral-email.service.js";
import { recordInvitationSent } from "../middleware/referral-rate-limit.middleware.js";
import * as userService from "../services/user.service.js";

/**
 * GET /api/referrals/status
 * Get the current user's referral status and statistics
 */
export const getReferralStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const status = await referralService.getUserReferralStatus(userId);
    res.json(status);
  } catch (error: any) {
    console.error("Error getting referral status:", error);
    res.status(500).json({ error: "Failed to get referral status" });
  }
};

/**
 * POST /api/referrals/generate
 * Generate a referral code for the current user
 */
export const generateReferralCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const referralCode = await referralService.generateReferralCode(userId);

    // Check if code was newly generated or already existed
    const status = await referralService.getUserReferralStatus(userId);
    const message = status.hasReferralCode
      ? "Referral code generated successfully"
      : "You already have a referral code";

    res.json({
      referralCode,
      message,
    });
  } catch (error: any) {
    console.error("Error generating referral code:", error);
    res.status(500).json({ error: "Failed to generate referral code" });
  }
};

/**
 * GET /api/referrals/program-status
 * Get program status including seats remaining (public endpoint)
 */
export const getProgramStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = await referralService.getProgramStatus();
    res.json(status);
  } catch (error: any) {
    console.error("Error getting program status:", error);
    res.status(500).json({ error: "Failed to get program status" });
  }
};

/**
 * GET /api/referrals/leaderboard
 * Get top referrers leaderboard
 */
export const getLeaderboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const leaderboard = await referralService.getLeaderboard(limit);
    res.json(leaderboard);
  } catch (error: any) {
    console.error("Error getting leaderboard:", error);
    res.status(500).json({ error: "Failed to get leaderboard" });
  }
};

/**
 * POST /api/referrals/track-click
 * Track a click on a referral link
 */
export const trackReferralClick = async (req: Request, res: Response): Promise<void> => {
  try {
    const { referralCode, visitorIpHash, userAgent, referer } = req.body;

    if (!referralCode) {
      res.status(400).json({ error: "Referral code is required" });
      return;
    }

    // Get IP address from request
    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      (req.headers["x-real-ip"] as string) ||
      req.socket.remoteAddress ||
      "";

    const result = await referralService.trackReferralClick(
      referralCode,
      ipAddress,
      userAgent || req.headers["user-agent"],
      referer || req.headers.referer
    );

    if (!result.success) {
      res.status(400).json({ error: result.message });
      return;
    }

    res.json(result);
  } catch (error: any) {
    console.error("Error tracking referral click:", error);
    res.status(500).json({ error: "Failed to track referral click" });
  }
};

/**
 * POST /api/referrals/register
 * Register a referral when a user signs up with a referral code
 */
export const registerReferral = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { referralCode } = req.body;

    if (!referralCode) {
      res.status(400).json({ error: "Referral code is required" });
      return;
    }

    const result = await referralService.registerReferral(userId, referralCode);

    if (!result.success) {
      const statusCode =
        result.message === "Invalid referral code" ? 404 : 400;
      res.status(statusCode).json({ error: result.message });
      return;
    }

    res.json(result);
  } catch (error: any) {
    console.error("Error registering referral:", error);
    res.status(500).json({ error: "Failed to register referral" });
  }
};

/**
 * POST /api/referrals/complete-onboarding
 * Mark a referral as completed when the referred user finishes onboarding
 */
export const completeReferralOnboarding = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const result = await referralService.completeReferralOnboarding(userId);

    if (!result.success) {
      res.status(404).json({ error: result.message });
      return;
    }

    res.json(result);
  } catch (error: any) {
    console.error("Error completing referral onboarding:", error);
    res.status(500).json({ error: "Failed to complete referral onboarding" });
  }
};

/**
 * POST /api/referrals/restore-badge
 * Restore badge by ID
 */
export const restoreBadge = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { badgeId } = req.body;

    if (!badgeId) {
      res.status(400).json({ error: "Badge ID is required" });
      return;
    }

    const result = await badgeIdService.restoreBadge(userId, badgeId);

    if (!result.success) {
      res.status(400).json({ error: result.message });
      return;
    }

    res.json(result);
  } catch (error: any) {
    console.error("Error restoring badge:", error);
    res.status(500).json({ error: "Failed to restore badge" });
  }
};

/**
 * POST /api/referrals/create
 * Send referral invitation email to a friend
 */
export const createReferralInvitation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
        error: "UNAUTHORIZED",
      });
      return;
    }

    const { email } = req.body;

    // Validate email is provided
    if (!email) {
      res.status(400).json({
        success: false,
        message: "Email address is required",
        error: "VALIDATION_ERROR",
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        success: false,
        message: "Invalid email address format",
        error: "VALIDATION_ERROR",
      });
      return;
    }

    // Get user details
    const user = await userService.getUserById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
        error: "USER_NOT_FOUND",
      });
      return;
    }

    // Check self-referral
    if (user.email?.toLowerCase() === email.toLowerCase()) {
      res.status(400).json({
        success: false,
        message: "You cannot send an invitation to yourself",
        error: "SELF_REFERRAL_NOT_ALLOWED",
      });
      return;
    }

    // Get or generate referral code
    let referralStatus = await referralService.getUserReferralStatus(userId);
    let referralCode = referralStatus.referralCode;

    // Auto-generate referral code if user doesn't have one
    if (!referralCode || !referralStatus.hasReferralCode) {
      referralCode = await referralService.generateReferralCode(userId);
    }

    // Build referral link
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const referralLink = `${frontendUrl}/ref/${referralCode}`;

    // Get referrer name (use name, username, or email as fallback)
    const referrerName = user.name || user.username || user.email || "A friend";

    // Send email
    try {
      await sendReferralInvitationEmail({
        to: email,
        referrerName,
        referrerEmail: user.email || "",
        referralLink,
      });

      // Record successful invitation send for rate limiting
      recordInvitationSent(userId);

      res.status(200).json({
        success: true,
        message: `Invitation email sent successfully to ${email}`,
        emailSent: true,
      });
    } catch (emailError: any) {
      console.error("Error sending referral invitation email:", emailError);
      res.status(500).json({
        success: false,
        message: "Failed to send invitation email. Please try again later.",
        error: "EMAIL_SEND_FAILED",
      });
      return;
    }
  } catch (error: any) {
    console.error("Error creating referral invitation:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send invitation email. Please try again later.",
      error: "EMAIL_SEND_FAILED",
    });
  }
};

