import prisma from "../config/prisma.js";
import type { EarlyAccessStatus } from "@prisma/client";
import { generateReferralCode, padUserId, generateRandomHex } from "../utils/referral.utils.js";

export class StatusAssignmentService {
  /**
   * Check and update user's early access status
   * Algorithm:
   * 1. Get user's current status
   * 2. If already origin/vanguard, skip
   * 3. Count completed referrals
   * 4. Check Vanguard eligibility (3+ referrals AND seats available)
   * 5. Check Origin eligibility (seats available)
   * 6. Update status if eligible
   */
  async checkAndUpdateUserStatus(userId: number): Promise<{
    updated: boolean;
    newStatus?: EarlyAccessStatus;
    previousStatus?: EarlyAccessStatus;
  }> {
    // Get user's current referral status
    const userStatus = await prisma.userReferralStatus.findUnique({
      where: { userId },
    });

    if (!userStatus) {
      return { updated: false };
    }

    const currentStatus = userStatus.earlyAccessStatus;

    // Count completed referrals
    const completedReferrals = await prisma.referral.count({
      where: {
        referrerId: userId,
        status: "COMPLETED",
      },
    });

    // Get seat availability
    const seats = await this.calculateSeatsRemaining();

    // Check Vanguard eligibility first (can upgrade from ORIGIN to VANGUARD)
    // User must have: 3+ referrals, seats available, AND paid at least once after trial
    const hasPaidAfterTrial = await this.hasPaidAfterTrial(userId);
    if (completedReferrals >= 3 && seats.vanguardRemaining > 0 && hasPaidAfterTrial) {
      // If already VANGUARD, no update needed
      if (currentStatus === "VANGUARD") {
        return {
          updated: false,
          previousStatus: currentStatus,
          newStatus: currentStatus,
        };
      }
      
      // Try to assign Vanguard ID (will add Vanguard ID but keep original status)
      const result = await this.assignVanguardStatus(userId);
      if (result.success) {
        // Status remains the first one earned, so return current status
        return {
          updated: true,
          previousStatus: currentStatus,
          newStatus: currentStatus, // Keep the first status earned
        };
      }
    }

    // Check Origin eligibility (if not Vanguard qualified or Vanguard seats full)
    // Only assign Origin if user doesn't already have ORIGIN or VANGUARD
    if (currentStatus !== "ORIGIN" && currentStatus !== "VANGUARD" && seats.originRemaining > 0) {
      const result = await this.assignOriginStatus(userId);
      if (result.success) {
        return {
          updated: true,
          previousStatus: currentStatus,
          newStatus: "ORIGIN",
        };
      }
    }

    // If already has ORIGIN but not eligible for VANGUARD, no update needed
    if (currentStatus === "ORIGIN" || currentStatus === "VANGUARD") {
      return {
        updated: false,
        previousStatus: currentStatus,
        newStatus: currentStatus,
      };
    }

    return {
      updated: false,
      previousStatus: currentStatus,
    };
  }

  /**
   * Assign Origin 1000 status to user
   * Uses database transaction to handle race conditions
   * Creates UserReferralStatus record if it doesn't exist
   */
  async assignOriginStatus(userId: number): Promise<{
    success: boolean;
    message?: string;
  }> {
    return await prisma.$transaction(async (tx) => {
      // Check current seat count with lock
      const originCount = await tx.userReferralStatus.count({
        where: {
          earlyAccessStatus: {
            in: ["ORIGIN", "VANGUARD"],
          },
        },
      });

      if (originCount >= 1000) {
        return {
          success: false,
          message: "Origin 1000 seats are full",
        };
      }

      // Check if user already has status
      const userStatus = await tx.userReferralStatus.findUnique({
        where: { userId },
      });

      if (userStatus) {
        // User already has a status record
        if (userStatus.earlyAccessStatus === "ORIGIN" || userStatus.earlyAccessStatus === "VANGUARD") {
          return {
            success: false,
            message: "User already has Origin or Vanguard status",
          };
        }
      }

      // Assign Origin status
      const rank = originCount + 1;
      const originId = `ORG-${rank.toString().padStart(3, "0")}`;

      // Generate a referral code if user doesn't have one
      let referralCode = userStatus?.referralCode;
      if (!referralCode) {
        // Generate unique referral code
        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts) {
          referralCode = generateReferralCode(userId);
          
          // Check if code is unique
          const existing = await tx.userReferralStatus.findUnique({
            where: { referralCode },
          });
          
          if (!existing) {
            break; // Code is unique
          }
          attempts++;
        }
        
        if (attempts >= maxAttempts) {
          return {
            success: false,
            message: "Failed to generate unique referral code",
          };
        }
      }

      // Create or update user referral status
      await tx.userReferralStatus.upsert({
        where: { userId },
        create: {
          userId,
          referralCode: referralCode!,
          earlyAccessStatus: "ORIGIN",
          originId,
        },
        update: {
          earlyAccessStatus: "ORIGIN",
          originId,
        },
      });

      return {
        success: true,
        message: `Origin 1000 status assigned (Rank: ${rank})`,
      };
    });
  }

  /**
   * Assign Vanguard 300 status to user
   * Uses database transaction to handle race conditions
   */
  async assignVanguardStatus(userId: number): Promise<{
    success: boolean;
    message?: string;
  }> {
    return await prisma.$transaction(async (tx) => {
      // Check referral count
      const completedReferrals = await tx.referral.count({
        where: {
          referrerId: userId,
          status: "COMPLETED",
        },
      });

      if (completedReferrals < 3) {
        return {
          success: false,
          message: "User does not have 3+ completed referrals",
        };
      }

      // Check if user has paid at least once after trial period
      const subscription = await tx.subscription.findUnique({
        where: { userId },
        include: {
          payments: {
            where: {
              status: "succeeded",
              amount: {
                gt: 0,
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });

      if (!subscription) {
        return {
          success: false,
          message: "User does not have a subscription",
        };
      }

      // Check if user has paid after trial period
      let hasPaidAfterTrial = false;
      if (!subscription.trialEnd) {
        // No trial period - any successful payment counts
        hasPaidAfterTrial = subscription.payments.length > 0;
      } else {
        // Has trial period - check if there's at least one payment after trialEnd
        hasPaidAfterTrial = subscription.payments.some(
          (payment) => payment.createdAt > subscription.trialEnd!
        );
      }

      if (!hasPaidAfterTrial) {
        return {
          success: false,
          message: "User must have paid at least once after their trial period to earn Vanguard badge",
        };
      }

      // Check current Vanguard seat count with lock
      const vanguardCount = await tx.userReferralStatus.count({
        where: {
          earlyAccessStatus: "VANGUARD",
        },
      });

      if (vanguardCount >= 300) {
        return {
          success: false,
          message: "Vanguard 300 seats are full",
        };
      }

      // Check if user already has Vanguard status
      const userStatus = await tx.userReferralStatus.findUnique({
        where: { userId },
      });

      if (!userStatus) {
        return {
          success: false,
          message: "User referral status not found",
        };
      }

      if (userStatus.earlyAccessStatus === "VANGUARD") {
        return {
          success: false,
          message: "User already has Vanguard status",
        };
      }

      // Assign Vanguard ID (user can have both Origin and Vanguard IDs)
      const rank = vanguardCount + 1;
      const vanguardId = `VNG-${rank.toString().padStart(3, "0")}`;

      // If user has Origin status, keep their original Origin ID and status
      // Otherwise, assign new Origin ID
      let originId = userStatus.originId;
      let statusToKeep = userStatus.earlyAccessStatus; // Keep the first status earned

      if (!originId) {
        // User doesn't have Origin ID yet, assign one
        const originCount = await tx.userReferralStatus.count({
          where: {
            earlyAccessStatus: {
              in: ["ORIGIN", "VANGUARD"],
            },
          },
        });
        originId = `ORG-${(originCount + 1).toString().padStart(3, "0")}`;
        // If they didn't have Origin status, set it to ORIGIN (first status)
        if (statusToKeep === "NONE") {
          statusToKeep = "ORIGIN";
        }
      }

      // Update: Add Vanguard ID but keep the original status (first one earned)
      await tx.userReferralStatus.update({
        where: { userId },
        data: {
          earlyAccessStatus: statusToKeep, // Keep the first status earned (ORIGIN if earned first)
          vanguardId, // Add Vanguard ID
          originId, // Ensure Origin ID is set (keep original if exists)
        },
      });

      return {
        success: true,
        message: `Vanguard 300 ID assigned (Rank: ${rank}). Status remains: ${statusToKeep} (first earned)`,
      };
    });
  }

  /**
   * Calculate seats remaining for both programs
   */
  async calculateSeatsRemaining(): Promise<{
    vanguardRemaining: number;
    originRemaining: number;
    vanguardTotal: number;
    originTotal: number;
  }> {
    const [vanguardCount, originCount] = await Promise.all([
      prisma.userReferralStatus.count({
        where: { earlyAccessStatus: "VANGUARD" },
      }),
      prisma.userReferralStatus.count({
        where: {
          earlyAccessStatus: {
            in: ["ORIGIN", "VANGUARD"],
          },
        },
      }),
    ]);

    return {
      vanguardRemaining: Math.max(0, 300 - vanguardCount),
      originRemaining: Math.max(0, 1000 - originCount),
      vanguardTotal: 300,
      originTotal: 1000,
    };
  }

  /**
   * Check if user is a paying member
   * Criteria: Subscription status = ACTIVE OR has successful payment
   */
  async isPayingMember(userId: number): Promise<boolean> {
    // Check subscription status
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (subscription && subscription.status === "ACTIVE") {
      return true;
    }

    // Check for successful payment
    const payment = await prisma.payment.findFirst({
      where: {
        subscription: {
          userId,
        },
        status: "succeeded",
      },
    });

    return !!payment;
  }

  /**
   * Check if user has paid at least once after their trial period
   * A user can only earn Vanguard badge if they have paid at least once after trial
   */
  async hasPaidAfterTrial(userId: number): Promise<boolean> {
    // Get user's subscription
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: {
        payments: {
          where: {
            status: "succeeded",
            amount: {
              gt: 0,
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!subscription) {
      return false;
    }

    // If user has no trial period (trialEnd is null), any successful payment counts
    if (!subscription.trialEnd) {
      return subscription.payments.length > 0;
    }

    // If user has a trial period, check if there's at least one payment after trialEnd
    const paymentAfterTrial = subscription.payments.find(
      (payment) => payment.createdAt > subscription.trialEnd!
    );

    return !!paymentAfterTrial;
  }
}

export const statusAssignmentService = new StatusAssignmentService();

