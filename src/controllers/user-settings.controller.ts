import type { Request, Response } from "express";
import { getUserSettings, createUserSettings, updateUserSettings, deleteUserSettings } from "../services/user-settings.service.js";
import type { CreateUserSettingsRequest, UpdateUserSettingsRequest } from "../types/user-settings.types.js";

const getUserSettingsController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const userSettings = await getUserSettings(userId);
    
    res.json({
      success: true,
      data: userSettings
    });
  } catch (error) {
    console.error("Error getting user settings:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to get user settings" 
    });
  }
};

const createUserSettingsController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const data: CreateUserSettingsRequest = req.body;
    const userSettings = await createUserSettings(userId, data);
    
    res.status(201).json({
      success: true,
      data: userSettings
    });
  } catch (error) {
    console.error("Error creating user settings:", error);
    
    if (error instanceof Error && error.message === "User settings already exist") {
      return res.status(409).json({ 
        success: false,
        error: error.message 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: "Failed to create user settings" 
    });
  }
};

const updateUserSettingsController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const data: UpdateUserSettingsRequest = req.body;
    const userSettings = await updateUserSettings(userId, data);
    
    res.json({
      success: true,
      data: userSettings
    });
  } catch (error) {
    console.error("Error updating user settings:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to update user settings" 
    });
  }
};

const deleteUserSettingsController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    await deleteUserSettings(userId);
    
    res.json({
      success: true,
      message: "User settings deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting user settings:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to delete user settings" 
    });
  }
};

export {
  getUserSettingsController,
  createUserSettingsController,
  updateUserSettingsController,
  deleteUserSettingsController,
};
