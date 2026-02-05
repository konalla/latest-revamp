import type { Request, Response } from "express";
import { focusRoomService } from "../../services/focus-room.service.js";
import { recurringScheduleService } from "../../services/recurring-schedule.service.js";
import {
  scheduleSessionSchema,
  updateRecurringScheduleSchema,
  cancelRecurringScheduleSchema,
} from "../../types/focus-room.types.js";
import type {
  ScheduleSessionResponse,
  CancelScheduledSessionResponse,
  UpdateRecurringScheduleResponse,
  CancelRecurringScheduleResponse,
  GetUpcomingOccurrencesResponse,
} from "../../types/focus-room-response.types.js";

import { parseRoomId } from "../../utils/focus-room.utils.js";

/**
 * Focus Room Scheduling Controller
 * Handles session scheduling: one-time schedules, recurring schedules, and occurrence management
 */

const getUserId = (req: Request): number | null => {
  const userId = req.user?.id ?? req.user?.userId;
  return userId ? Number(userId) : null;
};

export const scheduleSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomId = parseRoomId(req.params.roomId);
    if (roomId === null) {
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
      const nextOccurrences = await recurringScheduleService.getNextOccurrences(schedule.id, 1);

      const response: ScheduleSessionResponse = {
        success: true,
        message: "Recurring session scheduled successfully",
        room: {
          id: room.id,
          name: room.name,
          description: room.description,
          visibility: room.visibility,
          focusDuration: room.focusDuration,
          breakDuration: room.breakDuration,
          allowObservers: room.allowObservers,
          requiresPassword: room.requiresPassword,
          status: room.status,
          createdAt: room.createdAt,
          scheduledStartTime: null,
          recurringSchedule: {
            id: schedule.id,
            type: schedule.recurrenceType as "DAILY" | "WEEKLY" | "CUSTOM",
            daysOfWeek: schedule.daysOfWeek,
            time: schedule.time,
            timezone: schedule.timezone,
            startDate: schedule.startDate,
            isActive: schedule.isActive,
            nextOccurrence: nextOccurrences[0]?.scheduledTime || null,
          },
        },
      };

      res.json(response);
      return;
    }

    // Handle one-time schedule
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

    const response: ScheduleSessionResponse = {
      success: true,
      message: "Session scheduled successfully",
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        visibility: room.visibility,
        focusDuration: room.focusDuration,
        breakDuration: room.breakDuration,
        allowObservers: room.allowObservers,
        requiresPassword: room.requiresPassword,
        status: room.status,
        createdAt: room.createdAt,
        scheduledStartTime: room.scheduledStartTime,
        recurringSchedule: null,
      },
    };

    res.json(response);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Validation error",
        details: (error as unknown as { errors: unknown }).errors,
      });
      return;
    }

    console.error("Error scheduling session:", error);
    const message = error instanceof Error ? error.message : "Failed to schedule session";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const cancelScheduledSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomId = parseRoomId(req.params.roomId);
    if (roomId === null) {
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

    if (!room || !room.room) {
      res.status(404).json({ success: false, error: "Room not found" });
      return;
    }

    const response: CancelScheduledSessionResponse = {
      success: true,
      message: recurringSchedule
        ? "Recurring schedule cancelled successfully"
        : "Scheduled session cancelled successfully",
      room: {
        id: room.room.id,
        name: room.room.name,
        description: room.room.description,
        visibility: room.room.visibility,
        focusDuration: room.room.focusDuration,
        breakDuration: room.room.breakDuration,
        allowObservers: room.room.allowObservers,
        requiresPassword: room.room.requiresPassword,
        status: room.room.status,
        createdAt: room.room.createdAt,
        scheduledStartTime: room.room.scheduledStartTime,
      },
    };

    res.json(response);
  } catch (error: unknown) {
    console.error("Error cancelling scheduled session:", error);
    const message = error instanceof Error ? error.message : "Failed to cancel scheduled session";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const updateRecurringSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomId = parseRoomId(req.params.roomId);
    if (roomId === null) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    const validatedData = updateRecurringScheduleSchema.parse(req.body);
    const schedule = await recurringScheduleService.updateRecurringSchedule(roomId, userId, validatedData);

    // Calculate next occurrence
    const nextOccurrences = await recurringScheduleService.getNextOccurrences(schedule.id, 1);

    const response: UpdateRecurringScheduleResponse = {
      success: true,
      message: "Recurring schedule updated successfully",
      recurringSchedule: {
        id: schedule.id,
        type: schedule.recurrenceType as "DAILY" | "WEEKLY" | "CUSTOM",
        daysOfWeek: schedule.daysOfWeek,
        time: schedule.time,
        timezone: schedule.timezone,
        startDate: schedule.startDate,
        isActive: schedule.isActive,
        nextOccurrence: nextOccurrences[0]?.scheduledTime || null,
      },
    };

    res.json(response);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Validation error",
        details: (error as unknown as { errors: unknown }).errors,
      });
      return;
    }

    console.error("Error updating recurring schedule:", error);
    const message = error instanceof Error ? error.message : "Failed to update recurring schedule";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const cancelRecurringSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomId = parseRoomId(req.params.roomId);
    if (roomId === null) {
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

      const response: CancelRecurringScheduleResponse = {
        success: true,
        message: "Occurrence cancelled successfully",
      };

      res.json(response);
    } else {
      // Deactivate entire recurring schedule
      await recurringScheduleService.deactivateRecurringSchedule(roomId, userId);

      const response: CancelRecurringScheduleResponse = {
        success: true,
        message: "Recurring schedule cancelled successfully",
      };

      res.json(response);
    }
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Validation error",
        details: (error as unknown as { errors: unknown }).errors,
      });
      return;
    }

    console.error("Error cancelling recurring schedule:", error);
    const message = error instanceof Error ? error.message : "Failed to cancel recurring schedule";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const getUpcomingOccurrences = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomId = parseRoomId(req.params.roomId);
    if (roomId === null) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    const limit = parseInt((req.query.limit as string) || "10", 10);
    const maxLimit = 50;
    const safeLimit = Math.min(limit, maxLimit);

    const schedule = await recurringScheduleService.getRecurringSchedule(roomId);

    if (!schedule) {
      res.status(404).json({ success: false, error: "Recurring schedule not found" });
      return;
    }

    const occurrences = await recurringScheduleService.getNextOccurrences(schedule.id, safeLimit);

    const response: GetUpcomingOccurrencesResponse = {
      success: true,
      occurrences: occurrences.map((occ) => ({
        scheduledTime: occ.scheduledTime.toISOString(),
        status: occ.status,
        sessionId: occ.sessionId,
      })),
    };

    res.json(response);
  } catch (error: unknown) {
    console.error("Error getting upcoming occurrences:", error);
    const message = error instanceof Error ? error.message : "Failed to get upcoming occurrences";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

