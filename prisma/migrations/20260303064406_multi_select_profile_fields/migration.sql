/*
  Warnings:

  - The `professional_identity` column on the `user_profiles` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `primary_role` column on the `user_profiles` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `iqniti_goal` column on the `user_profiles` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."user_profiles" DROP COLUMN "professional_identity",
ADD COLUMN     "professional_identity" TEXT[] DEFAULT ARRAY[]::TEXT[],
DROP COLUMN "primary_role",
ADD COLUMN     "primary_role" TEXT[] DEFAULT ARRAY[]::TEXT[],
DROP COLUMN "iqniti_goal",
ADD COLUMN     "iqniti_goal" TEXT[] DEFAULT ARRAY[]::TEXT[];
