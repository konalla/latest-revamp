import * as cron from "node-cron";
import prisma from "../config/prisma.js";
import { focusRoomSessionService } from "./focus-room-session.service.js";
import { FocusRoomWebSocketService } from "./focus-room-websocket.service.js";

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

      // Find rooms with scheduled sessions that should start now
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

      if (scheduledRooms.length === 0) {
        return;
      }

      console.log(`[Scheduler] Found ${scheduledRooms.length} scheduled session(s) to start`);

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

