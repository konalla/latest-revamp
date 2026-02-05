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

interface SignupWebhookPayload {
  // Simple format - send user data directly (default)
  name: string;
  email: string;
  phone_number?: string | null;
  username: string;
  job_title?: string | null;
  company_name?: string | null;
  company_size?: string | null;
  company_description?: string | null;
  industry?: string | null;
  bio?: string | null;
  website?: string | null;
  linkedin_url?: string | null;
  website_url?: string | null;
  timezone?: string | null;
  date_joined: string; // ISO string of created_at
  badge_eligible: "ORIGIN" | "VANGUARD" | "NONE" | null;
  origin_id?: string | null;
  vanguard_id?: string | null;
  profile_photo_url?: string | null;
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
            ...(redemption.selectedVariant && typeof redemption.selectedVariant === "object"
              ? { selectedVariant: redemption.selectedVariant as Record<string, any> }
              : {}),
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

  /**
   * Send user signup webhook to LeadConnector with full profile data
   */
  async sendSignupWebhook(
    userData: {
      // Basic info
      id: number;
      email: string;
      username: string;
      name: string;
      phone_number?: string | null;
      created_at: Date;
      
      // Job & Company info
      job_title?: string | null;
      company_name?: string | null;
      company_size?: string | null;
      company_description?: string | null;
      industry?: string | null;
      
      // Profile info
      bio?: string | null;
      website?: string | null;
      linkedin_url?: string | null;
      website_url?: string | null;
      timezone?: string | null;
      profile_photo_url?: string | null;
      
      // Badge info
      referralStatus?: {
        earlyAccessStatus: "NONE" | "ORIGIN" | "VANGUARD";
        originId?: string | null;
        vanguardId?: string | null;
      } | null;
    }
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    // Only send webhook in production environment
    const nodeEnv = process.env.NODE_ENV || "development";
    if (nodeEnv !== "production") {
      console.log(`⏭️  Skipping webhook (NODE_ENV=${nodeEnv}). Webhook only sent in production.`);
      return {
        success: false,
        error: `Webhook skipped - not in production environment (NODE_ENV=${nodeEnv})`,
      };
    }

    const webhookUrl = process.env.LEADCONNECTOR_SIGNUP_WEBHOOK_URL;
    const timeout = parseInt(process.env.LEADCONNECTOR_WEBHOOK_TIMEOUT || "10000", 10);

    if (!webhookUrl) {
      console.warn("LEADCONNECTOR_SIGNUP_WEBHOOK_URL is not configured. Skipping webhook.");
      return {
        success: false,
        error: "Webhook URL not configured",
      };
    }

    try {
      // Determine badge eligibility
      let badgeEligible: "ORIGIN" | "VANGUARD" | "NONE" | null = "NONE";
      let originId: string | null = null;
      let vanguardId: string | null = null;

      if (userData.referralStatus) {
        badgeEligible = userData.referralStatus.earlyAccessStatus;
        originId = userData.referralStatus.originId || null;
        vanguardId = userData.referralStatus.vanguardId || null;
      }

      // Construct payload with all user profile data
      const payload: SignupWebhookPayload = {
        name: userData.name,
        email: userData.email,
        username: userData.username,
        phone_number: userData.phone_number || null,
        job_title: userData.job_title || null,
        company_name: userData.company_name || null,
        company_size: userData.company_size || null,
        company_description: userData.company_description || null,
        industry: userData.industry || null,
        bio: userData.bio || null,
        website: userData.website || null,
        linkedin_url: userData.linkedin_url || null,
        website_url: userData.website_url || null,
        timezone: userData.timezone || null,
        date_joined: userData.created_at.toISOString(),
        badge_eligible: badgeEligible,
        origin_id: originId || null,
        vanguard_id: vanguardId || null,
        profile_photo_url: userData.profile_photo_url || null,
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

      // Get response body for logging
      let responseBody: any;
      try {
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          responseBody = await response.json();
        } else {
          responseBody = await response.text();
        }
      } catch (e) {
        responseBody = "Could not parse response body";
      }

      if (!response.ok) {
        const errorText = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody);
        console.error(`❌ Webhook failed for user ID ${userData.id}: Status ${response.status} - ${errorText}`);
        throw new Error(`Webhook request failed with status ${response.status}: ${errorText}`);
      }

      console.log(`✅ Signup webhook sent successfully for user ID: ${userData.id} (${userData.email})`);
      if (responseBody && typeof responseBody === "object") {
        console.log(`   Response: ${JSON.stringify(responseBody)}`);
      }

      return {
        success: true,
      };
    } catch (error: any) {
      console.error(`❌ Error sending signup webhook for user ID ${userData.id}:`, error.message || error);

      return {
        success: false,
        error: error.message || "Failed to send webhook",
      };
    }
  }
}

export const webhookService = new WebhookService();

