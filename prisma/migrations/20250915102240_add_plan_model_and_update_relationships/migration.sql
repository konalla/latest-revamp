/*
  Warnings:

  - You are about to drop the column `projectId` on the `Objective` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Objective" DROP CONSTRAINT "Objective_projectId_fkey";

-- AlterTable
ALTER TABLE "public"."Objective" DROP COLUMN "projectId";

-- AlterTable
ALTER TABLE "public"."Okr" ADD COLUMN     "planId" INTEGER,
ALTER COLUMN "objectiveId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."Task" ADD COLUMN     "planId" INTEGER;

-- CreateTable
CREATE TABLE "public"."Plan" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "projectId" INTEGER NOT NULL,
    "objectiveId" INTEGER NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_projectId_objectiveId_key" ON "public"."Plan"("projectId", "objectiveId");

-- AddForeignKey
ALTER TABLE "public"."Plan" ADD CONSTRAINT "Plan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Plan" ADD CONSTRAINT "Plan_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "public"."Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Okr" ADD CONSTRAINT "Okr_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
