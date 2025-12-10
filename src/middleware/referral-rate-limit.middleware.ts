import type { Request, Response, NextFunction } from "express";

// In-memory store for rate limiting
// Format: Map<userId, lastInviteTimestamp>
const inviteTimestamps = new Map<number, number>();

// Cleanup old entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamp] of inviteTimestamps.entries()) {
    // Remove entries older than the rate limit window
    if (now - timestamp > RATE_LIMIT_WINDOW) {
      inviteTimestamps.delete(userId);
    }
  }
}, CLEANUP_INTERVAL);

/**
 * Rate limiting middleware for referral invitations
 * Limits users to 1 invitation per minute
 */
export const referralInviteRateLimit = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
      error: "UNAUTHORIZED",
    });
    return;
  }

  const lastInviteTime = inviteTimestamps.get(userId);
  const now = Date.now();

  if (lastInviteTime) {
    const timeSinceLastInvite = now - lastInviteTime;

    if (timeSinceLastInvite < RATE_LIMIT_WINDOW) {
      const remainingSeconds = Math.ceil(
        (RATE_LIMIT_WINDOW - timeSinceLastInvite) / 1000
      );
      res.status(429).json({
        success: false,
        message: `Please wait ${remainingSeconds} second(s) before sending another invitation`,
        error: "RATE_LIMIT_EXCEEDED",
        retryAfter: remainingSeconds,
      });
      return;
    }
  }

  // Allow request to proceed - timestamp will be set in controller after successful email send
  next();
};

/**
 * Record a successful invitation send (called from controller after email is sent)
 */
export const recordInvitationSent = (userId: number): void => {
  inviteTimestamps.set(userId, Date.now());
};

