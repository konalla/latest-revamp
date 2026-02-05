import type { Request, Response } from "express";
import { walletService } from "../services/wallet.service.js";

/**
 * GET /api/wallet/balance
 * Get user's wallet balance
 */
export const getWalletBalance = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
        error: "UNAUTHORIZED",
      });
      return;
    }

    const wallet = await walletService.getWallet(userId);

    res.status(200).json({
      success: true,
      data: {
        balance: wallet.balance,
        totalEarned: wallet.totalEarned,
      },
    });
  } catch (error: any) {
    console.error("Error getting wallet balance:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get wallet balance",
      error: error.message,
    });
  }
};

/**
 * GET /api/wallet/transactions
 * Get user's transaction history
 */
export const getTransactionHistory = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
        error: "UNAUTHORIZED",
      });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : undefined;
    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : undefined;

    const result = await walletService.getTransactionHistory(userId, {
      limit,
      offset,
      ...(startDate !== undefined && { startDate }),
      ...(endDate !== undefined && { endDate }),
    });

    res.status(200).json({
      success: true,
      data: {
        transactions: result.transactions,
        total: result.total,
        wallet: result.wallet,
      },
    });
  } catch (error: any) {
    console.error("Error getting transaction history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get transaction history",
      error: error.message,
    });
  }
};

/**
 * GET /api/wallet/stats
 * Get wallet statistics
 */
export const getWalletStats = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
        error: "UNAUTHORIZED",
      });
      return;
    }

    const stats = await walletService.getWalletStats(userId);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error("Error getting wallet stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get wallet stats",
      error: error.message,
    });
  }
};

