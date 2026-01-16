import prisma from "../config/prisma.js";
import { statusAssignmentService } from "./status-assignment.service.js";
import { walletService } from "./wallet.service.js";
import {
  generateReferralCode,
  validateReferralCodeFormat,
  hashIpAddress,
} from "../utils/referral.utils.js";

export class ReferralService {
  /**
   * Check if user has completed their first billing cycle
   * A user has completed first billing cycle if they have at least 2 successful payments
   * (first payment after trial + first renewal payment)
   */
  async hasCompletedFirstBillingCycle(userId: number): Promise<boolean> {
    const paymentCount = await prisma.payment.count({
      where: {
        subscription: {
          userId,
        },
        status: "succeeded",
        amount: {
          gt: 0,
        },
      },
    });

    // User needs at least 2 successful payments to have completed first billing cycle
    return paymentCount >= 2;
  }

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

    // Check if referrer is on free plan - free plan users cannot refer
    const referrerSubscription = await prisma.subscription.findUnique({
      where: { userId: referrerId },
      include: { subscriptionPlan: true },
    });

    if (referrerSubscription?.subscriptionPlan?.name === "free") {
      return {
        success: false,
        message: "Free plan users cannot refer others",
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

      // Note: Coins are not awarded here on signup
      // Coins will be awarded when:
      // 1. User subscribes to free plan (5 coins) - handled in subscription.service.ts
      // 2. User makes first payment (100 coins) - handled in completeReferralOnboarding()

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

    // Award additional coins to referrer when referred user makes first payment
    try {
      // Get referred user info for description
      const referredUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true, username: true },
      });

      const referredUserDisplay = referredUser?.name || referredUser?.username || referredUser?.email || "a new user";
      
      // Get coin amount from environment variable (default: 100)
      // This is the additional reward when referred user pays
      const paymentCoinAmount = parseInt(process.env.REFERRAL_COIN_REWARD || "100", 10);

      // Check if coins were already awarded for payment (to avoid duplicates)
      const wallet = await prisma.wallet.findUnique({
        where: { userId: referral.referrerId },
      });

      let alreadyAwardedForPayment = false;
      if (wallet) {
        // Get all referral transactions for this wallet
        const referralTransactions = await prisma.walletTransaction.findMany({
          where: {
            walletId: wallet.id,
            category: "REFERRAL",
          },
        });

        // Check if there's a transaction with this referralId and type "payment" in metadata
        for (const transaction of referralTransactions) {
          const metadata = transaction.metadata as any;
          if (metadata?.referralId === referral.id && metadata?.type === "payment") {
            alreadyAwardedForPayment = true;
            break;
          }
        }
      }

      if (!alreadyAwardedForPayment) {
        const coinResult = await walletService.awardCoins(
          referral.referrerId,
          paymentCoinAmount,
          "REFERRAL",
          `Earned ${paymentCoinAmount} coins from referral payment: ${referredUserDisplay}`,
          {
            referralId: referral.id,
            referredUserId: userId,
            type: "payment", // Mark as payment reward
          }
        );

        if (coinResult.success) {
          console.log(`[Wallet] Awarded ${paymentCoinAmount} coins to user ${referral.referrerId} for referral payment ${referral.id}`);
        } else {
          console.error(`[Wallet] Failed to award payment coins to user ${referral.referrerId}:`, coinResult.error);
        }
      } else {
        console.log(`[Wallet] Payment coins already awarded for referral ${referral.id}, skipping`);
      }
    } catch (coinError: any) {
      console.error("[Wallet] Error awarding payment coins for referral:", coinError);
      // Don't fail referral completion if coin award fails
    }

    // Check and update referrer's status
    const statusUpdate = await statusAssignmentService.checkAndUpdateUserStatus(referral.referrerId);

    return {
      success: true,
      referralId: referral.id,
      referrerStatusUpdated: statusUpdate.updated,
      ...(statusUpdate.newStatus && { newReferrerStatus: statusUpdate.newStatus.toLowerCase() }),
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

