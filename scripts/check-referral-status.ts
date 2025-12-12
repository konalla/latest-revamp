import { PrismaClient } from "@prisma/client";
import prisma from "../src/config/prisma.js";

async function checkReferralStatus(email: string) {
  try {
    console.log(`\n🔍 Checking referral status for: ${email}\n`);

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        referralStatus: true,
        referralsReceived: {
          include: {
            referrer: {
              select: {
                id: true,
                email: true,
                name: true,
                username: true,
              },
            },
          },
          take: 1, // Only get the first one (should be unique anyway)
        },
        subscription: {
          include: {
            payments: {
              where: {
                status: "succeeded",
                amount: {
                  gt: 0,
                },
              },
              orderBy: {
                createdAt: "asc",
              },
            },
          },
        },
      },
    });

    if (!user) {
      console.log("❌ User not found with email:", email);
      return;
    }

    console.log("✅ User Found:");
    console.log(`   ID: ${user.id}`);
    console.log(`   Name: ${user.name || "N/A"}`);
    console.log(`   Username: ${user.username || "N/A"}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Created At: ${user.createdAt}`);

    // Check referral status
    if (user.referralsReceived && user.referralsReceived.length > 0) {
      const referral = user.referralsReceived[0];
      console.log("\n📋 Referral Information:");
      console.log(`   Referral ID: ${referral.id}`);
      console.log(`   Status: ${referral.status}`);
      console.log(`   Referral Code Used: ${referral.referralCode}`);
      console.log(`   Created At: ${referral.createdAt}`);
      console.log(`   Completed At: ${referral.completedAt || "Not completed yet"}`);

      if (referral.referrer) {
        console.log("\n👤 Referrer Information:");
        console.log(`   Referrer ID: ${referral.referrer.id}`);
        console.log(`   Referrer Name: ${referral.referrer.name || "N/A"}`);
        console.log(`   Referrer Email: ${referral.referrer.email}`);
        console.log(`   Referrer Username: ${referral.referrer.username || "N/A"}`);

        // Check referrer's status
        const referrerStatus = await prisma.userReferralStatus.findUnique({
          where: { userId: referral.referrer.id },
        });

        if (referrerStatus) {
          console.log("\n🏆 Referrer's Badge Status:");
          console.log(`   Early Access Status: ${referrerStatus.earlyAccessStatus}`);
          console.log(`   Origin ID: ${referrerStatus.originId || "N/A"}`);
          console.log(`   Vanguard ID: ${referrerStatus.vanguardId || "N/A"}`);

          // Count referrer's completed referrals
          const completedCount = await prisma.referral.count({
            where: {
              referrerId: referral.referrer.id,
              status: "COMPLETED",
            },
          });

          console.log(`   Completed Referrals: ${completedCount}/3 (needed for Vanguard)`);
        }
      }
    } else {
      console.log("\n❌ No referral record found for this user");
    }

    // Check user's own badge status
    if (user.referralStatus) {
      console.log("\n🏅 User's Own Badge Status:");
      console.log(`   Early Access Status: ${user.referralStatus.earlyAccessStatus}`);
      console.log(`   Origin ID: ${user.referralStatus.originId || "N/A"}`);
      console.log(`   Vanguard ID: ${user.referralStatus.vanguardId || "N/A"}`);
      console.log(`   Referral Code: ${user.referralStatus.referralCode || "N/A"}`);
    } else {
      console.log("\n⚠️  User has no referral status record");
    }

    // Check subscription and payments
    if (user.subscription) {
      console.log("\n💳 Subscription Information:");
      console.log(`   Status: ${user.subscription.status}`);
      console.log(`   Plan: ${user.subscription.subscriptionPlanId}`);
      console.log(`   Trial End: ${user.subscription.trialEnd || "N/A"}`);

      if (user.subscription.payments && user.subscription.payments.length > 0) {
        console.log(`\n💰 Payment History (${user.subscription.payments.length} payment(s)):`);
        user.subscription.payments.forEach((payment, index) => {
          console.log(`   Payment ${index + 1}:`);
          console.log(`     Amount: $${payment.amount}`);
          console.log(`     Status: ${payment.status}`);
          console.log(`     Date: ${payment.createdAt}`);
        });

        const firstPayment = user.subscription.payments[0];
        console.log(`\n   ✅ First payment made on: ${firstPayment.createdAt}`);
        console.log(`   ⚠️  Referral should be marked as COMPLETED if payment succeeded`);
      } else {
        console.log("\n   ❌ No successful payments found");
        console.log("   ⚠️  Referral will remain as REGISTERED until first payment");
      }
    } else {
      console.log("\n❌ No subscription found");
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 SUMMARY:");
    console.log("=".repeat(60));

    if (user.referralsReceived && user.referralsReceived.length > 0) {
      const referral = user.referralsReceived[0];
      console.log(`Referral Status: ${referral.status}`);
      
      if (referral.status === "REGISTERED") {
        console.log("⚠️  User has registered but referral is not yet COMPLETED");
        if (user.subscription?.payments && user.subscription.payments.length > 0) {
          console.log("⚠️  User has made payment(s) but referral status is still REGISTERED");
          console.log("   This might indicate the payment webhook didn't complete the referral");
        } else {
          console.log("ℹ️  Waiting for user's first payment to complete referral");
          console.log("   Once user makes first payment, referral will be marked as COMPLETED");
          console.log("   and referrer will get credit toward Vanguard status");
        }
      } else if (referral.status === "COMPLETED") {
        console.log("✅ Referral is COMPLETED - referrer should have received credit");
        if (referral.referrer) {
          const referrerStatus = await prisma.userReferralStatus.findUnique({
            where: { userId: referral.referrer.id },
          });
          if (referrerStatus) {
            const completedCount = await prisma.referral.count({
              where: {
                referrerId: referral.referrer.id,
                status: "COMPLETED",
              },
            });
            console.log(`   Referrer has ${completedCount}/3 completed referrals for Vanguard`);
          }
        }
      } else {
        console.log(`ℹ️  Referral status: ${referral.status}`);
      }
    } else {
      console.log("❌ User was not referred (no referral record)");
    }

    console.log("=".repeat(60) + "\n");

  } catch (error: any) {
    console.error("Error checking referral status:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.error("Usage: npx tsx scripts/check-referral-status.ts <email>");
  console.error("Example: npx tsx scripts/check-referral-status.ts moeenahmed690@gmail.com");
  process.exit(1);
}

checkReferralStatus(email)
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });

