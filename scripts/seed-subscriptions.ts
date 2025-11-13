import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding subscription data...");

  // Create Stripe payment provider
  const stripeProvider = await prisma.paymentProvider.upsert({
    where: { name: "stripe" },
    update: {},
    create: {
      name: "stripe",
      isActive: true,
    },
  });

  console.log("Created Stripe payment provider");

  // Create subscription plans
  const trialPlan = await prisma.subscriptionPlan.upsert({
    where: { name: "trial" },
    update: {
      displayName: "Clarity Plan",
      description: "Free plan with 3-day trial and 50 tasks",
      price: 0,
      currency: "USD",
      billingInterval: "trial",
      trialDays: 3,
      maxTasks: 50,
      features: {},
      isActive: true,
    },
    create: {
      name: "trial",
      displayName: "Clarity Plan",
      description: "Free plan with 3-day trial and 50 tasks",
      price: 0,
      currency: "USD",
      billingInterval: "trial",
      trialDays: 3,
      maxTasks: 50,
      features: {},
      isActive: true,
    },
  });

  console.log("Created Clarity Plan (trial plan)");

  const monthlyPlan = await prisma.subscriptionPlan.upsert({
    where: { name: "monthly" },
    update: {
      displayName: "Pro Plan - Monthly",
      description: "Monthly subscription with 1000 tasks per month",
      price: 18.00,
      currency: "USD",
      billingInterval: "monthly",
      trialDays: null,
      maxTasks: 1000,
      features: {},
      isActive: true,
      // Note: stripePriceId and stripeProductId should be set manually after creating products in Stripe Dashboard
    },
    create: {
      name: "monthly",
      displayName: "Pro Plan - Monthly",
      description: "Monthly subscription with 1000 tasks per month",
      price: 18.00,
      currency: "USD",
      billingInterval: "monthly",
      trialDays: null,
      maxTasks: 1000,
      features: {},
      isActive: true,
    },
  });

  console.log("Created Pro Plan - Monthly");

  const yearlyPlan = await prisma.subscriptionPlan.upsert({
    where: { name: "yearly" },
    update: {
      displayName: "Pro Plan - Yearly",
      description: "Yearly subscription with 10000 tasks per year",
      price: 180.00,
      currency: "USD",
      billingInterval: "yearly",
      trialDays: null,
      maxTasks: 10000,
      features: {},
      isActive: true,
      // Note: stripePriceId and stripeProductId should be set manually after creating products in Stripe Dashboard
    },
    create: {
      name: "yearly",
      displayName: "Pro Plan - Yearly",
      description: "Yearly subscription with 10000 tasks per year",
      price: 180.00,
      currency: "USD",
      billingInterval: "yearly",
      trialDays: null,
      maxTasks: 10000,
      features: {},
      isActive: true,
    },
  });

  console.log("Created Pro Plan - Yearly");

  console.log("Seeding completed!");
  console.log("\nIMPORTANT: After creating products in Stripe Dashboard, update the stripePriceId and stripeProductId fields:");
  console.log("- Clarity Plan ID:", trialPlan.id);
  console.log("- Pro Plan - Monthly ID:", monthlyPlan.id);
  console.log("- Pro Plan - Yearly ID:", yearlyPlan.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

