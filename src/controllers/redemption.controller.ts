import type { Request, Response } from "express";
import { redemptionService } from "../services/redemption.service.js";

/**
 * GET /api/redemption/items
 * Get available redemption items with user balance
 */
export const getAvailableItems = async (req: Request, res: Response) => {
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

    const result = await redemptionService.getAvailableItems(userId);

    res.status(200).json({
      success: true,
      data: {
        items: result.items,
        userBalance: result.userBalance,
        message: "Credits can be redeemed for exclusive IQniti gear.",
      },
    });
  } catch (error: any) {
    console.error("Error getting available items:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get available items",
      error: error.message,
    });
  }
};

/**
 * POST /api/redemption/redeem
 * Redeem an item
 */
export const redeemItem = async (req: Request, res: Response) => {
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

    const { redeemableItemId, selectedVariant } = req.body;

    // Validate input
    if (!redeemableItemId) {
      res.status(400).json({
        success: false,
        message: "Redeemable item ID is required",
        error: "VALIDATION_ERROR",
      });
      return;
    }

    const result = await redemptionService.redeemItem(
      userId,
      redeemableItemId,
      selectedVariant
    );

    if (!result.success) {
      // Determine error type
      let statusCode = 400;
      let errorCode = "REDEMPTION_ERROR";

      if (result.error?.includes("Insufficient credits")) {
        statusCode = 400;
        errorCode = "INSUFFICIENT_CREDITS";
      } else if (result.error?.includes("not found") || result.error?.includes("not available")) {
        statusCode = 404;
        errorCode = "ITEM_NOT_AVAILABLE";
      } else if (result.error?.includes("Invalid")) {
        statusCode = 400;
        errorCode = "INVALID_VARIANT";
      }

      res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: result.error,
      });
      return;
    }

    // Success response
    const redemption = result.redemption!;
    const itemName = redemption.redeemableItem.name;

    res.status(200).json({
      success: true,
      data: {
        redemption: {
          id: redemption.id,
          itemName: itemName,
          creditsDeducted: redemption.creditsDeducted,
          balanceAfter: redemption.balanceAfter,
          status: redemption.status,
          selectedVariant: redemption.selectedVariant,
          createdAt: redemption.createdAt,
        },
        message: `You've successfully claimed your ${itemName}. We'll contact you shortly to arrange delivery.`,
      },
    });
  } catch (error: any) {
    console.error("Error redeeming item:", error);
    res.status(500).json({
      success: false,
      message: "Failed to redeem item",
      error: error.message,
    });
  }
};

/**
 * GET /api/redemption/history
 * Get user's redemption history
 */
export const getUserRedemptions = async (req: Request, res: Response) => {
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
    const status = req.query.status as string | undefined;

    const result = await redemptionService.getUserRedemptions(userId, {
      limit,
      offset,
      status: status as any,
    });

    res.status(200).json({
      success: true,
      data: {
        redemptions: result.redemptions.map((redemption) => ({
          id: redemption.id,
          itemName: redemption.redeemableItem.name,
          creditsDeducted: redemption.creditsDeducted,
          status: redemption.status,
          selectedVariant: redemption.selectedVariant,
          createdAt: redemption.createdAt,
        })),
        total: result.total,
      },
    });
  } catch (error: any) {
    console.error("Error getting redemption history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get redemption history",
      error: error.message,
    });
  }
};

/**
 * GET /api/redemption/:id
 * Get specific redemption details
 */
export const getRedemptionById = async (req: Request, res: Response) => {
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

    const redemptionId = parseInt(req.params.id as string);
    if (isNaN(redemptionId)) {
      res.status(400).json({
        success: false,
        message: "Invalid redemption ID",
        error: "VALIDATION_ERROR",
      });
      return;
    }

    const redemption = await redemptionService.getRedemptionById(userId, redemptionId);

    if (!redemption) {
      res.status(404).json({
        success: false,
        message: "Redemption not found",
        error: "NOT_FOUND",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        redemption: {
          id: redemption.id,
          itemName: redemption.redeemableItem.name,
          creditsDeducted: redemption.creditsDeducted,
          balanceAfter: redemption.balanceAfter,
          status: redemption.status,
          selectedVariant: redemption.selectedVariant,
          createdAt: redemption.createdAt,
          fulfillmentNotes: redemption.fulfillmentNotes,
        },
      },
    });
  } catch (error: any) {
    console.error("Error getting redemption:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get redemption",
      error: error.message,
    });
  }
};

