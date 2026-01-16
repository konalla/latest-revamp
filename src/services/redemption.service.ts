import prisma from "../config/prisma.js";
import { walletService } from "./wallet.service.js";
import { webhookService } from "./webhook.service.js";
import type { RedemptionStatus } from "@prisma/client";

export class RedemptionService {
  /**
   * Get available redemption items with user balance
   */
  async getAvailableItems(userId: number) {
    const items = await prisma.redeemableItem.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        sortOrder: "asc",
      },
    });

    const userBalance = await walletService.getBalance(userId);

    return {
      items,
      userBalance,
    };
  }

  /**
   * Get user's tier (ORIGIN_1000 or VANGUARD_300)
   */
  async getUserTier(userId: number): Promise<"ORIGIN_1000" | "VANGUARD_300" | null> {
    const referralStatus = await prisma.userReferralStatus.findUnique({
      where: { userId },
      select: { earlyAccessStatus: true },
    });

    if (!referralStatus) return null;

    switch (referralStatus.earlyAccessStatus) {
      case "ORIGIN":
        return "ORIGIN_1000";
      case "VANGUARD":
        return "VANGUARD_300";
      default:
        return null;
    }
  }

  /**
   * Redeem an item for a user
   */
  async redeemItem(
    userId: number,
    redeemableItemId: number,
    selectedVariant?: Record<string, any>
  ): Promise<{
    success: boolean;
    redemption?: any;
    error?: string;
  }> {
    try {
      // Validate user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          subscription: {
            include: {
              subscriptionPlan: true,
            },
          },
        },
      });

      if (!user) {
        return {
          success: false,
          error: "User not found",
        };
      }

      // Fetch redeemable item
      const redeemableItem = await prisma.redeemableItem.findUnique({
        where: { id: redeemableItemId },
      });

      if (!redeemableItem) {
        return {
          success: false,
          error: "Item not found",
        };
      }

      if (!redeemableItem.isActive) {
        return {
          success: false,
          error: "Item is not available",
        };
      }

      // Check if user has sufficient balance
      const canAfford = await walletService.canAfford(userId, redeemableItem.requiredCredits);
      if (!canAfford) {
        const balance = await walletService.getBalance(userId);
        return {
          success: false,
          error: `Insufficient credits. You need ${redeemableItem.requiredCredits} credits but only have ${balance}.`,
        };
      }

      // Validate variant if provided
      if (selectedVariant && redeemableItem.variantOptions) {
        const variantOptions = redeemableItem.variantOptions as Record<string, any>;
        for (const [key, value] of Object.entries(selectedVariant)) {
          if (variantOptions[key] && !variantOptions[key].includes(value)) {
            return {
              success: false,
              error: `Invalid ${key}: ${value}. Available options: ${variantOptions[key].join(", ")}`,
            };
          }
        }
      }

      // Get current balance for balanceAfter calculation
      const wallet = await walletService.getWallet(userId);
      const currentBalance = wallet.balance;
      const newBalance = currentBalance - redeemableItem.requiredCredits;

      // Use database transaction for atomicity
      const result = await prisma.$transaction(async (tx) => {
        // Create redemption record
        const redemption = await tx.redemption.create({
          data: {
            userId,
            redeemableItemId,
            creditsDeducted: redeemableItem.requiredCredits,
            balanceAfter: newBalance,
            status: "PENDING",
            selectedVariant: selectedVariant || {},
          },
        });

        // Update wallet balance
        await tx.wallet.update({
          where: { userId },
          data: {
            balance: newBalance,
          },
        });

        // Create wallet transaction record
        const transaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: "REDEEMED",
            amount: redeemableItem.requiredCredits,
            balanceAfter: newBalance,
            category: "REDEMPTION",
            description: `Redeemed ${redeemableItem.name}`,
            metadata: {
              redemptionId: redemption.id,
              redeemableItemId: redeemableItemId,
            },
            redemptionId: redemption.id,
          },
        });

        // Fetch complete redemption with relations
        const completeRedemption = await tx.redemption.findUnique({
          where: { id: redemption.id },
          include: {
            redeemableItem: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        return completeRedemption;
      });

      // Send webhook asynchronously (don't block)
      webhookService
        .sendRedemptionWebhook(result, user)
        .catch((error) => {
          console.error("Failed to send redemption webhook:", error);
          // Don't throw - redemption is already successful
        });

      return {
        success: true,
        redemption: result,
      };
    } catch (error: any) {
      console.error("Error redeeming item:", error);
      return {
        success: false,
        error: error.message || "Failed to redeem item",
      };
    }
  }

  /**
   * Get user's redemption history
   */
  async getUserRedemptions(
    userId: number,
    options?: {
      limit?: number;
      offset?: number;
      status?: RedemptionStatus;
    }
  ) {
    const where: any = {
      userId,
    };

    if (options?.status) {
      where.status = options.status;
    }

    const [redemptions, total] = await Promise.all([
      prisma.redemption.findMany({
        where,
        include: {
          redeemableItem: {
            select: {
              id: true,
              name: true,
              description: true,
              imageUrl: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: options?.limit || 50,
        skip: options?.offset || 0,
      }),
      prisma.redemption.count({ where }),
    ]);

    return {
      redemptions,
      total,
    };
  }

  /**
   * Get specific redemption by ID
   */
  async getRedemptionById(userId: number, redemptionId: number) {
    const redemption = await prisma.redemption.findFirst({
      where: {
        id: redemptionId,
        userId, // Ensure user can only access their own redemptions
      },
      include: {
        redeemableItem: true,
        transaction: true,
      },
    });

    return redemption;
  }
}

export const redemptionService = new RedemptionService();

