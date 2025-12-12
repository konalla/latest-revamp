import prisma from "../src/config/prisma.js";

async function setStatusToVanguard(email: string) {
  try {
    console.log(`\n🔍 Setting status to VANGUARD for: ${email}\n`);

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        referralStatus: true,
      },
    });

    if (!user) {
      console.log("❌ User not found with email:", email);
      return;
    }

    console.log("✅ User Found:");
    console.log(`   ID: ${user.id}`);
    console.log(`   Name: ${user.name || "N/A"}`);
    console.log(`   Email: ${user.email}`);

    if (!user.referralStatus) {
      console.log("❌ User has no referral status record");
      return;
    }

    console.log("\n📊 Current Status:");
    console.log(`   Early Access Status: ${user.referralStatus.earlyAccessStatus}`);
    console.log(`   Origin ID: ${user.referralStatus.originId || "N/A"}`);
    console.log(`   Vanguard ID: ${user.referralStatus.vanguardId || "N/A"}`);

    // Update status to VANGUARD
    await prisma.userReferralStatus.update({
      where: { userId: user.id },
      data: {
        earlyAccessStatus: "VANGUARD",
        // Keep both IDs
        originId: user.referralStatus.originId,
        vanguardId: user.referralStatus.vanguardId || "VNG-001",
      },
    });

    console.log("\n✅ Status updated to VANGUARD");
    console.log("\n📊 Updated Status:");
    console.log(`   Early Access Status: VANGUARD`);
    console.log(`   Origin ID: ${user.referralStatus.originId || "N/A"}`);
    console.log(`   Vanguard ID: ${user.referralStatus.vanguardId || "VNG-001"}`);

    console.log("\n" + "=".repeat(60));
    console.log("✅ SUCCESS: Status set to VANGUARD for frontend testing");
    console.log("=".repeat(60) + "\n");

  } catch (error: any) {
    console.error("Error setting status to VANGUARD:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.error("Usage: npx tsx scripts/set-status-to-vanguard.ts <email>");
  console.error("Example: npx tsx scripts/set-status-to-vanguard.ts moeen.ahmed.dev@gmail.com");
  process.exit(1);
}

setStatusToVanguard(email)
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });

