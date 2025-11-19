import type { Request, Response } from "express";
import { 
  ensureWorkspaceAndTeamForUser, 
  getMyWorkspace, 
  getAllWorkspaces,
  getWorkspaceById,
  getMyTeam, 
  renameWorkspace, 
  renameTeam, 
  createWorkspaceAndTeam,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  assignWorkspaceManager,
  removeWorkspaceManager,
  getWorkspaceManagers
} from "../services/workspace.service.js";
import { createTeam, updateTeam, deleteTeam, getTeamsInWorkspace } from "../services/team.service.js";

export const bootstrapMine = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const name = (req.user as any)?.name ?? "";
    const username = (req.user as any)?.username ?? "";
    const ws = await ensureWorkspaceAndTeamForUser(userId, name, username);
    res.status(200).json(ws);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getMine = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const ws = await getMyWorkspace(userId);
    res.status(200).json(ws);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Get all workspaces owned by user
export const getAllWorkspacesController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const workspaces = await getAllWorkspaces(userId);
    res.status(200).json({
      workspaces,
      totalWorkspaces: workspaces.length
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Get workspace by ID
export const getWorkspaceByIdController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const workspaceIdParam = req.params.workspaceId;
    if (!workspaceIdParam) {
      return res.status(400).json({ message: "workspaceId is required" });
    }
    
    const workspaceId = parseInt(workspaceIdParam);
    if (isNaN(workspaceId)) {
      return res.status(400).json({ message: "Invalid workspace ID" });
    }

    const workspace = await getWorkspaceById(userId, workspaceId);
    res.status(200).json(workspace);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Create new workspace
export const createWorkspaceController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const { name } = req.body as { name: string };
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Workspace name is required" });
    }

    const workspace = await createWorkspace(userId, name.trim());
    res.status(201).json({
      message: "Workspace created successfully",
      workspace
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Update workspace
export const updateWorkspaceController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const workspaceIdParam = req.params.workspaceId;
    if (!workspaceIdParam) {
      return res.status(400).json({ message: "workspaceId is required" });
    }
    
    const workspaceId = parseInt(workspaceIdParam);
    if (isNaN(workspaceId)) {
      return res.status(400).json({ message: "Invalid workspace ID" });
    }

    const { name } = req.body as { name: string };
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Workspace name is required" });
    }

    const workspace = await updateWorkspace(userId, workspaceId, name.trim());
    res.status(200).json({
      message: "Workspace updated successfully",
      workspace
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Delete workspace
export const deleteWorkspaceController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const workspaceIdParam = req.params.workspaceId;
    if (!workspaceIdParam) {
      return res.status(400).json({ message: "workspaceId is required" });
    }
    
    const workspaceId = parseInt(workspaceIdParam);
    if (isNaN(workspaceId)) {
      return res.status(400).json({ message: "Invalid workspace ID" });
    }

    const result = await deleteWorkspace(userId, workspaceId);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getMyTeamController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const result = await getMyTeam(userId);
    if (!result || result.teams.length === 0) {
      return res.status(200).json({ 
        teams: [], 
        totalTeams: 0,
        adminTeams: [],
        memberTeams: []
      });
    }
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const renameMyWorkspace = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { name } = req.body as { name: string };
    if (!name || !name.trim()) return res.status(400).json({ message: "Name required" });
    const ws = await renameWorkspace(userId, name.trim());
    res.status(200).json(ws);
  } catch (error: any) {
    res.status(403).json({ message: error.message });
  }
};

export const renameMyTeam = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { name } = req.body as { name: string };
    if (!name || !name.trim()) return res.status(400).json({ message: "Name required" });
    const team = await renameTeam(userId, name.trim());
    res.status(200).json(team);
  } catch (error: any) {
    res.status(403).json({ message: error.message });
  }
};

export const createWorkspaceAndTeamController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const result = await createWorkspaceAndTeam(userId);
    res.status(result.created ? 201 : 200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Team management controllers (workspace owner only)
export const createTeamController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { name, workspaceId } = req.body as { name: string; workspaceId?: number };
    
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Team name is required" });
    }

    const workspaceIdNum = workspaceId ? parseInt(String(workspaceId)) : undefined;
    if (workspaceId && isNaN(workspaceIdNum!)) {
      return res.status(400).json({ message: "Invalid workspace ID" });
    }

    const team = await createTeam(userId, name.trim(), workspaceIdNum);
    res.status(201).json({
      message: "Team created successfully",
      team
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const updateTeamController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const teamIdParam = req.params.teamId;
    if (!teamIdParam) {
      return res.status(400).json({ message: "teamId is required" });
    }
    
    const teamId = parseInt(teamIdParam);
    if (isNaN(teamId)) {
      return res.status(400).json({ message: "Invalid team ID" });
    }

    const { name } = req.body as { name: string };
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Team name is required" });
    }

    const team = await updateTeam(userId, teamId, name.trim());
    res.status(200).json({
      message: "Team updated successfully",
      team
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteTeamController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const teamIdParam = req.params.teamId;
    if (!teamIdParam) {
      return res.status(400).json({ message: "teamId is required" });
    }
    
    const teamId = parseInt(teamIdParam);
    if (isNaN(teamId)) {
      return res.status(400).json({ message: "Invalid team ID" });
    }

    const result = await deleteTeam(userId, teamId);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getTeamsInWorkspaceController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    // Get workspaceId from query parameter if provided
    const workspaceIdParam = req.query.workspaceId as string | undefined;
    const workspaceId = workspaceIdParam ? parseInt(workspaceIdParam) : undefined;
    
    if (workspaceIdParam && isNaN(workspaceId!)) {
      return res.status(400).json({ message: "Invalid workspace ID" });
    }
    
    const teams = await getTeamsInWorkspace(userId, workspaceId);
    res.status(200).json({
      teams,
      totalTeams: teams.length
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Assign workspace manager
export const assignWorkspaceManagerController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const workspaceIdParam = req.params.workspaceId;
    if (!workspaceIdParam) {
      return res.status(400).json({ message: "workspaceId is required" });
    }
    
    const workspaceId = parseInt(workspaceIdParam);
    if (isNaN(workspaceId)) {
      return res.status(400).json({ message: "Invalid workspace ID" });
    }

    const { userId: userIdToAssign } = req.body as { userId: number };
    if (!userIdToAssign) {
      return res.status(400).json({ message: "userId is required" });
    }

    const result = await assignWorkspaceManager(userId, workspaceId, userIdToAssign);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Remove workspace manager
export const removeWorkspaceManagerController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const workspaceIdParam = req.params.workspaceId;
    if (!workspaceIdParam) {
      return res.status(400).json({ message: "workspaceId is required" });
    }
    
    const workspaceId = parseInt(workspaceIdParam);
    if (isNaN(workspaceId)) {
      return res.status(400).json({ message: "Invalid workspace ID" });
    }

    const { userId: userIdToRemove } = req.body as { userId: number };
    if (!userIdToRemove) {
      return res.status(400).json({ message: "userId is required" });
    }

    const result = await removeWorkspaceManager(userId, workspaceId, userIdToRemove);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// Get workspace managers
export const getWorkspaceManagersController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const workspaceIdParam = req.params.workspaceId;
    if (!workspaceIdParam) {
      return res.status(400).json({ message: "workspaceId is required" });
    }
    
    const workspaceId = parseInt(workspaceIdParam);
    if (isNaN(workspaceId)) {
      return res.status(400).json({ message: "Invalid workspace ID" });
    }

    const managers = await getWorkspaceManagers(userId, workspaceId);
    res.status(200).json({
      managers,
      totalManagers: managers.length
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};


