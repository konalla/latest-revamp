#!/usr/bin/env tsx

import prisma from "../src/config/prisma.js";

/**
 * Script to finish existing 3-day trial users
 * This expires their trial immediately, forcing them to subscribe to a paid plan
 */
async function finish3DayTrialUsers() {
  try {
    console.log("🔍 Finding users with 3-day trial subscriptions...");

    // Find all subscriptions with TRIAL status
    const trialSubscriptions = await prisma.subscription.findMany({
      where: {
        status: "TRIAL",
        subscriptionPlan: {
          name: "trial", // Only the old trial plan
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        subscriptionPlan: true,
      },
    });

    console.log(`📊 Found ${trialSubscriptions.length} users with 3-day trial subscriptions`);

    if (trialSubscriptions.length === 0) {
      console.log("✅ No 3-day trial users found. Nothing to update.");
      return;
    }

    let updated = 0;
    let errors = 0;

    for (const subscription of trialSubscriptions) {
      try {
        // Check if trial has already ended
        const now = new Date();
        const trialEnded = subscription.trialEnd && now >= subscription.trialEnd;

        if (trialEnded) {
          console.log(`⏭️  Skipping user ${subscription.userId} (${subscription.user.email}) - trial already ended`);
          continue;
        }

        // Expire the trial immediately
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: "EXPIRED",
            trialEnd: now, // Set trial end to now
          },
        });

        console.log(`✅ Expired trial for user ${subscription.userId} (${subscription.user.email})`);
        updated++;
      } catch (error: any) {
        console.error(`❌ Error updating subscription for user ${subscription.userId}:`, error.message);
        errors++;
      }
    }

    console.log("\n📈 Summary:");
    console.log(`   ✅ Updated: ${updated} subscriptions`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📊 Total processed: ${trialSubscriptions.length}`);

    if (updated > 0) {
      console.log("\n💡 Note: These users will need to subscribe to a paid plan to continue using the service.");
      console.log("   All paid plans now have a 7-day trial period.");
    }
  } catch (error) {
    console.error("❌ Error finishing 3-day trial users:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
finish3DayTrialUsers()
  .then(() => {
    console.log("\n🎉 Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });


