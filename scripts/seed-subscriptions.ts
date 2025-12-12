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
      description: "Free plan with 7-day trial and 50 tasks",
      price: 0,
      currency: "USD",
      billingInterval: "trial",
      trialDays: 7,
      maxTasks: 50,
      features: {},
      isActive: true,
    },
    create: {
      name: "trial",
      displayName: "Clarity Plan",
      description: "Free plan with 7-day trial and 50 tasks",
      price: 0,
      currency: "USD",
      billingInterval: "trial",
      trialDays: 7,
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
      trialDays: 7,
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
      trialDays: 7,
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
      trialDays: 7,
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
      trialDays: 7,
      maxTasks: 10000,
      features: {},
      isActive: true,
    },
  });

  console.log("Created Pro Plan - Yearly");

  const essentialTwentyPlan = await prisma.subscriptionPlan.upsert({
    where: { name: "essential_twenty" },
    update: {
      displayName: "Essential Twenty",
      description: "Monthly subscription with 1500 tasks per month",
      price: 24.00,
      currency: "USD",
      billingInterval: "monthly",
      trialDays: 7,
      maxTasks: 1500,
      features: {},
      isActive: true,
      // Note: stripePriceId and stripeProductId should be set manually after creating products in Stripe Dashboard
    },
    create: {
      name: "essential_twenty",
      displayName: "Essential Twenty",
      description: "Monthly subscription with 1500 tasks per month",
      price: 24.00,
      currency: "USD",
      billingInterval: "monthly",
      trialDays: 7,
      maxTasks: 1500,
      features: {},
      isActive: true,
    },
  });

  console.log("Created Essential Twenty Plan");

  const businessProPlan = await prisma.subscriptionPlan.upsert({
    where: { name: "business_pro" },
    update: {
      displayName: "Business Pro",
      description: "Monthly subscription with 2000 tasks per month",
      price: 49.00,
      currency: "USD",
      billingInterval: "monthly",
      trialDays: 7,
      maxTasks: 2000,
      features: {},
      isActive: true,
      // Note: stripePriceId and stripeProductId should be set manually after creating products in Stripe Dashboard
    },
    create: {
      name: "business_pro",
      displayName: "Business Pro",
      description: "Monthly subscription with 2000 tasks per month",
      price: 49.00,
      currency: "USD",
      billingInterval: "monthly",
      trialDays: 7,
      maxTasks: 2000,
      features: {},
      isActive: true,
    },
  });

  console.log("Created Business Pro Plan");

  const focusMasterPlan = await prisma.subscriptionPlan.upsert({
    where: { name: "focus_master" },
    update: {
      displayName: "Focus Master Plan",
      description: "Monthly subscription with unlimited tasks and 7 workspaces max",
      price: 20.00,
      currency: "USD",
      billingInterval: "monthly",
      trialDays: 7,
      maxTasks: null, // Unlimited tasks
      features: {},
      isActive: true,
      // Note: stripePriceId and stripeProductId should be set manually after creating products in Stripe Dashboard
    },
    create: {
      name: "focus_master",
      displayName: "Focus Master Plan",
      description: "Monthly subscription with unlimited tasks and 7 workspaces max",
      price: 20.00,
      currency: "USD",
      billingInterval: "monthly",
      trialDays: 7,
      maxTasks: null, // Unlimited tasks
      features: {},
      isActive: true,
    },
  });

  console.log("Created Focus Master Plan");

  const performanceFounderPlan = await prisma.subscriptionPlan.upsert({
    where: { name: "performance_founder" },
    update: {
      displayName: "Performance Founder Plan",
      description: "Yearly subscription with unlimited tasks and 12 workspaces max",
      price: 200.00,
      currency: "USD",
      billingInterval: "yearly",
      trialDays: 7,
      maxTasks: null, // Unlimited tasks
      features: {},
      isActive: true,
      // Note: stripePriceId and stripeProductId should be set manually after creating products in Stripe Dashboard
    },
    create: {
      name: "performance_founder",
      displayName: "Performance Founder Plan",
      description: "Yearly subscription with unlimited tasks and 12 workspaces max",
      price: 200.00,
      currency: "USD",
      billingInterval: "yearly",
      trialDays: 7,
      maxTasks: null, // Unlimited tasks
      features: {},
      isActive: true,
    },
  });

  console.log("Created Performance Founder Plan");

  console.log("Seeding completed!");
  console.log("\nIMPORTANT: After creating products in Stripe Dashboard, update the stripePriceId and stripeProductId fields:");
  console.log("- Clarity Plan ID:", trialPlan.id);
  console.log("- Pro Plan - Monthly ID:", monthlyPlan.id);
  console.log("- Pro Plan - Yearly ID:", yearlyPlan.id);
  console.log("- Essential Twenty Plan ID:", essentialTwentyPlan.id);
  console.log("- Business Pro Plan ID:", businessProPlan.id);
  console.log("- Focus Master Plan ID:", focusMasterPlan.id);
  console.log("- Performance Founder Plan ID:", performanceFounderPlan.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

