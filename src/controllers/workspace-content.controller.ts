import type { Request, Response } from "express";
import {
  getWorkspaceProjects,
  getWorkspaceObjectives,
  getWorkspaceOkrs,
  getWorkspaceTasks,
  getWorkspaceContentSummary,
} from "../services/workspace-content.service.js";

const parseWorkspaceId = (req: Request): number | null => {
  const id = parseInt(req.params.workspaceId!);
  return isNaN(id) ? null : id;
};

const getUserId = (req: Request): number | null => {
  return req.user?.id ?? req.user?.userId ?? null;
};

const parseOptionalInt = (val: unknown): number | undefined => {
  if (val === undefined || val === null || val === "") return undefined;
  const parsed = parseInt(val as string);
  return isNaN(parsed) ? undefined : parsed;
};

const parseQueryParams = (req: Request) => ({
  page: req.query.page ? parseInt(req.query.page as string) : 1,
  limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
  search: req.query.search as string | undefined,
  status: req.query.status as string | undefined,
  teamId: parseOptionalInt(req.query.teamId),
  projectId: parseOptionalInt(req.query.projectId),
  objectiveId: parseOptionalInt(req.query.objectiveId),
  okrId: parseOptionalInt(req.query.okrId),
});

export const getWorkspaceProjectsController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const workspaceId = parseWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });

    const queryParams = parseQueryParams(req);
    const result = await getWorkspaceProjects(workspaceId, userId, queryParams);

    res.json({
      message: "Workspace projects retrieved successfully",
      data: result,
      pagination: {
        page: queryParams.page,
        limit: queryParams.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / queryParams.limit),
      },
    });
  } catch (error: any) {
    const status = error.message.includes("Access denied") ? 403 : 400;
    res.status(status).json({ message: error.message });
  }
};

export const getWorkspaceObjectivesController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const workspaceId = parseWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });

    const queryParams = parseQueryParams(req);
    const result = await getWorkspaceObjectives(workspaceId, userId, queryParams);

    res.json({
      message: "Workspace objectives retrieved successfully",
      data: result,
      pagination: {
        page: queryParams.page,
        limit: queryParams.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / queryParams.limit),
      },
    });
  } catch (error: any) {
    const status = error.message.includes("Access denied") ? 403 : 400;
    res.status(status).json({ message: error.message });
  }
};

export const getWorkspaceOkrsController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const workspaceId = parseWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });

    const queryParams = parseQueryParams(req);
    const result = await getWorkspaceOkrs(workspaceId, userId, queryParams);

    res.json({
      message: "Workspace OKRs retrieved successfully",
      data: result,
      pagination: {
        page: queryParams.page,
        limit: queryParams.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / queryParams.limit),
      },
    });
  } catch (error: any) {
    const status = error.message.includes("Access denied") ? 403 : 400;
    res.status(status).json({ message: error.message });
  }
};

export const getWorkspaceTasksController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const workspaceId = parseWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });

    const queryParams = {
      ...parseQueryParams(req),
      completed: req.query.completed !== undefined
        ? req.query.completed === "true"
        : undefined,
      priority: req.query.priority as string | undefined,
    };

    const result = await getWorkspaceTasks(workspaceId, userId, queryParams);

    res.json({
      message: "Workspace tasks retrieved successfully",
      data: result,
      pagination: {
        page: queryParams.page,
        limit: queryParams.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / queryParams.limit),
      },
    });
  } catch (error: any) {
    const status = error.message.includes("Access denied") ? 403 : 400;
    res.status(status).json({ message: error.message });
  }
};

export const getWorkspaceContentSummaryController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const workspaceId = parseWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });

    const summary = await getWorkspaceContentSummary(workspaceId, userId);

    res.json({
      message: "Workspace content summary retrieved successfully",
      data: summary,
    });
  } catch (error: any) {
    const status = error.message.includes("Access denied") ? 403 : 400;
    res.status(status).json({ message: error.message });
  }
};
