-- AlterTable
ALTER TABLE "public"."focus_sessions" ADD COLUMN     "paused_at" TIMESTAMP(3),
ADD COLUMN     "resumed_at" TIMESTAMP(3);

