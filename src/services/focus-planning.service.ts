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
    const scorePriority = (t: TaskInternal) => {
      // Simple heuristic: map priority string and shorter duration higher
      const priorityMap: Record<string, number> = { high: 3, medium: 2, low: 1 };
      const p = priorityMap[t.priority?.toLowerCase?.() || "medium"] || 2;
      const durationScore = Math.max(1, 120 - (t.duration || 60));
      return p * 1000 + durationScore;
    };

    return Object.entries(tasksByCategory).map(([category, list]) => ({
      category,
      tasks: [...list]
        .sort((a, b) => scorePriority(b) - scorePriority(a))
        .map((task) => this.mapTaskToResponse(task)),
    }));
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
    // Order categories by total priority score of their top task
    const topScores = categoryPlans
      .map((cp) => ({
        category: cp.category,
        score: cp.tasks.length && cp.tasks[0] ? this.computeTaskScore(cp.tasks[0]) : 0,
      }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.category);
    return topScores;
  }

  // Compute task score - works with both TaskInternal and Task (response) types
  private computeTaskScore(task: TaskInternal | Task): number {
    const priorityMap: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const p = priorityMap[task.priority?.toLowerCase?.() || "medium"] || 2;
    const durationScore = Math.max(1, 120 - (task.duration || 60));
    return p * 1000 + durationScore;
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



