import type { Request, Response } from "express";
import { focusRoomService } from "../services/focus-room.service.js";
import { focusRoomSessionService } from "../services/focus-room-session.service.js";
import { focusRoomParticipantService } from "../services/focus-room-participant.service.js";
import { focusRoomInvitationService } from "../services/focus-room-invitation.service.js";
import { focusRoomTemplateService } from "../services/focus-room-template.service.js";
import {
  createRoomSchema,
  updateRoomSchema,
  startSessionSchema,
  joinRoomSchema,
  updateParticipantIntentionSchema,
  updateParticipantCompletionSchema,
  updateParticipantStatusSchema,
  createInvitationSchema,
  acceptInvitationSchema,
  createTemplateSchema,
  createRoomFromTemplateSchema,
  scheduleSessionSchema,
  updateRecurringScheduleSchema,
  cancelRecurringScheduleSchema,
} from "../types/focus-room.types.js";
import { recurringScheduleService } from "../services/recurring-schedule.service.js";

// Room Management
export const createRoom = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const validatedData = createRoomSchema.parse(req.body);
    const room = await focusRoomService.createRoom(userId, validatedData);

    res.status(201).json({
      success: true,
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        visibility: room.visibility,
        focusDuration: room.focusDuration,
        breakDuration: room.breakDuration,
        allowObservers: room.allowObservers,
        requiresPassword: room.requiresPassword,
        createdAt: room.createdAt,
        creatorId: room.creatorId,
      },
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid room data",
        details: error.errors,
      });
      return;
    }

    console.error("Error creating room:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to create room",
    });
  }
};

export const getPublicRooms = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    const rooms = await focusRoomService.getPublicRooms(userId);

    res.json({
      success: true,
      rooms: rooms.map((room) => ({
        id: room.id,
        name: room.name,
        description: room.description,
        focusDuration: room.focusDuration,
        breakDuration: room.breakDuration,
        requiresPassword: room.requiresPassword,
        status: room.status,
        scheduledStartTime: room.scheduledStartTime,
        participantCount: room._count.participants,
        createdAt: room.createdAt,
        creator: room.creator,
      })),
    });
  } catch (error: any) {
    console.error("Error fetching public rooms:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch public rooms",
    });
  }
};

export const getMyRooms = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const [createdRooms, joinedRooms] = await Promise.all([
      focusRoomService.getRoomsByCreator(userId),
      focusRoomService.getRoomsByParticipant(userId),
    ]);

    res.json({
      success: true,
      rooms: {
        created: createdRooms.map((room) => ({
          id: room.id,
          name: room.name,
          description: room.description,
          visibility: room.visibility,
          focusDuration: room.focusDuration,
          breakDuration: room.breakDuration,
          participantCount: room._count.participants,
          sessionCount: room._count.sessions,
          createdAt: room.createdAt,
        })),
        joined: joinedRooms.map((room) => ({
          id: room.id,
          name: room.name,
          description: room.description,
          visibility: room.visibility,
          focusDuration: room.focusDuration,
          breakDuration: room.breakDuration,
          participantCount: room._count.participants,
          sessionCount: room._count.sessions,
          createdAt: room.createdAt,
          creator: room.creator,
        })),
      },
    });
  } catch (error: any) {
    console.error("Error fetching user rooms:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch your rooms",
    });
  }
};

export const getCompletedSessionRooms = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const rooms = await focusRoomService.getCompletedSessionRooms(userId);

    res.json({
      success: true,
      rooms: rooms.map((room) => ({
        id: room.id,
        name: room.name,
        description: room.description,
        visibility: room.visibility,
        focusDuration: room.focusDuration,
        breakDuration: room.breakDuration,
        status: room.status,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        creator: room.creator,
        session: room.sessions[0] ? {
          id: room.sessions[0].id,
          startedAt: room.sessions[0].startedAt,
          endedAt: room.sessions[0].endedAt,
          scheduledDuration: room.sessions[0].scheduledDuration,
          actualDuration: room.sessions[0].actualDuration,
          status: room.sessions[0].status,
        } : null,
        participants: room.participants.map((participant) => ({
          id: participant.id,
          userId: participant.userId,
          role: participant.role,
          status: participant.status,
          intention: participant.intention,
          completion: participant.completion,
          shareCompletion: participant.shareCompletion,
          joinedAt: participant.joinedAt,
          leftAt: participant.leftAt,
          user: participant.user,
        })),
      })),
    });
  } catch (error: any) {
    console.error("Error fetching completed session rooms:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch completed session rooms",
    });
  }
};

export const getRoomById = async (req: Request, res: Response): Promise<void> => {
  try {
    const roomIdParam = req.params.roomId;
    if (!roomIdParam) {
      res.status(400).json({ success: false, error: "Room ID is required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    const userId = req.user?.id ?? req.user?.userId;

    if (isNaN(roomId)) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    const result = await focusRoomService.getRoomById(roomId, userId);

    if (!result) {
      res.status(404).json({ success: false, error: "Room not found" });
      return;
    }

    if (!result.hasAccess) {
      res.status(403).json({
        success: false,
        error: "You do not have permission to view this room",
        requiresInvitation: result.requiresInvitation,
      });
      return;
    }

    if (!result.room) {
      res.status(404).json({ success: false, error: "Room not found" });
      return;
    }

    // Get active session if exists
    const activeSession = await focusRoomSessionService.getActiveSession(roomId);
    let sessionTimer = null;
    if (activeSession) {
      sessionTimer = await focusRoomSessionService.getSessionTimer(activeSession.id);
    }

    // Calculate time until scheduled session if scheduled (one-time)
    let scheduledSessionInfo = null;
    if (result.room.scheduledStartTime && result.room.status === "scheduled") {
      const now = new Date();
      const scheduledTime = new Date(result.room.scheduledStartTime);
      const timeUntilStart = scheduledTime.getTime() - now.getTime();

      if (timeUntilStart > 0) {
        scheduledSessionInfo = {
          scheduledStartTime: result.room.scheduledStartTime,
          timeUntilStart: Math.floor(timeUntilStart / 1000), // in seconds
          isScheduled: true,
        };
      }
    }

    // Get recurring schedule if exists
    let recurringScheduleInfo = null;
    const recurringSchedule = await recurringScheduleService.getRecurringSchedule(roomId);
    if (recurringSchedule && recurringSchedule.isActive) {
      const nextOccurrences = await recurringScheduleService.getNextOccurrences(
        recurringSchedule.id,
        1
      );

      recurringScheduleInfo = {
        id: recurringSchedule.id,
        type: recurringSchedule.recurrenceType,
        daysOfWeek: recurringSchedule.daysOfWeek,
        time: recurringSchedule.time,
        timezone: recurringSchedule.timezone,
        startDate: recurringSchedule.startDate,
        isActive: recurringSchedule.isActive,
        nextOccurrence: nextOccurrences[0]?.scheduledTime || null,
      };
    }

    res.json({
      success: true,
      room: {
        id: result.room.id,
        name: result.room.name,
        description: result.room.description,
        visibility: result.room.visibility,
        focusDuration: result.room.focusDuration,
        breakDuration: result.room.breakDuration,
        allowObservers: result.room.allowObservers,
        requiresPassword: result.room.requiresPassword,
        status: result.room.status,
        createdAt: result.room.createdAt,
        creator: result.room.creator,
        participants: result.room.participants,
        participantCount: result.room._count.participants,
        isCreator: result.isCreator,
        isParticipant: result.isParticipant,
        activeSession: sessionTimer,
        scheduledSession: scheduledSessionInfo,
        recurringSchedule: recurringScheduleInfo,
      },
    });
  } catch (error: any) {
    console.error("Error fetching room:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch room",
    });
  }
};

export const updateRoom = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomIdParam = req.params.roomId;
    if (!roomIdParam) {
      res.status(400).json({ success: false, error: "Room ID is required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    if (isNaN(roomId)) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    const validatedData = updateRoomSchema.parse(req.body);
    const room = await focusRoomService.updateRoom(roomId, userId, validatedData);

    res.json({
      success: true,
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        focusDuration: room.focusDuration,
        breakDuration: room.breakDuration,
        allowObservers: room.allowObservers,
        requiresPassword: room.requiresPassword,
        updatedAt: room.updatedAt,
      },
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid room data",
        details: error.errors,
      });
      return;
    }

    console.error("Error updating room:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to update room",
    });
  }
};

export const deleteRoom = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomIdParam = req.params.roomId;
    if (!roomIdParam) {
      res.status(400).json({ success: false, error: "Room ID is required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    if (isNaN(roomId)) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    await focusRoomService.deleteRoom(roomId, userId);

    res.json({
      success: true,
      message: "Room deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting room:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to delete room",
    });
  }
};

// Session Management
export const startSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomIdParam = req.params.roomId;
    if (!roomIdParam) {
      res.status(400).json({ success: false, error: "Room ID is required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    if (isNaN(roomId)) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    const validatedData = startSessionSchema.parse(req.body);
    const session = await focusRoomSessionService.startSession(roomId, userId, validatedData);

    const timer = await focusRoomSessionService.getSessionTimer(session.id);

    // Broadcast WebSocket event
    const wsService = (global as any).focusRoomWebSocketService;
    if (wsService) {
      wsService.broadcastSessionStarted(roomId, session, timer);
    }

    res.json({
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
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid session data",
        details: error.errors,
      });
      return;
    }

    console.error("Error starting session:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to start session",
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

    const roomIdParam = req.params.roomId;
    const sessionIdParam = req.params.sessionId;
    if (!roomIdParam || !sessionIdParam) {
      res.status(400).json({ success: false, error: "Room ID and Session ID are required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    const sessionId = parseInt(sessionIdParam);

    if (isNaN(roomId) || isNaN(sessionId)) {
      res.status(400).json({ success: false, error: "Invalid room or session ID" });
      return;
    }

    const session = await focusRoomSessionService.pauseSession(roomId, sessionId, userId);
    const timer = await focusRoomSessionService.getSessionTimer(session.id);

    // Broadcast WebSocket event
    const wsService = (global as any).focusRoomWebSocketService;
    if (wsService) {
      wsService.broadcastSessionPaused(roomId, session, timer);
    }

    res.json({
      success: true,
      message: "Session paused",
      session: {
        id: session.id,
        status: session.status,
        pausedAt: session.pausedAt,
      },
      timer,
    });
  } catch (error: any) {
    console.error("Error pausing session:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to pause session",
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

    const roomIdParam = req.params.roomId;
    const sessionIdParam = req.params.sessionId;
    if (!roomIdParam || !sessionIdParam) {
      res.status(400).json({ success: false, error: "Room ID and Session ID are required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    const sessionId = parseInt(sessionIdParam);

    if (isNaN(roomId) || isNaN(sessionId)) {
      res.status(400).json({ success: false, error: "Invalid room or session ID" });
      return;
    }

    const session = await focusRoomSessionService.resumeSession(roomId, sessionId, userId);
    const timer = await focusRoomSessionService.getSessionTimer(session.id);

    // Broadcast WebSocket event
    const wsService = (global as any).focusRoomWebSocketService;
    if (wsService) {
      wsService.broadcastSessionResumed(roomId, session, timer);
    }

    res.json({
      success: true,
      message: "Session resumed",
      session: {
        id: session.id,
        status: session.status,
        resumedAt: session.resumedAt,
      },
      timer,
    });
  } catch (error: any) {
    console.error("Error resuming session:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to resume session",
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

    const roomIdParam = req.params.roomId;
    const sessionIdParam = req.params.sessionId;
    if (!roomIdParam || !sessionIdParam) {
      res.status(400).json({ success: false, error: "Room ID and Session ID are required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    const sessionId = parseInt(sessionIdParam);

    if (isNaN(roomId) || isNaN(sessionId)) {
      res.status(400).json({ success: false, error: "Invalid room or session ID" });
      return;
    }

    const session = await focusRoomSessionService.endSession(roomId, sessionId, userId);

    // Broadcast WebSocket event
    const wsService = (global as any).focusRoomWebSocketService;
    if (wsService) {
      wsService.broadcastSessionEnded(roomId, session);
    }

    res.json({
      success: true,
      message: "Session ended",
      session: {
        id: session.id,
        status: session.status,
        endedAt: session.endedAt,
        actualDuration: session.actualDuration,
      },
    });
  } catch (error: any) {
    console.error("Error ending session:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to end session",
    });
  }
};

export const getSessionTimer = async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionIdParam = req.params.sessionId;
    if (!sessionIdParam) {
      res.status(400).json({ success: false, error: "Session ID is required" });
      return;
    }
    const sessionId = parseInt(sessionIdParam);
    if (isNaN(sessionId)) {
      res.status(400).json({ success: false, error: "Invalid session ID" });
      return;
    }

    const timer = await focusRoomSessionService.getSessionTimer(sessionId);

    if (!timer) {
      res.status(404).json({ success: false, error: "Session not found" });
      return;
    }

    res.json({
      success: true,
      timer,
    });
  } catch (error: any) {
    console.error("Error fetching session timer:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch session timer",
    });
  }
};

// Participant Management
export const joinRoom = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomIdParam = req.params.roomId;
    if (!roomIdParam) {
      res.status(400).json({ success: false, error: "Room ID is required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    if (isNaN(roomId)) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    const validatedData = joinRoomSchema.parse(req.body);
    const participant = await focusRoomParticipantService.joinRoom(roomId, userId, validatedData);

    if (!participant) {
      res.status(404).json({ success: false, error: "Participant not found" });
      return;
    }

    res.json({
      success: true,
      participant: {
        id: participant.id,
        roomId: participant.roomId,
        userId: participant.userId,
        role: participant.role,
        status: participant.status,
        intention: participant.intention,
        joinedAt: participant.joinedAt,
        user: participant.user,
      },
      roomId: participant.roomId,
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid join data",
        details: error.errors,
      });
      return;
    }

    console.error("Error joining room:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to join room",
    });
  }
};

export const leaveRoom = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomIdParam = req.params.roomId;
    if (!roomIdParam) {
      res.status(400).json({ success: false, error: "Room ID is required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    if (isNaN(roomId)) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    await focusRoomParticipantService.leaveRoom(roomId, userId);

    res.json({
      success: true,
      message: "Left room successfully",
    });
  } catch (error: any) {
    console.error("Error leaving room:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to leave room",
    });
  }
};

export const getRoomParticipants = async (req: Request, res: Response): Promise<void> => {
  try {
    const roomIdParam = req.params.roomId;
    if (!roomIdParam) {
      res.status(400).json({ success: false, error: "Room ID is required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    if (isNaN(roomId)) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    const participants = await focusRoomParticipantService.getRoomParticipants(roomId);

    res.json({
      success: true,
      participants: participants.map((p) => ({
        id: p.id,
        userId: p.userId,
        role: p.role,
        status: p.status,
        intention: p.intention,
        completion: p.shareCompletion ? p.completion : null,
        joinedAt: p.joinedAt,
        user: p.user,
      })),
    });
  } catch (error: any) {
    console.error("Error fetching participants:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch participants",
    });
  }
};

export const updateIntention = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomIdParam = req.params.roomId;
    if (!roomIdParam) {
      res.status(400).json({ success: false, error: "Room ID is required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    if (isNaN(roomId)) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    const validatedData = updateParticipantIntentionSchema.parse(req.body);
    const participant = await focusRoomParticipantService.updateIntention(
      roomId,
      userId,
      validatedData
    );

    res.json({
      success: true,
      message: "Intention updated successfully",
      participant: {
        id: participant.id,
        intention: participant.intention,
        user: participant.user,
      },
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid intention data",
        details: error.errors,
      });
      return;
    }

    console.error("Error updating intention:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to update intention",
    });
  }
};

export const updateCompletion = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomIdParam = req.params.roomId;
    if (!roomIdParam) {
      res.status(400).json({ success: false, error: "Room ID is required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    if (isNaN(roomId)) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    const validatedData = updateParticipantCompletionSchema.parse(req.body);
    const participant = await focusRoomParticipantService.updateCompletion(
      roomId,
      userId,
      validatedData
    );

    res.json({
      success: true,
      message: "Completion updated successfully",
      participant: {
        id: participant.id,
        completion: participant.completion,
        shareCompletion: participant.shareCompletion,
        user: participant.user,
      },
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid completion data",
        details: error.errors,
      });
      return;
    }

    console.error("Error updating completion:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to update completion",
    });
  }
};

export const updateParticipantStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomIdParam = req.params.roomId;
    if (!roomIdParam) {
      res.status(400).json({ success: false, error: "Room ID is required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    if (isNaN(roomId)) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    const validatedData = updateParticipantStatusSchema.parse(req.body);
    const participant = await focusRoomParticipantService.updateStatus(
      roomId,
      userId,
      validatedData
    );

    res.json({
      success: true,
      message: "Status updated successfully",
      participant: {
        id: participant.id,
        status: participant.status,
        user: participant.user,
      },
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid status data",
        details: error.errors,
      });
      return;
    }

    console.error("Error updating status:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to update status",
    });
  }
};

export const removeParticipant = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomIdParam = req.params.roomId;
    const participantIdParam = req.params.participantId;
    if (!roomIdParam || !participantIdParam) {
      res.status(400).json({ success: false, error: "Room ID and Participant ID are required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    const participantId = parseInt(participantIdParam);

    if (isNaN(roomId) || isNaN(participantId)) {
      res.status(400).json({ success: false, error: "Invalid room or participant ID" });
      return;
    }

    await focusRoomParticipantService.removeParticipant(roomId, participantId, userId);

    res.json({
      success: true,
      message: "Participant removed successfully",
    });
  } catch (error: any) {
    console.error("Error removing participant:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to remove participant",
    });
  }
};

// Invitation Management
export const createInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomIdParam = req.params.roomId;
    if (!roomIdParam) {
      res.status(400).json({ success: false, error: "Room ID is required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    if (isNaN(roomId)) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    const validatedData = createInvitationSchema.parse(req.body);
    const invitation = await focusRoomInvitationService.createInvitation(
      roomId,
      userId,
      validatedData
    );

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const invitationLink = `${frontendUrl}/focus-rooms/invite/${invitation.token}`;

    res.json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.inviteeEmail,
        token: invitation.token,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        invitationLink, // Include shareable link
      },
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid invitation data",
        details: error.errors,
      });
      return;
    }

    console.error("Error creating invitation:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to create invitation",
    });
  }
};

export const getInvitationByToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.params.token;
    if (!token) {
      res.status(400).json({ success: false, error: "Token is required" });
      return;
    }
    const invitation = await focusRoomInvitationService.getInvitationByToken(token);

    if (!invitation) {
      res.status(404).json({ success: false, error: "Invalid or expired invitation token" });
      return;
    }

    res.json({
      success: true,
      invitation: {
        id: invitation.id,
        room: {
          id: invitation.room.id,
          name: invitation.room.name,
          description: invitation.room.description,
          focusDuration: invitation.room.focusDuration,
          breakDuration: invitation.room.breakDuration,
          creator: invitation.room.creator,
        },
        inviter: invitation.inviter,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error: any) {
    console.error("Error fetching invitation:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch invitation",
    });
  }
};

export const acceptInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const token = req.params.token;
    if (!token) {
      res.status(400).json({ success: false, error: "Token is required" });
      return;
    }
    const result = await focusRoomInvitationService.acceptInvitation(token, userId);

    res.json({
      success: true,
      message: "Invitation accepted successfully",
      roomId: result.roomId,
    });
  } catch (error: any) {
    console.error("Error accepting invitation:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to accept invitation",
    });
  }
};

export const declineInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const token = req.params.token;
    if (!token) {
      res.status(400).json({ success: false, error: "Token is required" });
      return;
    }
    await focusRoomInvitationService.declineInvitation(token, userId);

    res.json({
      success: true,
      message: "Invitation declined",
    });
  } catch (error: any) {
    console.error("Error declining invitation:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to decline invitation",
    });
  }
};

export const getRoomInvitations = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomIdParam = req.params.roomId;
    if (!roomIdParam) {
      res.status(400).json({ success: false, error: "Room ID is required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    if (isNaN(roomId)) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    const invitations = await focusRoomInvitationService.getRoomInvitations(roomId, userId);

    res.json({
      success: true,
      invitations: invitations.map((inv) => ({
        id: inv.id,
        email: inv.inviteeEmail,
        status: inv.status,
        expiresAt: inv.expiresAt,
        respondedAt: inv.respondedAt,
        createdAt: inv.createdAt,
        invitee: inv.invitee,
      })),
    });
  } catch (error: any) {
    console.error("Error fetching invitations:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch invitations",
    });
  }
};

export const getUserInvitations = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const invitations = await focusRoomInvitationService.getUserInvitations(userId);

    res.json({
      success: true,
      invitations: invitations.map((inv) => ({
        id: inv.id,
        room: {
          id: inv.room.id,
          name: inv.room.name,
          description: inv.room.description,
          creator: inv.room.creator,
        },
        inviter: inv.inviter,
        status: inv.status,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      })),
    });
  } catch (error: any) {
    console.error("Error fetching user invitations:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch invitations",
    });
  }
};

export const cancelInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const invitationIdParam = req.params.invitationId;
    if (!invitationIdParam) {
      res.status(400).json({ success: false, error: "Invitation ID is required" });
      return;
    }
    const invitationId = parseInt(invitationIdParam);
    if (isNaN(invitationId)) {
      res.status(400).json({ success: false, error: "Invalid invitation ID" });
      return;
    }

    await focusRoomInvitationService.cancelInvitation(invitationId, userId);

    res.json({
      success: true,
      message: "Invitation canceled successfully",
    });
  } catch (error: any) {
    console.error("Error canceling invitation:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to cancel invitation",
    });
  }
};

// Template Management
export const getSystemTemplates = async (req: Request, res: Response): Promise<void> => {
  try {
    const templates = await focusRoomTemplateService.getSystemTemplates();

    res.json({
      success: true,
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        focusDuration: t.focusDuration,
        breakDuration: t.breakDuration,
        allowObservers: t.allowObservers,
        usageCount: t.usageCount,
      })),
    });
  } catch (error: any) {
    console.error("Error fetching templates:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch templates",
    });
  }
};

export const getAllTemplates = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const templates = await focusRoomTemplateService.getAllAvailableTemplates(userId);

    res.json({
      success: true,
      templates: {
        system: templates.system.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          focusDuration: t.focusDuration,
          breakDuration: t.breakDuration,
          allowObservers: t.allowObservers,
          usageCount: t.usageCount,
        })),
        user: templates.user.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          focusDuration: t.focusDuration,
          breakDuration: t.breakDuration,
          allowObservers: t.allowObservers,
          usageCount: t.usageCount,
          createdAt: t.createdAt,
        })),
      },
    });
  } catch (error: any) {
    console.error("Error fetching templates:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch templates",
    });
  }
};

export const getTemplateById = async (req: Request, res: Response): Promise<void> => {
  try {
    const templateIdParam = req.params.templateId;
    if (!templateIdParam) {
      res.status(400).json({ success: false, error: "Template ID is required" });
      return;
    }
    const templateId = parseInt(templateIdParam);
    if (isNaN(templateId)) {
      res.status(400).json({ success: false, error: "Invalid template ID" });
      return;
    }

    const template = await focusRoomTemplateService.getTemplateById(templateId);

    if (!template) {
      res.status(404).json({ success: false, error: "Template not found" });
      return;
    }

    res.json({
      success: true,
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        focusDuration: template.focusDuration,
        breakDuration: template.breakDuration,
        allowObservers: template.allowObservers,
        visibility: template.visibility,
        usageCount: template.usageCount,
        creator: template.creator,
      },
    });
  } catch (error: any) {
    console.error("Error fetching template:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch template",
    });
  }
};

export const createTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const validatedData = createTemplateSchema.parse(req.body);
    const template = await focusRoomTemplateService.createTemplate(userId, validatedData);

    res.status(201).json({
      success: true,
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        focusDuration: template.focusDuration,
        breakDuration: template.breakDuration,
        createdAt: template.createdAt,
      },
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid template data",
        details: error.errors,
      });
      return;
    }

    console.error("Error creating template:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to create template",
    });
  }
};

export const createRoomFromTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const templateIdParam = req.params.templateId;
    if (!templateIdParam) {
      res.status(400).json({ success: false, error: "Template ID is required" });
      return;
    }
    const templateId = parseInt(templateIdParam);
    if (isNaN(templateId)) {
      res.status(400).json({ success: false, error: "Invalid template ID" });
      return;
    }

    const validatedData = createRoomFromTemplateSchema.parse(req.body);
    const room = await focusRoomTemplateService.createRoomFromTemplate(
      templateId,
      userId,
      validatedData
    );

    res.status(201).json({
      success: true,
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        visibility: room.visibility,
        focusDuration: room.focusDuration,
        breakDuration: room.breakDuration,
        createdAt: room.createdAt,
      },
      roomId: room.id,
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid room data",
        details: error.errors,
      });
      return;
    }

    console.error("Error creating room from template:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to create room from template",
    });
  }
};

// Scheduled Session Management
export const scheduleSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomIdParam = req.params.roomId;
    if (!roomIdParam) {
      res.status(400).json({ success: false, error: "Room ID is required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    if (isNaN(roomId)) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    // Validate request body
    const validatedData = scheduleSessionSchema.parse(req.body);
    const { scheduledStartTime, recurring } = validatedData;

    // Handle recurring schedule
    if (recurring) {
      // If there's an existing one-time schedule, clear it
      await focusRoomService.updateRoom(roomId, userId, {
        scheduledStartTime: null,
      });

      // Create or update recurring schedule
      const schedule = await recurringScheduleService.createOrUpdateRecurringSchedule(
        roomId,
        userId,
        recurring
      );

      // Update room status to "scheduled"
      const room = await focusRoomService.updateRoom(roomId, userId, {
        status: "scheduled",
      });

      // Calculate next occurrence
      const nextOccurrences = await recurringScheduleService.getNextOccurrences(
        schedule.id,
        1
      );

      res.json({
        success: true,
        message: "Recurring session scheduled successfully",
        room: {
          id: room.id,
          scheduledStartTime: null,
          recurringSchedule: {
            id: schedule.id,
            type: schedule.recurrenceType,
            daysOfWeek: schedule.daysOfWeek,
            time: schedule.time,
            timezone: schedule.timezone,
            startDate: schedule.startDate,
            isActive: schedule.isActive,
            nextOccurrence: nextOccurrences[0]?.scheduledTime || null,
          },
          status: room.status,
        },
      });
      return;
    }

    // Handle one-time schedule (existing logic)
    if (!scheduledStartTime) {
      res.status(400).json({ success: false, error: "Scheduled start time is required" });
      return;
    }

    // Validate date format
    const scheduledTime = new Date(scheduledStartTime);
    if (isNaN(scheduledTime.getTime())) {
      res.status(400).json({ success: false, error: "Invalid date format" });
      return;
    }

    // If there's an existing recurring schedule, deactivate it
    const existingRecurring = await recurringScheduleService.getRecurringSchedule(roomId);
    if (existingRecurring) {
      await recurringScheduleService.deactivateRecurringSchedule(roomId, userId);
    }

    // Update room with scheduled time
    const room = await focusRoomService.updateRoom(roomId, userId, {
      scheduledStartTime: scheduledStartTime,
    });

    res.json({
      success: true,
      message: "Session scheduled successfully",
      room: {
        id: room.id,
        scheduledStartTime: room.scheduledStartTime,
        recurringSchedule: null,
        status: room.status,
      },
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Validation error",
        details: error.errors,
      });
      return;
    }
    console.error("Error scheduling session:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to schedule session",
    });
  }
};

export const cancelScheduledSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomIdParam = req.params.roomId;
    if (!roomIdParam) {
      res.status(400).json({ success: false, error: "Room ID is required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    if (isNaN(roomId)) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    // Check if room has recurring schedule
    const recurringSchedule = await recurringScheduleService.getRecurringSchedule(roomId);

    if (recurringSchedule) {
      // Deactivate recurring schedule
      await recurringScheduleService.deactivateRecurringSchedule(roomId, userId);
    } else {
      // Cancel one-time scheduled session by setting scheduledStartTime to null
      await focusRoomService.updateRoom(roomId, userId, {
        scheduledStartTime: null,
      });
    }

    const room = await focusRoomService.getRoomById(roomId, userId);

    res.json({
      success: true,
      message: recurringSchedule
        ? "Recurring schedule cancelled successfully"
        : "Scheduled session cancelled successfully",
      room: {
        id: room?.room?.id,
        scheduledStartTime: room?.room?.scheduledStartTime || null,
        status: room?.room?.status,
      },
    });
  } catch (error: any) {
    console.error("Error cancelling scheduled session:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to cancel scheduled session",
    });
  }
};

// Recurring Schedule Management
export const updateRecurringSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomIdParam = req.params.roomId;
    if (!roomIdParam) {
      res.status(400).json({ success: false, error: "Room ID is required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    if (isNaN(roomId)) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    const validatedData = updateRecurringScheduleSchema.parse(req.body);

    const schedule = await recurringScheduleService.updateRecurringSchedule(
      roomId,
      userId,
      validatedData
    );

    // Calculate next occurrence
    const nextOccurrences = await recurringScheduleService.getNextOccurrences(
      schedule.id,
      1
    );

    res.json({
      success: true,
      message: "Recurring schedule updated successfully",
      recurringSchedule: {
        id: schedule.id,
        type: schedule.recurrenceType,
        daysOfWeek: schedule.daysOfWeek,
        time: schedule.time,
        timezone: schedule.timezone,
        startDate: schedule.startDate,
        isActive: schedule.isActive,
        nextOccurrence: nextOccurrences[0]?.scheduledTime || null,
      },
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Validation error",
        details: error.errors,
      });
      return;
    }
    console.error("Error updating recurring schedule:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to update recurring schedule",
    });
  }
};

export const cancelRecurringSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomIdParam = req.params.roomId;
    if (!roomIdParam) {
      res.status(400).json({ success: false, error: "Room ID is required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    if (isNaN(roomId)) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    // Handle empty body for DELETE requests - default to empty object
    const body = req.body || {};
    const validationResult = cancelRecurringScheduleSchema.safeParse(body);
    
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: "Validation error",
        details: validationResult.error.errors,
      });
      return;
    }

    const { cancelOccurrence } = validationResult.data;

    if (cancelOccurrence) {
      // Cancel specific occurrence
      const scheduledTime = new Date(cancelOccurrence);
      if (isNaN(scheduledTime.getTime())) {
        res.status(400).json({ success: false, error: "Invalid cancelOccurrence date format" });
        return;
      }

      await recurringScheduleService.cancelOccurrence(roomId, scheduledTime, userId);

      res.json({
        success: true,
        message: "Occurrence cancelled successfully",
      });
    } else {
      // Deactivate entire recurring schedule
      await recurringScheduleService.deactivateRecurringSchedule(roomId, userId);

      res.json({
        success: true,
        message: "Recurring schedule cancelled successfully",
      });
    }
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Validation error",
        details: error.errors,
      });
      return;
    }
    console.error("Error cancelling recurring schedule:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to cancel recurring schedule",
    });
  }
};

export const getUpcomingOccurrences = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomIdParam = req.params.roomId;
    if (!roomIdParam) {
      res.status(400).json({ success: false, error: "Room ID is required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    if (isNaN(roomId)) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 10;
    const maxLimit = 50;
    const safeLimit = Math.min(limit, maxLimit);

    const schedule = await recurringScheduleService.getRecurringSchedule(roomId);

    if (!schedule) {
      res.status(404).json({ success: false, error: "Recurring schedule not found" });
      return;
    }

    const occurrences = await recurringScheduleService.getNextOccurrences(
      schedule.id,
      safeLimit
    );

    res.json({
      success: true,
      occurrences: occurrences.map((occ) => ({
        scheduledTime: occ.scheduledTime.toISOString(),
        status: occ.status,
        sessionId: occ.sessionId,
      })),
    });
  } catch (error: any) {
    console.error("Error getting upcoming occurrences:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to get upcoming occurrences",
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

    const roomIdParam = req.params.roomId;
    if (!roomIdParam) {
      res.status(400).json({ success: false, error: "Room ID is required" });
      return;
    }
    const roomId = parseInt(roomIdParam);
    if (isNaN(roomId)) {
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

    const limit = parseInt(req.query.limit as string) || 20;
    const maxLimit = 100;
    const safeLimit = Math.min(limit, maxLimit);

    const sessions = await focusRoomSessionService.getSessionHistory(roomId, safeLimit);

    res.json({
      success: true,
      sessions: sessions.map((session) => ({
        id: session.id,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        scheduledDuration: session.scheduledDuration,
        actualDuration: session.actualDuration,
        status: session.status,
        participants: session.participants,
      })),
    });
  } catch (error: any) {
    console.error("Error getting room session history:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to get room session history",
    });
  }
};


