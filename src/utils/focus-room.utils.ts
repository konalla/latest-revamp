import crypto from "crypto";

/**
 * Generate a secure invitation token for focus room invitations
 * Format: 32 character hexadecimal string (similar to referral code but longer)
 */
export function generateInvitationToken(): string {
  return crypto.randomBytes(16).toString("hex").toUpperCase();
}

/**
 * Validate invitation token format
 */
export function validateInvitationToken(token: string): boolean {
  if (!token || typeof token !== "string") {
    return false;
  }
  // Should be exactly 32 characters, hexadecimal
  return /^[A-F0-9]{32}$/.test(token.toUpperCase());
}

/**
 * Calculate remaining time in seconds for a session
 * Takes into account paused time
 */
export function calculateRemainingTime(
  startedAt: Date,
  scheduledDuration: number, // in seconds
  pausedAt: Date | null,
  resumedAt: Date | null
): number {
  const now = new Date();
  
  // If session is paused, calculate time until pause
  if (pausedAt && !resumedAt) {
    const elapsedBeforePause = Math.floor((pausedAt.getTime() - startedAt.getTime()) / 1000);
    return Math.max(0, scheduledDuration - elapsedBeforePause);
  }
  
  // If session was paused and resumed, subtract paused duration
  if (pausedAt && resumedAt) {
    const pausedDuration = Math.floor((resumedAt.getTime() - pausedAt.getTime()) / 1000);
    const elapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000) - pausedDuration;
    return Math.max(0, scheduledDuration - elapsed);
  }
  
  // Normal running session
  const elapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
  return Math.max(0, scheduledDuration - elapsed);
}

/**
 * Check if a session has ended (remaining time <= 0)
 */
export function isSessionEnded(
  startedAt: Date,
  scheduledDuration: number,
  pausedAt: Date | null,
  resumedAt: Date | null
): boolean {
  return calculateRemainingTime(startedAt, scheduledDuration, pausedAt, resumedAt) <= 0;
}

/**
 * Calculate actual duration of a session in seconds
 */
export function calculateActualDuration(
  startedAt: Date,
  endedAt: Date | null,
  pausedAt: Date | null,
  resumedAt: Date | null
): number | null {
  if (!endedAt) {
    return null;
  }
  
  const totalDuration = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
  
  // Subtract paused time if session was paused
  if (pausedAt && resumedAt) {
    const pausedDuration = Math.floor((resumedAt.getTime() - pausedAt.getTime()) / 1000);
    return totalDuration - pausedDuration;
  }
  
  // If paused but not resumed, calculate until pause
  if (pausedAt && !resumedAt) {
    return Math.floor((pausedAt.getTime() - startedAt.getTime()) / 1000);
  }
  
  return totalDuration;
}
