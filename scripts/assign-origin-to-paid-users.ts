import prisma from "../src/config/prisma.js";
import { statusAssignmentService } from "../src/services/status-assignment.service.js";

async function assignOriginToPaidUsers() {
  try {
    console.log("\n🔍 Finding users who have paid but don't have Origin status...\n");

    // Find all users who:
    // 1. Have made at least one successful payment
    // 2. Don't have Origin or Vanguard status
    const usersWithoutOrigin = await prisma.user.findMany({
      where: {
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
        OR: [
          {
            referralStatus: null,
          },
          {
            referralStatus: {
              earlyAccessStatus: "NONE",
            },
          },
        ],
      },
      include: {
        referralStatus: true,
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

    console.log(`Found ${usersWithoutOrigin.length} user(s) who paid but don't have Origin status\n`);

    if (usersWithoutOrigin.length === 0) {
      console.log("✅ No users found who need Origin status\n");
      return;
    }

    let assignedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const user of usersWithoutOrigin) {
      const firstPayment = user.subscription?.payments?.[0];
      
      console.log(`Processing user: ${user.email} (ID: ${user.id})`);
      console.log(`  Current Status: ${user.referralStatus?.earlyAccessStatus || "NONE"}`);
      console.log(`  First Payment: $${firstPayment?.amount} on ${firstPayment?.createdAt}`);

      // Check if user already has Origin or Vanguard
      if (user.referralStatus?.earlyAccessStatus === "ORIGIN" || 
          user.referralStatus?.earlyAccessStatus === "VANGUARD") {
        console.log(`  ⏭️  Skipping: Already has ${user.referralStatus.earlyAccessStatus} status`);
        skippedCount++;
        console.log("");
        continue;
      }

      try {
        const result = await statusAssignmentService.assignOriginStatus(user.id);
        if (result.success) {
          console.log(`  ✅ ${result.message}`);
          assignedCount++;
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
    console.log(`Total users found: ${usersWithoutOrigin.length}`);
    console.log(`✅ Origin status assigned: ${assignedCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log("=".repeat(60) + "\n");

  } catch (error: any) {
    console.error("Error assigning Origin status:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
assignOriginToPaidUsers()
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });

