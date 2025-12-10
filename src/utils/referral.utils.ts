import crypto from "crypto";

/**
 * Generate a random hexadecimal string of specified length
 */
export function generateRandomHex(length: number): string {
  return crypto.randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length).toUpperCase();
}

/**
 * Pad user ID to 4 digits with leading zeros
 */
export function padUserId(userId: number): string {
  return userId.toString().padStart(4, "0");
}

/**
 * Validate referral code format (10 characters, alphanumeric)
 */
export function validateReferralCodeFormat(code: string): boolean {
  if (!code || typeof code !== "string") {
    return false;
  }
  // Should be exactly 10 characters, alphanumeric
  return /^[A-Z0-9]{10}$/.test(code.toUpperCase());
}

/**
 * Hash IP address using SHA-256 for privacy
 */
export function hashIpAddress(ip: string): string {
  if (!ip) {
    return "";
  }
  return crypto.createHash("sha256").update(ip).digest("hex");
}

/**
 * Generate referral code: {userId padded to 4 digits}{6 random hex chars}
 * Example: User ID 123 → "0123ABC456"
 */
export function generateReferralCode(userId: number): string {
  const paddedUserId = padUserId(userId);
  const randomHex = generateRandomHex(6);
  return `${paddedUserId}${randomHex}`.toUpperCase();
}

