import type { Request, Response } from "express";
import {
  createProjectInWorkspace,
  updateProjectInWorkspace,
  deleteProjectInWorkspace,
  createObjectiveInWorkspace,
  updateObjectiveInWorkspace,
  deleteObjectiveInWorkspace,
  createOkrInWorkspace,
  updateOkrInWorkspace,
  deleteOkrInWorkspace,
  createTaskInWorkspace,
  updateTaskInWorkspace,
  deleteTaskInWorkspace,
  toggleTaskInWorkspace,
  getTaskWithRecommendation,
} from "../services/workspace-content-crud.service.js";

const getWorkspaceId = (req: Request): number | null => {
  const id = parseInt(req.params.workspaceId || "");
  return isNaN(id) ? null : id;
};

const getItemId = (req: Request): number | null => {
  const id = parseInt(req.params.itemId || "");
  return isNaN(id) ? null : id;
};

const getUserId = (req: Request): number | null => {
  return req.user?.id ?? req.user?.userId ?? null;
};

function handleError(res: Response, error: any) {
  const msg = error.message || "Internal server error";
  if (msg.includes("Access denied")) return res.status(403).json({ message: msg });
  if (msg.includes("not found")) return res.status(404).json({ message: msg });
  if (msg.includes("Subscription limit")) return res.status(402).json({ message: msg });
  return res.status(400).json({ message: msg });
}

// ===== PROJECTS =====

export const wsCreateProject = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });

    const { teamId, ...data } = req.body;
    const result = await createProjectInWorkspace(workspaceId, teamId ?? null, userId, data);
    res.status(201).json({ message: "Project created", data: result });
  } catch (error: any) {
    handleError(res, error);
  }
};

export const wsUpdateProject = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    const projectId = getItemId(req);
    if (!projectId) return res.status(400).json({ message: "Invalid project ID" });

    const result = await updateProjectInWorkspace(workspaceId, projectId, userId, req.body);
    res.json({ message: "Project updated", data: result });
  } catch (error: any) {
    handleError(res, error);
  }
};

export const wsDeleteProject = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    const projectId = getItemId(req);
    if (!projectId) return res.status(400).json({ message: "Invalid project ID" });

    await deleteProjectInWorkspace(workspaceId, projectId, userId);
    res.json({ message: "Project deleted" });
  } catch (error: any) {
    handleError(res, error);
  }
};

// ===== OBJECTIVES =====

export const wsCreateObjective = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });

    const { teamId, ...data } = req.body;
    const result = await createObjectiveInWorkspace(workspaceId, teamId ?? null, userId, data);
    res.status(201).json({ message: "Objective created", data: result });
  } catch (error: any) {
    handleError(res, error);
  }
};

export const wsUpdateObjective = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    const objectiveId = getItemId(req);
    if (!objectiveId) return res.status(400).json({ message: "Invalid objective ID" });

    const result = await updateObjectiveInWorkspace(workspaceId, objectiveId, userId, req.body);
    res.json({ message: "Objective updated", data: result });
  } catch (error: any) {
    handleError(res, error);
  }
};

export const wsDeleteObjective = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    const objectiveId = getItemId(req);
    if (!objectiveId) return res.status(400).json({ message: "Invalid objective ID" });

    await deleteObjectiveInWorkspace(workspaceId, objectiveId, userId);
    res.json({ message: "Objective deleted" });
  } catch (error: any) {
    handleError(res, error);
  }
};

// ===== OKRs =====

export const wsCreateOkr = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });

    const { teamId, ...data } = req.body;
    const result = await createOkrInWorkspace(workspaceId, teamId ?? null, userId, data);
    res.status(201).json({ message: "OKR created", data: result });
  } catch (error: any) {
    handleError(res, error);
  }
};

export const wsUpdateOkr = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    const okrId = getItemId(req);
    if (!okrId) return res.status(400).json({ message: "Invalid OKR ID" });

    const result = await updateOkrInWorkspace(workspaceId, okrId, userId, req.body);
    res.json({ message: "OKR updated", data: result });
  } catch (error: any) {
    handleError(res, error);
  }
};

export const wsDeleteOkr = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    const okrId = getItemId(req);
    if (!okrId) return res.status(400).json({ message: "Invalid OKR ID" });

    await deleteOkrInWorkspace(workspaceId, okrId, userId);
    res.json({ message: "OKR deleted" });
  } catch (error: any) {
    handleError(res, error);
  }
};

// ===== TASKS =====

export const wsCreateTask = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });

    const { teamId, ...data } = req.body;
    const result = await createTaskInWorkspace(workspaceId, teamId ?? null, userId, data);
    res.status(201).json({ message: "Task created", data: result });
  } catch (error: any) {
    handleError(res, error);
  }
};

export const wsUpdateTask = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    const taskId = getItemId(req);
    if (!taskId) return res.status(400).json({ message: "Invalid task ID" });

    const result = await updateTaskInWorkspace(workspaceId, taskId, userId, req.body);
    res.json({ message: "Task updated", data: result });
  } catch (error: any) {
    handleError(res, error);
  }
};

export const wsToggleTask = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    const taskId = getItemId(req);
    if (!taskId) return res.status(400).json({ message: "Invalid task ID" });

    const result = await toggleTaskInWorkspace(workspaceId, taskId, userId);
    res.json({ message: "Task toggled", data: result });
  } catch (error: any) {
    handleError(res, error);
  }
};

export const wsDeleteTask = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    const taskId = getItemId(req);
    if (!taskId) return res.status(400).json({ message: "Invalid task ID" });

    await deleteTaskInWorkspace(workspaceId, taskId, userId);
    res.json({ message: "Task deleted" });
  } catch (error: any) {
    handleError(res, error);
  }
};

export const wsGetTaskWithRec = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(400).json({ message: "Invalid workspace ID" });
    const taskId = getItemId(req);
    if (!taskId) return res.status(400).json({ message: "Invalid task ID" });

    const result = await getTaskWithRecommendation(workspaceId, taskId, userId);
    res.json({ message: "Task with recommendation", data: result });
  } catch (error: any) {
    handleError(res, error);
  }
};
