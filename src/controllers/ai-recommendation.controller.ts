import type { Request, Response } from "express";
import { aiRecommendationService } from "../services/ai-recommendation.service.js";
import { taskService } from "../services/task.service.js";
import prisma from "../config/prisma.js";
import type { 
  AIRecommendationRequest, 
  AIRecommendationResponse, 
  BulkAIRecommendationRequest, 
  BulkAIRecommendationResponse,
  UserWorkPreferencesRequest,
  UserWorkPreferencesResponse,
  TodayTasksResponse
} from "../types/task.types.js";

/**
 * Generate AI recommendation for a single task
 */
const generateTaskRecommendation = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const { taskId, includeReasoning = true, forceRegenerate = false }: AIRecommendationRequest = req.body;

    if (!taskId) {
      return res.status(400).json({ message: "Task ID is required" });
    }

    // Get the task
    const task = await prisma.task.findFirst({
      where: { 
        id: taskId, 
        userId: req.user.userId 
      },
      include: {
        project: {
          select: { name: true }
        }
      }
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Get user work preferences
    const userPreferences = await aiRecommendationService.getUserWorkPreferences(req.user.userId);

    // Prepare task analysis data
    const taskAnalysis = {
      title: task.title,
      description: task.description || "",
      duration: task.duration,
      importance: task.importance,
      urgency: task.urgency,
      projectName: task.project?.name || ""
    };

    // Generate AI recommendation
    const recommendation = await aiRecommendationService.generateTaskRecommendation(
      taskAnalysis,
      userPreferences,
      req.user.userId
    );

    // Prepare response
    const response: AIRecommendationResponse = {
      id: 0, // Temporary ID until Prisma client is regenerated
      taskId: task.id,
      category: recommendation.category,
      recommendedTime: recommendation.recommendedTime,
      confidence: recommendation.confidence,
      reasoning: includeReasoning ? (recommendation.reasoning || "No reasoning provided") : "Reasoning not requested",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Create or update AI recommendation
    if (forceRegenerate) {
      // Delete existing recommendation if force regenerate
      await (prisma as any).aIRecommendation.deleteMany({
        where: { taskId: task.id }
      });
    }

    // Create new AI recommendation
    const aiRecommendation = await (prisma as any).aIRecommendation.create({
      data: {
        taskId: task.id,
        category: recommendation.category,
        recommendedTime: recommendation.recommendedTime,
        confidence: recommendation.confidence,
        reasoning: includeReasoning ? recommendation.reasoning : undefined
      }
    });

    // Update response with the created recommendation
    response.id = aiRecommendation.id;
    response.createdAt = aiRecommendation.createdAt;
    response.updatedAt = aiRecommendation.updatedAt;

    res.json({
      message: "AI recommendation generated successfully",
      recommendation: response
    });
  } catch (error: any) {
    console.error("Error generating AI recommendation:", error);
    res.status(500).json({ 
      message: "Failed to generate AI recommendation",
      error: error.message 
    });
  }
};

/**
 * Generate AI recommendations for multiple tasks
 */
const generateBulkTaskRecommendations = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const { taskIds, includeReasoning = true, forceRegenerate = false }: BulkAIRecommendationRequest = req.body;

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ message: "Task IDs array is required" });
    }

    if (taskIds.length > 50) {
      return res.status(400).json({ message: "Maximum 50 tasks can be processed at once" });
    }

    // Get user work preferences
    const userPreferences = await aiRecommendationService.getUserWorkPreferences(req.user.userId);

    const recommendations: AIRecommendationResponse[] = [];
    const errors: Array<{ taskId: number; error: string }> = [];
    let successCount = 0;
    let errorCount = 0;

    // Process each task
    for (const taskId of taskIds) {
      try {
        // Get the task
        const task = await prisma.task.findFirst({
          where: { 
            id: taskId, 
            userId: req.user.userId 
          },
          include: {
            project: {
              select: { name: true }
            }
          }
        });

        if (!task) {
          errors.push({ taskId, error: "Task not found" });
          errorCount++;
          continue;
        }

        // Prepare task analysis data
        const taskAnalysis = {
          title: task.title,
          description: task.description || "",
          duration: task.duration,
          importance: task.importance,
          urgency: task.urgency,
          projectName: task.project?.name || ""
        };

        // Generate AI recommendation
        const recommendation = await aiRecommendationService.generateTaskRecommendation(
          taskAnalysis,
          userPreferences,
          req.user.userId
        );

        // Prepare response
        const response: AIRecommendationResponse = {
          id: 0, // Temporary ID until Prisma client is regenerated
          taskId: task.id,
          category: recommendation.category,
          recommendedTime: recommendation.recommendedTime,
          confidence: recommendation.confidence,
          reasoning: includeReasoning ? (recommendation.reasoning || "No reasoning provided") : "Reasoning not requested",
          createdAt: new Date(),
          updatedAt: new Date()
        };

        recommendations.push(response);

        // Create or update AI recommendation
        if (forceRegenerate) {
          // Delete existing recommendation if force regenerate
          await (prisma as any).aIRecommendation.deleteMany({
            where: { taskId: task.id }
          });
        }

        // Create new AI recommendation
        const aiRecommendation = await (prisma as any).aIRecommendation.create({
          data: {
            taskId: task.id,
            category: recommendation.category,
            recommendedTime: recommendation.recommendedTime,
            confidence: recommendation.confidence,
            reasoning: includeReasoning ? recommendation.reasoning : undefined
          }
        });

        // Update response with the created recommendation
        response.id = aiRecommendation.id;
        response.createdAt = aiRecommendation.createdAt;
        response.updatedAt = aiRecommendation.updatedAt;

        successCount++;
      } catch (error: any) {
        console.error(`Error processing task ${taskId}:`, error);
        errors.push({ taskId, error: error.message });
        errorCount++;
      }
    }

    const response: BulkAIRecommendationResponse = {
      recommendations,
      totalProcessed: taskIds.length,
      successCount,
      errorCount,
      errors: errors.length > 0 ? errors : []
    };

    res.json({
      message: `AI recommendations generated for ${successCount} out of ${taskIds.length} tasks`,
      data: response
    });
  } catch (error: any) {
    console.error("Error generating bulk AI recommendations:", error);
    res.status(500).json({ 
      message: "Failed to generate bulk AI recommendations",
      error: error.message 
    });
  }
};

/**
 * Get AI recommendation for a specific task
 */
const getTaskRecommendation = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const taskId = parseInt(req.params.taskId as string);
    if (isNaN(taskId)) {
      return res.status(400).json({ message: "Invalid task ID" });
    }

    // Get the task with AI recommendation data
    const task = await prisma.task.findFirst({
      where: { 
        id: taskId, 
        userId: req.user.userId 
      },
        include: {
          aiRecommendation: true
        } as any
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (!(task as any).aiRecommendation) {
      return res.status(404).json({ message: "No AI recommendation found for this task" });
    }

    const response: AIRecommendationResponse = {
      id: (task as any).aiRecommendation.id,
      taskId: task.id,
      category: (task as any).aiRecommendation.category,
      recommendedTime: (task as any).aiRecommendation.recommendedTime,
      confidence: (task as any).aiRecommendation.confidence,
      reasoning: (task as any).aiRecommendation.reasoning,
      createdAt: (task as any).aiRecommendation.createdAt,
      updatedAt: (task as any).aiRecommendation.updatedAt
    };

    res.json({
      message: "AI recommendation retrieved successfully",
      recommendation: response
    });
  } catch (error: any) {
    console.error("Error retrieving AI recommendation:", error);
    res.status(500).json({ 
      message: "Failed to retrieve AI recommendation",
      error: error.message 
    });
  }
};

/**
 * Get today's tasks with AI recommendations, ranked by priority
 */
const getTodayTasksWithAIRecommendations = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Get timezone from query parameter, default to UTC
    const timezone = (req.query.timezone as string) || 'UTC';

    const result = await taskService.getTodayTasksWithAIRecommendations(userId, timezone);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("Error fetching today's tasks with AI recommendations:", error);
    res.status(500).json({ 
      error: "Failed to fetch today's tasks",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

/**
 * Get user work preferences
 */
const getUserWorkPreferences = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const preferences = await aiRecommendationService.getUserWorkPreferences(req.user.userId);

    const response: UserWorkPreferencesResponse = {
      ...preferences,
      updatedAt: new Date()
    };

    res.json({
      message: "User work preferences retrieved successfully",
      preferences: response
    });
  } catch (error: any) {
    console.error("Error retrieving user work preferences:", error);
    res.status(500).json({ 
      message: "Failed to retrieve user work preferences",
      error: error.message 
    });
  }
};

/**
 * Update user work preferences
 */
const updateUserWorkPreferences = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const preferences: UserWorkPreferencesRequest = req.body;

    // Validate time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    const timeFields = [
      'deepWorkStartTime', 'deepWorkEndTime',
      'creativeWorkStartTime', 'creativeWorkEndTime',
      'reflectiveWorkStartTime', 'reflectiveWorkEndTime',
      'executiveWorkStartTime', 'executiveWorkEndTime'
    ];

    for (const field of timeFields) {
      if (preferences[field as keyof UserWorkPreferencesRequest] && 
          !timeRegex.test(preferences[field as keyof UserWorkPreferencesRequest] as string)) {
        return res.status(400).json({ 
          message: `Invalid time format for ${field}. Use HH:MM format.` 
        });
      }
    }

    const updatedPreferences = await aiRecommendationService.updateUserWorkPreferences(
      req.user.userId,
      preferences
    );

    const response: UserWorkPreferencesResponse = {
      ...updatedPreferences,
      updatedAt: new Date()
    };

    res.json({
      message: "User work preferences updated successfully",
      preferences: response
    });
  } catch (error: any) {
    console.error("Error updating user work preferences:", error);
    res.status(500).json({ 
      message: "Failed to update user work preferences",
      error: error.message 
    });
  }
};

/**
 * Get tasks with AI recommendations
 */
const getTasksWithAIRecommendations = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const category = req.query.category as string;
    const hasRecommendation = req.query.hasRecommendation === 'true';

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      userId: req.user.userId
    };

    // Filter by AI recommendation category
    if (category) {
      where.aiRecommendation = {
        category: category
      };
    }

    // Filter by whether task has AI recommendation
    if (hasRecommendation !== undefined) {
      if (hasRecommendation) {
        where.aiRecommendation = {
          ...where.aiRecommendation,
          isNot: null
        };
      } else {
        where.aiRecommendation = null;
      }
    }

    // Get tasks with AI recommendations
    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          aiRecommendation: true,
          project: {
            select: { id: true, name: true }
          }
        } as any
      }),
      prisma.task.count({ where })
    ]);

    res.json({
      message: "Tasks with AI recommendations retrieved successfully",
      data: {
        tasks,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error: any) {
    console.error("Error retrieving tasks with AI recommendations:", error);
    res.status(500).json({ 
      message: "Failed to retrieve tasks with AI recommendations",
      error: error.message 
    });
  }
};

/**
 * Get task recommended for RIGHT NOW based on current time and AI recommendations
 */
const getNowRecommendedTask = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const timezone = req.query.timezone as string;
    
    if (!timezone) {
      return res.status(400).json({
        error: "User timezone required",
        details: "Please provide your timezone (e.g., America/Los_Angeles, Europe/London)"
      });
    }

    const result = await taskService.getNowRecommendedTask(userId, timezone);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("Error fetching now recommended task:", error);
    res.status(500).json({
      error: "Failed to get now recommended task",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

/**
 * Get tasks with AI recommendations from the last 7 days, ordered by due date
 */
const getLast7DaysTasksWithAIRecommendations = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Calculate date range for last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);

    // Get tasks with AI recommendations from last 7 days
    const tasks = await prisma.task.findMany({
      where: {
        userId: req.user.userId,
        completed: false, // Only non-completed tasks
        aiRecommendation: {
          isNot: null // Only tasks with AI recommendations
        },
        dueDate: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: [
        {
          dueDate: 'asc' // Order by due date ascending
        },
        {
          createdAt: 'asc' // Secondary sort by creation date for tasks without due date
        }
      ],
      include: {
        aiRecommendation: true,
        project: {
          select: { id: true, name: true }
        }
      } as any
    });

    // Separate tasks with and without due dates for proper ordering
    const tasksWithDueDate = tasks.filter(task => task.dueDate !== null);
    const tasksWithoutDueDate = tasks.filter(task => task.dueDate === null);

    // Sort tasks with due date by due date ascending
    tasksWithDueDate.sort((a, b) => {
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      return 0;
    });

    // Sort tasks without due date by creation date ascending
    tasksWithoutDueDate.sort((a, b) => {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // Combine: tasks with due date first, then tasks without due date
    const orderedTasks = [...tasksWithDueDate, ...tasksWithoutDueDate];

    res.json({
      message: "Last 7 days tasks with AI recommendations retrieved successfully",
      data: {
        tasks: orderedTasks,
        dateRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        },
        total: orderedTasks.length
      }
    });
  } catch (error: any) {
    console.error("Error retrieving last 7 days tasks with AI recommendations:", error);
    res.status(500).json({ 
      message: "Failed to retrieve last 7 days tasks with AI recommendations",
      error: error.message 
    });
  }
};

export {
  generateTaskRecommendation,
  generateBulkTaskRecommendations,
  getTaskRecommendation,
  getTodayTasksWithAIRecommendations,
  getNowRecommendedTask,
  getUserWorkPreferences,
  updateUserWorkPreferences,
  getTasksWithAIRecommendations,
  getLast7DaysTasksWithAIRecommendations
};
