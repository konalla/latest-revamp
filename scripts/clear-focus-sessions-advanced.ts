#!/usr/bin/env tsx

import prisma from "../src/config/prisma.js";
import { program } from "commander";

interface ClearOptions {
  userId?: string;
  confirm?: boolean;
  dryRun?: boolean;
}

async function clearFocusSessions(options: ClearOptions) {
  try {
    console.log("🗑️  Focus Session Cleanup Tool");
    console.log("================================");
    
    let whereClause = "";
    let params: any[] = [];
    
    if (options.userId) {
      whereClause = "WHERE user_id = $1";
      params = [parseInt(options.userId)];
      console.log(`👤 Filtering by user ID: ${options.userId}`);
    }
    
    // Count sessions
    const countQuery = `SELECT COUNT(*) as count FROM focus_sessions ${whereClause}`;
    const countResult = await prisma.$queryRawUnsafe(countQuery, ...params) as any[];
    const sessionCount = countResult[0]?.count || 0;
    
    console.log(`📊 Found ${sessionCount} focus sessions to delete`);
    
    if (sessionCount === 0) {
      console.log("✅ No sessions found. Nothing to delete.");
      return;
    }
    
    // Show session details
    const detailsQuery = `
      SELECT id, user_id, session_type, status, started_at, duration 
      FROM focus_sessions ${whereClause} 
      ORDER BY started_at DESC 
      LIMIT 10
    `;
    const sessions = await prisma.$queryRawUnsafe(detailsQuery, ...params) as any[];
    
    console.log("\n📋 Sample sessions to be deleted:");
    console.log("ID | User ID | Type | Status | Started At | Duration");
    console.log("---|---------|------|--------|------------|---------");
    sessions.forEach(session => {
      console.log(`${session.id} | ${session.user_id} | ${session.session_type} | ${session.status} | ${session.started_at} | ${session.duration}min`);
    });
    
    if (sessions.length < sessionCount) {
      console.log(`... and ${sessionCount - sessions.length} more sessions`);
    }
    
    // Dry run check
    if (options.dryRun) {
      console.log("\n🔍 DRY RUN MODE - No sessions were actually deleted");
      return;
    }
    
    // Confirmation check
    if (!options.confirm) {
      console.log("\n⚠️  This action cannot be undone!");
      console.log("Use --confirm flag to proceed with deletion");
      console.log("Use --dry-run flag to see what would be deleted without actually deleting");
      return;
    }
    
    // Delete sessions
    console.log("\n🗑️  Deleting sessions...");
    const deleteQuery = `DELETE FROM focus_sessions ${whereClause}`;
    await prisma.$queryRawUnsafe(deleteQuery, ...params);
    
    console.log("✅ Successfully deleted all focus sessions!");
    console.log(`🗑️  Removed ${sessionCount} sessions from the database`);
    
  } catch (error) {
    console.error("❌ Error clearing focus sessions:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// CLI setup
program
  .name("clear-focus-sessions")
  .description("Clear focus sessions from the database")
  .version("1.0.0")
  .option("-u, --userId <id>", "Clear sessions for specific user ID only")
  .option("-c, --confirm", "Confirm deletion (required for actual deletion)")
  .option("-d, --dry-run", "Show what would be deleted without actually deleting")
  .action(async (options) => {
    await clearFocusSessions(options);
  });

program.parse();

