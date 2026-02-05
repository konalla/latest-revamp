import prisma from "../config/prisma.js";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { addDays, addWeeks, startOfDay, setHours, setMinutes, isBefore, isAfter, isEqual } from "date-fns";
import type { CreateRecurringScheduleInput, UpdateRecurringScheduleInput } from "../types/focus-room.types.js";
import type {
  RecurringSchedule,
  RecurringScheduleUpdateData,
} from "../types/focus-room-service.types.js";

export class RecurringScheduleService {
  /**
   * Validate timezone is valid IANA timezone
   */
  private validateTimezone(timezone: string): boolean {
    try {
      // Try to create a date in the timezone to validate it
      const testDate = new Date();
      toZonedTime(testDate, timezone);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Normalize daysOfWeek based on recurrence type
   */
  private normalizeDaysOfWeek(
    type: "DAILY" | "WEEKLY" | "CUSTOM",
    daysOfWeek?: number[]
  ): number[] {
    if (type === "DAILY") {
      return [0, 1, 2, 3, 4, 5, 6]; // All days
    }
    if (type === "WEEKLY") {
      if (!daysOfWeek || daysOfWeek.length === 0) {
        throw new Error("daysOfWeek is required for WEEKLY recurrence type");
      }
      // For WEEKLY, use first day provided (or could be multiple)
      return daysOfWeek;
    }
    // CUSTOM
    if (!daysOfWeek || daysOfWeek.length === 0) {
      throw new Error("daysOfWeek is required for CUSTOM recurrence type");
    }
    // Sort and deduplicate
    return [...new Set(daysOfWeek)].sort((a, b) => a - b);
  }

  /**
   * Parse time string (HH:mm) and convert to Date in specified timezone, then to UTC
   */
  private parseTimeToUTC(time: string, timezone: string, date: Date): Date {
    const parts = time.split(":").map(Number);
    const hours = parts[0] ?? 0;
    const minutes = parts[1] ?? 0;
    
    // Get the date in the specified timezone
    const zonedDate = toZonedTime(date, timezone);
    
    // Set the time in the timezone
    const dateWithTime = setMinutes(setHours(startOfDay(zonedDate), hours), minutes);
    
    // Convert back to UTC
    return fromZonedTime(dateWithTime, timezone);
  }

  /**
   * Calculate next occurrence from a recurring schedule
   */
  private calculateNextOccurrence(
    schedule: {
      recurrenceType: string;
      daysOfWeek: number[];
      time: string;
      timezone: string;
      startDate: Date;
    },
    fromDate: Date = new Date()
  ): Date | null {
    try {
      // If startDate is in the future, first occurrence is startDate
      if (isAfter(schedule.startDate, fromDate)) {
        return this.parseTimeToUTC(schedule.time, schedule.timezone, schedule.startDate);
      }

      // Parse the time for today in the schedule's timezone
      const todayInTimezone = toZonedTime(fromDate, schedule.timezone);
      const todayWithTime = this.parseTimeToUTC(
        schedule.time,
        schedule.timezone,
        fromDate
      );

      // If today's time hasn't passed yet and today is a scheduled day
      const todayDayOfWeek = todayInTimezone.getDay();
      if (
        isAfter(todayWithTime, fromDate) &&
        schedule.daysOfWeek.includes(todayDayOfWeek)
      ) {
        return todayWithTime;
      }

      // Find next occurrence
      let checkDate = addDays(startOfDay(todayInTimezone), 1);
      let attempts = 0;
      const maxAttempts = 14; // Prevent infinite loop (max 2 weeks)

      while (attempts < maxAttempts) {
        const dayOfWeek = checkDate.getDay();
        
        if (schedule.daysOfWeek.includes(dayOfWeek)) {
          const occurrenceDate = this.parseTimeToUTC(
            schedule.time,
            schedule.timezone,
            fromZonedTime(checkDate, schedule.timezone)
          );
          
          // Ensure it's after startDate
          if (!isBefore(occurrenceDate, schedule.startDate)) {
            return occurrenceDate;
          }
        }
        
        checkDate = addDays(checkDate, 1);
        attempts++;
      }

      return null; // No occurrence found within reasonable time
    } catch (error) {
      console.error("Error calculating next occurrence:", error);
      return null;
    }
  }

  /**
   * Create or update recurring schedule for a room
   */
  async createOrUpdateRecurringSchedule(
    roomId: number,
    userId: number,
    data: CreateRecurringScheduleInput
  ): Promise<RecurringSchedule> {
    // Verify user is room creator
    const room = await prisma.focusRoom.findUnique({
      where: { id: roomId },
      select: { creatorId: true },
    });

    if (!room) {
      throw new Error("Room not found");
    }

    if (room.creatorId !== userId) {
      throw new Error("Only room creator can create recurring schedules");
    }

    // Validate timezone
    const timezone = data.timezone || "UTC";
    if (!this.validateTimezone(timezone)) {
      throw new Error(`Invalid timezone: ${timezone}`);
    }

    // Normalize daysOfWeek
    const daysOfWeek = this.normalizeDaysOfWeek(data.type, data.daysOfWeek);

    // Parse startDate
    const startDate = new Date(data.startDate);
    if (isNaN(startDate.getTime())) {
      throw new Error("Invalid startDate format");
    }

    // Ensure startDate is not in the past (or allow it for flexibility)
    // We'll allow past dates but calculate from today

    // Check if recurring schedule already exists
    const existing = await prisma.recurringSchedule.findUnique({
      where: { roomId },
    });

    if (existing) {
      // Update existing
      return prisma.recurringSchedule.update({
        where: { id: existing.id },
        data: {
          recurrenceType: data.type,
          daysOfWeek,
          time: data.time,
          timezone,
          startDate,
          isActive: true,
        },
      });
    } else {
      // Create new
      return prisma.recurringSchedule.create({
        data: {
          roomId,
          recurrenceType: data.type,
          daysOfWeek,
          time: data.time,
          timezone,
          startDate,
          isActive: true,
        },
      });
    }
  }

  /**
   * Update recurring schedule
   */
  async updateRecurringSchedule(
    roomId: number,
    userId: number,
    data: UpdateRecurringScheduleInput
  ): Promise<RecurringSchedule> {
    // Verify user is room creator
    const room = await prisma.focusRoom.findUnique({
      where: { id: roomId },
      select: { creatorId: true },
    });

    if (!room) {
      throw new Error("Room not found");
    }

    if (room.creatorId !== userId) {
      throw new Error("Only room creator can update recurring schedules");
    }

    const schedule = await prisma.recurringSchedule.findUnique({
      where: { roomId },
    });

    if (!schedule) {
      throw new Error("Recurring schedule not found");
    }

    // Build update data
    const updateData: RecurringScheduleUpdateData = {};

    if (data.type !== undefined) {
      updateData.recurrenceType = data.type;
    }

    if (data.daysOfWeek !== undefined || data.type !== undefined) {
      const type = data.type || schedule.recurrenceType;
      const daysOfWeek = data.daysOfWeek || schedule.daysOfWeek;
      updateData.daysOfWeek = this.normalizeDaysOfWeek(
        type as "DAILY" | "WEEKLY" | "CUSTOM",
        daysOfWeek
      );
    }

    if (data.time !== undefined) {
      updateData.time = data.time;
    }

    if (data.timezone !== undefined) {
      if (!this.validateTimezone(data.timezone)) {
        throw new Error(`Invalid timezone: ${data.timezone}`);
      }
      updateData.timezone = data.timezone;
    }

    if (data.startDate !== undefined) {
      const startDate = new Date(data.startDate);
      if (isNaN(startDate.getTime())) {
        throw new Error("Invalid startDate format");
      }
      updateData.startDate = startDate;
    }

    return prisma.recurringSchedule.update({
      where: { id: schedule.id },
      data: updateData,
    });
  }

  /**
   * Get recurring schedule for a room
   */
  async getRecurringSchedule(roomId: number): Promise<RecurringSchedule | null> {
    return prisma.recurringSchedule.findUnique({
      where: { roomId },
    });
  }

  /**
   * Deactivate recurring schedule
   */
  async deactivateRecurringSchedule(roomId: number, userId: number): Promise<RecurringSchedule> {
    // Verify user is room creator
    const room = await prisma.focusRoom.findUnique({
      where: { id: roomId },
      select: { creatorId: true },
    });

    if (!room) {
      throw new Error("Room not found");
    }

    if (room.creatorId !== userId) {
      throw new Error("Only room creator can deactivate recurring schedules");
    }

    const schedule = await prisma.recurringSchedule.findUnique({
      where: { roomId },
    });

    if (!schedule) {
      throw new Error("Recurring schedule not found");
    }

    return prisma.recurringSchedule.update({
      where: { id: schedule.id },
      data: { isActive: false },
    });
  }

  /**
   * Cancel specific occurrence by creating a skipped occurrence record
   */
  async cancelOccurrence(
    roomId: number,
    scheduledTime: Date,
    userId: number
  ): Promise<{ id: number; status: string; skipReason: string | null }> {
    // Verify user is room creator
    const room = await prisma.focusRoom.findUnique({
      where: { id: roomId },
      select: { creatorId: true },
    });

    if (!room) {
      throw new Error("Room not found");
    }

    if (room.creatorId !== userId) {
      throw new Error("Only room creator can cancel occurrences");
    }

    const schedule = await prisma.recurringSchedule.findUnique({
      where: { roomId },
    });

    if (!schedule) {
      throw new Error("Recurring schedule not found");
    }

    // Check if occurrence already exists
    const existing = await prisma.recurringSessionOccurrence.findUnique({
      where: {
        recurringScheduleId_scheduledTime: {
          recurringScheduleId: schedule.id,
          scheduledTime,
        },
      },
    });

    if (existing) {
      // Update to skipped
      return prisma.recurringSessionOccurrence.update({
        where: { id: existing.id },
        data: {
          status: "SKIPPED",
          skipReason: "MANUALLY_SKIPPED",
        },
      });
    } else {
      // Create skipped occurrence
      return prisma.recurringSessionOccurrence.create({
        data: {
          recurringScheduleId: schedule.id,
          scheduledTime,
          status: "SKIPPED",
          skipReason: "MANUALLY_SKIPPED",
        },
      });
    }
  }

  /**
   * Calculate next N occurrences from a recurring schedule
   */
  async getNextOccurrences(
    scheduleId: number,
    limit: number = 10
  ): Promise<Array<{ scheduledTime: Date; status: string; sessionId: number | null }>> {
    const schedule = await prisma.recurringSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new Error("Recurring schedule not found");
    }

    const occurrences: Array<{
      scheduledTime: Date;
      status: string;
      sessionId: number | null;
    }> = [];

    let currentDate = new Date();
    let found = 0;
    const maxAttempts = 100; // Prevent infinite loop

    while (found < limit && occurrences.length < maxAttempts) {
      const nextOccurrence = this.calculateNextOccurrence(
        {
          recurrenceType: schedule.recurrenceType,
          daysOfWeek: schedule.daysOfWeek,
          time: schedule.time,
          timezone: schedule.timezone,
          startDate: schedule.startDate,
        },
        currentDate
      );

      if (!nextOccurrence) {
        break;
      }

      // Check if occurrence already exists in database
      const existing = await prisma.recurringSessionOccurrence.findUnique({
        where: {
          recurringScheduleId_scheduledTime: {
            recurringScheduleId: schedule.id,
            scheduledTime: nextOccurrence,
          },
        },
      });

      occurrences.push({
        scheduledTime: nextOccurrence,
        status: existing?.status || "PENDING",
        sessionId: existing?.sessionId || null,
      });

      // Move to next day after this occurrence
      currentDate = addDays(nextOccurrence, 1);
      found++;
    }

    return occurrences;
  }

  /**
   * Check if a session should be created for a recurring schedule at current time
   * Returns the scheduled time if it should be created, null otherwise
   */
  async shouldCreateSession(
    scheduleId: number,
    currentTime: Date
  ): Promise<{ shouldCreate: boolean; scheduledTime: Date | null }> {
    const schedule = await prisma.recurringSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule || !schedule.isActive) {
      return { shouldCreate: false, scheduledTime: null };
    }

    // Check if startDate has passed
    if (isBefore(currentTime, schedule.startDate)) {
      return { shouldCreate: false, scheduledTime: null };
    }

    // Calculate the expected occurrence time for current time window
    // We check within a 2-minute window (1 minute before to 1 minute after)
    const windowStart = new Date(currentTime.getTime() - 60 * 1000);
    const windowEnd = new Date(currentTime.getTime() + 60 * 1000);

    // Get today's occurrence time in UTC
    const todayInTimezone = toZonedTime(currentTime, schedule.timezone);
    const todayDayOfWeek = todayInTimezone.getDay();

    // Check if today is a scheduled day
    if (!schedule.daysOfWeek.includes(todayDayOfWeek)) {
      return { shouldCreate: false, scheduledTime: null };
    }

    // Calculate today's scheduled time in UTC
    const scheduledTime = this.parseTimeToUTC(
      schedule.time,
      schedule.timezone,
      currentTime
    );

    // Check if scheduled time is within our window
    if (
      (isAfter(scheduledTime, windowStart) || isEqual(scheduledTime, windowStart)) &&
      (isBefore(scheduledTime, windowEnd) || isEqual(scheduledTime, windowEnd))
    ) {
      // Check if occurrence already exists and was created
      const existing = await prisma.recurringSessionOccurrence.findUnique({
        where: {
          recurringScheduleId_scheduledTime: {
            recurringScheduleId: schedule.id,
            scheduledTime,
          },
        },
      });

      if (existing && existing.status === "CREATED") {
        return { shouldCreate: false, scheduledTime: null };
      }

      if (existing && existing.status === "SKIPPED") {
        return { shouldCreate: false, scheduledTime: null };
      }

      return { shouldCreate: true, scheduledTime };
    }

    return { shouldCreate: false, scheduledTime: null };
  }

  /**
   * Get all active recurring schedules that should create sessions now
   */
  async getSchedulesToProcess(now: Date): Promise<
    Array<{
      id: number;
      roomId: number;
      scheduledTime: Date;
    }>
  > {
    const activeSchedules = await prisma.recurringSchedule.findMany({
      where: {
        isActive: true,
        startDate: {
          lte: now,
        },
      },
    });

    const schedulesToProcess: Array<{
      id: number;
      roomId: number;
      scheduledTime: Date;
    }> = [];

    for (const schedule of activeSchedules) {
      const { shouldCreate, scheduledTime } = await this.shouldCreateSession(
        schedule.id,
        now
      );

      if (shouldCreate && scheduledTime) {
        schedulesToProcess.push({
          id: schedule.id,
          roomId: schedule.roomId,
          scheduledTime,
        });
      }
    }

    return schedulesToProcess;
  }
}

export const recurringScheduleService = new RecurringScheduleService();

