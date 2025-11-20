-- Step 1: Create WorkspaceRole enum
CREATE TYPE "public"."WorkspaceRole" AS ENUM ('WORKSPACE_MANAGER');

-- Step 2: Replace TeamRole enum by creating a new one with TEAM_MANAGER instead of MANAGER
-- This approach avoids the "unsafe use of new enum value" error by creating a fresh enum type
-- and converting MANAGER values to TEAM_MANAGER during the type conversion
CREATE TYPE "public"."TeamRole_new" AS ENUM ('ADMIN', 'MEMBER', 'TEAM_MANAGER');

-- Step 3: Update the column to use the new enum type, converting MANAGER to TEAM_MANAGER
ALTER TABLE "public"."TeamMembership" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "public"."TeamMembership" ALTER COLUMN "role" TYPE "public"."TeamRole_new" 
  USING (
    CASE 
      WHEN "role"::text = 'MANAGER' THEN 'TEAM_MANAGER'::"public"."TeamRole_new"
      ELSE "role"::text::"public"."TeamRole_new"
    END
  );

-- Step 4: Replace the old enum with the new one
ALTER TYPE "public"."TeamRole" RENAME TO "TeamRole_old";
ALTER TYPE "public"."TeamRole_new" RENAME TO "TeamRole";
DROP TYPE "public"."TeamRole_old";
ALTER TABLE "public"."TeamMembership" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

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
