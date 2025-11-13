import prisma from "../config/prisma.js";
import type { CreateTaskRequest, UpdateTaskRequest, TaskQueryParams, TaskResponse, TaskListResponse, TodayTasksResponse, TodayTaskResponse, BulkTaskRequest, BulkTaskResponse, BulkTaskItem } from "../types/task.types.js";
import { aiRecommendationService } from "./ai-recommendation.service.js";
import { WorkCategory } from "./ai-recommendation.service.js";
import { CognitiveLoadService } from "./cognitive-load.service.js";
import { subscriptionService } from "./subscription.service.js";

export class TaskService {
  private cognitiveLoadService: CognitiveLoadService;

  constructor() {
    this.cognitiveLoadService = new CognitiveLoadService();
  }
  /**
   * Map AI category to task category format
   */
  private mapAICategoryToTaskCategory(aiCategory: WorkCategory): string {
    const categoryMap: { [key: string]: string } = {
      [WorkCategory.DEEP_WORK]: "deepWork",
      [WorkCategory.CREATIVE_WORK]: "creative", 
      [WorkCategory.REFLECTIVE_WORK]: "reflection",
      [WorkCategory.EXECUTIVE_WORK]: "execution"
    };
    
    return categoryMap[aiCategory] || "execution"; // Default fallback
  }

  /**
   * Create multiple tasks in bulk with AI classification and optimization
   */
  async createBulkTasks(bulkData: BulkTaskRequest, userId: number): Promise<BulkTaskResponse> {
    try {
      // Get user work preferences for AI recommendations
      const userPreferences = await aiRecommendationService.getUserWorkPreferences(userId);
      
      // Process each task with AI classification
      const processedTasks = await Promise.all(
        bulkData.tasks.map(async (taskItem, index) => {
          // Generate AI recommendation for each task
          const taskAnalysis = {
            title: taskItem.title,
            description: "",
            duration: taskItem.duration,
            importance: false, // Will be determined by AI
            urgency: false,    // Will be determined by AI
            dueDate: new Date(taskItem.dueDate),
            projectName: "",
            objectiveName: "",
            objectiveDescription: "",
            okrTitle: "",
            okrDescription: ""
          };

          const aiRecommendation = await aiRecommendationService.generateTaskRecommendation(
            taskAnalysis,
            userPreferences,
            userId
          );

          // Determine priority based on AI analysis and original priority
          let finalPriority = taskItem.priority;
          let importance = false;
          let urgency = false;

          // AI-based priority determination
          if (aiRecommendation.confidence > 0.7) {
            // High confidence AI recommendation
            if (aiRecommendation.category === WorkCategory.DEEP_WORK) {
              finalPriority = "high";
              importance = true;
              urgency = false;
            } else if (aiRecommendation.category === WorkCategory.EXECUTIVE_WORK) {
              finalPriority = taskItem.priority === "high" ? "high" : "medium";
              urgency = true;
              importance = taskItem.priority === "high";
            } else if (aiRecommendation.category === WorkCategory.CREATIVE_WORK) {
              finalPriority = "medium";
              importance = true;
              urgency = false;
            } else if (aiRecommendation.category === WorkCategory.REFLECTIVE_WORK) {
              finalPriority = "medium";
              importance = true;
              urgency = false;
            }
          }

          // Create task data
          const taskData: CreateTaskRequest = {
            title: taskItem.title,
            category: taskItem.category || this.mapAICategoryToTaskCategory(aiRecommendation.category),
            duration: Math.max(taskItem.duration, 15), // Minimum 15 minutes
            priority: finalPriority,
            position: index,
            importance,
            urgency,
            dueDate: new Date(taskItem.dueDate),
            ...(bulkData.projectId && { projectId: bulkData.projectId }),
            ...(bulkData.objectiveId && { objectiveId: bulkData.objectiveId }),
            ...(bulkData.okrId && { okrId: bulkData.okrId })
          };

          return taskData;
        })
      );

      // Create all tasks in a transaction
      const createdTasks = await prisma.$transaction(
        processedTasks.map(taskData => 
          prisma.task.create({
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
          })
        )
      );

      // Generate AI recommendations asynchronously for all created tasks
      createdTasks.forEach((task, index) => {
        this.generateAIRecommendationAsync(task.id, userId).catch((error: any) => {
          console.error(`Error generating AI recommendation for bulk task ${task.id}:`, error);
        });
      });

      // Increment task count for each created task
      for (let i = 0; i < createdTasks.length; i++) {
        subscriptionService.incrementTaskCount(userId).catch((error: any) => {
          console.error("Error incrementing task count:", error);
        });
      }

      return {
        tasks: createdTasks as TaskResponse[],
        message: `Successfully created and categorized ${createdTasks.length} tasks using intelligent priority analysis.`
      };
    } catch (error: any) {
      console.error("Error creating bulk tasks:", error);
      throw new Error(`Failed to create bulk tasks: ${error.message}`);
    }
  }

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

    // Increment task count for subscription tracking
    subscriptionService.incrementTaskCount(userId).catch((error: any) => {
      console.error("Error incrementing task count:", error);
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
          },
          objective: {
            select: { 
              name: true,
              description: true
            }
          },
          okr: {
            select: { 
              title: true,
              description: true
            }
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
        projectName: (task as any).project?.name || "",
        objectiveName: (task as any).objective?.name || "",
        objectiveDescription: (task as any).objective?.description || "",
        okrTitle: (task as any).okr?.title || "",
        okrDescription: (task as any).okr?.description || ""
      };

      const recommendation = await aiRecommendationService.generateTaskRecommendation(
        taskAnalysis,
        userPreferences,
        userId
      );

      const mappedCategory = this.mapAICategoryToTaskCategory(recommendation.category);

      // Update the task's category to match the AI recommendation
      await prisma.task.update({
        where: { id: taskId },
        data: { category: mappedCategory }
      });

      // Update existing AI recommendation or create new one
      await (prisma as any).aIRecommendation.upsert({
        where: {
          taskId: task.id
        },
        update: {
          category: recommendation.category,
          recommendedTime: recommendation.recommendedTime,
          confidence: recommendation.confidence,
          reasoning: recommendation.reasoning
        },
        create: {
          taskId: task.id,
          category: recommendation.category,
          recommendedTime: recommendation.recommendedTime,
          confidence: recommendation.confidence,
          reasoning: recommendation.reasoning
        }
      });

      console.log(`AI recommendation generated for task ${taskId}: ${recommendation.category} -> ${mappedCategory} at ${recommendation.recommendedTime}`);
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

    // Update cognitive load meter after task completion change
    try {
      await this.cognitiveLoadService.updateCognitiveLoadMeter(userId, {
        currentWorkloadScore: undefined // Will be recalculated based on current tasks
      });
    } catch (error) {
      console.error('Error updating cognitive load meter after task completion:', error);
      // Don't throw error - task completion should still succeed
    }

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

      // Return only top 3 tasks
      const top3Tasks = rankedTasks.slice(0, 3);

      return {
        tasks: top3Tasks,
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
   * Rank tasks by priority: priority field, urgency, importance, due date, AI confidence
   */
  private rankTasksByPriority(tasks: TodayTaskResponse[]): TodayTaskResponse[] {
    // Helper to get priority numeric value
    const getPriorityValue = (priority: string): number => {
      switch (priority?.toLowerCase()) {
        case 'high': return 3;
        case 'medium': return 2;
        case 'low': return 1;
        default: return 1;
      }
    };

    return tasks.sort((a, b) => {
      // First: Priority field (high > medium > low)
      const aPriorityValue = getPriorityValue(a.priority);
      const bPriorityValue = getPriorityValue(b.priority);
      if (aPriorityValue !== bPriorityValue) {
        return bPriorityValue - aPriorityValue; // Higher priority first
      }

      // Second: Urgency
      if (a.urgency !== b.urgency) {
        return b.urgency ? 1 : -1; // Urgent tasks first
      }

      // Third: Importance
      if (a.importance !== b.importance) {
        return b.importance ? 1 : -1; // Important tasks first
      }

      // Fourth: AI recommendation confidence (if available)
      if (a.aiRecommendation && b.aiRecommendation) {
        const aConfidence = a.aiRecommendation.confidence || 0;
        const bConfidence = b.aiRecommendation.confidence || 0;
        if (aConfidence !== bConfidence) {
          return bConfidence - aConfidence; // Higher confidence first
        }
      } else if (a.aiRecommendation && !b.aiRecommendation) {
        return -1; // Tasks with AI recommendations come first
      } else if (!a.aiRecommendation && b.aiRecommendation) {
        return 1;
      }

      // Fifth: AI recommended time (if available and confidence is same)
      if (a.aiRecommendation && b.aiRecommendation) {
        const aTime = this.parseTimeToMinutes(a.aiRecommendation.recommendedTime);
        const bTime = this.parseTimeToMinutes(b.aiRecommendation.recommendedTime);
        if (aTime !== bTime) {
          return aTime - bTime; // Earlier time first
        }
      }

      // Sixth: Due time (earlier due dates first)
      if (a.dueDate && b.dueDate) {
        return a.dueDate.getTime() - b.dueDate.getTime();
      }
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;

      return 0;
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

  /**
   * Get task recommended for RIGHT NOW based on current time and AI recommendations
   */
  async getNowRecommendedTask(userId: number, timezone: string): Promise<{
    task: TodayTaskResponse | null;
    nextRecommendation: TodayTaskResponse | null;
    currentTime: string;
    reasoning: string;
  }> {
    try {
      // Use the provided timezone directly (controller handles auto-detection)
      const actualTimezone = timezone;
      
      // Get current time in user's timezone using system methods
      const now = new Date();
      
      // Convert to user's timezone
      const userTime = new Intl.DateTimeFormat('en-CA', {
        timeZone: actualTimezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      }).format(now);
      
      const timeOnly: string = userTime;
      
      // Get today's tasks with AI recommendations AND overdue tasks
      const todayTasks = await this.getTodayTasksWithAIRecommendations(userId, timezone);
      
      // Also get ALL overdue tasks (due before today) with AI recommendations
      const currentTime = new Date();
      const todayStart = new Date(currentTime.toLocaleDateString('en-CA', { timeZone: timezone }));
      
      const overdueTasksFromDB = await prisma.task.findMany({
        where: {
          userId,
          dueDate: {
            lt: todayStart // Due date before today (all overdue tasks, no 7-day restriction)
          },
          completed: false,
          aiRecommendation: {
            isNot: null
          }
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
      
      // Convert overdue tasks to TodayTaskResponse format
      const overdueTasksFormatted: TodayTaskResponse[] = overdueTasksFromDB
        .filter(task => task.dueDate !== null) // Only include tasks with due dates
        .map(task => ({
          ...task,
          description: task.description || '', // Convert null to empty string
          dueDate: task.dueDate!, // We know it's not null due to filter above
          aiRecommendationStatus: 'available' as const,
          rank: 0 // Will be calculated later if needed
        }));
      
      // Combine today's tasks and overdue tasks
      const allTasks = {
        ...todayTasks,
        tasks: [...todayTasks.tasks, ...overdueTasksFormatted]
      };
      
      if (!allTasks.tasks.length) {
        return {
          task: null,
          nextRecommendation: null,
          currentTime: timeOnly,
          reasoning: "No tasks found for today or overdue"
        };
      }

      const TOLERANCE_MINUTES = 15;
      const currentMinutes = this.parseTimeToMinutes(timeOnly);
      
      // PRIORITY 1: Check for overdue tasks (due date has passed) with AI recommendations
      // Note: Tasks with today's due date are NOT considered overdue
      const overdueTasks = allTasks.tasks.filter(task => {
        if (!task.aiRecommendation || !task.dueDate) return false;
        
        // Check if due date has passed (considering timezone)
        const dueDate = new Date(task.dueDate);
        const currentDate = new Date();
        
        // Only consider tasks overdue if due date is before today
        // Tasks with today's due date are NOT considered overdue
        return dueDate < currentDate;
      });

      // PRIORITY 2: Find tasks where AI recommended time matches current time (±15min tolerance)
      const matchingTasks = allTasks.tasks.filter(task => {
        if (!task.aiRecommendation) return false;
        
        const recommendedMinutes = this.parseTimeToMinutes(task.aiRecommendation.recommendedTime);
        const timeDiff = Math.abs(currentMinutes - recommendedMinutes);
        
        return timeDiff <= TOLERANCE_MINUTES;
      });

      // Compare overdue vs today's matching tasks
      if (overdueTasks.length > 0 && matchingTasks.length > 0) {
        const bestOverdueTask = this.selectBestTaskForNow(overdueTasks, currentMinutes);
        const bestTodayTask = this.selectBestTaskForNow(matchingTasks, currentMinutes);
        
        // Compare priority, importance, and urgency
        const todayTaskWins = this.compareTaskPriority(bestTodayTask, bestOverdueTask);
        
        if (todayTaskWins) {
          return {
            task: bestTodayTask,
            nextRecommendation: null,
            currentTime: timeOnly,
            reasoning: `Perfect timing! This task is recommended for ${bestTodayTask?.aiRecommendation?.recommendedTime}, 
                       and it's ${bestTodayTask?.aiRecommendation?.category.toLowerCase()} work that aligns with your current focus window.`
          };
        } else {
          return {
            task: bestOverdueTask,
            nextRecommendation: null,
            currentTime: timeOnly,
            reasoning: `URGENT: This task is overdue and needs immediate attention! It's ${bestOverdueTask?.aiRecommendation?.category.toLowerCase()} work that should be completed right now.`
          };
        }
      }

      // If only overdue tasks exist
      if (overdueTasks.length > 0) {
        const prioritizedOverdueTask = this.selectBestTaskForNow(overdueTasks, currentMinutes);
        
        return {
          task: prioritizedOverdueTask,
          nextRecommendation: null,
          currentTime: timeOnly,
          reasoning: `URGENT: This task is overdue and needs immediate attention! It's ${prioritizedOverdueTask?.aiRecommendation?.category.toLowerCase()} work that should be completed right now.`
        };
      }

      // If only today's matching tasks exist
      if (matchingTasks.length > 0) {
        const prioritizedTask = this.selectBestTaskForNow(matchingTasks, currentMinutes);
        
        return {
          task: prioritizedTask,
          nextRecommendation: null,
          currentTime: timeOnly,
          reasoning: `Perfect timing! This task is recommended for ${prioritizedTask?.aiRecommendation?.recommendedTime}, 
                     and it's ${prioritizedTask?.aiRecommendation?.category.toLowerCase()} work that aligns with your current focus window.`
        };
      }

      // PRIORITY 3: Find next recommended task (closest future recommendation)
      const futureTasks = allTasks.tasks
        .filter(task => task.aiRecommendation)
        .map(task => ({
          ...task,
          recommendedMinutes: this.parseTimeToMinutes(task.aiRecommendation!.recommendedTime)
        }))
        .filter(task => task.recommendedMinutes > currentMinutes)
        .sort((a, b) => a.recommendedMinutes - b.recommendedMinutes);

      const nextTask = futureTasks[0] || null;

      if (nextTask) {
        const timeUntil = nextTask.recommendedMinutes - currentMinutes;
        return {
          task: null,
          nextRecommendation: nextTask,
          currentTime: timeOnly,
          reasoning: `No tasks recommended for right now (${timeOnly}). Next recommendation is "${nextTask.title}" 
                     at ${nextTask.aiRecommendation?.recommendedTime} (in ${timeUntil} minutes).`
        };
      }

      return {
        task: null,
        nextRecommendation: null,
        currentTime: timeOnly,
        reasoning: `No upcoming task recommendations found. Current time: ${timeOnly}`
      };

    } catch (error) {
      console.error("Error getting now recommended task:", error);
      throw new Error("Failed to get now recommended task");
    }
  }

  /**
   * Compare two tasks based on priority, importance, and urgency
   * Returns true if todayTask wins over overdueTask
   */
  private compareTaskPriority(todayTask: TodayTaskResponse, overdueTask: TodayTaskResponse): boolean {
    // Convert priority strings to numbers for comparison (high=3, medium=2, low=1)
    const getPriorityValue = (priority: string): number => {
      switch (priority.toLowerCase()) {
        case 'high': return 3;
        case 'medium': return 2;
        case 'low': return 1;
        default: return 1;
      }
    };

    const todayPriority = getPriorityValue(todayTask.priority);
    const overduePriority = getPriorityValue(overdueTask.priority);

    // 1. Compare priority (high > medium > low)
    if (todayPriority > overduePriority) {
      return true; // Today's task wins
    }
    if (todayPriority < overduePriority) {
      return false; // Overdue task wins
    }

    // 2. If same priority, compare importance
    if (todayTask.importance && !overdueTask.importance) {
      return true; // Today's task wins
    }
    if (!todayTask.importance && overdueTask.importance) {
      return false; // Overdue task wins
    }

    // 3. If same priority and importance, compare urgency
    if (todayTask.urgency && !overdueTask.urgency) {
      return true; // Today's task wins
    }
    if (!todayTask.urgency && overdueTask.urgency) {
      return false; // Overdue task wins
    }

    // 4. If all are same (priority, importance, urgency), overdue task wins
    return false;
  }

  /**
   * Select best task for current moment considering urgency, importance, and duration fit
   */
  private selectBestTaskForNow(tasks: TodayTaskResponse[], currentMinutes: number): TodayTaskResponse {
    // Sort by priority: urgency → importance → closest to recommended time
    const sorted = tasks.sort((a, b) => {
      // 1. Urgent tasks first
      if (a.urgency !== b.urgency) {
        return b.urgency ? 1 : -1;
      }
      
      // 2. Important tasks second
      if (a.importance !== b.importance) {
        return b.importance ? 1 : -1;
      }
      
      // 3. Closest to recommended time
      const aDiff = Math.abs((currentMinutes) - this.parseTimeToMinutes(a.aiRecommendation!.recommendedTime));
      const bDiff = Math.abs((currentMinutes) - this.parseTimeToMinutes(b.aiRecommendation!.recommendedTime));
      return aDiff - bDiff;
    });
    
    if (sorted.length === 0) {
      throw new Error("No tasks available for selection");
    }
    return sorted[0]!;
  }

  /**
   * Format minutes to HH:MM string
   */
  private formatMinutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }
}

// Export singleton instance
export const taskService = new TaskService();