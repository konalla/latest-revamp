import type { Request, Response } from "express";
import * as userService from "../services/user.service";

const createUser = async (req: Request, res: Response) => {
  try {
    const user = await userService.createUser(req.body);
    res.status(201).json(user);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getUsers = async (req: Request, res: Response) => {
  const users = await userService.getAllUsers();
  res.json(users);
};

const getUser = async (req: Request, res: Response) => {
  const user = await userService.getUserById(parseInt(req.params.id!));
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
};

const updateUser = async (req: Request, res: Response) => {
  try {
    const user = await userService.updateUser(parseInt(req.params.id!), req.body);
    res.json(user);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const deleteUser = async (req: Request, res: Response) => {
  try {
    await userService.deleteUser(parseInt(req.params.id!));
    res.json({ message: "User deleted successfully" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getCurrentUser = async (req: Request, res: Response) => {
  try {
    // req.user is available from JWT middleware
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    
    const user = await userService.getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Don't return password
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  getCurrentUser,
};