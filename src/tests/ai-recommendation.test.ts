import { aiRecommendationService, WorkCategory } from "../services/ai-recommendation.service.js";

/**
 * Test cases demonstrating rulebook-based task classification
 * These examples show how the AI system categorizes tasks according to the comprehensive rulebook
 */

// Mock user preferences
const mockUserPreferences = {
  deepWorkStartTime: "09:00",
  deepWorkEndTime: "12:00",
  creativeWorkStartTime: "12:00",
  creativeWorkEndTime: "15:00",
  reflectiveWorkStartTime: "15:00",
  reflectiveWorkEndTime: "18:00",
  executiveWorkStartTime: "18:00",
  executiveWorkEndTime: "21:00"
};

// Test cases based on rulebook examples
const testCases = [
  // Deep Work examples
  {
    name: "Complex Software Development",
    task: {
      title: "Implement new authentication system",
      description: "Design and develop secure user authentication with OAuth integration",
      duration: 180,
      importance: true,
      urgency: false,
      projectName: "Software Development"
    },
    expectedCategory: WorkCategory.DEEP_WORK,
    reasoning: "Long duration, important, complex technical work requiring sustained focus"
  },
  {
    name: "Strategic Planning",
    task: {
      title: "Develop quarterly business strategy",
      description: "Analyze market trends and create comprehensive strategic plan",
      duration: 240,
      importance: true,
      urgency: false,
      projectName: "Strategic Planning"
    },
    expectedCategory: WorkCategory.DEEP_WORK,
    reasoning: "Long duration, important, analytical work requiring uninterrupted focus"
  },
  {
    name: "Research and Analysis",
    task: {
      title: "Analyze customer feedback data",
      description: "Deep dive into customer survey results and identify key insights",
      duration: 120,
      importance: true,
      urgency: false,
      projectName: "Market Research"
    },
    expectedCategory: WorkCategory.DEEP_WORK,
    reasoning: "Important analytical work requiring sustained concentration"
  },

  // Creative Work examples
  {
    name: "Content Creation",
    task: {
      title: "Write blog post about productivity",
      description: "Create engaging content about time management techniques",
      duration: 90,
      importance: true,
      urgency: false,
      projectName: "Content Creation"
    },
    expectedCategory: WorkCategory.CREATIVE_WORK,
    reasoning: "Creative writing task involving original content creation"
  },
  {
    name: "Design Work",
    task: {
      title: "Design new logo concepts",
      description: "Brainstorm and create multiple logo variations for rebranding",
      duration: 150,
      importance: true,
      urgency: false,
      projectName: "Brand Design Project"
    },
    expectedCategory: WorkCategory.CREATIVE_WORK,
    reasoning: "Creative design work involving ideation and artistic creation"
  },
  {
    name: "Brainstorming Session",
    task: {
      title: "Brainstorm marketing campaign ideas",
      description: "Generate creative concepts for upcoming product launch",
      duration: 60,
      importance: true,
      urgency: false,
      projectName: "Marketing Campaign"
    },
    expectedCategory: WorkCategory.CREATIVE_WORK,
    reasoning: "Ideation and creative problem-solving"
  },

  // Reflective Work examples
  {
    name: "Strategic Review",
    task: {
      title: "Review and reflect on team performance",
      description: "Analyze team metrics and plan improvements for next quarter",
      duration: 90,
      importance: true,
      urgency: false,
      projectName: "Team Management"
    },
    expectedCategory: WorkCategory.REFLECTIVE_WORK,
    reasoning: "Important but not urgent, involves analysis and planning"
  },
  {
    name: "Learning and Development",
    task: {
      title: "Study new programming framework",
      description: "Learn React 18 features and best practices",
      duration: 120,
      importance: true,
      urgency: false,
      projectName: "Professional Development"
    },
    expectedCategory: WorkCategory.REFLECTIVE_WORK,
    reasoning: "Learning task, important for long-term skill development"
  },
  {
    name: "Post-Mortem Analysis",
    task: {
      title: "Conduct project post-mortem",
      description: "Review completed project and identify lessons learned",
      duration: 60,
      importance: true,
      urgency: false,
      projectName: "Project Management"
    },
    expectedCategory: WorkCategory.REFLECTIVE_WORK,
    reasoning: "Review and analysis task, important for future improvement"
  },

  // Executive Work examples
  {
    name: "Urgent Email Response",
    task: {
      title: "Reply to client email",
      description: "Address urgent client concerns about project timeline",
      duration: 15,
      importance: true,
      urgency: true,
      projectName: "Client Relations"
    },
    expectedCategory: WorkCategory.EXECUTIVE_WORK,
    reasoning: "Urgent, short duration, reactive communication task"
  },
  {
    name: "Team Meeting",
    task: {
      title: "Daily standup meeting",
      description: "Quick team sync to discuss progress and blockers",
      duration: 30,
      importance: false,
      urgency: true,
      projectName: "Team Management"
    },
    expectedCategory: WorkCategory.EXECUTIVE_WORK,
    reasoning: "Short duration, routine meeting, reactive in nature"
  },
  {
    name: "Administrative Task",
    task: {
      title: "Update project status report",
      description: "Fill out weekly status update for stakeholders",
      duration: 20,
      importance: false,
      urgency: true,
      projectName: "Administration"
    },
    expectedCategory: WorkCategory.EXECUTIVE_WORK,
    reasoning: "Short duration, administrative, urgent but not important"
  },
  {
    name: "Quick Decision",
    task: {
      title: "Approve budget request",
      description: "Review and approve team member's equipment purchase request",
      duration: 10,
      importance: false,
      urgency: true,
      projectName: "Operations"
    },
    expectedCategory: WorkCategory.EXECUTIVE_WORK,
    reasoning: "Very short duration, quick decision-making, reactive task"
  }
];

/**
 * Run test cases to demonstrate rulebook-based classification
 */
export async function runClassificationTests() {
  console.log("🧠 AI Recommendation System - Rulebook-Based Classification Tests\n");
  console.log("=".repeat(80));

  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log(`Task: ${testCase.task.title}`);
    console.log(`Description: ${testCase.task.description}`);
    console.log(`Duration: ${testCase.task.duration} minutes`);
    console.log(`Importance: ${testCase.task.importance}, Urgency: ${testCase.task.urgency}`);
    console.log(`Project: ${testCase.task.projectName}`);
    
    try {
      // Generate AI recommendation
      const recommendation = await aiRecommendationService.generateTaskRecommendation(
        testCase.task,
        mockUserPreferences,
        1 // Mock user ID
      );

      console.log(`\n🤖 AI Recommendation:`);
      console.log(`Category: ${recommendation.category}`);
      console.log(`Recommended Time: ${recommendation.recommendedTime}`);
      console.log(`Confidence: ${(recommendation.confidence * 100).toFixed(1)}%`);
      console.log(`Reasoning: ${recommendation.reasoning}`);

      // Check if recommendation matches expected category
      const isCorrect = recommendation.category === testCase.expectedCategory;
      console.log(`\n✅ Expected: ${testCase.expectedCategory}`);
      console.log(`${isCorrect ? '✅' : '❌'} Result: ${recommendation.category} ${isCorrect ? '(CORRECT)' : '(INCORRECT)'}`);
      console.log(`📝 Expected Reasoning: ${testCase.reasoning}`);

    } catch (error) {
      console.error(`❌ Error generating recommendation: ${error}`);
    }

    console.log("\n" + "-".repeat(80));
  }

  console.log("\n🎯 Test Summary:");
  console.log("These test cases demonstrate how the AI system applies the comprehensive rulebook");
  console.log("to classify tasks into appropriate cognitive work modes based on:");
  console.log("- Task characteristics and cognitive demands");
  console.log("- Duration and complexity requirements");
  console.log("- Urgency and importance (Eisenhower Matrix)");
  console.log("- Project context and keywords");
  console.log("- Productivity best practices and cognitive science principles");
}

/**
 * Demonstrate fallback classification when AI is unavailable
 */
export function demonstrateFallbackClassification() {
  console.log("\n🔄 Fallback Classification Demo");
  console.log("=".repeat(50));

  const fallbackTestCases = [
    {
      title: "Debug complex algorithm",
      description: "Fix performance issues in sorting algorithm",
      duration: 120,
      importance: true,
      urgency: false,
      projectName: "Software Development"
    },
    {
      title: "Brainstorm new features",
      description: "Generate ideas for next product iteration",
      duration: 60,
      importance: true,
      urgency: false,
      projectName: "Product Development"
    },
    {
      title: "Reply to urgent email",
      description: "Address client's immediate concerns",
      duration: 15,
      importance: false,
      urgency: true,
      projectName: "Client Relations"
    }
  ];

  for (const task of fallbackTestCases) {
    console.log(`\n📋 Task: ${task.title}`);
    console.log(`Duration: ${task.duration} min, Important: ${task.importance}, Urgent: ${task.urgency}`);
    
    // Simulate fallback classification logic
    let category: WorkCategory;
    let reasoning: string;

    if (task.duration >= 60 && task.importance && 
        (task.title.toLowerCase().includes("debug") || task.title.toLowerCase().includes("algorithm"))) {
      category = WorkCategory.DEEP_WORK;
      reasoning = "Long duration, important task with complex/analytical nature requiring sustained focus";
    } else if (task.title.toLowerCase().includes("brainstorm")) {
      category = WorkCategory.CREATIVE_WORK;
      reasoning = "Task involves ideation, imagination, or creating original content";
    } else if (task.urgency || task.duration <= 30) {
      category = WorkCategory.EXECUTIVE_WORK;
      reasoning = "Urgent task, short duration, or reactive/administrative nature";
    } else {
      category = WorkCategory.REFLECTIVE_WORK;
      reasoning = "Task involves planning, learning, or strategic thinking (important but not urgent)";
    }

    console.log(`🔄 Fallback Classification: ${category}`);
    console.log(`📝 Reasoning: ${reasoning}`);
  }
}

// Export test functions for use in other modules
export { testCases, mockUserPreferences };
