import Stripe from "stripe";
import prisma from "../../config/prisma.js";
import { statusAssignmentService } from "../status-assignment.service.js";
import { referralService } from "../referral.service.js";
import { walletService } from "../wallet.service.js";
import {
  stripe,
  TRIAL_PERIOD_DAYS,
  generateIdempotencyKey,
  getSubscriptionPeriodStart,
  getSubscriptionPeriodEnd,
  getInvoicePaymentIntentId,
  timestampToDate,
} from "./subscription.utils.js";
import type { SubscriptionCoreService } from "./subscription-core.service.js";

/**
 * Subscription checkout service handling Stripe checkout sessions and payments:
 * - Checkout session creation
 * - Payment method updates
 * - Free plan subscription
 * - Clarity Plan setup (deprecated)
 * - Checkout session completed webhook handler
 */
export class SubscriptionCheckoutService {
  constructor(private coreService: SubscriptionCoreService) {}

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
          await stripe.subscriptions.cancel(subscription.stripeSubscriptionId, {}, {
            idempotencyKey: generateIdempotencyKey('switch-plan-cancel', userId, subscription.stripeSubscriptionId),
          });
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

      // Get or create Stripe customer with idempotency key
      let stripeCustomerId = subscription?.stripeCustomerId;

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name,
          metadata: {
            userId: userId.toString(),
          },
        }, {
          idempotencyKey: generateIdempotencyKey('create-customer', userId),
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
            }, {
              idempotencyKey: generateIdempotencyKey('recreate-customer', userId),
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
      // All paid plans now get trial period in Stripe
      const subscriptionData: any = {
        metadata: {
          userId: userId.toString(),
          planName: planName,
          subscriptionId: subscription?.id?.toString() || "0", // 0 if no subscription exists
        },
      };
      
      // Set trial period for all paid plans (not the "trial" plan itself)
      // Note: planName type doesn't include "trial", so this is always true for valid plan names
      subscriptionData.trial_period_days = TRIAL_PERIOD_DAYS;

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
          }, {
            idempotencyKey: generateIdempotencyKey('recreate-customer-payment-update', userId),
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

  /**
   * Handle checkout session completed
   * Handles both subscription checkout and setup (payment method collection) sessions
   * This is called by the webhook service
   */
  async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    try {
      console.log(`[Checkout] Handling session: ${session.id}, mode: ${session.mode}`);
      console.log(`[Checkout] Session metadata:`, session.metadata);
      
      const userId = parseInt(session.metadata?.userId || "0");
      const planName = session.metadata?.planName || "";

      if (!userId) {
        console.error(`[Checkout] Missing userId in session metadata`);
        throw new Error("Missing userId in session metadata");
      }
      
      console.log(`[Checkout] User ID: ${userId}, Plan: ${planName || 'N/A (setup mode)'}`);


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
        }, {
          idempotencyKey: generateIdempotencyKey('create-trial-subscription', userId, customerId),
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
          await this.coreService.initializeTrial(userId, customerId, stripeSubscription.id);
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
      const periodStart = timestampToDate(getSubscriptionPeriodStart(stripeSubscription)) ?? now;
      const periodEnd = timestampToDate(getSubscriptionPeriodEnd(stripeSubscription));

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

      console.log(`[Checkout] Updating subscription ${subscription.id} to plan ${targetPlan.name}`);
      
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
      
      console.log(`[Checkout] ✓ Subscription ${subscription.id} updated to plan: ${targetPlan.name}, status: ${subscriptionStatus}`);

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
            stripePaymentIntentId: getInvoicePaymentIntentId(invoice),
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
}
