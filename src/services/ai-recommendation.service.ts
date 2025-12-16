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

// Enhanced recommendation schema with Signal Layer and scheduling intelligence
const EnhancedTaskRecommendationSchema = z.object({
  category: z.nativeEnum(WorkCategory),
  signalType: z.enum(["Core-Signal", "High-Signal", "Strategic-Signal", "Neutral", "Noise"]).describe("Signal type based on HLA/AKR toggles"),
  importance: z.boolean().describe("Whether the task is important"),
  urgency: z.boolean().describe("Whether the task is urgent"),
  importanceFlag: z.boolean().nullable().describe("Flag for conflict detection with Signal Layer"),
  urgencyFlag: z.boolean().nullable().describe("Flag for conflict detection with Signal Layer"),
  priority: z.enum(["High", "Medium", "Low", "Noise"]).describe("Task priority level"),
  recommendedTime: z.string().describe("Recommended time slot in HH:MM format"),
  recommendedDuration: z.number().min(25).max(90).describe("Recommended duration in minutes (25-90)"),
  breakRecommendation: z.string().nullable().describe("Break advice (e.g., 'Take a 5-10 min break')"),
  loadWarning: z.string().nullable().describe("Load warning message if overload detected"),
  confidence: z.number().min(0).max(1).describe("Confidence score between 0 and 1"),
  reasoning: z.string().describe("Brief explanation for the recommendation")
});

export type EnhancedTaskRecommendation = z.infer<typeof EnhancedTaskRecommendationSchema>;

// Define the recommendation schema with priority evaluation (for bulk tasks with importance=false and urgency=false)
const TaskRecommendationWithPrioritySchema = z.object({
  category: z.nativeEnum(WorkCategory),
  recommendedTime: z.string().describe("Recommended time slot in HH:MM format"),
  confidence: z.number().min(0).max(1).describe("Confidence score between 0 and 1"),
  reasoning: z.string().describe("Brief explanation for the recommendation"),
  importance: z.boolean().describe("Whether the task is important (true) or not important (false)"),
  urgency: z.boolean().describe("Whether the task is urgent (true) or not urgent (false)"),
  priority: z.enum(["low", "medium", "high"]).describe("Task priority level: low, medium, or high")
});

export type TaskRecommendationWithPriority = z.infer<typeof TaskRecommendationWithPrioritySchema>;

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

// Signal Layer Types
export type SignalType =
  | "Core-Signal"
  | "High-Signal"
  | "Strategic-Signal"
  | "Neutral"
  | "Noise";

export type PriorityLevel = "High" | "Medium" | "Low" | "Noise";

// Define the task analysis interface
export interface TaskAnalysis {
  title: string;
  description?: string;
  duration: number;
  importance: boolean;
  urgency: boolean;
  // Signal Layer fields (user-controlled toggles from frontend)
  isHighLeverage?: boolean; // HLA toggle
  advancesKeyResults?: boolean; // AKR toggle
  dueDate?: Date;
  projectName?: string;
  objectiveName?: string;
  objectiveDescription?: string;
  okrTitle?: string;
  okrDescription?: string;
}

export class AIRecommendationService {
  private llm: ChatOpenAI;
  private parser: any;
  private systemPrompt: string;

  constructor() {
    // Initialize parser first
    this.parser = StructuredOutputParser.fromZodSchema(TaskRecommendationSchema as any);
    
    // Create system prompt with the comprehensive rulebook
    this.systemPrompt = this.createSystemPrompt();
    
    this.llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.3,
      openAIApiKey: process.env.OPENAI_API_KEY || "",
    });
  }

  /**
   * Determine Signal Type based on HLA, AKR, Importance, and Urgency toggles
   * This implements the Signal Layer priority hierarchy
   */
  determineSignalType(
    isHighLeverage: boolean,
    advancesKeyResults: boolean,
    importance: boolean,
    urgency: boolean
  ): SignalType {
    // Core-Signal: Both HLA and AKR are ON (highest priority)
    if (isHighLeverage && advancesKeyResults) {
      return "Core-Signal";
    }
    
    // High-Signal: Only HLA is ON
    if (isHighLeverage) {
      return "High-Signal";
    }
    
    // Strategic-Signal: Only AKR is ON
    if (advancesKeyResults) {
      return "Strategic-Signal";
    }
    
    // Noise: All toggles are OFF
    if (!isHighLeverage && !advancesKeyResults && !importance && !urgency) {
      return "Noise";
    }
    
    // Neutral: Default when HLA and AKR are OFF but Importance or Urgency is ON
    return "Neutral";
  }

  /**
   * Calculate break recommendation based on duration and consecutive sessions
   */
  calculateBreakRecommendation(
    duration: number,
    consecutiveSessions: number = 0
  ): string | null {
    // 3×90 min sessions → 1-hour recovery
    if (consecutiveSessions >= 3 && duration >= 90) {
      return "Take a 1-hour recovery break to prevent cognitive overload";
    }
    
    // 2×90 min sessions → 15-30 min break
    if (consecutiveSessions >= 2 && duration >= 90) {
      return "Take a 15-30 minute break to maintain focus";
    }
    
    // ≥45 min session → 5-10 min break
    if (duration >= 45) {
      return "Take a 5-10 minute break after this session";
    }
    
    return null;
  }

  /**
   * Detect load warning based on user's recent session history
   */
  async detectLoadWarning(
    userId: number,
    taskCategory: string,
    currentTime: Date = new Date()
  ): Promise<string | null> {
    try {
      // Get user's recent focus sessions from the last 24 hours
      const oneDayAgo = new Date(currentTime);
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      const recentSessions = await prisma.focusSession.findMany({
        where: {
          userId,
          createdAt: {
            gte: oneDayAgo,
          },
        },
        select: {
          id: true,
          duration: true,
          intention: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
      });

      // Extract task IDs from intention JSON and get their categories
      const taskIds: number[] = [];
      for (const session of recentSessions) {
        if (session.intention && typeof session.intention === 'object') {
          const intention = session.intention as any;
          if (intention.taskIds && Array.isArray(intention.taskIds)) {
            taskIds.push(...intention.taskIds);
          }
        }
      }

      // Get task categories if we have task IDs
      let taskCategories: string[] = [];
      if (taskIds.length > 0) {
        const tasks = await prisma.task.findMany({
          where: {
            id: { in: taskIds },
            userId,
          },
          select: {
            category: true,
          },
        });
        taskCategories = tasks.map(t => t.category || '');
      }

      // Count consecutive high-load sessions (Deep Work or long sessions)
      let consecutiveHighLoad = 0;
      let deepWorkCount = 0;
      
      for (const session of recentSessions) {
        // Check if session duration indicates high load
        const isLongSession = session.duration && session.duration >= 90;
        
        // Check if any tasks in this session are Deep Work
        // We approximate by checking if current task category is Deep Work
        // or if we have recent Deep Work tasks
        const hasDeepWork = taskCategory?.toLowerCase().includes('deep') || 
                           taskCategory?.toLowerCase() === 'deepwork' ||
                           taskCategories.some(cat => 
                             cat?.toLowerCase().includes('deep') || 
                             cat?.toLowerCase() === 'deepwork'
                           );
        
        if (hasDeepWork || isLongSession) {
          consecutiveHighLoad++;
          if (hasDeepWork) {
            deepWorkCount++;
          }
        } else {
          break; // Reset count if we hit a non-high-load session
        }
      }

      // Warn if multiple high-load sessions detected
      if (consecutiveHighLoad >= 3) {
        return "You have performed multiple high-load sessions. Reduce intensity to avoid fatigue.";
      }

      // Warn if too many Deep Work sessions clustered
      if (deepWorkCount >= 3) {
        return "Multiple Deep Work sessions detected. Consider switching to Reflective or Executive tasks.";
      }

      return null;
    } catch (error) {
      console.error("Error detecting load warning:", error);
      return null;
    }
  }

  /**
   * Get mode balancing recommendation when one mode is overloaded
   */
  getModeBalancingRecommendation(overloadedMode: string): string | null {
    const mode = overloadedMode.toLowerCase();
    
    if (mode.includes('deep') || mode.includes('creative')) {
      return "Consider switching to Reflective or Executive tasks to balance your cognitive load";
    }
    
    return null;
  }

  /**
   * Get day-shaping recommendation based on time of day
   */
  getDayShapingRecommendation(category: string, currentTime: Date = new Date()): string {
    const hour = currentTime.getHours();
    const isMorning = hour >= 6 && hour < 12;
    const isAfternoon = hour >= 12 && hour < 18;
    
    const cat = category.toLowerCase();
    
    if (isMorning) {
      if (cat.includes('deep') || cat.includes('reflective')) {
        return "Morning is optimal for Deep Work and Reflective tasks";
      }
      if (cat.includes('creative') || cat.includes('executive')) {
        return "Consider scheduling this in the afternoon for better performance";
      }
    }
    
    if (isAfternoon) {
      if (cat.includes('creative') || cat.includes('executive')) {
        return "Afternoon is optimal for Creative and Executive tasks";
      }
      if (cat.includes('deep') || cat.includes('reflective')) {
        return "Consider scheduling this in the morning for better performance";
      }
    }
    
    return "";
  }

  /**
   * Apply disambiguation rules for ambiguous task classifications
   */
  applyDisambiguationRules(task: TaskAnalysis, initialCategory: WorkCategory): WorkCategory {
    const title = (task.title || "").toLowerCase();
    const description = (task.description || "").toLowerCase();
    const combinedText = `${title} ${description}`;

    // Design Tasks
    if (combinedText.includes('design')) {
      // Technical/system design → Deep
      if (combinedText.includes('system') || combinedText.includes('technical') || 
          combinedText.includes('architecture') || combinedText.includes('code')) {
        return WorkCategory.DEEP_WORK;
      }
      // Visual/creative design → Creative
      if (combinedText.includes('visual') || combinedText.includes('ui') || 
          combinedText.includes('graphic') || combinedText.includes('art')) {
        return WorkCategory.CREATIVE_WORK;
      }
    }

    // Research Tasks
    if (combinedText.includes('research')) {
      // Analytical/evaluative research → Deep
      if (combinedText.includes('analyze') || combinedText.includes('evaluate') || 
          combinedText.includes('data') || combinedText.includes('statistics')) {
        return WorkCategory.DEEP_WORK;
      }
      // Exploratory/learning research → Reflective
      if (combinedText.includes('explore') || combinedText.includes('learn') || 
          combinedText.includes('study') || combinedText.includes('understand')) {
        return WorkCategory.REFLECTIVE_WORK;
      }
    }

    // Planning Tasks
    if (combinedText.includes('plan') || combinedText.includes('strategy')) {
      // Strategic planning → Reflective
      if (combinedText.includes('strategic') || combinedText.includes('long-term') || 
          combinedText.includes('vision') || combinedText.includes('roadmap')) {
        return WorkCategory.REFLECTIVE_WORK;
      }
      // Execution planning → Deep
      if (combinedText.includes('execute') || combinedText.includes('implement') || 
          combinedText.includes('action') || combinedText.includes('tactical')) {
        return WorkCategory.DEEP_WORK;
      }
    }

    // Return initial category if no disambiguation rules match
    return initialCategory;
  }

  /**
   * Calibrate confidence and determine if user confirmation is needed
   */
  calibrateConfidence(confidence: number): { level: string; action: string } {
    if (confidence >= 0.90) {
      return { level: "High", action: "High certainty - proceed" };
    }
    if (confidence >= 0.70) {
      return { level: "Stable", action: "Stable classification - proceed" };
    }
    if (confidence >= 0.50) {
      return { level: "Confirm", action: "Ask user to confirm" };
    }
    return { level: "Clarify", action: "Request clarification" };
  }

  /**
   * Create system prompt with comprehensive rulebook
   */
  private createSystemPrompt(): string {
    const formatInstructions = this.parser.getFormatInstructions();
    
    return `You are an AI productivity expert specializing in task categorization, prioritization, and cognitive scheduling. Follow the IQNITI PRIORITIZATION + CLASSIFICATION + SCHEDULING RULEBOOK below EXACTLY.

================================================================================
IQNITI PRIORITIZATION + CLASSIFICATION + SCHEDULING RULEBOOK
================================================================================

PRIORITY ORDER (MUST EVALUATE IN THIS EXACT SEQUENCE):
1. Signal Layer (HLA, AKR) ← HIGHEST PRIORITY
2. FocusZone (Important/Urgent)
3. Cognitive Mode Classification
4. Scheduling Engine (windows, breaks, load)
5. Noise Handling

================================================================================
1. SIGNAL LAYER (TIER 0 - HIGHEST PRIORITY)
================================================================================

The Signal Layer is determined by user-controlled toggles in the task:
- HLA (High-Leverage Activity): Task has disproportionate impact relative to effort
- AKR (Advances Key Results): Task directly aligns with strategic OKRs

SIGNAL TYPE CLASSIFICATION:
- HLA=true + AKR=true → "Core-Signal" (HIGHEST PRIORITY)
  → Must be scheduled in first/second peak block
  → No batching allowed
  → Strict load protection
  → Mandatory recovery block afterward
  → Recommended duration: 45-90 minutes

- HLA=true + AKR=false → "High-Signal"
  → Very high priority
  → Scheduled in peak cognitive windows
  → Protected from batching or deprioritization
  → Conservative load management
  → Recommended duration: 45-90 minutes

- HLA=false + AKR=true → "Strategic-Signal"
  → High priority, aligned with OKRs
  → Never treated as Noise
  → Early-day execution windows
  → Deadline conflict detection
  → Recommended duration: 45-90 minutes (adjusted by cognitive mode)

- HLA=false + AKR=false → "Neutral"
  → Default classification
  → Importance and Urgency are then evaluated

- HLA=false + AKR=false + Important=false + Urgent=false → "Noise"
  → All toggles are OFF
  → User confirmation required before scheduling
  → Batching recommended
  → Low-energy scheduling
  → Consider elimination or delegation

CRITICAL: Signal Layer ALWAYS outranks all other priority factors. If a task has HLA=true or AKR=true, it must be prioritized accordingly regardless of other factors.

================================================================================
2. FOCUSZONE PRIORITY LAYER (EISENHOWER MATRIX)
================================================================================

User-controlled inputs:
- Important = true/false
- Urgent = true/false

RULES:
- FULLY RESPECT Important/Urgent booleans - NEVER override user settings
- If conflict detected between Signal Layer and FocusZone → flag for user confirmation
- Meaning is determined by Signal Layer, not FocusZone
- FocusZone determines HOW task is handled, not whether it's meaningful

EISENHOWER MATRIX INTEGRATION:
- Quadrant I (Urgent + Important): Complex tasks → Deep Work; Creative tasks → Creative Work; Simple execution → Executive Work
- Quadrant II (Important + Not Urgent): Complex/analytical → Deep Work; Creative → Creative Work; Planning/learning → Reflective Work
- Quadrant III (Urgent + Not Important): Usually Executive Work (handle efficiently or delegate)
- Quadrant IV (Not Urgent + Not Important): Executive Work or consider eliminating

================================================================================
3. COGNITIVE MODE CLASSIFICATION
================================================================================

Classify tasks into one of four cognitive work modes:

1. DEEP WORK MODE:
   Definition: Analytical, technical, high-load tasks requiring intense concentration.
   Characteristics:
   - HIGH COGNITIVE DEMAND: Complex problem-solving, analytical thinking, skill-intensive work
   - UNINTERRUPTED FOCUS NEEDED: Requires distraction-free environment for sustained blocks
   - Examples: Coding algorithms, writing in-depth reports, strategic analysis, debugging complex problems, system architecture
   Classification Criteria:
   - Duration ≥ 60 minutes AND (Importance = true OR complex technical/analytical nature)
   - Keywords: "design", "develop", "analyze", "strategy", "focus", "implement", "debug", "research"
   - Project contexts: "Software Development", "Thesis Research", "Strategic Planning"

2. CREATIVE WORK MODE:
   Definition: Ideation, conceptual work involving imagination and original content creation.
   Characteristics:
   - ORIGINAL CREATION: Making something new - artistic or inventive
   - IDEATION AND DIVERGENT THINKING: Exploring diverse ideas, no single "correct" answer
   - Examples: Designing visuals, writing blog posts, creating art, drafting marketing copy, brainstorming solutions
   Classification Criteria:
   - Keywords: "brainstorm", "invent", "imagine", "conceptualize", "draft creative copy", "design", "create", "write", "compose"
   - Project contexts: "Brand Design Project", "Content Creation", "Marketing Campaign"
   - Nature: Generating ideas, artistic/design components, creative problem-solving

3. REFLECTIVE WORK MODE:
   Definition: Reviewing, learning, strategic thinking tasks focused on insight and analysis.
   Characteristics:
   - STRATEGIC OR ANALYTICAL THINKING: Planning, strategizing, reviewing, problem-solving at conceptual level
   - INSIGHT AND LEARNING ORIENTED: Aim to gain insight, improve understanding, connect dots
   - Examples: Reading industry research, mapping business strategy, risk analysis, learning new frameworks, conducting post-mortems
   Classification Criteria:
   - Keywords: "plan", "review", "learn", "research", "analyze options", "consider", "strategize", "reflect", "study"
   - Project contexts: "Professional Development", "Strategic Planning", "Learning"
   - Nature: Figuring something out, exploring ideas, making decisions, gaining insights

4. EXECUTIVE WORK MODE:
   Definition: Admin, coordination, logistics tasks involving rapid action and operations.
   Characteristics:
   - REACTIVE AND FAST-PACED: Responding to immediate demands, external inputs
   - SHORT, FRAGMENTED TASKS: Brief duration, often interrupted
   - Examples: Checking email, returning calls, status updates, scheduling, routine paperwork, meetings, quick fixes
   Classification Criteria:
   - Duration ≤ 30 minutes OR urgent nature
   - Keywords: "reply", "call", "meeting", "update", "schedule", "approve", "coordinate", "manage"
   - Project contexts: "Operations", "Team Management", "Administration"

================================================================================
DISAMBIGUATION RULES
================================================================================

When tasks are ambiguous, apply these rules:

DESIGN TASKS:
- Technical/system design → Deep Work
- Visual/creative design → Creative Work

RESEARCH TASKS:
- Analytical/evaluative research → Deep Work
- Exploratory/learning research → Reflective Work

PLANNING TASKS:
- Strategic planning → Reflective Work
- Execution detail planning → Deep Work

================================================================================
CLASSIFICATION ORDER (EVALUATE IN THIS SEQUENCE)
================================================================================

1. Cognitive Demand → What level of mental effort is required?
2. Output Nature → What type of output will be produced?
3. Context → Deadlines, dependencies, project type
4. Duration → Modifier only (short tasks can still be Deep Work)
5. Keywords → Tie-breaker only

CRITICAL: Short tasks may still qualify as Deep Work if they have high cognitive demand.

================================================================================
CONFIDENCE THRESHOLDS
================================================================================

Assign confidence scores based on classification certainty:

- 0.90-1.00 = High certainty → Proceed with recommendation
- 0.70-0.89 = Acceptable → Stable classification, proceed
- 0.50-0.69 = Confirm → Ask user to confirm classification
- <0.50 = Clarify → Request clarification from user

================================================================================
SCHEDULING RULES
================================================================================

FOCUS WINDOWS:
- All sessions must fall within 25-90 minutes (depending on cognitive mode)

BREAK RECOMMENDATIONS:
- ≥45 minutes → Recommend 5-10 minute break
- 2×90 minute sessions → Recommend 15-30 minute break
- 3×90 minute sessions → Recommend 1-hour recovery break

LOAD DETECTION:
- Monitor Deep Work clusters
- Track consecutive high-load sessions
- Detect repeated high-load days
- Warn if overload detected: "You have performed multiple high-load sessions. Reduce intensity to avoid fatigue."

MODE BALANCING:
- If one mode is overloaded, recommend switching to Reflective or Executive tasks

DAY-SHAPING:
- Morning → Prefer Deep Work / Reflective Work
- Afternoon → Prefer Creative Work / Executive Work

================================================================================
NOISE RULE
================================================================================

A task is classified as "Noise" ONLY if ALL of the following are false:
- HLA = false
- AKR = false
- Important = false
- Urgent = false

NOISE HANDLING:
- Never auto-remove Noise tasks
- Always ask user before batching/delaying
- Recommend batching with other low-priority tasks
- Schedule in low-energy windows
- Consider elimination or delegation

================================================================================
RECOMMENDATION GUIDELINES
================================================================================

1. ALWAYS evaluate in the exact priority order: Signal Layer → FocusZone → Cognitive Mode → Scheduling → Noise
2. Use all task fields together for comprehensive analysis
3. When fields seem mixed, prioritize Signal Layer first, then cognitive demand
4. Don't double-classify; choose the most defining characteristic
5. Consider user's work preferences and optimal time slots
6. Provide clear reasoning that references the rulebook criteria
7. Include Signal Type in reasoning when applicable
8. Adjust recommended duration based on Signal Type (45-90 min for Signal tasks)

================================================================================
OUTPUT FORMAT (FINAL MODEL RESPONSE SCHEMA)
================================================================================

You MUST return a deterministic, structured payload for every evaluated task. This schema reflects the full prioritization, classification, scheduling, and load-management logic.

REQUIRED FIELDS AND THEIR DERIVATION:

1. "category": "Deep" | "Creative" | "Reflective" | "Executive"
   → Derived from Cognitive Mode Classification layer
   → Choose the most appropriate cognitive mode based on task analysis

2. "signalType": "Core-Signal" | "High-Signal" | "Strategic-Signal" | "Neutral" | "Noise"
   → Derived from HLA/AKR toggles in the task
   → HLA=true + AKR=true → "Core-Signal"
   → HLA=true only → "High-Signal"
   → AKR=true only → "Strategic-Signal"
   → HLA=false + AKR=false + Important=false + Urgent=false → "Noise"
   → Otherwise → "Neutral"

3. "importance": boolean
   → ALWAYS mirror the user's input exactly
   → Never change this value - it reflects what the user set

4. "urgency": boolean
   → ALWAYS mirror the user's input exactly
   → Never change this value - it reflects what the user set

5. "importanceFlag": true | false | null
   → Set to TRUE if Signal Layer suggests high priority but user marked Important=false
   → Set to FALSE if Signal Layer suggests low priority but user marked Important=true
   → Set to NULL if no conflict detected
   → This flag indicates suspected misalignment - NEVER auto-change importance/urgency

6. "urgencyFlag": true | false | null
   → Set to TRUE if Signal Layer suggests high priority but user marked Urgent=false
   → Set to FALSE if Signal Layer suggests low priority but user marked Urgent=true
   → Set to NULL if no conflict detected
   → This flag indicates suspected misalignment - NEVER auto-change importance/urgency

7. "priority": "High" | "Medium" | "Low" | "Noise"
   → Final priority tier after all layers have been evaluated
   → Core-Signal → "High"
   → High-Signal or Strategic-Signal → "High"
   → Important tasks → "High" or "Medium"
   → Noise → "Noise"
   → Otherwise → "Medium" or "Low"

8. "recommendedTime": string (HH:MM format)
   → Aligned with user's focus windows for the cognitive mode
   → Example: "09:30", "14:00", "16:45"
   → Must respect user preferences for each cognitive mode

9. "recommendedDuration": number (25-90 minutes)
   → Follow focus-window rules (25-90 minutes)
   → Signal tasks (Core-Signal, High-Signal, Strategic-Signal) → 45-90 minutes
   → Deep Work → 60-90 minutes typically
   → Creative Work → 45-90 minutes
   → Reflective Work → 45-75 minutes
   → Executive Work → 25-45 minutes

10. "breakRecommendation": string | null
    → "Take a 5-10 min break" if duration ≥45 minutes
    → "Take a 15-30 min break" if 2×90 minute sessions detected
    → "Take a 1-hour recovery block" if 3×90 minute sessions detected
    → null if no break needed
    → Follow break and load-detection rules

11. "loadWarning": string | null
    → "You have performed multiple high-load sessions. Reduce intensity to avoid fatigue." if overload detected
    → "Multiple Deep Work sessions detected. Consider switching to Reflective or Executive tasks." if Deep Work clustering
    → null if no load warning needed
    → Follow load-detection rules

12. "confidence": number (0-1)
    → Calibrated confidence score
    → 0.90-1.00 = High certainty
    → 0.70-0.89 = Acceptable/Stable
    → 0.50-0.69 = Confirm needed
    → <0.50 = Clarification needed

13. "reasoning": string
    → Brief explanation for the recommendation
    → Must reference rulebook criteria
    → Include Signal Type explanation when applicable
    → Explain cognitive mode classification
    → Mention any flags or warnings if set
    → Provide transparency for debugging and user trust

EXAMPLE OUTPUT:
{
  "category": "Deep",
  "signalType": "Core-Signal",
  "importance": true,
  "urgency": false,
  "importanceFlag": null,
  "urgencyFlag": null,
  "priority": "High",
  "recommendedTime": "09:30",
  "recommendedDuration": 60,
  "breakRecommendation": "Take a 5-10 min break",
  "loadWarning": null,
  "confidence": 0.92,
  "reasoning": "Classified as Deep Work due to technical nature and high cognitive demand. Marked as Core-Signal because HLA and AKR are true. Highest priority task requiring peak cognitive window."
}

CRITICAL RULES:
- category is derived from Cognitive Mode Classification layer
- signalType is derived from HLA/AKR toggles (check task input)
- importance and urgency ALWAYS mirror user input (never change)
- importanceFlag and urgencyFlag indicate suspected misalignment (never auto-changed)
- priority is the final priority tier after all layers have been evaluated
- recommendedTime and recommendedDuration follow focus-window rules
- breakRecommendation and loadWarning follow break and load-detection rules
- confidence and reasoning provide transparency for debugging and user trust

================================================================================
RESPONSE FORMAT
================================================================================
${formatInstructions}`;
  }

  /**
   * Generate AI recommendation for a task based on its attributes and user preferences
   * Enhanced version with Signal Layer integration
   */
  async generateTaskRecommendation(
    task: TaskAnalysis,
    userPreferences: UserWorkPreferences,
    userId: number
  ): Promise<TaskRecommendation> {
    try {
      // Determine Signal Type from user toggles
      const signalType = this.determineSignalType(
        task.isHighLeverage || false,
        task.advancesKeyResults || false,
        task.importance,
        task.urgency
      );

      // Get user's historical task patterns for better recommendations
      const userTaskHistory = await this.getUserTaskHistory(userId);
      
      // Create compressed user prompt (include Signal Layer info)
      const userPrompt = this.createCompressedUserPrompt(task, userPreferences, userTaskHistory);
      
      // Create messages array with system prompt and user prompt
      const messages = [
        { role: "system" as const, content: this.systemPrompt },
        { role: "user" as const, content: userPrompt }
      ];
      
      // Get AI recommendation
      const response = await this.llm.invoke(messages);
      
      // Parse the structured response
      const recommendation = await this.parser.parse(response.content as string);
      
      // Apply disambiguation rules if needed
      const disambiguatedCategory = this.applyDisambiguationRules(task, recommendation.category);
      if (disambiguatedCategory !== recommendation.category) {
        recommendation.category = disambiguatedCategory;
        recommendation.reasoning += " (Applied disambiguation rules)";
      }
      
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
   * Generate enhanced AI recommendation with Signal Layer, scheduling intelligence, and all new features
   */
  async generateEnhancedTaskRecommendation(
    task: TaskAnalysis,
    userPreferences: UserWorkPreferences,
    userId: number
  ): Promise<EnhancedTaskRecommendation> {
    try {
      // Determine Signal Type from user toggles
      const signalType = this.determineSignalType(
        task.isHighLeverage || false,
        task.advancesKeyResults || false,
        task.importance,
        task.urgency
      );

      // Get user's historical task patterns
      const userTaskHistory = await this.getUserTaskHistory(userId);
      
      // Create compressed user prompt
      const userPrompt = this.createCompressedUserPrompt(task, userPreferences, userTaskHistory);
      
      // Use enhanced system prompt (we'll create this separately)
      // For now, use the standard prompt and enhance the response
      const messages = [
        { role: "system" as const, content: this.systemPrompt },
        { role: "user" as const, content: userPrompt }
      ];
      
      // Get AI recommendation
      const response = await this.llm.invoke(messages);
      
      // Parse the structured response
      const baseRecommendation = await this.parser.parse(response.content as string);
      
      // Apply disambiguation rules
      const category = this.applyDisambiguationRules(task, baseRecommendation.category);
      
      // Calculate recommended duration (25-90 minutes based on category and signal)
      let recommendedDuration = task.duration;
      if (recommendedDuration < 25) recommendedDuration = 25;
      if (recommendedDuration > 90) recommendedDuration = 90;
      
      // Adjust duration based on Signal Type
      if (signalType === "Core-Signal" || signalType === "High-Signal") {
        // Signal tasks should be 45-90 minutes
        if (recommendedDuration < 45) recommendedDuration = 45;
      }

      // Calculate break recommendation
      const breakRecommendation = this.calculateBreakRecommendation(recommendedDuration, 0);

      // Detect load warning
      const loadWarning = await this.detectLoadWarning(userId, category, new Date());

      // Determine priority based on Signal Type and importance/urgency
      let priority: "High" | "Medium" | "Low" | "Noise" = "Medium";
      if (signalType === "Core-Signal") {
        priority = "High";
      } else if (signalType === "High-Signal" || signalType === "Strategic-Signal") {
        priority = task.importance || task.urgency ? "High" : "Medium";
      } else if (signalType === "Noise") {
        priority = "Noise";
      } else {
        priority = task.importance ? (task.urgency ? "High" : "Medium") : "Low";
      }

      // Check for conflicts between Signal Layer and FocusZone
      let importanceFlag: boolean | null = null;
      let urgencyFlag: boolean | null = null;
      
      // If Signal Layer suggests high priority but user marked as not important/urgent, flag it
      if ((signalType === "Core-Signal" || signalType === "High-Signal" || signalType === "Strategic-Signal") 
          && !task.importance && !task.urgency) {
        importanceFlag = true; // Suggest it should be important
        urgencyFlag = signalType === "Core-Signal" ? true : null;
      }

      // Build enhanced recommendation
      const enhancedRecommendation: EnhancedTaskRecommendation = {
        category: category as any,
        signalType: signalType,
        importance: task.importance,
        urgency: task.urgency,
        importanceFlag,
        urgencyFlag,
        priority,
        recommendedTime: baseRecommendation.recommendedTime,
        recommendedDuration,
        breakRecommendation,
        loadWarning,
        confidence: baseRecommendation.confidence,
        reasoning: baseRecommendation.reasoning + 
          (signalType !== "Neutral" ? ` Signal Type: ${signalType}.` : "") +
          (breakRecommendation ? ` ${breakRecommendation}` : "") +
          (loadWarning ? ` Warning: ${loadWarning}` : "")
      };

      return enhancedRecommendation;
    } catch (error) {
      console.error("Error generating enhanced AI recommendation:", error);
      // Return fallback enhanced recommendation
      const signalType = this.determineSignalType(
        task.isHighLeverage || false,
        task.advancesKeyResults || false,
        task.importance,
        task.urgency
      );
      const fallback = this.getFallbackRecommendation(task, userPreferences);
      return {
        category: fallback.category,
        signalType,
        importance: task.importance,
        urgency: task.urgency,
        importanceFlag: null,
        urgencyFlag: null,
        priority: signalType === "Noise" ? "Noise" : (task.importance ? "High" : "Medium"),
        recommendedTime: fallback.recommendedTime,
        recommendedDuration: Math.min(Math.max(task.duration, 25), 90),
        breakRecommendation: this.calculateBreakRecommendation(task.duration),
        loadWarning: null,
        confidence: fallback.confidence,
        reasoning: fallback.reasoning
      };
    }
  }

  /**
   * Create system prompt for priority evaluation (when importance=false and urgency=false)
   */
  private createPriorityEvaluationSystemPrompt(): string {
    const priorityParser = StructuredOutputParser.fromZodSchema(TaskRecommendationWithPrioritySchema as any);
    const formatInstructions = priorityParser.getFormatInstructions();
    
    return `You are an AI productivity expert specializing in task categorization and priority evaluation. 

The task has been marked as NOT IMPORTANT and NOT URGENT. Your job is to evaluate whether this classification is correct based on the task's actual nature, context, and requirements.

CRITICAL: Follow the IQNITI PRIORITY ORDER:
1. Signal Layer (HLA, AKR) ← CHECK FIRST
2. FocusZone (Important/Urgent)
3. Cognitive Mode
4. Scheduling
5. Noise Handling

SIGNAL LAYER EVALUATION (HIGHEST PRIORITY):
- If task has HLA=true (High-Leverage Activity), it is HIGH PRIORITY regardless of Importance/Urgency
- If task has AKR=true (Advances Key Results), it is HIGH PRIORITY and aligns with OKRs
- If HLA=true AND AKR=true → Core-Signal (HIGHEST PRIORITY)
- Signal Layer tasks should NEVER be classified as low priority
- If Signal Layer indicates high priority but user marked as not important/urgent → Flag for confirmation

EISENHOWER MATRIX EVALUATION:
- Quadrant I (Urgent + Important): Critical tasks requiring immediate attention
- Quadrant II (Important + Not Urgent): Important tasks for long-term goals, should be prioritized
- Quadrant III (Urgent + Not Important): Tasks that seem urgent but don't contribute to goals, should be minimized
- Quadrant IV (Not Urgent + Not Important): Tasks that should be eliminated or delegated

EVALUATION CRITERIA FOR IMPORTANCE:
- Does this task contribute to long-term goals or objectives?
- Is it related to strategic planning, skill development, or high-value work?
- Does it impact key projects, OKRs, or objectives?
- Is it part of critical work that affects business/personal outcomes?
- Is it a High-Leverage Activity (HLA) or Advances Key Results (AKR)?

EVALUATION CRITERIA FOR URGENCY:
- Is there a deadline or time constraint?
- Does it require immediate action to prevent negative consequences?
- Is it blocking other important work?
- Are there external dependencies requiring quick response?

PRIORITY DETERMINATION:
- HIGH: Signal Layer tasks (HLA/AKR), Important tasks (Quadrant I or II) that are critical or high-value
- MEDIUM: Important but not urgent tasks (Quadrant II) or moderately urgent tasks
- LOW: Not important tasks (Quadrant III or IV) that can be deferred or eliminated
- NOISE: Only if HLA=false AND AKR=false AND Important=false AND Urgent=false

WORK CATEGORY CLASSIFICATION (use the same rulebook as standard recommendations):
1. DEEP WORK: Complex, cognitively demanding tasks requiring sustained focus
2. CREATIVE WORK: Tasks involving ideation, imagination, and original content creation
3. REFLECTIVE WORK: Strategic thinking, learning, and analytical tasks
4. EXECUTIVE WORK: Reactive, fast-paced tasks, routine operations

IMPORTANT: 
- If the task has HLA=true or AKR=true, it MUST be prioritized HIGH regardless of Importance/Urgency flags
- If the task is actually important or urgent based on its content, context, and relationship to goals/objectives, you MUST update the importance and/or urgency flags accordingly
- Do not simply accept the initial "not important, not urgent" classification if the task warrants different treatment
- Signal Layer always takes precedence over FocusZone evaluation

RESPONSE FORMAT:
${formatInstructions}`;
  }

  /**
   * Generate AI recommendation with priority evaluation for tasks marked as not important and not urgent
   */
  async generateTaskRecommendationWithPriority(
    task: TaskAnalysis,
    userPreferences: UserWorkPreferences,
    userId: number
  ): Promise<TaskRecommendationWithPriority> {
    try {
      // Get user's historical task patterns for better recommendations
      const userTaskHistory = await this.getUserTaskHistory(userId);
      
      // Create priority evaluation parser
      const priorityParser = StructuredOutputParser.fromZodSchema(TaskRecommendationWithPrioritySchema as any);
      const prioritySystemPrompt = this.createPriorityEvaluationSystemPrompt();
      
      // Create compressed user prompt
      const userPrompt = this.createCompressedUserPrompt(task, userPreferences, userTaskHistory);
      
      // Add special instruction for priority evaluation
      const priorityEvaluationPrompt = `${userPrompt}\n\nEVALUATION REQUEST: This task was marked as NOT IMPORTANT and NOT URGENT. Please evaluate whether this classification is correct based on the task's actual nature, context, and relationship to goals/objectives. Update importance, urgency, and priority accordingly.`;
      
      // Create messages array with priority evaluation system prompt and user prompt
      const messages = [
        { role: "system" as const, content: prioritySystemPrompt },
        { role: "user" as const, content: priorityEvaluationPrompt }
      ];
      
      // Get AI recommendation
      const response = await this.llm.invoke(messages);
      
      // Parse the structured response
      const recommendation = await priorityParser.parse(response.content as string) as TaskRecommendationWithPriority;
      
      // Validate and adjust recommendation based on user preferences
      const validatedRecommendation = this.validateRecommendationWithPriority(recommendation, userPreferences);
      
      return validatedRecommendation;
    } catch (error) {
      console.error("Error generating AI recommendation with priority:", error);
      // Return fallback recommendation
      return this.getFallbackRecommendationWithPriority(task, userPreferences);
    }
  }

  /**
   * Validate and adjust recommendation with priority based on user preferences
   */
  private validateRecommendationWithPriority(
    recommendation: TaskRecommendationWithPriority,
    userPreferences: UserWorkPreferences
  ): TaskRecommendationWithPriority {
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
   * Get fallback recommendation with priority when AI fails
   */
  private getFallbackRecommendationWithPriority(
    task: TaskAnalysis,
    userPreferences: UserWorkPreferences
  ): TaskRecommendationWithPriority {
    // Use the standard fallback recommendation
    const standardFallback = this.getFallbackRecommendation(task, userPreferences);
    
    // Default to not important and not urgent if we can't determine
    return {
      ...standardFallback,
      importance: false,
      urgency: false,
      priority: "low" as const
    };
  }

  /**
   * Create compressed user prompt with minimal token usage
   */
  private createCompressedUserPrompt(
    task: TaskAnalysis,
    userPreferences: UserWorkPreferences,
    userHistory: any[]
  ): string {
    // Compress user history to reduce tokens
    const compressedHistory = this.compressUserHistory(userHistory);
    
    // Create compact task representation with Signal Layer fields
    const signalInfo = [];
    if (task.isHighLeverage) signalInfo.push('HLA=true');
    if (task.advancesKeyResults) signalInfo.push('AKR=true');
    const signalStr = signalInfo.length > 0 ? ` | ${signalInfo.join(' | ')}` : '';
    
    const taskInfo = `TASK: ${task.title} | ${task.description || 'No description'} | duration=${task.duration}m | important=${task.importance} | urgent=${task.urgency}${signalStr} | project=${task.projectName || 'None'}`;
    
    // Add context if available
    const contextInfo = [];
    if (task.objectiveName) contextInfo.push(`objective=${task.objectiveName}`);
    if (task.okrTitle) contextInfo.push(`okr=${task.okrTitle}`);
    const context = contextInfo.length > 0 ? ` | ${contextInfo.join(' | ')}` : '';
    
    // Compress user preferences
    const preferences = `PREFERENCES: Deep=${userPreferences.deepWorkStartTime}-${userPreferences.deepWorkEndTime} | Creative=${userPreferences.creativeWorkStartTime}-${userPreferences.creativeWorkEndTime} | Reflective=${userPreferences.reflectiveWorkStartTime}-${userPreferences.reflectiveWorkEndTime} | Executive=${userPreferences.executiveWorkStartTime}-${userPreferences.executiveWorkEndTime}`;
    
    // Compress history
    const history = compressedHistory ? `HISTORY: ${compressedHistory}` : '';
    
    return `${taskInfo}${context}\n${preferences}\n${history}`.trim();
  }

  /**
   * Compress user task history to reduce token usage
   */
  private compressUserHistory(userHistory: any[]): string {
    if (!userHistory || userHistory.length === 0) return '';
    
    // Limit to 5 most recent tasks and compress format
    const recentTasks = userHistory.slice(0, 5);
    
    return recentTasks
      .map(task => `${task.title}(${task.category},${task.duration}m,imp:${task.importance},urg:${task.urgency})`)
      .join('; ');
  }

  /**
   * Get user's task history for pattern recognition
   */
  private async getUserTaskHistory(userId: number, limit: number = 5): Promise<any[]> {
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
