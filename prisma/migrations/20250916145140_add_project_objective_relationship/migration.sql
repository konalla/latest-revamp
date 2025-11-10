-- AlterTable
ALTER TABLE "public"."Objective" ADD COLUMN     "projectId" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Objective" ADD CONSTRAINT "Objective_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
