import Stripe from "stripe";
import prisma from "../../config/prisma.js";
import { statusAssignmentService } from "../status-assignment.service.js";
import { referralService } from "../referral.service.js";
import {
  stripe,
  generateIdempotencyKey,
  fetchStripeSubscription,
  getSubscriptionPeriodStart,
  getSubscriptionPeriodEnd,
  getInvoiceSubscriptionId,
  getInvoicePaymentIntentId,
  getInvoicePaymentErrorMessage,
  timestampToDate,
} from "./subscription.utils.js";
import type { SubscriptionCheckoutService } from "./subscription-checkout.service.js";

/**
 * Subscription webhook service handling all Stripe webhook events:
 * - Subscription lifecycle events (created, updated, deleted, trial_will_end)
 * - Invoice events (payment_succeeded, payment_failed, payment_action_required)
 * - Setup intent events (succeeded)
 * - Payment method events (attached)
 */
export class SubscriptionWebhookService {
  private checkoutService: SubscriptionCheckoutService | null = null;

  /**
   * Set the checkout service (to avoid circular dependency)
   */
  setCheckoutService(checkoutService: SubscriptionCheckoutService): void {
    this.checkoutService = checkoutService;
  }

  /**
   * Handle Stripe webhook event
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    try {
      console.log(`[Webhook] Processing event: ${event.type} (${event.id})`);
      
      switch (event.type) {
        case "checkout.session.completed":
          if (!this.checkoutService) {
            throw new Error("Checkout service not initialized");
          }
          console.log(`[Checkout] Processing checkout session: ${(event.data.object as Stripe.Checkout.Session).id}`);
          await this.checkoutService.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
          console.log(`[Checkout] Checkout session processed successfully`);
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

        case "setup_intent.succeeded":
          // Payment method setup completed (used for payment method updates)
          await this.handleSetupIntentSucceeded(event.data.object as Stripe.SetupIntent);
          break;

        case "payment_method.attached":
          // Payment method attached to customer - useful for logging
          console.log(`[Webhook] Payment method attached: ${(event.data.object as Stripe.PaymentMethod).id}`);
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

      const trialEnd = stripeSubscription.trial_end
        ? new Date(stripeSubscription.trial_end * 1000)
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
   * Handle setup intent succeeded - payment method update
   * This is triggered when a user updates their payment method via checkout session
   */
  private async handleSetupIntentSucceeded(setupIntent: Stripe.SetupIntent): Promise<void> {
    try {
      const userId = parseInt(setupIntent.metadata?.userId || "0");
      const subscriptionIdStr = setupIntent.metadata?.subscriptionId;
      
      if (!userId) {
        console.log("[Webhook] SetupIntent has no userId metadata, skipping");
        return;
      }

      console.log(`[Webhook] Setup intent succeeded for user ${userId}`);

      // Get the payment method that was set up
      const paymentMethodId = setupIntent.payment_method as string;
      if (!paymentMethodId) {
        console.warn("[Webhook] No payment method in setup intent");
        return;
      }

      // Find the subscription
      let subscription;
      if (subscriptionIdStr) {
        subscription = await prisma.subscription.findUnique({
          where: { id: parseInt(subscriptionIdStr) },
          include: { subscriptionPlan: true },
        });
      } else {
        subscription = await prisma.subscription.findUnique({
          where: { userId },
          include: { subscriptionPlan: true },
        });
      }

      if (!subscription) {
        console.warn(`[Webhook] No subscription found for setup intent user ${userId}`);
        return;
      }

      // If subscription has a Stripe subscription, update the default payment method
      if (subscription.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
            default_payment_method: paymentMethodId,
          }, {
            idempotencyKey: generateIdempotencyKey('update-payment-method', userId, paymentMethodId),
          });
          
          console.log(`[Webhook] Updated default payment method for subscription ${subscription.stripeSubscriptionId}`);

          // If subscription was PAST_DUE due to payment failure, try to pay the outstanding invoice
          if (subscription.status === "PAST_DUE") {
            try {
              const stripeSubscription = await fetchStripeSubscription(subscription.stripeSubscriptionId);
              if (stripeSubscription && stripeSubscription.latest_invoice) {
                const invoiceId = typeof stripeSubscription.latest_invoice === 'string' 
                  ? stripeSubscription.latest_invoice 
                  : stripeSubscription.latest_invoice.id;
                
                // Attempt to pay the invoice with the new payment method
                await stripe.invoices.pay(invoiceId, {
                  payment_method: paymentMethodId,
                });
                
                console.log(`[Webhook] Successfully paid outstanding invoice ${invoiceId} with new payment method`);
              }
            } catch (payError: any) {
              // Invoice payment might fail for various reasons - log but don't fail the webhook
              console.warn(`[Webhook] Could not pay outstanding invoice: ${payError.message}`);
            }
          }
        } catch (error: any) {
          console.error(`[Webhook] Error updating subscription payment method:`, error);
        }
      }

      // Also update the customer's default payment method
      if (subscription.stripeCustomerId) {
        try {
          await stripe.customers.update(subscription.stripeCustomerId, {
            invoice_settings: {
              default_payment_method: paymentMethodId,
            },
          });
          
          console.log(`[Webhook] Updated customer ${subscription.stripeCustomerId} default payment method`);
        } catch (error: any) {
          console.error(`[Webhook] Error updating customer payment method:`, error);
        }
      }

    } catch (error: any) {
      console.error("Error handling setup intent succeeded:", error);
    }
  }

  /**
   * Handle subscription updated event
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
      const periodStart = timestampToDate(getSubscriptionPeriodStart(stripeSubscription));
      const periodEnd = timestampToDate(getSubscriptionPeriodEnd(stripeSubscription));

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
          if (stripeSubscription.trial_end) {
            trialEnd = new Date(stripeSubscription.trial_end * 1000);
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

      // Prepare update data - using Record type for flexibility with conditional fields
      const updateData: Record<string, Date | boolean | string | number | null> = {
        currentPeriodStart: validPeriodStart,
        currentPeriodEnd: validPeriodEnd,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end || false,
        status: newStatus,
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

      // Redundant badge assignment on trial-to-active transition.
      // The primary path is handleInvoicePaymentSucceeded, but if that webhook
      // fails or is never delivered, this ensures the user still gets their badge.
      if (isTrialToActive) {
        try {
          const existingBadge = await prisma.userReferralStatus.findUnique({
            where: { userId: subscription.userId },
            select: { earlyAccessStatus: true },
          });

          if (!existingBadge || existingBadge.earlyAccessStatus === "NONE") {
            console.log(`[Webhook] Trial-to-Active: Assigning Origin badge to user ${subscription.userId} as backup...`);
            const result = await statusAssignmentService.assignOriginStatus(subscription.userId);
            if (result.success) {
              console.log(`[Webhook] Origin badge assigned to user ${subscription.userId}: ${result.message}`);
            }

            // Also complete referral if user was referred
            try {
              const referralResult = await referralService.completeReferralOnboarding(subscription.userId);
              if (referralResult.success) {
                console.log(`[Webhook] Referral completed for user ${subscription.userId} on trial-to-active`);
              }
            } catch (refError: any) {
              if (!refError.message?.includes("No referral found")) {
                console.error("[Webhook] Error completing referral on trial-to-active:", refError);
              }
            }
          }
        } catch (badgeError: any) {
          console.error("[Webhook] Error assigning badge on trial-to-active:", badgeError);
        }
      }
    } catch (error: any) {
      console.error("Error handling subscription updated:", error);
    }
  }

  /**
   * Handle subscription deleted
   * Subscriptions are deleted by Stripe when:
   * 1. User explicitly cancels (and period ends)
   * 2. Payment fails after all retry attempts
   * 3. Plan switch (old subscription deleted, new one created)
   * 4. Admin action in Stripe Dashboard
   */
  private async handleSubscriptionDeleted(stripeSubscription: Stripe.Subscription): Promise<void> {
    try {
      console.log(`[Webhook] Processing subscription deletion: ${stripeSubscription.id}`);
      
      // First, try to find subscription by stripeSubscriptionId (most accurate)
      // This is critical when switching plans - we must match the OLD subscription being deleted
      let subscription = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: stripeSubscription.id },
        include: { subscriptionPlan: true },
      });

      // Fallback to userId lookup if not found (for backward compatibility)
      if (!subscription) {
        const userId = parseInt(stripeSubscription.metadata?.userId || "0");
        if (!userId) {
          console.log(`[Webhook] No userId in metadata for deleted subscription ${stripeSubscription.id}`);
          return;
        }

        subscription = await prisma.subscription.findUnique({
          where: { userId },
          include: { subscriptionPlan: true },
        });
      }

      if (!subscription) {
        console.warn(`[Webhook] Subscription not found for deleted Stripe subscription ${stripeSubscription.id}`);
        return;
      }

      // CRITICAL: Only update if this is the subscription that was actually deleted
      // When switching plans, the old subscription is deleted but the new one is active
      if (subscription.stripeSubscriptionId && subscription.stripeSubscriptionId !== stripeSubscription.id) {
        console.log(`[Webhook] Ignoring deletion for ${stripeSubscription.id} - local subscription ${subscription.id} has different stripeSubscriptionId ${subscription.stripeSubscriptionId} (likely a plan switch)`);
        return;
      }

      // Determine the reason for deletion and appropriate final status
      const cancellationDetails = stripeSubscription.cancellation_details;
      const wasPaymentFailure = cancellationDetails?.reason === 'payment_failed';
      const wasUserCanceled = cancellationDetails?.reason === 'cancellation_requested';
      
      // Determine final status based on reason
      // CANCELED: User-initiated cancellation
      // EXPIRED: Non-payment related termination (subscription ended naturally or payment failure)
      let finalStatus: "CANCELED" | "EXPIRED";
      if (wasUserCanceled && subscription.status === "CANCELED") {
        // Already marked as canceled when user initiated, keep it
        finalStatus = "CANCELED";
      } else if (wasPaymentFailure) {
        // Payment failed - mark as expired
        finalStatus = "EXPIRED";
      } else {
        // Default to expired for other deletion reasons
        finalStatus = "EXPIRED";
      }

      // Only update if the subscription needs updating
      // Skip if already in the target status to avoid unnecessary writes
      if (subscription.status !== finalStatus || subscription.stripeSubscriptionId) {
        const updateData: any = {
          status: finalStatus,
          stripeSubscriptionId: null, // Clear the Stripe subscription ID since it's deleted
          cancelAtPeriodEnd: false,
        };

        // Set canceledAt if not already set
        if (!subscription.canceledAt) {
          updateData.canceledAt = new Date();
        }

        // If payment failure, record it
        if (wasPaymentFailure) {
          updateData.paymentFailureReason = "Subscription deleted due to payment failure";
        }

        await prisma.subscription.update({
          where: { id: subscription.id },
          data: updateData,
        });

        console.log(`[Webhook] Subscription ${subscription.id} marked as ${finalStatus} (reason: ${cancellationDetails?.reason || 'unknown'})`);
      } else {
        console.log(`[Webhook] Subscription ${subscription.id} already in status ${finalStatus}, no update needed`);
      }
    } catch (error: any) {
      console.error("[Webhook] Error handling subscription deleted:", error);
    }
  }

  /**
   * Handle invoice payment succeeded
   * - Uses subscription period dates (source of truth) instead of invoice dates
   * - Prevents duplicate payment records using stripeInvoiceId check
   * - Properly detects first payment before creating record
   */
  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    try {
      const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);
      if (!stripeSubscriptionId) {
        console.log("[Invoice] No subscription ID in invoice, skipping");
        return;
      }

      const subscription = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: stripeSubscriptionId },
        include: { subscriptionPlan: true },
      });

      if (!subscription) {
        console.warn(`[Invoice] No local subscription found for Stripe subscription ${stripeSubscriptionId}`);
        return;
      }

      // CRITICAL: Check for duplicate invoice processing FIRST
      // This prevents duplicate payment records from webhook retries
      if (invoice.id) {
        const existingPayment = await prisma.payment.findFirst({
          where: { stripeInvoiceId: invoice.id },
        });
        
        if (existingPayment) {
          console.log(`[Invoice] Payment for invoice ${invoice.id} already processed, skipping duplicate`);
          return;
        }
      }

      // Fetch the current Stripe subscription for authoritative period dates
      // Invoice period dates can be unreliable - subscription is the source of truth
      const stripeSubscription = await fetchStripeSubscription(stripeSubscriptionId);
      
      let validPeriodStart: Date | null = null;
      let validPeriodEnd: Date | null = null;
      
      if (stripeSubscription) {
        const periodStart = timestampToDate(getSubscriptionPeriodStart(stripeSubscription));
        const periodEnd = timestampToDate(getSubscriptionPeriodEnd(stripeSubscription));

        validPeriodStart = periodStart && !isNaN(periodStart.getTime()) ? periodStart : null;
        validPeriodEnd = periodEnd && !isNaN(periodEnd.getTime()) ? periodEnd : null;
      } else {
        // Fallback to invoice dates if subscription not found (should be rare)
        console.warn(`[Invoice] Could not fetch Stripe subscription ${stripeSubscriptionId}, using invoice dates as fallback`);
        const periodStart = invoice.period_start
          ? new Date(invoice.period_start * 1000)
          : null;
        const periodEnd = invoice.period_end
          ? new Date(invoice.period_end * 1000)
          : null;

        validPeriodStart = periodStart && !isNaN(periodStart.getTime()) ? periodStart : null;
        validPeriodEnd = periodEnd && !isNaN(periodEnd.getTime()) ? periodEnd : null;
      }

      // Check if this is a new billing period (auto-renewal)
      const isNewBillingPeriod = validPeriodStart && subscription.currentPeriodStart && 
        validPeriodStart.getTime() !== subscription.currentPeriodStart.getTime();
      
      const now = new Date();
      const updateData: any = {
        status: "ACTIVE",
        currentPeriodStart: validPeriodStart,
        currentPeriodEnd: validPeriodEnd,
        // Clear trial end since payment succeeded
        trialEnd: null,
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

      // CRITICAL: Check for first payment BEFORE creating the payment record
      // This fixes the race condition where we check after create
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
      const isFirstPayment = (invoice.amount_paid || 0) > 0 && existingPaymentsBefore === 0;

      // Update subscription status to active and reset retry tracking
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: updateData,
      });

      // Create payment record only if amount > 0
      const stripeProvider = await prisma.paymentProvider.findUnique({
        where: { name: "stripe" },
      });

      if (stripeProvider && (invoice.amount_paid || 0) > 0) {
        await prisma.payment.create({
          data: {
            subscriptionId: subscription.id,
            paymentProviderId: stripeProvider.id,
            amount: (invoice.amount_paid || 0) / 100,
            currency: invoice.currency || "usd",
            paymentType: "subscription",
            status: "succeeded",
            stripePaymentIntentId: getInvoicePaymentIntentId(invoice),
            stripeInvoiceId: invoice.id,
            receiptUrl: invoice.hosted_invoice_url || null,
          },
        });
        
        console.log(`[Invoice] Payment record created for invoice ${invoice.id}, amount: ${(invoice.amount_paid || 0) / 100}`);
      }

      // Process first payment logic (Origin status + referral completion)
      if (isFirstPayment) {
        console.log(`[Referral] First payment detected for user ${subscription.userId}, processing Origin and referral completion...`);
        
        try {
          // Assign Origin status to the paying user
          await statusAssignmentService.assignOriginStatus(subscription.userId);
          
          // Complete referral if user was referred
          try {
            const referralResult = await referralService.completeReferralOnboarding(subscription.userId);
            if (referralResult.success) {
              console.log(`[Referral] Successfully completed referral for user ${subscription.userId}`);
              if (referralResult.referrerStatusUpdated) {
                console.log(`[Referral] Referrer status updated to: ${referralResult.newReferrerStatus}`);
              }
            }
          } catch (error: any) {
            if (error.message?.includes("No referral found")) {
              console.log(`[Referral] User ${subscription.userId} was not referred, skipping referral completion`);
            } else {
              console.error("[Referral] Error completing referral on first payment:", error);
            }
          }
        } catch (error: any) {
          console.error("[Referral] Error in first payment processing:", error);
        }
      }
    } catch (error: any) {
      console.error("[Invoice] Error handling invoice payment succeeded:", error);
    }
  }

  /**
   * Handle invoice payment failed
   * Tracks retry attempts (max 3) and updates subscription status accordingly
   */
  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    try {
      const subscriptionId = getInvoiceSubscriptionId(invoice);
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
      const failureReason = getInvoicePaymentErrorMessage(invoice) || "Payment failed";
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
            stripePaymentIntentId: getInvoicePaymentIntentId(invoice),
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
      const subscriptionId = getInvoiceSubscriptionId(invoice);
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
            paymentFailureReason: getInvoicePaymentErrorMessage(invoice) || "Payment requires user action after 3 retry attempts",
          },
        });

        console.log(`Payment action required for subscription ${subscription.id} after ${subscription.paymentRetryCount} retries`);
      }
    } catch (error: any) {
      console.error("Error handling invoice payment action required:", error);
    }
  }
}

// Export singleton instance
export const subscriptionWebhookService = new SubscriptionWebhookService();
