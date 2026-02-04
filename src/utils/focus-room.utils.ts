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
 * Takes into account cumulative paused time (supports multiple pause/resume cycles)
 */
export function calculateRemainingTime(
  startedAt: Date,
  scheduledDuration: number, // in seconds
  pausedAt: Date | null,
  resumedAt: Date | null,
  totalPauseDuration: number = 0 // cumulative pause duration in seconds
): number {
  const now = new Date();
  
  // If session is currently paused, calculate time until pause started
  // Don't count the ongoing pause in elapsed time
  if (pausedAt && !resumedAt) {
    const elapsedUntilPause = Math.floor((pausedAt.getTime() - startedAt.getTime()) / 1000);
    // Subtract previous cumulative pause duration from elapsed time
    const activeTime = Math.max(0, elapsedUntilPause - totalPauseDuration);
    return Math.max(0, scheduledDuration - activeTime);
  }
  
  // Session is active (running or was resumed)
  // Calculate total elapsed time minus all pause durations
  const totalElapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
  const activeTime = Math.max(0, totalElapsed - totalPauseDuration);
  return Math.max(0, scheduledDuration - activeTime);
}

/**
 * Check if a session has ended (remaining time <= 0)
 */
export function isSessionEnded(
  startedAt: Date,
  scheduledDuration: number,
  pausedAt: Date | null,
  resumedAt: Date | null,
  totalPauseDuration: number = 0
): boolean {
  return calculateRemainingTime(startedAt, scheduledDuration, pausedAt, resumedAt, totalPauseDuration) <= 0;
}

/**
 * Calculate the elapsed time for a session (active time only, excluding pauses)
 */
export function calculateElapsedTime(
  startedAt: Date,
  pausedAt: Date | null,
  totalPauseDuration: number = 0
): number {
  const now = new Date();
  
  // If currently paused, calculate until pause started
  if (pausedAt) {
    const elapsedUntilPause = Math.floor((pausedAt.getTime() - startedAt.getTime()) / 1000);
    return Math.max(0, elapsedUntilPause - totalPauseDuration);
  }
  
  // Session is active
  const totalElapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
  return Math.max(0, totalElapsed - totalPauseDuration);
}

/**
 * Calculate actual duration of a session in seconds (active time only)
 */
export function calculateActualDuration(
  startedAt: Date,
  endedAt: Date | null,
  pausedAt: Date | null,
  resumedAt: Date | null,
  totalPauseDuration: number = 0
): number | null {
  if (!endedAt) {
    return null;
  }
  
  const totalDuration = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
  
  // Subtract cumulative pause duration
  return Math.max(0, totalDuration - totalPauseDuration);
}

/**
 * Parse room ID from request parameter
 * Returns null if invalid or missing
 */
export function parseRoomId(roomIdParam: string | undefined): number | null {
  if (!roomIdParam) return null;
  const roomId = parseInt(roomIdParam, 10);
  return isNaN(roomId) ? null : roomId;
}

/**
 * Parse session ID from request parameter
 * Returns null if invalid or missing
 */
export function parseSessionId(sessionIdParam: string | undefined): number | null {
  if (!sessionIdParam) return null;
  const sessionId = parseInt(sessionIdParam, 10);
  return isNaN(sessionId) ? null : sessionId;
}

/**
 * Parse participant ID from request parameter
 * Returns null if invalid or missing
 */
export function parseParticipantId(participantIdParam: string | undefined): number | null {
  if (!participantIdParam) return null;
  const participantId = parseInt(participantIdParam, 10);
  return isNaN(participantId) ? null : participantId;
}

/**
 * Parse invitation ID from request parameter
 * Returns null if invalid or missing
 */
export function parseInvitationId(invitationIdParam: string | undefined): number | null {
  if (!invitationIdParam) return null;
  const invitationId = parseInt(invitationIdParam, 10);
  return isNaN(invitationId) ? null : invitationId;
}

/**
 * Parse template ID from request parameter
 * Returns null if invalid or missing
 */
export function parseTemplateId(templateIdParam: string | undefined): number | null {
  if (!templateIdParam) return null;
  const templateId = parseInt(templateIdParam, 10);
  return isNaN(templateId) ? null : templateId;
}


