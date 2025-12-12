import prisma from "../src/config/prisma.js";
import { statusAssignmentService } from "../src/services/status-assignment.service.js";

async function checkReferrerStatus(email: string) {
  try {
    console.log(`\n🔍 Checking referrer status for: ${email}\n`);

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        referralStatus: true,
        referralsMade: {
          where: {
            status: "COMPLETED",
          },
          include: {
            referred: {
              select: {
                id: true,
                email: true,
                name: true,
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
    console.log(`   Email: ${user.email}`);

    // Check referral status
    if (user.referralStatus) {
      console.log("\n🏆 Current Badge Status:");
      console.log(`   Early Access Status: ${user.referralStatus.earlyAccessStatus}`);
      console.log(`   Origin ID: ${user.referralStatus.originId || "N/A"}`);
      console.log(`   Vanguard ID: ${user.referralStatus.vanguardId || "N/A"}`);
      console.log(`   Referral Code: ${user.referralStatus.referralCode}`);
    } else {
      console.log("\n⚠️  User has no referral status record");
    }

    // Check referrals
    console.log(`\n📊 Referral Statistics:`);
    console.log(`   Total Referrals Made: ${user.referralsMade.length}`);
    
    const allReferrals = await prisma.referral.findMany({
      where: {
        referrerId: user.id,
      },
    });

    const registeredCount = allReferrals.filter(r => r.status === "REGISTERED").length;
    const completedCount = allReferrals.filter(r => r.status === "COMPLETED").length;
    const invitedCount = allReferrals.filter(r => r.status === "INVITED").length;

    console.log(`   Completed: ${completedCount}`);
    console.log(`   Registered: ${registeredCount}`);
    console.log(`   Invited: ${invitedCount}`);

    if (user.referralsMade.length > 0) {
      console.log("\n👥 Completed Referrals:");
      user.referralsMade.forEach((referral, index) => {
        console.log(`   ${index + 1}. ${referral.referred.email} (ID: ${referral.referred.id})`);
        console.log(`      Status: ${referral.status}`);
        console.log(`      Completed At: ${referral.completedAt || "N/A"}`);
      });
    }

    // Check seat availability
    const seats = await statusAssignmentService.calculateSeatsRemaining();
    console.log("\n🎫 Seat Availability:");
    console.log(`   Vanguard Seats Remaining: ${seats.vanguardRemaining}/${seats.vanguardTotal}`);
    console.log(`   Origin Seats Remaining: ${seats.originRemaining}/${seats.originTotal}`);

    // Check Vanguard eligibility
    console.log("\n🔍 Vanguard Eligibility Check:");
    console.log(`   Completed Referrals: ${completedCount}`);
    console.log(`   Required: 3`);
    console.log(`   Vanguard Seats Available: ${seats.vanguardRemaining > 0 ? "Yes" : "No"}`);
    
    if (completedCount >= 3 && seats.vanguardRemaining > 0) {
      console.log(`   ✅ ELIGIBLE for Vanguard 300!`);
      
      if (user.referralStatus?.earlyAccessStatus !== "VANGUARD") {
        console.log(`   ⚠️  Status not assigned yet. Attempting to assign...`);
        
        try {
          const result = await statusAssignmentService.checkAndUpdateUserStatus(user.id);
          if (result.updated) {
            console.log(`   ✅ Status updated successfully!`);
            console.log(`   New Status: ${result.newStatus}`);
          } else {
            console.log(`   ⚠️  Status update returned: updated=${result.updated}`);
            if (result.previousStatus) {
              console.log(`   Previous Status: ${result.previousStatus}`);
            }
            if (result.newStatus) {
              console.log(`   New Status: ${result.newStatus}`);
            }
          }
        } catch (error: any) {
          console.error(`   ❌ Error updating status: ${error.message}`);
        }
      } else {
        console.log(`   ✅ Already has Vanguard status`);
      }
    } else {
      if (completedCount < 3) {
        console.log(`   ❌ Not eligible: Need ${3 - completedCount} more completed referral(s)`);
      }
      if (seats.vanguardRemaining === 0) {
        console.log(`   ❌ Not eligible: Vanguard seats are full`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 SUMMARY:");
    console.log("=".repeat(60));
    console.log(`Current Status: ${user.referralStatus?.earlyAccessStatus || "NONE"}`);
    console.log(`Completed Referrals: ${completedCount}/3`);
    console.log(`Vanguard Eligibility: ${completedCount >= 3 && seats.vanguardRemaining > 0 ? "YES" : "NO"}`);
    console.log("=".repeat(60) + "\n");

  } catch (error: any) {
    console.error("Error checking referrer status:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.error("Usage: npx tsx scripts/check-referrer-status.ts <email>");
  console.error("Example: npx tsx scripts/check-referrer-status.ts moeen.ahmed.dev@gmail.com");
  process.exit(1);
}

checkReferrerStatus(email)
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });

