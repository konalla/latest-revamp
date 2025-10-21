import prisma from "../config/prisma.js";
import { AIRecommendationService } from "./ai-recommendation.service.js";

type Task = {
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
  userId: number;
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
      const tasks = await this.getAllIncompleteTasks(userId);
      if (!tasks.length) {
        return { categoryPlans: [], recommendedOrder: [] };
      }

      const tasksByCategory = this.groupTasksByCategory(tasks);
      const categoryPlans = this.prioritizeTasksInCategories(tasksByCategory);
      const recommendedOrder = this.generateRecommendedOrder(categoryPlans);

      let aiRecommendations: Record<number, any> | undefined;
      try {
        const apiKey = process.env.OPENAI_API_KEY;
        const isValidKey = apiKey && apiKey.startsWith("sk-") && apiKey !== "sk-fakekey";
        if (isValidKey) {
          aiRecommendations = await this.generateAiRecommendations(tasks);
        }
      } catch (err) {
        console.error("Error generating AI recommendations:", err);
      }

      return { categoryPlans, recommendedOrder, aiRecommendations: aiRecommendations || {} };
    } catch (error) {
      console.error("Error generating focus plan:", error);
      return { categoryPlans: [], recommendedOrder: [] };
    }
  }

  private async getAllIncompleteTasks(userId: number): Promise<Task[]> {
    try {
      const userTasks = await prisma.task.findMany({
        where: { userId, completed: false },
        orderBy: { createdAt: "desc" },
      });
      return userTasks as unknown as Task[];
    } catch (error) {
      console.error("Error fetching tasks in focus planning service:", error);
      return [];
    }
  }

  private groupTasksByCategory(tasks: Task[]): Record<string, Task[]> {
    return tasks.reduce((acc, task) => {
      const key = task.category || "Uncategorized";
      acc[key] = acc[key] || [];
      acc[key].push(task);
      return acc;
    }, {} as Record<string, Task[]>);
  }

  private prioritizeTasksInCategories(tasksByCategory: Record<string, Task[]>): CategoryPlan[] {
    const scorePriority = (t: Task) => {
      // Simple heuristic: map priority string and shorter duration higher
      const priorityMap: Record<string, number> = { high: 3, medium: 2, low: 1 };
      const p = priorityMap[t.priority?.toLowerCase?.() || "medium"] || 2;
      const durationScore = Math.max(1, 120 - (t.duration || 60));
      return p * 1000 + durationScore;
    };

    return Object.entries(tasksByCategory).map(([category, list]) => ({
      category,
      tasks: [...list].sort((a, b) => scorePriority(b) - scorePriority(a)),
    }));
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

  private computeTaskScore(task: Task): number {
    const priorityMap: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const p = priorityMap[task.priority?.toLowerCase?.() || "medium"] || 2;
    const durationScore = Math.max(1, 120 - (task.duration || 60));
    return p * 1000 + durationScore;
  }

  private async generateAiRecommendations(tasks: Task[]): Promise<Record<number, any>> {
    const recommendations: Record<number, any> = {};
    for (const task of tasks.slice(0, 20)) {
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
        recommendations[task.id] = rec;
      } catch (e) {
        // skip failures
      }
    }
    return recommendations;
  }
}

const focusPlanningService = new FocusPlanningService();
export default focusPlanningService;



