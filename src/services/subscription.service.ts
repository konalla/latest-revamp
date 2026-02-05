import Stripe from "stripe";
import { SubscriptionCoreService } from "./subscription/subscription-core.service.js";
import { SubscriptionLimitsService } from "./subscription/subscription-limits.service.js";
import { SubscriptionWebhookService } from "./subscription/subscription-webhook.service.js";
import { SubscriptionCheckoutService } from "./subscription/subscription-checkout.service.js";

/**
 * Subscription Service Facade
 * 
 * This is the main entry point for all subscription-related operations.
 * It delegates to specialized sub-services for different concerns:
 * 
 * - SubscriptionCoreService: Lifecycle management (init, get, update, cancel, resume)
 * - SubscriptionLimitsService: Permission checks and usage counters
 * - SubscriptionWebhookService: Stripe webhook event handling
 * - SubscriptionCheckoutService: Checkout sessions and payment methods
 * 
 * This facade maintains backward compatibility - existing code can continue
 * to use `subscriptionService.methodName()` without any changes.
 */
export class SubscriptionService {
  private coreService: SubscriptionCoreService;
  private limitsService: SubscriptionLimitsService;
  private webhookService: SubscriptionWebhookService;
  private checkoutService: SubscriptionCheckoutService;

  constructor() {
    // Initialize services with dependencies
    this.coreService = new SubscriptionCoreService();
    this.limitsService = new SubscriptionLimitsService(this.coreService);
    this.checkoutService = new SubscriptionCheckoutService(this.coreService);
    this.webhookService = new SubscriptionWebhookService();
    
    // Set up cross-service dependencies (to avoid circular imports)
    this.webhookService.setCheckoutService(this.checkoutService);
  }

  // ============================================================================
  // CORE SERVICE METHODS (subscription lifecycle)
  // ============================================================================

  /**
   * Initialize trial subscription for new user
   */
  initializeTrial = (userId: number, stripeCustomerId?: string, stripeSubscriptionId?: string) => 
    this.coreService.initializeTrial(userId, stripeCustomerId, stripeSubscriptionId);

  /**
   * Get user's subscription details
   */
  getUserSubscription = (userId: number) => 
    this.coreService.getUserSubscription(userId);

  /**
   * Update subscription status based on dates and Stripe status
   */
  updateSubscriptionStatus = (subscriptionId: number, prefetchedStripeSubscription?: Stripe.Subscription | null) => 
    this.coreService.updateSubscriptionStatus(subscriptionId, prefetchedStripeSubscription);

  /**
   * Cancel subscription
   */
  cancelSubscription = (userId: number) => 
    this.coreService.cancelSubscription(userId);

  /**
   * Resume canceled or expired subscription
   */
  resumeSubscription = (userId: number) => 
    this.coreService.resumeSubscription(userId);

  /**
   * Sync subscription status with Stripe
   */
  syncWithStripe = (userId: number) => 
    this.coreService.syncWithStripe(userId);

  /**
   * Get workspace and team limits for a subscription plan
   */
  getPlanLimits = (planName: string) => 
    this.coreService.getPlanLimits(planName);

  /**
   * Get available subscription plans
   */
  getAvailablePlans = () => 
    this.coreService.getAvailablePlans();

  // ============================================================================
  // LIMITS SERVICE METHODS (permissions and usage tracking)
  // ============================================================================

  /**
   * Check if user can create tasks
   */
  canCreateTask = (userId: number) => 
    this.limitsService.canCreateTask(userId);

  /**
   * Increment task count when task is created
   */
  incrementTaskCount = (userId: number) => 
    this.limitsService.incrementTaskCount(userId);

  /**
   * Reset task count if billing period changed
   */
  resetTaskCountIfNeeded = (subscriptionId: number) => 
    this.limitsService.resetTaskCountIfNeeded(subscriptionId);

  /**
   * Reset all counters if billing period changed
   */
  resetAllCountersIfNeeded = (subscriptionId: number) => 
    this.limitsService.resetAllCountersIfNeeded(subscriptionId);

  /**
   * Check if user can create projects
   */
  canCreateProject = (userId: number) => 
    this.limitsService.canCreateProject(userId);

  /**
   * Check if user can create objectives
   */
  canCreateObjective = (userId: number) => 
    this.limitsService.canCreateObjective(userId);

  /**
   * Check if user can create key results
   */
  canCreateKeyResult = (userId: number) => 
    this.limitsService.canCreateKeyResult(userId);

  /**
   * Increment project count when project is created
   */
  incrementProjectCount = (userId: number) => 
    this.limitsService.incrementProjectCount(userId);

  /**
   * Increment objective count when objective is created
   */
  incrementObjectiveCount = (userId: number) => 
    this.limitsService.incrementObjectiveCount(userId);

  /**
   * Increment key result count when key result is created
   */
  incrementKeyResultCount = (userId: number) => 
    this.limitsService.incrementKeyResultCount(userId);

  /**
   * Increment workspace count when workspace is created
   */
  incrementWorkspaceCount = (userId: number) => 
    this.limitsService.incrementWorkspaceCount(userId);

  /**
   * Increment team count when team is created
   */
  incrementTeamCount = (userId: number) => 
    this.limitsService.incrementTeamCount(userId);

  /**
   * Check if user can add team members
   */
  canAddTeamMembers = (userId: number) => 
    this.limitsService.canAddTeamMembers(userId);

  /**
   * Check if a user has an active subscription
   */
  hasActiveSubscription = (userId: number) => 
    this.limitsService.hasActiveSubscription(userId);

  /**
   * Check if user can perform write operations
   */
  canPerformWriteOperations = (userId: number) => 
    this.limitsService.canPerformWriteOperations(userId);

  // ============================================================================
  // WEBHOOK SERVICE METHODS (Stripe webhook handling)
  // ============================================================================

  /**
   * Handle Stripe webhook event
   */
  handleWebhookEvent = (event: Stripe.Event) => 
    this.webhookService.handleWebhookEvent(event);

  // ============================================================================
  // CHECKOUT SERVICE METHODS (checkout sessions and payments)
  // ============================================================================

  /**
   * Setup Clarity Plan (DEPRECATED)
   * @deprecated Use createCheckoutSession with a paid plan instead
   */
  setupClarityPlan = (userId: number) => 
    this.checkoutService.setupClarityPlan(userId);

  /**
   * Subscribe to free plan
   */
  subscribeToFreePlan = (userId: number) => 
    this.checkoutService.subscribeToFreePlan(userId);

  /**
   * Create Stripe checkout session for subscription
   */
  createCheckoutSession = (
    userId: number,
    planName: "monthly" | "yearly" | "essential_twenty" | "business_pro" | "focus_master" | "performance_founder"
  ) => this.checkoutService.createCheckoutSession(userId, planName);

  /**
   * Create payment method update session
   */
  createPaymentMethodUpdateSession = (userId: number) => 
    this.checkoutService.createPaymentMethodUpdateSession(userId);
}

// Export singleton instance
export const subscriptionService = new SubscriptionService();
