/*
  Warnings:

  - A unique constraint covering the columns `[redemptionId]` on the table `wallet_transactions` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."RedemptionStatus" AS ENUM ('PENDING', 'FULFILLED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "public"."WalletTransactionCategory" ADD VALUE 'REDEMPTION';

-- AlterEnum
ALTER TYPE "public"."WalletTransactionType" ADD VALUE 'REDEEMED';

-- AlterTable
ALTER TABLE "public"."wallet_transactions" ADD COLUMN     "redemptionId" INTEGER;

-- CreateTable
CREATE TABLE "public"."redeemable_items" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "requiredCredits" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "variantOptions" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "redeemable_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."redemptions" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "redeemableItemId" INTEGER NOT NULL,
    "creditsDeducted" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "status" "public"."RedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "selectedVariant" JSONB DEFAULT '{}',
    "webhookSent" BOOLEAN NOT NULL DEFAULT false,
    "webhookSentAt" TIMESTAMP(3),
    "webhookRetryCount" INTEGER NOT NULL DEFAULT 0,
    "fulfillmentNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "redeemable_items_name_key" ON "public"."redeemable_items"("name");

-- CreateIndex
CREATE INDEX "redeemable_items_isActive_sortOrder_idx" ON "public"."redeemable_items"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "redemptions_userId_createdAt_idx" ON "public"."redemptions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "redemptions_status_idx" ON "public"."redemptions"("status");

-- CreateIndex
CREATE INDEX "redemptions_webhookSent_idx" ON "public"."redemptions"("webhookSent");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_redemptionId_key" ON "public"."wallet_transactions"("redemptionId");

-- AddForeignKey
ALTER TABLE "public"."wallet_transactions" ADD CONSTRAINT "wallet_transactions_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "public"."redemptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."redemptions" ADD CONSTRAINT "redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."redemptions" ADD CONSTRAINT "redemptions_redeemableItemId_fkey" FOREIGN KEY ("redeemableItemId") REFERENCES "public"."redeemable_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
