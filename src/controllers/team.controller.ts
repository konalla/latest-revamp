import type { Request, Response } from "express";
import { addMember, listMembers, searchUsers } from "../services/team.service.js";

export const getMembers = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id as number;
    const members = await listMembers(userId);
    res.status(200).json(members);
  } catch (error: any) {
    res.status(403).json({ message: error.message });
  }
};

export const searchUsersController = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id as number;
    const q = (req.query.q as string) ?? "";
    if (!q || !q.trim()) return res.status(200).json([]);
    const results = await searchUsers(userId, q.trim(), 20);
    res.status(200).json(results);
  } catch (error: any) {
    res.status(403).json({ message: error.message });
  }
};

export const addMemberController = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id as number;
    const { userId: userIdToAdd } = req.body as { userId: number };
    if (!userIdToAdd) return res.status(400).json({ message: "userId required" });
    const result = await addMember(userId, Number(userIdToAdd));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(403).json({ message: error.message });
  }
};


