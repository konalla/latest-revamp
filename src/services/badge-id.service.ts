import prisma from "../config/prisma.js";

export class BadgeIdService {
  /**
   * Generate Origin ID in format ORG-001
   */
  generateOriginId(rank: number): string {
    return `ORG-${rank.toString().padStart(3, "0")}`;
  }

  /**
   * Generate Vanguard ID in format VNG-001
   */
  generateVanguardId(rank: number): string {
    return `VNG-${rank.toString().padStart(3, "0")}`;
  }

  /**
   * Validate badge ID format
   */
  validateBadgeIdFormat(badgeId: string): { valid: boolean; type?: "origin" | "vanguard" } {
    if (!badgeId || typeof badgeId !== "string") {
      return { valid: false };
    }

    const originPattern = /^ORG-\d{3}$/;
    const vanguardPattern = /^VNG-\d{3}$/;

    if (originPattern.test(badgeId.toUpperCase())) {
      return { valid: true, type: "origin" };
    }

    if (vanguardPattern.test(badgeId.toUpperCase())) {
      return { valid: true, type: "vanguard" };
    }

    return { valid: false };
  }

  /**
   * Restore badge by ID
   * This allows users to restore their Origin/Vanguard status if they move to a new account
   */
  async restoreBadge(userId: number, badgeId: string): Promise<{
    success: boolean;
    message?: string;
    badgeType?: "origin" | "vanguard";
  }> {
    // Validate badge ID format
    const validation = this.validateBadgeIdFormat(badgeId);
    if (!validation.valid) {
      return {
        success: false,
        message: "Invalid badge ID format. Expected format: ORG-001 or VNG-001",
      };
    }

    const badgeType = validation.type!;
    const upperBadgeId = badgeId.toUpperCase();

    // Find user with this badge ID
    const existingUser = await prisma.userReferralStatus.findFirst({
      where: {
        OR: [
          { originId: upperBadgeId },
          { vanguardId: upperBadgeId },
        ],
      },
    });

    if (!existingUser) {
      return {
        success: false,
        message: "Badge ID not found in our records",
      };
    }

    // Check if badge ID is already assigned to another user
    if (existingUser.userId !== userId) {
      return {
        success: false,
        message: "This badge ID is already assigned to another user",
      };
    }

    // Get current user status
    const userStatus = await prisma.userReferralStatus.findUnique({
      where: { userId },
    });

    if (!userStatus) {
      return {
        success: false,
        message: "User referral status not found",
      };
    }

    // Restore badge
    if (badgeType === "origin") {
      await prisma.userReferralStatus.update({
        where: { userId },
        data: {
          earlyAccessStatus: userStatus.earlyAccessStatus === "VANGUARD" ? "VANGUARD" : "ORIGIN",
          originId: upperBadgeId,
        },
      });
    } else if (badgeType === "vanguard") {
      await prisma.userReferralStatus.update({
        where: { userId },
        data: {
          earlyAccessStatus: "VANGUARD",
          vanguardId: upperBadgeId,
          // Ensure Origin ID is also set
          originId: userStatus.originId || existingUser.originId,
        },
      });
    }

    return {
      success: true,
      message: `${badgeType === "origin" ? "Origin" : "Vanguard"} badge restored successfully`,
      badgeType,
    };
  }

  /**
   * Get user's badge rank
   */
  async getBadgeRank(userId: number, badgeType: "origin" | "vanguard"): Promise<number | null> {
    const userStatus = await prisma.userReferralStatus.findUnique({
      where: { userId },
    });

    if (!userStatus) {
      return null;
    }

    const badgeId = badgeType === "origin" ? userStatus.originId : userStatus.vanguardId;
    if (!badgeId) {
      return null;
    }

    // Extract rank from badge ID (e.g., ORG-001 -> 1)
    const match = badgeId.match(/\d+$/);
    if (!match) {
      return null;
    }

    return parseInt(match[0], 10);
  }
}

export const badgeIdService = new BadgeIdService();

