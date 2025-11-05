import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function updateStripeIds() {
  console.log("Updating subscription plans with Stripe IDs from environment variables...");

  // Get Stripe IDs from environment variables
  const monthlyPriceId = process.env.STRIPE_MONTHLY_PRICE_ID;
  const monthlyProductId = process.env.STRIPE_MONTHLY_PRODUCT_ID;
  const yearlyPriceId = process.env.STRIPE_YEARLY_PRICE_ID;
  const yearlyProductId = process.env.STRIPE_YEARLY_PRODUCT_ID;

  // Validate required environment variables
  if (!monthlyPriceId || !monthlyProductId) {
    console.error("Error: STRIPE_MONTHLY_PRICE_ID and STRIPE_MONTHLY_PRODUCT_ID are required");
    process.exit(1);
  }

  if (!yearlyPriceId || !yearlyProductId) {
    console.error("Error: STRIPE_YEARLY_PRICE_ID and STRIPE_YEARLY_PRODUCT_ID are required");
    process.exit(1);
  }

  try {
    // Update monthly plan
    const monthlyPlan = await prisma.subscriptionPlan.update({
      where: { name: "monthly" },
      data: {
        stripePriceId: monthlyPriceId,
        stripeProductId: monthlyProductId,
      },
    });

    console.log("✅ Updated Monthly Plan:");
    console.log(`   Price ID: ${monthlyPlan.stripePriceId}`);
    console.log(`   Product ID: ${monthlyPlan.stripeProductId}`);

    // Update yearly plan
    const yearlyPlan = await prisma.subscriptionPlan.update({
      where: { name: "yearly" },
      data: {
        stripePriceId: yearlyPriceId,
        stripeProductId: yearlyProductId,
      },
    });

    console.log("✅ Updated Yearly Plan:");
    console.log(`   Price ID: ${yearlyPlan.stripePriceId}`);
    console.log(`   Product ID: ${yearlyPlan.stripeProductId}`);

    console.log("\n✅ Successfully updated all subscription plans with Stripe IDs!");
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

