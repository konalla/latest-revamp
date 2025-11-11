import type { Request, Response } from "express";
import { addMember, listMembers, searchUsers, removeMember, updateMemberStatus } from "../services/team.service.js";

export const getMembers = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id as number;
    const teamId = parseInt(req.params.teamId || req.query.teamId as string);
    
    if (!teamId || isNaN(teamId)) {
      return res.status(400).json({ message: "teamId is required" });
    }
    
    const members = await listMembers(userId, teamId);
    res.status(200).json(members);
  } catch (error: any) {
    res.status(403).json({ message: error.message });
  }
};

export const searchUsersController = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id as number;
    const teamId = parseInt(req.params.teamId || req.query.teamId as string);
    const q = (req.query.q as string) ?? "";
    
    if (!teamId || isNaN(teamId)) {
      return res.status(400).json({ message: "teamId is required" });
    }
    
    if (!q || !q.trim()) return res.status(200).json([]);
    const results = await searchUsers(userId, teamId, q.trim(), 20);
    res.status(200).json(results);
  } catch (error: any) {
    res.status(403).json({ message: error.message });
  }
};

export const addMemberController = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id as number;
    const teamId = parseInt(req.params.teamId || req.body.teamId);
    const { userId: userIdToAdd } = req.body as { userId: number };
    
    if (!teamId || isNaN(teamId)) {
      return res.status(400).json({ message: "teamId is required" });
    }
    
    if (!userIdToAdd) {
      return res.status(400).json({ message: "userId required" });
    }
    
    const result = await addMember(userId, teamId, Number(userIdToAdd));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(403).json({ message: error.message });
  }
};

export const removeMemberController = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id as number;
    const teamId = parseInt(req.params.teamId);
    const { userId: userIdToRemove } = req.params as { userId: string };
    
    if (!teamId || isNaN(teamId)) {
      return res.status(400).json({ message: "teamId is required" });
    }
    
    if (!userIdToRemove) {
      return res.status(400).json({ message: "userId parameter required" });
    }
    
    const result = await removeMember(userId, teamId, Number(userIdToRemove));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(403).json({ message: error.message });
  }
};

export const updateMemberStatusController = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id as number;
    const teamId = parseInt(req.params.teamId);
    const { userId: userIdToUpdate } = req.params as { userId: string };
    const { status } = req.body as { status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "UNDER_REVIEW" };
    
    if (!teamId || isNaN(teamId)) {
      return res.status(400).json({ message: "teamId is required" });
    }
    
    if (!userIdToUpdate) {
      return res.status(400).json({ message: "userId parameter required" });
    }
    
    if (!status) {
      return res.status(400).json({ message: "status is required" });
    }
    
    const validStatuses = ["ACTIVE", "INACTIVE", "SUSPENDED", "UNDER_REVIEW"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    }
    
    const result = await updateMemberStatus(userId, teamId, Number(userIdToUpdate), status);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(403).json({ message: error.message });
  }
};


