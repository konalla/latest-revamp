import type { Request, Response } from "express";
import { ensureWorkspaceAndTeamForUser, getMyWorkspace, getMyTeam, renameWorkspace, renameTeam } from "../services/workspace.service.js";

export const bootstrapMine = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id as number;
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
    const userId = req.user!.id as number;
    const ws = await getMyWorkspace(userId);
    res.status(200).json(ws);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getMyTeamController = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id as number;
    const team = await getMyTeam(userId);
    res.status(200).json(team);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const renameMyWorkspace = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id as number;
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
    const userId = req.user!.id as number;
    const { name } = req.body as { name: string };
    if (!name || !name.trim()) return res.status(400).json({ message: "Name required" });
    const team = await renameTeam(userId, name.trim());
    res.status(200).json(team);
  } catch (error: any) {
    res.status(403).json({ message: error.message });
  }
};


