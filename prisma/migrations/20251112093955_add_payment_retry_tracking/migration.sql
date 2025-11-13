-- AlterTable
ALTER TABLE "public"."Subscription" ADD COLUMN     "lastPaymentRetryAt" TIMESTAMP(3),
ADD COLUMN     "paymentFailureReason" TEXT,
ADD COLUMN     "paymentRetryCount" INTEGER NOT NULL DEFAULT 0;
