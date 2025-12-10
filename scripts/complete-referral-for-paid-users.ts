import prisma from "../src/config/prisma.js";
import { referralService } from "../src/services/referral.service.js";

async function completeReferralsForPaidUsers() {
  try {
    console.log("\n🔍 Finding users who have paid but referrals are not completed...\n");

    // Find all users who:
    // 1. Have a referral record (were referred)
    // 2. Have made at least one successful payment
    // 3. But their referral status is still REGISTERED (not COMPLETED)

    const usersWithIncompleteReferrals = await prisma.user.findMany({
      where: {
        referralsReceived: {
          some: {
            status: "REGISTERED", // Still registered, not completed
          },
        },
        subscription: {
          payments: {
            some: {
              status: "succeeded",
              amount: {
                gt: 0,
              },
            },
          },
        },
      },
      include: {
        referralsReceived: {
          where: {
            status: "REGISTERED",
          },
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

    console.log(`Found ${usersWithIncompleteReferrals.length} user(s) with incomplete referrals\n`);

    if (usersWithIncompleteReferrals.length === 0) {
      console.log("✅ No users found with incomplete referrals\n");
      return;
    }

    let completedCount = 0;
    let errorCount = 0;

    for (const user of usersWithIncompleteReferrals) {
      const referral = user.referralsReceived[0];
      const firstPayment = user.subscription?.payments?.[0];

      console.log(`Processing user: ${user.email} (ID: ${user.id})`);
      console.log(`  Referral ID: ${referral.id}`);
      console.log(`  Referrer ID: ${referral.referrerId}`);
      console.log(`  First payment: $${firstPayment?.amount} on ${firstPayment?.createdAt}`);

      try {
        // Complete the referral
        const result = await referralService.completeReferralOnboarding(user.id);

        if (result.success) {
          console.log(`  ✅ Referral completed successfully`);
          if (result.referrerStatusUpdated) {
            console.log(`  🎉 Referrer status updated to: ${result.newReferrerStatus}`);
          }
          completedCount++;
        } else {
          console.log(`  ⚠️  ${result.message}`);
          errorCount++;
        }
      } catch (error: any) {
        console.error(`  ❌ Error: ${error.message}`);
        errorCount++;
      }

      console.log("");
    }

    console.log("=".repeat(60));
    console.log("📊 SUMMARY:");
    console.log("=".repeat(60));
    console.log(`Total users processed: ${usersWithIncompleteReferrals.length}`);
    console.log(`✅ Successfully completed: ${completedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log("=".repeat(60) + "\n");

  } catch (error: any) {
    console.error("Error completing referrals:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
completeReferralsForPaidUsers()
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });

