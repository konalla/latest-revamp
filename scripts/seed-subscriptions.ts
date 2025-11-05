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
      displayName: "Free Trial",
      description: "3-day free trial with 50 tasks",
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
      displayName: "Free Trial",
      description: "3-day free trial with 50 tasks",
      price: 0,
      currency: "USD",
      billingInterval: "trial",
      trialDays: 3,
      maxTasks: 50,
      features: {},
      isActive: true,
    },
  });

  console.log("Created trial plan");

  const monthlyPlan = await prisma.subscriptionPlan.upsert({
    where: { name: "monthly" },
    update: {
      displayName: "Monthly Plan",
      description: "Monthly subscription with 1000 tasks per month",
      price: 9.99,
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
      displayName: "Monthly Plan",
      description: "Monthly subscription with 1000 tasks per month",
      price: 9.99,
      currency: "USD",
      billingInterval: "monthly",
      trialDays: null,
      maxTasks: 1000,
      features: {},
      isActive: true,
    },
  });

  console.log("Created monthly plan");

  const yearlyPlan = await prisma.subscriptionPlan.upsert({
    where: { name: "yearly" },
    update: {
      displayName: "Yearly Plan",
      description: "Yearly subscription with 10000 tasks per year",
      price: 99.99,
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
      displayName: "Yearly Plan",
      description: "Yearly subscription with 10000 tasks per year",
      price: 99.99,
      currency: "USD",
      billingInterval: "yearly",
      trialDays: null,
      maxTasks: 10000,
      features: {},
      isActive: true,
    },
  });

  console.log("Created yearly plan");

  console.log("Seeding completed!");
  console.log("\nIMPORTANT: After creating products in Stripe Dashboard, update the stripePriceId and stripeProductId fields:");
  console.log("- Monthly Plan ID:", monthlyPlan.id);
  console.log("- Yearly Plan ID:", yearlyPlan.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

