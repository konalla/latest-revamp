#!/usr/bin/env tsx

/**
 * Production Migration State Checker
 * 
 * This script helps diagnose migration drift issues on production servers.
 * It checks the current database state and compares it with expected schema.
 * 
 * Usage:
 *   npx tsx scripts/check-production-migration-state.ts
 * 
 * ⚠️  This script is READ-ONLY and safe to run on production.
 */

import prisma from "../src/config/prisma.js";

async function checkProductionState() {
  console.log("🔍 Production Migration State Checker");
  console.log("=" .repeat(60));
  console.log("⚠️  This script is READ-ONLY and safe to run on production\n");

  try {
    // 1. Check TeamRole enum
    console.log("📋 Step 1: Checking TeamRole enum...");
    try {
      const enumValues = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
        SELECT enumlabel 
        FROM pg_enum 
        WHERE enumtypid = (
          SELECT oid 
          FROM pg_type 
          WHERE typname = 'TeamRole'
        )
        ORDER BY enumsortorder
      `;
      
      const values = enumValues.map(e => e.enumlabel);
      console.log(`   Enum values: ${values.join(", ")}`);
      
      if (values.includes('MANAGER') && values.includes('TEAM_MANAGER')) {
        console.log("   ⚠️  Both MANAGER and TEAM_MANAGER exist in enum");
      } else if (values.includes('MANAGER') && !values.includes('TEAM_MANAGER')) {
        console.log("   ❌ Only MANAGER exists (should have TEAM_MANAGER)");
      } else if (!values.includes('MANAGER') && values.includes('TEAM_MANAGER')) {
        console.log("   ✅ Correct: Only TEAM_MANAGER exists");
      }
    } catch (error: any) {
      console.log(`   ❌ Error checking enum: ${error.message}`);
    }

    // 2. Check for MANAGER records
    console.log("\n📋 Step 2: Checking for MANAGER records in TeamMembership...");
    try {
      const managerCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::int as count
        FROM "TeamMembership"
        WHERE role::text = 'MANAGER'
      `;
      
      const count = Number(managerCount[0]?.count || 0);
      if (count === 0) {
        console.log("   ✅ No MANAGER records found (safe to proceed)");
      } else {
        console.log(`   ⚠️  Found ${count} record(s) with MANAGER role`);
        console.log("   ⚠️  These need to be converted to TEAM_MANAGER before migration");
      }
    } catch (error: any) {
      console.log(`   ❌ Error checking records: ${error.message}`);
    }

    // 3. Check resetToken columns
    console.log("\n📋 Step 3: Checking password reset columns...");
    try {
      const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'User' 
        AND column_name IN ('resetToken', 'resetTokenExpiry')
        ORDER BY column_name
      `;
      
      const columnNames = columns.map(c => c.column_name);
      
      if (columnNames.includes('resetToken') && columnNames.includes('resetTokenExpiry')) {
        console.log("   ✅ resetToken and resetTokenExpiry columns exist");
      } else {
        console.log("   ❌ Missing columns:");
        if (!columnNames.includes('resetToken')) {
          console.log("      - resetToken");
        }
        if (!columnNames.includes('resetTokenExpiry')) {
          console.log("      - resetTokenExpiry");
        }
      }
    } catch (error: any) {
      console.log(`   ❌ Error checking columns: ${error.message}`);
    }

    // 4. Check resetToken index
    console.log("\n📋 Step 4: Checking resetToken unique index...");
    try {
      const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'User' 
        AND indexname = 'User_resetToken_key'
      `;
      
      if (indexes.length > 0) {
        console.log("   ✅ resetToken unique index exists");
      } else {
        console.log("   ⚠️  resetToken unique index missing");
      }
    } catch (error: any) {
      console.log(`   ❌ Error checking index: ${error.message}`);
    }

    // 5. Check migration history
    console.log("\n📋 Step 5: Checking migration history...");
    try {
      const migrations = await prisma.$queryRaw<Array<{ 
        migration_name: string;
        finished_at: Date | null;
      }>>`
        SELECT migration_name, finished_at
        FROM _prisma_migrations
        WHERE migration_name LIKE '%password%' OR migration_name LIKE '%reset%'
        ORDER BY finished_at DESC
        LIMIT 5
      `;
      
      if (migrations.length > 0) {
        console.log("   Recent password reset related migrations:");
        migrations.forEach(m => {
          const status = m.finished_at ? "✅ Applied" : "⏳ Pending";
          console.log(`      ${status}: ${m.migration_name}`);
        });
      } else {
        console.log("   ⚠️  No password reset migrations found in history");
      }
    } catch (error: any) {
      console.log(`   ❌ Error checking migrations: ${error.message}`);
    }

    // 6. Summary and recommendations
    console.log("\n" + "=" .repeat(60));
    console.log("📊 Summary & Recommendations:");
    console.log("=" .repeat(60));
    console.log("\nIf you see drift issues, follow these steps:");
    console.log("1. Backup database: pg_dump $DATABASE_URL > backup.sql");
    console.log("2. Check PRODUCTION_MIGRATION_GUIDE.md for detailed steps");
    console.log("3. Use 'npx prisma migrate deploy' (NOT 'migrate dev')");
    console.log("4. If columns already exist, use 'npx prisma migrate resolve --applied [name]'");
    console.log("\n⚠️  NEVER use 'prisma db push' in production!");
    console.log("✅ Always backup before migrations!");

  } catch (error: any) {
    console.error("\n❌ Error during check:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkProductionState()
  .then(() => {
    console.log("\n✨ Check completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Check failed:", error);
    process.exit(1);
  });

