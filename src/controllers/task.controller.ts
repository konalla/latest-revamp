import type { Request, Response } from "express";
import { taskService } from "../services/task.service.js";
import type { CreateTaskRequest, UpdateTaskRequest, TaskQueryParams, BulkTaskRequest, BatchUpdateTaskRequest } from "../types/task.types.js";

/**
 * Helper function to handle backward compatibility and filter legacy fields
 * 
 * Transforms legacy field names and removes fields that no longer exist in the Prisma schema:
 * - keyResultId → okrId (field was renamed)
 * - isHighLeverage (removed from schema)
 * - willMoveKRForward (removed from schema)
 * - dueDate: converts date-only strings to proper DateTime format
 */
const sanitizeTaskData = (body: any) => {
  const requestBody = { ...body };
  
  // Transform legacy field names
  if ('keyResultId' in requestBody) {
    requestBody.okrId = requestBody.keyResultId;
    delete requestBody.keyResultId;
  }
  
  // Convert dueDate from date-only string to proper DateTime format
  if (requestBody.dueDate && typeof requestBody.dueDate === 'string') {
    // Check if it's a date-only string (YYYY-MM-DD format)
    const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dateOnlyRegex.test(requestBody.dueDate)) {
      // Convert to ISO DateTime format (end of day in UTC)
      requestBody.dueDate = new Date(requestBody.dueDate + 'T23:59:59.999Z');
    } else {
      // Try to parse as Date object
      const parsedDate = new Date(requestBody.dueDate);
      if (isNaN(parsedDate.getTime())) {
        // Invalid date format, remove it
        delete requestBody.dueDate;
      } else {
        requestBody.dueDate = parsedDate;
      }
    }
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

const createBulkTasks = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const bulkData: BulkTaskRequest = req.body;
    
    // Validate required fields
    if (!bulkData.tasks || !Array.isArray(bulkData.tasks) || bulkData.tasks.length === 0) {
      return res.status(400).json({ message: "Tasks array is required and must not be empty" });
    }

    // Validate each task in the array
    for (let i = 0; i < bulkData.tasks.length; i++) {
      const task = bulkData.tasks[i];
      if (!task || !task.title || !task.category || typeof task.duration !== 'number' || !task.priority) {
        return res.status(400).json({ 
          message: `Task ${i + 1} is missing required fields: title, category, duration, and priority are required` 
        });
      }

      // Validate duration is positive
      if (task.duration <= 0) {
        return res.status(400).json({ 
          message: `Task ${i + 1} duration must be a positive number` 
        });
      }
    }

    // Validate optional IDs if provided
    if (bulkData.projectId && (typeof bulkData.projectId !== 'number' || bulkData.projectId <= 0)) {
      return res.status(400).json({ message: "projectId must be a positive number" });
    }
    if (bulkData.objectiveId && (typeof bulkData.objectiveId !== 'number' || bulkData.objectiveId <= 0)) {
      return res.status(400).json({ message: "objectiveId must be a positive number" });
    }
    if (bulkData.okrId && (typeof bulkData.okrId !== 'number' || bulkData.okrId <= 0)) {
      return res.status(400).json({ message: "okrId must be a positive number" });
    }

    const result = await taskService.createBulkTasks(bulkData, req.user.userId);
    
    res.status(201).json(result);
  } catch (error: any) {
    console.error("Error in createBulkTasks controller:", error);
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

const getAllTasksWithoutPagination = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const filters: any = {
      userId: req.user.userId,
      ...(req.query.completed !== undefined && { completed: req.query.completed === 'true' }),
      ...(req.query.priority && { priority: req.query.priority as string }),
      ...(req.query.category && { category: req.query.category as string }),
      ...(req.query.importance !== undefined && { importance: req.query.importance === 'true' }),
      ...(req.query.urgency !== undefined && { urgency: req.query.urgency === 'true' }),
      ...(req.query.projectId && { projectId: parseInt(req.query.projectId as string) }),
      ...(req.query.objectiveId && { objectiveId: parseInt(req.query.objectiveId as string) }),
      ...(req.query.okrId && { okrId: parseInt(req.query.okrId as string) }),
    };

    const sortBy = req.query.sortBy as string || 'createdAt';
    const sortOrder = req.query.sortOrder as 'asc' | 'desc' || 'desc';

    const result = await taskService.getAllTasksWithoutPagination(req.user.userId, filters, sortBy, sortOrder);
    
    res.json({
      message: "All tasks retrieved successfully",
      data: result,
      total: result.length,
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

const getArchivedTasks = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const queryParams: TaskQueryParams = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
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

    const result = await taskService.getArchivedTasks(req.user.userId, queryParams);
    
    res.json({
      message: "Archived tasks retrieved successfully",
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

const restoreTask = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const taskId = parseInt(req.params.id!);
    if (isNaN(taskId)) {
      return res.status(400).json({ message: "Invalid task ID" });
    }

    const task = await taskService.restoreTask(taskId, req.user.userId);
    
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json({
      message: "Task restored successfully",
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

const batchUpdateTasks = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: "User not authenticated" });
    }

    const batchData: BatchUpdateTaskRequest = req.body;
    
    // Validate required fields
    if (!batchData.tasks || !Array.isArray(batchData.tasks) || batchData.tasks.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: "Tasks array is required and must not be empty" 
      });
    }

    // Validate each task in the array
    for (let i = 0; i < batchData.tasks.length; i++) {
      const task = batchData.tasks[i];
      if (!task || !task.id || typeof task.id !== 'number') {
        return res.status(400).json({ 
          success: false,
          error: `Task ${i + 1} is missing required field: id` 
        });
      }
    }

    const result = await taskService.batchUpdateTasks(batchData, req.user.userId);
    
    res.json(result);
  } catch (error: any) {
    console.error("Error in batchUpdateTasks controller:", error);
    res.status(400).json({ 
      success: false,
      error: error.message || "Failed to batch update tasks" 
    });
  }
};

export {
  createTask,
  createBulkTasks,
  getAllTasks,
  getAllTasksWithoutPagination,
  getTasksByProject,
  getTasksByObjective,
  getTasksByOkr,
  getTask,
  updateTask,
  deleteTask,
  updateTaskPositions,
  toggleTaskCompletion,
  getArchivedTasks,
  restoreTask,
  getTaskStats,
  batchUpdateTasks,
};
