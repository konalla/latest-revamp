import { Server as SocketIOServer } from "socket.io";
import prisma from "../config/prisma.js";
import redisClient from "../config/redis.js";
import { sessionCacheService } from "./session-cache.service.js";
import type { CachedSessionState } from "./session-cache.service.js";
import focusSessionService from "./focus-session.service.js";
import {
  calculateElapsedTime,
  calculateRemainingTime,
  getCurrentTaskIndex,
  calculateCurrentTaskElapsed,
  calculateCurrentTaskRemaining,
} from "../utils/focus-session.utils.js";

// Redis key prefixes for timer state
const TIMER_KEYS = {
  STATE: "timer:state:",
  ACTIVE: "timer:active",
  LOCK: "timer:lock:",
};

// Sessions older than this are considered abandoned and auto-closed
const STALE_SESSION_THRESHOLD_HOURS = 8;
const MAX_SESSION_DURATION_MINUTES = 480;

interface SessionTimerState {
  sessionId: number;
  userId: number;
  startTime: string; // ISO string for Redis serialization
  pausedAt: string | null;
  resumedAt: string | null;
  totalPauseDuration: number;
  scheduledDuration: number;
  status: "active" | "paused" | "completed";
  lastDbSync: number;
}

// Type guard to check if status is paused
function isPausedStatus(status: string): status is "paused" {
  return status === "paused";
}

/**
 * Focus Session Timer Service with Redis-backed state
 * Supports horizontal scaling by storing timer state in Redis
 */
export class FocusSessionTimerService {
  private io: SocketIOServer;
  private localTimers: Map<number, NodeJS.Timeout> = new Map();
  private dbSyncInterval: NodeJS.Timeout | null = null;
  private masterLoopInterval: NodeJS.Timeout | null = null;
  private staleCleanupInterval: NodeJS.Timeout | null = null;
  private instanceId: string;
  private isShuttingDown: boolean = false;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.instanceId = `${process.pid}-${Date.now()}`;
    this.startDbSyncInterval();
    this.startMasterTimerLoop();
    this.startStaleSessionCleanup();
  }

  /**
   * Get instance ID for debugging
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * Debug method to get all active timers
   */
  async getActiveTimers(): Promise<Array<{ sessionId: number; status: string }>> {
    try {
      const activeIds = await redisClient.smembers(TIMER_KEYS.ACTIVE);
      const active: Array<{ sessionId: number; status: string }> = [];

      for (const id of activeIds) {
        const state = await this.getSessionState(parseInt(id));
        if (state) {
          active.push({
            sessionId: state.sessionId,
            status: state.status,
          });
        }
      }
      return active;
    } catch (error) {
      console.error("[Timer] Error getting active timers:", error);
      return [];
    }
  }

  /**
   * Get session state from Redis
   */
  private async getSessionState(sessionId: number): Promise<SessionTimerState | null> {
    try {
      const key = `${TIMER_KEYS.STATE}${sessionId}`;
      const data = await redisClient.get(key);
      if (!data) return null;
      return JSON.parse(data);
    } catch (error) {
      console.error(`[Timer] Error getting session state ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Save session state to Redis
   */
  private async saveSessionState(state: SessionTimerState): Promise<void> {
    try {
      const key = `${TIMER_KEYS.STATE}${state.sessionId}`;
      await redisClient.setex(key, 3600 * 4, JSON.stringify(state)); // 4 hour TTL

      // Add to active set if active
      if (state.status === "active") {
        await redisClient.sadd(TIMER_KEYS.ACTIVE, state.sessionId.toString());
      } else {
        await redisClient.srem(TIMER_KEYS.ACTIVE, state.sessionId.toString());
      }
    } catch (error) {
      console.error(`[Timer] Error saving session state ${state.sessionId}:`, error);
    }
  }

  /**
   * Delete session state from Redis
   */
  private async deleteSessionState(sessionId: number): Promise<void> {
    try {
      await redisClient.del(`${TIMER_KEYS.STATE}${sessionId}`);
      await redisClient.srem(TIMER_KEYS.ACTIVE, sessionId.toString());
    } catch (error) {
      console.error(`[Timer] Error deleting session state ${sessionId}:`, error);
    }
  }

  /**
   * Master timer loop - processes all active timers every second
   * This is more efficient than individual setInterval per session
   */
  private startMasterTimerLoop() {
    this.masterLoopInterval = setInterval(async () => {
      if (this.isShuttingDown) return;

      try {
        // Get all active session IDs
        const activeIds = await redisClient.smembers(TIMER_KEYS.ACTIVE);

        // Process each active session
        for (const id of activeIds) {
          const sessionId = parseInt(id);
          await this.updateTimer(sessionId);
        }
      } catch (error) {
        console.error("[Timer] Error in master timer loop:", error);
      }
    }, 1000);
  }

  /**
   * Start timer for a session
   */
  async startTimer(
    sessionId: number,
    userId: number,
    startTime: Date,
    scheduledDuration: number
  ): Promise<void> {
    // Stop existing timer if any
    await this.stopTimer(sessionId);

    // Ensure startTime is a proper Date object
    let actualStartTime = startTime;
    if (!(startTime instanceof Date)) {
      actualStartTime = new Date(startTime);
    }

    // Verify startTime is not in the future
    const now = new Date();
    if (actualStartTime.getTime() > now.getTime()) {
      console.warn(`[Timer] startTime is in the future, using current time instead`, {
        sessionId,
        providedStartTime: actualStartTime.toISOString(),
        now: now.toISOString(),
      });
      actualStartTime = now;
    }

    const state: SessionTimerState = {
      sessionId,
      userId,
      startTime: actualStartTime.toISOString(),
      pausedAt: null,
      resumedAt: null,
      totalPauseDuration: 0,
      scheduledDuration,
      status: "active",
      lastDbSync: Date.now(),
    };

    await this.saveSessionState(state);

    console.log(`[Timer] Started timer for session ${sessionId}`, {
      sessionId,
      userId,
      startTime: actualStartTime.toISOString(),
      scheduledDuration,
      instanceId: this.instanceId,
    });

    // Emit initial timer update immediately
    await this.updateTimer(sessionId);
  }

  /**
   * Update timer every second
   */
  private async updateTimer(sessionId: number): Promise<void> {
    const state = await this.getSessionState(sessionId);
    if (!state) {
      // Session not found, remove from active set
      await redisClient.srem(TIMER_KEYS.ACTIVE, sessionId.toString());
      return;
    }

    // Skip if paused
    if (isPausedStatus(state.status)) {
      await redisClient.srem(TIMER_KEYS.ACTIVE, sessionId.toString());
      return;
    }

    // Skip if completed
    if (state.status === "completed") {
      await redisClient.srem(TIMER_KEYS.ACTIVE, sessionId.toString());
      return;
    }

    try {
      // Use cached session data to reduce DB queries
      const session = await sessionCacheService.getSession(sessionId);
      if (!session) {
        console.warn(`[Timer] Session ${sessionId} not found in database, stopping timer`);
        await this.stopTimer(sessionId);
        return;
      }

      // Check if session was paused via REST API
      if (session.pausedAt && !session.resumedAt) {
        if (!isPausedStatus(state.status)) {
          console.log(`[Timer] Session ${sessionId} paused via REST API, stopping timer`);
          state.pausedAt = session.pausedAt;
          state.status = "paused";
          await this.saveSessionState(state);
          return;
        }
      }

      // Sync pause duration from DB if needed
      const intention = session.intention || {};
      const dbTotalPauseDuration = intention?.totalPauseDuration;
      if (dbTotalPauseDuration !== undefined && state.totalPauseDuration === 0 && dbTotalPauseDuration > 0) {
        state.totalPauseDuration = dbTotalPauseDuration;
      }

      // Calculate elapsed time
      const startTime = new Date(state.startTime);
      const now = new Date();
      const totalElapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      const elapsedTime = Math.max(0, totalElapsed - state.totalPauseDuration);
      const remainingTime = Math.max(0, state.scheduledDuration - elapsedTime);

      // Get tasks for current task calculation
      const taskIds: number[] = intention?.taskIds || [];
      const completedTaskIds: number[] = intention?.completedTasks || [];

      let currentTaskElapsed = 0;
      let currentTaskRemaining = 0;
      let currentTask = null;

      if (taskIds.length > 0) {
        // Use cached tasks
        const tasks = await sessionCacheService.getTasks(taskIds);

        // Sort tasks by their order in taskIds array
        const sortedTasks = taskIds
          .map((id) => tasks.find((t) => t.id === id))
          .filter((t) => t !== undefined) as Array<{
          id: number;
          duration: number;
          title: string;
          category: string;
          completed: boolean;
        }>;

        // Mark completed tasks
        const tasksWithStatus = sortedTasks.map((task) => ({
          ...task,
          completed: completedTaskIds.includes(task.id),
        }));

        // Get current task index
        const currentTaskIndex = getCurrentTaskIndex(elapsedTime, tasksWithStatus);

        if (currentTaskIndex < tasksWithStatus.length) {
          currentTask = tasksWithStatus[currentTaskIndex];

          // Calculate elapsed time for current task
          const completedTasks = tasksWithStatus
            .slice(0, currentTaskIndex)
            .map((t) => ({ duration: t.duration }));
          currentTaskElapsed = calculateCurrentTaskElapsed(
            elapsedTime,
            completedTasks,
            currentTaskIndex
          );

          // Calculate remaining time for current task
          if (currentTask) {
            currentTaskRemaining = calculateCurrentTaskRemaining(
              currentTask.duration,
              currentTaskElapsed
            );
          }
        }
      }

      // Emit timer update
      const namespace = this.io.of("/focus-session");
      const roomName = `user-${state.userId}`;

      // Log every 10 seconds for debugging
      if (elapsedTime % 10 === 0) {
        console.log(`[Timer] Update for session ${sessionId}`, {
          sessionId,
          userId: state.userId,
          elapsedTime,
          remainingTime,
          status: state.status,
        });
      }

      namespace.to(roomName).emit("timer_update", {
        sessionId,
        status: state.status,
        elapsedTime,
        remainingTime,
        currentTaskElapsed,
        currentTaskRemaining,
        startTime: state.startTime,
        pausedAt: state.pausedAt,
        resumedAt: state.resumedAt,
        currentTask: currentTask
          ? {
              id: currentTask.id,
              title: currentTask.title,
              category: currentTask.category,
              duration: currentTask.duration,
            }
          : null,
      });

      // Check if session ended
      if (remainingTime <= 0) {
        await this.endTimer(sessionId);
      }
    } catch (error) {
      console.error(`Error updating timer for session ${sessionId}:`, error);
    }
  }

  /**
   * Pause timer
   */
  async pauseTimer(sessionId: number): Promise<void> {
    const state = await this.getSessionState(sessionId);
    if (!state) {
      console.warn(`[Timer] Cannot pause - no state found for session ${sessionId}`);
      return;
    }

    if (state.status !== "active") {
      console.log(`[Timer] Session ${sessionId} is already ${state.status}, skipping pause`);
      return;
    }

    console.log(`[Timer] Pausing timer for session ${sessionId}`, {
      sessionId,
      instanceId: this.instanceId,
    });

    // Update state
    const now = new Date();
    state.status = "paused";
    state.pausedAt = now.toISOString();

    await this.saveSessionState(state);

    // Calculate current elapsed time
    const startTime = new Date(state.startTime);
    const totalElapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
    const elapsedTime = Math.max(0, totalElapsed - state.totalPauseDuration);
    const remainingTime = Math.max(0, state.scheduledDuration - elapsedTime);

    // Sync pause duration to DB
    try {
      const session = await prisma.focusSession.findUnique({
        where: { id: sessionId },
        select: { intention: true },
      });

      if (session) {
        const intention = (session.intention as any) || {};
        intention.totalPauseDuration = state.totalPauseDuration;

        await prisma.focusSession.update({
          where: { id: sessionId },
          data: { intention },
        });
      }

      // Invalidate cache
      await sessionCacheService.invalidateSession(sessionId);
    } catch (error) {
      console.error(`[Timer] Error syncing pause to DB for session ${sessionId}:`, error);
    }

    // Emit pause event
    const namespace = this.io.of("/focus-session");
    namespace.to(`user-${state.userId}`).emit("session_paused", {
      session: {
        id: sessionId,
        status: "paused",
        pausedAt: state.pausedAt,
        elapsedTime,
      },
      timer: {
        sessionId,
        status: "paused",
        elapsedTime,
        remainingTime,
        pausedAt: state.pausedAt,
      },
    });

    console.log(`[Timer] Paused session ${sessionId}`, { elapsedTime, remainingTime });
  }

  /**
   * Resume timer
   */
  async resumeTimer(sessionId: number, providedElapsedTime?: number): Promise<void> {
    const state = await this.getSessionState(sessionId);
    if (!state || state.status !== "paused") {
      console.warn(`[Timer] Cannot resume - session ${sessionId} not paused`);
      return;
    }

    const now = new Date();

    // Calculate pause duration for this pause cycle
    if (state.pausedAt) {
      const pausedAt = new Date(state.pausedAt);
      const pauseDuration = Math.floor((now.getTime() - pausedAt.getTime()) / 1000);
      state.totalPauseDuration += pauseDuration;
      console.log(`[Timer] Resuming session ${sessionId}`, {
        sessionId,
        pauseDuration,
        totalPauseDuration: state.totalPauseDuration,
      });
    }

    state.status = "active";
    state.resumedAt = now.toISOString();
    state.pausedAt = null;

    await this.saveSessionState(state);

    // Calculate current elapsed time
    const startTime = new Date(state.startTime);
    const totalElapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
    const elapsedTime = providedElapsedTime ?? Math.max(0, totalElapsed - state.totalPauseDuration);
    const remainingTime = Math.max(0, state.scheduledDuration - elapsedTime);

    // Sync to DB
    try {
      const session = await prisma.focusSession.findUnique({
        where: { id: sessionId },
        select: { intention: true },
      });

      if (session) {
        const intention = (session.intention as any) || {};
        intention.totalPauseDuration = state.totalPauseDuration;

        await prisma.focusSession.update({
          where: { id: sessionId },
          data: { intention },
        });
      }

      // Invalidate cache
      await sessionCacheService.invalidateSession(sessionId);
    } catch (error) {
      console.error(`[Timer] Error syncing resume to DB for session ${sessionId}:`, error);
    }

    // Emit resume event
    const namespace = this.io.of("/focus-session");
    namespace.to(`user-${state.userId}`).emit("session_resumed", {
      session: {
        id: sessionId,
        status: "active",
        resumedAt: state.resumedAt,
        elapsedTime,
      },
      timer: {
        sessionId,
        status: "active",
        elapsedTime,
        remainingTime,
        resumedAt: state.resumedAt,
      },
    });

    console.log(`[Timer] Resumed session ${sessionId}`, { elapsedTime, remainingTime });
  }

  /**
   * Stop timer
   */
  async stopTimer(sessionId: number): Promise<void> {
    await redisClient.srem(TIMER_KEYS.ACTIVE, sessionId.toString());
    console.log(`[Timer] Stopped timer for session ${sessionId}`);
  }

  /**
   * End timer and session.
   * When called from the master timer loop (scheduled duration expired),
   * also persists the completion to the database so the session doesn't
   * remain "active" in PostgreSQL.
   * @param sessionId The session to end
   * @param skipDbUpdate If true, skip the database UPDATE (used when the
   *   caller already handled the DB write, e.g. broadcastSessionEnded
   *   which is invoked after the REST endpoint wrote to the DB).
   */
  async endTimer(sessionId: number, skipDbUpdate = false): Promise<void> {
    const state = await this.getSessionState(sessionId);
    if (!state) return;

    // Guard against double-processing
    if (state.status === "completed") return;

    await this.stopTimer(sessionId);

    const startTime = new Date(state.startTime);
    const now = new Date();
    const totalElapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
    const elapsedTime = Math.max(0, totalElapsed - state.totalPauseDuration);

    // Update Redis state to completed
    state.status = "completed";
    await this.saveSessionState(state);

    // Persist completion to the database so the session is no longer "active"
    if (!skipDbUpdate) {
      try {
        const durationMinutes = Math.min(
          Math.max(1, Math.round(elapsedTime / 60)),
          MAX_SESSION_DURATION_MINUTES
        );

        await prisma.$queryRaw`
          UPDATE focus_sessions
          SET status = 'completed',
              ended_at = NOW(),
              completed = true,
              duration = ${durationMinutes},
              notes = COALESCE(notes, '') || ' [auto-completed: timer expired]'
          WHERE id = ${sessionId}
            AND status IN ('active', 'paused')
        `;
        console.log(`[Timer] Persisted session ${sessionId} completion to DB (duration: ${durationMinutes}m)`);
      } catch (dbError) {
        console.error(`[Timer] Failed to persist session ${sessionId} completion to DB:`, dbError);
      }
    }

    // Emit end event
    const namespace = this.io.of("/focus-session");
    namespace.to(`user-${state.userId}`).emit("session_ended", {
      session: {
        id: sessionId,
        status: "completed",
        endedAt: now.toISOString(),
        elapsedTime,
        actualDuration: elapsedTime,
      },
    });

    // Invalidate cache
    await sessionCacheService.invalidateSession(sessionId);
    await sessionCacheService.clearUserActiveSession(state.userId);

    // Clean up state after a delay
    setTimeout(async () => {
      await this.deleteSessionState(sessionId);
    }, 60000); // Keep state for 1 minute for any final syncs
  }

  /**
   * Get timer state for a session
   */
  async getTimerState(sessionId: number) {
    // Try Redis state first
    const state = await this.getSessionState(sessionId);
    if (state) {
      const startTime = new Date(state.startTime);
      const now = new Date();
      const totalElapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);

      let elapsedTime: number;
      if (state.status === "paused" && state.pausedAt) {
        const pausedAt = new Date(state.pausedAt);
        const elapsedUntilPause = Math.floor((pausedAt.getTime() - startTime.getTime()) / 1000);
        elapsedTime = Math.max(0, elapsedUntilPause - state.totalPauseDuration);
      } else {
        elapsedTime = Math.max(0, totalElapsed - state.totalPauseDuration);
      }

      const remainingTime = Math.max(0, state.scheduledDuration - elapsedTime);

      return {
        sessionId: state.sessionId,
        status: state.status,
        elapsedTime,
        remainingTime,
        startTime: state.startTime,
        pausedAt: state.pausedAt,
        resumedAt: state.resumedAt,
      };
    }

    // Fallback to database
    const session = await prisma.focusSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) return null;

    const intention = session.intention as any;
    let scheduledDuration = 0;
    const totalPauseDuration = intention?.totalPauseDuration || 0;

    if (intention?.scheduledDuration) {
      scheduledDuration = intention.scheduledDuration * 60;
    } else if (intention?.taskIds && intention.taskIds.length > 0) {
      const tasks = await prisma.task.findMany({
        where: { id: { in: intention.taskIds } },
        select: { duration: true, category: true },
      });

      const category = intention.category;
      scheduledDuration =
        tasks
          .filter((t) => !category || t.category === category)
          .reduce((sum, t) => sum + t.duration, 0) * 60;
    } else if (session.duration) {
      scheduledDuration = session.duration * 60;
    }

    const now = new Date();
    let elapsedTime = 0;

    if (session.status === "paused" && session.pausedAt) {
      const totalElapsed = Math.floor((session.pausedAt.getTime() - session.startedAt.getTime()) / 1000);
      elapsedTime = Math.max(0, totalElapsed - totalPauseDuration);
    } else {
      const totalElapsed = Math.floor((now.getTime() - session.startedAt.getTime()) / 1000);
      elapsedTime = Math.max(0, totalElapsed - totalPauseDuration);
    }

    const remainingTime = Math.max(0, scheduledDuration - elapsedTime);

    return {
      sessionId: session.id,
      status: session.status,
      elapsedTime,
      remainingTime,
      startTime: session.startedAt.toISOString(),
      pausedAt: session.pausedAt?.toISOString() || null,
      resumedAt: session.resumedAt?.toISOString() || null,
    };
  }

  /**
   * Start DB sync interval (syncs elapsed time every 15 seconds)
   */
  private startDbSyncInterval() {
    this.dbSyncInterval = setInterval(async () => {
      if (this.isShuttingDown) return;
      await this.syncAllTimersToDb();
    }, 15000);
  }

  /**
   * Sync all active timers to database
   */
  private async syncAllTimersToDb() {
    try {
      const activeIds = await redisClient.smembers(TIMER_KEYS.ACTIVE);

      for (const id of activeIds) {
        const sessionId = parseInt(id);
        const state = await this.getSessionState(sessionId);

        if (state && state.status === "active") {
          try {
            const startTime = new Date(state.startTime);
            const now = new Date();
            const totalElapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
            const elapsedTime = Math.max(0, totalElapsed - state.totalPauseDuration);

            const session = await prisma.focusSession.findUnique({
              where: { id: sessionId },
              select: { intention: true },
            });

            if (session) {
              const intention = (session.intention as any) || {};
              intention.elapsedTime = elapsedTime;
              intention.totalPauseDuration = state.totalPauseDuration;

              await prisma.focusSession.update({
                where: { id: sessionId },
                data: { intention },
              });

              state.lastDbSync = Date.now();
              await this.saveSessionState(state);
            }
          } catch (error) {
            console.error(`Error syncing timer to DB for session ${sessionId}:`, error);
          }
        }
      }
    } catch (error) {
      console.error("[Timer] Error in DB sync interval:", error);
    }
  }

  /**
   * Restore active sessions on server startup
   */
  async restoreActiveSessions() {
    try {
      // Auto-close any sessions that are clearly stale
      const closedCount = await this.cleanupStaleSessions();
      if (closedCount > 0) {
        console.log(`[Timer] Auto-closed ${closedCount} stale session(s) on startup`);
      }

      // First check Redis for any existing states
      const redisStates = await this.getActiveTimers();
      console.log(`[Timer] Found ${redisStates.length} sessions in Redis`);

      // Then check database for sessions that may have been active when server crashed
      const activeSessions = await prisma.focusSession.findMany({
        where: {
          status: { in: ["active", "paused"] },
          endedAt: null,
        },
      });

      console.log(`[Timer] Found ${activeSessions.length} active sessions in database`);

      for (const session of activeSessions) {
        // Skip if already in Redis
        const existingState = await this.getSessionState(session.id);
        if (existingState) {
          console.log(`[Timer] Session ${session.id} already in Redis, skipping`);
          continue;
        }

        const intention = session.intention as any;
        const taskIds: number[] = intention?.taskIds || [];
        const category = intention?.category;

        // Calculate scheduled duration from tasks
        let scheduledDuration = 0;
        if (taskIds.length > 0) {
          const tasks = await prisma.task.findMany({
            where: { id: { in: taskIds } },
            select: { duration: true, category: true },
          });

          scheduledDuration =
            tasks
              .filter((t) => !category || t.category === category)
              .reduce((sum, t) => sum + t.duration, 0) * 60;
        } else if (intention?.scheduledDuration) {
          scheduledDuration = intention.scheduledDuration * 60;
        }

        if (scheduledDuration <= 0 && session.duration) {
          scheduledDuration = session.duration * 60;
        }

        if (scheduledDuration <= 0) {
          console.warn(`[Timer] Skipping session ${session.id} - no valid duration`);
          continue;
        }

        const totalPauseDuration = intention?.totalPauseDuration || 0;

        const state: SessionTimerState = {
          sessionId: session.id,
          userId: session.userId,
          startTime: session.startedAt.toISOString(),
          pausedAt: session.pausedAt?.toISOString() || null,
          resumedAt: session.resumedAt?.toISOString() || null,
          totalPauseDuration,
          scheduledDuration,
          status: session.status === "paused" ? "paused" : "active",
          lastDbSync: Date.now(),
        };

        await this.saveSessionState(state);
        console.log(`[Timer] Restored session ${session.id} with status ${state.status}`);
      }

      console.log(`[Timer] Restore completed`);
    } catch (error) {
      console.error("Error restoring active sessions:", error);
    }
  }

  /**
   * Periodically scan for and auto-close abandoned sessions in the database.
   * Runs every 30 minutes.
   */
  private startStaleSessionCleanup() {
    this.staleCleanupInterval = setInterval(async () => {
      if (this.isShuttingDown) return;
      await this.cleanupStaleSessions();
    }, 30 * 60 * 1000);
  }

  /**
   * Find sessions that have been active/paused for longer than the threshold
   * and auto-complete them with a capped duration.
   */
  async cleanupStaleSessions(): Promise<number> {
    try {
      const thresholdMs = STALE_SESSION_THRESHOLD_HOURS * 3600 * 1000;
      const cutoff = new Date(Date.now() - thresholdMs);

      const staleSessions = await prisma.focusSession.findMany({
        where: {
          status: { in: ['active', 'paused'] },
          endedAt: null,
          startedAt: { lt: cutoff },
        },
        select: { id: true, userId: true, startedAt: true, intention: true },
      });

      if (staleSessions.length === 0) return 0;

      console.log(`[Timer] Found ${staleSessions.length} stale session(s) to auto-close`);

      for (const session of staleSessions) {
        const intention = session.intention as any;
        const savedElapsed = intention?.elapsedTime;
        let durationMinutes = 1;

        if (savedElapsed && savedElapsed > 0) {
          durationMinutes = Math.min(
            Math.max(1, Math.round(savedElapsed / 60)),
            MAX_SESSION_DURATION_MINUTES
          );
        }

        await prisma.$queryRaw`
          UPDATE focus_sessions
          SET status = 'completed',
              ended_at = NOW(),
              completed = true,
              duration = ${durationMinutes},
              notes = COALESCE(notes, '') || ' [auto-closed: session timed out]'
          WHERE id = ${session.id}
        `;

        // Clean up Redis state if any
        await this.deleteSessionState(session.id);

        // Invalidate cache
        await sessionCacheService.invalidateSession(session.id);
        await sessionCacheService.clearUserActiveSession(session.userId);

        console.log(`[Timer] Auto-closed stale session ${session.id} (user ${session.userId}) with duration ${durationMinutes}m`);
      }

      return staleSessions.length;
    } catch (error) {
      console.error('[Timer] Error cleaning up stale sessions:', error);
      return 0;
    }
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup() {
    this.isShuttingDown = true;

    if (this.masterLoopInterval) {
      clearInterval(this.masterLoopInterval);
    }

    if (this.dbSyncInterval) {
      clearInterval(this.dbSyncInterval);
    }

    if (this.staleCleanupInterval) {
      clearInterval(this.staleCleanupInterval);
    }

    for (const interval of this.localTimers.values()) {
      clearInterval(interval);
    }
    this.localTimers.clear();

    console.log(`[Timer] Cleanup completed for instance ${this.instanceId}`);
  }
}
