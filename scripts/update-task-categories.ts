#!/usr/bin/env tsx

/**
 * Script to update existing task categories based on AI recommendations
 * This script will:
 * 1. Find all tasks that have AI recommendations
 * 2. Map the AI category to the new task category format
 * 3. Update the task's category field in the database
 */

import prisma from "../src/config/prisma.js";

// Define the work categories directly to avoid importing LangChain dependencies
const WorkCategory = {
  DEEP_WORK: "Deep Work",
  CREATIVE_WORK: "Creative Work", 
  REFLECTIVE_WORK: "Reflective Work",
  EXECUTIVE_WORK: "Executive Work"
} as const;

// Mapping function (same as in task.service.ts)
function mapAICategoryToTaskCategory(aiCategory: string): string {
  const categoryMap: { [key: string]: string } = {
    [WorkCategory.DEEP_WORK]: "deepWork",
    [WorkCategory.CREATIVE_WORK]: "creative", 
    [WorkCategory.REFLECTIVE_WORK]: "reflection",
    [WorkCategory.EXECUTIVE_WORK]: "execution"
  };
  
  return categoryMap[aiCategory] || "execution"; // Default fallback
}

async function updateTaskCategories() {
  try {
    console.log('🔄 Starting task category update process...\n');

    // Get all tasks that have AI recommendations
    const tasksWithAI = await prisma.task.findMany({
      where: {
        aiRecommendation: {
          isNot: null
        }
      },
      include: {
        aiRecommendation: true
      }
    });

    console.log(`📊 Found ${tasksWithAI.length} tasks with AI recommendations\n`);

    if (tasksWithAI.length === 0) {
      console.log('✅ No tasks found with AI recommendations. Nothing to update.');
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Process each task
    for (const task of tasksWithAI) {
      try {
        const aiCategory = task.aiRecommendation!.category;
        const mappedCategory = mapAICategoryToTaskCategory(aiCategory);
        
        // Check if the category needs to be updated
        if (task.category === mappedCategory) {
          console.log(`⏭️  Skipping task ${task.id} - category already correct (${mappedCategory})`);
          skippedCount++;
          continue;
        }

        // Update the task category
        await prisma.task.update({
          where: { id: task.id },
          data: { category: mappedCategory }
        });

        console.log(`✅ Updated task ${task.id}: "${task.title}"`);
        console.log(`   ${aiCategory} → ${mappedCategory}`);
        updatedCount++;

      } catch (error: any) {
        console.error(`❌ Error updating task ${task.id}:`, error.message);
        errorCount++;
      }
    }

    // Summary
    console.log('\n📈 Update Summary:');
    console.log('==================');
    console.log(`✅ Successfully updated: ${updatedCount} tasks`);
    console.log(`⏭️  Skipped (already correct): ${skippedCount} tasks`);
    console.log(`❌ Errors: ${errorCount} tasks`);
    console.log(`📊 Total processed: ${tasksWithAI.length} tasks`);

    if (updatedCount > 0) {
      console.log('\n🎉 Task categories have been successfully updated!');
    } else {
      console.log('\n✨ All task categories were already up to date!');
    }

  } catch (error: any) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
updateTaskCategories()
  .then(() => {
    console.log('\n🏁 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
