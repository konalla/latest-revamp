import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

const prisma = new PrismaClient();

// Initialize Stripe only if STRIPE_SECRET_KEY is set
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-10-29.clover",
    })
  : null;

async function cleanupSubscriptions(options: {
  deleteStripeSubscriptions?: boolean;
  deletePayments?: boolean;
}) {
  console.log("Starting subscription cleanup...\n");

  try {
    // Get all subscriptions
    const subscriptions = await prisma.subscription.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
      },
    });

    console.log(`Found ${subscriptions.length} subscription(s) to clean up\n`);

    if (subscriptions.length === 0) {
      console.log("No subscriptions found. Nothing to clean up.");
      return;
    }

    // Display subscriptions that will be deleted
    console.log("Subscriptions to be deleted:");
    subscriptions.forEach((sub, index) => {
      console.log(
        `${index + 1}. User: ${sub.user.email} (${sub.user.username}) - Status: ${sub.status} - Stripe ID: ${sub.stripeSubscriptionId || "None"}`
      );
    });
    console.log("");

    // Delete Stripe subscriptions if requested and Stripe is configured
    if (options.deleteStripeSubscriptions && stripe) {
      console.log("Deleting Stripe subscriptions...");
      for (const subscription of subscriptions) {
        if (subscription.stripeSubscriptionId) {
          try {
            await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
            console.log(
              `  ✓ Deleted Stripe subscription: ${subscription.stripeSubscriptionId}`
            );
          } catch (error: any) {
            console.error(
              `  ✗ Failed to delete Stripe subscription ${subscription.stripeSubscriptionId}: ${error.message}`
            );
            // Continue with other subscriptions even if one fails
          }
        }
      }
      console.log("");
    } else if (options.deleteStripeSubscriptions && !stripe) {
      console.log(
        "⚠ Warning: STRIPE_SECRET_KEY not set. Skipping Stripe subscription deletion.\n"
      );
    }

    // Delete payments if requested
    if (options.deletePayments) {
      console.log("Deleting payment records...");
      const paymentCount = await prisma.payment.deleteMany({});
      console.log(`  ✓ Deleted ${paymentCount.count} payment record(s)\n`);
    }

    // Delete all subscriptions from database
    console.log("Deleting subscriptions from database...");
    const deleteResult = await prisma.subscription.deleteMany({});
    console.log(`  ✓ Deleted ${deleteResult.count} subscription(s) from database\n`);

    console.log("✅ Cleanup completed successfully!");
    console.log("\nAll subscriptions have been removed.");
    console.log("Users can now register and set up new subscriptions with the new flow.");
  } catch (error: any) {
    console.error("❌ Error during cleanup:", error);
    throw error;
  }
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const deleteStripe = args.includes("--delete-stripe") || args.includes("-s");
  const deletePayments = args.includes("--delete-payments") || args.includes("-p");

  console.log("=".repeat(60));
  console.log("Subscription Cleanup Script");
  console.log("=".repeat(60));
  console.log("");

  if (deleteStripe) {
    console.log("⚠ WARNING: This will delete Stripe subscriptions!");
    console.log("⚠ Make sure you're running this in TEST mode only!\n");
  }

  console.log("Options:");
  console.log(`  - Delete Stripe subscriptions: ${deleteStripe ? "YES" : "NO"}`);
  console.log(`  - Delete payment records: ${deletePayments ? "YES" : "NO"}`);
  console.log("");

  // Run cleanup
  await cleanupSubscriptions({
    deleteStripeSubscriptions: deleteStripe,
    deletePayments: deletePayments,
  });
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

