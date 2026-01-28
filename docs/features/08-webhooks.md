# Webhooks

## Overview

The Webhooks system handles incoming webhooks from external services (Stripe, LeadConnector) and sends outgoing webhooks to external systems (CLIQSA) for events like user signups and redemptions.

## Technical Architecture

### Webhook Routes Setup

Webhook routes require raw body for signature verification:

```typescript
// In app.ts - Must be before express.json() middleware
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhookRoutes);
```

### Incoming Webhooks

#### 1. Stripe Webhooks

Handles Stripe subscription and payment events:

```typescript
router.post("/stripe", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return res.status(400).json({ error: "Missing signature or secret" });
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      webhookSecret
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle event
  try {
    await webhookService.handleStripeWebhook(event);
    res.json({ received: true });
  } catch (error: any) {
    console.error("Error handling Stripe webhook:", error);
    res.status(500).json({ error: error.message });
  }
});
```

**Handled Events:**
- `checkout.session.completed` - Subscription checkout completed
- `customer.subscription.updated` - Subscription updated
- `customer.subscription.deleted` - Subscription canceled
- `invoice.payment_succeeded` - Payment successful
- `invoice.payment_failed` - Payment failed

#### 2. LeadConnector Webhooks

Handles user signup events from LeadConnector:

```typescript
router.post("/leadconnector", async (req, res) => {
  // Verify webhook signature if configured
  const signature = req.headers["x-leadconnector-signature"];
  
  if (process.env.LEADCONNECTOR_WEBHOOK_SECRET) {
    const isValid = verifyLeadConnectorSignature(
      req.body,
      signature,
      process.env.LEADCONNECTOR_WEBHOOK_SECRET
    );
    
    if (!isValid) {
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  try {
    await webhookService.handleLeadConnectorWebhook(req.body);
    res.json({ received: true });
  } catch (error: any) {
    console.error("Error handling LeadConnector webhook:", error);
    res.status(500).json({ error: error.message });
  }
});
```

### Outgoing Webhooks

#### 1. Signup Webhook

Sends user signup data to external systems:

```typescript
async sendSignupWebhook(userData: SignupWebhookPayload): Promise<{
  success: boolean;
  error?: string;
}> {
  const webhookUrl = process.env.LEADCONNECTOR_SIGNUP_WEBHOOK_URL;
  const timeout = parseInt(process.env.LEADCONNECTOR_WEBHOOK_TIMEOUT || "10000", 10);

  if (!webhookUrl) {
    console.warn("LEADCONNECTOR_SIGNUP_WEBHOOK_URL not configured. Skipping webhook.");
    return { success: false, error: "Webhook URL not configured" };
  }

  try {
    const payload: SignupWebhookPayload = {
      name: userData.name,
      email: userData.email,
      username: userData.username,
      phone_number: userData.phone_number,
      job_title: userData.job_title,
      company_name: userData.company_name,
      company_size: userData.company_size,
      company_description: userData.company_description,
      industry: userData.industry,
      bio: userData.bio,
      website: userData.website,
      linkedin_url: userData.linkedin_url,
      website_url: userData.website_url,
      timezone: userData.timezone,
      date_joined: userData.created_at.toISOString(),
      badge_eligible: userData.referralStatus?.earlyAccessStatus || "NONE",
      origin_id: userData.referralStatus?.originId || null,
      vanguard_id: userData.referralStatus?.vanguardId || null,
      profile_photo_url: userData.profile_photo_url,
    };

    // Send webhook with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.LEADCONNECTOR_WEBHOOK_TOKEN || ""}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Webhook request failed with status ${response.status}`);
    }

    console.log(`✅ Signup webhook sent successfully for user: ${userData.email}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error sending signup webhook:", error);
    return {
      success: false,
      error: error.message || "Failed to send webhook",
    };
  }
}
```

**Payload Structure:**
```typescript
interface SignupWebhookPayload {
  name: string;
  email: string;
  username: string;
  phone_number?: string | null;
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
  date_joined: string; // ISO string
  badge_eligible: "ORIGIN" | "VANGUARD" | "NONE" | null;
  origin_id?: string | null;
  vanguard_id?: string | null;
  profile_photo_url?: string | null;
}
```

#### 2. Redemption Webhook

Sends redemption data to CLIQSA for fulfillment:

```typescript
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
): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = process.env.CLIQSA_REDEMPTION_WEBHOOK_URL;
  const timeout = parseInt(process.env.CLIQSA_WEBHOOK_TIMEOUT || "10000", 10);

  if (!webhookUrl) {
    console.warn("CLIQSA_REDEMPTION_WEBHOOK_URL not configured. Skipping webhook.");
    return { success: false, error: "Webhook URL not configured" };
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
          selectedVariant: redemption.selectedVariant || undefined,
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
    return { success: true };
  } catch (error: any) {
    console.error("Error sending redemption webhook:", error);
    
    // Increment retry count
    await prisma.redemption.update({
      where: { id: redemption.id },
      data: {
        webhookRetryCount: { increment: 1 },
      },
    });

    return {
      success: false,
      error: error.message || "Failed to send webhook",
    };
  }
}
```

**Payload Structure:**
```typescript
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
```

### Webhook Service

The webhook service handles all webhook operations:

```typescript
export class WebhookService {
  /**
   * Handle Stripe webhook events
   */
  async handleStripeWebhook(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case "checkout.session.completed":
        await this.handleCheckoutSessionCompleted(event.data.object);
        break;
      case "customer.subscription.updated":
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case "invoice.payment_succeeded":
        await this.handleInvoicePaymentSucceeded(event.data.object);
        break;
      case "invoice.payment_failed":
        await this.handleInvoicePaymentFailed(event.data.object);
        break;
      // ... other events
    }
  }

  /**
   * Handle LeadConnector webhook events
   */
  async handleLeadConnectorWebhook(data: any): Promise<void> {
    // Process LeadConnector webhook data
    // Update user records, sync data, etc.
  }
}
```

### Error Handling and Retries

**Retry Logic:**
- Redemption webhooks track `webhookRetryCount`
- Failed webhooks can be retried manually
- Timeout protection (default: 10 seconds)

**Non-Blocking:**
- Signup webhooks are sent asynchronously (don't block registration)
- Failures are logged but don't affect user operations

### Environment Variables

```env
# Stripe
STRIPE_WEBHOOK_SECRET=whsec_...

# LeadConnector
LEADCONNECTOR_SIGNUP_WEBHOOK_URL=https://...
LEADCONNECTOR_WEBHOOK_TOKEN=...
LEADCONNECTOR_WEBHOOK_SECRET=...
LEADCONNECTOR_WEBHOOK_TIMEOUT=10000

# CLIQSA
CLIQSA_REDEMPTION_WEBHOOK_URL=https://...
CLIQSA_WEBHOOK_TIMEOUT=10000
```

### API Endpoints

- `POST /api/webhooks/stripe` - Stripe webhook endpoint
- `POST /api/webhooks/leadconnector` - LeadConnector webhook endpoint

### Important Code Snippets

**Signature Verification:**
```typescript
event = stripe.webhooks.constructEvent(
  req.body,
  sig,
  webhookSecret
);
```

**Timeout Protection:**
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), timeout);

const response = await fetch(webhookUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
  signal: controller.signal,
});

clearTimeout(timeoutId);
```

**Non-Blocking Webhook:**
```typescript
// In registration flow
webhookService.sendSignupWebhook(userData).catch((error) => {
  // Log error but don't throw - registration is already successful
  console.error("Failed to send signup webhook (non-blocking):", error);
});
```

### Testing Considerations

1. Test Stripe webhook signature verification
2. Test webhook timeout handling
3. Test retry logic for failed webhooks
4. Test non-blocking webhook behavior
5. Test webhook payload structure
6. Test error handling and logging

