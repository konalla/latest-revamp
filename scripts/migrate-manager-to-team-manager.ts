#!/usr/bin/env tsx

/**
 * Migration Script: Update MANAGER to TEAM_MANAGER
 * 
 * This script migrates all existing TeamMembership records with role "MANAGER"
 * to the new role "TEAM_MANAGER" to match the updated schema.
 * 
 * IMPORTANT: Run the Prisma migration first to update the database schema:
 *   npx prisma migrate dev --name rename_manager_to_team_manager_and_add_workspace_membership
 * 
 * Usage:
 *   npx tsx scripts/migrate-manager-to-team-manager.ts
 */

import prisma from "../src/config/prisma.js";

async function migrateManagerToTeamManager() {
  console.log("🚀 Starting migration: MANAGER → TEAM_MANAGER");
  console.log("=" .repeat(60));

  try {
    // First, check if there are any MANAGER roles in the database using raw SQL
    // (Prisma client no longer recognizes MANAGER as a valid enum value)
    const managerCountResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::int as count
      FROM "TeamMembership"
      WHERE role = 'MANAGER'::"TeamRole"
    `;

    const managerCount = Number(managerCountResult[0]?.count || 0);

    if (managerCount === 0) {
      console.log("✅ No MANAGER roles found in the database.");
      console.log("   Migration is not needed or already completed.");
      return;
    }

    console.log(`📊 Found ${managerCount} team membership(s) with MANAGER role`);
    console.log("");

    // Get details of records that will be updated using raw SQL
    const managerMemberships = await prisma.$queryRaw<Array<{
      id: number;
      userId: number;
      teamId: number;
      role: string;
      user: {
        id: number;
        username: string;
        name: string;
        email: string;
      };
      team: {
        id: number;
        name: string;
      };
    }>>`
      SELECT 
        tm.id,
        tm."userId",
        tm."teamId",
        tm.role,
        json_build_object(
          'id', u.id,
          'username', u.username,
          'name', u.name,
          'email', u.email
        ) as user,
        json_build_object(
          'id', t.id,
          'name', t.name
        ) as team
      FROM "TeamMembership" tm
      INNER JOIN "User" u ON tm."userId" = u.id
      INNER JOIN "Team" t ON tm."teamId" = t.id
      WHERE tm.role = 'MANAGER'::"TeamRole"
    `;

    console.log("📋 Records to be updated:");
    managerMemberships.forEach((membership, index) => {
      const user = membership.user as any;
      const team = membership.team as any;
      console.log(`   ${index + 1}. User: ${user.name} (${user.email})`);
      console.log(`      Team: ${team.name} (ID: ${team.id})`);
      console.log(`      Current Role: MANAGER`);
      console.log("");
    });

    // Perform the migration using raw SQL to update the enum value
    // Note: We use raw SQL because we need to update the enum value directly
    console.log("🔄 Updating records...");

    // First, check if TEAM_MANAGER enum value exists in the database
    try {
      // Try to query with TEAM_MANAGER to see if the enum value exists
      await prisma.$queryRaw`SELECT 'TEAM_MANAGER'::"TeamRole"`;
    } catch (error: any) {
      if (error.message?.includes("TEAM_MANAGER") || error.message?.includes("invalid input value")) {
        console.error("");
        console.error("❌ Error: TEAM_MANAGER enum value does not exist in the database.");
        console.error("");
        console.error("💡 Please run the Prisma migration first:");
        console.error("   npx prisma migrate dev --name rename_manager_to_team_manager_and_add_workspace_membership");
        console.error("");
        console.error("   This will update the database schema to include TEAM_MANAGER in the TeamRole enum.");
        throw new Error("Database schema not updated. Please run Prisma migration first.");
      }
      throw error;
    }

    // Use raw SQL to update the role
    // We need to cast the string to the enum type
    const result = await prisma.$executeRaw`
      UPDATE "TeamMembership"
      SET role = 'TEAM_MANAGER'::"TeamRole"
      WHERE role = 'MANAGER'::"TeamRole"
    `;

    console.log(`✅ Successfully updated ${result} record(s)`);
    console.log("");

    // Verify the migration using raw SQL
    const remainingManagerCountResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::int as count
      FROM "TeamMembership"
      WHERE role = 'MANAGER'::"TeamRole"
    `;

    const remainingManagerCount = Number(remainingManagerCountResult[0]?.count || 0);

    const newTeamManagerCountResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::int as count
      FROM "TeamMembership"
      WHERE role = 'TEAM_MANAGER'::"TeamRole"
    `;

    const newTeamManagerCount = Number(newTeamManagerCountResult[0]?.count || 0);

    console.log("📊 Verification:");
    console.log(`   Remaining MANAGER roles: ${remainingManagerCount}`);
    console.log(`   Total TEAM_MANAGER roles: ${newTeamManagerCount}`);
    console.log("");

    if (remainingManagerCount === 0) {
      console.log("✅ Migration completed successfully!");
      console.log("   All MANAGER roles have been updated to TEAM_MANAGER.");
    } else {
      console.log("⚠️  Warning: Some MANAGER roles still exist.");
      console.log("   You may need to run this script again or check for data inconsistencies.");
    }

  } catch (error: any) {
    console.error("❌ Error during migration:");
    console.error(error);

    // Check if the error is related to the enum not existing
    if (error.message?.includes("TEAM_MANAGER") || error.message?.includes("enum")) {
      console.error("");
      console.error("💡 Tip: Make sure you have run the Prisma migration first:");
      console.error("   npx prisma migrate dev");
      console.error("");
      console.error("   This will update the database schema to include TEAM_MANAGER in the enum.");
    }

    throw error;
  } finally {
    await prisma.$disconnect();
    console.log("");
    console.log("🔌 Database connection closed");
  }
}

// Run the migration
migrateManagerToTeamManager()
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

