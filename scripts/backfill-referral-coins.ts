import prisma from "../src/config/prisma.js";
import { walletService } from "../src/services/wallet.service.js";

/**
 * Script to backfill coins for existing referrals where the referred user has made at least one payment
 * 
 * This script:
 * 1. Finds all referrals
 * 2. Checks if the referred user has made at least one successful payment
 * 3. Checks if coins have already been awarded for this referral (to avoid duplicates)
 * 4. Awards coins to the referrer
 * 
 * Usage: 
 *   npx tsx scripts/backfill-referral-coins.ts           # Run with actual coin awards
 *   npx tsx scripts/backfill-referral-coins.ts --dry-run # Preview without awarding coins
 */

interface ReferralWithDetails {
  id: number;
  referrerId: number;
  referredId: number;
  referralCode: string;
  status: string;
  createdAt: Date;
  referrer: {
    id: number;
    email: string;
    name: string;
  };
  referred: {
    id: number;
    email: string;
    name: string;
  };
}

async function checkIfReferredUserHasPaid(referredUserId: number): Promise<boolean> {
  // Check if referred user has at least one successful payment
  const successfulPayment = await prisma.payment.findFirst({
    where: {
      subscription: {
        userId: referredUserId,
      },
      status: "succeeded",
      amount: {
        gt: 0,
      },
    },
  });

  return !!successfulPayment;
}

async function checkIfCoinsAlreadyAwarded(referrerId: number, referralId: number): Promise<boolean> {
  // Check if there's already a wallet transaction for this referral
  // Get wallet first
  const wallet = await prisma.wallet.findUnique({
    where: { userId: referrerId },
  });

  if (!wallet) {
    return false; // No wallet means no coins awarded yet
  }

  // Get all referral transactions for this wallet
  const referralTransactions = await prisma.walletTransaction.findMany({
    where: {
      walletId: wallet.id,
      category: "REFERRAL",
    },
  });

  // Check if any transaction has this referralId in metadata
  for (const transaction of referralTransactions) {
    const metadata = transaction.metadata as any;
    if (metadata?.referralId === referralId) {
      return true; // Coins already awarded for this referral
    }
  }

  return false;
}

async function backfillReferralCoins() {
  // Check for dry-run flag
  const isDryRun = process.argv.includes("--dry-run");

  if (isDryRun) {
    console.log("🔍 DRY RUN MODE - No coins will be awarded\n");
  }

  console.log("🚀 Starting referral coins backfill process...\n");

  try {
    // Get coin amount from environment variable (default: 100)
    const coinAmount = parseInt(process.env.REFERRAL_COIN_REWARD || "100", 10);
    console.log(`💰 Coin amount per referral: ${coinAmount} coins\n`);

    // Get all referrals
    const referrals = await prisma.referral.findMany({
      include: {
        referrer: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        referred: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    console.log(`📊 Found ${referrals.length} total referrals\n`);

    let processedCount = 0;
    let awardedCount = 0;
    let skippedNoPaymentCount = 0;
    let skippedAlreadyAwardedCount = 0;
    let errorCount = 0;

    for (const referral of referrals) {
      processedCount++;
      const referralDetails = referral as unknown as ReferralWithDetails;

      console.log(
        `[${processedCount}/${referrals.length}] Processing referral ${referral.id}: ` +
        `${referralDetails.referrer.email} → ${referralDetails.referred.email}`
      );

      // Check if coins have already been awarded
      const alreadyAwarded = await checkIfCoinsAlreadyAwarded(
        referral.referrerId,
        referral.id
      );

      if (alreadyAwarded) {
        console.log(`   ⏭️  Skipped: Coins already awarded for this referral\n`);
        skippedAlreadyAwardedCount++;
        continue;
      }

      // Check if referred user has made at least one payment
      const hasPaid = await checkIfReferredUserHasPaid(referral.referredId);

      if (!hasPaid) {
        console.log(`   ⏭️  Skipped: Referred user has not made any payment yet\n`);
        skippedNoPaymentCount++;
        continue;
      }

      // Award coins to referrer
      try {
        const referredUserDisplay =
          referralDetails.referred.name ||
          referralDetails.referred.email ||
          `User ${referral.referredId}`;

        if (isDryRun) {
          // In dry-run mode, just log what would happen
          const currentBalance = await walletService.getBalance(referral.referrerId);
          console.log(
            `   🔍 [DRY RUN] Would award ${coinAmount} coins to ${referralDetails.referrer.email} ` +
            `(Current balance: ${currentBalance}, Would be: ${currentBalance + coinAmount} coins)\n`
          );
          awardedCount++;
        } else {
          // Actually award coins
          const result = await walletService.awardCoins(
            referral.referrerId,
            coinAmount,
            "REFERRAL",
            `Earned ${coinAmount} coins from referral: ${referredUserDisplay}`,
            {
              referralId: referral.id,
              referredUserId: referral.referredId,
              backfilled: true, // Mark as backfilled
            }
          );

          if (result.success) {
            console.log(
              `   ✅ Awarded ${coinAmount} coins to ${referralDetails.referrer.email} ` +
              `(New balance: ${result.newBalance} coins)\n`
            );
            awardedCount++;
          } else {
            console.log(`   ❌ Failed to award coins: ${result.error}\n`);
            errorCount++;
          }
        }
      } catch (error: any) {
        console.log(`   ❌ Error awarding coins: ${error.message}\n`);
        errorCount++;
      }
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 BACKFILL SUMMARY");
    if (isDryRun) {
      console.log("🔍 DRY RUN MODE - No coins were actually awarded");
    }
    console.log("=".repeat(60));
    console.log(`Total referrals processed: ${processedCount}`);
    console.log(`${isDryRun ? "🔍 Would award" : "✅ Coins awarded"}: ${awardedCount}`);
    console.log(`⏭️  Skipped (no payment): ${skippedNoPaymentCount}`);
    console.log(`⏭️  Skipped (already awarded): ${skippedAlreadyAwardedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`💰 Total coins ${isDryRun ? "that would be awarded" : "awarded"}: ${awardedCount * coinAmount}`);
    console.log("=".repeat(60));

    if (isDryRun) {
      console.log("\n🔍 Dry run completed! Run without --dry-run to actually award coins.");
    } else {
      console.log("\n✅ Backfill process completed!");
    }
  } catch (error: any) {
    console.error("\n❌ Error during backfill process:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
backfillReferralCoins();

