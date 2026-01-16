import prisma from "../config/prisma.js";
import type { Redemption, User } from "@prisma/client";

interface WebhookPayload {
  event: string;
  timestamp: string;
  data: {
    user: {
      id: number;
      name: string;
      email: string;
      tier?: "ORIGIN_1000" | "VANGUARD_300" | null;
    };
    redemption: {
      id: number;
      itemName: string;
      creditsDeducted: number;
      balanceAfter: number;
      selectedVariant?: Record<string, any>;
      createdAt: string;
    };
  };
}

export class WebhookService {
  /**
   * Send redemption webhook to CLIQSA
   */
  async sendRedemptionWebhook(
    redemption: Redemption & {
      redeemableItem: { name: string };
      user: { id: number; name: string; email: string };
    },
    user: User & {
      subscription?: {
        subscriptionPlan: { name: string };
      } | null;
    }
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    const webhookUrl = process.env.CLIQSA_REDEMPTION_WEBHOOK_URL;
    const timeout = parseInt(process.env.CLIQSA_WEBHOOK_TIMEOUT || "10000", 10);

    if (!webhookUrl) {
      console.warn("CLIQSA_REDEMPTION_WEBHOOK_URL is not configured. Skipping webhook.");
      return {
        success: false,
        error: "Webhook URL not configured",
      };
    }

    try {
      // Get user tier
      const referralStatus = await prisma.userReferralStatus.findUnique({
        where: { userId: user.id },
        select: { earlyAccessStatus: true },
      });

      let tier: "ORIGIN_1000" | "VANGUARD_300" | null = null;
      if (referralStatus) {
        switch (referralStatus.earlyAccessStatus) {
          case "ORIGIN":
            tier = "ORIGIN_1000";
            break;
          case "VANGUARD":
            tier = "VANGUARD_300";
            break;
        }
      }

      // Construct payload
      const payload: WebhookPayload = {
        event: "credits.redemption.created",
        timestamp: new Date().toISOString(),
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            tier: tier || null,
          },
          redemption: {
            id: redemption.id,
            itemName: redemption.redeemableItem.name,
            creditsDeducted: redemption.creditsDeducted,
            balanceAfter: redemption.balanceAfter,
            selectedVariant:
              redemption.selectedVariant && typeof redemption.selectedVariant === "object"
                ? (redemption.selectedVariant as Record<string, any>)
                : undefined,
            createdAt: redemption.createdAt.toISOString(),
          },
        },
      };

      // Send webhook with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Webhook request failed with status ${response.status}`);
      }

      // Update redemption record
      await prisma.redemption.update({
        where: { id: redemption.id },
        data: {
          webhookSent: true,
          webhookSentAt: new Date(),
        },
      });

      console.log(`✅ Redemption webhook sent successfully for redemption ID: ${redemption.id}`);

      return {
        success: true,
      };
    } catch (error: any) {
      console.error("Error sending redemption webhook:", error);

      // Update redemption record with retry count
      await prisma.redemption.update({
        where: { id: redemption.id },
        data: {
          webhookRetryCount: {
            increment: 1,
          },
        },
      });

      return {
        success: false,
        error: error.message || "Failed to send webhook",
      };
    }
  }
}

export const webhookService = new WebhookService();

