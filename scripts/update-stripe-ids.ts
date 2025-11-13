import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function updateStripeIds() {
  console.log("Updating subscription plans with Stripe IDs from environment variables...\n");

  // Get Stripe IDs from environment variables
  // Clarity Plan (trial) - optional, but recommended
  const clarityPriceId = process.env.STRIPE_CLARITY_PRICE_ID;
  const clarityProductId = process.env.STRIPE_CLARITY_PRODUCT_ID;
  
  // Pro Plan - Monthly
  const monthlyPriceId = process.env.STRIPE_MONTHLY_PRICE_ID || process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
  const monthlyProductId = process.env.STRIPE_MONTHLY_PRODUCT_ID || process.env.STRIPE_PRO_MONTHLY_PRODUCT_ID;
  
  // Pro Plan - Yearly
  const yearlyPriceId = process.env.STRIPE_YEARLY_PRICE_ID || process.env.STRIPE_PRO_YEARLY_PRICE_ID;
  const yearlyProductId = process.env.STRIPE_YEARLY_PRODUCT_ID || process.env.STRIPE_PRO_YEARLY_PRODUCT_ID;

  // Validate required environment variables
  if (!monthlyPriceId || !monthlyProductId) {
    console.error("Error: STRIPE_MONTHLY_PRICE_ID and STRIPE_MONTHLY_PRODUCT_ID are required");
    console.error("   (or use STRIPE_PRO_MONTHLY_PRICE_ID and STRIPE_PRO_MONTHLY_PRODUCT_ID)");
    process.exit(1);
  }

  if (!yearlyPriceId || !yearlyProductId) {
    console.error("Error: STRIPE_YEARLY_PRICE_ID and STRIPE_YEARLY_PRODUCT_ID are required");
    console.error("   (or use STRIPE_PRO_YEARLY_PRICE_ID and STRIPE_PRO_YEARLY_PRODUCT_ID)");
    process.exit(1);
  }

  try {
    // Update Clarity Plan (trial) - optional
    if (clarityPriceId && clarityProductId) {
      const clarityPlan = await prisma.subscriptionPlan.update({
        where: { name: "trial" },
        data: {
          stripePriceId: clarityPriceId,
          stripeProductId: clarityProductId,
        },
      });

      console.log("✅ Updated Clarity Plan:");
      console.log(`   Price ID: ${clarityPlan.stripePriceId}`);
      console.log(`   Product ID: ${clarityPlan.stripeProductId}\n`);
    } else {
      console.log("⚠️  Clarity Plan not updated (STRIPE_CLARITY_PRICE_ID and STRIPE_CLARITY_PRODUCT_ID not set)");
      console.log("   This is optional, but recommended for the new flow.\n");
    }

    // Update Pro Plan - Monthly
    const monthlyPlan = await prisma.subscriptionPlan.update({
      where: { name: "monthly" },
      data: {
        stripePriceId: monthlyPriceId,
        stripeProductId: monthlyProductId,
      },
    });

    console.log("✅ Updated Pro Plan - Monthly:");
    console.log(`   Price ID: ${monthlyPlan.stripePriceId}`);
    console.log(`   Product ID: ${monthlyPlan.stripeProductId}\n`);

    // Update Pro Plan - Yearly
    const yearlyPlan = await prisma.subscriptionPlan.update({
      where: { name: "yearly" },
      data: {
        stripePriceId: yearlyPriceId,
        stripeProductId: yearlyProductId,
      },
    });

    console.log("✅ Updated Pro Plan - Yearly:");
    console.log(`   Price ID: ${yearlyPlan.stripePriceId}`);
    console.log(`   Product ID: ${yearlyPlan.stripeProductId}\n`);

    console.log("✅ Successfully updated all subscription plans with Stripe IDs!");
    
    if (!clarityPriceId || !clarityProductId) {
      console.log("\n💡 Tip: Set STRIPE_CLARITY_PRICE_ID and STRIPE_CLARITY_PRODUCT_ID to enable Clarity Plan in Stripe.");
    }
  } catch (error: any) {
    console.error("Error updating subscription plans:", error);
    
    if (error.code === "P2025") {
      console.error("\nError: Subscription plans not found. Please run the seed script first:");
      console.error("   npx tsx scripts/seed-subscriptions.ts");
    }
    
    process.exit(1);
  }
}

updateStripeIds()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

