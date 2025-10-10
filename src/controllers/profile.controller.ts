import type { Request, Response } from "express";
import * as profileService from "../services/profile.service.js";

const updateProfileCompletion = async (req: Request, res: Response) => {
  try {
    // req.user is available from JWT middleware
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: "User not authenticated" 
      });
    }

    const result = await profileService.updateProfileCompletion(req.user.userId);
    
    res.status(200).json({
      success: true,
      profileCompletionPercentage: result.profileCompletionPercentage,
      lastProfileUpdate: result.lastProfileUpdate,
      message: "Profile completion updated successfully"
    });
  } catch (error: any) {
    res.status(400).json({ 
      success: false,
      message: error.message || "Failed to update profile completion" 
    });
  }
};

export {
  updateProfileCompletion,
};
