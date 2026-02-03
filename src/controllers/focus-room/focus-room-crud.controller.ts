import type { Request, Response } from "express";
import { focusRoomService } from "../../services/focus-room.service.js";
import { focusRoomSessionService } from "../../services/focus-room-session.service.js";
import { recurringScheduleService } from "../../services/recurring-schedule.service.js";
import { createRoomSchema, updateRoomSchema } from "../../types/focus-room.types.js";

/**
 * Focus Room CRUD Controller
 * Handles room creation, retrieval, update, and deletion operations
 */

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
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid room data",
        details: (error as unknown as { errors: unknown }).errors,
      });
      return;
    }

    console.error("Error creating room:", error);
    const message = error instanceof Error ? error.message : "Failed to create room";
    res.status(500).json({
      success: false,
      error: message,
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
        participantCount: "_count" in room && typeof room._count === "object" && room._count !== null && "participants" in room._count ? (room._count as { participants: number }).participants : 0,
        createdAt: room.createdAt,
        creator: room.creator,
      })),
    });
  } catch (error: unknown) {
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid room data",
        details: (error as unknown as { errors: unknown }).errors,
      });
      return;
    }

    console.error("Error updating room:", error);
    const message = error instanceof Error ? error.message : "Failed to update room";
    res.status(500).json({
      success: false,
      error: message,
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
  } catch (error: unknown) {
    console.error("Error deleting room:", error);
    const message = error instanceof Error ? error.message : "Failed to delete room";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

