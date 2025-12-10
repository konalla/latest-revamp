import prisma from "../src/config/prisma.js";
import { statusAssignmentService } from "../src/services/status-assignment.service.js";

async function updateAllPayingUsersOriginBadge() {
  try {
    console.log("\n🔍 Finding all paying users to assign/update Origin badges...\n");

    // Find all users who have made at least one successful payment
    const payingUsers = await prisma.user.findMany({
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
      orderBy: {
        id: "asc",
      },
    });

    console.log(`Found ${payingUsers.length} paying user(s)\n`);

    if (payingUsers.length === 0) {
      console.log("✅ No paying users found\n");
      return;
    }

    let assignedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const user of payingUsers) {
      const firstPayment = user.subscription?.payments?.[0];
      const currentStatus = user.referralStatus?.earlyAccessStatus || "NONE";
      const hasOriginId = !!user.referralStatus?.originId;
      const hasVanguardId = !!user.referralStatus?.vanguardId;

      console.log(`Processing user: ${user.email} (ID: ${user.id})`);
      console.log(`  Current Status: ${currentStatus}`);
      console.log(`  Origin ID: ${user.referralStatus?.originId || "N/A"}`);
      console.log(`  Vanguard ID: ${user.referralStatus?.vanguardId || "N/A"}`);
      console.log(`  First Payment: $${firstPayment?.amount} on ${firstPayment?.createdAt}`);

      // If user already has VANGUARD status, only update Origin ID if missing
      // Don't try to assign Origin status (they already have VANGUARD which is higher)
      if (currentStatus === "VANGUARD") {
        if (!hasOriginId) {
          console.log(`  ⚠️  User has VANGUARD but no Origin ID. Adding Origin ID...`);
          try {
            // Find the highest Origin ID number to assign the next one
            const allOriginUsers = await prisma.userReferralStatus.findMany({
              where: {
                OR: [
                  { earlyAccessStatus: "ORIGIN" },
                  { earlyAccessStatus: "VANGUARD" },
                ],
                originId: { not: null },
              },
              select: {
                originId: true,
              },
            });

            // Extract numbers and find the highest
            let maxOriginNumber = 0;
            for (const user of allOriginUsers) {
              if (user.originId) {
                const match = user.originId.match(/ORG-(\d+)/);
                if (match) {
                  const num = parseInt(match[1]);
                  if (num > maxOriginNumber) {
                    maxOriginNumber = num;
                  }
                }
              }
            }

            const originId = `ORG-${(maxOriginNumber + 1).toString().padStart(3, "0")}`;
            
            await prisma.userReferralStatus.update({
              where: { userId: user.id },
              data: {
                originId,
              },
            });
            
            console.log(`  ✅ Added Origin ID: ${originId} (user keeps VANGUARD status)`);
            updatedCount++;
          } catch (error: any) {
            console.error(`  ❌ Error adding Origin ID: ${error.message}`);
            errorCount++;
          }
        } else {
          console.log(`  ✅ User has VANGUARD status with Origin ID (${user.referralStatus.originId}), skipping`);
          skippedCount++;
        }
        console.log("");
        continue;
      }

      // If user already has ORIGIN status with Origin ID, check if it needs update
      if (currentStatus === "ORIGIN" && hasOriginId) {
        console.log(`  ✅ User already has ORIGIN status with Origin ID, skipping`);
        skippedCount++;
        console.log("");
        continue;
      }

      // If user has ORIGIN status but no Origin ID, update to add ID
      if (currentStatus === "ORIGIN" && !hasOriginId) {
        console.log(`  ⚠️  User has ORIGIN status but no Origin ID. Updating...`);
        try {
          const originCount = await prisma.userReferralStatus.count({
            where: {
              earlyAccessStatus: {
                in: ["ORIGIN", "VANGUARD"],
              },
            },
          });
          
          const originId = `ORG-${(originCount + 1).toString().padStart(3, "0")}`;
          
          await prisma.userReferralStatus.update({
            where: { userId: user.id },
            data: {
              originId,
            },
          });
          
          console.log(`  ✅ Added Origin ID: ${originId}`);
          updatedCount++;
        } catch (error: any) {
          console.error(`  ❌ Error adding Origin ID: ${error.message}`);
          errorCount++;
        }
        console.log("");
        continue;
      }

      // User doesn't have Origin status - assign it
      try {
        const result = await statusAssignmentService.assignOriginStatus(user.id);
        if (result.success) {
          console.log(`  ✅ ${result.message}`);
          assignedCount++;
        } else {
          console.log(`  ⚠️  ${result.message}`);
          // Check if it's because seats are full
          if (result.message?.includes("seats are full")) {
            console.log(`  ⚠️  Origin 1000 seats are full, cannot assign`);
            skippedCount++;
          } else {
            errorCount++;
          }
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
    console.log(`Total paying users found: ${payingUsers.length}`);
    console.log(`✅ Origin status assigned (new): ${assignedCount}`);
    console.log(`🔄 Origin ID updated/added: ${updatedCount}`);
    console.log(`⏭️  Skipped (already has Origin/Vanguard): ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log("=".repeat(60) + "\n");

  } catch (error: any) {
    console.error("Error updating Origin badges:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
updateAllPayingUsersOriginBadge()
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });

