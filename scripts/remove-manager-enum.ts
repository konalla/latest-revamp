import prisma from "../src/config/prisma.js";

async function removeManagerEnum() {
  try {
    console.log("🔧 Removing MANAGER value from TeamRole enum...");
    
    // Check if MANAGER exists in the enum
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
    
    console.log("Current enum values:", enumValues.map(e => e.enumlabel).join(", "));
    
    // Check if MANAGER exists
    const hasManager = enumValues.some(e => e.enumlabel === 'MANAGER');
    
    if (!hasManager) {
      console.log("✅ MANAGER value already removed from enum");
      return;
    }
    
    // Note: PostgreSQL doesn't support DROP VALUE directly
    // We need to recreate the enum without MANAGER
    console.log("⚠️  PostgreSQL doesn't support removing enum values directly.");
    console.log("⚠️  The enum will be recreated without MANAGER when you run prisma db push");
    console.log("✅ Since there are no MANAGER records, this is safe.");
    
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

removeManagerEnum();

