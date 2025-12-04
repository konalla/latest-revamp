#!/usr/bin/env tsx

/**
 * Script to fix database state after failed migration
 * 
 * This script checks and fixes the database state if the migration
 * partially applied. It will:
 * 1. Add TEAM_MANAGER to enum if missing
 * 2. Update all MANAGER records to TEAM_MANAGER
 * 3. Create WorkspaceRole enum if missing
 * 4. Create WorkspaceMembership table if missing
 * 
 * Usage:
 *   npx tsx scripts/fix-migration-state.ts
 */

import prisma from "../src/config/prisma.js";

async function fixMigrationState() {
  console.log("🔧 Fixing database migration state...");
  console.log("=" .repeat(60));

  try {
    // Step 1: Check and add TEAM_MANAGER to enum
    console.log("📋 Step 1: Checking TeamRole enum...");
    try {
      await prisma.$executeRaw`SELECT 'TEAM_MANAGER'::"TeamRole"`;
      console.log("   ✅ TEAM_MANAGER already exists in TeamRole enum");
    } catch (error: any) {
      if (error.message?.includes("invalid input value") || error.message?.includes("does not exist")) {
        console.log("   ⚠️  TEAM_MANAGER not found, adding to enum...");
        await prisma.$executeRaw`ALTER TYPE "TeamRole" ADD VALUE IF NOT EXISTS 'TEAM_MANAGER'`;
        console.log("   ✅ Added TEAM_MANAGER to TeamRole enum");
      } else {
        throw error;
      }
    }

    // Step 2: Update MANAGER records to TEAM_MANAGER
    console.log("");
    console.log("📋 Step 2: Checking for MANAGER records...");
    const managerCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::int as count
      FROM "TeamMembership"
      WHERE role = 'MANAGER'::"TeamRole"
    `;

    const count = Number(managerCount[0]?.count || 0);
    if (count > 0) {
      console.log(`   ⚠️  Found ${count} record(s) with MANAGER role, updating...`);
      const result = await prisma.$executeRaw`
        UPDATE "TeamMembership"
        SET role = 'TEAM_MANAGER'::"TeamRole"
        WHERE role = 'MANAGER'::"TeamRole"
      `;
      console.log(`   ✅ Updated ${result} record(s) to TEAM_MANAGER`);
    } else {
      console.log("   ✅ No MANAGER records found");
    }

    // Step 3: Check WorkspaceRole enum
    console.log("");
    console.log("📋 Step 3: Checking WorkspaceRole enum...");
    try {
      await prisma.$queryRaw`SELECT 'WORKSPACE_MANAGER'::"WorkspaceRole"`;
      console.log("   ✅ WorkspaceRole enum already exists");
    } catch (error: any) {
      if (error.message?.includes("does not exist") || error.message?.includes("type") && error.message?.includes("WorkspaceRole")) {
        console.log("   ⚠️  WorkspaceRole enum not found, creating...");
        await prisma.$executeRaw`CREATE TYPE "WorkspaceRole" AS ENUM ('WORKSPACE_MANAGER')`;
        console.log("   ✅ Created WorkspaceRole enum");
      } else {
        throw error;
      }
    }

    // Step 4: Check WorkspaceMembership table
    console.log("");
    console.log("📋 Step 4: Checking WorkspaceMembership table...");
    try {
      await prisma.$queryRaw`SELECT 1 FROM "WorkspaceMembership" LIMIT 1`;
      console.log("   ✅ WorkspaceMembership table already exists");
    } catch (error: any) {
      if (error.message?.includes("does not exist") || error.message?.includes("relation") && error.message?.includes("WorkspaceMembership")) {
        console.log("   ⚠️  WorkspaceMembership table not found, creating...");
        
        // Create table
        await prisma.$executeRaw`
          CREATE TABLE "WorkspaceMembership" (
            "id" SERIAL NOT NULL,
            "role" "WorkspaceRole" NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL,
            "userId" INTEGER NOT NULL,
            "workspaceId" INTEGER NOT NULL,
            CONSTRAINT "WorkspaceMembership_pkey" PRIMARY KEY ("id")
          )
        `;

        // Create unique index
        await prisma.$executeRaw`
          CREATE UNIQUE INDEX "WorkspaceMembership_userId_workspaceId_key" 
          ON "WorkspaceMembership"("userId", "workspaceId")
        `;

        // Add foreign keys
        await prisma.$executeRaw`
          ALTER TABLE "WorkspaceMembership" 
          ADD CONSTRAINT "WorkspaceMembership_userId_fkey" 
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `;

        await prisma.$executeRaw`
          ALTER TABLE "WorkspaceMembership" 
          ADD CONSTRAINT "WorkspaceMembership_workspaceId_fkey" 
          FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `;

        console.log("   ✅ Created WorkspaceMembership table");
      } else {
        throw error;
      }
    }

    // Step 5: Verify final state
    console.log("");
    console.log("📋 Step 5: Verifying final state...");
    
    const finalManagerCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::int as count
      FROM "TeamMembership"
      WHERE role = 'MANAGER'::"TeamRole"
    `;
    
    const finalTeamManagerCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::int as count
      FROM "TeamMembership"
      WHERE role = 'TEAM_MANAGER'::"TeamRole"
    `;

    console.log(`   MANAGER roles remaining: ${Number(finalManagerCount[0]?.count || 0)}`);
    console.log(`   TEAM_MANAGER roles: ${Number(finalTeamManagerCount[0]?.count || 0)}`);

    if (Number(finalManagerCount[0]?.count || 0) === 0) {
      console.log("");
      console.log("✅ Database state is correct!");
      console.log("   You can now mark the migration as applied:");
      console.log("   npx prisma migrate resolve --applied 20251120060917_rename_manager_to_team_manager_and_add_workspace_membership");
    } else {
      console.log("");
      console.log("⚠️  Warning: Some MANAGER roles still exist.");
      console.log("   You may need to check the database manually.");
    }

  } catch (error: any) {
    console.error("");
    console.error("❌ Error fixing migration state:");
    console.error(error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log("");
    console.log("🔌 Database connection closed");
  }
}

// Run the fix
fixMigrationState()
  .then(() => {
    console.log("");
    console.log("✨ Script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("");
    console.error("💥 Script failed with error:");
    console.error(error);
    process.exit(1);
  });


