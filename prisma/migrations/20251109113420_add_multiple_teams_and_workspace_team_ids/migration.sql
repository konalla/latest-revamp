-- DropIndex
DROP INDEX "public"."Team_workspaceId_key";

-- AlterTable
ALTER TABLE "public"."Objective" ADD COLUMN     "teamId" INTEGER,
ADD COLUMN     "workspaceId" INTEGER;

-- AlterTable
ALTER TABLE "public"."Okr" ADD COLUMN     "teamId" INTEGER,
ADD COLUMN     "workspaceId" INTEGER;

-- AlterTable
ALTER TABLE "public"."Project" ADD COLUMN     "teamId" INTEGER,
ADD COLUMN     "workspaceId" INTEGER;

-- AlterTable
ALTER TABLE "public"."Task" ADD COLUMN     "teamId" INTEGER,
ADD COLUMN     "workspaceId" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Objective" ADD CONSTRAINT "Objective_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Objective" ADD CONSTRAINT "Objective_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Okr" ADD CONSTRAINT "Okr_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Okr" ADD CONSTRAINT "Okr_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
