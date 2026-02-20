import Stripe from "stripe";

// ============================================================================
// STRIPE CLIENT
// ============================================================================

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-10-29.clover",
});

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default trial period in days for all paid plans */
export const TRIAL_PERIOD_DAYS = 14;

/** Grace period in days after subscription expires */
export const GRACE_PERIOD_DAYS = 3;

/** Maximum payment retry attempts before requiring manual action */
export const MAX_PAYMENT_RETRY_ATTEMPTS = 3;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Extended Stripe Subscription type with period fields
 * The Stripe "clover" API version returns subscriptions with these fields
 * but TypeScript definitions may not include them depending on version
 */
export interface StripeSubscriptionWithPeriod extends Stripe.Subscription {
  current_period_start: number;
  current_period_end: number;
}

/**
 * Extended Stripe Invoice type with subscription and payment_intent fields
 * These fields exist on invoices but may not be in type definitions
 */
export interface StripeInvoiceWithDetails extends Stripe.Invoice {
  subscription: string | Stripe.Subscription | null;
  payment_intent: string | Stripe.PaymentIntent | null;
}

/** Stripe subscription data passed between methods to avoid duplicate API calls */
export interface StripeSubscriptionData {
  id: string;
  status: Stripe.Subscription.Status;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  trial_end: number | null;
  customer: string;
}

/** Result of mapping Stripe status to local status */
export interface StatusMappingResult {
  status: SubscriptionStatus;
  trialEnd: Date | null;
}

/** 
 * Subscription status enum matching Prisma schema
 * Must match exactly with the SubscriptionStatus enum in schema.prisma
 */
export type SubscriptionStatus = 
  | "TRIAL"
  | "ACTIVE"
  | "CANCELED"
  | "EXPIRED"
  | "PAST_DUE"
  | "GRACE_PERIOD"
  | "INCOMPLETE";

// ============================================================================
// TYPE HELPERS
// ============================================================================

/**
 * Safely extract period start from a Stripe subscription.
 * In API version 2025-10-29.clover, current_period_start moved from the
 * Subscription object to SubscriptionItem objects. We check both locations.
 */
export function getSubscriptionPeriodStart(subscription: Stripe.Subscription): number | null {
  // Try top-level field first (pre-clover API versions)
  const sub = subscription as StripeSubscriptionWithPeriod;
  if (sub.current_period_start != null) {
    return sub.current_period_start;
  }

  // Clover API: extract from the first subscription item
  const firstItem = (subscription as any).items?.data?.[0];
  if (firstItem?.current_period_start != null) {
    return firstItem.current_period_start;
  }

  return null;
}

/**
 * Safely extract period end from a Stripe subscription.
 * In API version 2025-10-29.clover, current_period_end moved from the
 * Subscription object to SubscriptionItem objects. We check both locations.
 */
export function getSubscriptionPeriodEnd(subscription: Stripe.Subscription): number | null {
  // Try top-level field first (pre-clover API versions)
  const sub = subscription as StripeSubscriptionWithPeriod;
  if (sub.current_period_end != null) {
    return sub.current_period_end;
  }

  // Clover API: extract from the first subscription item
  const firstItem = (subscription as any).items?.data?.[0];
  if (firstItem?.current_period_end != null) {
    return firstItem.current_period_end;
  }

  return null;
}

/**
 * Safely extract subscription ID from an invoice
 */
export function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const inv = invoice as StripeInvoiceWithDetails;
  if (!inv.subscription) return null;
  return typeof inv.subscription === 'string' ? inv.subscription : inv.subscription.id;
}

/**
 * Safely extract payment intent ID from an invoice
 * Returns null (not undefined) for Prisma compatibility
 */
export function getInvoicePaymentIntentId(invoice: Stripe.Invoice): string | null {
  const inv = invoice as StripeInvoiceWithDetails;
  if (!inv.payment_intent) return null;
  return typeof inv.payment_intent === 'string' ? inv.payment_intent : inv.payment_intent.id;
}

/**
 * Convert unix timestamp to Date, with null safety
 */
export function timestampToDate(timestamp: number | null | undefined): Date | null {
  if (timestamp == null) return null;
  const date = new Date(timestamp * 1000);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Extended Stripe Invoice type for accessing last_payment_error
 */
interface StripeInvoiceWithError extends Stripe.Invoice {
  last_payment_error?: {
    message?: string;
    code?: string;
    type?: string;
  } | null;
}

/**
 * Safely extract last payment error message from an invoice
 */
export function getInvoicePaymentErrorMessage(invoice: Stripe.Invoice): string | null {
  const inv = invoice as StripeInvoiceWithError;
  return inv.last_payment_error?.message ?? null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate idempotency key for Stripe operations
 * Prevents duplicate resources on network retries
 */
export function generateIdempotencyKey(operation: string, userId: number, extra?: string): string {
  const timestamp = Math.floor(Date.now() / 1000 / 60); // 1-minute granularity
  return `${operation}-${userId}-${timestamp}${extra ? `-${extra}` : ''}`;
}

/**
 * Map Stripe subscription status to local status
 * Centralized status mapping for consistency
 * Maps all Stripe statuses to Prisma-compatible SubscriptionStatus values
 */
export function mapStripeStatusToLocal(stripeStatus: Stripe.Subscription.Status, trialEnd?: number | null): StatusMappingResult {
  let status: SubscriptionStatus;
  let localTrialEnd: Date | null = timestampToDate(trialEnd);

  switch (stripeStatus) {
    case "active":
      status = "ACTIVE";
      localTrialEnd = null; // Clear trial end since we're now fully active
      break;
    case "trialing":
      status = "TRIAL";
      break;
    case "past_due":
      status = "PAST_DUE";
      break;
    case "canceled":
      status = "CANCELED";
      break;
    case "unpaid":
    case "incomplete_expired":
      status = "EXPIRED";
      break;
    case "incomplete":
      status = "INCOMPLETE";
      break;
    case "paused":
      // Paused maps to CANCELED as we don't have a separate PAUSED status in Prisma
      status = "CANCELED";
      console.log(`[Subscription] Stripe paused status mapped to CANCELED`);
      break;
    default:
      // Unknown statuses default to EXPIRED for safety (prevents access)
      status = "EXPIRED";
      console.warn(`[Subscription] Unknown Stripe status '${stripeStatus}' mapped to EXPIRED`);
  }

  return { status, trialEnd: localTrialEnd };
}

/**
 * Fetch Stripe subscription with error handling
 * Returns null if subscription not found, throws on other errors
 */
export async function fetchStripeSubscription(stripeSubscriptionId: string): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(stripeSubscriptionId);
  } catch (error: any) {
    if (error.code === "resource_missing" || error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}
