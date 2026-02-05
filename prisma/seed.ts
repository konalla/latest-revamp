import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

/**
 * Seed Subscription Plans
 * Creates all subscription plans and Stripe payment provider
 */
async function seedSubscriptions() {
  console.log("🌱 Seeding subscription data...");

  // Create Stripe payment provider
  const stripeProvider = await prisma.paymentProvider.upsert({
    where: { name: "stripe" },
    update: {},
    create: {
      name: "stripe",
      isActive: true,
    },
  });

  console.log("✅ Created Stripe payment provider");

  // Create subscription plans
  const trialPlan = await prisma.subscriptionPlan.upsert({
    where: { name: "trial" },
    update: {
      displayName: "Clarity Plan",
      description: "Free plan with 14-day trial and 50 tasks",
      price: 0,
      currency: "USD",
      billingInterval: "trial",
      trialDays: 14,
      maxTasks: 50,
      features: {},
      isActive: true,
    },
    create: {
      name: "trial",
      displayName: "Clarity Plan",
      description: "Free plan with 14-day trial and 50 tasks",
      price: 0,
      currency: "USD",
      billingInterval: "trial",
      trialDays: 14,
      maxTasks: 50,
      features: {},
      isActive: true,
    },
  });

  console.log("✅ Created Clarity Plan (trial plan)");

  // Create Free Plan
  const freePlan = await prisma.subscriptionPlan.upsert({
    where: { name: "free" },
    update: {
      displayName: "Free Plan",
      description: "Free plan with monthly limits: 1 project, 5 objectives, 10 key results, 50 tasks, 1 workspace, 5 teams",
      price: 0,
      currency: "USD",
      billingInterval: "free",
      trialDays: null,
      maxProjects: 1,
      maxObjectives: 5,
      maxKeyResults: 10,
      maxTasks: 50,
      maxWorkspaces: 1,
      maxTeams: 5,
      features: {},
      isActive: true,
    },
    create: {
      name: "free",
      displayName: "Free Plan",
      description: "Free plan with monthly limits: 1 project, 5 objectives, 10 key results, 50 tasks, 1 workspace, 5 teams",
      price: 0,
      currency: "USD",
      billingInterval: "free",
      trialDays: null,
      maxProjects: 1,
      maxObjectives: 5,
      maxKeyResults: 10,
      maxTasks: 50,
      maxWorkspaces: 1,
      maxTeams: 5,
      features: {},
      isActive: true,
    },
  });

  console.log("✅ Created Free Plan");

  const monthlyPlan = await prisma.subscriptionPlan.upsert({
    where: { name: "monthly" },
    update: {
      displayName: "Pro Plan - Monthly",
      description: "Monthly subscription with 1000 tasks per month",
      price: 18.00,
      currency: "USD",
      billingInterval: "monthly",
      trialDays: 14,
      maxTasks: 1000,
      features: {},
      isActive: true,
    },
    create: {
      name: "monthly",
      displayName: "Pro Plan - Monthly",
      description: "Monthly subscription with 1000 tasks per month",
      price: 18.00,
      currency: "USD",
      billingInterval: "monthly",
      trialDays: 14,
      maxTasks: 1000,
      features: {},
      isActive: true,
    },
  });

  console.log("✅ Created Pro Plan - Monthly");

  const yearlyPlan = await prisma.subscriptionPlan.upsert({
    where: { name: "yearly" },
    update: {
      displayName: "Pro Plan - Yearly",
      description: "Yearly subscription with 10000 tasks per year",
      price: 180.00,
      currency: "USD",
      billingInterval: "yearly",
      trialDays: 14,
      maxTasks: 10000,
      features: {},
      isActive: true,
    },
    create: {
      name: "yearly",
      displayName: "Pro Plan - Yearly",
      description: "Yearly subscription with 10000 tasks per year",
      price: 180.00,
      currency: "USD",
      billingInterval: "yearly",
      trialDays: 14,
      maxTasks: 10000,
      features: {},
      isActive: true,
    },
  });

  console.log("✅ Created Pro Plan - Yearly");

  const essentialTwentyPlan = await prisma.subscriptionPlan.upsert({
    where: { name: "essential_twenty" },
    update: {
      displayName: "Essential Twenty",
      description: "Monthly subscription with 1500 tasks per month",
      price: 24.00,
      currency: "USD",
      billingInterval: "monthly",
      trialDays: 14,
      maxTasks: 1500,
      features: {},
      isActive: true,
    },
    create: {
      name: "essential_twenty",
      displayName: "Essential Twenty",
      description: "Monthly subscription with 1500 tasks per month",
      price: 24.00,
      currency: "USD",
      billingInterval: "monthly",
      trialDays: 14,
      maxTasks: 1500,
      features: {},
      isActive: true,
    },
  });

  console.log("✅ Created Essential Twenty Plan");

  const businessProPlan = await prisma.subscriptionPlan.upsert({
    where: { name: "business_pro" },
    update: {
      displayName: "Business Pro",
      description: "Monthly subscription with 2000 tasks per month",
      price: 49.00,
      currency: "USD",
      billingInterval: "monthly",
      trialDays: 14,
      maxTasks: 2000,
      features: {},
      isActive: true,
    },
    create: {
      name: "business_pro",
      displayName: "Business Pro",
      description: "Monthly subscription with 2000 tasks per month",
      price: 49.00,
      currency: "USD",
      billingInterval: "monthly",
      trialDays: 14,
      maxTasks: 2000,
      features: {},
      isActive: true,
    },
  });

  console.log("✅ Created Business Pro Plan");

  const focusMasterPlan = await prisma.subscriptionPlan.upsert({
    where: { name: "focus_master" },
    update: {
      displayName: "Focus Master Plan",
      description: "Monthly subscription with unlimited tasks and 7 workspaces max",
      price: 20.00,
      currency: "USD",
      billingInterval: "monthly",
      trialDays: 14,
      maxTasks: null, // Unlimited tasks
      features: {},
      isActive: true,
    },
    create: {
      name: "focus_master",
      displayName: "Focus Master Plan",
      description: "Monthly subscription with unlimited tasks and 7 workspaces max",
      price: 20.00,
      currency: "USD",
      billingInterval: "monthly",
      trialDays: 14,
      maxTasks: null, // Unlimited tasks
      features: {},
      isActive: true,
    },
  });

  console.log("✅ Created Focus Master Plan");

  const performanceFounderPlan = await prisma.subscriptionPlan.upsert({
    where: { name: "performance_founder" },
    update: {
      displayName: "Performance Founder Plan",
      description: "Yearly subscription with unlimited tasks and 12 workspaces max",
      price: 200.00,
      currency: "USD",
      billingInterval: "yearly",
      trialDays: 14,
      maxTasks: null, // Unlimited tasks
      features: {},
      isActive: true,
    },
    create: {
      name: "performance_founder",
      displayName: "Performance Founder Plan",
      description: "Yearly subscription with unlimited tasks and 12 workspaces max",
      price: 200.00,
      currency: "USD",
      billingInterval: "yearly",
      trialDays: 14,
      maxTasks: null, // Unlimited tasks
      features: {},
      isActive: true,
    },
  });

  console.log("✅ Created Performance Founder Plan");
  console.log("✅ Subscription seeding completed!\n");
}

/**
 * Update Stripe IDs
 * Updates subscription plans with Stripe IDs from environment variables
 */
async function updateStripeIds() {
  console.log("🔗 Updating subscription plans with Stripe IDs from environment variables...\n");

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

  try {
    // Update Clarity Plan (trial) - optional
    if (clarityPriceId && clarityProductId) {
      await prisma.subscriptionPlan.update({
        where: { name: "trial" },
        data: {
          stripePriceId: clarityPriceId,
          stripeProductId: clarityProductId,
        },
      });
      console.log("✅ Updated Clarity Plan with Stripe IDs");
    } else {
      console.log("⚠️  Clarity Plan not updated (STRIPE_CLARITY_PRICE_ID and STRIPE_CLARITY_PRODUCT_ID not set)");
    }

    // Update Pro Plan - Monthly
    if (monthlyPriceId && monthlyProductId) {
      await prisma.subscriptionPlan.update({
        where: { name: "monthly" },
        data: {
          stripePriceId: monthlyPriceId,
          stripeProductId: monthlyProductId,
        },
      });
      console.log("✅ Updated Pro Plan - Monthly with Stripe IDs");
    } else {
      console.log("⚠️  Pro Plan - Monthly not updated (Stripe IDs not set)");
    }

    // Update Pro Plan - Yearly
    if (yearlyPriceId && yearlyProductId) {
      await prisma.subscriptionPlan.update({
        where: { name: "yearly" },
        data: {
          stripePriceId: yearlyPriceId,
          stripeProductId: yearlyProductId,
        },
      });
      console.log("✅ Updated Pro Plan - Yearly with Stripe IDs");
    } else {
      console.log("⚠️  Pro Plan - Yearly not updated (Stripe IDs not set)");
    }

    // Update Essential Twenty Plan
    if (essentialTwentyPriceId && essentialTwentyProductId) {
      await prisma.subscriptionPlan.update({
        where: { name: "essential_twenty" },
        data: {
          stripePriceId: essentialTwentyPriceId,
          stripeProductId: essentialTwentyProductId,
        },
      });
      console.log("✅ Updated Essential Twenty Plan with Stripe IDs");
    } else {
      console.log("⚠️  Essential Twenty Plan not updated (Stripe IDs not set)");
    }

    // Update Business Pro Plan
    if (businessProPriceId && businessProProductId) {
      await prisma.subscriptionPlan.update({
        where: { name: "business_pro" },
        data: {
          stripePriceId: businessProPriceId,
          stripeProductId: businessProProductId,
        },
      });
      console.log("✅ Updated Business Pro Plan with Stripe IDs");
    } else {
      console.log("⚠️  Business Pro Plan not updated (Stripe IDs not set)");
    }

    // Update Focus Master Plan
    if (focusMasterPriceId && focusMasterProductId) {
      await prisma.subscriptionPlan.update({
        where: { name: "focus_master" },
        data: {
          stripePriceId: focusMasterPriceId,
          stripeProductId: focusMasterProductId,
        },
      });
      console.log("✅ Updated Focus Master Plan with Stripe IDs");
    } else {
      console.log("⚠️  Focus Master Plan not updated (Stripe IDs not set)");
    }

    // Update Performance Founder Plan
    if (founderPriceId && founderProductId) {
      await prisma.subscriptionPlan.update({
        where: { name: "performance_founder" },
        data: {
          stripePriceId: founderPriceId,
          stripeProductId: founderProductId,
        },
      });
      console.log("✅ Updated Performance Founder Plan with Stripe IDs");
    } else {
      console.log("⚠️  Performance Founder Plan not updated (Stripe IDs not set)");
    }

    console.log("✅ Stripe IDs update completed!\n");
  } catch (error: any) {
    console.error("❌ Error updating subscription plans:", error);
    if (error.code === "P2025") {
      console.error("   Subscription plans not found. Make sure seed-subscriptions ran first.");
    }
    throw error;
  }
}

/**
 * Seed Referral Programs
 * Creates the Origin 1000 and Vanguard 300 referral programs
 */
async function seedReferralPrograms() {
  console.log("🌱 Seeding referral programs...");

  // Seed Origin 1000 program
  const originProgram = await prisma.referralProgram.upsert({
    where: { name: "Origin 1000" },
    update: {},
    create: {
      name: "Origin 1000",
      description: "Founding members tier for the first 1000 users",
      totalSeats: 1000,
      requiredReferrals: 0,
      isActive: true,
    },
  });

  console.log("✅ Origin 1000 program seeded");

  // Seed Vanguard 300 program
  const vanguardProgram = await prisma.referralProgram.upsert({
    where: { name: "Vanguard 300" },
    update: {},
    create: {
      name: "Vanguard 300",
      description: "Elite tier of early access for the first 300 users who recruit 3+ others",
      totalSeats: 300,
      requiredReferrals: 3,
      isActive: true,
    },
  });

  console.log("✅ Vanguard 300 program seeded");
  console.log("✅ Referral programs seeding completed!\n");
}

/**
 * Seed Focus Room Templates
 * Creates default focus room templates for users
 */
async function seedFocusRoomTemplates() {
  console.log("🌱 Seeding Focus Room Templates...");

  // Get or create a system user (admin user with ID 1, or create one)
  let systemUserId = 1;
  const systemUser = await prisma.user.findUnique({
    where: { id: systemUserId },
  });

  if (!systemUser) {
    console.log("⚠️  System user not found. Please create an admin user first.");
    console.log("   Templates will be created with creatorId = 1");
  }

  const templates = [
    {
      name: "Pomodoro Deep Work",
      description: "Classic Pomodoro technique for deep, focused work sessions",
      category: "DEEP_WORK" as const,
      focusDuration: 25,
      breakDuration: 5,
      allowObservers: true,
      visibility: "PUBLIC" as const,
      isSystem: true,
    },
    {
      name: "Creative Flow",
      description: "Extended sessions for creative work and ideation",
      category: "CREATIVE" as const,
      focusDuration: 50,
      breakDuration: 10,
      allowObservers: true,
      visibility: "PUBLIC" as const,
      isSystem: true,
    },
    {
      name: "Study Session",
      description: "Optimized for learning and studying",
      category: "LEARNING" as const,
      focusDuration: 30,
      breakDuration: 8,
      allowObservers: true,
      visibility: "PUBLIC" as const,
      isSystem: true,
    },
    {
      name: "Strategic Planning",
      description: "Short focused sessions for planning and strategy",
      category: "PLANNING" as const,
      focusDuration: 20,
      breakDuration: 5,
      allowObservers: true,
      visibility: "PUBLIC" as const,
      isSystem: true,
    },
  ];

  for (const template of templates) {
    // Check if template already exists
    const existing = await prisma.focusRoomTemplate.findFirst({
      where: {
        name: template.name,
        isSystem: true,
      },
    });

    if (existing) {
      console.log(`⏭️  Template "${template.name}" already exists, skipping...`);
      continue;
    }

    try {
      await prisma.focusRoomTemplate.create({
        data: {
          ...template,
          creatorId: systemUserId,
          settings: {},
        },
      });
      console.log(`✅ Created template: ${template.name}`);
    } catch (error: any) {
      console.error(`❌ Error creating template "${template.name}":`, error.message);
    }
  }

  console.log("✅ Focus Room Templates seeding completed!\n");
}

/**
 * Main seed function
 * Runs all seeding scripts in the correct order
 */
async function main() {
  try {
    console.log("🚀 Starting database seeding...\n");

    // 1. Seed subscriptions
    await seedSubscriptions();

    // 2. Update Stripe IDs
    await updateStripeIds();

    // 3. Seed referral programs
    await seedReferralPrograms();

    // 4. Seed focus room templates
    await seedFocusRoomTemplates();

    console.log("✨ All seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error during seeding:", error);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

