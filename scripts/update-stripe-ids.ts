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
  
  // Essential Twenty Plan
  const essentialTwentyPriceId = process.env.STRIPE_ESSENTIAL_TWENTY_PRICE_ID;
  const essentialTwentyProductId = process.env.STRIPE_ESSENTIAL_TWENTY_PRODUCT_ID;
  
  // Business Pro Plan
  const businessProPriceId = process.env.STRIPE_BUSINESS_PRO_PRICE_ID;
  const businessProProductId = process.env.STRIPE_BUSINESS_PRO_PRODUCT_ID;
  
  // Focus Master Plan
  const focusMasterPriceId = process.env.STRIPE_FOCUS_MASTER_PRICE_ID;
  const focusMasterProductId = process.env.STRIPE_FOCUS_MASTER_PRODUCT_ID;
  
  // Performance Founder Plan
  const founderPriceId = process.env.STRIPE_FOUNDER_PRICE_ID;
  const founderProductId = process.env.STRIPE_FOUNDER_PRODUCT_ID;

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

    // Update Essential Twenty Plan
    if (essentialTwentyPriceId && essentialTwentyProductId) {
      const essentialTwentyPlan = await prisma.subscriptionPlan.update({
        where: { name: "essential_twenty" },
        data: {
          stripePriceId: essentialTwentyPriceId,
          stripeProductId: essentialTwentyProductId,
        },
      });

      console.log("✅ Updated Essential Twenty Plan:");
      console.log(`   Price ID: ${essentialTwentyPlan.stripePriceId}`);
      console.log(`   Product ID: ${essentialTwentyPlan.stripeProductId}\n`);
    } else {
      console.log("⚠️  Essential Twenty Plan not updated (STRIPE_ESSENTIAL_TWENTY_PRICE_ID and STRIPE_ESSENTIAL_TWENTY_PRODUCT_ID not set)\n");
    }

    // Update Business Pro Plan
    if (businessProPriceId && businessProProductId) {
      const businessProPlan = await prisma.subscriptionPlan.update({
        where: { name: "business_pro" },
        data: {
          stripePriceId: businessProPriceId,
          stripeProductId: businessProProductId,
        },
      });

      console.log("✅ Updated Business Pro Plan:");
      console.log(`   Price ID: ${businessProPlan.stripePriceId}`);
      console.log(`   Product ID: ${businessProPlan.stripeProductId}\n`);
    } else {
      console.log("⚠️  Business Pro Plan not updated (STRIPE_BUSINESS_PRO_PRICE_ID and STRIPE_BUSINESS_PRO_PRODUCT_ID not set)\n");
    }

    // Update Focus Master Plan
    if (focusMasterPriceId && focusMasterProductId) {
      const focusMasterPlan = await prisma.subscriptionPlan.update({
        where: { name: "focus_master" },
        data: {
          stripePriceId: focusMasterPriceId,
          stripeProductId: focusMasterProductId,
        },
      });

      console.log("✅ Updated Focus Master Plan:");
      console.log(`   Price ID: ${focusMasterPlan.stripePriceId}`);
      console.log(`   Product ID: ${focusMasterPlan.stripeProductId}\n`);
    } else {
      console.log("⚠️  Focus Master Plan not updated (STRIPE_FOCUS_MASTER_PRICE_ID and STRIPE_FOCUS_MASTER_PRODUCT_ID not set)\n");
    }

    // Update Performance Founder Plan
    if (founderPriceId && founderProductId) {
      const founderPlan = await prisma.subscriptionPlan.update({
        where: { name: "performance_founder" },
        data: {
          stripePriceId: founderPriceId,
          stripeProductId: founderProductId,
        },
      });

      console.log("✅ Updated Performance Founder Plan:");
      console.log(`   Price ID: ${founderPlan.stripePriceId}`);
      console.log(`   Product ID: ${founderPlan.stripeProductId}\n`);
    } else {
      console.log("⚠️  Performance Founder Plan not updated (STRIPE_FOUNDER_PRICE_ID and STRIPE_FOUNDER_PRODUCT_ID not set)\n");
    }

    console.log("✅ Successfully updated all subscription plans with Stripe IDs!");
    
    if (!clarityPriceId || !clarityProductId) {
      console.log("\n💡 Tip: Set STRIPE_CLARITY_PRICE_ID and STRIPE_CLARITY_PRODUCT_ID to enable Clarity Plan in Stripe.");
    }
    
    if (!essentialTwentyPriceId || !essentialTwentyProductId) {
      console.log("💡 Tip: Set STRIPE_ESSENTIAL_TWENTY_PRICE_ID and STRIPE_ESSENTIAL_TWENTY_PRODUCT_ID to enable Essential Twenty Plan in Stripe.");
    }
    
    if (!businessProPriceId || !businessProProductId) {
      console.log("💡 Tip: Set STRIPE_BUSINESS_PRO_PRICE_ID and STRIPE_BUSINESS_PRO_PRODUCT_ID to enable Business Pro Plan in Stripe.");
    }
    
    if (!focusMasterPriceId || !focusMasterProductId) {
      console.log("💡 Tip: Set STRIPE_FOCUS_MASTER_PRICE_ID and STRIPE_FOCUS_MASTER_PRODUCT_ID to enable Focus Master Plan in Stripe.");
    }
    
    if (!founderPriceId || !founderProductId) {
      console.log("💡 Tip: Set STRIPE_FOUNDER_PRICE_ID and STRIPE_FOUNDER_PRODUCT_ID to enable Performance Founder Plan in Stripe.");
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

