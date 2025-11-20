-- Step 1: Add TEAM_MANAGER to the existing TeamRole enum
ALTER TYPE "public"."TeamRole" ADD VALUE IF NOT EXISTS 'TEAM_MANAGER';

-- Step 2: Update all existing MANAGER records to TEAM_MANAGER
UPDATE "public"."TeamMembership" 
SET "role" = 'TEAM_MANAGER'::"public"."TeamRole"
WHERE "role" = 'MANAGER'::"public"."TeamRole";

-- Step 3: Create WorkspaceRole enum
CREATE TYPE "public"."WorkspaceRole" AS ENUM ('WORKSPACE_MANAGER');

-- Step 4: Replace TeamRole enum (now that all MANAGER values are updated)
-- Note: We can't remove enum values in PostgreSQL, but we'll create a new enum without MANAGER
BEGIN;
CREATE TYPE "public"."TeamRole_new" AS ENUM ('ADMIN', 'MEMBER', 'TEAM_MANAGER');
ALTER TABLE "public"."TeamMembership" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "public"."TeamMembership" ALTER COLUMN "role" TYPE "public"."TeamRole_new" USING ("role"::text::"public"."TeamRole_new");
ALTER TYPE "public"."TeamRole" RENAME TO "TeamRole_old";
ALTER TYPE "public"."TeamRole_new" RENAME TO "TeamRole";
DROP TYPE "public"."TeamRole_old";
ALTER TABLE "public"."TeamMembership" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
COMMIT;

-- CreateTable
CREATE TABLE "public"."WorkspaceMembership" (
    "id" SERIAL NOT NULL,
    "role" "public"."WorkspaceRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,

    CONSTRAINT "WorkspaceMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMembership_userId_workspaceId_key" ON "public"."WorkspaceMembership"("userId", "workspaceId");

-- AddForeignKey
ALTER TABLE "public"."WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
