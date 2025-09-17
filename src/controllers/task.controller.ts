import type { Request, Response } from "express";
import * as taskService from "../services/task.service.js";
import type { CreateTaskRequest, UpdateTaskRequest, TaskQueryParams } from "../types/task.types.js";

/**
 * Helper function to handle backward compatibility and filter legacy fields
 * 
 * Transforms legacy field names and removes fields that no longer exist in the Prisma schema:
 * - keyResultId → okrId (field was renamed)
 * - isHighLeverage (removed from schema)
 * - willMoveKRForward (removed from schema)
 */
const sanitizeTaskData = (body: any) => {
  const requestBody = { ...body };
  
  // Transform legacy field names
  if ('keyResultId' in requestBody) {
    requestBody.okrId = requestBody.keyResultId;
    delete requestBody.keyResultId;
  }
  
  // Remove legacy fields that are no longer in the schema
  const legacyFieldsToRemove = ['isHighLeverage', 'willMoveKRForward'];
  legacyFieldsToRemove.forEach(field => {
    if (field in requestBody) {
      delete requestBody[field];
    }
  });
  
  return requestBody;
};

const createTask = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const taskData: CreateTaskRequest = sanitizeTaskData(req.body);
    
    // Validate required fields
    if (!taskData.title || !taskData.category || typeof taskData.duration !== 'number' || !taskData.priority || typeof taskData.position !== 'number') {
      return res.status(400).json({ message: "Title, category, duration, priority, and position are required" });
    }

    const task = await taskService.createTask(taskData, req.user.userId);
    
    res.status(201).json({
      message: "Task created successfully",
      task,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getAllTasks = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const queryParams: TaskQueryParams = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      ...(req.query.completed && { completed: req.query.completed === 'true' }),
      ...(req.query.priority && { priority: req.query.priority as string }),
      ...(req.query.category && { category: req.query.category as string }),
      ...(req.query.importance && { importance: req.query.importance === 'true' }),
      ...(req.query.urgency && { urgency: req.query.urgency === 'true' }),
      ...(req.query.search && { search: req.query.search as string }),
      ...(req.query.projectId && { projectId: parseInt(req.query.projectId as string) }),
      ...(req.query.objectiveId && { objectiveId: parseInt(req.query.objectiveId as string) }),
      ...(req.query.okrId && { okrId: parseInt(req.query.okrId as string) }),
      ...(req.query.sortBy && { sortBy: req.query.sortBy as 'title' | 'createdAt' | 'priority' | 'position' | 'duration' | 'category' }),
      ...(req.query.sortOrder && { sortOrder: req.query.sortOrder as 'asc' | 'desc' }),
    };

    const result = await taskService.getTasksByUser(req.user.userId, queryParams);
    
    res.json({
      message: "Tasks retrieved successfully",
      data: result,
      pagination: {
        page: queryParams.page,
        limit: queryParams.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / queryParams.limit!),
      },
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getTasksByProject = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const projectId = parseInt(req.params.projectId!);
    if (isNaN(projectId)) {
      return res.status(400).json({ message: "Invalid project ID" });
    }

    const queryParams: TaskQueryParams = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      ...(req.query.completed && { completed: req.query.completed === 'true' }),
      ...(req.query.priority && { priority: req.query.priority as string }),
      ...(req.query.category && { category: req.query.category as string }),
      ...(req.query.importance && { importance: req.query.importance === 'true' }),
      ...(req.query.urgency && { urgency: req.query.urgency === 'true' }),
      ...(req.query.search && { search: req.query.search as string }),
      ...(req.query.sortBy && { sortBy: req.query.sortBy as 'title' | 'createdAt' | 'priority' | 'position' | 'duration' | 'category' }),
      ...(req.query.sortOrder && { sortOrder: req.query.sortOrder as 'asc' | 'desc' }),
    };

    const result = await taskService.getTasksByProject(projectId, req.user.userId, queryParams);
    
    res.json({
      message: "Tasks retrieved successfully",
      data: result,
      pagination: {
        page: queryParams.page,
        limit: queryParams.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / queryParams.limit!),
      },
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getTasksByObjective = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const objectiveId = parseInt(req.params.objectiveId!);
    if (isNaN(objectiveId)) {
      return res.status(400).json({ message: "Invalid objective ID" });
    }

    const queryParams: TaskQueryParams = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      ...(req.query.completed && { completed: req.query.completed === 'true' }),
      ...(req.query.priority && { priority: req.query.priority as string }),
      ...(req.query.category && { category: req.query.category as string }),
      ...(req.query.importance && { importance: req.query.importance === 'true' }),
      ...(req.query.urgency && { urgency: req.query.urgency === 'true' }),
      ...(req.query.search && { search: req.query.search as string }),
      ...(req.query.sortBy && { sortBy: req.query.sortBy as 'title' | 'createdAt' | 'priority' | 'position' | 'duration' | 'category' }),
      ...(req.query.sortOrder && { sortOrder: req.query.sortOrder as 'asc' | 'desc' }),
    };

    const result = await taskService.getTasksByObjective(objectiveId, req.user.userId, queryParams);
    
    res.json({
      message: "Tasks retrieved successfully",
      data: result,
      pagination: {
        page: queryParams.page,
        limit: queryParams.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / queryParams.limit!),
      },
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getTasksByOkr = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const okrId = parseInt(req.params.okrId!);
    if (isNaN(okrId)) {
      return res.status(400).json({ message: "Invalid OKR ID" });
    }

    const queryParams: TaskQueryParams = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      ...(req.query.completed && { completed: req.query.completed === 'true' }),
      ...(req.query.priority && { priority: req.query.priority as string }),
      ...(req.query.category && { category: req.query.category as string }),
      ...(req.query.importance && { importance: req.query.importance === 'true' }),
      ...(req.query.urgency && { urgency: req.query.urgency === 'true' }),
      ...(req.query.search && { search: req.query.search as string }),
      ...(req.query.sortBy && { sortBy: req.query.sortBy as 'title' | 'createdAt' | 'priority' | 'position' | 'duration' | 'category' }),
      ...(req.query.sortOrder && { sortOrder: req.query.sortOrder as 'asc' | 'desc' }),
    };

    const result = await taskService.getTasksByOkr(okrId, req.user.userId, queryParams);
    
    res.json({
      message: "Tasks retrieved successfully",
      data: result,
      pagination: {
        page: queryParams.page,
        limit: queryParams.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / queryParams.limit!),
      },
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getTask = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const taskId = parseInt(req.params.id!);
    if (isNaN(taskId)) {
      return res.status(400).json({ message: "Invalid task ID" });
    }

    const task = await taskService.getTaskById(taskId, req.user.userId);
    
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json({
      message: "Task retrieved successfully",
      task,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const updateTask = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const taskId = parseInt(req.params.id!);
    if (isNaN(taskId)) {
      return res.status(400).json({ message: "Invalid task ID" });
    }

    const updateData: UpdateTaskRequest = sanitizeTaskData(req.body);
    const task = await taskService.updateTask(taskId, req.user.userId, updateData);
    
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json({
      message: "Task updated successfully",
      task,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const deleteTask = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const taskId = parseInt(req.params.id!);
    if (isNaN(taskId)) {
      return res.status(400).json({ message: "Invalid task ID" });
    }

    const result = await taskService.deleteTask(taskId, req.user.userId);
    
    if (!result) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json({ message: "Task deleted successfully" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const updateTaskPositions = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const { positions } = req.body;
    
    if (!Array.isArray(positions)) {
      return res.status(400).json({ message: "Positions must be an array" });
    }

    // Validate positions format
    for (const pos of positions) {
      if (!pos.id || typeof pos.position !== 'number') {
        return res.status(400).json({ message: "Each position item must have id and position" });
      }
    }

    await taskService.updateTaskPositions(positions, req.user.userId);
    
    res.json({ message: "Task positions updated successfully" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const toggleTaskCompletion = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const taskId = parseInt(req.params.id!);
    if (isNaN(taskId)) {
      return res.status(400).json({ message: "Invalid task ID" });
    }

    const task = await taskService.toggleTaskCompletion(taskId, req.user.userId);
    
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json({
      message: `Task ${task.completed ? 'completed' : 'reopened'} successfully`,
      task,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getTaskStats = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
    const objectiveId = req.query.objectiveId ? parseInt(req.query.objectiveId as string) : undefined;
    const okrId = req.query.okrId ? parseInt(req.query.okrId as string) : undefined;
    
    if (req.query.projectId && isNaN(projectId!)) {
      return res.status(400).json({ message: "Invalid project ID" });
    }

    if (req.query.objectiveId && isNaN(objectiveId!)) {
      return res.status(400).json({ message: "Invalid objective ID" });
    }

    if (req.query.okrId && isNaN(okrId!)) {
      return res.status(400).json({ message: "Invalid OKR ID" });
    }

    const stats = await taskService.getTaskStats(req.user.userId, projectId, objectiveId, okrId);
    
    res.json({
      message: "Task statistics retrieved successfully",
      stats,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export {
  createTask,
  getAllTasks,
  getTasksByProject,
  getTasksByObjective,
  getTasksByOkr,
  getTask,
  updateTask,
  deleteTask,
  updateTaskPositions,
  toggleTaskCompletion,
  getTaskStats,
};
