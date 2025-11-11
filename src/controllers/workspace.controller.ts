import type { Request, Response } from "express";
import { ensureWorkspaceAndTeamForUser, getMyWorkspace, getMyTeam, renameWorkspace, renameTeam, createWorkspaceAndTeam } from "../services/workspace.service.js";
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
    const { name } = req.body as { name: string };
    
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Team name is required" });
    }

    const team = await createTeam(userId, name.trim());
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
    const teams = await getTeamsInWorkspace(userId);
    res.status(200).json({
      teams,
      totalTeams: teams.length
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};


