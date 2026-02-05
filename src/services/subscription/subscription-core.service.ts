import Stripe from "stripe";
import prisma from "../../config/prisma.js";
import { SubscriptionStatus as PrismaSubscriptionStatus } from "@prisma/client";
import {
  stripe,
  TRIAL_PERIOD_DAYS,
  GRACE_PERIOD_DAYS,
  generateIdempotencyKey,
  mapStripeStatusToLocal,
  fetchStripeSubscription,
  getSubscriptionPeriodStart,
  getSubscriptionPeriodEnd,
  timestampToDate,
} from "./subscription.utils.js";

/**
 * Core subscription service handling lifecycle operations:
 * - Trial initialization
 * - Subscription retrieval and status updates
 * - Cancel/Resume operations
 * - Stripe sync
 * - Plan management
 */
export class SubscriptionCoreService {
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
      trialEnd.setDate(trialEnd.getDate() + TRIAL_PERIOD_DAYS);

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
   * Get user's subscription with status check
   * Returns null if no subscription or user only has Clarity Plan (to force paid plan selection)
   * Optimized to make only ONE Stripe API call (passed to updateSubscriptionStatus)
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

      // Fetch Stripe subscription once and reuse it
      let stripeSubscription: Stripe.Subscription | null = null;
      
      if (subscription.stripeSubscriptionId) {
        stripeSubscription = await fetchStripeSubscription(subscription.stripeSubscriptionId);
        
        if (stripeSubscription) {
          // Safely handle period dates - check if they exist and are valid
          const periodStart = timestampToDate(getSubscriptionPeriodStart(stripeSubscription));
          const periodEnd = timestampToDate(getSubscriptionPeriodEnd(stripeSubscription));

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
                  cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end || false,
                },
                include: {
                  subscriptionPlan: true,
                  paymentProvider: true,
                },
              });
            }
          }
        } else {
          // Stripe subscription not found - log but continue
          console.warn(`Stripe subscription ${subscription.stripeSubscriptionId} not found`);
        }
      }

      // Update subscription status based on current state
      // Pass the already-fetched Stripe subscription to avoid duplicate API call
      const updatedSubscription = await this.updateSubscriptionStatus(subscription.id, stripeSubscription);

      return updatedSubscription;
    } catch (error: any) {
      console.error("Error getting user subscription:", error);
      throw new Error(`Failed to get subscription: ${error.message}`);
    }
  }

  /**
   * Update subscription status based on dates and Stripe status
   * IMPORTANT: This method syncs with Stripe before making status decisions
   * to prevent race conditions where the local status changes before webhooks arrive
   * 
   * @param subscriptionId - The subscription ID to update
   * @param prefetchedStripeSubscription - Optional pre-fetched Stripe subscription to avoid duplicate API calls
   */
  async updateSubscriptionStatus(subscriptionId: number, prefetchedStripeSubscription?: Stripe.Subscription | null): Promise<any> {
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
        // Use pre-fetched Stripe subscription if provided, otherwise fetch it
        let stripeSubscription = prefetchedStripeSubscription;
        let stripeFetchFailed = false;
        
        if (stripeSubscription === undefined) {
          // Not provided, need to fetch
          stripeSubscription = await fetchStripeSubscription(subscription.stripeSubscriptionId);
          if (!stripeSubscription) {
            stripeFetchFailed = true;
          }
        }
        
        if (stripeSubscription) {
          // Use centralized status mapping
          const statusMapping = mapStripeStatusToLocal(
            stripeSubscription.status,
            stripeSubscription.trial_end
          );
          newStatus = statusMapping.status;
          
          // Get period dates from Stripe (source of truth)
          const stripePeriodStart = timestampToDate(getSubscriptionPeriodStart(stripeSubscription));
          const stripePeriodEnd = timestampToDate(getSubscriptionPeriodEnd(stripeSubscription));

          if (stripePeriodStart && !isNaN(stripePeriodStart.getTime())) {
            updatedPeriodStart = stripePeriodStart;
          }
          if (stripePeriodEnd && !isNaN(stripePeriodEnd.getTime())) {
            updatedPeriodEnd = stripePeriodEnd;
          }
          
          console.log(`[Subscription] Synced with Stripe: ${subscription.id} - Stripe status: ${stripeSubscription.status}, Local status: ${subscription.status} -> ${newStatus}`);
        } else if (stripeFetchFailed || prefetchedStripeSubscription === null) {
          // Stripe subscription not found (either fetch failed or explicitly null)
          console.warn(`[Subscription] Stripe subscription ${subscription.stripeSubscriptionId} not found, marking as expired`);
          newStatus = "EXPIRED";
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
              gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);
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
            status: newStatus as PrismaSubscriptionStatus,
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
            await stripe.subscriptions.cancel(subscription.stripeSubscriptionId, {}, {
              idempotencyKey: generateIdempotencyKey('cancel-subscription', userId, subscription.stripeSubscriptionId),
            });
          } else {
            // Otherwise, cancel at period end
            await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
              cancel_at_period_end: true,
            }, {
              idempotencyKey: generateIdempotencyKey('cancel-at-period-end', userId, subscription.stripeSubscriptionId),
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
            
            const periodStart = timestampToDate(getSubscriptionPeriodStart(stripeSubscription)) ?? new Date();
            const periodEnd = timestampToDate(getSubscriptionPeriodEnd(stripeSubscription));

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
              }, {
                idempotencyKey: generateIdempotencyKey('resume-subscription', userId, subscription.stripeSubscriptionId),
              });

              const periodEnd = timestampToDate(getSubscriptionPeriodEnd(stripeSubscription));

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
  getPlanLimits(planName: string): { maxWorkspaces: number; maxTeamsPerWorkspace: number } {
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
}

// Export singleton instance
export const subscriptionCoreService = new SubscriptionCoreService();
