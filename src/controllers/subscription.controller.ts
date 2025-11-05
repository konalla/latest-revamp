import type { Request, Response } from "express";
import { subscriptionService } from "../services/subscription.service.js";

export class SubscriptionController {
  /**
   * Get user's subscription
   */
  async getMySubscription(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const subscription = await subscriptionService.getUserSubscription(userId);

      // Calculate warnings
      const warnings = this.calculateWarnings(subscription);

      res.status(200).json({
        ...subscription,
        warnings,
      });
    } catch (error: any) {
      console.error("Error getting subscription:", error);
      res.status(500).json({ error: error.message || "Failed to get subscription" });
    }
  }

  /**
   * Create checkout session for subscription
   */
  async createCheckoutSession(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { planName } = req.body;

      if (!planName || (planName !== "monthly" && planName !== "yearly")) {
        res.status(400).json({ error: "Invalid plan name. Must be 'monthly' or 'yearly'" });
        return;
      }

      const { url, sessionId } = await subscriptionService.createCheckoutSession(
        userId,
        planName
      );

      res.status(200).json({
        checkoutUrl: url,
        sessionId,
      });
    } catch (error: any) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ error: error.message || "Failed to create checkout session" });
    }
  }

  /**
   * Get available subscription plans
   */
  async getAvailablePlans(req: Request, res: Response): Promise<void> {
    try {
      const plans = await subscriptionService.getAvailablePlans();
      res.status(200).json({ plans });
    } catch (error: any) {
      console.error("Error getting plans:", error);
      res.status(500).json({ error: error.message || "Failed to get plans" });
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const subscription = await subscriptionService.cancelSubscription(userId);

      res.status(200).json({
        message: "Subscription canceled successfully",
        subscription,
      });
    } catch (error: any) {
      console.error("Error canceling subscription:", error);
      res.status(500).json({ error: error.message || "Failed to cancel subscription" });
    }
  }

  /**
   * Resume canceled subscription
   */
  async resumeSubscription(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const subscription = await subscriptionService.resumeSubscription(userId);

      res.status(200).json({
        message: "Subscription resumed successfully",
        subscription,
      });
    } catch (error: any) {
      console.error("Error resuming subscription:", error);
      res.status(500).json({ error: error.message || "Failed to resume subscription" });
    }
  }

  /**
   * Get subscription access status
   */
  async getAccessStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const subscription = await subscriptionService.getUserSubscription(userId);
      const writeAccess = await subscriptionService.canPerformWriteOperations(userId);
      const taskAccess = await subscriptionService.canCreateTask(userId);

      res.status(200).json({
        subscription,
        writeAccess: writeAccess.canWrite,
        writeAccessReason: writeAccess.reason,
        taskAccess: taskAccess.canCreate,
        taskAccessReason: taskAccess.reason,
        tasksRemaining: taskAccess.tasksRemaining,
      });
    } catch (error: any) {
      console.error("Error getting access status:", error);
      res.status(500).json({ error: error.message || "Failed to get access status" });
    }
  }

  /**
   * Check if user can add team members
   */
  async canAddTeamMembers(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const canAdd = await subscriptionService.canAddTeamMembers(userId);

      res.status(200).json({
        canAdd: canAdd.canAdd,
        reason: canAdd.reason,
        subscription: canAdd.subscription,
      });
    } catch (error: any) {
      console.error("Error checking team member addition permission:", error);
      res.status(500).json({ error: error.message || "Failed to check team member addition permission" });
    }
  }

  /**
   * Calculate warnings for subscription
   */
  private calculateWarnings(subscription: any): {
    trialEnding?: string;
    tasksRemaining?: number;
    tasksWarning?: string;
    gracePeriod?: string;
    renewalNeeded?: string;
  } {
    const warnings: any = {};
    const now = new Date();

    // Trial ending warning
    if (subscription.status === "TRIAL" && subscription.trialEnd) {
      const trialEndDate = new Date(subscription.trialEnd);
      warnings.trialEnding = trialEndDate.toISOString();
    }

    // Task limit warnings
    if (subscription.status === "TRIAL" || subscription.status === "ACTIVE" || subscription.status === "GRACE_PERIOD") {
      const maxTasks = subscription.subscriptionPlan?.maxTasks || 0;
      const tasksCreated = subscription.tasksCreatedThisPeriod || 0;
      const tasksRemaining = maxTasks - tasksCreated;

      if (tasksRemaining > 0) {
        warnings.tasksRemaining = tasksRemaining;

        // Show warnings at specific thresholds
        if (tasksRemaining <= 10 && tasksRemaining > 5) {
          warnings.tasksWarning = `You have ${tasksRemaining} tasks remaining in your ${subscription.status === "TRIAL" ? "trial" : "billing period"}.`;
        } else if (tasksRemaining <= 5 && tasksRemaining > 0) {
          warnings.tasksWarning = `You have ${tasksRemaining} tasks remaining in your ${subscription.status === "TRIAL" ? "trial" : "billing period"}.`;
        } else if (tasksRemaining === 0) {
          warnings.tasksWarning = `You have reached your task limit for this ${subscription.status === "TRIAL" ? "trial" : "billing period"}.`;
        }
      }
    }

    // Grace period warning
    if (subscription.status === "GRACE_PERIOD" && subscription.gracePeriodEnd) {
      const graceEndDate = new Date(subscription.gracePeriodEnd);
      const daysRemaining = Math.ceil(
        (graceEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      warnings.gracePeriod = graceEndDate.toISOString();
      warnings.renewalNeeded = `Your subscription has expired. You have ${daysRemaining} days remaining in your grace period. Please renew to continue creating tasks.`;
    }

    // Renewal needed warning
    if (subscription.status === "ACTIVE" && subscription.currentPeriodEnd) {
      const periodEnd = new Date(subscription.currentPeriodEnd);
      const daysUntilRenewal = Math.ceil(
        (periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysUntilRenewal <= 7 && daysUntilRenewal > 0) {
        warnings.renewalNeeded = `Your subscription will renew in ${daysUntilRenewal} day${daysUntilRenewal === 1 ? "" : "s"}.`;
      }
    }

    return warnings;
  }
}

export const subscriptionController = new SubscriptionController();

