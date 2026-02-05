import Stripe from "stripe";
import prisma from "../config/prisma.js";
import { statusAssignmentService } from "./status-assignment.service.js";
import { referralService } from "./referral.service.js";
import { walletService } from "./wallet.service.js";

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
      trialEnd.setDate(trialEnd.getDate() + 14); // 14 days trial

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
   * Setup Clarity Plan - DEPRECATED
   * Users should now choose a paid plan directly instead of using the Clarity Plan
   * This endpoint is kept for backward compatibility but should not be used for new users
   * @deprecated Use createCheckoutSession with a paid plan instead
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
   * Subscribe to free plan (no Stripe required)
   */
  async subscribeToFreePlan(userId: number): Promise<any> {
    try {
      // Check if user already has a subscription
      const existingSubscription = await prisma.subscription.findUnique({
        where: { userId },
        include: {
          subscriptionPlan: true,
        },
      });

      if (existingSubscription) {
        // If user already has free plan, return it
        if (existingSubscription.subscriptionPlan.name === "free") {
          return existingSubscription;
        }
        // If user has another plan, throw error
        throw new Error("You already have an active subscription. Please cancel it first before subscribing to the free plan.");
      }

      // Get free plan
      const freePlan = await prisma.subscriptionPlan.findUnique({
        where: { name: "free" },
      });

      if (!freePlan) {
        throw new Error("Free plan not found");
      }

      // Set up monthly billing period
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1); // Next month

      // Create subscription without payment provider
      const subscription = await prisma.subscription.create({
        data: {
          userId,
          subscriptionPlanId: freePlan.id,
          paymentProviderId: null, // No payment provider for free plan
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          tasksCreatedThisPeriod: 0,
          projectsCreatedThisPeriod: 0,
          objectivesCreatedThisPeriod: 0,
          keyResultsCreatedThisPeriod: 0,
          workspacesCreatedThisPeriod: 0,
          teamsCreatedThisPeriod: 0,
          lastTaskCountReset: now,
          lastCountReset: now,
        },
        include: {
          subscriptionPlan: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      // Award 5 coins to referrer if user was referred and subscribed to free plan
      try {
        const referral = await prisma.referral.findUnique({
          where: { referredId: userId },
          include: {
            referrer: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        });

        if (referral) {
          // Check if coins were already awarded for free plan subscription (to avoid duplicates)
          const wallet = await prisma.wallet.findUnique({
            where: { userId: referral.referrerId },
          });

          let alreadyAwarded = false;
          if (wallet) {
            const referralTransactions = await prisma.walletTransaction.findMany({
              where: {
                walletId: wallet.id,
                category: "REFERRAL",
              },
            });

            // Check if there's a transaction with this referralId and type "free_plan" in metadata
            for (const transaction of referralTransactions) {
              const metadata = transaction.metadata as any;
              if (metadata?.referralId === referral.id && metadata?.type === "free_plan") {
                alreadyAwarded = true;
                break;
              }
            }
          }

          if (!alreadyAwarded) {
            const referredUserDisplay =
              subscription.user.name ||
              subscription.user.email ||
              `User ${userId}`;

            const freePlanCoinAmount = 5;

            const coinResult = await walletService.awardCoins(
              referral.referrerId,
              freePlanCoinAmount,
              "REFERRAL",
              `Earned ${freePlanCoinAmount} coins from referral free plan subscription: ${referredUserDisplay}`,
              {
                referralId: referral.id,
                referredUserId: userId,
                type: "free_plan", // Mark as free plan subscription reward
              }
            );

            if (coinResult.success) {
              console.log(
                `[Wallet] Awarded ${freePlanCoinAmount} coins to user ${referral.referrerId} ` +
                `for referral free plan subscription ${referral.id}`
              );
            } else {
              console.error(
                `[Wallet] Failed to award free plan coins to user ${referral.referrerId}:`,
                coinResult.error
              );
            }
          } else {
            console.log(
              `[Wallet] Free plan coins already awarded for referral ${referral.id}, skipping`
            );
          }
        }
      } catch (coinError: any) {
        console.error("[Wallet] Error awarding coins for free plan subscription:", coinError);
        // Don't fail subscription creation if coin award fails
      }

      return subscription;
    } catch (error: any) {
      console.error("Error subscribing to free plan:", error);
      throw new Error(`Failed to subscribe to free plan: ${error.message}`);
    }
  }

  /**
   * Create Stripe checkout session for subscription
   */
  async createCheckoutSession(
    userId: number,
    planName: "monthly" | "yearly" | "essential_twenty" | "business_pro" | "focus_master" | "performance_founder"
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

      // Allow checkout if:
      // 1. No subscription exists (new user choosing first plan)
      // 2. User has Clarity Plan (trial plan) - they're switching to paid plan
      // 3. User has canceled subscription - they're resubscribing
      // 4. User has active subscription - allow switching plans (old subscription will be cancelled below)
      const canProceed = !subscription || 
                         (subscription && subscription.subscriptionPlan.name === "trial") ||
                         (subscription && subscription.status === "CANCELED") ||
                         (subscription && subscription.status === "EXPIRED") ||
                         (subscription && subscription.status === "ACTIVE"); // Allow switching from active subscription

      // Note: We allow switching from active subscriptions - the old subscription will be cancelled below
      // Only block if subscription exists and we can't proceed (shouldn't happen with the above logic)
      if (subscription && !canProceed) {
        throw new Error("Cannot proceed with checkout. Please contact support.");
      }

      // Check if subscription is canceled but still within billing period
      // In this case, user should use resume endpoint instead of creating new checkout
      // Exception: All paid plans now get 14-day trial, so allow switching
      // Note: planName type doesn't include "trial", so this check is always true for valid plan names
      const isPaidPlan = true; // All valid planName values are paid plans
      const hasClarityPlan = subscription && subscription.subscriptionPlan.name === "trial";
      
      if (subscription && !hasClarityPlan && subscription.status === "CANCELED" && !isPaidPlan) {
        const now = new Date();
        if (subscription.currentPeriodEnd && now < subscription.currentPeriodEnd) {
          throw new Error(
            "Your subscription is canceled but still active within the billing period. Please use the resume endpoint to reactivate it without additional charges."
          );
        }
      }

      // If user has an existing active paid subscription and is switching to a new paid plan,
      // cancel the old subscription immediately (all paid plans get 14-day trial)
      // This handles cases like: monthly -> yearly, yearly -> monthly, or any plan -> different plan
      if (subscription && !hasClarityPlan && isPaidPlan && subscription.status === "ACTIVE" && subscription.stripeSubscriptionId) {
        try {
          // Cancel the old Stripe subscription immediately
          await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
        } catch (error: any) {
          console.error("Error canceling old Stripe subscription:", error);
          // Continue anyway - we'll update the local subscription
        }
        
        // Update local subscription to canceled
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: "CANCELED",
            cancelAtPeriodEnd: false,
            canceledAt: new Date(),
          },
        });
      }

      // Get target plan
      const targetPlan = await prisma.subscriptionPlan.findUnique({
        where: { name: planName },
      });

      if (!targetPlan || !targetPlan.stripePriceId) {
        throw new Error(`Plan ${planName} not found or Stripe Price ID not configured`);
      }

      // Get or create Stripe customer
      let stripeCustomerId = subscription?.stripeCustomerId;

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name,
          metadata: {
            userId: userId.toString(),
          },
        });

        stripeCustomerId = customer.id;

        // Update subscription with Stripe customer ID if subscription exists
        if (subscription) {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { stripeCustomerId },
          });
        }
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

            // Update subscription with new Stripe customer ID if subscription exists
            if (subscription) {
              await prisma.subscription.update({
                where: { id: subscription.id },
                data: { stripeCustomerId },
              });
            }
          } else {
            // Re-throw other errors
            throw error;
          }
        }
      }

      // Create checkout session
      // All paid plans now get 14-day trial in Stripe
      const subscriptionData: any = {
        metadata: {
          userId: userId.toString(),
          planName: planName,
          subscriptionId: subscription?.id?.toString() || "0", // 0 if no subscription exists
        },
      };
      
      // Set 14-day trial for all paid plans (not the "trial" plan itself)
      // Note: planName type doesn't include "trial", so this is always true for valid plan names
      subscriptionData.trial_period_days = 14;

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
        allow_promotion_codes: true,
        success_url: `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/subscription/cancel`,
        metadata: {
          userId: userId.toString(),
          planName: planName,
          subscriptionId: subscription?.id?.toString() || "0", // 0 if no subscription exists
        },
        subscription_data: subscriptionData,
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

      // Users should choose a paid plan directly - no automatic Clarity Plan creation
      // Return null if no subscription exists (frontend should show plan selection)
      if (!subscription) {
        return null;
      }

      // If user has Clarity Plan (trial plan), return null to force them to choose a paid plan
      // This ensures users skip the Clarity Plan and choose a paid plan directly
      if (subscription.subscriptionPlan.name === "trial") {
        return null;
      }

      // Sync billing period with Stripe if subscription has a Stripe subscription ID
      // This ensures the billing period is always up-to-date
      if (subscription.stripeSubscriptionId) {
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
          
          // Safely handle period dates - check if they exist and are valid
          const periodStart = (stripeSubscription as any).current_period_start
            ? new Date((stripeSubscription as any).current_period_start * 1000)
            : null;
          const periodEnd = (stripeSubscription as any).current_period_end
            ? new Date((stripeSubscription as any).current_period_end * 1000)
            : null;

          // Validate dates before using
          const validPeriodStart = periodStart && !isNaN(periodStart.getTime()) ? periodStart : null;
          const validPeriodEnd = periodEnd && !isNaN(periodEnd.getTime()) ? periodEnd : null;

          // Update subscription if billing period has changed
          if (validPeriodStart && validPeriodEnd) {
            const periodChanged = 
              subscription.currentPeriodStart?.getTime() !== validPeriodStart.getTime() ||
              subscription.currentPeriodEnd?.getTime() !== validPeriodEnd.getTime();

            if (periodChanged) {
              subscription = await prisma.subscription.update({
                where: { id: subscription.id },
                data: {
                  currentPeriodStart: validPeriodStart,
                  currentPeriodEnd: validPeriodEnd,
                  cancelAtPeriodEnd: (stripeSubscription as any).cancel_at_period_end || false,
                },
                include: {
                  subscriptionPlan: true,
                  paymentProvider: true,
                },
              });
            }
          }
        } catch (stripeError: any) {
          // Log error but don't fail - continue with database values
          // This handles cases where Stripe subscription might be deleted or inaccessible
          console.warn(`Failed to sync billing period from Stripe for subscription ${subscription.stripeSubscriptionId}:`, stripeError.message);
        }
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
   * IMPORTANT: This method now syncs with Stripe before making status decisions
   * to prevent race conditions where the local status changes before webhooks arrive
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
      let updatedPeriodStart = subscription.currentPeriodStart;
      let updatedPeriodEnd = subscription.currentPeriodEnd;

      // CRITICAL: If subscription has a Stripe subscription ID, check with Stripe first
      // This prevents race conditions where we mark as EXPIRED before webhook arrives
      if (subscription.stripeSubscriptionId) {
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
          
          // Map Stripe status to our status
          const stripeStatus = stripeSubscription.status;
          
          // Get period dates from Stripe (source of truth)
          const stripePeriodStart = (stripeSubscription as any).current_period_start
            ? new Date((stripeSubscription as any).current_period_start * 1000)
            : null;
          const stripePeriodEnd = (stripeSubscription as any).current_period_end
            ? new Date((stripeSubscription as any).current_period_end * 1000)
            : null;

          if (stripePeriodStart && !isNaN(stripePeriodStart.getTime())) {
            updatedPeriodStart = stripePeriodStart;
          }
          if (stripePeriodEnd && !isNaN(stripePeriodEnd.getTime())) {
            updatedPeriodEnd = stripePeriodEnd;
          }

          // Handle Stripe subscription status
          if (stripeStatus === "active") {
            // Stripe says subscription is active - trust Stripe over local state
            // This handles the case where trial ended and payment succeeded
            newStatus = "ACTIVE";
          } else if (stripeStatus === "trialing") {
            // Still in trial period on Stripe
            newStatus = "TRIAL";
          } else if (stripeStatus === "past_due") {
            // Payment failed
            newStatus = "PAST_DUE";
          } else if (stripeStatus === "canceled") {
            // Subscription was canceled in Stripe
            newStatus = "CANCELED";
          } else if (stripeStatus === "unpaid" || stripeStatus === "incomplete_expired") {
            // Subscription expired due to non-payment
            newStatus = "EXPIRED";
          } else if (stripeStatus === "incomplete") {
            // Payment incomplete (requires action)
            newStatus = "INCOMPLETE";
          }
          
          console.log(`[Subscription] Synced with Stripe: ${subscription.id} - Stripe status: ${stripeStatus}, Local status: ${subscription.status} -> ${newStatus}`);
        } catch (stripeError: any) {
          // If Stripe subscription not found, it was likely deleted - mark as expired
          if (stripeError.code === "resource_missing" || stripeError.statusCode === 404) {
            console.warn(`[Subscription] Stripe subscription ${subscription.stripeSubscriptionId} not found, marking as expired`);
            newStatus = "EXPIRED";
          } else {
            // For other errors, log but continue with local logic
            console.warn(`[Subscription] Failed to sync with Stripe for ${subscription.stripeSubscriptionId}: ${stripeError.message}`);
            // Fall through to local logic below
          }
        }
      } else {
        // No Stripe subscription - use local logic (for free plans or legacy subscriptions)
        
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
      }

      // Update subscription if status or dates changed
      const statusChanged = newStatus !== subscription.status;
      const periodChanged = (updatedPeriodStart?.getTime() !== subscription.currentPeriodStart?.getTime()) ||
                           (updatedPeriodEnd?.getTime() !== subscription.currentPeriodEnd?.getTime());
      const gracePeriodChanged = gracePeriodEnd?.getTime() !== subscription.gracePeriodEnd?.getTime();

      if (statusChanged || periodChanged || gracePeriodChanged) {
        const updated = await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: newStatus as any,
            gracePeriodEnd: gracePeriodEnd,
            currentPeriodStart: updatedPeriodStart,
            currentPeriodEnd: updatedPeriodEnd,
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
        return { 
          canCreate: false, 
          reason: "No subscription found. Please choose a subscription plan to continue creating tasks.",
          tasksRemaining: 0
        };
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

      // Check if plan has unlimited tasks (focus_master or performance_founder)
      const planName = updatedSubscription.subscriptionPlan?.name;
      const hasUnlimitedTasks = planName === "focus_master" || planName === "performance_founder";
      
      // If unlimited tasks, skip task limit checks
      if (hasUnlimitedTasks) {
        return {
          canCreate: true,
          // tasksRemaining is optional, omit it to indicate unlimited
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
      } else if (subscription.subscriptionPlan.billingInterval === "free") {
        // For free plan, reset monthly based on subscription start date
        const lastCountReset = subscription.lastCountReset || subscription.currentPeriodStart;
        const nextReset = new Date(lastCountReset);
        nextReset.setMonth(nextReset.getMonth() + 1);
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
   * Reset all counters if billing period changed (for free plan monthly renewal)
   */
  async resetAllCountersIfNeeded(subscriptionId: number): Promise<void> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: { subscriptionPlan: true },
      });

      if (!subscription || !subscription.currentPeriodStart) {
        return;
      }

      const now = new Date();
      const lastReset = subscription.lastCountReset || subscription.currentPeriodStart;

      // Check if we need to reset based on billing interval
      let shouldReset = false;
      let newPeriodEnd: Date | null = null;

      if (subscription.subscriptionPlan.billingInterval === "free" || 
          subscription.subscriptionPlan.billingInterval === "monthly") {
        // Reset if a month has passed since last reset
        const nextReset = new Date(lastReset);
        nextReset.setMonth(nextReset.getMonth() + 1);
        if (now >= nextReset) {
          shouldReset = true;
          // Set new period end (one month from now)
          newPeriodEnd = new Date(now);
          newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
        }
      } else if (subscription.subscriptionPlan.billingInterval === "yearly") {
        // Reset if a year has passed since last reset
        const nextReset = new Date(lastReset);
        nextReset.setFullYear(nextReset.getFullYear() + 1);
        if (now >= nextReset) {
          shouldReset = true;
          // Set new period end (one year from now)
          newPeriodEnd = new Date(now);
          newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 1);
        }
      }

      if (shouldReset) {
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            tasksCreatedThisPeriod: 0,
            projectsCreatedThisPeriod: 0,
            objectivesCreatedThisPeriod: 0,
            keyResultsCreatedThisPeriod: 0,
            workspacesCreatedThisPeriod: 0,
            teamsCreatedThisPeriod: 0,
            lastTaskCountReset: now,
            lastCountReset: now,
            currentPeriodStart: now,
            currentPeriodEnd: newPeriodEnd,
          },
        });
      }
    } catch (error: any) {
      console.error("Error resetting all counters:", error);
    }
  }

  /**
   * Check if user can create projects
   */
  async canCreateProject(userId: number): Promise<{
    canCreate: boolean;
    reason?: string;
    projectsRemaining?: number;
    subscription?: any;
  }> {
    try {
      const subscription = await this.getUserSubscription(userId);
      const updatedSubscription = await this.updateSubscriptionStatus(subscription.id);
      
      // Reset counters if needed
      await this.resetAllCountersIfNeeded(updatedSubscription.id);
      const sub = await prisma.subscription.findUnique({
        where: { id: updatedSubscription.id },
      });

      if (!sub || !updatedSubscription.subscriptionPlan) {
        return { canCreate: false, reason: "No active subscription found" };
      }

      const maxProjects = updatedSubscription.subscriptionPlan.maxProjects;
      
      // If maxProjects is null, unlimited
      if (maxProjects === null) {
        return {
          canCreate: true,
          subscription: updatedSubscription,
        };
      }

      const projectsRemaining = maxProjects - (sub.projectsCreatedThisPeriod || 0);

      if (projectsRemaining <= 0) {
        return {
          canCreate: false,
          reason: "Project limit reached for this billing period.",
          projectsRemaining: 0,
          subscription: updatedSubscription,
        };
      }

      return {
        canCreate: true,
        projectsRemaining,
        subscription: updatedSubscription,
      };
    } catch (error: any) {
      console.error("Error checking project creation permission:", error);
      return { canCreate: false, reason: "Error checking subscription status" };
    }
  }

  /**
   * Check if user can create objectives
   */
  async canCreateObjective(userId: number): Promise<{
    canCreate: boolean;
    reason?: string;
    objectivesRemaining?: number;
    subscription?: any;
  }> {
    try {
      const subscription = await this.getUserSubscription(userId);
      const updatedSubscription = await this.updateSubscriptionStatus(subscription.id);
      
      // Reset counters if needed
      await this.resetAllCountersIfNeeded(updatedSubscription.id);
      const sub = await prisma.subscription.findUnique({
        where: { id: updatedSubscription.id },
      });

      if (!sub || !updatedSubscription.subscriptionPlan) {
        return { canCreate: false, reason: "No active subscription found" };
      }

      const maxObjectives = updatedSubscription.subscriptionPlan.maxObjectives;
      
      // If maxObjectives is null, unlimited
      if (maxObjectives === null) {
        return {
          canCreate: true,
          subscription: updatedSubscription,
        };
      }

      const objectivesRemaining = maxObjectives - (sub.objectivesCreatedThisPeriod || 0);

      if (objectivesRemaining <= 0) {
        return {
          canCreate: false,
          reason: "Objective limit reached for this billing period.",
          objectivesRemaining: 0,
          subscription: updatedSubscription,
        };
      }

      return {
        canCreate: true,
        objectivesRemaining,
        subscription: updatedSubscription,
      };
    } catch (error: any) {
      console.error("Error checking objective creation permission:", error);
      return { canCreate: false, reason: "Error checking subscription status" };
    }
  }

  /**
   * Check if user can create key results
   */
  async canCreateKeyResult(userId: number): Promise<{
    canCreate: boolean;
    reason?: string;
    keyResultsRemaining?: number;
    subscription?: any;
  }> {
    try {
      const subscription = await this.getUserSubscription(userId);
      const updatedSubscription = await this.updateSubscriptionStatus(subscription.id);
      
      // Reset counters if needed
      await this.resetAllCountersIfNeeded(updatedSubscription.id);
      const sub = await prisma.subscription.findUnique({
        where: { id: updatedSubscription.id },
      });

      if (!sub || !updatedSubscription.subscriptionPlan) {
        return { canCreate: false, reason: "No active subscription found" };
      }

      const maxKeyResults = updatedSubscription.subscriptionPlan.maxKeyResults;
      
      // If maxKeyResults is null, unlimited
      if (maxKeyResults === null) {
        return {
          canCreate: true,
          subscription: updatedSubscription,
        };
      }

      const keyResultsRemaining = maxKeyResults - (sub.keyResultsCreatedThisPeriod || 0);

      if (keyResultsRemaining <= 0) {
        return {
          canCreate: false,
          reason: "Key result limit reached for this billing period.",
          keyResultsRemaining: 0,
          subscription: updatedSubscription,
        };
      }

      return {
        canCreate: true,
        keyResultsRemaining,
        subscription: updatedSubscription,
      };
    } catch (error: any) {
      console.error("Error checking key result creation permission:", error);
      return { canCreate: false, reason: "Error checking subscription status" };
    }
  }

  /**
   * Increment project count when project is created
   */
  async incrementProjectCount(userId: number): Promise<void> {
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
          projectsCreatedThisPeriod: {
            increment: 1,
          },
        },
      });
    } catch (error: any) {
      console.error("Error incrementing project count:", error);
    }
  }

  /**
   * Increment objective count when objective is created
   */
  async incrementObjectiveCount(userId: number): Promise<void> {
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
          objectivesCreatedThisPeriod: {
            increment: 1,
          },
        },
      });
    } catch (error: any) {
      console.error("Error incrementing objective count:", error);
    }
  }

  /**
   * Increment key result count when key result is created
   */
  async incrementKeyResultCount(userId: number): Promise<void> {
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
          keyResultsCreatedThisPeriod: {
            increment: 1,
          },
        },
      });
    } catch (error: any) {
      console.error("Error incrementing key result count:", error);
    }
  }

  /**
   * Increment workspace count when workspace is created
   */
  async incrementWorkspaceCount(userId: number): Promise<void> {
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
          workspacesCreatedThisPeriod: {
            increment: 1,
          },
        },
      });
    } catch (error: any) {
      console.error("Error incrementing workspace count:", error);
    }
  }

  /**
   * Increment team count when team is created
   */
  async incrementTeamCount(userId: number): Promise<void> {
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
          teamsCreatedThisPeriod: {
            increment: 1,
          },
        },
      });
    } catch (error: any) {
      console.error("Error incrementing team count:", error);
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
      
      // If no subscription exists, user needs to choose a plan
      if (!subscription) {
        return {
          canAdd: false,
          reason: "No subscription found. Please choose a subscription plan to add team members.",
          subscription: null,
        };
      }
      
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
      
      // If no subscription exists, user doesn't have active subscription
      if (!subscription) {
        return {
          hasActive: false,
          reason: "No subscription found. User must subscribe to join a team.",
          subscription: null,
        };
      }
      
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
      
      // If no subscription exists, user needs to choose a plan
      if (!subscription) {
        return {
          canWrite: false,
          reason: "No subscription found. Please choose a subscription plan to continue.",
          subscription: null,
        };
      }
      
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
        throw new Error("No subscription found. Please choose a subscription plan first.");
      }

      // If user has Clarity Plan (trial plan), they should choose a paid plan instead
      if (subscription.subscriptionPlan.name === "trial") {
        throw new Error("Clarity Plan subscriptions cannot be canceled. Please choose a paid subscription plan.");
      }

      // Check if we're in 14-day trial period (all paid plans now have 14-day trial)
      const isInTrialPeriod = subscription.trialEnd && new Date() < subscription.trialEnd;
      const isPaidPlan = subscription.subscriptionPlan.name !== "trial";

      // If has Stripe subscription, cancel it
      if (subscription.stripeSubscriptionId) {
        try {
          // If in trial period for paid plans, cancel immediately in Stripe
          if (isInTrialPeriod && isPaidPlan) {
            await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
          } else {
            // Otherwise, cancel at period end
            await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
              cancel_at_period_end: true,
            });
          }
        } catch (error) {
          console.error("Error canceling Stripe subscription:", error);
          // Continue with local cancellation even if Stripe fails
        }
      }

      // Cancel immediately (user requirement)
      // If in trial period, user loses access immediately
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
   * Resume canceled or expired subscription
   * This method handles multiple scenarios:
   * 1. CANCELED subscription that's still within billing period
   * 2. EXPIRED subscription where Stripe subscription is still active (post-trial)
   * 3. TRIAL subscription that ended but Stripe payment succeeded
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
        throw new Error("No subscription found. Please choose a subscription plan first.");
      }

      // If user has Clarity Plan (trial plan), they should choose a paid plan instead
      if (subscription.subscriptionPlan.name === "trial") {
        throw new Error("Clarity Plan subscriptions cannot be resumed. Please choose a paid subscription plan.");
      }

      // Handle different statuses
      const validStatusesForResume = ["CANCELED", "EXPIRED", "TRIAL", "PAST_DUE"];
      if (!validStatusesForResume.includes(subscription.status)) {
        // If already ACTIVE, check if we need to sync with Stripe
        if (subscription.status === "ACTIVE") {
          // Already active - just return the current subscription
          return subscription;
        }
        throw new Error(`Subscription cannot be resumed from status: ${subscription.status}`);
      }

      // If has Stripe subscription, check its status first
      if (subscription.stripeSubscriptionId) {
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
          const stripeStatus = stripeSubscription.status;
          
          console.log(`[Resume] Checking Stripe subscription ${subscription.stripeSubscriptionId}: status = ${stripeStatus}`);
          
          if (stripeStatus === "active") {
            // Stripe subscription is active! This means:
            // 1. Trial ended and payment succeeded, OR
            // 2. Subscription was renewed successfully
            // Update local status to match Stripe
            
            const periodStart = (stripeSubscription as any).current_period_start
              ? new Date((stripeSubscription as any).current_period_start * 1000)
              : new Date();
            const periodEnd = (stripeSubscription as any).current_period_end
              ? new Date((stripeSubscription as any).current_period_end * 1000)
              : null;

            const updated = await prisma.subscription.update({
              where: { id: subscription.id },
              data: {
                status: "ACTIVE",
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                cancelAtPeriodEnd: false,
                canceledAt: null,
                trialEnd: null, // Clear trial end since we're now active
                // Reset payment retry tracking
                paymentRetryCount: 0,
                lastPaymentRetryAt: null,
                paymentFailureReason: null,
              },
              include: {
                subscriptionPlan: true,
              },
            });

            console.log(`[Resume] Subscription ${subscription.id} synced to ACTIVE from Stripe`);
            return updated;
          } else if (stripeStatus === "trialing") {
            // Still in trial - update local status
            const updated = await prisma.subscription.update({
              where: { id: subscription.id },
              data: {
                status: "TRIAL",
                cancelAtPeriodEnd: false,
                canceledAt: null,
              },
              include: {
                subscriptionPlan: true,
              },
            });

            return updated;
          } else if (stripeStatus === "canceled") {
            // Stripe subscription is canceled
            // Check if we can reactivate by removing cancel_at_period_end
            if (stripeSubscription.cancel_at_period_end) {
              // Can be resumed by removing cancel_at_period_end
              await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
                cancel_at_period_end: false,
              });

              const periodEnd = (stripeSubscription as any).current_period_end
                ? new Date((stripeSubscription as any).current_period_end * 1000)
                : null;

              if (periodEnd && new Date() < periodEnd) {
                // Still within billing period
                const updated = await prisma.subscription.update({
                  where: { id: subscription.id },
                  data: {
                    status: "ACTIVE",
                    cancelAtPeriodEnd: false,
                    canceledAt: null,
                  },
                  include: {
                    subscriptionPlan: true,
                  },
                });

                return updated;
              }
            }
            
            // Subscription is fully canceled - user needs to create new subscription
            throw new Error("Stripe subscription is canceled. Please create a new subscription.");
          } else if (stripeStatus === "past_due") {
            // Payment failed - update local status and provide guidance
            await prisma.subscription.update({
              where: { id: subscription.id },
              data: {
                status: "PAST_DUE",
              },
            });
            throw new Error("Your payment has failed. Please update your payment method to resume your subscription.");
          } else if (stripeStatus === "unpaid" || stripeStatus === "incomplete_expired") {
            // Subscription expired - user needs to create new subscription
            throw new Error("Subscription has expired due to non-payment. Please create a new subscription.");
          }
        } catch (stripeError: any) {
          // If Stripe subscription not found
          if (stripeError.code === "resource_missing" || stripeError.statusCode === 404) {
            console.warn(`[Resume] Stripe subscription ${subscription.stripeSubscriptionId} not found`);
            
            // Clear the invalid Stripe subscription ID and mark as expired
            await prisma.subscription.update({
              where: { id: subscription.id },
              data: {
                stripeSubscriptionId: null,
                status: "EXPIRED",
              },
            });
            
            throw new Error("Stripe subscription not found. Please create a new subscription.");
          }
          
          // Re-throw if it's our custom error message
          if (stripeError.message && !stripeError.code) {
            throw stripeError;
          }
          
          console.error("Error checking Stripe subscription:", stripeError);
          throw new Error(`Failed to check Stripe subscription: ${stripeError.message}`);
        }
      }

      // No Stripe subscription - check if this is a free plan or legacy subscription
      if (subscription.subscriptionPlan.name === "free") {
        // Free plan - just reactivate
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        const updated = await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: "ACTIVE",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: false,
            canceledAt: null,
          },
          include: {
            subscriptionPlan: true,
          },
        });

        return updated;
      }

      // Paid plan without Stripe subscription - user needs to create new subscription
      throw new Error("No active Stripe subscription found. Please create a new subscription.");
    } catch (error: any) {
      console.error("Error resuming subscription:", error);
      throw new Error(`Failed to resume subscription: ${error.message}`);
    }
  }

  /**
   * Sync subscription status with Stripe
   * Call this to force a sync with Stripe and update local status accordingly
   */
  async syncWithStripe(userId: number): Promise<any> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
        include: {
          subscriptionPlan: true,
        },
      });

      if (!subscription) {
        throw new Error("No subscription found");
      }

      if (!subscription.stripeSubscriptionId) {
        return subscription; // Nothing to sync
      }

      // Force sync by updating status
      return await this.updateSubscriptionStatus(subscription.id);
    } catch (error: any) {
      console.error("Error syncing with Stripe:", error);
      throw new Error(`Failed to sync with Stripe: ${error.message}`);
    }
  }

  /**
   * Get workspace and team limits for a subscription plan
   */
  private getPlanLimits(planName: string): { maxWorkspaces: number; maxTeamsPerWorkspace: number } {
    switch (planName) {
      case "free":
        return {
          maxWorkspaces: 1, // Only default workspace
          maxTeamsPerWorkspace: 5
        };
      case "essential_twenty":
        return {
          maxWorkspaces: 3, // 1 default + 2 additional
          maxTeamsPerWorkspace: 5
        };
      case "business_pro":
        return {
          maxWorkspaces: 5, // 1 default + 4 additional
          maxTeamsPerWorkspace: 7
        };
      case "focus_master":
        return {
          maxWorkspaces: 7, // 1 default + 6 additional
          maxTeamsPerWorkspace: 5
        };
      case "performance_founder":
        return {
          maxWorkspaces: 12, // 1 default + 11 additional
          maxTeamsPerWorkspace: 5
        };
      default:
        // For monthly, yearly, trial, or any other plan
        return {
          maxWorkspaces: 1, // Only default workspace
          maxTeamsPerWorkspace: 5
        };
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
            in: ["free", "focus_master", "performance_founder"],
          },
        },
        orderBy: {
          price: "asc",
        },
      });

      // Add workspace and team limits to each plan
      return plans.map(plan => {
        const limits = this.getPlanLimits(plan.name);
        return {
          ...plan,
          maxWorkspaces: limits.maxWorkspaces,
          maxTeamsPerWorkspace: limits.maxTeamsPerWorkspace
        };
      });
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
      console.log(`[Webhook] Processing event: ${event.type} (${event.id})`);
      
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

        case "customer.subscription.trial_will_end":
          // Trial will end in 3 days - good for notifications
          await this.handleTrialWillEnd(event.data.object as Stripe.Subscription);
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

        case "invoice.created":
          // Invoice created (happens when trial ends before payment attempt)
          console.log(`[Webhook] Invoice created: ${(event.data.object as Stripe.Invoice).id}`);
          break;

        default:
          console.log(`[Webhook] Unhandled event type: ${event.type}`);
      }
    } catch (error: any) {
      console.error("Error handling webhook event:", error);
      throw error;
    }
  }

  /**
   * Handle trial will end event (sent 3 days before trial ends)
   */
  private async handleTrialWillEnd(stripeSubscription: Stripe.Subscription): Promise<void> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: stripeSubscription.id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          subscriptionPlan: true,
        },
      });

      if (!subscription) {
        console.warn(`[Webhook] Subscription not found for trial_will_end: ${stripeSubscription.id}`);
        return;
      }

      const trialEnd = (stripeSubscription as any).trial_end
        ? new Date((stripeSubscription as any).trial_end * 1000)
        : null;

      console.log(`[Webhook] Trial will end for subscription ${subscription.id} (user: ${subscription.user.email}) at ${trialEnd?.toISOString()}`);

      // TODO: Send email notification to user about trial ending
      // This is a good place to integrate with your email service
      // Example: await emailService.sendTrialEndingNotification(subscription.user.email, trialEnd);

    } catch (error: any) {
      console.error("Error handling trial will end:", error);
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
      // DEPRECATED: This flow is deprecated. Users should choose a paid plan directly.
      // Keeping for backward compatibility with existing users who may have started this flow.
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

      // Get Stripe subscription first (needed for customer ID)
      const stripeSubscriptionId = session.subscription as string;
      if (!stripeSubscriptionId) {
        throw new Error("No subscription ID in session");
      }

      const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

      // Get target plan
      const targetPlan = await prisma.subscriptionPlan.findUnique({
        where: { name: planName },
      });

      if (!targetPlan) {
        throw new Error(`Plan ${planName} not found`);
      }

      // Get subscription (or create if doesn't exist for new users)
      let subscription = await prisma.subscription.findUnique({
        where: { userId },
        include: {
          subscriptionPlan: true,
        },
      });

      // If no subscription exists or user has Clarity Plan, create/update subscription
      const hasClarityPlan = subscription && subscription.subscriptionPlan.name === "trial";
      
      if (!subscription || hasClarityPlan) {
        const stripeProvider = await prisma.paymentProvider.findUnique({
          where: { name: "stripe" },
        });

        if (!stripeProvider) {
          throw new Error("Stripe payment provider not found");
        }

        if (!subscription) {
          // Create a new subscription record (will be updated with plan details below)
          subscription = await prisma.subscription.create({
            data: {
              userId,
              subscriptionPlanId: 1, // Temporary - will be updated below
              paymentProviderId: stripeProvider.id,
              status: "TRIAL",
              stripeCustomerId: stripeSubscription.customer as string,
              tasksCreatedThisPeriod: 0,
              lastTaskCountReset: new Date(),
            },
            include: {
              subscriptionPlan: true,
            },
          });
        } else if (hasClarityPlan) {
          // Update Clarity Plan subscription to the new paid plan
          // The plan details will be updated below
        }
      }

      // Update subscription
      const now = new Date();
      // Safely handle period dates - check if they exist and are valid
      const periodStart = (stripeSubscription as any).current_period_start
        ? new Date((stripeSubscription as any).current_period_start * 1000)
        : now;
      const periodEnd = (stripeSubscription as any).current_period_end
        ? new Date((stripeSubscription as any).current_period_end * 1000)
        : null;

      // Validate dates before using
      const validPeriodStart = periodStart && !isNaN(periodStart.getTime()) ? periodStart : now;
      const validPeriodEnd = periodEnd && !isNaN(periodEnd.getTime()) ? periodEnd : null;

      // All paid plans now get 14-day trial
      const isPaidPlan = targetPlan.name !== "trial";
      const has14DayTrial = isPaidPlan && targetPlan.trialDays === 14;
      
      // Set trial dates for all paid plans with 14-day trial
      const trialStartDate = has14DayTrial ? now : (subscription.status === "TRIAL" ? subscription.trialStart : null);
      const trialEndDate = has14DayTrial ? (() => {
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + 14);
        return endDate;
      })() : null;

      // Status is TRIAL during 14-day trial period, will be updated to ACTIVE after first payment
      const subscriptionStatus = has14DayTrial ? "TRIAL" : "ACTIVE";

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          subscriptionPlanId: targetPlan.id,
          status: subscriptionStatus, // TRIAL during 14-day trial, ACTIVE after payment
          stripeSubscriptionId: stripeSubscriptionId,
          stripeCustomerId: stripeSubscription.customer as string,
          currentPeriodStart: validPeriodStart,
          currentPeriodEnd: validPeriodEnd,
          trialStart: trialStartDate,
          trialEnd: trialEndDate, // 14 days from now for all paid plans
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

      // Check if this is user's first payment BEFORE creating the payment record
      const existingPaymentsBefore = await prisma.payment.count({
        where: {
          subscription: {
            userId: subscription.userId,
          },
          status: "succeeded",
          amount: {
            gt: 0,
          },
        },
      });

      // Check if we're in the 14-day trial period - if so, don't create payment record yet
      // The first charge will happen after the trial ends
      const updatedSubscription = await prisma.subscription.findUnique({
        where: { id: subscription.id },
        include: { subscriptionPlan: true },
      });
      
      const isInTrialPeriod = updatedSubscription?.trialEnd && new Date() < updatedSubscription.trialEnd;
      const shouldCreatePayment = stripeProvider && (invoice.amount_paid || 0) > 0 && !isInTrialPeriod;

      if (shouldCreatePayment) {
        await prisma.payment.create({
          data: {
            subscriptionId: subscription.id,
            paymentProviderId: stripeProvider.id,
            amount: (invoice.amount_paid || 0) / 100, // Convert from cents
            currency: invoice.currency || "usd",
            paymentType: "subscription",
            status: "succeeded",
            stripePaymentIntentId: (invoice as any).payment_intent as string,
            stripeInvoiceId: invoice.id,
            receiptUrl: invoice.hosted_invoice_url || null,
          },
        });
      }

      // If this is the first successful payment:
      // 1. Assign Origin 1000 status to the paying user
      // 2. Complete referral (if user was referred) - this counts toward referrer's Vanguard qualification
      // Only process if not in trial period (first charge after trial ends)
      if ((invoice.amount_paid || 0) > 0 && existingPaymentsBefore === 0 && !isInTrialPeriod) {
        console.log(`[Referral] First payment detected for user ${subscription.userId} (checkout session), processing Origin and referral completion...`);
        
        try {
          // Assign Origin status to the paying user
          await statusAssignmentService.assignOriginStatus(subscription.userId);
          
          // Complete referral if user was referred (marks referral as COMPLETED)
          // This will automatically check and update referrer's Vanguard status
          try {
            const referralResult = await referralService.completeReferralOnboarding(subscription.userId);
            if (referralResult.success) {
              console.log(`[Referral] Successfully completed referral for user ${subscription.userId}`);
              if (referralResult.referrerStatusUpdated) {
                console.log(`[Referral] Referrer status updated to: ${referralResult.newReferrerStatus}`);
              }
            }
          } catch (error: any) {
            // Log error but don't fail payment processing if referral completion fails
            // This is expected if user wasn't referred
            if (error.message?.includes("No referral found")) {
              console.log(`[Referral] User ${subscription.userId} was not referred, skipping referral completion`);
            } else {
              console.error("[Referral] Error completing referral on first payment (checkout session):", error);
            }
          }
        } catch (error: any) {
          console.error("[Referral] Error in first payment processing (checkout session):", error);
        }
      }
    } catch (error: any) {
      console.error("Error handling checkout session completed:", error);
      throw error;
    }
  }

  /**
   * Handle subscription updated
   * CRITICAL: This also handles the trial-to-active transition when trial ends
   */
  private async handleSubscriptionUpdated(stripeSubscription: Stripe.Subscription): Promise<void> {
    try {
      // First, try to find subscription by stripeSubscriptionId (most accurate)
      // This is important when switching plans - we need to match the correct subscription
      let subscription = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: stripeSubscription.id },
        include: {
          subscriptionPlan: true,
        },
      });

      // Fallback to userId lookup if not found (for backward compatibility)
      if (!subscription) {
        const userId = parseInt(stripeSubscription.metadata?.userId || "0");
        if (!userId) {
          console.warn(`[Webhook] No userId in metadata for subscription ${stripeSubscription.id}`);
          return;
        }

        subscription = await prisma.subscription.findUnique({
          where: { userId },
          include: {
            subscriptionPlan: true,
          },
        });
      }

      if (!subscription) {
        console.warn(`[Webhook] Subscription not found for Stripe subscription ${stripeSubscription.id}`);
        return;
      }

      // Verify this is the correct subscription (double-check stripeSubscriptionId matches)
      // This prevents updating the wrong subscription when switching plans
      if (subscription.stripeSubscriptionId && subscription.stripeSubscriptionId !== stripeSubscription.id) {
        console.warn(`[Webhook] Stripe subscription ID mismatch: DB has ${subscription.stripeSubscriptionId}, webhook has ${stripeSubscription.id}. Skipping update.`);
        return;
      }

      // Safely handle period dates - check if they exist and are valid
      const periodStart = (stripeSubscription as any).current_period_start
        ? new Date((stripeSubscription as any).current_period_start * 1000)
        : null;
      const periodEnd = (stripeSubscription as any).current_period_end
        ? new Date((stripeSubscription as any).current_period_end * 1000)
        : null;

      // Validate dates before using
      const validPeriodStart = periodStart && !isNaN(periodStart.getTime()) ? periodStart : null;
      const validPeriodEnd = periodEnd && !isNaN(periodEnd.getTime()) ? periodEnd : null;

      // CRITICAL: Map Stripe status to our status
      // This handles the trial-to-active transition automatically
      const stripeStatus = stripeSubscription.status;
      let newStatus = subscription.status;
      let trialEnd = subscription.trialEnd;

      console.log(`[Webhook] Subscription ${subscription.id} - Stripe status: ${stripeStatus}, Current local status: ${subscription.status}`);

      // Map Stripe status to our internal status
      switch (stripeStatus) {
        case "active":
          // IMPORTANT: When Stripe says "active", the trial has ended and payment succeeded
          // OR it's an active subscription without trial
          newStatus = "ACTIVE";
          // Clear trial end date since we're now fully active
          trialEnd = null;
          break;
        case "trialing":
          newStatus = "TRIAL";
          // Update trial end date from Stripe
          if ((stripeSubscription as any).trial_end) {
            trialEnd = new Date((stripeSubscription as any).trial_end * 1000);
          }
          break;
        case "past_due":
          newStatus = "PAST_DUE";
          break;
        case "canceled":
          newStatus = "CANCELED";
          break;
        case "unpaid":
        case "incomplete_expired":
          newStatus = "EXPIRED";
          break;
        case "incomplete":
          newStatus = "INCOMPLETE";
          break;
        default:
          // Keep current status for unknown Stripe statuses
          console.warn(`[Webhook] Unknown Stripe status: ${stripeStatus}`);
      }

      // Check if status is changing from TRIAL to ACTIVE (trial ended, payment succeeded)
      const isTrialToActive = subscription.status === "TRIAL" && newStatus === "ACTIVE";
      if (isTrialToActive) {
        console.log(`[Webhook] Trial-to-Active transition for subscription ${subscription.id}`);
      }

      // Prepare update data
      const updateData: any = {
        currentPeriodStart: validPeriodStart,
        currentPeriodEnd: validPeriodEnd,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end || false,
        status: newStatus as any,
      };

      // Update trial end if changed
      if (trialEnd !== subscription.trialEnd) {
        updateData.trialEnd = trialEnd;
      }

      // If transitioning from trial to active, reset counters for the new billing period
      if (isTrialToActive) {
        updateData.tasksCreatedThisPeriod = 0;
        updateData.projectsCreatedThisPeriod = 0;
        updateData.objectivesCreatedThisPeriod = 0;
        updateData.keyResultsCreatedThisPeriod = 0;
        updateData.workspacesCreatedThisPeriod = 0;
        updateData.teamsCreatedThisPeriod = 0;
        updateData.lastTaskCountReset = validPeriodStart || new Date();
        updateData.lastCountReset = validPeriodStart || new Date();
        // Clear payment failure tracking
        updateData.paymentRetryCount = 0;
        updateData.lastPaymentRetryAt = null;
        updateData.paymentFailureReason = null;
      }

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: updateData,
      });

      console.log(`[Webhook] Updated subscription ${subscription.id}: ${subscription.status} -> ${newStatus}`);
    } catch (error: any) {
      console.error("Error handling subscription updated:", error);
    }
  }

  /**
   * Handle subscription deleted
   */
  private async handleSubscriptionDeleted(stripeSubscription: Stripe.Subscription): Promise<void> {
    try {
      // First, try to find subscription by stripeSubscriptionId (most accurate)
      // This is critical when switching plans - we must match the OLD subscription being deleted,
      // not the NEW one that was just created
      let subscription = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: stripeSubscription.id },
      });

      // Fallback to userId lookup if not found (for backward compatibility)
      if (!subscription) {
        const userId = parseInt(stripeSubscription.metadata?.userId || "0");
        if (!userId) {
          return;
        }

        subscription = await prisma.subscription.findUnique({
          where: { userId },
        });
      }

      if (!subscription) {
        console.warn(`Subscription not found for deleted Stripe subscription ${stripeSubscription.id}`);
        return;
      }

      // CRITICAL: Only update if this is the subscription that was actually deleted
      // When switching plans, the old subscription is deleted but the new one is active
      // We must NOT mark the new subscription as expired!
      if (subscription.stripeSubscriptionId && subscription.stripeSubscriptionId !== stripeSubscription.id) {
        console.log(`Ignoring deletion event for ${stripeSubscription.id} - subscription ${subscription.id} has different stripeSubscriptionId ${subscription.stripeSubscriptionId} (likely a plan switch)`);
        return;
      }

      // Only mark as expired if subscription is currently canceled or inactive
      // If it's already been replaced by a new subscription, don't update it
      if (subscription.status === "CANCELED" || subscription.status === "ACTIVE") {
        // Update to expired status only if this is the subscription that was deleted
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: "EXPIRED",
            stripeSubscriptionId: null,
          },
        });
      }
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
      const subscriptionId = (invoice as any).subscription as string;
      if (!subscriptionId) {
        return;
      }

      const subscription = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
        include: { subscriptionPlan: true },
      });

      if (!subscription) {
        return;
      }

      // Safely handle period dates from invoice
      const periodStart = (invoice as any).period_start
        ? new Date((invoice as any).period_start * 1000)
        : null;
      let periodEnd = (invoice as any).period_end
        ? new Date((invoice as any).period_end * 1000)
        : null;

      // Validate dates before using
      const validPeriodStart = periodStart && !isNaN(periodStart.getTime()) ? periodStart : null;
      const validPeriodEnd = periodEnd && !isNaN(periodEnd.getTime()) ? periodEnd : null;

      // Check if this is a new billing period (auto-renewal)
      // If period start has changed, reset all counters for the new period
      const isNewBillingPeriod = validPeriodStart && subscription.currentPeriodStart && 
        validPeriodStart.getTime() !== subscription.currentPeriodStart.getTime();
      
      const now = new Date();
      const updateData: any = {
        status: "ACTIVE",
        currentPeriodStart: validPeriodStart,
        currentPeriodEnd: validPeriodEnd,
        // Reset payment retry tracking on successful payment
        paymentRetryCount: 0,
        lastPaymentRetryAt: null,
        paymentFailureReason: null,
      };

      // Reset all counters if this is a new billing period (auto-renewal)
      if (isNewBillingPeriod) {
        updateData.tasksCreatedThisPeriod = 0;
        updateData.projectsCreatedThisPeriod = 0;
        updateData.objectivesCreatedThisPeriod = 0;
        updateData.keyResultsCreatedThisPeriod = 0;
        updateData.workspacesCreatedThisPeriod = 0;
        updateData.teamsCreatedThisPeriod = 0;
        updateData.lastTaskCountReset = validPeriodStart || now;
        updateData.lastCountReset = validPeriodStart || now;
        
        console.log(`[Auto-Renewal] Reset all counters for subscription ${subscription.id} - new billing period started`);
      }

      // Update subscription status to active and reset retry tracking
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: updateData,
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
            stripePaymentIntentId: (invoice as any).payment_intent as string,
            stripeInvoiceId: invoice.id,
            receiptUrl: invoice.hosted_invoice_url || null,
          },
        });
      }

      // Check if this is user's first payment and assign Origin 1000 status if eligible
      // Only check if invoice amount > 0 (not a $0 trial payment)
      if ((invoice.amount_paid || 0) > 0) {
        try {
          // Check if user already has a successful payment (BEFORE creating the current one)
          // We need to check BEFORE creating the payment to see if this is truly the first
          const existingPaymentsBefore = await prisma.payment.count({
            where: {
              subscription: {
                userId: subscription.userId,
              },
              status: "succeeded",
              amount: {
                gt: 0,
              },
            },
          });

          // If this is the first successful payment (count was 0 before creating this one):
          // 1. Assign Origin 1000 status to the paying user
          // 2. Complete referral (if user was referred) - this counts toward referrer's Vanguard qualification
          if (existingPaymentsBefore === 0) {
            console.log(`[Referral] First payment detected for user ${subscription.userId}, processing Origin and referral completion...`);
            
            // Assign Origin status to the paying user
            await statusAssignmentService.assignOriginStatus(subscription.userId);
            
            // Complete referral if user was referred (marks referral as COMPLETED)
            // This will automatically check and update referrer's Vanguard status
            try {
              const referralResult = await referralService.completeReferralOnboarding(subscription.userId);
              if (referralResult.success) {
                console.log(`[Referral] Successfully completed referral for user ${subscription.userId}`);
                if (referralResult.referrerStatusUpdated) {
                  console.log(`[Referral] Referrer status updated to: ${referralResult.newReferrerStatus}`);
                }
              }
            } catch (error: any) {
              // Log error but don't fail payment processing if referral completion fails
              // This is expected if user wasn't referred
              if (error.message?.includes("No referral found")) {
                console.log(`[Referral] User ${subscription.userId} was not referred, skipping referral completion`);
              } else {
                console.error("[Referral] Error completing referral on first payment:", error);
              }
            }
          } else {
            console.log(`[Referral] User ${subscription.userId} already has ${existingPaymentsBefore} payment(s), skipping first payment logic`);
          }
        } catch (error: any) {
          // Log error but don't fail payment processing if Origin assignment or referral completion fails
          console.error("[Referral] Error in first payment processing:", error);
        }
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
      const subscriptionId = (invoice as any).subscription as string;
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
      const failureReason = (invoice as any).last_payment_error?.message || "Payment failed";
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
            stripePaymentIntentId: (invoice as any).payment_intent as string,
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
      const subscriptionId = (invoice as any).subscription as string;
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
            paymentFailureReason: (invoice as any).last_payment_error?.message || "Payment requires user action after 3 retry attempts",
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
        include: {
          subscriptionPlan: true,
        },
      });

      if (!subscription) {
        throw new Error("No subscription found. Please choose a subscription plan first.");
      }

      // If user has Clarity Plan (trial plan), they should choose a paid plan instead
      if (subscription.subscriptionPlan.name === "trial") {
        throw new Error("Clarity Plan subscriptions cannot update payment method. Please choose a paid subscription plan.");
      }

      if (!subscription.stripeCustomerId) {
        throw new Error("Stripe customer not found. Please complete a subscription checkout first.");
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

