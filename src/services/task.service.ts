import prisma from "../config/prisma.js";
import type { CreateTaskRequest, UpdateTaskRequest, TaskQueryParams, TaskResponse, TaskListResponse, TodayTasksResponse, TodayTaskResponse, BulkTaskRequest, BulkTaskResponse, BulkTaskItem, BatchUpdateTaskRequest, BatchUpdateTaskResponse, AIRecommendationResponse } from "../types/task.types.js";
import { aiRecommendationService } from "./ai-recommendation.service.js";
import { WorkCategory } from "./ai-recommendation.service.js";
import { CognitiveLoadService } from "./cognitive-load.service.js";
import { subscriptionService } from "./subscription.service.js";
import { taskPriorityService } from "./task-priority.service.js";

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
      // Determine dueDate from OKR/Objective endDate (fetch once at the start)
      let dueDate: Date | undefined = undefined;

      // Priority: OKR endDate > Objective endDate > null
      if (bulkData.okrId) {
        const okr = await prisma.okr.findUnique({
          where: { id: bulkData.okrId },
          select: { endDate: true }
        });
        if (okr?.endDate) {
          dueDate = okr.endDate;
        }
      }

      // If OKR has no endDate, check Objective
      if (!dueDate && bulkData.objectiveId) {
        const objective = await prisma.objective.findUnique({
          where: { id: bulkData.objectiveId },
          select: { end_date: true }
        });
        if (objective?.end_date) {
          dueDate = objective.end_date;
        }
      }

      // Process each task item to prepare task data (without AI recommendations yet)
      // Ignore any dueDate from taskItem - use the determined dueDate from OKR/Objective
      const processedTasks = bulkData.tasks.map((taskItem, index) => {
        const taskData: CreateTaskRequest = {
          title: taskItem.title,
          category: taskItem.category, // Use provided category initially, will be updated by AI
          duration: Math.max(taskItem.duration, 15), // Minimum 15 minutes
          priority: taskItem.priority,
          position: index,
          importance: false,
          urgency: false,
          ...(dueDate && { dueDate }), // Only include dueDate if we have one from OKR/Objective
          ...(bulkData.projectId && { projectId: bulkData.projectId }),
          ...(bulkData.objectiveId && { objectiveId: bulkData.objectiveId }),
          ...(bulkData.okrId && { okrId: bulkData.okrId })
        };

        return taskData;
      });

      // Create all tasks in a transaction (same as single task creation)
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

      // Get user work preferences for AI recommendations (same as single task)
      const userPreferences = await aiRecommendationService.getUserWorkPreferences(userId);

      // For each created task, generate AI recommendation and update category (same flow as single task)
      await Promise.all(
        createdTasks.map(async (task) => {
          try {
            // Generate AI recommendation using full task data (same as single task creation)
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

            // Check if task is marked as not important and not urgent - use priority evaluation
            // Only evaluate when both are explicitly false (not undefined)
            const needsPriorityEvaluation = task.importance === false && task.urgency === false;

            let recommendation: any;
            let mappedCategory: string;
            let updateData: any = {};

            if (needsPriorityEvaluation) {
              // Use priority evaluation method for tasks marked as not important and not urgent
              const recommendationWithPriority = await aiRecommendationService.generateTaskRecommendationWithPriority(
                taskAnalysis,
                userPreferences,
                userId
              );

              recommendation = recommendationWithPriority;
              mappedCategory = this.mapAICategoryToTaskCategory(recommendation.category);

              // Update importance, urgency, priority, and category based on AI recommendation
              updateData = {
                category: mappedCategory,
                importance: recommendationWithPriority.importance,
                urgency: recommendationWithPriority.urgency,
                priority: recommendationWithPriority.priority
              };
            } else {
              // Use standard recommendation method
              recommendation = await aiRecommendationService.generateTaskRecommendation(
                taskAnalysis,
                userPreferences,
                userId
              );

              mappedCategory = this.mapAICategoryToTaskCategory(recommendation.category);

              // Update only category for standard recommendation
              updateData = {
                category: mappedCategory
              };
            }

            // Update the task with AI recommendations
            await prisma.task.update({
              where: { id: task.id },
              data: updateData
            });

            // Create AI recommendation record (same as single task)
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

            if (needsPriorityEvaluation) {
              console.log(`AI recommendation with priority evaluation for bulk task ${task.id}: ${recommendation.category} -> ${mappedCategory}, importance=${recommendation.importance}, urgency=${recommendation.urgency}, priority=${recommendation.priority} at ${recommendation.recommendedTime}`);
            } else {
              console.log(`AI recommendation generated for bulk task ${task.id}: ${recommendation.category} -> ${mappedCategory} at ${recommendation.recommendedTime}`);
            }
          } catch (error) {
            console.error(`Error generating AI recommendation for bulk task ${task.id}:`, error);
            // Continue with other tasks even if one fails
          }
        })
      );

      // Fetch updated tasks with correct categories (same as single task)
      const updatedTasks = await Promise.all(
        createdTasks.map(task =>
          prisma.task.findUnique({
            where: { id: task.id },
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

      // Increment task count for each created task
      for (let i = 0; i < createdTasks.length; i++) {
        subscriptionService.incrementTaskCount(userId).catch((error: any) => {
          console.error("Error incrementing task count:", error);
        });
      }

      return {
        tasks: updatedTasks as TaskResponse[],
        message: `Successfully created and categorized ${updatedTasks.length} tasks using intelligent priority analysis.`
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

    // Generate enhanced AI recommendation with Signal Layer integration
    try {
      const userPreferences = await aiRecommendationService.getUserWorkPreferences(userId);
      const taskAnalysis = {
        title: task.title,
        description: task.description || "",
        duration: task.duration,
        importance: task.importance,
        urgency: task.urgency,
        // Signal Layer fields (user-controlled toggles from frontend)
        isHighLeverage: (task as any).isHighLeverage || false,
        advancesKeyResults: (task as any).advancesKeyResults || false,
        dueDate: (task as any).dueDate,
        projectName: (task as any).project?.name || "",
        objectiveName: (task as any).objective?.name || "",
        objectiveDescription: (task as any).objective?.description || "",
        okrTitle: (task as any).okr?.title || "",
        okrDescription: (task as any).okr?.description || ""
      };

      // Use enhanced recommendation method
      const recommendation = await aiRecommendationService.generateEnhancedTaskRecommendation(
        taskAnalysis,
        userPreferences,
        userId
      );

      const mappedCategory = this.mapAICategoryToTaskCategory(recommendation.category);

      // Update the task's category to match the AI recommendation
      await prisma.task.update({
        where: { id: task.id },
        data: { category: mappedCategory }
      });

      // Create or update AI recommendation record with enhanced fields
      await (prisma as any).aIRecommendation.upsert({
        where: {
          taskId: task.id
        },
        update: {
          category: recommendation.category,
          recommendedTime: recommendation.recommendedTime,
          confidence: recommendation.confidence,
          reasoning: recommendation.reasoning,
          signalType: recommendation.signalType,
          recommendedDuration: recommendation.recommendedDuration,
          breakRecommendation: recommendation.breakRecommendation,
          loadWarning: recommendation.loadWarning,
          importanceFlag: recommendation.importanceFlag,
          urgencyFlag: recommendation.urgencyFlag
        },
        create: {
          taskId: task.id,
          category: recommendation.category,
          recommendedTime: recommendation.recommendedTime,
          confidence: recommendation.confidence,
          reasoning: recommendation.reasoning,
          signalType: recommendation.signalType,
          recommendedDuration: recommendation.recommendedDuration,
          breakRecommendation: recommendation.breakRecommendation,
          loadWarning: recommendation.loadWarning,
          importanceFlag: recommendation.importanceFlag,
          urgencyFlag: recommendation.urgencyFlag
        }
      });

      // Fetch updated task with all relations
      const updatedTask = await prisma.task.findUnique({
        where: { id: task.id },
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

      console.log(`AI recommendation generated for task ${task.id}: ${recommendation.category} -> ${mappedCategory} at ${recommendation.recommendedTime}`);

      // Increment task count for subscription tracking (non-blocking)
      subscriptionService.incrementTaskCount(userId).catch((error: any) => {
        console.error("Error incrementing task count:", error);
      });

      return updatedTask as TaskResponse;
    } catch (error) {
      console.error("Error generating AI recommendation for new task:", error);
      // If AI recommendation fails, return the task with original category
      // Increment task count for subscription tracking (non-blocking)
      subscriptionService.incrementTaskCount(userId).catch((error: any) => {
        console.error("Error incrementing task count:", error);
      });
      return task as TaskResponse;
    }
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
   * Get all tasks without pagination
   */
  async getAllTasksWithoutPagination(
    userId: number, 
    filters: any = {}, 
    sortBy: string = 'createdAt', 
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<TaskResponse[]> {
    const where: any = {
      userId,
      ...filters,
    };

    const tasks = await prisma.task.findMany({
      where,
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
      },
    });

    return tasks.map(task => {
      const response: TaskResponse = {
        id: task.id,
        title: task.title,
        category: task.category,
        duration: task.duration,
        priority: task.priority,
        position: task.position,
        completed: task.completed,
        importance: task.importance,
        urgency: task.urgency,
        // Signal Layer fields
        isHighLeverage: (task as any).isHighLeverage || false,
        advancesKeyResults: (task as any).advancesKeyResults || false,
        createdAt: task.createdAt,
        userId: task.userId,
        user: task.user,
      };
      
      if (task.description !== null) {
        response.description = task.description;
      }
      
      if (task.dueDate !== null) {
        response.dueDate = task.dueDate;
      }
      
      if (task.project !== null) {
        response.project = task.project;
      }
      
      if (task.objective !== null) {
        response.objective = task.objective;
      }
      
      if (task.okr !== null) {
        response.okr = task.okr;
      }
      
      if (task.plan !== null) {
        response.plan = task.plan;
      }
      
      if (task.aiRecommendation !== null) {
        const aiRec: AIRecommendationResponse = {
          id: task.aiRecommendation.id,
          taskId: task.aiRecommendation.taskId,
          category: task.aiRecommendation.category,
          recommendedTime: task.aiRecommendation.recommendedTime,
          confidence: task.aiRecommendation.confidence,
          createdAt: task.aiRecommendation.createdAt,
          updatedAt: task.aiRecommendation.updatedAt,
        };
        
        // Add enhanced Signal Layer fields if available
        if ((task.aiRecommendation as any).signalType) {
          aiRec.signalType = (task.aiRecommendation as any).signalType;
        }
        if ((task.aiRecommendation as any).recommendedDuration) {
          aiRec.recommendedDuration = (task.aiRecommendation as any).recommendedDuration;
        }
        if ((task.aiRecommendation as any).breakRecommendation) {
          aiRec.breakRecommendation = (task.aiRecommendation as any).breakRecommendation;
        }
        if ((task.aiRecommendation as any).loadWarning) {
          aiRec.loadWarning = (task.aiRecommendation as any).loadWarning;
        }
        if ((task.aiRecommendation as any).importanceFlag !== null && (task.aiRecommendation as any).importanceFlag !== undefined) {
          aiRec.importanceFlag = (task.aiRecommendation as any).importanceFlag;
        }
        if ((task.aiRecommendation as any).urgencyFlag !== null && (task.aiRecommendation as any).urgencyFlag !== undefined) {
          aiRec.urgencyFlag = (task.aiRecommendation as any).urgencyFlag;
        }
        
        if (task.aiRecommendation.reasoning !== null) {
          aiRec.reasoning = task.aiRecommendation.reasoning;
        }
        
        response.aiRecommendation = aiRec;
      }
      
      return response;
    });
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
   * Batch update multiple tasks
   */
  async batchUpdateTasks(batchData: BatchUpdateTaskRequest, userId: number): Promise<BatchUpdateTaskResponse> {
    try {
      if (!batchData.tasks || !Array.isArray(batchData.tasks) || batchData.tasks.length === 0) {
        throw new Error("Tasks array is required and must not be empty");
      }

      // Validate all task IDs are provided
      for (let i = 0; i < batchData.tasks.length; i++) {
        const task = batchData.tasks[i];
        if (!task || !task.id || typeof task.id !== 'number') {
          throw new Error(`Task ${i + 1} is missing required field: id`);
        }
      }

      // Get all task IDs to verify they exist and belong to the user
      const taskIds = batchData.tasks.map(t => t.id);
      const existingTasks = await prisma.task.findMany({
        where: {
          id: { in: taskIds },
          userId,
        },
        select: { id: true },
      });

      const existingTaskIds = new Set(existingTasks.map(t => t.id));
      const missingTaskIds = taskIds.filter(id => !existingTaskIds.has(id));

      if (missingTaskIds.length > 0) {
        throw new Error(`Tasks not found or access denied: ${missingTaskIds.join(', ')}`);
      }

      // Update all tasks in parallel
      const updatePromises = batchData.tasks.map(async (taskUpdate) => {
        const { id, ...updateData } = taskUpdate;
        
        // Sanitize update data (similar to updateTask)
        const sanitizedData: UpdateTaskRequest = { ...updateData };
        
        // Convert dueDate from date-only string to proper DateTime format if needed
        if (sanitizedData.dueDate && typeof sanitizedData.dueDate === 'string') {
          const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (dateOnlyRegex.test(sanitizedData.dueDate)) {
            sanitizedData.dueDate = new Date(sanitizedData.dueDate + 'T23:59:59.999Z');
          } else {
            const parsedDate = new Date(sanitizedData.dueDate);
            if (isNaN(parsedDate.getTime())) {
              delete sanitizedData.dueDate;
            } else {
              sanitizedData.dueDate = parsedDate;
            }
          }
        }

        return prisma.task.update({
          where: { id },
          data: sanitizedData,
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
      });

      const updatedTasks = await Promise.all(updatePromises);

      // Regenerate AI recommendations asynchronously for tasks that had relevant changes
      updatedTasks.forEach((task, index) => {
        const taskUpdate = batchData.tasks[index];
        if (taskUpdate && (
          taskUpdate.title || 
          taskUpdate.description || 
          taskUpdate.duration || 
          taskUpdate.importance !== undefined || 
          taskUpdate.urgency !== undefined ||
          taskUpdate.dueDate !== undefined
        )) {
          this.generateAIRecommendationAsync(task.id, userId).catch((error: any) => {
            console.error(`Error regenerating AI recommendation for batch updated task ${task.id}:`, error);
          });
        }
      });

      return {
        success: true,
        updated: updatedTasks.length,
        tasks: updatedTasks as TaskResponse[],
      };
    } catch (error: any) {
      console.error("Error in batchUpdateTasks:", error);
      throw new Error(error.message || "Failed to batch update tasks");
    }
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
  async updateTaskPositions(
    positions: Array<{ id: number; position: number }>,
    userId: number,
    viewType?: 'list' | 'matrix'
  ): Promise<void> {
    const positionField = viewType === 'list' ? 'listPosition'
      : viewType === 'matrix' ? 'matrixPosition'
      : 'position';

    await prisma.$transaction(
      positions.map(({ id, position }) =>
        prisma.task.updateMany({
          where: { id, userId },
          data: { [positionField]: position },
        })
      )
    );
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

      // Get tasks due today with all necessary relations for priority calculation
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
          aiRecommendation: true,
          okr: {
            select: {
              id: true,
              currentValue: true,
              targetValue: true,
              endDate: true,
              confidenceScore: true
            }
          }
        }
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

          const result: TodayTaskResponse = {
            id: task.id,
            title: task.title,
            duration: task.duration,
            priority: task.priority,
            importance: task.importance,
            urgency: task.urgency,
            // Signal Layer fields
            isHighLeverage: (task as any).isHighLeverage || false,
            advancesKeyResults: (task as any).advancesKeyResults || false,
            dueDate: (task as any).dueDate,
            aiRecommendationStatus,
            rank: index + 1
          };
          
          if (task.description) {
            result.description = task.description;
          }
          
          if (aiRecommendation) {
            result.aiRecommendation = {
              id: aiRecommendation.id,
              taskId: aiRecommendation.taskId,
              category: aiRecommendation.category,
              recommendedTime: aiRecommendation.recommendedTime,
              confidence: aiRecommendation.confidence,
              reasoning: aiRecommendation.reasoning,
              createdAt: aiRecommendation.createdAt,
              updatedAt: aiRecommendation.updatedAt
            };
          }
          
          return result;
        })
      );

      // Get user work preferences for work mode alignment
      const userPreferences = await aiRecommendationService.getUserWorkPreferences(userId);
      
      // Rank tasks using new priority service
      // Include Signal Layer fields for proper prioritization
      const tasksForRanking = tasks.map(task => {
        const processedTask = processedTasks.find(pt => pt.id === task.id);
        return {
          id: task.id,
          priority: task.priority,
          importance: task.importance,
          urgency: task.urgency,
          // Signal Layer fields - critical for prioritization
          isHighLeverage: (task as any).isHighLeverage || false,
          advancesKeyResults: (task as any).advancesKeyResults || false,
          dueDate: (task as any).dueDate || null,
          okrId: (task as any).okrId || null,
          okr: (task as any).okr || null,
          aiRecommendation: (task as any).aiRecommendation ? {
            category: (task as any).aiRecommendation.category,
            confidence: (task as any).aiRecommendation.confidence,
            recommendedTime: (task as any).aiRecommendation.recommendedTime,
            ...((task as any).aiRecommendation.signalType ? { signalType: (task as any).aiRecommendation.signalType } : {})
          } : null,
          duration: task.duration,
          category: task.category
        };
      });

      const rankedTasksWithScores = await taskPriorityService.rankTasksByPriority(
        tasksForRanking,
        userId,
        new Date(),
        userPreferences
      );

      // Map back to TodayTaskResponse format and return top 3 (or all if less than 3)
      // Prioritize by Signal Layer first, then Eisenhower matrix
      const topTasks = rankedTasksWithScores.slice(0, Math.min(3, rankedTasksWithScores.length)).map(item => {
        const originalTask = processedTasks.find(t => t.id === item.id)!;
        return {
          ...originalTask,
          rank: item.rank
        };
      });

      return {
        tasks: topTasks,
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
   * Rank tasks by priority using the new priority service
   * This method is kept for backward compatibility but now uses TaskPriorityService
   * @deprecated Use taskPriorityService.rankTasksByPriority directly
   */
  private async rankTasksByPriorityNew(
    tasks: TodayTaskResponse[],
    userId: number,
    userPreferences?: any
  ): Promise<TodayTaskResponse[]> {
    // This method is no longer used - priority ranking is done in getTodayTasksWithAIRecommendations
    // Keeping for reference but should be removed in future cleanup
    return tasks;
  }

  /**
   * Parse time string (HH:MM) to minutes since midnight
   */
  private parseTimeToMinutes(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  }

  /**
   * Get future tasks (tasks without due dates) with AI recommendations, ranked by priority
   */
  async getFutureTasksWithAIRecommendations(userId: number, timezone: string = 'UTC'): Promise<TodayTasksResponse> {
    try {
      // Get tasks without due dates (null dueDate) - these are unscheduled/future tasks
      const tasks = await prisma.task.findMany({
        where: {
          userId,
          completed: false,
          dueDate: null // Only tasks without due dates
        },
        include: {
          aiRecommendation: true,
          okr: {
            select: {
              id: true,
              currentValue: true,
              targetValue: true,
              endDate: true,
              confidenceScore: true
            }
          },
          project: {
            select: { id: true, name: true }
          }
        } as any
      });

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

          const result: TodayTaskResponse = {
            id: task.id,
            title: task.title,
            duration: task.duration,
            priority: task.priority,
            importance: task.importance,
            urgency: task.urgency,
            // Signal Layer fields
            isHighLeverage: (task as any).isHighLeverage || false,
            advancesKeyResults: (task as any).advancesKeyResults || false,
            dueDate: null, // Future tasks don't have due dates
            aiRecommendationStatus,
            rank: index + 1
          };
          
          if (task.description) {
            result.description = task.description;
          }
          
          if (aiRecommendation) {
            result.aiRecommendation = {
              id: aiRecommendation.id,
              taskId: aiRecommendation.taskId,
              category: aiRecommendation.category,
              recommendedTime: aiRecommendation.recommendedTime,
              confidence: aiRecommendation.confidence,
              reasoning: aiRecommendation.reasoning,
              createdAt: aiRecommendation.createdAt,
              updatedAt: aiRecommendation.updatedAt
            };
          }
          
          return result;
        })
      );

      // Get user work preferences for work mode alignment
      const userPreferences = await aiRecommendationService.getUserWorkPreferences(userId);
      
      // Rank tasks using new priority service
      // Include Signal Layer fields for proper prioritization
      const tasksForRanking = tasks.map(task => {
        const processedTask = processedTasks.find(pt => pt.id === task.id);
        return {
          id: task.id,
          priority: task.priority,
          importance: task.importance,
          urgency: task.urgency,
          // Signal Layer fields - critical for prioritization
          isHighLeverage: (task as any).isHighLeverage || false,
          advancesKeyResults: (task as any).advancesKeyResults || false,
          dueDate: null, // Future tasks don't have due dates
          okrId: (task as any).okrId || null,
          okr: (task as any).okr || null,
          aiRecommendation: (task as any).aiRecommendation ? {
            category: (task as any).aiRecommendation.category,
            confidence: (task as any).aiRecommendation.confidence,
            recommendedTime: (task as any).aiRecommendation.recommendedTime,
            ...((task as any).aiRecommendation.signalType ? { signalType: (task as any).aiRecommendation.signalType } : {})
          } : null,
          duration: task.duration,
          category: task.category
        };
      });

      const rankedTasksWithScores = await taskPriorityService.rankTasksByPriority(
        tasksForRanking,
        userId,
        new Date(),
        userPreferences
      );

      // Map back to TodayTaskResponse format and return top 3
      // Prioritize by Signal Layer first, then Eisenhower matrix
      const topTasks = rankedTasksWithScores.slice(0, Math.min(3, rankedTasksWithScores.length)).map(item => {
        const originalTask = processedTasks.find(t => t.id === item.id)!;
        return {
          ...originalTask,
          rank: item.rank
        };
      });

      return {
        tasks: topTasks,
        total: tasks.length,
        generatedRecommendations,
        failedRecommendations
      };
    } catch (error) {
      console.error("Error fetching future tasks with AI recommendations:", error);
      throw new Error("Failed to fetch future tasks");
    }
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
          aiRecommendation: true,
          okr: {
            select: {
              id: true,
              currentValue: true,
              targetValue: true,
              endDate: true,
              confidenceScore: true
            }
          }
        }
      } as any);
      
      // Convert overdue tasks to TodayTaskResponse format
      // Include Signal Layer fields
      const overdueTasksFormatted: TodayTaskResponse[] = overdueTasksFromDB
        .filter(task => task.dueDate !== null) // Only include tasks with due dates
        .map(task => {
          const aiRec = (task as any).aiRecommendation;
          return {
            id: task.id,
            title: task.title,
            description: task.description || '', // Convert null to empty string
            duration: task.duration,
            priority: task.priority,
            importance: task.importance,
            urgency: task.urgency,
            dueDate: task.dueDate!, // We know it's not null due to filter above
            // Signal Layer fields
            isHighLeverage: (task as any).isHighLeverage || false,
            advancesKeyResults: (task as any).advancesKeyResults || false,
            aiRecommendationStatus: 'available' as const,
            rank: 0, // Will be calculated later if needed
            // Conditionally include AI recommendation in proper format (use spread to avoid undefined)
            ...(aiRec ? {
              aiRecommendation: {
                id: aiRec.id,
                taskId: aiRec.taskId,
                category: aiRec.category,
                recommendedTime: aiRec.recommendedTime,
                confidence: aiRec.confidence,
                reasoning: aiRec.reasoning,
                signalType: aiRec.signalType || null,
                recommendedDuration: aiRec.recommendedDuration || null,
                breakRecommendation: aiRec.breakRecommendation || null,
                loadWarning: aiRec.loadWarning || null,
                importanceFlag: aiRec.importanceFlag || null,
                urgencyFlag: aiRec.urgencyFlag || null,
                createdAt: aiRec.createdAt,
                updatedAt: aiRec.updatedAt
              }
            } : {})
          };
        });
      
      // Also get tasks WITHOUT due dates that have AI recommendations
      // These are unscheduled tasks that can be recommended based on AI recommended time
      const tasksWithoutDueDate = await prisma.task.findMany({
        where: {
          userId,
          completed: false,
          dueDate: null, // Tasks without due dates
          aiRecommendation: {
            isNot: null // Must have AI recommendation
          }
        },
        include: {
          aiRecommendation: true,
          okr: {
            select: {
              id: true,
              currentValue: true,
              targetValue: true,
              endDate: true,
              confidenceScore: true
            }
          }
        }
      } as any);
      
      // Convert tasks without due dates to TodayTaskResponse format
      const tasksWithoutDueDateFormatted: TodayTaskResponse[] = tasksWithoutDueDate.map(task => {
        const aiRec = (task as any).aiRecommendation;
        return {
          id: task.id,
          title: task.title,
          description: task.description || '', // Convert null to empty string
          duration: task.duration,
          priority: task.priority,
          importance: task.importance,
          urgency: task.urgency,
          dueDate: null, // Explicitly set to null
          // Signal Layer fields
          isHighLeverage: (task as any).isHighLeverage || false,
          advancesKeyResults: (task as any).advancesKeyResults || false,
          aiRecommendationStatus: 'available' as const,
          rank: 0, // Will be calculated later if needed
          // Conditionally include AI recommendation in proper format (use spread to avoid undefined)
          ...(aiRec ? {
            aiRecommendation: {
              id: aiRec.id,
              taskId: aiRec.taskId,
              category: aiRec.category,
              recommendedTime: aiRec.recommendedTime,
              confidence: aiRec.confidence,
              reasoning: aiRec.reasoning,
              signalType: aiRec.signalType || null,
              recommendedDuration: aiRec.recommendedDuration || null,
              breakRecommendation: aiRec.breakRecommendation || null,
              loadWarning: aiRec.loadWarning || null,
              importanceFlag: aiRec.importanceFlag || null,
              urgencyFlag: aiRec.urgencyFlag || null,
              createdAt: aiRec.createdAt,
              updatedAt: aiRec.updatedAt
            }
          } : {})
        };
      });
      
      // Combine today's tasks, overdue tasks, and tasks without due dates
      const allTasks = {
        ...todayTasks,
        tasks: [...todayTasks.tasks, ...overdueTasksFormatted, ...tasksWithoutDueDateFormatted]
      };
      
      if (!allTasks.tasks.length) {
        return {
          task: null,
          nextRecommendation: null,
          currentTime: timeOnly,
          reasoning: "No tasks found with AI recommendations"
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

      // Get user work preferences for priority comparison
      const userPreferences = await aiRecommendationService.getUserWorkPreferences(userId);

      // Compare overdue vs today's matching tasks
      if (overdueTasks.length > 0 && matchingTasks.length > 0) {
        const bestOverdueTask = await this.selectBestTaskForNow(overdueTasks, currentMinutes, userId, userPreferences);
        const bestTodayTask = await this.selectBestTaskForNow(matchingTasks, currentMinutes, userId, userPreferences);
        
        // Compare priority, importance, and urgency using new priority service
        const todayTaskWins = await this.compareTaskPriority(bestTodayTask, bestOverdueTask, userId, userPreferences);
        
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
        const prioritizedOverdueTask = await this.selectBestTaskForNow(overdueTasks, currentMinutes, userId, userPreferences);
        
        return {
          task: prioritizedOverdueTask,
          nextRecommendation: null,
          currentTime: timeOnly,
          reasoning: `URGENT: This task is overdue and needs immediate attention! It's ${prioritizedOverdueTask?.aiRecommendation?.category.toLowerCase()} work that should be completed right now.`
        };
      }

      // If only today's matching tasks exist
      if (matchingTasks.length > 0) {
        const prioritizedTask = await this.selectBestTaskForNow(matchingTasks, currentMinutes, userId, userPreferences);
        
        return {
          task: prioritizedTask,
          nextRecommendation: null,
          currentTime: timeOnly,
          reasoning: `Perfect timing! This task is recommended for ${prioritizedTask?.aiRecommendation?.recommendedTime}, 
                     and it's ${prioritizedTask?.aiRecommendation?.category.toLowerCase()} work that aligns with your current focus window.`
        };
      }

      // PRIORITY 3: Find next recommended task (closest future recommendation)
      const allTasksWithRecommendations = allTasks.tasks
        .filter(task => task.aiRecommendation)
        .map(task => ({
          ...task,
          recommendedMinutes: this.parseTimeToMinutes(task.aiRecommendation!.recommendedTime)
        }));

      // Find future tasks (recommended time is after current time)
      const futureTasks = allTasksWithRecommendations
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

      // FALLBACK: If no future tasks, find the closest past task (within last 4 hours)
      // This handles cases where recommended times have passed but are still relevant
      const PAST_WINDOW_HOURS = 4;
      const pastTasks = allTasksWithRecommendations
        .filter(task => {
          const timeDiff = currentMinutes - task.recommendedMinutes;
          return timeDiff > 0 && timeDiff <= (PAST_WINDOW_HOURS * 60); // Within last 4 hours
        })
        .sort((a, b) => {
          // Sort by closest to current time (most recent first)
          const aDiff = currentMinutes - a.recommendedMinutes;
          const bDiff = currentMinutes - b.recommendedMinutes;
          return aDiff - bDiff; // Smaller diff = more recent
        });

      if (pastTasks.length > 0) {
        const closestPastTask = pastTasks[0]!;
        const timeAgo = currentMinutes - closestPastTask.recommendedMinutes;
        const hoursAgo = Math.floor(timeAgo / 60);
        const minutesAgo = timeAgo % 60;
        
        return {
          task: closestPastTask,
          nextRecommendation: null,
          currentTime: timeOnly,
          reasoning: `This task was recommended for ${closestPastTask.aiRecommendation?.recommendedTime} (${hoursAgo > 0 ? `${hoursAgo}h ` : ''}${minutesAgo}m ago). It's still relevant and can be done now.`
        };
      }

      return {
        task: null,
        nextRecommendation: null,
        currentTime: timeOnly,
        reasoning: `No task recommendations found. Current time: ${timeOnly}`
      };

    } catch (error) {
      console.error("Error getting now recommended task:", error);
      throw new Error("Failed to get now recommended task");
    }
  }

  /**
   * Compare two tasks based on priority using new priority service
   * Returns true if todayTask wins over overdueTask
   */
  private async compareTaskPriority(
    todayTask: TodayTaskResponse,
    overdueTask: TodayTaskResponse,
    userId: number,
    userPreferences?: any
  ): Promise<boolean> {
    try {
      // Prepare tasks for priority comparison
      // Include Signal Layer fields for proper prioritization (Signal Layer first, then Eisenhower matrix)
      const todayTaskForRanking = {
        id: todayTask.id,
        priority: todayTask.priority,
        importance: todayTask.importance,
        urgency: todayTask.urgency,
        // Signal Layer fields - critical for prioritization
        isHighLeverage: todayTask.isHighLeverage || false,
        advancesKeyResults: todayTask.advancesKeyResults || false,
        dueDate: todayTask.dueDate || null,
        okrId: null,
        okr: null,
        aiRecommendation: todayTask.aiRecommendation ? {
          category: todayTask.aiRecommendation.category,
          confidence: todayTask.aiRecommendation.confidence,
          recommendedTime: todayTask.aiRecommendation.recommendedTime,
          ...(todayTask.aiRecommendation.signalType ? { signalType: todayTask.aiRecommendation.signalType } : {})
        } : null,
        duration: todayTask.duration,
        category: 'execution' // Default category
      };

      const overdueTaskForRanking = {
        id: overdueTask.id,
        priority: overdueTask.priority,
        importance: overdueTask.importance,
        urgency: overdueTask.urgency,
        // Signal Layer fields - critical for prioritization
        isHighLeverage: overdueTask.isHighLeverage || false,
        advancesKeyResults: overdueTask.advancesKeyResults || false,
        dueDate: overdueTask.dueDate || null,
        okrId: null,
        okr: null,
        aiRecommendation: overdueTask.aiRecommendation ? {
          category: overdueTask.aiRecommendation.category,
          confidence: overdueTask.aiRecommendation.confidence,
          recommendedTime: overdueTask.aiRecommendation.recommendedTime,
          ...(overdueTask.aiRecommendation.signalType ? { signalType: overdueTask.aiRecommendation.signalType } : {})
        } : null,
        duration: overdueTask.duration,
        category: 'execution' // Default category
      };

      // Calculate priority scores
      const todayScore = await taskPriorityService.calculatePriorityScore(
        todayTaskForRanking,
        userId,
        new Date(),
        userPreferences
      );

      const overdueScore = await taskPriorityService.calculatePriorityScore(
        overdueTaskForRanking,
        userId,
        new Date(),
        userPreferences
      );

      // Today task wins if it has higher or equal priority score
      return todayScore.totalScore >= overdueScore.totalScore;
    } catch (error) {
      console.error("Error comparing task priority:", error);
      // Fallback to simple comparison
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
  }

  /**
   * Select best task for current moment using new priority service
   */
  private async selectBestTaskForNow(
    tasks: TodayTaskResponse[],
    currentMinutes: number,
    userId: number,
    userPreferences?: any
  ): Promise<TodayTaskResponse> {
    if (tasks.length === 0) {
      throw new Error("No tasks available for selection");
    }

    try {
      // Prepare tasks for ranking
      // Include Signal Layer fields for proper prioritization (Signal Layer first, then Eisenhower matrix)
      const tasksForRanking = tasks.map(task => ({
        id: task.id,
        priority: task.priority,
        importance: task.importance,
        urgency: task.urgency,
        // Signal Layer fields - critical for prioritization
        isHighLeverage: task.isHighLeverage || false,
        advancesKeyResults: task.advancesKeyResults || false,
        dueDate: task.dueDate || null,
        okrId: null, // OKR data not available in TodayTaskResponse, would need to fetch
        okr: null,
        aiRecommendation: task.aiRecommendation ? {
          category: task.aiRecommendation.category,
          confidence: task.aiRecommendation.confidence,
          recommendedTime: task.aiRecommendation.recommendedTime,
          ...(task.aiRecommendation.signalType ? { signalType: task.aiRecommendation.signalType } : {})
        } : null,
        duration: task.duration,
        category: 'execution' // Default category
      }));

      // Rank tasks using priority service
      const rankedTasks = await taskPriorityService.rankTasksByPriority(
        tasksForRanking,
        userId,
        new Date(),
        userPreferences
      );

      // Return the highest ranked task
      const bestTaskId = rankedTasks[0]?.id;
      const bestTask = tasks.find(t => t.id === bestTaskId) || tasks[0]!;
      return bestTask;
    } catch (error) {
      console.error("Error selecting best task using priority service, falling back to simple sort:", error);
      // Fallback to simple sorting
      const sorted = tasks.sort((a, b) => {
        if (a.urgency !== b.urgency) {
          return b.urgency ? 1 : -1;
        }
        if (a.importance !== b.importance) {
          return b.importance ? 1 : -1;
        }
        if (a.aiRecommendation && b.aiRecommendation) {
          const aDiff = Math.abs((currentMinutes) - this.parseTimeToMinutes(a.aiRecommendation.recommendedTime));
          const bDiff = Math.abs((currentMinutes) - this.parseTimeToMinutes(b.aiRecommendation.recommendedTime));
          return aDiff - bDiff;
        }
        return 0;
      });
      return sorted[0]!;
    }
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