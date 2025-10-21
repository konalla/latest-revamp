#!/usr/bin/env tsx

/**
 * DRY RUN Script to preview task category updates based on AI recommendations
 * This script will show what changes would be made without actually updating the database
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

async function previewTaskCategoryUpdates() {
  try {
    console.log('🔍 DRY RUN: Previewing task category updates...\n');

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

    let wouldUpdateCount = 0;
    let alreadyCorrectCount = 0;
    const changes: Array<{
      taskId: number;
      title: string;
      currentCategory: string;
      aiCategory: string;
      newCategory: string;
    }> = [];

    // Analyze each task
    for (const task of tasksWithAI) {
        const aiCategory = task.aiRecommendation!.category;
      const mappedCategory = mapAICategoryToTaskCategory(aiCategory);
      
      if (task.category === mappedCategory) {
        alreadyCorrectCount++;
      } else {
        wouldUpdateCount++;
        changes.push({
          taskId: task.id,
          title: task.title,
          currentCategory: task.category,
          aiCategory: aiCategory,
          newCategory: mappedCategory
        });
      }
    }

    // Show summary
    console.log('📈 Preview Summary:');
    console.log('==================');
    console.log(`🔄 Would update: ${wouldUpdateCount} tasks`);
    console.log(`✅ Already correct: ${alreadyCorrectCount} tasks`);
    console.log(`📊 Total tasks: ${tasksWithAI.length} tasks\n`);

    if (changes.length > 0) {
      console.log('📋 Changes that would be made:');
      console.log('==============================');
      
      changes.forEach((change, index) => {
        console.log(`${index + 1}. Task ${change.taskId}: "${change.title}"`);
        console.log(`   Current: ${change.currentCategory}`);
        console.log(`   AI Category: ${change.aiCategory}`);
        console.log(`   New Category: ${change.newCategory}`);
        console.log('');
      });

      console.log('⚠️  This is a DRY RUN - no changes were made to the database');
      console.log('💡 To apply these changes, run the actual update script');
    } else {
      console.log('✨ All task categories are already up to date!');
    }

  } catch (error: any) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
previewTaskCategoryUpdates()
  .then(() => {
    console.log('\n🏁 Preview completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
