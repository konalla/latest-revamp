import prisma from "../config/prisma.js";
import { AIRecommendationService } from "./ai-recommendation.service.js";

// Internal task type with all fields needed for processing
type TaskInternal = {
  id: number;
  title: string;
  description?: string | null;
  priority: string;
  category: string;
  duration: number;
  okrId?: number | null;
  objectiveId?: number | null;
  projectId?: number | null;
  completed: boolean;
  userId: number; // Needed for AI recommendations but not in response
  position: number;
  importance: boolean;
  urgency: boolean;
  isHighLeverage: boolean;
  advancesKeyResults: boolean;
  createdAt?: Date; // Optional, can be omitted
};

// Task type for response (excludes userId and other unnecessary fields)
export type Task = {
  id: number;
  title: string;
  description?: string | null;
  priority: string;
  category: string;
  duration: number;
  okrId?: number | null;
  objectiveId?: number | null;
  projectId?: number | null;
  completed: boolean;
  position: number;
  importance: boolean | null;
  urgency: boolean | null;
  isHighLeverage: boolean | null;
  advancesKeyResults: boolean | null;
  createdAt?: string; // ISO string format for response
};

type CategoryPlan = {
  category: string;
  tasks: Task[];
};

export interface FocusPlanResponse {
  categoryPlans: CategoryPlan[];
  recommendedOrder: string[];
  aiRecommendations?: Record<number, any>;
}

export class FocusPlanningService {
  private ai: AIRecommendationService;

  constructor() {
    this.ai = new AIRecommendationService();
  }

  async generateFocusPlan(userId: number): Promise<FocusPlanResponse> {
    try {
      // Fetch tasks and recommendations in parallel for maximum speed
      const tasks = await this.getAllIncompleteTasks(userId);
      
      if (!tasks.length) {
        return { categoryPlans: [], recommendedOrder: [] };
      }

      // Process tasks and fetch recommendations in parallel
      const taskIds = tasks.map(t => t.id);
      const tasksByCategory = this.groupTasksByCategory(tasks);
      const categoryPlans = this.prioritizeTasksInCategories(tasksByCategory);
      
      // Fetch existing recommendations while processing tasks (parallel execution)
      const existingRecommendations = await this.getExistingAiRecommendations(taskIds);
      const recommendedOrder = this.generateRecommendedOrder(categoryPlans);
      
      // Generate missing recommendations in background (non-blocking)
      const tasksNeedingRecommendations = tasks
        .slice(0, 20)
        .filter(task => !existingRecommendations[task.id]);
      
      if (tasksNeedingRecommendations.length > 0) {
        try {
          const apiKey = process.env.OPENAI_API_KEY;
          const isValidKey = apiKey && apiKey.startsWith("sk-") && apiKey !== "sk-fakekey";
          if (isValidKey) {
            // Fire and forget - don't block response
            this.generateMissingAiRecommendations(tasksNeedingRecommendations).catch(err => {
              console.error("Error generating missing AI recommendations:", err);
            });
          }
        } catch (err) {
          console.error("Error initiating AI recommendations:", err);
        }
      }

      // Return immediately with existing recommendations
      return { 
        categoryPlans, 
        recommendedOrder, 
        aiRecommendations: existingRecommendations 
      };
    } catch (error) {
      console.error("Error generating focus plan:", error);
      return { categoryPlans: [], recommendedOrder: [] };
    }
  }

  private async getAllIncompleteTasks(userId: number): Promise<TaskInternal[]> {
    try {
      // Select only essential fields to optimize query performance
      // Removed createdAt from select and orderBy to improve performance
      // If ordering is needed, we can sort in memory after fetching
      const userTasks = await prisma.task.findMany({
        where: { 
          userId, 
          completed: false 
        },
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          duration: true,
          priority: true,
          completed: true,
          position: true,
          importance: true,
          urgency: true,
          isHighLeverage: true,
          advancesKeyResults: true,
          projectId: true,
          objectiveId: true,
          okrId: true,
          userId: true, // Needed for AI recommendations
        },
        // Removed orderBy to avoid index scan - we'll sort in memory if needed
        // orderBy: { createdAt: "desc" },
      });
      return userTasks as TaskInternal[];
    } catch (error) {
      console.error("Error fetching tasks in focus planning service:", error);
      return [];
    }
  }

  private groupTasksByCategory(tasks: TaskInternal[]): Record<string, TaskInternal[]> {
    return tasks.reduce((acc, task) => {
      const key = task.category || "Uncategorized";
      acc[key] = acc[key] || [];
      acc[key].push(task);
      return acc;
    }, {} as Record<string, TaskInternal[]>);
  }

  private prioritizeTasksInCategories(tasksByCategory: Record<string, TaskInternal[]>): CategoryPlan[] {
    return Object.entries(tasksByCategory).map(([category, list]) => ({
      category,
      tasks: [...list]
        .sort((a, b) => this.compareTasksByPriority(b, a))
        .map((task) => this.mapTaskToResponse(task)),
    }));
  }

  /**
   * Compare two tasks for sorting: Signal Layer first, then Eisenhower matrix
   * Returns positive if taskA should come before taskB (higher priority)
   * Returns negative if taskB should come before taskA (higher priority)
   */
  private compareTasksByPriority(taskA: TaskInternal | Task, taskB: TaskInternal | Task): number {
    // 1. Signal Layer comparison (highest priority)
    const signalScoreA = this.calculateSignalLayerScore(taskA);
    const signalScoreB = this.calculateSignalLayerScore(taskB);
    
    if (signalScoreA !== signalScoreB) {
      return signalScoreB - signalScoreA; // Higher signal score comes first
    }

    // 2. Eisenhower Matrix comparison (second priority)
    const eisenhowerScoreA = this.calculateEisenhowerScore(taskA);
    const eisenhowerScoreB = this.calculateEisenhowerScore(taskB);
    
    if (eisenhowerScoreA !== eisenhowerScoreB) {
      return eisenhowerScoreB - eisenhowerScoreA; // Higher eisenhower score comes first
    }

    // 3. Tie-breaker: priority string and duration
    const priorityMap: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const priorityA = priorityMap[(taskA.priority || "").toLowerCase()] || 2;
    const priorityB = priorityMap[(taskB.priority || "").toLowerCase()] || 2;
    
    if (priorityA !== priorityB) {
      return priorityB - priorityA;
    }

    // 4. Final tie-breaker: shorter duration (more efficient tasks first)
    const durationA = taskA.duration || 60;
    const durationB = taskB.duration || 60;
    return durationA - durationB;
  }

  /**
   * Calculate Signal Layer score
   * Signal Layer outranks all other priority calculations
   */
  private calculateSignalLayerScore(task: TaskInternal | Task): number {
    const isHighLeverage = task.isHighLeverage || false;
    const advancesKeyResults = task.advancesKeyResults || false;

    // Core-Signal: Both HLA and AKR ON = Maximum priority (100000 points)
    if (isHighLeverage && advancesKeyResults) {
      return 100000;
    }

    // High-Signal: Only HLA ON = Very high priority (80000 points)
    if (isHighLeverage) {
      return 80000;
    }

    // Strategic-Signal: Only AKR ON = High priority (60000 points)
    if (advancesKeyResults) {
      return 60000;
    }

    // Noise: All toggles OFF = Minimum priority (1000 points)
    const importance = task.importance || false;
    const urgency = task.urgency || false;
    if (!isHighLeverage && !advancesKeyResults && !importance && !urgency) {
      return 1000;
    }

    // Neutral: Default (no Signal Layer bonus)
    return 0;
  }

  /**
   * Calculate Eisenhower Matrix score
   * Based on importance and urgency boolean fields
   */
  private calculateEisenhowerScore(task: TaskInternal | Task): number {
    const importance = task.importance || false;
    const urgency = task.urgency || false;

    // Quadrant I: Urgent + Important = 4000 points (highest)
    if (urgency && importance) {
      return 4000;
    }

    // Quadrant II: Important + Not Urgent = 3000 points
    if (importance && !urgency) {
      return 3000;
    }

    // Quadrant III: Urgent + Not Important = 2000 points
    if (urgency && !importance) {
      return 2000;
    }

    // Quadrant IV: Not Urgent + Not Important = 1000 points (lowest)
    return 1000;
  }

  // Map internal task to response format (excludes userId and formats dates)
  private mapTaskToResponse(task: TaskInternal): Task {
    return {
      id: task.id,
      title: task.title,
      description: task.description ?? null,
      category: task.category,
      duration: task.duration,
      priority: task.priority,
      completed: task.completed,
      position: task.position,
      importance: task.importance ?? null,
      urgency: task.urgency ?? null,
      isHighLeverage: task.isHighLeverage ?? null,
      advancesKeyResults: task.advancesKeyResults ?? null,
      projectId: task.projectId ?? null,
      objectiveId: task.objectiveId ?? null,
      okrId: task.okrId ?? null,
      // Omit createdAt if not needed, or include as ISO string
      // createdAt: task.createdAt?.toISOString(),
    };
  }

  private generateRecommendedOrder(categoryPlans: CategoryPlan[]): string[] {
    // Order categories by priority of their top task (Signal Layer first, then Eisenhower matrix)
    const categoryScores = categoryPlans.map((cp) => {
      if (!cp.tasks.length || !cp.tasks[0]) {
        return { category: cp.category, score: 0 };
      }
      
      const topTask = cp.tasks[0];
      // Calculate combined score: Signal Layer (multiplied by 1000000) + Eisenhower (multiplied by 1000)
      const signalScore = this.calculateSignalLayerScore(topTask);
      const eisenhowerScore = this.calculateEisenhowerScore(topTask);
      const combinedScore = signalScore * 1000000 + eisenhowerScore * 1000;
      
      return { category: cp.category, score: combinedScore };
    });

    return categoryScores
      .sort((a, b) => b.score - a.score)
      .map((x) => x.category);
  }

  // Fetch existing AI recommendations from database in bulk (fast, single query)
  private async getExistingAiRecommendations(taskIds: number[]): Promise<Record<number, any>> {
    if (taskIds.length === 0) return {};
    
    try {
      const recommendations = await (prisma as any).aIRecommendation.findMany({
        where: {
          taskId: { in: taskIds }
        },
        select: {
          taskId: true,
          category: true,
          recommendedTime: true,
          confidence: true,
        }
      });

      const result: Record<number, any> = {};
      for (const rec of recommendations) {
        result[rec.taskId] = {
          category: rec.category,
          recommendedTime: rec.recommendedTime,
          confidence: rec.confidence,
        };
      }
      return result;
    } catch (error) {
      console.error("Error fetching existing AI recommendations:", error);
      return {};
    }
  }

  // Generate missing AI recommendations in parallel (non-blocking, runs in background)
  private async generateMissingAiRecommendations(tasks: TaskInternal[]): Promise<void> {
    if (tasks.length === 0) return;

    // Generate recommendations in parallel (up to 5 concurrent to avoid rate limits)
    const batchSize = 5;
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(async (task) => {
          try {
            const rec = await this.ai.generateTaskRecommendation(
              {
                id: task.id,
                title: task.title,
                description: task.description ?? undefined,
                priority: task.priority,
                category: task.category,
                duration: task.duration,
                okrDescription: undefined,
              } as any,
              {
                preferredWorkHours: [],
                peakProductivityTimes: [],
                preferredWorkCategories: [],
                avoidTimes: [],
              } as any,
              task.userId
            );
            
            // Save to database for future use
            await (prisma as any).aIRecommendation.upsert({
              where: { taskId: task.id },
              update: {
                category: rec.category,
                recommendedTime: rec.recommendedTime,
                confidence: rec.confidence,
              },
              create: {
                taskId: task.id,
                category: rec.category,
                recommendedTime: rec.recommendedTime,
                confidence: rec.confidence,
              }
            });
          } catch (e) {
            // Skip failures silently - don't block the response
            console.error(`Failed to generate recommendation for task ${task.id}:`, e);
          }
        })
      );
    }
  }
}

const focusPlanningService = new FocusPlanningService();
export default focusPlanningService;



