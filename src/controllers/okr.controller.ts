import type { Request, Response } from "express";
import * as okrService from "../services/okr.service";
import type { 
  CreateOkrRequest, 
  UpdateOkrRequest, 
  UpdateOkrProgressRequest,
  OkrQueryParams 
} from "../types/okr.types";

const createOkr = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const okrData: CreateOkrRequest = req.body;
    
    // Validate required fields
    if (!okrData.title || !okrData.objectiveId || okrData.targetValue === undefined) {
      return res.status(400).json({ 
        message: "Title, objectiveId, and targetValue are required" 
      });
    }

    if (okrData.targetValue <= 0) {
      return res.status(400).json({ 
        message: "Target value must be greater than 0" 
      });
    }

    const okr = await okrService.createOkr(okrData, req.user.userId);
    
    res.status(201).json({
      message: "OKR created successfully",
      okr,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getOkrsByObjective = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const objectiveId = parseInt(req.params.objectiveId!);
    if (isNaN(objectiveId)) {
      return res.status(400).json({ message: "Invalid objective ID" });
    }

    const queryParams: OkrQueryParams = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      status: req.query.status as string,
      search: req.query.search as string,
      sortBy: req.query.sortBy as 'title' | 'createdAt' | 'startDate' | 'endDate' | 'position' | 'currentValue',
      sortOrder: req.query.sortOrder as 'asc' | 'desc',
    };

    const result = await okrService.getOkrsByObjective(objectiveId, req.user.userId, queryParams);
    
    res.json({
      message: "OKRs retrieved successfully",
      data: result,
      pagination: {
        page: queryParams.page,
        limit: queryParams.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / queryParams.limit!),
      },
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getAllOkrs = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const queryParams: OkrQueryParams = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      status: req.query.status as string,
      search: req.query.search as string,
      sortBy: req.query.sortBy as 'title' | 'createdAt' | 'startDate' | 'endDate' | 'position' | 'currentValue',
      sortOrder: req.query.sortOrder as 'asc' | 'desc',
    };

    const result = await okrService.getAllOkrsByUser(req.user.userId, queryParams);
    
    res.json({
      message: "OKRs retrieved successfully",
      data: result,
      pagination: {
        page: queryParams.page,
        limit: queryParams.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / queryParams.limit!),
      },
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getOkr = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const okrId = parseInt(req.params.id!);
    if (isNaN(okrId)) {
      return res.status(400).json({ message: "Invalid OKR ID" });
    }

    const okr = await okrService.getOkrById(okrId, req.user.userId);
    
    if (!okr) {
      return res.status(404).json({ message: "OKR not found" });
    }

    res.json({
      message: "OKR retrieved successfully",
      okr,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const updateOkr = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const okrId = parseInt(req.params.id!);
    if (isNaN(okrId)) {
      return res.status(400).json({ message: "Invalid OKR ID" });
    }

    const updateData: UpdateOkrRequest = req.body;

    // Validate target value if provided
    if (updateData.targetValue !== undefined && updateData.targetValue <= 0) {
      return res.status(400).json({ 
        message: "Target value must be greater than 0" 
      });
    }

    const okr = await okrService.updateOkr(okrId, req.user.userId, updateData);
    
    if (!okr) {
      return res.status(404).json({ message: "OKR not found" });
    }

    res.json({
      message: "OKR updated successfully",
      okr,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const updateOkrProgress = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const okrId = parseInt(req.params.id!);
    if (isNaN(okrId)) {
      return res.status(400).json({ message: "Invalid OKR ID" });
    }

    const progressData: UpdateOkrProgressRequest = req.body;
    
    // Validate required fields
    if (progressData.currentValue === undefined) {
      return res.status(400).json({ message: "Current value is required" });
    }

    if (progressData.currentValue < 0) {
      return res.status(400).json({ 
        message: "Current value must be greater than or equal to 0" 
      });
    }

    if (progressData.confidenceScore !== undefined && 
        (progressData.confidenceScore < 1 || progressData.confidenceScore > 5)) {
      return res.status(400).json({ 
        message: "Confidence score must be between 1 and 5" 
      });
    }

    const okr = await okrService.updateOkrProgress(okrId, req.user.userId, progressData);
    
    if (!okr) {
      return res.status(404).json({ message: "OKR not found" });
    }

    res.json({
      message: "OKR progress updated successfully",
      okr,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const deleteOkr = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const okrId = parseInt(req.params.id!);
    if (isNaN(okrId)) {
      return res.status(400).json({ message: "Invalid OKR ID" });
    }

    const result = await okrService.deleteOkr(okrId, req.user.userId);
    
    if (!result) {
      return res.status(404).json({ message: "OKR not found" });
    }

    res.json({ message: "OKR deleted successfully" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const updateOkrPositions = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const { positions } = req.body;
    
    if (!Array.isArray(positions)) {
      return res.status(400).json({ message: "Positions must be an array" });
    }

    // Validate positions format
    for (const pos of positions) {
      if (!pos.id || typeof pos.position !== 'number') {
        return res.status(400).json({ 
          message: "Each position item must have id and position" 
        });
      }
    }

    await okrService.updateOkrPositions(positions, req.user.userId);
    
    res.json({ message: "OKR positions updated successfully" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getOkrStats = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const objectiveId = req.query.objectiveId ? parseInt(req.query.objectiveId as string) : undefined;
    
    if (req.query.objectiveId && isNaN(objectiveId!)) {
      return res.status(400).json({ message: "Invalid objective ID" });
    }

    const stats = await okrService.getOkrStats(req.user.userId, objectiveId);
    
    res.json({
      message: "OKR statistics retrieved successfully",
      stats,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export {
  createOkr,
  getOkrsByObjective,
  getAllOkrs,
  getOkr,
  updateOkr,
  updateOkrProgress,
  deleteOkr,
  updateOkrPositions,
  getOkrStats,
};
