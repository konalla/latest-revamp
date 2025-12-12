-- CreateEnum
CREATE TYPE "public"."EarlyAccessStatus" AS ENUM ('NONE', 'ORIGIN', 'VANGUARD');

-- CreateEnum
CREATE TYPE "public"."ReferralStatus" AS ENUM ('INVITED', 'REGISTERED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."ProfileVisibility" AS ENUM ('PRIVATE', 'PUBLIC', 'FRIENDS_ONLY');

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "profileVisibility" "public"."ProfileVisibility" NOT NULL DEFAULT 'PRIVATE';

-- CreateTable
CREATE TABLE "public"."referral_programs" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "totalSeats" INTEGER NOT NULL,
    "requiredReferrals" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_referral_status" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "earlyAccessStatus" "public"."EarlyAccessStatus" NOT NULL DEFAULT 'NONE',
    "referralCode" TEXT NOT NULL,
    "rewardsUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "originId" TEXT,
    "vanguardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_referral_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."referrals" (
    "id" SERIAL NOT NULL,
    "referrerId" INTEGER NOT NULL,
    "referredId" INTEGER NOT NULL,
    "referralCode" TEXT NOT NULL,
    "status" "public"."ReferralStatus" NOT NULL DEFAULT 'INVITED',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."referral_clicks" (
    "id" SERIAL NOT NULL,
    "referralCode" TEXT NOT NULL,
    "visitorIpHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "referer" TEXT,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_programs_name_key" ON "public"."referral_programs"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_referral_status_userId_key" ON "public"."user_referral_status"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_referral_status_referralCode_key" ON "public"."user_referral_status"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "user_referral_status_originId_key" ON "public"."user_referral_status"("originId");

-- CreateIndex
CREATE UNIQUE INDEX "user_referral_status_vanguardId_key" ON "public"."user_referral_status"("vanguardId");

-- CreateIndex
CREATE INDEX "user_referral_status_referralCode_idx" ON "public"."user_referral_status"("referralCode");

-- CreateIndex
CREATE INDEX "user_referral_status_earlyAccessStatus_idx" ON "public"."user_referral_status"("earlyAccessStatus");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referredId_key" ON "public"."referrals"("referredId");

-- CreateIndex
CREATE INDEX "referrals_referrerId_status_idx" ON "public"."referrals"("referrerId", "status");

-- CreateIndex
CREATE INDEX "referrals_referralCode_idx" ON "public"."referrals"("referralCode");

-- CreateIndex
CREATE INDEX "referrals_status_idx" ON "public"."referrals"("status");

-- CreateIndex
CREATE INDEX "referral_clicks_referralCode_idx" ON "public"."referral_clicks"("referralCode");

-- CreateIndex
CREATE INDEX "referral_clicks_createdAt_idx" ON "public"."referral_clicks"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."user_referral_status" ADD CONSTRAINT "user_referral_status_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."referrals" ADD CONSTRAINT "referrals_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."referrals" ADD CONSTRAINT "referrals_referredId_fkey" FOREIGN KEY ("referredId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
