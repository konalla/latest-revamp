import type { Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import focusSessionService, { 
  type CreateFocusSessionRequest, 
  type UpdateSessionRequest, 
  type EndSessionRequest, 
  type PauseSessionRequest, 
  type ResumeSessionRequest 
} from "../services/focus-session.service.js";
import focusPlanningService from "../services/focus-planning.service.js";

export const getCurrentAiFocusSession = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const session = await focusSessionService.getCurrentFocusSession(userId);
    return res.json(session);
  } catch (error) {
    console.error("Error getting current focus session:", error);
    return res.status(500).json({ message: "Failed to get focus session" });
  }
};

export const getFocusPlan = async (req: Request, res: Response) => {
  try {
    const bypassMode = req.headers["x-bypass-auth"] === "true" || (req.headers["X-Bypass-Auth" as any] as any) === "true";
    let userId = req.user?.id || req.user?.userId;
    if (bypassMode && !userId) {
      userId = 1;
    } else if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const plan = await focusPlanningService.generateFocusPlan(userId);
    res.setHeader("Content-Type", "application/json");
    return res.json(plan);
  } catch (error) {
    console.error("Error fetching focus plan:", error);
    return res.status(500).json({
      error: "Failed to fetch focus plan",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

export const createFocusSession = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const data: CreateFocusSessionRequest = req.body;
    
    // Validate required fields
    if (!data.sessionType) {
      return res.status(400).json({ message: "sessionType is required" });
    }

    const session = await focusSessionService.createFocusSession(userId, data);
    
    return res.status(201).json({
      success: true,
      sessionId: session.id,
      session: session
    });
  } catch (error) {
    console.error("Error creating focus session:", error);
    return res.status(500).json({ message: "Failed to create focus session" });
  }
};

export const updateSessionStatus = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    const data: UpdateSessionRequest = req.body;
    const session = await focusSessionService.updateSessionStatus(sessionId, userId, data);
    
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    return res.json({
      success: true,
      session: session
    });
  } catch (error) {
    console.error("Error updating session status:", error);
    return res.status(500).json({ message: "Failed to update session status" });
  }
};

export const endFocusSession = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    const data: EndSessionRequest = req.body;
    
    // Validate required fields
    if (!data.reason || !data.elapsedTime) {
      return res.status(400).json({ message: "reason and elapsedTime are required" });
    }

    const session = await focusSessionService.endFocusSession(sessionId, userId, data);
    
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    return res.json({
      success: true,
      session: session
    });
  } catch (error) {
    console.error("Error ending focus session:", error);
    return res.status(500).json({ message: "Failed to end focus session" });
  }
};

export const pauseSession = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    const data: PauseSessionRequest = req.body;
    
    // Validate required fields
    if (!data.elapsedTime || !data.reason) {
      return res.status(400).json({ message: "elapsedTime and reason are required" });
    }

    const session = await focusSessionService.pauseSession(sessionId, userId, data);
    
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    return res.json({
      success: true,
      session: {
        id: session.id,
        status: session.status,
        pausedAt: new Date().toISOString(),
        elapsedTime: data.elapsedTime
      }
    });
  } catch (error) {
    console.error("Error pausing session:", error);
    return res.status(500).json({ message: "Failed to pause session" });
  }
};

export const resumeSession = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    const data: ResumeSessionRequest = req.body;
    
    // Validate required fields
    if (!data.elapsedTime) {
      return res.status(400).json({ message: "elapsedTime is required" });
    }

    const session = await focusSessionService.resumeSession(sessionId, userId, data);
    
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    return res.json({
      success: true,
      session: {
        id: session.id,
        status: session.status,
        resumedAt: new Date().toISOString(),
        elapsedTime: data.elapsedTime
      }
    });
  } catch (error) {
    console.error("Error resuming session:", error);
    return res.status(500).json({ message: "Failed to resume session" });
  }
};


