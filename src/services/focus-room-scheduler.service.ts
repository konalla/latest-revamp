import * as cron from "node-cron";
import prisma from "../config/prisma.js";
import { focusRoomSessionService } from "./focus-room-session.service.js";
import { FocusRoomWebSocketService } from "./focus-room-websocket.service.js";
import userStatusService from "./user-status.service.js";
import { recurringScheduleService } from "./recurring-schedule.service.js";

export class FocusRoomSchedulerService {
  private cronJob: cron.ScheduledTask | null = null;
  private wsService: FocusRoomWebSocketService | null = null;

  constructor(wsService?: FocusRoomWebSocketService) {
    this.wsService = wsService || null;
  }

  /**
   * Start the scheduler service
   * Checks every minute for scheduled sessions that need to start
   */
  start() {
    if (this.cronJob) {
      console.log("[Scheduler] Already running");
      return;
    }

    // Run every minute: * * * * *
    this.cronJob = cron.schedule("* * * * *", async () => {
      await this.checkAndStartScheduledSessions();
    });

    console.log("[Scheduler] ✅ Started - checking for scheduled sessions every minute");

    // Check immediately on startup for any missed sessions
    this.checkAndStartScheduledSessions().catch((error) => {
      console.error("[Scheduler] Error on initial check:", error);
    });
  }

  /**
   * Stop the scheduler service
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log("[Scheduler] Stopped");
    }
  }

  /**
   * Check for scheduled sessions and start them if time has arrived
   */
  private async checkAndStartScheduledSessions() {
    try {
      const now = new Date();

      // 1. Check one-time scheduled sessions (existing logic)
      const scheduledRooms = await prisma.focusRoom.findMany({
        where: {
          status: "scheduled",
          scheduledStartTime: {
            lte: now, // Scheduled time has passed or is now
          },
        },
        include: {
          sessions: {
            where: {
              status: { in: ["ACTIVE", "PAUSED"] },
            },
            take: 1,
          },
        },
      });

      if (scheduledRooms.length > 0) {
        console.log(`[Scheduler] Found ${scheduledRooms.length} one-time scheduled session(s) to start`);

        for (const room of scheduledRooms) {
          // Skip if room already has an active session
          if (room.sessions.length > 0) {
            console.log(`[Scheduler] Room ${room.id} already has an active session, skipping scheduled start`);
            continue;
          }

          try {
            await this.startScheduledSession(room.id);
          } catch (error: any) {
            console.error(`[Scheduler] Error starting scheduled session for room ${room.id}:`, error.message);
            // Continue with other rooms even if one fails
          }
        }
      }

      // 2. Check recurring schedules
      const recurringSchedules = await recurringScheduleService.getSchedulesToProcess(now);

      if (recurringSchedules.length > 0) {
        console.log(`[Scheduler] Found ${recurringSchedules.length} recurring schedule(s) to process`);

        for (const schedule of recurringSchedules) {
          try {
            // Check if room has active session
            const activeSession = await prisma.focusRoomSession.findFirst({
              where: {
                roomId: schedule.roomId,
                status: { in: ["ACTIVE", "PAUSED"] },
              },
            });

            if (activeSession) {
              // Skip this occurrence - log it
              console.log(
                `[Scheduler] Skipping recurring session for room ${schedule.roomId} - active session exists`
              );

              // Mark occurrence as skipped
              await this.markOccurrenceSkipped(schedule.id, schedule.scheduledTime, "ACTIVE_SESSION_EXISTS");
              continue;
            }

            // Create session for this occurrence
            await this.startRecurringSession(schedule.roomId, schedule.id, schedule.scheduledTime);
          } catch (error: any) {
            console.error(
              `[Scheduler] Error processing recurring schedule ${schedule.id} for room ${schedule.roomId}:`,
              error.message
            );
            // Continue with other schedules even if one fails
          }
        }
      }
    } catch (error) {
      console.error("[Scheduler] Error checking scheduled sessions:", error);
    }
  }

  /**
   * Start a scheduled session for a room
   */
  private async startScheduledSession(roomId: number) {
    console.log(`[Scheduler] Starting scheduled session for room ${roomId}`);

    // Get room details
    const room = await prisma.focusRoom.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    // Use room's focusDuration for the session
    const durationMinutes = room.focusDuration;
    const scheduledDuration = durationMinutes * 60; // Convert to seconds

    // Start the session using the existing service
    // Note: We bypass creator check since this is automated
    const session = await prisma.$transaction(async (tx) => {
      // Create session
      const newSession = await tx.focusRoomSession.create({
        data: {
          roomId,
          startedAt: new Date(),
          scheduledDuration,
          status: "ACTIVE",
        },
      });

      // Update all participants to "FOCUSING" status
      await tx.focusRoomParticipant.updateMany({
        where: {
          roomId,
          status: { not: "LEFT" },
        },
        data: {
          status: "FOCUSING",
        },
      });

      // Update room status from "scheduled" to "active"
      await tx.focusRoom.update({
        where: { id: roomId },
        data: {
          status: "active",
          scheduledStartTime: null, // Clear scheduled time after starting
        },
      });

      return newSession;
    });

    // Update all participants' user status to online
    try {
      const participants = await prisma.focusRoomParticipant.findMany({
        where: {
          roomId,
          status: { not: "LEFT" },
        },
        select: {
          userId: true,
        },
      });

      // Update each participant's user status to online
      await Promise.all(
        participants.map((participant) =>
          userStatusService.updateUserStatus(participant.userId, true).catch((error) => {
            console.error(
              `[Scheduler] Error updating user status for participant ${participant.userId}:`,
              error
            );
            // Don't throw - continue with other participants
          })
        )
      );
    } catch (error) {
      console.error("[Scheduler] Error updating participants' user status after starting session:", error);
      // Don't throw error - session creation should still succeed
    }

    // Get timer for WebSocket broadcast
    const timer = await focusRoomSessionService.getSessionTimer(session.id);

    // Broadcast session started event via WebSocket
    if (this.wsService) {
      this.wsService.broadcastSessionStarted(roomId, session, timer);
    }

    console.log(`[Scheduler] ✅ Successfully started scheduled session ${session.id} for room ${roomId}`);

    return session;
  }

  /**
   * Start a recurring session for a room
   */
  private async startRecurringSession(roomId: number, scheduleId: number, scheduledTime: Date) {
    console.log(`[Scheduler] Starting recurring session for room ${roomId} at ${scheduledTime.toISOString()}`);

    // Get room details
    const room = await prisma.focusRoom.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    // Use room's focusDuration for the session
    const durationMinutes = room.focusDuration;
    const scheduledDuration = durationMinutes * 60; // Convert to seconds

    // Start the session and create occurrence record in transaction
    const session = await prisma.$transaction(async (tx) => {
      // Create session
      const newSession = await tx.focusRoomSession.create({
        data: {
          roomId,
          startedAt: new Date(),
          scheduledDuration,
          status: "ACTIVE",
        },
      });

      // Create or update occurrence record
      const occurrence = await tx.recurringSessionOccurrence.upsert({
        where: {
          recurringScheduleId_scheduledTime: {
            recurringScheduleId: scheduleId,
            scheduledTime,
          },
        },
        create: {
          recurringScheduleId: scheduleId,
          scheduledTime,
          sessionId: newSession.id,
          status: "CREATED",
        },
        update: {
          sessionId: newSession.id,
          status: "CREATED",
          skipReason: null,
        },
      });

      // Update all participants to "FOCUSING" status
      await tx.focusRoomParticipant.updateMany({
        where: {
          roomId,
          status: { not: "LEFT" },
        },
        data: {
          status: "FOCUSING",
        },
      });

      // Update room status to "active" (don't clear scheduledStartTime for recurring)
      // Room stays active for next recurring session
      await tx.focusRoom.update({
        where: { id: roomId },
        data: {
          status: "active",
          // Keep scheduledStartTime as null (recurring schedules don't use it)
        },
      });

      return newSession;
    });

    // Update all participants' user status to online
    try {
      const participants = await prisma.focusRoomParticipant.findMany({
        where: {
          roomId,
          status: { not: "LEFT" },
        },
        select: {
          userId: true,
        },
      });

      // Update each participant's user status to online
      await Promise.all(
        participants.map((participant) =>
          userStatusService.updateUserStatus(participant.userId, true).catch((error) => {
            console.error(
              `[Scheduler] Error updating user status for participant ${participant.userId}:`,
              error
            );
            // Don't throw - continue with other participants
          })
        )
      );
    } catch (error) {
      console.error("[Scheduler] Error updating participants' user status after starting session:", error);
      // Don't throw error - session creation should still succeed
    }

    // Get timer for WebSocket broadcast
    const timer = await focusRoomSessionService.getSessionTimer(session.id);

    // Broadcast session started event via WebSocket
    if (this.wsService) {
      this.wsService.broadcastSessionStarted(roomId, session, timer);
    }

    console.log(`[Scheduler] ✅ Successfully started recurring session ${session.id} for room ${roomId}`);

    return session;
  }

  /**
   * Mark an occurrence as skipped
   */
  private async markOccurrenceSkipped(
    scheduleId: number,
    scheduledTime: Date,
    reason: string
  ) {
    try {
      await prisma.recurringSessionOccurrence.upsert({
        where: {
          recurringScheduleId_scheduledTime: {
            recurringScheduleId: scheduleId,
            scheduledTime,
          },
        },
        create: {
          recurringScheduleId: scheduleId,
          scheduledTime,
          status: "SKIPPED",
          skipReason: reason,
        },
        update: {
          status: "SKIPPED",
          skipReason: reason,
        },
      });
    } catch (error) {
      console.error(`[Scheduler] Error marking occurrence as skipped:`, error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Reschedule missed sessions on server restart
   * This checks for scheduled sessions that should have started while server was down
   */
  async rescheduleMissedSessions() {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago

      // Find scheduled rooms that should have started in the last hour
      const missedRooms = await prisma.focusRoom.findMany({
        where: {
          status: "scheduled",
          scheduledStartTime: {
            lte: now,
            gte: oneHourAgo, // Only within last hour
          },
        },
        include: {
          sessions: {
            where: {
              status: { in: ["ACTIVE", "PAUSED"] },
            },
            take: 1,
          },
        },
      });

      if (missedRooms.length === 0) {
        console.log("[Scheduler] No missed sessions to reschedule");
        return;
      }

      console.log(`[Scheduler] Found ${missedRooms.length} missed scheduled session(s), starting now...`);

      for (const room of missedRooms) {
        if (room.sessions.length === 0) {
          try {
            await this.startScheduledSession(room.id);
          } catch (error: any) {
            console.error(`[Scheduler] Error rescheduling missed session for room ${room.id}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.error("[Scheduler] Error rescheduling missed sessions:", error);
    }
  }
}

// Export singleton instance
export const focusRoomSchedulerService = new FocusRoomSchedulerService();


