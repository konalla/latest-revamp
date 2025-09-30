import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";
import prisma from "../config/prisma.js";

// Define the work categories
export enum WorkCategory {
  DEEP_WORK = "Deep Work",
  CREATIVE_WORK = "Creative Work", 
  REFLECTIVE_WORK = "Reflective Work",
  EXECUTIVE_WORK = "Executive Work"
}

// Define the recommendation schema
const TaskRecommendationSchema = z.object({
  category: z.nativeEnum(WorkCategory),
  recommendedTime: z.string().describe("Recommended time slot in HH:MM format"),
  confidence: z.number().min(0).max(1).describe("Confidence score between 0 and 1"),
  reasoning: z.string().describe("Brief explanation for the recommendation")
});

export type TaskRecommendation = z.infer<typeof TaskRecommendationSchema>;

// Define the user work preferences interface
export interface UserWorkPreferences {
  deepWorkStartTime: string;
  deepWorkEndTime: string;
  creativeWorkStartTime: string;
  creativeWorkEndTime: string;
  reflectiveWorkStartTime: string;
  reflectiveWorkEndTime: string;
  executiveWorkStartTime: string;
  executiveWorkEndTime: string;
}

// Define the task analysis interface
export interface TaskAnalysis {
  title: string;
  description?: string;
  duration: number;
  importance: boolean;
  urgency: boolean;
  dueDate?: Date;
  projectName?: string;
}

export class AIRecommendationService {
  private llm: ChatOpenAI;
  private parser: any;

  constructor() {
    this.llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.3,
      openAIApiKey: process.env.OPENAI_API_KEY || "",
    });

    this.parser = StructuredOutputParser.fromZodSchema(TaskRecommendationSchema as any);
  }

  /**
   * Generate AI recommendation for a task based on its attributes and user preferences
   */
  async generateTaskRecommendation(
    task: TaskAnalysis,
    userPreferences: UserWorkPreferences,
    userId: number
  ): Promise<TaskRecommendation> {
    try {
      // Get user's historical task patterns for better recommendations
      const userTaskHistory = await this.getUserTaskHistory(userId);
      
      // Create dynamic prompt based on task attributes and user preferences
      const prompt = this.createDynamicPrompt(task, userPreferences, userTaskHistory);
      
      // Get AI recommendation
      const formattedPrompt = await prompt.format({});
      const response = await this.llm.invoke(formattedPrompt);
      
      // Parse the structured response
      const recommendation = await this.parser.parse(response.content as string);
      
      // Validate and adjust recommendation based on user preferences
      const validatedRecommendation = this.validateRecommendation(recommendation, userPreferences);
      
      return validatedRecommendation;
    } catch (error) {
      console.error("Error generating AI recommendation:", error);
      // Return fallback recommendation
      return this.getFallbackRecommendation(task, userPreferences);
    }
  }

  /**
   * Create dynamic prompt based on task attributes and user preferences
   */
  private createDynamicPrompt(
    task: TaskAnalysis,
    userPreferences: UserWorkPreferences,
    userHistory: any[]
  ): PromptTemplate {
    const formatInstructions = this.parser.getFormatInstructions();
    
    const template = `
You are an AI productivity expert specializing in task categorization based on cognitive work modes. Use the comprehensive rulebook below to classify tasks accurately.

TASK ANALYSIS:
- Title: {title}
- Description: {description}
- Duration: {duration} minutes
- Importance: {importance}
- Urgency: {urgency}
- Project: {projectName}

USER WORK PREFERENCES:
- Deep Work: {deepWorkStartTime} - {deepWorkEndTime}
- Creative Work: {creativeWorkStartTime} - {creativeWorkEndTime}
- Reflective Work: {reflectiveWorkStartTime} - {reflectiveWorkEndTime}
- Executive Work: {executiveWorkStartTime} - {executiveWorkEndTime}

USER TASK HISTORY (for pattern recognition):
{userHistory}

COMPREHENSIVE CLASSIFICATION RULEBOOK:

1. DEEP WORK MODE:
   Definition: Tasks demanding intense concentration and uninterrupted focus on cognitively demanding activities that produce high-value output.

   Characteristics:
   - HIGH COGNITIVE DEMAND: Complex problem-solving, analytical thinking, skill-intensive work (coding algorithms, writing in-depth reports, strategic analysis)
   - UNINTERRUPTED FOCUS NEEDED: Cannot be effectively broken into tiny chunks without losing productivity. Requires distraction-free environment for sustained blocks
   - IMPORTANT/HIGH-VALUE: Usually maps to Important items in Eisenhower Matrix (Quadrant I or II). Premium mental mode for tasks significantly impacting long-term goals
   - LONGER DURATION: Typically 1-4 hours of focused effort. Extended blocks rather than squeezed between other tasks
   - Examples: Writing code for complex features, analyzing research data, drafting scholarly articles, learning difficult concepts, debugging hard problems, strategic planning

   Classification Criteria:
   - Duration ≥ 60 minutes AND (Importance = true OR complex technical/analytical nature)
   - Keywords: "design", "develop", "analyze", "strategy", "focus", "implement", "debug", "research"
   - Project contexts: "Software Development", "Thesis Research", "Strategic Planning"

2. CREATIVE WORK MODE:
   Definition: Tasks involving ideation, imagination, and producing original content or designs. Emphasis on innovation and creativity.

   Characteristics:
   - ORIGINAL CREATION: Making something new - artistic (writing, drawing, composing) or inventive (brainstorming solutions, product ideas)
   - IDEATION AND DIVERGENT THINKING: Exploring diverse ideas, no single "correct" answer. Thrives on imagination and brainstorming
   - FLEXIBLE FOCUS & ENVIRONMENT: Benefits from flow state, relaxed yet alert mind state. Can be nonlinear in execution
   - IMPORTANCE AND DEADLINES: Often tied to important long-term projects (Quadrant II). Can be urgent if creative work under deadline
   - Examples: Designing presentation visuals, writing blog posts/stories, creating art, drafting marketing copy, brainstorming solutions, developing prototypes

   Classification Criteria:
   - Keywords: "brainstorm", "invent", "imagine", "conceptualize", "draft creative copy", "design", "create", "write", "compose"
   - Project contexts: "Brand Design Project", "Content Creation", "Marketing Campaign"
   - Nature: Generating ideas, artistic/design components, creative problem-solving

3. REFLECTIVE WORK MODE:
   Definition: Tasks focused on thinking, learning, and strategic analysis rather than immediate execution. Deliberate reflection and high-level thinking.

   Characteristics:
   - STRATEGIC OR ANALYTICAL THINKING: Planning, strategizing, reviewing, problem-solving at conceptual level
   - REQUIRES DEEP THOUGHT: Benefits from uninterrupted time and focus. Output is insight or decision, not physical product
   - IMPORTANT BUT OFTEN NOT URGENT: Typically Quadrant II - high importance, low urgency. Crucial for long-term success
   - INSIGHT AND LEARNING ORIENTED: Aim to gain insight, improve understanding, connect dots, make decisions
   - Examples: Meditation on goals, reading industry research, mapping business strategy, risk analysis, learning new frameworks, conducting post-mortems

   Classification Criteria:
   - Keywords: "plan", "review", "learn", "research", "analyze options", "consider", "strategize", "reflect", "study"
   - Project contexts: "Professional Development", "Strategic Planning", "Learning"
   - Nature: Figuring something out, exploring ideas, making decisions, gaining insights

4. EXECUTIVE WORK MODE:
   Definition: Tasks involving rapid action, decision-making, and managing day-to-day operations. Reactive, interrupt-driven tasks.

   Characteristics:
   - REACTIVE AND FAST-PACED: Responding to immediate demands, external inputs, urgent situations
   - SHORT, FRAGMENTED TASKS: Brief duration, often interrupted. Fits into small time windows
   - DECISION-MAKING & MULTITASKING: Quick decisions, context switching, coordination among many issues
   - OFTEN URGENT OR DEADLINE-DRIVEN: Quadrants I and III (urgent categories). Must be completed soon
   - PEOPLE-FACING AND OUTWARD-FOCUSED: Communication, coordination, dealing with clients/team members
   - Examples: Checking email, returning calls, status updates, scheduling, routine paperwork, meetings, quick fixes

   Classification Criteria:
   - Duration ≤ 30 minutes OR urgent nature
   - Keywords: "reply", "call", "meeting", "update", "schedule", "approve", "coordinate", "manage"
   - Project contexts: "Operations", "Team Management", "Administration"
   - Nature: Reacting to immediate needs, routine operations, quick execution

EISENHOWER MATRIX INTEGRATION:
- Quadrant I (Urgent + Important): Complex tasks → Deep Work; Creative tasks → Creative Work; Simple execution → Executive Work
- Quadrant II (Important + Not Urgent): Complex/analytical → Deep Work; Creative → Creative Work; Planning/learning → Reflective Work
- Quadrant III (Urgent + Not Important): Usually Executive Work (handle efficiently or delegate)
- Quadrant IV (Not Urgent + Not Important): Executive Work or consider eliminating

CLASSIFICATION PRIORITY:
1. Analyze task's core nature and cognitive demands
2. Consider duration and complexity
3. Evaluate urgency and importance
4. Look at project context and keywords
5. Apply predominant mode when tasks involve multiple modes

RECOMMENDATION GUIDELINES:
1. Use all task fields together for comprehensive analysis
2. When fields seem mixed, prioritize the task's core nature
3. Don't double-classify; choose the most defining characteristic
4. Consider user's work preferences and optimal time slots
5. Provide clear reasoning based on the rulebook criteria

{formatInstructions}
`;

    return new PromptTemplate({
      template,
      inputVariables: [
        "title",
        "description", 
        "duration",
        "importance",
        "urgency",
        "projectName",
        "deepWorkStartTime",
        "deepWorkEndTime",
        "creativeWorkStartTime",
        "creativeWorkEndTime",
        "reflectiveWorkStartTime",
        "reflectiveWorkEndTime",
        "executiveWorkStartTime",
        "executiveWorkEndTime",
        "userHistory",
        "formatInstructions"
      ],
    });
  }

  /**
   * Get user's task history for pattern recognition
   */
  private async getUserTaskHistory(userId: number, limit: number = 20): Promise<any[]> {
    try {
      const tasks = await prisma.task.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          title: true,
          category: true,
          duration: true,
          importance: true,
          urgency: true,
          completed: true,
          createdAt: true
        }
      });

      return tasks.map(task => ({
        title: task.title,
        category: task.category,
        duration: task.duration,
        importance: task.importance,
        urgency: task.urgency,
        completed: task.completed,
        createdAt: task.createdAt
      }));
    } catch (error) {
      console.error("Error fetching user task history:", error);
      return [];
    }
  }

  /**
   * Validate and adjust recommendation based on user preferences
   */
  private validateRecommendation(
    recommendation: TaskRecommendation,
    userPreferences: UserWorkPreferences
  ): TaskRecommendation {
    // Ensure recommended time is within the category's time window
    const categoryTimeSlots = this.getCategoryTimeSlots(userPreferences);
    const categorySlot = categoryTimeSlots[recommendation.category as keyof typeof categoryTimeSlots];
    
    if (categorySlot) {
      // If recommended time is outside the category window, adjust it
      if (recommendation.recommendedTime < categorySlot.start || 
          recommendation.recommendedTime > categorySlot.end) {
        recommendation.recommendedTime = categorySlot.start;
        recommendation.reasoning += " (Adjusted to fit category time window)";
      }
    }

    return recommendation;
  }

  /**
   * Get time slots for each work category
   */
  private getCategoryTimeSlots(userPreferences: UserWorkPreferences) {
    return {
      [WorkCategory.DEEP_WORK]: {
        start: userPreferences.deepWorkStartTime,
        end: userPreferences.deepWorkEndTime
      },
      [WorkCategory.CREATIVE_WORK]: {
        start: userPreferences.creativeWorkStartTime,
        end: userPreferences.creativeWorkEndTime
      },
      [WorkCategory.REFLECTIVE_WORK]: {
        start: userPreferences.reflectiveWorkStartTime,
        end: userPreferences.reflectiveWorkEndTime
      },
      [WorkCategory.EXECUTIVE_WORK]: {
        start: userPreferences.executiveWorkStartTime,
        end: userPreferences.executiveWorkEndTime
      }
    };
  }

  /**
   * Get fallback recommendation when AI fails
   * Uses rulebook-based classification logic
   */
  private getFallbackRecommendation(
    task: TaskAnalysis,
    userPreferences: UserWorkPreferences
  ): TaskRecommendation {
    let category: WorkCategory;
    let recommendedTime: string;
    let reasoning: string;

    // Rulebook-based classification logic
    const title = task.title.toLowerCase();
    const description = (task.description || "").toLowerCase();
    const projectName = (task.projectName || "").toLowerCase();
    const combinedText = `${title} ${description} ${projectName}`;

    // Deep Work indicators
    const deepWorkKeywords = ["design", "develop", "analyze", "strategy", "focus", "implement", "debug", "research", "code", "algorithm", "complex", "technical"];
    const deepWorkProjects = ["software development", "thesis research", "strategic planning", "development", "engineering"];
    
    // Creative Work indicators
    const creativeKeywords = ["brainstorm", "invent", "imagine", "conceptualize", "create", "write", "compose", "design", "art", "creative", "draft", "prototype"];
    const creativeProjects = ["brand design", "content creation", "marketing campaign", "creative", "design"];
    
    // Reflective Work indicators
    const reflectiveKeywords = ["plan", "review", "learn", "research", "consider", "strategize", "reflect", "study", "analyze options", "post-mortem"];
    const reflectiveProjects = ["professional development", "strategic planning", "learning", "training"];
    
    // Executive Work indicators
    const executiveKeywords = ["reply", "call", "meeting", "update", "schedule", "approve", "coordinate", "manage", "email", "admin"];
    const executiveProjects = ["operations", "team management", "administration", "admin"];

    // Classification logic based on rulebook
    if (task.duration >= 60 && task.importance && 
        (deepWorkKeywords.some(kw => combinedText.includes(kw)) || 
         deepWorkProjects.some(proj => combinedText.includes(proj)))) {
      category = WorkCategory.DEEP_WORK;
      recommendedTime = userPreferences.deepWorkStartTime;
      reasoning = "Long duration, important task with complex/analytical nature requiring sustained focus";
    } else if (creativeKeywords.some(kw => combinedText.includes(kw)) || 
               creativeProjects.some(proj => combinedText.includes(proj))) {
      category = WorkCategory.CREATIVE_WORK;
      recommendedTime = userPreferences.creativeWorkStartTime;
      reasoning = "Task involves ideation, imagination, or creating original content";
    } else if (reflectiveKeywords.some(kw => combinedText.includes(kw)) || 
               reflectiveProjects.some(proj => combinedText.includes(proj)) ||
               (task.importance && !task.urgency)) {
      category = WorkCategory.REFLECTIVE_WORK;
      recommendedTime = userPreferences.reflectiveWorkStartTime;
      reasoning = "Task involves planning, learning, or strategic thinking (important but not urgent)";
    } else if (task.urgency || 
               task.duration <= 30 || 
               executiveKeywords.some(kw => combinedText.includes(kw)) || 
               executiveProjects.some(proj => combinedText.includes(proj))) {
      category = WorkCategory.EXECUTIVE_WORK;
      recommendedTime = userPreferences.executiveWorkStartTime;
      reasoning = "Urgent task, short duration, or reactive/administrative nature";
    } else {
      // Default fallback based on Eisenhower Matrix
      if (task.urgency && !task.importance) {
        category = WorkCategory.EXECUTIVE_WORK;
        recommendedTime = userPreferences.executiveWorkStartTime;
        reasoning = "Urgent but not important - handle efficiently";
      } else if (task.importance && !task.urgency) {
        category = WorkCategory.DEEP_WORK;
        recommendedTime = userPreferences.deepWorkStartTime;
        reasoning = "Important but not urgent - deserves focused attention";
      } else if (task.importance && task.urgency) {
        category = WorkCategory.EXECUTIVE_WORK;
        recommendedTime = userPreferences.executiveWorkStartTime;
        reasoning = "Urgent and important - requires immediate execution";
      } else {
        category = WorkCategory.EXECUTIVE_WORK;
        recommendedTime = userPreferences.executiveWorkStartTime;
        reasoning = "Not urgent and not important - handle quickly or consider eliminating";
      }
    }

    return {
      category,
      recommendedTime,
      confidence: 0.6,
      reasoning: `Fallback recommendation: ${reasoning}`
    };
  }

  /**
   * Get user work preferences from database
   */
  async getUserWorkPreferences(userId: number): Promise<UserWorkPreferences> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          deep_work_start_time: true,
          deep_work_end_time: true,
          creative_work_start_time: true,
          creative_work_end_time: true,
          reflective_work_start_time: true,
          reflective_work_end_time: true,
          executive_work_start_time: true,
          executive_work_end_time: true
        }
      });

      if (!user) {
        throw new Error("User not found");
      }

      return {
        deepWorkStartTime: user.deep_work_start_time || "09:00",
        deepWorkEndTime: user.deep_work_end_time || "12:00",
        creativeWorkStartTime: user.creative_work_start_time || "12:00",
        creativeWorkEndTime: user.creative_work_end_time || "15:00",
        reflectiveWorkStartTime: user.reflective_work_start_time || "15:00",
        reflectiveWorkEndTime: user.reflective_work_end_time || "18:00",
        executiveWorkStartTime: user.executive_work_start_time || "18:00",
        executiveWorkEndTime: user.executive_work_end_time || "21:00"
      };
    } catch (error) {
      console.error("Error fetching user work preferences:", error);
      // Return default preferences
      return {
        deepWorkStartTime: "09:00",
        deepWorkEndTime: "12:00",
        creativeWorkStartTime: "12:00",
        creativeWorkEndTime: "15:00",
        reflectiveWorkStartTime: "15:00",
        reflectiveWorkEndTime: "18:00",
        executiveWorkStartTime: "18:00",
        executiveWorkEndTime: "21:00"
      };
    }
  }

  /**
   * Update user work preferences
   */
  async updateUserWorkPreferences(
    userId: number,
    preferences: Partial<UserWorkPreferences>
  ): Promise<UserWorkPreferences> {
    try {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(preferences.deepWorkStartTime && { deepWorkStartTime: preferences.deepWorkStartTime }),
          ...(preferences.deepWorkEndTime && { deepWorkEndTime: preferences.deepWorkEndTime }),
          ...(preferences.creativeWorkStartTime && { creativeWorkStartTime: preferences.creativeWorkStartTime }),
          ...(preferences.creativeWorkEndTime && { creativeWorkEndTime: preferences.creativeWorkEndTime }),
          ...(preferences.reflectiveWorkStartTime && { reflectiveWorkStartTime: preferences.reflectiveWorkStartTime }),
          ...(preferences.reflectiveWorkEndTime && { reflectiveWorkEndTime: preferences.reflectiveWorkEndTime }),
          ...(preferences.executiveWorkStartTime && { executiveWorkStartTime: preferences.executiveWorkStartTime }),
          ...(preferences.executiveWorkEndTime && { executiveWorkEndTime: preferences.executiveWorkEndTime })
        },
        select: {
          deep_work_start_time: true,
          deep_work_end_time: true,
          creative_work_start_time: true,
          creative_work_end_time: true,
          reflective_work_start_time: true,
          reflective_work_end_time: true,
          executive_work_start_time: true,
          executive_work_end_time: true
        }
      });

      return {
        deepWorkStartTime: updatedUser.deep_work_start_time || "09:00",
        deepWorkEndTime: updatedUser.deep_work_end_time || "12:00",
        creativeWorkStartTime: updatedUser.creative_work_start_time || "12:00",
        creativeWorkEndTime: updatedUser.creative_work_end_time || "15:00",
        reflectiveWorkStartTime: updatedUser.reflective_work_start_time || "15:00",
        reflectiveWorkEndTime: updatedUser.reflective_work_end_time || "18:00",
        executiveWorkStartTime: updatedUser.executive_work_start_time || "18:00",
        executiveWorkEndTime: updatedUser.executive_work_end_time || "21:00"
      };
    } catch (error) {
      console.error("Error updating user work preferences:", error);
      throw new Error("Failed to update work preferences");
    }
  }
}

// Export singleton instance
export const aiRecommendationService = new AIRecommendationService();
