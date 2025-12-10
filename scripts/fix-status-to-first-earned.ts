import prisma from "../src/config/prisma.js";

async function fixStatusToFirstEarned() {
  try {
    console.log("\n🔍 Finding users with both Origin and Vanguard IDs...\n");

    // Find users who have both IDs
    const usersWithBothIds = await prisma.userReferralStatus.findMany({
      where: {
        AND: [
          { originId: { not: null } },
          { vanguardId: { not: null } },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    console.log(`Found ${usersWithBothIds.length} user(s) with both IDs\n`);

    if (usersWithBothIds.length === 0) {
      console.log("✅ No users found with both IDs\n");
      return;
    }

    for (const userStatus of usersWithBothIds) {
      console.log(`Processing user: ${userStatus.user.email} (ID: ${userStatus.user.id})`);
      console.log(`  Current Status: ${userStatus.earlyAccessStatus}`);
      console.log(`  Origin ID: ${userStatus.originId}`);
      console.log(`  Vanguard ID: ${userStatus.vanguardId}`);

      // Determine which was earned first based on ID numbers
      // Lower ID number = earned earlier
      const originRank = userStatus.originId ? parseInt(userStatus.originId.replace("ORG-", "")) : Infinity;
      const vanguardRank = userStatus.vanguardId ? parseInt(userStatus.vanguardId.replace("VNG-", "")) : Infinity;

      // Check which was earned first (lower rank = earlier)
      let firstEarnedStatus: "ORIGIN" | "VANGUARD";
      
      if (originRank < vanguardRank) {
        firstEarnedStatus = "ORIGIN";
        console.log(`  ✅ Origin was earned first (ORG-${originRank} vs VNG-${vanguardRank})`);
      } else if (vanguardRank < originRank) {
        firstEarnedStatus = "VANGUARD";
        console.log(`  ✅ Vanguard was earned first (VNG-${vanguardRank} vs ORG-${originRank})`);
      } else {
        // If ranks are equal or can't determine, check creation timestamps
        // For now, default to ORIGIN if both exist (Origin is typically earned first via payment)
        firstEarnedStatus = "ORIGIN";
        console.log(`  ⚠️  Cannot determine from ranks, defaulting to ORIGIN`);
      }

      // Update status to first earned if different
      if (userStatus.earlyAccessStatus !== firstEarnedStatus) {
        await prisma.userReferralStatus.update({
          where: { userId: userStatus.userId },
          data: {
            earlyAccessStatus: firstEarnedStatus,
          },
        });
        console.log(`  ✅ Updated status from ${userStatus.earlyAccessStatus} to ${firstEarnedStatus}`);
      } else {
        console.log(`  ✅ Status already correct: ${firstEarnedStatus}`);
      }

      console.log("");
    }

    console.log("=".repeat(60));
    console.log("📊 SUMMARY:");
    console.log("=".repeat(60));
    console.log(`Total users processed: ${usersWithBothIds.length}`);
    console.log("=".repeat(60) + "\n");

  } catch (error: any) {
    console.error("Error fixing statuses:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
fixStatusToFirstEarned()
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });

