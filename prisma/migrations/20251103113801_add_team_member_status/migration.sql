-- CreateEnum
CREATE TYPE "public"."TeamMemberStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'UNDER_REVIEW');

-- AlterTable
-- First add status column with default
ALTER TABLE "public"."TeamMembership" ADD COLUMN "status" "public"."TeamMemberStatus" NOT NULL DEFAULT 'ACTIVE';

-- Add updatedAt column as nullable first
ALTER TABLE "public"."TeamMembership" ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Update existing rows to set updatedAt to createdAt
UPDATE "public"."TeamMembership" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;

-- Now make updatedAt NOT NULL
ALTER TABLE "public"."TeamMembership" ALTER COLUMN "updatedAt" SET NOT NULL;
