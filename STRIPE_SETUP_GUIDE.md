# Stripe Subscription Integration - Setup Guide

## Prerequisites

1. Node.js and npm installed
2. PostgreSQL database running
3. Stripe account (create at https://stripe.com)

---

## Step 1: Install Dependencies

Install Stripe package:

```bash
npm install stripe
npm install --save-dev @types/stripe
```

---

## Step 2: Environment Variables

Add these to your `.env` file:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...                    # Get from Stripe Dashboard → Developers → API keys
STRIPE_PUBLISHABLE_KEY=pk_test_...               # Get from Stripe Dashboard → Developers → API keys
STRIPE_WEBHOOK_SECRET=whsec_...                  # Get from Stripe Dashboard → Developers → Webhooks (after creating webhook)

# Frontend URL (for Stripe Checkout redirects)
FRONTEND_URL=http://localhost:3000               # Your frontend URL (adjust for production)

# Default Currency
DEFAULT_CURRENCY=USD

# Database (if not already set)
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

### Getting Stripe Keys:

1. **Secret Key & Publishable Key**:
   - Go to Stripe Dashboard → Developers → API keys
   - Copy "Secret key" → `STRIPE_SECRET_KEY`
   - Copy "Publishable key" → `STRIPE_PUBLISHABLE_KEY` (for frontend)
   - Use test keys (`sk_test_` and `pk_test_`) for development

2. **Webhook Secret** (after setting up webhook):
   - Go to Stripe Dashboard → Developers → Webhooks
   - Add endpoint: `https://your-backend-url/api/webhooks/stripe`
   - Copy "Signing secret" → `STRIPE_WEBHOOK_SECRET`

---

## Step 3: Run Database Migration

Create and run the migration:

```bash
npx prisma migrate dev --name add_subscription_tables
```

This will create:
- `PaymentProvider` table
- `SubscriptionPlan` table
- `Subscription` table
- `Payment` table
- Update `User` table with subscription relation

---

## Step 4: Seed Initial Data

Run the seed script to create initial subscription plans and payment provider:

```bash
npx tsx scripts/seed-subscriptions.ts
```

This creates:
- Stripe payment provider
- Clarity Plan (trial plan: 3 days, 50 tasks, $0)
- Pro Plan - Monthly ($18.00, 1000 tasks/month)
- Pro Plan - Yearly ($180.00, 10000 tasks/year)

---

## Step 5: Create Stripe Products & Prices

1. Go to Stripe Dashboard → Products
2. Create **three products**:

   **Product 1: Clarity Plan (Free Plan)**
   - Name: "Clarity Plan"
   - Description: "Free plan with 3-day trial and 50 tasks"
   - Pricing: $0.00 USD, Recurring Monthly
   - **Important**: Stripe allows $0 subscriptions, but you may need to use a minimum charge ($0.01) or handle it differently
   - Alternative: Create as $0.01/month if Stripe doesn't support $0
   - Copy the Price ID (starts with `price_`)
   - Copy the Product ID (starts with `prod_`)

   **Product 2: Pro Plan - Monthly**
   - Name: "Pro Plan - Monthly"
   - Description: "Monthly subscription with 1000 tasks per month"
   - Pricing: $18.00 USD, Recurring Monthly
   - Copy the Price ID (starts with `price_`)
   - Copy the Product ID (starts with `prod_`)

   **Product 3: Pro Plan - Yearly**
   - Name: "Pro Plan - Yearly"
   - Description: "Yearly subscription with 10000 tasks per year"
   - Pricing: $180.00 USD, Recurring Yearly
   - Copy the Price ID (starts with `price_`)
   - Copy the Product ID (starts with `prod_`)

3. Update database with Stripe Price IDs:

```sql
-- Update Clarity Plan (trial)
UPDATE "SubscriptionPlan" 
SET "stripePriceId" = 'price_clarity_xxxxx', "stripeProductId" = 'prod_clarity_xxxxx'
WHERE name = 'trial';

-- Update Pro Plan - Monthly
UPDATE "SubscriptionPlan" 
SET "stripePriceId" = 'price_monthly_xxxxx', "stripeProductId" = 'prod_monthly_xxxxx'
WHERE name = 'monthly';

-- Update Pro Plan - Yearly
UPDATE "SubscriptionPlan" 
SET "stripePriceId" = 'price_yearly_xxxxx', "stripeProductId" = 'prod_yearly_xxxxx'
WHERE name = 'yearly';
```

Or use Prisma Studio:
```bash
npx prisma studio
```

**Note on $0 Subscriptions:**
- Stripe supports $0 recurring subscriptions
- If you encounter issues, you can use $0.01 as minimum charge
- The backend will handle $0 subscriptions correctly

---

## Step 6: Configure Stripe Webhook

1. Go to Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint"
3. Endpoint URL: `https://your-backend-url/api/webhooks/stripe`
   - For local testing, use Stripe CLI (see below)
4. Select events to listen to:
   - `checkout.session.completed` (handles both subscription and setup mode)
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `invoice.payment_action_required` (NEW - for payment retry handling)
5. Copy the "Signing secret" → Add to `.env` as `STRIPE_WEBHOOK_SECRET`

### Local Testing with Stripe CLI:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe  # macOS
# or download from https://stripe.com/docs/stripe-cli

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copy the webhook signing secret from the CLI output.

---

## Step 7: Test the Integration

1. **Start the server**:
```bash
npm run dev
```

2. **Test Clarity Plan setup**:
   - Register a new user
   - User should be redirected to payment setup page
   - Complete payment method setup (no charge)
   - Check that Clarity Plan subscription is created in Stripe
   - Verify trial starts and ends in 3 days

3. **Test Pro Plan purchase**:
   - User with Clarity Plan clicks "Upgrade to Pro"
   - Create checkout session via API (monthly or yearly)
   - Complete payment in Stripe Checkout
   - Verify webhook updates subscription status to ACTIVE
   - Verify auto-renewal is enabled

4. **Test payment failure and retries**:
   - Use Stripe test card: `4000 0000 0000 0002` (card declined)
   - Wait for payment failure webhook
   - Verify retry count increments
   - After 3 failures, verify user is prompted to update payment method

5. **Test task limits**:
   - Create tasks up to limit
   - Verify task creation is blocked when limit reached

---

## Step 8: Production Setup

1. **Switch to Live Keys**:
   - Get live keys from Stripe Dashboard
   - Update `.env` with live keys (remove `_test` suffix)
   - Update `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`

2. **Update Frontend URL**:
   - Set `FRONTEND_URL` to your production frontend URL

3. **Configure Production Webhook**:
   - Add production webhook endpoint in Stripe Dashboard
   - Update `STRIPE_WEBHOOK_SECRET` with production webhook secret

4. **Update Stripe Price IDs**:
   - Create products/prices in live mode
   - Update database with live price IDs

---

## Troubleshooting

### Webhook not receiving events:
- Verify webhook URL is accessible
- Check webhook secret matches
- Verify events are selected in Stripe Dashboard
- Check server logs for webhook errors

### Subscription not updating after payment:
- Check webhook is configured correctly
- Verify webhook events are being received
- Check database for subscription updates
- Verify Stripe Price IDs are correct

### Task count not incrementing:
- Check subscription service is imported correctly
- Verify task creation is calling `incrementTaskCount`
- Check database for `tasksCreatedThisPeriod` updates

### View-only mode not working:
- Verify `requireWriteAccess` middleware is applied
- Check subscription status is `EXPIRED` or `CANCELED`
- Verify `canPerformWriteOperations` logic

---

## Next Steps

1. **Frontend Integration**: See `STRIPE_FRONTEND_INTEGRATION.md`
2. **Protect Other Routes**: Add `requireWriteAccess` middleware to:
   - Project creation/update/delete routes
   - Objective creation/update/delete routes
   - OKR creation/update/delete routes
   - Focus session creation routes
   - Any other write operations

3. **Monitor Subscriptions**: Set up monitoring for:
   - Failed payments and retry attempts
   - Subscriptions requiring payment method update (retryCount >= 3)
   - Expiring subscriptions
   - Grace period warnings
   - Auto-renewal status

4. **Configure Payment Retry Settings**:
   - Go to Stripe Dashboard → Settings → Billing → Automatic retries
   - Configure retry schedule (default: days 1, 3, 5, 7 after failure)
   - Backend tracks retries via webhooks (max 3 attempts)

---

## Support

For issues:
1. Check Stripe Dashboard logs
2. Check backend server logs
3. Verify database state
4. Test webhook with Stripe CLI

---

**Document Version**: 1.0  
**Last Updated**: [Current Date]

