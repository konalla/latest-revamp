import type { Request, Response } from "express";
import * as projectService from "../services/project.service.js";
import type { CreateProjectRequest, UpdateProjectRequest, ProjectQueryParams } from "../types/project.types.js";
import type { OkrQueryParams } from "../types/okr.types.js";

const createProject = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const projectData: CreateProjectRequest = req.body;
    const project = await projectService.createProject(projectData, req.user.userId);
    
    res.status(201).json({
      message: "Project created successfully",
      project,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getProjects = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const queryParams: ProjectQueryParams = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      status: req.query.status as string,
      visibility: req.query.visibility as string,
      search: req.query.search as string,
    };

    const result = await projectService.getAllProjectsByUser(req.user.userId, queryParams);
    
    res.json({
      message: "Projects retrieved successfully",
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

const getProject = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const projectId = parseInt(req.params.id!);
    if (isNaN(projectId)) {
      return res.status(400).json({ message: "Invalid project ID" });
    }

    const project = await projectService.getProjectById(projectId, req.user.userId);
    
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json({
      message: "Project retrieved successfully",
      project,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const updateProject = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const projectId = parseInt(req.params.id!);
    if (isNaN(projectId)) {
      return res.status(400).json({ message: "Invalid project ID" });
    }

    const updateData: UpdateProjectRequest = req.body;
    const project = await projectService.updateProject(projectId, req.user.userId, updateData);
    
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json({
      message: "Project updated successfully",
      project,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const deleteProject = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const projectId = parseInt(req.params.id!);
    if (isNaN(projectId)) {
      return res.status(400).json({ message: "Invalid project ID" });
    }

    const result = await projectService.deleteProject(projectId, req.user.userId);
    
    if (!result) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json({ message: "Project deleted successfully" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getProjectStats = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const stats = await projectService.getProjectStats(req.user.userId);
    
    res.json({
      message: "Project statistics retrieved successfully",
      stats,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getProjectTasks = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const projectId = parseInt(req.params.id!);
    if (isNaN(projectId)) {
      return res.status(400).json({ message: "Invalid project ID" });
    }

    const tasks = await projectService.getProjectTasks(projectId, req.user.userId);
    
    if (tasks === null) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json({
      message: "Project tasks retrieved successfully",
      tasks,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getProjectObjectives = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const projectId = parseInt(req.params.id!);
    if (isNaN(projectId)) {
      return res.status(400).json({ message: "Invalid project ID" });
    }

    const objectives = await projectService.getProjectObjectives(projectId, req.user.userId);
    
    if (objectives === null) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json({
      message: "Project objectives retrieved successfully",
      objectives,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getProjectKeyResults = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const projectId = parseInt(req.params.id!);
    if (isNaN(projectId)) {
      return res.status(400).json({ message: "Invalid project ID" });
    }

    const queryParams: OkrQueryParams = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      ...(req.query.status && { status: req.query.status as string }),
      ...(req.query.search && { search: req.query.search as string }),
      ...(req.query.sortBy && { sortBy: req.query.sortBy as 'title' | 'createdAt' | 'startDate' | 'endDate' | 'currentValue' | 'position' }),
      ...(req.query.sortOrder && { sortOrder: req.query.sortOrder as 'asc' | 'desc' }),
    };

    const result = await projectService.getProjectKeyResults(projectId, req.user.userId, queryParams);
    
    if (result === null) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json({
      message: "Project key results retrieved successfully",
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

export {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
  getProjectStats,
  getProjectTasks,
  getProjectObjectives,
  getProjectKeyResults,
};
