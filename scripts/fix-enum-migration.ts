import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixEnumMigration() {
  try {
    console.log('🔍 Checking database state...');

    // Check if TEAM_MANAGER exists in the enum
    const enumCheck = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = (
        SELECT oid 
        FROM pg_type 
        WHERE typname = 'TeamRole'
      )
      AND enumlabel = 'TEAM_MANAGER'
    `;

    if (enumCheck.length === 0) {
      console.log('❌ TEAM_MANAGER enum value does not exist. Please run the migration first.');
      return;
    }

    console.log('✅ TEAM_MANAGER enum value exists');

    // Check for any remaining MANAGER values
    const managerCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::int as count
      FROM "TeamMembership"
      WHERE role::text = 'MANAGER'
    `;

    const count = Number(managerCount[0]?.count || 0);
    
    if (count === 0) {
      console.log('✅ No MANAGER roles found. Migration appears complete.');
      return;
    }

    console.log(`📊 Found ${count} team membership(s) with MANAGER role`);
    console.log('🔄 Updating MANAGER to TEAM_MANAGER...');

    // Update using raw SQL to avoid type validation issues
    const result = await prisma.$executeRaw`
      UPDATE "TeamMembership" 
      SET role = 'TEAM_MANAGER'::"TeamRole"
      WHERE role::text = 'MANAGER'
    `;

    console.log(`✅ Updated ${result} record(s)`);

    // Verify
    const verifyCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::int as count
      FROM "TeamMembership"
      WHERE role::text = 'MANAGER'
    `;

    const remaining = Number(verifyCount[0]?.count || 0);
    if (remaining === 0) {
      console.log('✅ Verification passed: No MANAGER roles remaining');
    } else {
      console.log(`⚠️  Warning: ${remaining} MANAGER roles still exist`);
    }

  } catch (error) {
    console.error('❌ Error during fix:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixEnumMigration()
  .then(() => {
    console.log('✨ Fix completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });


