# Subscriptions & Payments

## Overview

The Subscriptions & Payments system integrates with Stripe to manage user subscriptions, payment processing, trial periods, grace periods, and subscription plan limits. It handles subscription lifecycle events, payment retries, and integrates with the referral system.

## Technical Architecture

### Subscription Models

```prisma
model SubscriptionPlan {
  id              Int      @id @default(autoincrement())
  name            String   @unique // "trial", "monthly", "yearly", "free"
  displayName     String
  description     String?
  price           Float
  currency        String   @default("USD")
  billingInterval String   // "trial", "monthly", "yearly", "free"
  trialDays       Int?     // 14 for trial plan
  maxTasks        Int?     // Task limits
  maxProjects     Int?     // Project limits
  maxObjectives   Int?     // Objective limits
  maxKeyResults   Int?     // Key result limits
  maxWorkspaces   Int?     // Workspace limits
  maxTeams        Int?     // Team limits
  features        Json     @default("{}") // Feature flags
  isActive        Boolean  @default(true)
  stripePriceId   String? // Stripe Price ID
  stripeProductId String? // Stripe Product ID
}

model Subscription {
  id                          Int                @id @default(autoincrement())
  userId                      Int                @unique
  subscriptionPlanId          Int
  paymentProviderId           Int?
  status                      SubscriptionStatus @default(TRIAL)
  stripeSubscriptionId        String?            @unique
  stripeCustomerId            String?
  currentPeriodStart          DateTime?
  currentPeriodEnd            DateTime?
  trialStart                  DateTime?
  trialEnd                    DateTime?
  gracePeriodEnd              DateTime?
  cancelAtPeriodEnd           Boolean            @default(false)
  canceledAt                  DateTime?
  
  // Usage tracking
  tasksCreatedThisPeriod      Int                @default(0)
  projectsCreatedThisPeriod   Int                @default(0)
  objectivesCreatedThisPeriod Int                @default(0)
  keyResultsCreatedThisPeriod Int                @default(0)
  workspacesCreatedThisPeriod Int                @default(0)
  teamsCreatedThisPeriod      Int                @default(0)
  
  // Payment retry tracking
  paymentRetryCount           Int                @default(0)
  lastPaymentRetryAt          DateTime?
  paymentFailureReason        String?
  
  // Referral rewards
  freeMonthsRemaining         Int                @default(0) // Max 3 free months
  
  lastTaskCountReset          DateTime?
  lastCountReset              DateTime?
}

enum SubscriptionStatus {
  TRIAL
  ACTIVE
  PAST_DUE
  CANCELED
  EXPIRED
  INCOMPLETE
  GRACE_PERIOD
}
```

### Subscription Plans

Available subscription plans:

1. **Clarity Plan (Trial)**: 14 days, 50 tasks, no payment required
2. **Free Plan**: 1 project, 5 objectives, 10 key results, 50 tasks, 1 workspace, 5 teams
3. **Pro Plan - Monthly**: $18/month, 1000 tasks
4. **Pro Plan - Yearly**: $180/year, 10000 tasks
5. **Essential Twenty**: $24/month, 1500 tasks
6. **Business Pro**: $49/month, 2000 tasks
7. **Focus Master**: $20/month, unlimited tasks, 7 workspaces
8. **Performance Founder**: $200/year, unlimited tasks, 12 workspaces

### Key Features

#### 1. Trial Subscription Initialization

```typescript
async initializeTrial(userId: number, stripeCustomerId?: string): Promise<Subscription> {
  // Get trial plan
  const trialPlan = await prisma.subscriptionPlan.findUnique({
    where: { name: "trial" },
  });

  // Get Stripe payment provider
  const stripeProvider = await prisma.paymentProvider.findUnique({
    where: { name: "stripe" },
  });

  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + 14); // 14 days trial

  // Create subscription
  const subscription = await prisma.subscription.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      subscriptionPlanId: trialPlan.id,
      paymentProviderId: stripeProvider.id,
      status: "TRIAL",
      stripeCustomerId,
      trialStart: now,
      trialEnd,
    },
  });

  return subscription;
}
```

#### 2. Stripe Checkout Session Creation

```typescript
async createCheckoutSession(
  userId: number,
  planName: "monthly" | "yearly" | "essential_twenty" | "business_pro" | "focus_master" | "performance_founder"
): Promise<{ url: string; sessionId: string }> {
  // Get target plan
  const targetPlan = await prisma.subscriptionPlan.findUnique({
    where: { name: planName },
  });

  // Get or create Stripe customer
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  let stripeCustomerId = subscription?.stripeCustomerId;
  if (!stripeCustomerId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: userId.toString() },
    });
    stripeCustomerId = customer.id;
  }

  // Create checkout session with 14-day trial for all paid plans
  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    line_items: [{
      price: targetPlan.stripePriceId,
      quantity: 1,
    }],
    mode: "subscription",
    allow_promotion_codes: true,
    subscription_data: {
      trial_period_days: 14, // 14-day trial for all paid plans
      metadata: {
        userId: userId.toString(),
        planName: planName,
      },
    },
    success_url: `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/subscription/cancel`,
  });

  return {
    url: session.url || "",
    sessionId: session.id,
  };
}
```

#### 3. Subscription Limit Checking

```typescript
async canCreateTask(userId: number): Promise<{ canCreate: boolean; reason?: string }> {
  const subscription = await this.getUserSubscription(userId);
  if (!subscription) {
    return { canCreate: false, reason: "No active subscription" };
  }

  const plan = subscription.subscriptionPlan;
  if (!plan.maxTasks) {
    return { canCreate: true }; // Unlimited
  }

  // Check if limit exceeded
  if (subscription.tasksCreatedThisPeriod >= plan.maxTasks) {
    // Check if we need to reset counter (new billing period)
    const shouldReset = await this.shouldResetTaskCount(subscription);
    if (shouldReset) {
      await this.resetTaskCount(userId);
      return { canCreate: true };
    }
    return { canCreate: false, reason: `Task limit reached (${plan.maxTasks})` };
  }

  return { canCreate: true };
}
```

#### 4. Usage Counter Management

```typescript
async incrementTaskCount(userId: number): Promise<void> {
  await prisma.subscription.update({
    where: { userId },
    data: {
      tasksCreatedThisPeriod: { increment: 1 },
      lastTaskCountReset: new Date(),
    },
  });
}

async shouldResetTaskCount(subscription: Subscription): Promise<boolean> {
  if (!subscription.lastTaskCountReset) {
    return true;
  }

  const plan = subscription.subscriptionPlan;
  const now = new Date();

  // Reset based on billing interval
  if (plan.billingInterval === "monthly") {
    const lastReset = subscription.lastTaskCountReset;
    const nextReset = new Date(lastReset);
    nextReset.setMonth(nextReset.getMonth() + 1);
    return now >= nextReset;
  }

  // Similar logic for yearly, etc.
  return false;
}
```

#### 5. Webhook Event Handling

The system handles Stripe webhook events:

```typescript
async handleStripeWebhook(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    
    case "customer.subscription.updated":
      await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;
    
    case "customer.subscription.deleted":
      await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    
    case "invoice.payment_succeeded":
      await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;
    
    case "invoice.payment_failed":
      await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;
  }
}
```

**Checkout Session Completed:**
```typescript
async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = parseInt(session.metadata?.userId || "0");
  const planName = session.metadata?.planName;

  // Get Stripe subscription
  const stripeSubscription = await stripe.subscriptions.retrieve(
    session.subscription as string
  );

  // Update or create subscription
  await prisma.subscription.upsert({
    where: { userId },
    update: {
      status: "ACTIVE",
      stripeSubscriptionId: stripeSubscription.id,
      stripeCustomerId: stripeSubscription.customer as string,
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      trialStart: stripeSubscription.trial_start 
        ? new Date(stripeSubscription.trial_start * 1000) 
        : null,
      trialEnd: stripeSubscription.trial_end 
        ? new Date(stripeSubscription.trial_end * 1000) 
        : null,
    },
    create: {
      userId,
      subscriptionPlanId: plan.id,
      paymentProviderId: stripeProvider.id,
      status: "ACTIVE",
      stripeSubscriptionId: stripeSubscription.id,
      stripeCustomerId: stripeSubscription.customer as string,
      // ... other fields
    },
  });

  // If first payment, assign Origin status and complete referral
  if (isFirstPayment && !isInTrialPeriod) {
    await statusAssignmentService.assignOriginStatus(userId);
    await referralService.completeReferralOnboarding(userId);
  }
}
```

**Payment Failed:**
```typescript
async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription as string },
  });

  if (!subscription) return;

  // Increment retry count
  const newRetryCount = subscription.paymentRetryCount + 1;

  if (newRetryCount >= 3) {
    // Max retries reached, move to PAST_DUE
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "PAST_DUE",
        paymentRetryCount: newRetryCount,
        paymentFailureReason: invoice.last_payment_error?.message || "Payment failed",
      },
    });
  } else {
    // Still in retry period
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        paymentRetryCount: newRetryCount,
        lastPaymentRetryAt: new Date(),
        paymentFailureReason: invoice.last_payment_error?.message || "Payment failed",
      },
    });
  }
}
```

#### 6. Grace Period Management

```typescript
async handleSubscriptionExpired(subscription: Subscription): Promise<void> {
  const now = new Date();
  const gracePeriodEnd = new Date(now);
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 3); // 3-day grace period

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: "GRACE_PERIOD",
      gracePeriodEnd,
    },
  });
}
```

#### 7. Free Months from Referrals

Users can earn up to 3 free months from referrals:

```typescript
async applyFreeMonth(userId: number): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (!subscription || subscription.freeMonthsRemaining >= 3) {
    return; // Already at max
  }

  // Apply free month by extending current period
  const newPeriodEnd = new Date(subscription.currentPeriodEnd || new Date());
  newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      freeMonthsRemaining: { increment: 1 },
      currentPeriodEnd: newPeriodEnd,
    },
  });
}
```

### API Endpoints

- `GET /api/subscriptions/plans` - Get all subscription plans
- `GET /api/subscriptions/current` - Get user's current subscription
- `POST /api/subscriptions/checkout` - Create Stripe checkout session
- `POST /api/subscriptions/subscribe-free` - Subscribe to free plan
- `POST /api/subscriptions/cancel` - Cancel subscription
- `POST /api/subscriptions/reactivate` - Reactivate canceled subscription
- `POST /api/webhooks/stripe` - Stripe webhook endpoint

### Environment Variables

```env
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=https://app.iqniti.com
```

### Important Code Snippets

**Subscription Status Check:**
```typescript
const isActive = subscription.status === "ACTIVE" || 
                 subscription.status === "TRIAL" || 
                 subscription.status === "GRACE_PERIOD";
```

**Trial Period Check:**
```typescript
const isInTrialPeriod = subscription.trialEnd && 
                        new Date() < subscription.trialEnd;
```

**Grace Period Check:**
```typescript
const isInGracePeriod = subscription.status === "GRACE_PERIOD" &&
                        subscription.gracePeriodEnd &&
                        new Date() < subscription.gracePeriodEnd;
```

### Error Handling

- **400 Bad Request**: Invalid plan, limit exceeded
- **402 Payment Required**: Payment failed, subscription expired
- **403 Forbidden**: Unauthorized subscription access
- **404 Not Found**: Subscription not found
- **500 Internal Server Error**: Stripe API errors, database errors

### Testing Considerations

1. Test trial initialization
2. Test checkout session creation
3. Test subscription limit enforcement
4. Test webhook event handling
5. Test payment retry logic
6. Test grace period management
7. Test free months application
8. Test counter reset logic

