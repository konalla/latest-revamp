import type { Request, Response } from "express";
import { focusRoomSessionService } from "../../services/focus-room-session.service.js";
import { focusRoomService } from "../../services/focus-room.service.js";
import { startSessionSchema } from "../../types/focus-room.types.js";
import type {
  StartSessionResponse,
  PauseSessionResponse,
  ResumeSessionResponse,
  EndSessionResponse,
  GetSessionTimerResponse,
  GetSessionHistoryResponse,
} from "../../types/focus-room-response.types.js";
import type {
  WebSocketSessionPayload,
  WebSocketTimerPayload,
} from "../../types/focus-room-service.types.js";
import { parseRoomId, parseSessionId } from "../../utils/focus-room.utils.js";
import "../../types/global.types.js"; // Load global type definitions

/**
 * Focus Room Sessions Controller
 * Handles session lifecycle: start, pause, resume, end, and timer management
 */

const getWebSocketService = () => {
  return global.focusRoomWebSocketService || null;
};

export const startSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomId = parseRoomId(req.params.roomId);
    if (roomId === null) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    const validatedData = startSessionSchema.parse(req.body);
    const session = await focusRoomSessionService.startSession(roomId, userId, validatedData);
    const timer = await focusRoomSessionService.getSessionTimer(session.id);

    if (!timer) {
      res.status(500).json({ success: false, error: "Failed to get session timer" });
      return;
    }

    // Broadcast WebSocket event
    const wsService = getWebSocketService();
    if (wsService && timer) {
      wsService.broadcastSessionStarted(roomId, {
        id: session.id,
        roomId: session.roomId,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        pausedAt: session.pausedAt,
        resumedAt: session.resumedAt,
        scheduledDuration: session.scheduledDuration,
        actualDuration: session.actualDuration,
        status: session.status,
      } as WebSocketSessionPayload, timer as WebSocketTimerPayload);
    }

    const response: StartSessionResponse = {
      success: true,
      message: "Session started",
      session: {
        id: session.id,
        roomId: session.roomId,
        startedAt: session.startedAt,
        scheduledDuration: session.scheduledDuration,
        status: session.status,
      },
      timer,
    };

    res.json(response);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid session data",
        details: (error as unknown as { errors: unknown }).errors,
      });
      return;
    }

    console.error("Error starting session:", error);
    const message = error instanceof Error ? error.message : "Failed to start session";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const pauseSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomId = parseRoomId(req.params.roomId);
    const sessionId = parseSessionId(req.params.sessionId);

    if (roomId === null || sessionId === null) {
      res.status(400).json({ success: false, error: "Invalid room or session ID" });
      return;
    }

    const session = await focusRoomSessionService.pauseSession(roomId, sessionId, userId);
    const timer = await focusRoomSessionService.getSessionTimer(session.id);

    // Broadcast WebSocket event
    const wsService = getWebSocketService();
    if (wsService && timer) {
      wsService.broadcastSessionPaused(roomId, {
        id: session.id,
        roomId: session.roomId,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        pausedAt: session.pausedAt,
        resumedAt: session.resumedAt,
        scheduledDuration: session.scheduledDuration,
        actualDuration: session.actualDuration,
        status: session.status,
      } as WebSocketSessionPayload, timer as WebSocketTimerPayload);
    }

    if (!timer) {
      res.status(500).json({ success: false, error: "Failed to get session timer" });
      return;
    }

    const response: PauseSessionResponse = {
      success: true,
      message: "Session paused",
      session: {
        id: session.id,
        roomId: session.roomId,
        startedAt: session.startedAt,
        scheduledDuration: session.scheduledDuration,
        status: session.status,
        pausedAt: session.pausedAt,
      },
      timer,
    };

    res.json(response);
  } catch (error: unknown) {
    console.error("Error pausing session:", error);
    const message = error instanceof Error ? error.message : "Failed to pause session";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const resumeSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomId = parseRoomId(req.params.roomId);
    const sessionId = parseSessionId(req.params.sessionId);

    if (roomId === null || sessionId === null) {
      res.status(400).json({ success: false, error: "Invalid room or session ID" });
      return;
    }

    const session = await focusRoomSessionService.resumeSession(roomId, sessionId, userId);
    const timer = await focusRoomSessionService.getSessionTimer(session.id);

    // Broadcast WebSocket event
    const wsService = getWebSocketService();
    if (wsService && timer) {
      wsService.broadcastSessionResumed(roomId, {
        id: session.id,
        roomId: session.roomId,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        pausedAt: session.pausedAt,
        resumedAt: session.resumedAt,
        scheduledDuration: session.scheduledDuration,
        actualDuration: session.actualDuration,
        status: session.status,
      } as WebSocketSessionPayload, timer as WebSocketTimerPayload);
    }

    if (!timer) {
      res.status(500).json({ success: false, error: "Failed to get session timer" });
      return;
    }

    const response: ResumeSessionResponse = {
      success: true,
      message: "Session resumed",
      session: {
        id: session.id,
        roomId: session.roomId,
        startedAt: session.startedAt,
        scheduledDuration: session.scheduledDuration,
        status: session.status,
        resumedAt: session.resumedAt,
      },
      timer,
    };

    res.json(response);
  } catch (error: unknown) {
    console.error("Error resuming session:", error);
    const message = error instanceof Error ? error.message : "Failed to resume session";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const endSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomId = parseRoomId(req.params.roomId);
    const sessionId = parseSessionId(req.params.sessionId);

    if (roomId === null || sessionId === null) {
      res.status(400).json({ success: false, error: "Invalid room or session ID" });
      return;
    }

    const session = await focusRoomSessionService.endSession(roomId, sessionId, userId);

    // Broadcast WebSocket event
    const wsService = getWebSocketService();
    if (wsService) {
      wsService.broadcastSessionEnded(roomId, {
        id: session.id,
        roomId: session.roomId,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        pausedAt: session.pausedAt,
        resumedAt: session.resumedAt,
        scheduledDuration: session.scheduledDuration,
        actualDuration: session.actualDuration,
        status: session.status,
      } as WebSocketSessionPayload);
    }

    const response: EndSessionResponse = {
      success: true,
      message: "Session ended",
      session: {
        id: session.id,
        roomId: session.roomId,
        startedAt: session.startedAt,
        scheduledDuration: session.scheduledDuration,
        status: session.status,
        endedAt: session.endedAt,
        actualDuration: session.actualDuration,
      },
    };

    res.json(response);
  } catch (error: unknown) {
    console.error("Error ending session:", error);
    const message = error instanceof Error ? error.message : "Failed to end session";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const getSessionTimer = async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = parseSessionId(req.params.sessionId);
    if (sessionId === null) {
      res.status(400).json({ success: false, error: "Invalid session ID" });
      return;
    }

    const timer = await focusRoomSessionService.getSessionTimer(sessionId);

    if (!timer) {
      res.status(404).json({ success: false, error: "Session not found" });
      return;
    }

    const response: GetSessionTimerResponse = {
      success: true,
      timer,
    };

    res.json(response);
  } catch (error: unknown) {
    console.error("Error fetching session timer:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch session timer",
    });
  }
};

export const getRoomSessionHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomId = parseRoomId(req.params.roomId);
    if (roomId === null) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    // Verify user has access to room
    const roomAccess = await focusRoomService.getRoomById(roomId, userId);
    if (!roomAccess || !roomAccess.hasAccess) {
      res.status(403).json({
        success: false,
        error: "You do not have permission to view this room's history",
      });
      return;
    }

    const limit = parseInt((req.query.limit as string) || "20", 10);
    const maxLimit = 100;
    const safeLimit = Math.min(limit, maxLimit);

    const sessions = await focusRoomSessionService.getSessionHistory(roomId, safeLimit);

    const response: GetSessionHistoryResponse = {
      success: true,
      sessions: sessions.map((session) => ({
        id: session.id,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        scheduledDuration: session.scheduledDuration,
        actualDuration: session.actualDuration,
        status: session.status,
        participants: session.participants?.map((p) => ({
          userId: p.userId,
          user: p.user ? {
            id: p.user.id,
            name: p.user.name,
            email: p.user.email,
            profilePhoto: p.user.profile_photo_url || null,
            profile_photo_url: p.user.profile_photo_url || null,
          } : undefined,
          intention: p.intention,
          completion: p.completion,
          shareCompletion: p.shareCompletion,
          role: p.role,
          joinedAt: p.joinedAt,
          leftAt: p.leftAt,
        })),
      })),
    };

    res.json(response);
  } catch (error: unknown) {
    console.error("Error getting room session history:", error);
    const message = error instanceof Error ? error.message : "Failed to get room session history";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

