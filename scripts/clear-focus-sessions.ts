#!/usr/bin/env tsx

import prisma from "../src/config/prisma.js";

async function clearAllFocusSessions() {
  try {
    console.log("🗑️  Starting to clear all focus sessions...");
    
    // First, let's check how many sessions exist
    const countResult = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM focus_sessions
    ` as any[];
    
    const sessionCount = countResult[0]?.count || 0;
    console.log(`📊 Found ${sessionCount} focus sessions to delete`);
    
    if (sessionCount === 0) {
      console.log("✅ No sessions found. Nothing to delete.");
      return;
    }
    
    // Delete all focus sessions
    const deleteResult = await prisma.$queryRaw`
      DELETE FROM focus_sessions
    `;
    
    console.log("✅ Successfully deleted all focus sessions!");
    console.log(`🗑️  Removed ${sessionCount} sessions from the database`);
    
  } catch (error) {
    console.error("❌ Error clearing focus sessions:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
clearAllFocusSessions()
  .then(() => {
    console.log("🎉 Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });

