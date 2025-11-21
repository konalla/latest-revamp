import Stripe from "stripe";
import prisma from "../config/prisma.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-10-29.clover",
});

export class SubscriptionService {
  /**
   * Initialize trial subscription for new user
   * This is called after payment method is set up via setupClarityPlan
   */
  async initializeTrial(userId: number, stripeCustomerId?: string, stripeSubscriptionId?: string): Promise<any> {
    try {
      // Check if user already has a subscription
      const existingSubscription = await prisma.subscription.findUnique({
        where: { userId },
        include: {
          subscriptionPlan: true,
          paymentProvider: true,
        },
      });

      if (existingSubscription) {
        return existingSubscription;
      }

      // Get trial plan
      const trialPlan = await prisma.subscriptionPlan.findUnique({
        where: { name: "trial" },
      });

      if (!trialPlan) {
        throw new Error("Trial plan not found");
      }

      // Get Stripe payment provider
      const stripeProvider = await prisma.paymentProvider.findUnique({
        where: { name: "stripe" },
      });

      if (!stripeProvider) {
        throw new Error("Stripe payment provider not found");
      }

      const now = new Date();
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + 3); // 3 days trial

      // Use upsert to handle race conditions gracefully
      const subscription = await prisma.subscription.upsert({
        where: { userId },
        update: {}, // If exists, don't update (just return it)
        create: {
          userId,
          subscriptionPlanId: trialPlan.id,
          paymentProviderId: stripeProvider.id,
          status: "TRIAL",
          trialStart: now,
          trialEnd: trialEnd,
          tasksCreatedThisPeriod: 0,
          lastTaskCountReset: now,
          stripeCustomerId: stripeCustomerId || null,
          stripeSubscriptionId: stripeSubscriptionId || null,
        },
        include: {
          subscriptionPlan: true,
          paymentProvider: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      return subscription;
    } catch (error: any) {
      console.error("Error initializing trial:", error);
      
      // If it's a unique constraint error, try to fetch the existing subscription
      if (error.code === "P2002" || error.message.includes("Unique constraint")) {
        const existingSubscription = await prisma.subscription.findUnique({
          where: { userId },
          include: {
            subscriptionPlan: true,
            paymentProvider: true,
          },
        });
        
        if (existingSubscription) {
          return existingSubscription;
        }
      }
      
      throw new Error(`Failed to initialize trial: ${error.message}`);
    }
  }

  /**
   * Setup Clarity Plan - Create Stripe customer and $0 subscription
   * This collects payment method without charging
   */
  async setupClarityPlan(userId: number): Promise<{ url: string; sessionId: string }> {
    try {
      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Check if subscription already exists
      const existingSubscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      if (existingSubscription && existingSubscription.stripeSubscriptionId) {
        throw new Error("Subscription already set up");
      }

      // Get trial plan
      const trialPlan = await prisma.subscriptionPlan.findUnique({
        where: { name: "trial" },
      });

      if (!trialPlan || !trialPlan.stripePriceId) {
        throw new Error("Clarity Plan not found or Stripe Price ID not configured");
      }

      // Get or create Stripe customer
      let stripeCustomerId: string;
      if (existingSubscription?.stripeCustomerId) {
        stripeCustomerId = existingSubscription.stripeCustomerId;
        // Verify the customer exists in Stripe
        // If it doesn't exist, create a new one
        try {
          await stripe.customers.retrieve(stripeCustomerId);
        } catch (error: any) {
          // Customer doesn't exist in Stripe, create a new one
          if (error.code === "resource_missing" || error.statusCode === 404) {
            console.warn(
              `Stripe customer ${stripeCustomerId} not found in Stripe, creating new customer`
            );
            const customer = await stripe.customers.create({
              email: user.email,
              name: user.name,
              metadata: {
                userId: userId.toString(),
              },
            });
            stripeCustomerId = customer.id;

            // Update subscription with new Stripe customer ID
            if (existingSubscription) {
              await prisma.subscription.update({
                where: { id: existingSubscription.id },
                data: { stripeCustomerId },
              });
            }
          } else {
            // Re-throw other errors
            throw error;
          }
        }
      } else {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name,
          metadata: {
            userId: userId.toString(),
          },
        });
        stripeCustomerId = customer.id;
      }

      // Create checkout session in setup mode to collect payment method
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ["card"],
        mode: "setup",
        success_url: `${process.env.FRONTEND_URL}/subscription/setup-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/subscription/setup-cancel`,
        metadata: {
          userId: userId.toString(),
          planName: "trial",
        },
        setup_intent_data: {
          metadata: {
            userId: userId.toString(),
            planName: "trial",
          },
        },
      });

      return {
        url: session.url || "",
        sessionId: session.id,
      };
    } catch (error: any) {
      console.error("Error setting up Clarity Plan:", error);
      throw new Error(`Failed to setup Clarity Plan: ${error.message}`);
    }
  }

  /**
   * Create Stripe checkout session for subscription
   */
  async createCheckoutSession(
    userId: number,
    planName: "monthly" | "yearly" | "essential_twenty" | "business_pro"
  ): Promise<{ url: string; sessionId: string }> {
    try {
      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Get or create subscription (ensure subscription exists)
      let subscription = await prisma.subscription.findUnique({
        where: { userId },
        include: {
          subscriptionPlan: true,
          user: true,
        },
      });

      // If no subscription exists, initialize trial first
      if (!subscription) {
        subscription = await this.initializeTrial(userId);
      }

      // Check if subscription is canceled but still within billing period
      // In this case, user should use resume endpoint instead of creating new checkout
      if (subscription.status === "CANCELED") {
        const now = new Date();
        if (subscription.currentPeriodEnd && now < subscription.currentPeriodEnd) {
          throw new Error(
            "Your subscription is canceled but still active within the billing period. Please use the resume endpoint to reactivate it without additional charges."
          );
        }
      }

      // Get target plan
      const targetPlan = await prisma.subscriptionPlan.findUnique({
        where: { name: planName },
      });

      if (!targetPlan || !targetPlan.stripePriceId) {
        throw new Error(`Plan ${planName} not found or Stripe Price ID not configured`);
      }

      // Get or create Stripe customer
      let stripeCustomerId = subscription.stripeCustomerId;

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name,
          metadata: {
            userId: userId.toString(),
          },
        });

        stripeCustomerId = customer.id;

        // Update subscription with Stripe customer ID
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { stripeCustomerId },
        });
      } else {
        // Verify the customer exists in Stripe
        // If it doesn't exist, create a new one
        try {
          await stripe.customers.retrieve(stripeCustomerId);
        } catch (error: any) {
          // Customer doesn't exist in Stripe, create a new one
          if (error.code === "resource_missing" || error.statusCode === 404) {
            console.warn(
              `Stripe customer ${stripeCustomerId} not found in Stripe, creating new customer`
            );
            const customer = await stripe.customers.create({
              email: user.email,
              name: user.name,
              metadata: {
                userId: userId.toString(),
              },
            });

            stripeCustomerId = customer.id;

            // Update subscription with new Stripe customer ID
            await prisma.subscription.update({
              where: { id: subscription.id },
              data: { stripeCustomerId },
            });
          } else {
            // Re-throw other errors
            throw error;
          }
        }
      }

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ["card"],
        line_items: [
          {
            price: targetPlan.stripePriceId,
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/subscription/cancel`,
        metadata: {
          userId: userId.toString(),
          planName: planName,
          subscriptionId: subscription.id.toString(),
        },
        subscription_data: {
          metadata: {
            userId: userId.toString(),
            planName: planName,
            subscriptionId: subscription.id.toString(),
          },
        },
      });

      return {
        url: session.url || "",
        sessionId: session.id,
      };
    } catch (error: any) {
      console.error("Error creating checkout session:", error);
      throw new Error(`Failed to create checkout session: ${error.message}`);
    }
  }

  /**
   * Get user's subscription details
   */
  async getUserSubscription(userId: number): Promise<any> {
    try {
      let subscription = await prisma.subscription.findUnique({
        where: { userId },
        include: {
          subscriptionPlan: true,
          paymentProvider: true,
        },
      });

      // If no subscription exists, initialize trial
      if (!subscription) {
        subscription = await this.initializeTrial(userId);
      }

      // Update subscription status based on current state
      const updatedSubscription = await this.updateSubscriptionStatus(subscription.id);

      return updatedSubscription;
    } catch (error: any) {
      console.error("Error getting user subscription:", error);
      throw new Error(`Failed to get subscription: ${error.message}`);
    }
  }

  /**
   * Update subscription status based on dates and Stripe status
   */
  async updateSubscriptionStatus(subscriptionId: number): Promise<any> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          subscriptionPlan: true,
        },
      });

      if (!subscription) {
        throw new Error("Subscription not found");
      }

      const now = new Date();
      let newStatus = subscription.status;
      let gracePeriodEnd = subscription.gracePeriodEnd;

      // If trial, check if trial ended
      if (subscription.status === "TRIAL") {
        if (subscription.trialEnd && now >= subscription.trialEnd) {
          newStatus = "EXPIRED";
        } else if (
          subscription.subscriptionPlan.maxTasks &&
          subscription.tasksCreatedThisPeriod >= subscription.subscriptionPlan.maxTasks
        ) {
          // Trial ended due to task limit
          newStatus = "EXPIRED";
        }
      }

      // If active, check if period ended
      if (subscription.status === "ACTIVE") {
        if (subscription.currentPeriodEnd && now >= subscription.currentPeriodEnd) {
          // Enter grace period
          newStatus = "GRACE_PERIOD";
          if (!gracePeriodEnd) {
            gracePeriodEnd = new Date(subscription.currentPeriodEnd);
            gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 3);
          }

          // Check if grace period ended
          if (gracePeriodEnd && now >= gracePeriodEnd) {
            newStatus = "EXPIRED";
          }
        }
      }

      // If in grace period, check if it ended
      if (subscription.status === "GRACE_PERIOD" && gracePeriodEnd) {
        if (now >= gracePeriodEnd) {
          newStatus = "EXPIRED";
        }
      }

      // If canceled, check if should be expired
      if (subscription.status === "CANCELED") {
        if (subscription.currentPeriodEnd && now >= subscription.currentPeriodEnd) {
          newStatus = "EXPIRED";
        }
      }

      // Update subscription if status changed
      if (newStatus !== subscription.status || gracePeriodEnd !== subscription.gracePeriodEnd) {
        const updated = await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: newStatus as any,
            gracePeriodEnd: gracePeriodEnd,
          },
          include: {
            subscriptionPlan: true,
          },
        });

        return updated;
      }

      return subscription;
    } catch (error: any) {
      console.error("Error updating subscription status:", error);
      throw error;
    }
  }

  /**
   * Check if user can create tasks
   */
  async canCreateTask(userId: number): Promise<{
    canCreate: boolean;
    reason?: string;
    tasksRemaining?: number;
    subscription?: any;
  }> {
    try {
      const subscription = await this.getUserSubscription(userId);

      if (!subscription) {
        return { canCreate: false, reason: "No subscription found" };
      }

      const updatedSubscription = await this.updateSubscriptionStatus(subscription.id);

      // Check if subscription is expired (no grace period)
      if (updatedSubscription.status === "EXPIRED") {
        return {
          canCreate: false,
          reason: "Subscription expired. Please renew to continue creating tasks.",
          subscription: updatedSubscription,
        };
      }

      // Check if subscription is canceled (immediate view-only mode)
      if (updatedSubscription.status === "CANCELED") {
        return {
          canCreate: false,
          reason: "Subscription canceled. Please renew to continue creating tasks.",
          subscription: updatedSubscription,
        };
      }

      // Check if in grace period (can create during grace period)
      if (updatedSubscription.status === "GRACE_PERIOD") {
        // Reset task count if needed
        await this.resetTaskCountIfNeeded(updatedSubscription.id);
        const sub = await prisma.subscription.findUnique({
          where: { id: updatedSubscription.id },
        });

        const maxTasks = updatedSubscription.subscriptionPlan.maxTasks || 0;
        const tasksRemaining = maxTasks - (sub?.tasksCreatedThisPeriod || 0);

        if (tasksRemaining <= 0) {
          return {
            canCreate: false,
            reason: "Task limit reached for this billing period.",
            tasksRemaining: 0,
            subscription: updatedSubscription,
          };
        }

        return {
          canCreate: true,
          tasksRemaining,
          subscription: updatedSubscription,
        };
      }

      // Check task limits
      await this.resetTaskCountIfNeeded(updatedSubscription.id);
      const sub = await prisma.subscription.findUnique({
        where: { id: updatedSubscription.id },
      });

      const maxTasks = updatedSubscription.subscriptionPlan.maxTasks || 0;
      const tasksRemaining = maxTasks - (sub?.tasksCreatedThisPeriod || 0);

      if (tasksRemaining <= 0) {
        return {
          canCreate: false,
          reason: "Task limit reached for this billing period.",
          tasksRemaining: 0,
          subscription: updatedSubscription,
        };
      }

      return {
        canCreate: true,
        tasksRemaining,
        subscription: updatedSubscription,
      };
    } catch (error: any) {
      console.error("Error checking task creation permission:", error);
      return { canCreate: false, reason: "Error checking subscription status" };
    }
  }

  /**
   * Increment task count when task is created
   */
  async incrementTaskCount(userId: number): Promise<void> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      if (!subscription) {
        return;
      }

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          tasksCreatedThisPeriod: {
            increment: 1,
          },
        },
      });

      // Check if trial should end due to task limit
      if (subscription.status === "TRIAL") {
        const updatedSub = await prisma.subscription.findUnique({
          where: { id: subscription.id },
          include: { subscriptionPlan: true },
        });

        if (
          updatedSub &&
          updatedSub.subscriptionPlan.maxTasks &&
          updatedSub.tasksCreatedThisPeriod >= updatedSub.subscriptionPlan.maxTasks
        ) {
          // End trial immediately
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: "EXPIRED" },
          });
        }
      }
    } catch (error: any) {
      console.error("Error incrementing task count:", error);
    }
  }

  /**
   * Reset task count if billing period changed
   */
  async resetTaskCountIfNeeded(subscriptionId: number): Promise<void> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: { subscriptionPlan: true },
      });

      if (!subscription || !subscription.currentPeriodStart) {
        return;
      }

      const now = new Date();
      const lastReset = subscription.lastTaskCountReset || subscription.currentPeriodStart;

      // Check if we need to reset based on billing interval
      let shouldReset = false;

      if (subscription.subscriptionPlan.billingInterval === "monthly") {
        // Reset if a month has passed since last reset
        const nextReset = new Date(lastReset);
        nextReset.setMonth(nextReset.getMonth() + 1);
        if (now >= nextReset) {
          shouldReset = true;
        }
      } else if (subscription.subscriptionPlan.billingInterval === "yearly") {
        // Reset if a year has passed since last reset
        const nextReset = new Date(lastReset);
        nextReset.setFullYear(nextReset.getFullYear() + 1);
        if (now >= nextReset) {
          shouldReset = true;
        }
      }

      if (shouldReset) {
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            tasksCreatedThisPeriod: 0,
            lastTaskCountReset: now,
          },
        });
      }
    } catch (error: any) {
      console.error("Error resetting task count:", error);
    }
  }

  /**
   * Check if user can add team members
   * User must have ACTIVE subscription (not trial, expired, or canceled)
   */
  async canAddTeamMembers(userId: number): Promise<{
    canAdd: boolean;
    reason?: string;
    subscription?: any;
  }> {
    try {
      const subscription = await this.getUserSubscription(userId);
      const updatedSubscription = await this.updateSubscriptionStatus(subscription.id);

      // Only allow adding team members if subscription is ACTIVE
      if (updatedSubscription.status !== "ACTIVE") {
        return {
          canAdd: false,
          reason: updatedSubscription.status === "TRIAL" 
            ? "Team members can only be added with an active subscription. Trial users cannot add team members."
            : updatedSubscription.status === "GRACE_PERIOD"
            ? "Team members can only be added with an active subscription. Please renew your subscription."
            : "Team members can only be added with an active subscription. Please subscribe to continue.",
          subscription: updatedSubscription,
        };
      }

      return {
        canAdd: true,
        subscription: updatedSubscription,
      };
    } catch (error: any) {
      console.error("Error checking team member addition permission:", error);
      return { canAdd: false, reason: "Error checking subscription status" };
    }
  }

  /**
   * Check if a user has an active subscription (not trial or expired)
   * Used to check if a user can be added to a team
   */
  async hasActiveSubscription(userId: number): Promise<{
    hasActive: boolean;
    reason?: string;
    subscription?: any;
  }> {
    try {
      const subscription = await this.getUserSubscription(userId);
      const updatedSubscription = await this.updateSubscriptionStatus(subscription.id);

      // Only ACTIVE status is considered active subscription
      if (updatedSubscription.status !== "ACTIVE") {
        return {
          hasActive: false,
          reason: updatedSubscription.status === "TRIAL"
            ? "User must have an active subscription (not trial) to be added to a team"
            : updatedSubscription.status === "EXPIRED"
            ? "User's subscription has expired. They must subscribe to join a team."
            : updatedSubscription.status === "CANCELED"
            ? "User's subscription has been canceled. They must subscribe to join a team."
            : updatedSubscription.status === "GRACE_PERIOD"
            ? "User's subscription has expired. They must renew to join a team."
            : "User must have an active subscription to join a team",
          subscription: updatedSubscription,
        };
      }

      return {
        hasActive: true,
        subscription: updatedSubscription,
      };
    } catch (error: any) {
      console.error("Error checking active subscription:", error);
      return { hasActive: false, reason: "Error checking subscription status" };
    }
  }

  /**
   * Check if user can perform write operations (create/edit/delete)
   */
  async canPerformWriteOperations(userId: number): Promise<{
    canWrite: boolean;
    reason?: string;
    subscription?: any;
  }> {
    try {
      const subscription = await this.getUserSubscription(userId);
      const updatedSubscription = await this.updateSubscriptionStatus(subscription.id);

      // If expired (after grace period), can only view
      if (updatedSubscription.status === "EXPIRED") {
        return {
          canWrite: false,
          reason: "Subscription expired. Please renew to continue using the app.",
          subscription: updatedSubscription,
        };
      }

      // If canceled, immediately enter view-only mode (per requirement)
      if (updatedSubscription.status === "CANCELED") {
        return {
          canWrite: false,
          reason: "Subscription canceled. Please renew to continue using the app.",
          subscription: updatedSubscription,
        };
      }

      // All other statuses (TRIAL, ACTIVE, GRACE_PERIOD) allow write operations
      return {
        canWrite: true,
        subscription: updatedSubscription,
      };
    } catch (error: any) {
      console.error("Error checking write permissions:", error);
      return { canWrite: false, reason: "Error checking subscription status" };
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId: number): Promise<any> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
        include: {
          subscriptionPlan: true,
        },
      });

      if (!subscription) {
        throw new Error("Subscription not found");
      }

      // If has Stripe subscription, cancel it
      if (subscription.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
            cancel_at_period_end: true,
          });
        } catch (error) {
          console.error("Error canceling Stripe subscription:", error);
          // Continue with local cancellation even if Stripe fails
        }
      }

      // Cancel immediately (user requirement)
      const updated = await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "CANCELED",
          cancelAtPeriodEnd: false,
          canceledAt: new Date(),
        },
        include: {
          subscriptionPlan: true,
        },
      });

      return updated;
    } catch (error: any) {
      console.error("Error canceling subscription:", error);
      throw new Error(`Failed to cancel subscription: ${error.message}`);
    }
  }

  /**
   * Resume canceled subscription
   */
  async resumeSubscription(userId: number): Promise<any> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
        include: {
          subscriptionPlan: true,
        },
      });

      if (!subscription) {
        throw new Error("Subscription not found");
      }

      if (subscription.status !== "CANCELED") {
        throw new Error("Subscription is not canceled");
      }

      // If has Stripe subscription, resume it
      if (subscription.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
            cancel_at_period_end: false,
          });
        } catch (error) {
          console.error("Error resuming Stripe subscription:", error);
        }
      }

      // Determine new status
      let newStatus = "ACTIVE";
      if (subscription.currentPeriodEnd && new Date() >= subscription.currentPeriodEnd) {
        // Period ended, need to renew
        throw new Error("Subscription period has ended. Please create a new subscription.");
      }

      const updated = await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: newStatus as any,
          cancelAtPeriodEnd: false,
          canceledAt: null,
        },
        include: {
          subscriptionPlan: true,
        },
      });

      return updated;
    } catch (error: any) {
      console.error("Error resuming subscription:", error);
      throw new Error(`Failed to resume subscription: ${error.message}`);
    }
  }

  /**
   * Get available subscription plans
   */
  async getAvailablePlans(): Promise<any[]> {
    try {
      const plans = await prisma.subscriptionPlan.findMany({
        where: {
          isActive: true,
          name: {
            not: "trial",
          },
        },
        orderBy: {
          price: "asc",
        },
      });

      return plans;
    } catch (error: any) {
      console.error("Error getting available plans:", error);
      throw new Error(`Failed to get plans: ${error.message}`);
    }
  }

  /**
   * Handle Stripe webhook event
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    try {
      switch (event.type) {
        case "checkout.session.completed":
          await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
          break;

        case "customer.subscription.created":
        case "customer.subscription.updated":
          await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;

        case "customer.subscription.deleted":
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case "invoice.payment_succeeded":
        case "invoice.paid": // Alternative event name
        case "invoice_payment.paid": // Another alternative event name
          await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;

        case "invoice.payment_failed":
          await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        case "invoice.payment_action_required":
          await this.handleInvoicePaymentActionRequired(event.data.object as Stripe.Invoice);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
    } catch (error: any) {
      console.error("Error handling webhook event:", error);
      throw error;
    }
  }

  /**
   * Handle checkout session completed
   * Handles both subscription checkout and setup (payment method collection) sessions
   */
  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    try {
      const userId = parseInt(session.metadata?.userId || "0");
      const planName = session.metadata?.planName || "";

      if (!userId) {
        throw new Error("Missing userId in session metadata");
      }

      // Handle setup mode (payment method collection for Clarity Plan)
      if (session.mode === "setup") {
        const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent as string);
        const customerId = session.customer as string;

        // Get or create subscription
        let subscription = await prisma.subscription.findUnique({
          where: { userId },
        });

        // Get trial plan
        const trialPlan = await prisma.subscriptionPlan.findUnique({
          where: { name: "trial" },
        });

        if (!trialPlan || !trialPlan.stripePriceId) {
          throw new Error("Clarity Plan not found or Stripe Price ID not configured");
        }

        // Create $0 subscription in Stripe with saved payment method
        const stripeSubscription = await stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: trialPlan.stripePriceId }],
          payment_behavior: "default_incomplete",
          payment_settings: {
            payment_method_types: ["card"],
            save_default_payment_method: "on_subscription",
          },
          metadata: {
            userId: userId.toString(),
            planName: "trial",
          },
        });

        // Update or create subscription
        if (subscription) {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              stripeCustomerId: customerId,
              stripeSubscriptionId: stripeSubscription.id,
            },
          });
        } else {
          // Initialize trial with Stripe IDs
          await this.initializeTrial(userId, customerId, stripeSubscription.id);
        }

        return;
      }

      // Handle subscription mode (Pro Plan purchase)
      if (!planName) {
        throw new Error("Missing planName in session metadata");
      }

      // Get subscription
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
        include: {
          subscriptionPlan: true,
        },
      });

      if (!subscription) {
        throw new Error("Subscription not found");
      }

      // Get target plan
      const targetPlan = await prisma.subscriptionPlan.findUnique({
        where: { name: planName },
      });

      if (!targetPlan) {
        throw new Error(`Plan ${planName} not found`);
      }

      // Get Stripe subscription
      const stripeSubscriptionId = session.subscription as string;
      if (!stripeSubscriptionId) {
        throw new Error("No subscription ID in session");
      }

      const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

      // Update subscription
      const now = new Date();
      // Safely handle period dates - check if they exist and are valid
      const periodStart = stripeSubscription.current_period_start
        ? new Date(stripeSubscription.current_period_start * 1000)
        : now;
      const periodEnd = stripeSubscription.current_period_end
        ? new Date(stripeSubscription.current_period_end * 1000)
        : null;

      // Validate dates before using
      const validPeriodStart = periodStart && !isNaN(periodStart.getTime()) ? periodStart : now;
      const validPeriodEnd = periodEnd && !isNaN(periodEnd.getTime()) ? periodEnd : null;

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          subscriptionPlanId: targetPlan.id,
          status: "ACTIVE",
          stripeSubscriptionId: stripeSubscriptionId,
          stripeCustomerId: stripeSubscription.customer as string,
          currentPeriodStart: validPeriodStart,
          currentPeriodEnd: validPeriodEnd,
          trialStart: subscription.status === "TRIAL" ? subscription.trialStart : null,
          trialEnd: null, // End trial when subscription starts
          tasksCreatedThisPeriod: 0, // Reset task count
          lastTaskCountReset: validPeriodStart,
          cancelAtPeriodEnd: false,
          canceledAt: null,
          // Reset payment retry tracking on successful payment
          paymentRetryCount: 0,
          lastPaymentRetryAt: null,
          paymentFailureReason: null,
        },
      });

      // Create payment record
      const invoice = await stripe.invoices.retrieve(stripeSubscription.latest_invoice as string);
      const stripeProvider = await prisma.paymentProvider.findUnique({
        where: { name: "stripe" },
      });

      if (stripeProvider) {
        await prisma.payment.create({
          data: {
            subscriptionId: subscription.id,
            paymentProviderId: stripeProvider.id,
            amount: (invoice.amount_paid || 0) / 100, // Convert from cents
            currency: invoice.currency || "usd",
            paymentType: "subscription",
            status: "succeeded",
            stripePaymentIntentId: invoice.payment_intent as string,
            stripeInvoiceId: invoice.id,
            receiptUrl: invoice.hosted_invoice_url || null,
          },
        });
      }
    } catch (error: any) {
      console.error("Error handling checkout session completed:", error);
      throw error;
    }
  }

  /**
   * Handle subscription updated
   */
  private async handleSubscriptionUpdated(stripeSubscription: Stripe.Subscription): Promise<void> {
    try {
      const userId = parseInt(stripeSubscription.metadata?.userId || "0");
      if (!userId) {
        return;
      }

      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      if (!subscription) {
        return;
      }

      // Safely handle period dates - check if they exist and are valid
      const periodStart = stripeSubscription.current_period_start
        ? new Date(stripeSubscription.current_period_start * 1000)
        : null;
      const periodEnd = stripeSubscription.current_period_end
        ? new Date(stripeSubscription.current_period_end * 1000)
        : null;

      // Validate dates before using
      const validPeriodStart = periodStart && !isNaN(periodStart.getTime()) ? periodStart : null;
      const validPeriodEnd = periodEnd && !isNaN(periodEnd.getTime()) ? periodEnd : null;

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart: validPeriodStart,
          currentPeriodEnd: validPeriodEnd,
          cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end || false,
        },
      });
    } catch (error: any) {
      console.error("Error handling subscription updated:", error);
    }
  }

  /**
   * Handle subscription deleted
   */
  private async handleSubscriptionDeleted(stripeSubscription: Stripe.Subscription): Promise<void> {
    try {
      const userId = parseInt(stripeSubscription.metadata?.userId || "0");
      if (!userId) {
        return;
      }

      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      if (!subscription) {
        return;
      }

      // Update to expired status
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "EXPIRED",
          stripeSubscriptionId: null,
        },
      });
    } catch (error: any) {
      console.error("Error handling subscription deleted:", error);
    }
  }

  /**
   * Handle invoice payment succeeded
   * Resets retry count on successful payment
   */
  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    try {
      const subscriptionId = invoice.subscription as string;
      if (!subscriptionId) {
        return;
      }

      const subscription = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
      });

      if (!subscription) {
        return;
      }

      // Safely handle period dates from invoice
      const periodStart = invoice.period_start
        ? new Date(invoice.period_start * 1000)
        : null;
      const periodEnd = invoice.period_end
        ? new Date(invoice.period_end * 1000)
        : null;

      // Validate dates before using
      const validPeriodStart = periodStart && !isNaN(periodStart.getTime()) ? periodStart : null;
      const validPeriodEnd = periodEnd && !isNaN(periodEnd.getTime()) ? periodEnd : null;

      // Update subscription status to active and reset retry tracking
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "ACTIVE",
          currentPeriodStart: validPeriodStart,
          currentPeriodEnd: validPeriodEnd,
          // Reset payment retry tracking on successful payment
          paymentRetryCount: 0,
          lastPaymentRetryAt: null,
          paymentFailureReason: null,
        },
      });

      // Create payment record
      const stripeProvider = await prisma.paymentProvider.findUnique({
        where: { name: "stripe" },
      });

      if (stripeProvider) {
        await prisma.payment.create({
          data: {
            subscriptionId: subscription.id,
            paymentProviderId: stripeProvider.id,
            amount: (invoice.amount_paid || 0) / 100,
            currency: invoice.currency || "usd",
            paymentType: "subscription",
            status: "succeeded",
            stripePaymentIntentId: invoice.payment_intent as string,
            stripeInvoiceId: invoice.id,
            receiptUrl: invoice.hosted_invoice_url || null,
          },
        });
      }
    } catch (error: any) {
      console.error("Error handling invoice payment succeeded:", error);
    }
  }

  /**
   * Handle invoice payment failed
   * Tracks retry attempts (max 3) and updates subscription status accordingly
   */
  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    try {
      const subscriptionId = invoice.subscription as string;
      if (!subscriptionId) {
        return;
      }

      const subscription = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
      });

      if (!subscription) {
        return;
      }

      // Increment retry count
      const newRetryCount = subscription.paymentRetryCount + 1;
      const failureReason = invoice.last_payment_error?.message || "Payment failed";
      const now = new Date();

      // Update subscription with retry tracking
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "PAST_DUE",
          paymentRetryCount: newRetryCount,
          lastPaymentRetryAt: now,
          paymentFailureReason: failureReason,
        },
      });

      // Create payment record for failed payment
      const stripeProvider = await prisma.paymentProvider.findUnique({
        where: { name: "stripe" },
      });

      if (stripeProvider) {
        await prisma.payment.create({
          data: {
            subscriptionId: subscription.id,
            paymentProviderId: stripeProvider.id,
            amount: (invoice.amount_due || 0) / 100,
            currency: invoice.currency || "usd",
            paymentType: "subscription",
            status: "failed",
            stripePaymentIntentId: invoice.payment_intent as string,
            stripeInvoiceId: invoice.id,
            failureReason: failureReason,
          },
        });
      }

      // Log retry attempt
      console.log(`Payment failed for subscription ${subscription.id}. Retry attempt: ${newRetryCount}/3`);
    } catch (error: any) {
      console.error("Error handling invoice payment failed:", error);
    }
  }

  /**
   * Handle invoice payment action required
   * This is triggered when payment requires user action after retries
   */
  private async handleInvoicePaymentActionRequired(invoice: Stripe.Invoice): Promise<void> {
    try {
      const subscriptionId = invoice.subscription as string;
      if (!subscriptionId) {
        return;
      }

      const subscription = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
      });

      if (!subscription) {
        return;
      }

      // If retry count >= 3, subscription requires manual payment update
      if (subscription.paymentRetryCount >= 3) {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: "PAST_DUE",
            paymentFailureReason: invoice.last_payment_error?.message || "Payment requires user action after 3 retry attempts",
          },
        });

        console.log(`Payment action required for subscription ${subscription.id} after ${subscription.paymentRetryCount} retries`);
      }
    } catch (error: any) {
      console.error("Error handling invoice payment action required:", error);
    }
  }

  /**
   * Create payment method update session
   * Allows user to update payment method after payment failures
   */
  async createPaymentMethodUpdateSession(userId: number): Promise<{ url: string; sessionId: string }> {
    try {
      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Get subscription
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      if (!subscription || !subscription.stripeCustomerId) {
        throw new Error("Subscription or Stripe customer not found");
      }

      // Verify the customer exists in Stripe
      // If it doesn't exist, create a new one
      let stripeCustomerId = subscription.stripeCustomerId;
      try {
        await stripe.customers.retrieve(stripeCustomerId);
      } catch (error: any) {
        // Customer doesn't exist in Stripe, create a new one
        if (error.code === "resource_missing" || error.statusCode === 404) {
          console.warn(
            `Stripe customer ${stripeCustomerId} not found in Stripe, creating new customer`
          );
          const customer = await stripe.customers.create({
            email: user.email,
            name: user.name,
            metadata: {
              userId: userId.toString(),
            },
          });

          stripeCustomerId = customer.id;

          // Update subscription with new Stripe customer ID
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { stripeCustomerId },
          });
        } else {
          // Re-throw other errors
          throw error;
        }
      }

      // Create checkout session in setup mode to update payment method
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ["card"],
        mode: "setup",
        success_url: `${process.env.FRONTEND_URL}/subscription/payment-update-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/subscription/payment-update-cancel`,
        metadata: {
          userId: userId.toString(),
          subscriptionId: subscription.id.toString(),
        },
        setup_intent_data: {
          metadata: {
            userId: userId.toString(),
            subscriptionId: subscription.id.toString(),
          },
        },
      });

      return {
        url: session.url || "",
        sessionId: session.id,
      };
    } catch (error: any) {
      console.error("Error creating payment method update session:", error);
      throw new Error(`Failed to create payment method update session: ${error.message}`);
    }
  }
}

export const subscriptionService = new SubscriptionService();

