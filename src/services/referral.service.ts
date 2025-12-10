import prisma from "../config/prisma.js";
import { statusAssignmentService } from "./status-assignment.service.js";
import {
  generateReferralCode,
  validateReferralCodeFormat,
  hashIpAddress,
} from "../utils/referral.utils.js";

export class ReferralService {
  /**
   * Generate a unique referral code for a user
   * Format: {userId padded to 4 digits}{6 random hex chars}
   */
  async generateReferralCode(userId: number): Promise<string> {
    // Check if user already has a referral code
    const existingStatus = await prisma.userReferralStatus.findUnique({
      where: { userId },
    });

    if (existingStatus?.referralCode) {
      return existingStatus.referralCode;
    }

    // Generate new code with retry logic for uniqueness
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const code = generateReferralCode(userId);

      try {
        // Create or update user referral status
        await prisma.userReferralStatus.upsert({
          where: { userId },
          create: {
            userId,
            referralCode: code,
            earlyAccessStatus: "NONE",
          },
          update: {
            referralCode: code,
          },
        });

        return code;
      } catch (error: any) {
        // If unique constraint violation, retry with new code
        if (error.code === "P2002" && error.meta?.target?.includes("referralCode")) {
          attempts++;
          continue;
        }
        throw error;
      }
    }

    throw new Error("Failed to generate unique referral code after multiple attempts");
  }

  /**
   * Get user's referral status and statistics
   */
  async getUserReferralStatus(userId: number) {
    const userStatus = await prisma.userReferralStatus.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Get stats regardless of whether userStatus exists
    const stats = await this.getReferralStats(userId);

    if (!userStatus) {
      return {
        userId,
        referralCode: "",
        hasReferralCode: false,
        earlyAccessStatus: "none",
        rewardsUnlocked: false,
        originId: null,
        vanguardId: null,
        stats,
      };
    }

    // Convert earlyAccessStatus to lowercase for API response
    const earlyAccessStatus = userStatus.earlyAccessStatus.toLowerCase() as "none" | "origin" | "vanguard";

    return {
      userId: userStatus.userId,
      referralCode: userStatus.referralCode || "",
      hasReferralCode: !!userStatus.referralCode,
      earlyAccessStatus,
      rewardsUnlocked: userStatus.rewardsUnlocked,
      originId: userStatus.originId,
      vanguardId: userStatus.vanguardId,
      stats,
    };
  }

  /**
   * Get referral statistics for a user
   */
  async getReferralStats(userId: number) {
    const [totalReferrals, completedReferrals] = await Promise.all([
      prisma.referral.count({
        where: { referrerId: userId },
      }),
      prisma.referral.count({
        where: {
          referrerId: userId,
          status: "COMPLETED",
        },
      }),
    ]);

    const requiredReferrals = 3;
    const progress = completedReferrals / requiredReferrals;
    const progressPercentage = Math.min(100, Math.round(progress * 100));

    const userStatus = await prisma.userReferralStatus.findUnique({
      where: { userId },
    });

    const isVanguardQualified = completedReferrals >= requiredReferrals;
    const isVanguard = userStatus?.earlyAccessStatus === "VANGUARD";
    const isOrigin = userStatus?.earlyAccessStatus === "ORIGIN" || isVanguard;

    return {
      totalReferrals,
      completedReferrals,
      requiredReferrals,
      progress,
      progressPercentage,
      isVanguardQualified,
      isVanguard,
      isOrigin,
    };
  }

  /**
   * Register a referral when a user signs up with a referral code
   */
  async registerReferral(userId: number, referralCode: string): Promise<{
    success: boolean;
    referralId?: number;
    message?: string;
  }> {
    // Validate referral code format
    if (!validateReferralCodeFormat(referralCode)) {
      return {
        success: false,
        message: "Invalid referral code format",
      };
    }

    // Find referral status by code
    const referrerStatus = await prisma.userReferralStatus.findUnique({
      where: { referralCode: referralCode.toUpperCase() },
    });

    if (!referrerStatus) {
      return {
        success: false,
        message: "Invalid referral code",
      };
    }

    const referrerId = referrerStatus.userId;

    // Prevent self-referral
    if (referrerId === userId) {
      return {
        success: false,
        message: "You cannot refer yourself",
      };
    }

    // Check if user has already been referred
    const existingReferral = await prisma.referral.findUnique({
      where: { referredId: userId },
    });

    if (existingReferral) {
      return {
        success: false,
        message: "You have already been referred by someone",
      };
    }

    // Create referral record
    try {
      const referral = await prisma.referral.create({
        data: {
          referrerId,
          referredId: userId,
          referralCode: referralCode.toUpperCase(),
          status: "REGISTERED",
        },
      });

      return {
        success: true,
        referralId: referral.id,
        message: "Referral registered successfully",
      };
    } catch (error: any) {
      if (error.code === "P2002") {
        return {
          success: false,
          message: "You have already been referred by someone",
        };
      }
      throw error;
    }
  }

  /**
   * Mark a referral as completed when the referred user finishes onboarding
   */
  async completeReferralOnboarding(userId: number): Promise<{
    success: boolean;
    referralId?: number;
    referrerStatusUpdated?: boolean;
    newReferrerStatus?: string;
    message?: string;
  }> {
    // Find referral for this user
    const referral = await prisma.referral.findUnique({
      where: { referredId: userId },
    });

    if (!referral) {
      return {
        success: false,
        message: "No referral found for this user",
      };
    }

    if (referral.status === "COMPLETED") {
      return {
        success: true,
        referralId: referral.id,
        message: "Referral already completed",
      };
    }

    // Update referral status
    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    // Check and update referrer's status
    const statusUpdate = await statusAssignmentService.checkAndUpdateUserStatus(referral.referrerId);

    return {
      success: true,
      referralId: referral.id,
      referrerStatusUpdated: statusUpdate.updated,
      newReferrerStatus: statusUpdate.newStatus?.toLowerCase(),
      message: "Referral completed successfully",
    };
  }

  /**
   * Track a click on a referral link
   */
  async trackReferralClick(
    referralCode: string,
    ipAddress: string,
    userAgent?: string,
    referer?: string
  ): Promise<{
    success: boolean;
    clickId?: number;
    message?: string;
  }> {
    // Validate referral code format
    if (!validateReferralCodeFormat(referralCode)) {
      return {
        success: false,
        message: "Invalid referral code format",
      };
    }

    // Check if referral code exists
    const referrerStatus = await prisma.userReferralStatus.findUnique({
      where: { referralCode: referralCode.toUpperCase() },
    });

    if (!referrerStatus) {
      return {
        success: false,
        message: "Referral code not found",
      };
    }

    // Hash IP address for privacy
    const ipHash = hashIpAddress(ipAddress);

    // Create click record
    const click = await prisma.referralClick.create({
      data: {
        referralCode: referralCode.toUpperCase(),
        visitorIpHash: ipHash,
        userAgent: userAgent || null,
        referer: referer || null,
        converted: false, // Will be updated if user signs up
      },
    });

    return {
      success: true,
      clickId: click.id,
      message: "Click tracked successfully",
    };
  }

  /**
   * Get program status including seats remaining
   */
  async getProgramStatus() {
    const seats = await statusAssignmentService.calculateSeatsRemaining();

    const programs = await prisma.referralProgram.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
    });

    return {
      vanguardSeatsRemaining: seats.vanguardRemaining,
      originSeatsRemaining: seats.originRemaining,
      vanguardSeatsTotal: seats.vanguardTotal,
      originSeatsTotal: seats.originTotal,
      programs,
    };
  }

  /**
   * Get top referrers leaderboard
   */
  async getLeaderboard(limit: number = 10) {
    const topReferrers = await prisma.referral.groupBy({
      by: ["referrerId"],
      where: {
        status: "COMPLETED",
      },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: "desc",
        },
      },
      take: limit,
    });

    // Get user details for each referrer
    const referrerIds = topReferrers.map((r) => r.referrerId);
    const users = await prisma.user.findMany({
      where: {
        id: {
          in: referrerIds,
        },
      },
      select: {
        id: true,
        username: true,
        name: true,
        profile_photo_url: true,
      },
    });

    // Map users to their referral counts
    const userMap = new Map(users.map((u) => [u.id, u]));
    const referralCountMap = new Map(
      topReferrers.map((r) => [r.referrerId, r._count.id])
    );

    return referrerIds
      .map((id) => {
        const user = userMap.get(id);
        const count = referralCountMap.get(id) || 0;
        return user
          ? {
              userId: user.id,
              username: user.username,
              name: user.name,
              profilePhotoUrl: user.profile_photo_url,
              referralsCount: count,
            }
          : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }
}

export const referralService = new ReferralService();

