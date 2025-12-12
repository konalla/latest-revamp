import prisma from "../src/config/prisma.js";
import { statusAssignmentService } from "../src/services/status-assignment.service.js";

/**
 * Script to assign Origin 1000 status to existing paying users who don't have it
 * This backfills users who paid before the Origin assignment logic was working
 */
async function assignOriginToPayingUsers() {
  try {
    console.log("Finding paying users without Origin/Vanguard status...");

    // Find all users with active subscriptions or successful payments
    const payingUsers = await prisma.user.findMany({
      where: {
        OR: [
          {
            subscription: {
              status: {
                in: ["ACTIVE", "TRIAL"],
              },
            },
          },
          {
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
        ],
      },
      include: {
        subscription: {
          include: {
            payments: {
              where: {
                status: "succeeded",
                amount: {
                  gt: 0,
                },
              },
            },
          },
        },
        referralStatus: true,
      },
    });

    console.log(`Found ${payingUsers.length} paying users`);

    let assigned = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of payingUsers) {
      try {
        // Skip if user already has Origin or Vanguard status
        if (user.referralStatus) {
          const status = user.referralStatus.earlyAccessStatus;
          if (status === "ORIGIN" || status === "VANGUARD") {
            console.log(`User ${user.id} (${user.email}) already has ${status} status - skipping`);
            skipped++;
            continue;
          }
        }

        // Check if user has at least one successful payment
        const hasPayment = user.subscription?.payments && user.subscription.payments.length > 0;
        if (!hasPayment && user.subscription?.status !== "ACTIVE") {
          console.log(`User ${user.id} (${user.email}) has no successful payments - skipping`);
          skipped++;
          continue;
        }

        // Assign Origin status
        console.log(`Assigning Origin status to user ${user.id} (${user.email})...`);
        const result = await statusAssignmentService.assignOriginStatus(user.id);

        if (result.success) {
          console.log(`✓ ${result.message}`);
          assigned++;
        } else {
          console.log(`✗ Failed: ${result.message}`);
          if (result.message?.includes("seats are full")) {
            console.log("  → Origin 1000 seats are full, stopping assignment");
            break;
          }
          errors++;
        }
      } catch (error: any) {
        console.error(`Error processing user ${user.id}:`, error.message);
        errors++;
      }
    }

    console.log("\n=== Summary ===");
    console.log(`Total paying users: ${payingUsers.length}`);
    console.log(`Origin status assigned: ${assigned}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
  } catch (error) {
    console.error("Error in script:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

assignOriginToPayingUsers();

