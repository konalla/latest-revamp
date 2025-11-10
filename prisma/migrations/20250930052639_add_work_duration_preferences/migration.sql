-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "creative_work_end_time" TEXT NOT NULL DEFAULT '15:00',
ADD COLUMN     "creative_work_start_time" TEXT NOT NULL DEFAULT '12:00',
ADD COLUMN     "deep_work_end_time" TEXT NOT NULL DEFAULT '12:00',
ADD COLUMN     "deep_work_start_time" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "executive_work_end_time" TEXT NOT NULL DEFAULT '21:00',
ADD COLUMN     "executive_work_start_time" TEXT NOT NULL DEFAULT '18:00',
ADD COLUMN     "reflective_work_end_time" TEXT NOT NULL DEFAULT '18:00',
ADD COLUMN     "reflective_work_start_time" TEXT NOT NULL DEFAULT '15:00';
