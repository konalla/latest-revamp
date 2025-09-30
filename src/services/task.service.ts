import prisma from "../config/prisma.js";
import type { CreateTaskRequest, UpdateTaskRequest, TaskQueryParams, TaskResponse, TaskListResponse, TodayTasksResponse, TodayTaskResponse } from "../types/task.types.js";
import { aiRecommendationService } from "./ai-recommendation.service.js";
import { WorkCategory } from "./ai-recommendation.service.js";

export class TaskService {
  /**
   * Create a new task with optional AI recommendation
   */
  async createTask(taskData: CreateTaskRequest, userId: number): Promise<TaskResponse> {
    const task = await prisma.task.create({
      data: {
        ...taskData,
      userId,
    },
    include: {
      user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
      },
      project: {
          select: {
            id: true,
            name: true,
          },
      },
      objective: {
          select: {
            id: true,
            name: true,
          },
      },
      okr: {
          select: {
            id: true,
            title: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
            status: true,
            project: {
              select: {
                id: true,
                name: true,
              },
            },
            objective: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Generate AI recommendation asynchronously (non-blocking)
    this.generateAIRecommendationAsync(task.id, userId).catch((error: any) => {
      console.error("Error generating AI recommendation for new task:", error);
    });

    return task as TaskResponse;
  }

  /**
   * Generate AI recommendation asynchronously (non-blocking)
   */
  private async generateAIRecommendationAsync(taskId: number, userId: number): Promise<void> {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          project: {
            select: { name: true }
          }
        }
      } as any);

      if (!task) {
        console.error(`Task ${taskId} not found for AI recommendation generation`);
        return;
      }

      const userPreferences = await aiRecommendationService.getUserWorkPreferences(userId);
      const taskAnalysis = {
        title: task.title,
        description: task.description || "",
        duration: task.duration,
        importance: task.importance,
        urgency: task.urgency,
        dueDate: (task as any).dueDate,
        projectName: (task as any).project?.name || ""
      };

      const recommendation = await aiRecommendationService.generateTaskRecommendation(
        taskAnalysis,
        userPreferences,
        userId
      );

      // Create AI recommendation in separate table
      await (prisma as any).aIRecommendation.create({
        data: {
          taskId: task.id,
          category: recommendation.category,
          recommendedTime: recommendation.recommendedTime,
          confidence: recommendation.confidence,
          reasoning: recommendation.reasoning
        }
      });

      console.log(`AI recommendation generated for task ${taskId}: ${recommendation.category} at ${recommendation.recommendedTime}`);
    } catch (error) {
      console.error(`Error generating AI recommendation for task ${taskId}:`, error);
    }
  }

  /**
   * Get tasks by user with AI recommendations
   */
  async getTasksByUser(userId: number, queryParams: TaskQueryParams): Promise<TaskListResponse> {
  const { 
    page = 1, 
    limit = 10, 
    completed, 
    priority,
    category,
    importance,
    urgency,
    search,
    projectId,
    objectiveId,
    okrId,
      planId,
      sortBy = "createdAt",
      sortOrder = "desc",
  } = queryParams;
  
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {
    userId,
    ...(completed !== undefined && { completed }),
    ...(priority && { priority }),
    ...(category && { category }),
    ...(importance !== undefined && { importance }),
    ...(urgency !== undefined && { urgency }),
    ...(projectId && { projectId }),
    ...(objectiveId && { objectiveId }),
    ...(okrId && { okrId }),
      ...(planId && { planId }),
    ...(search && {
      OR: [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

    // Get tasks and total count
  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      skip,
      take: limit,
        orderBy: { [sortBy]: sortOrder },
      include: {
          aiRecommendation: true,
        user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
        },
        project: {
            select: {
              id: true,
              name: true,
            },
        },
        objective: {
            select: {
              id: true,
              name: true,
            },
        },
        okr: {
            select: {
              id: true,
              title: true,
            },
          },
          plan: {
            select: {
              id: true,
              name: true,
              status: true,
              project: {
                select: {
                  id: true,
                  name: true,
                },
              },
              objective: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        } as any,
    }),
    prisma.task.count({ where }),
  ]);

    return {
      tasks: tasks as TaskResponse[],
      total,
    };
  }

  /**
   * Get tasks by project
   */
  async getTasksByProject(projectId: number, userId: number, queryParams: TaskQueryParams): Promise<TaskListResponse> {
    const queryWithProject = { ...queryParams, projectId };
    return this.getTasksByUser(userId, queryWithProject);
  }

  /**
   * Get tasks by objective
   */
  async getTasksByObjective(objectiveId: number, userId: number, queryParams: TaskQueryParams): Promise<TaskListResponse> {
    const queryWithObjective = { ...queryParams, objectiveId };
    return this.getTasksByUser(userId, queryWithObjective);
  }

  /**
   * Get tasks by OKR
   */
  async getTasksByOkr(okrId: number, userId: number, queryParams: TaskQueryParams): Promise<TaskListResponse> {
    const queryWithOkr = { ...queryParams, okrId };
    return this.getTasksByUser(userId, queryWithOkr);
  }

  /**
   * Get a single task by ID
   */
  async getTaskById(taskId: number, userId: number): Promise<TaskResponse | null> {
    const task = await prisma.task.findFirst({
    where: { 
        id: taskId,
      userId,
    },
    include: {
      user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
      },
      project: {
          select: {
            id: true,
            name: true,
          },
      },
      objective: {
          select: {
            id: true,
            name: true,
          },
      },
      okr: {
          select: {
            id: true,
            title: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
            status: true,
            project: {
              select: {
                id: true,
                name: true,
              },
            },
            objective: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
    },
  });

    return task as TaskResponse | null;
  }

  /**
   * Update a task
   */
  async updateTask(taskId: number, userId: number, updateData: UpdateTaskRequest): Promise<TaskResponse | null> {
    // Check if task exists and belongs to user
  const existingTask = await prisma.task.findFirst({
    where: { 
        id: taskId,
      userId,
    },
  });

  if (!existingTask) {
    return null;
  }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
    include: {
      user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
      },
      project: {
          select: {
            id: true,
            name: true,
          },
      },
      objective: {
          select: {
            id: true,
            name: true,
          },
      },
      okr: {
          select: {
            id: true,
            title: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
            status: true,
            project: {
              select: {
                id: true,
                name: true,
              },
            },
            objective: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
    },
  });

    // Regenerate AI recommendation asynchronously if task attributes changed
    if (updateData.title || updateData.description || updateData.duration || 
        updateData.importance !== undefined || updateData.urgency !== undefined ||
        updateData.dueDate !== undefined) {
      this.generateAIRecommendationAsync(task.id, userId).catch((error: any) => {
        console.error("Error regenerating AI recommendation for updated task:", error);
      });
    }

    return task as TaskResponse;
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: number, userId: number): Promise<boolean> {
    const task = await prisma.task.findFirst({
    where: {
        id: taskId,
      userId,
    },
  });

    if (!task) {
      return false;
    }

    await prisma.task.delete({
      where: { id: taskId },
    });

    return true;
  }

  /**
   * Update task positions
   */
  async updateTaskPositions(positions: Array<{ id: number; position: number }>, userId: number): Promise<void> {
    const updatePromises = positions.map(({ id, position }) =>
      prisma.task.updateMany({
        where: {
          id,
          userId,
        },
      data: { position },
    })
  );

    await Promise.all(updatePromises);
  }

  /**
   * Toggle task completion
   */
  async toggleTaskCompletion(taskId: number, userId: number): Promise<TaskResponse | null> {
    const task = await prisma.task.findFirst({
    where: { 
        id: taskId,
      userId,
    },
  });

    if (!task) {
    return null;
  }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: { completed: !task.completed },
    include: {
      user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
      },
      project: {
          select: {
            id: true,
            name: true,
          },
      },
      objective: {
          select: {
            id: true,
            name: true,
          },
      },
      okr: {
          select: {
            id: true,
            title: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
            status: true,
            project: {
              select: {
                id: true,
                name: true,
              },
            },
            objective: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
    },
  });

    return updatedTask as TaskResponse;
  }

  /**
   * Get archived tasks
   */
  async getArchivedTasks(userId: number, queryParams: TaskQueryParams): Promise<TaskListResponse> {
    const queryWithCompleted = { ...queryParams, completed: true };
    return this.getTasksByUser(userId, queryWithCompleted);
  }

  /**
   * Restore a task
   */
  async restoreTask(taskId: number, userId: number): Promise<TaskResponse | null> {
    const task = await prisma.task.findFirst({
    where: { 
        id: taskId,
      userId,
    },
  });

    if (!task) {
    return null;
  }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
    data: { completed: false },
    include: {
      user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
      },
      project: {
          select: {
            id: true,
            name: true,
          },
      },
      objective: {
          select: {
            id: true,
            name: true,
          },
      },
      okr: {
          select: {
            id: true,
            title: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
            status: true,
            project: {
              select: {
                id: true,
                name: true,
              },
            },
            objective: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
    },
  });

    return updatedTask as TaskResponse;
  }

  /**
   * Get today's tasks with AI recommendations, ranked by priority
   */
  async getTodayTasksWithAIRecommendations(userId: number, timezone: string = 'UTC'): Promise<TodayTasksResponse> {
    try {
      // Get start and end of today in user's timezone
      const now = new Date();
      const todayStart = new Date(now.toLocaleDateString('en-CA', { timeZone: timezone }));
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);

      // Get tasks due today
      const tasks = await prisma.task.findMany({
        where: {
          userId,
          dueDate: {
            gte: todayStart,
            lt: todayEnd
          },
          completed: false
        },
        include: {
          aiRecommendation: true
        },
        orderBy: [
          { urgency: 'desc' },
          { importance: 'desc' },
          { dueDate: 'asc' }
        ]
      } as any);

      let generatedRecommendations = 0;
      let failedRecommendations = 0;

      // Process tasks and generate missing AI recommendations
      const processedTasks = await Promise.all(
        tasks.map(async (task, index) => {
          let aiRecommendationStatus: 'available' | 'generating' | 'failed' = 'available';
          let aiRecommendation = (task as any).aiRecommendation;

          // If no AI recommendation exists, generate one asynchronously
          if (!aiRecommendation) {
            aiRecommendationStatus = 'generating';
            try {
              // Generate AI recommendation asynchronously
              this.generateAIRecommendationAsync(task.id, userId).then(() => {
                console.log(`AI recommendation generated for task ${task.id}`);
              }).catch((error) => {
                console.error(`Failed to generate AI recommendation for task ${task.id}:`, error);
              });
              generatedRecommendations++;
            } catch (error) {
              console.error(`Error initiating AI recommendation for task ${task.id}:`, error);
              aiRecommendationStatus = 'failed';
              failedRecommendations++;
            }
          }

          return {
            id: task.id,
            title: task.title,
            description: task.description || undefined,
            duration: task.duration,
            priority: task.priority,
            importance: task.importance,
            urgency: task.urgency,
            dueDate: (task as any).dueDate,
            aiRecommendation: aiRecommendation ? {
              id: aiRecommendation.id,
              taskId: aiRecommendation.taskId,
              category: aiRecommendation.category,
              recommendedTime: aiRecommendation.recommendedTime,
              confidence: aiRecommendation.confidence,
              reasoning: aiRecommendation.reasoning,
              createdAt: aiRecommendation.createdAt,
              updatedAt: aiRecommendation.updatedAt
            } : undefined,
            aiRecommendationStatus,
            rank: index + 1
          };
        })
      );

      // Rank tasks by priority: urgency + importance, then AI recommended time, then due time
      const rankedTasks = this.rankTasksByPriority(processedTasks as TodayTaskResponse[]);

      return {
        tasks: rankedTasks,
        total: tasks.length,
        generatedRecommendations,
        failedRecommendations
      };
    } catch (error) {
      console.error("Error fetching today's tasks with AI recommendations:", error);
      throw new Error("Failed to fetch today's tasks");
    }
  }

  /**
   * Rank tasks by priority: urgency + importance, then AI recommended time, then due time
   */
  private rankTasksByPriority(tasks: TodayTaskResponse[]): TodayTaskResponse[] {
    return tasks.sort((a, b) => {
      // First: Urgency + Importance (Eisenhower Matrix)
      const aPriority = (a.urgency ? 2 : 0) + (a.importance ? 1 : 0);
      const bPriority = (b.urgency ? 2 : 0) + (b.importance ? 1 : 0);
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }

      // Second: AI recommended time (if available)
      if (a.aiRecommendation && b.aiRecommendation) {
        const aTime = this.parseTimeToMinutes(a.aiRecommendation.recommendedTime);
        const bTime = this.parseTimeToMinutes(b.aiRecommendation.recommendedTime);
        if (aTime !== bTime) {
          return aTime - bTime; // Earlier time first
        }
      } else if (a.aiRecommendation && !b.aiRecommendation) {
        return -1; // Tasks with AI recommendations come first
      } else if (!a.aiRecommendation && b.aiRecommendation) {
        return 1;
      }

      // Third: Due time
      return a.dueDate.getTime() - b.dueDate.getTime();
    }).map((task, index) => ({
      ...task,
      rank: index + 1
    }));
  }

  /**
   * Parse time string (HH:MM) to minutes since midnight
   */
  private parseTimeToMinutes(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  }

  /**
   * Get task statistics
   */
  async getTaskStats(userId: number, projectId?: number, objectiveId?: number, okrId?: number) {
    const where: any = {
    userId,
    ...(projectId && { projectId }),
    ...(objectiveId && { objectiveId }),
    ...(okrId && { okrId }),
  };

  const [
      total,
      completed,
      pending,
      highPriority,
      importantUrgent,
      importantNotUrgent,
      notImportantUrgent,
      notImportantNotUrgent,
  ] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.count({ where: { ...where, completed: true } }),
      prisma.task.count({ where: { ...where, completed: false } }),
      prisma.task.count({ where: { ...where, priority: "high" } }),
      prisma.task.count({ where: { ...where, importance: true, urgency: true } }),
      prisma.task.count({ where: { ...where, importance: true, urgency: false } }),
      prisma.task.count({ where: { ...where, importance: false, urgency: true } }),
      prisma.task.count({ where: { ...where, importance: false, urgency: false } }),
  ]);

  return {
      total,
      completed,
      pending,
      highPriority,
      importantUrgent,
      importantNotUrgent,
      notImportantUrgent,
      notImportantNotUrgent,
    };
  }
}

// Export singleton instance
export const taskService = new TaskService();