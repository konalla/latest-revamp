import prisma from "../config/prisma.js";

export interface AwardCoinsMetadata {
  referralId?: number;
  referredUserId?: number;
  [key: string]: any;
}

export class WalletService {
  /**
   * Get or create wallet for a user
   */
  async getOrCreateWallet(userId: number) {
    let wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          userId,
          balance: 0,
          totalEarned: 0,
        },
      });
    }

    return wallet;
  }

  /**
   * Get user's wallet with balance
   */
  async getWallet(userId: number) {
    return await this.getOrCreateWallet(userId);
  }

  /**
   * Get current wallet balance
   */
  async getBalance(userId: number): Promise<number> {
    const wallet = await this.getOrCreateWallet(userId);
    return wallet.balance;
  }

  /**
   * Get total coins earned (lifetime)
   */
  async getTotalEarned(userId: number): Promise<number> {
    const wallet = await this.getOrCreateWallet(userId);
    return wallet.totalEarned;
  }

  /**
   * Award coins to a user
   * This is the main method for adding coins to a wallet
   */
  async awardCoins(
    userId: number,
    amount: number,
    category: "REFERRAL",
    description: string,
    metadata?: AwardCoinsMetadata
  ): Promise<{
    success: boolean;
    newBalance: number;
    transactionId?: number;
    error?: string;
  }> {
    try {
      if (amount <= 0) {
        return {
          success: false,
          newBalance: 0,
          error: "Coin amount must be positive",
        };
      }

      // Get or create wallet
      const wallet = await this.getOrCreateWallet(userId);

      // Calculate new balance
      const newBalance = wallet.balance + amount;
      const newTotalEarned = wallet.totalEarned + amount;

      // Update wallet balance
      const updatedWallet = await prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: newBalance,
          totalEarned: newTotalEarned,
        },
      });

      // Create transaction record
      const transaction = await prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "EARNED",
          amount: amount,
          balanceAfter: newBalance,
          category: category,
          description: description,
          metadata: metadata || {},
        },
      });

      return {
        success: true,
        newBalance: updatedWallet.balance,
        transactionId: transaction.id,
      };
    } catch (error: any) {
      console.error("Error awarding coins:", error);
      return {
        success: false,
        newBalance: 0,
        error: error.message || "Failed to award coins",
      };
    }
  }

  /**
   * Get transaction history for a user
   */
  async getTransactionHistory(
    userId: number,
    options?: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    }
  ) {
    const wallet = await this.getOrCreateWallet(userId);

    const where: any = {
      walletId: wallet.id,
    };

    if (options?.startDate || options?.endDate) {
      where.createdAt = {};
      if (options.startDate) {
        where.createdAt.gte = options.startDate;
      }
      if (options.endDate) {
        where.createdAt.lte = options.endDate;
      }
    }

    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: options?.limit || 50,
        skip: options?.offset || 0,
      }),
      prisma.walletTransaction.count({ where }),
    ]);

    return {
      transactions,
      total,
      wallet: {
        balance: wallet.balance,
        totalEarned: wallet.totalEarned,
      },
    };
  }

  /**
   * Get wallet statistics
   */
  async getWalletStats(userId: number) {
    const wallet = await this.getOrCreateWallet(userId);

    const [totalTransactions, referralTransactions] = await Promise.all([
      prisma.walletTransaction.count({
        where: { walletId: wallet.id },
      }),
      prisma.walletTransaction.count({
        where: {
          walletId: wallet.id,
          category: "REFERRAL",
        },
      }),
    ]);

    return {
      balance: wallet.balance,
      totalEarned: wallet.totalEarned,
      totalTransactions,
      referralTransactions,
    };
  }
}

export const walletService = new WalletService();

