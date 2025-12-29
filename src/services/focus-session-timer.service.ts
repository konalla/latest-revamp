import { Server as SocketIOServer } from "socket.io";
import prisma from "../config/prisma.js";
import focusSessionService from "./focus-session.service.js";
import {
  calculateElapsedTime,
  calculateRemainingTime,
  isSessionEnded,
  getCurrentTaskIndex,
  calculateCurrentTaskElapsed,
  calculateCurrentTaskRemaining,
} from "../utils/focus-session.utils.js";

interface SessionTimerState {
  sessionId: number;
  userId: number;
  startTime: Date; // Original start time (NEVER adjusted - always the actual session start time)
  pausedAt: Date | null; // When current pause started
  resumedAt: Date | null; // When last resume happened
  totalPauseDuration: number; // Total seconds paused (cumulative, in seconds)
  scheduledDuration: number; // in seconds
  status: "active" | "paused" | "completed";
  lastDbSync: number; // timestamp of last DB sync
}

// Type guard to check if status is paused
function isPausedStatus(status: string): status is "paused" {
  return status === "paused";
}

export class FocusSessionTimerService {
  private io: SocketIOServer;
  private timers: Map<number, NodeJS.Timeout> = new Map();
  private sessionStates: Map<number, SessionTimerState> = new Map();
  private dbSyncInterval: NodeJS.Timeout | null = null;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.startDbSyncInterval();
  }

  /**
   * Debug method to get all active timers
   */
  getActiveTimers(): Array<{ sessionId: number; status: string }> {
    const active: Array<{ sessionId: number; status: string }> = [];
    for (const [sessionId, state] of this.sessionStates.entries()) {
      active.push({
        sessionId,
        status: state.status,
      });
    }
    return active;
  }

  /**
   * Debug method to check timer state
   */
  debugTimerState(sessionId: number) {
    const state = this.sessionStates.get(sessionId);
    const hasInterval = this.timers.has(sessionId);
    const interval = this.timers.get(sessionId);
    
    console.log(`[Timer] Debug state for session ${sessionId}:`, {
      sessionId,
      hasState: !!state,
      stateStatus: state?.status,
      hasInterval,
      intervalExists: !!interval,
      timersMapSize: this.timers.size,
      allTimerSessionIds: Array.from(this.timers.keys()),
    });
    
    return {
      hasState: !!state,
      stateStatus: state?.status,
      hasInterval,
      intervalExists: !!interval,
    };
  }

  /**
   * Start timer for a session
   */
  async startTimer(
    sessionId: number,
    userId: number,
    startTime: Date,
    scheduledDuration: number
  ) {
    // Stop existing timer if any
    this.stopTimer(sessionId);

    // Ensure startTime is a proper Date object
    let actualStartTime = startTime;
    if (!(startTime instanceof Date)) {
      actualStartTime = new Date(startTime);
    }

    // Verify startTime is not in the future (timezone issue)
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
      startTime: actualStartTime,
      pausedAt: null,
      resumedAt: null,
      totalPauseDuration: 0, // Initialize pause duration
      scheduledDuration,
      status: "active",
      lastDbSync: Date.now(),
    };

    this.sessionStates.set(sessionId, state);

    console.log(`[Timer] Starting timer for session ${sessionId}`, {
      sessionId,
      userId,
      startTime: actualStartTime.toISOString(),
      scheduledDuration,
      now: now.toISOString(),
    });

    // Check if timer already exists (shouldn't happen, but safety check)
    if (this.timers.has(sessionId)) {
      console.warn(`[Timer] WARNING: Timer interval already exists for session ${sessionId}, stopping old one first`);
      this.stopTimer(sessionId);
    }

    // Start interval for timer updates
    const interval = setInterval(async () => {
      await this.updateTimer(sessionId);
    }, 1000);

    this.timers.set(sessionId, interval);
    console.log(`[Timer] ✅ Started timer interval for session ${sessionId}`, {
      sessionId,
      timersMapSize: this.timers.size,
      allTimerSessionIds: Array.from(this.timers.keys()),
    });

    // Emit initial timer update immediately
    await this.updateTimer(sessionId);
  }

  /**
   * Update timer every second
   */
  private async updateTimer(sessionId: number) {
    const state = this.sessionStates.get(sessionId);
    if (!state) {
      console.warn(`[Timer] No state found for session ${sessionId}`);
      return;
    }
    
    // CRITICAL: Check paused status FIRST before any DB operations
    // If paused, stop the timer interval and return immediately
    if (isPausedStatus(state.status)) {
      const hasInterval = this.timers.has(sessionId);
      if (hasInterval) {
        console.error(`[Timer] ❌ CRITICAL BUG: updateTimer called for PAUSED session ${sessionId} but interval still exists!`, {
          sessionId,
          status: state.status,
          hasInterval: true,
          pausedAt: state.pausedAt?.toISOString() || null,
          stackTrace: new Error().stack,
        });
        // Force stop the timer
        this.stopTimer(sessionId);
      }
      // Always return early when paused - don't process any updates
      return;
    }
    
    // Also check if timer interval exists - if not, we shouldn't be here
    if (!this.timers.has(sessionId)) {
      console.warn(`[Timer] updateTimer called but no interval exists for session ${sessionId}`, {
        sessionId,
        status: state.status,
      });
      return;
    }
    
    // Double-check status before proceeding (race condition protection)
    if (isPausedStatus(state.status)) {
      console.error(`[Timer] ❌ Race condition detected: Status changed to paused during updateTimer for session ${sessionId}`);
      this.stopTimer(sessionId);
      return;
    }
    
    // Log that we're processing an active timer update (only every 10 seconds to reduce noise)
    const shouldLog = Math.random() < 0.1; // 10% chance to log (reduce noise)
    if (shouldLog) {
      console.log(`[Timer] Processing update for ACTIVE session ${sessionId}`, {
        sessionId,
        status: state.status,
        hasInterval: this.timers.has(sessionId),
      });
    }

    try {
      // Get session from DB to get latest pause/resume info
      const session = await prisma.focusSession.findUnique({
        where: { id: sessionId },
      });
      
      // Check status again after async DB call (in case it changed)
      if (isPausedStatus(state.status)) {
        console.warn(`[Timer] Status changed to paused during DB read for session ${sessionId}, stopping timer`);
        this.stopTimer(sessionId);
        return;
      }

      if (!session) {
        console.warn(`[Timer] Session ${sessionId} not found in database, stopping timer`);
        this.stopTimer(sessionId);
        return;
      }

      // Update state from DB (in case pause/resume happened via REST API)
      // Sync pause/resume timestamps from DB
      // NOTE: We do NOT sync totalPauseDuration FROM DB during timer updates because:
      // 1. The in-memory state is the source of truth for pause duration
      // 2. We write pause duration TO DB, not read it back
      // 3. Reading it back would overwrite correct in-memory values with stale DB values
      const intention = session.intention as any;
      
      // Only sync pause duration FROM DB if:
      // 1. State has 0 (initial state, never paused)
      // 2. DB has a larger value (another process updated it - rare but possible)
      // This prevents overwriting correct in-memory values with stale DB values
      const dbTotalPauseDuration = intention?.totalPauseDuration;
      if (dbTotalPauseDuration !== undefined) {
        // Only update if state is 0 (never paused) OR DB value is significantly larger (another process)
        // Don't overwrite if state has a larger value (state is more recent)
        if (state.totalPauseDuration === 0 && dbTotalPauseDuration > 0) {
          // Initial sync from DB - state never had pause duration set
          console.log(`[Timer] Initializing pause duration from DB for session ${sessionId}`, {
            sessionId,
            dbPauseDuration: dbTotalPauseDuration,
          });
          state.totalPauseDuration = dbTotalPauseDuration;
          // Do NOT adjust startTime - we'll subtract pause duration in elapsed time calculation
        } else if (dbTotalPauseDuration > state.totalPauseDuration + 5) {
          // DB has significantly larger value (5+ seconds difference) - likely from another process
          // This is a safety check for multi-instance scenarios
          console.warn(`[Timer] DB pause duration (${dbTotalPauseDuration}) is significantly larger than state (${state.totalPauseDuration}) for session ${sessionId}, syncing from DB`, {
            sessionId,
            dbPauseDuration: dbTotalPauseDuration,
            statePauseDuration: state.totalPauseDuration,
            diff: dbTotalPauseDuration - state.totalPauseDuration,
          });
          state.totalPauseDuration = dbTotalPauseDuration;
          // Do NOT adjust startTime - we'll subtract pause duration in elapsed time calculation
        }
        // Otherwise, state value is authoritative - don't overwrite
      }
      
      // Check if session was paused via REST API (DB shows paused but state doesn't)
      if (session.pausedAt && !session.resumedAt) {
        // Session is currently paused in DB
        if (!isPausedStatus(state.status)) {
          console.log(`[Timer] ⚠️ Session ${sessionId} paused via REST API, stopping timer`, {
            sessionId,
            dbStatus: session.status,
            stateStatus: state.status,
            pausedAt: session.pausedAt.toISOString(),
            hasInterval: this.timers.has(sessionId),
          });
          state.pausedAt = session.pausedAt;
          state.status = "paused";
          this.stopTimer(sessionId); // Stop timer immediately
          
          // Verify timer is stopped
          if (this.timers.has(sessionId)) {
            console.error(`[Timer] ❌ ERROR: Timer interval still exists after stopTimer for session ${sessionId}`);
            this.stopTimer(sessionId); // Try again
          }
          
          console.log(`[Timer] ✅ Timer stopped for paused session ${sessionId}`);
          return; // Exit early - CRITICAL: Don't continue processing
        } else {
          // Already paused, ensure timer is stopped
          if (this.timers.has(sessionId)) {
            console.warn(`[Timer] ⚠️ Session ${sessionId} is paused but timer interval still exists, stopping now`);
            this.stopTimer(sessionId);
          }
          // CRITICAL: Return early when paused
          return;
        }
      } else if (session.pausedAt && session.resumedAt) {
        // Session was paused and resumed in the past - timestamps are for reference only
        // The actual pause duration is tracked in totalPauseDuration
        // IMPORTANT: This means the session was paused and then resumed, so it should be active now
        // But we need to check the CURRENT status in the database, not just the timestamps
        
        // Check current database status - if it's still paused, don't resume
        if (session.status === "paused") {
          // Database says paused, so keep it paused
          if (!isPausedStatus(state.status)) {
            console.log(`[Timer] DB shows paused for session ${sessionId}, updating state to paused`);
            state.status = "paused";
            state.pausedAt = session.pausedAt;
            this.stopTimer(sessionId);
          }
          return; // Exit early - don't process timer updates
        }
        
        // Database says active, and we have pause/resume timestamps
        // This means session was paused and resumed, so it should be active
          // Only restart timer if state is actually paused (don't restart if already active)
          if (isPausedStatus(state.status)) {
          console.log(`[Timer] Session ${sessionId} was paused, now resumed (DB shows active), restarting timer`);
          state.status = "active";
          state.pausedAt = null;
          state.resumedAt = null;
          // Restart timer interval only if not already running
          if (!this.timers.has(sessionId)) {
            const interval = setInterval(async () => {
              await this.updateTimer(sessionId);
            }, 1000);
            this.timers.set(sessionId, interval);
            console.log(`[Timer] Restarted timer interval for resumed session ${sessionId}`);
          } else {
            console.log(`[Timer] Timer interval already exists for session ${sessionId}, not creating new one`);
          }
        }
        // If state is already active, don't change anything
        // Clear pausedAt/resumedAt since we've accounted for them in totalPauseDuration
        state.pausedAt = null;
        state.resumedAt = null;
      } else if (!session.pausedAt && !session.resumedAt) {
        // Session is active, no pause/resume timestamps
        // Only update if state was paused (resume scenario)
        if (isPausedStatus(state.status)) {
          console.log(`[Timer] Session ${sessionId} status changed from paused to active (no pause/resume timestamps in DB)`);
          state.status = "active";
        }
        state.pausedAt = null;
        state.resumedAt = null;
      }
      
      // CRITICAL: Check status again after DB sync - if paused, stop immediately
      if (isPausedStatus(state.status)) {
        console.log(`[Timer] Status is paused after DB sync for session ${sessionId}, stopping timer`);
        this.stopTimer(sessionId);
        return;
      }

      // Final check: Skip update if not active (shouldn't reach here if paused, but safety check)
      if (state.status !== "active" && state.status !== "completed") {
        console.warn(`[Timer] Session ${sessionId} status is ${state.status} but reached timer update logic, stopping timer`);
        this.stopTimer(sessionId);
        return;
      }
      
      // CRITICAL: Final safety check before emitting - status must be active
      // Check status again after all async operations
      if (state.status !== "active" && state.status !== "completed") {
        console.error(`[Timer] ❌ CRITICAL BUG: About to emit timer update but status is ${state.status} for session ${sessionId}`, {
          sessionId,
          status: state.status,
          hasInterval: this.timers.has(sessionId),
          pausedAt: state.pausedAt?.toISOString() || null,
        });
        // Force stop timer and exit immediately
        this.stopTimer(sessionId);
        return;
      }
      
      // Verify timer interval still exists (should exist for active sessions)
      if (!this.timers.has(sessionId)) {
        console.warn(`[Timer] About to emit but no interval exists for session ${sessionId}`);
        return;
      }

      // Ensure startTime is a proper Date object and not in the future
      let startTime = state.startTime;
      if (!(startTime instanceof Date)) {
        startTime = new Date(startTime);
      }
      
      // If startTime is in the future (timezone issue), use session.startedAt from DB instead
      const now = new Date();
      if (startTime.getTime() > now.getTime()) {
        console.warn(`[Timer] startTime is in the future for session ${sessionId}, using DB startedAt instead`, {
          sessionId,
          stateStartTime: startTime.toISOString(),
          dbStartedAt: session.startedAt.toISOString(),
          now: now.toISOString(),
        });
        startTime = session.startedAt;
        // Update state with correct startTime
        state.startTime = startTime;
      }

      // Calculate elapsed time: (now - startTime) - totalPauseDuration
      // startTime is the original session start time (never adjusted)
      // We subtract totalPauseDuration to get the actual active time
      const totalElapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      const elapsedTime = Math.max(0, totalElapsed - state.totalPauseDuration);
      
      // Log that we're about to emit timer update (only every 10 seconds to reduce noise)
      if (elapsedTime % 10 === 0) {
        console.log(`[Timer] About to emit timer update for session ${sessionId}`, {
          sessionId,
          status: state.status,
          hasInterval: this.timers.has(sessionId),
          elapsedTime,
        });
      }

      // Debug logging for timer issues
      if (elapsedTime < 0) {
        console.error(`[Timer] Negative elapsed time detected for session ${sessionId}:`, {
          sessionId,
          startTime: startTime.toISOString(),
          pausedAt: state.pausedAt?.toISOString() || null,
          resumedAt: state.resumedAt?.toISOString() || null,
          elapsedTime,
          now: new Date().toISOString(),
        });
      }
      
      // Log if elapsed time is 0 for more than a few seconds (indicates timer not working)
      if (elapsedTime === 0 && Date.now() - state.lastDbSync > 5000) {
        const timeDiff = now.getTime() - startTime.getTime();
        console.warn(`[Timer] Elapsed time is 0 for session ${sessionId} after 5+ seconds:`, {
          sessionId,
          startTime: startTime.toISOString(),
          now: now.toISOString(),
          timeDiff,
          timeDiffSeconds: Math.floor(timeDiff / 1000),
          status: state.status,
        });
      }

      // Calculate remaining time (elapsed time already excludes pause duration)
      const remainingTime = Math.max(0, state.scheduledDuration - elapsedTime);

      // Get tasks for current task calculation (reuse intention from above)
      const taskIds: number[] = intention?.taskIds || [];
      const completedTaskIds: number[] = intention?.completedTasks || [];

      let currentTaskElapsed = 0;
      let currentTaskRemaining = 0;
      let currentTask = null;

      if (taskIds.length > 0) {
        // Fetch tasks
        const tasks = await prisma.task.findMany({
          where: { id: { in: taskIds } },
          select: { id: true, duration: true, title: true, category: true },
        });

        // Sort tasks by their order in taskIds array
        const sortedTasks = taskIds
          .map((id) => tasks.find((t) => t.id === id))
          .filter((t) => t !== undefined) as Array<{
          id: number;
          duration: number;
          title: string;
          category: string;
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
      
      // CRITICAL: Final check before emitting - if paused, abort immediately
      if (isPausedStatus(state.status)) {
        console.error(`[Timer] ❌ CRITICAL BUG: About to emit timer_update for PAUSED session ${sessionId}!`, {
          sessionId,
          status: state.status,
          hasInterval: this.timers.has(sessionId),
          elapsedTime,
          pausedAt: state.pausedAt?.toISOString() || null,
        });
        this.stopTimer(sessionId);
        return; // Don't emit anything
      }
      
      // Log every 10 seconds for debugging
      if (elapsedTime % 10 === 0) {
        console.log(`[Timer] Emitting update for session ${sessionId}`, {
          sessionId,
          userId: state.userId,
          roomName,
          elapsedTime,
          remainingTime,
          status: state.status,
          startTime: startTime.toISOString(),
          hasInterval: this.timers.has(sessionId),
        });
      }
      
      namespace.to(roomName).emit("timer_update", {
        sessionId,
        status: state.status,
        elapsedTime,
        remainingTime,
        currentTaskElapsed,
        currentTaskRemaining,
        startTime: startTime.toISOString(),
        pausedAt: state.pausedAt?.toISOString() || null,
        resumedAt: state.resumedAt?.toISOString() || null,
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
  async pauseTimer(sessionId: number) {
    const state = this.sessionStates.get(sessionId);
    if (!state) {
      console.warn(`[Timer] Cannot pause - no state found for session ${sessionId}`);
      return;
    }
    
    if (state.status !== "active") {
      console.log(`[Timer] Session ${sessionId} is already ${state.status}, skipping pause`);
      return;
    }

    console.log(`[Timer] ========== PAUSE TIMER CALLED ==========`, {
      sessionId,
      currentStatus: state.status,
      hasInterval: this.timers.has(sessionId),
      timersMapSize: this.timers.size,
      allActiveTimers: this.getActiveTimers(),
    });
    
    // Debug current state
    this.debugTimerState(sessionId);
    
    // CRITICAL: Stop timer FIRST before updating state
    console.log(`[Timer] Calling stopTimer for session ${sessionId}...`);
    this.stopTimer(sessionId);
    
    // Verify timer is stopped
    const stillHasInterval = this.timers.has(sessionId);
    if (stillHasInterval) {
      console.error(`[Timer] ❌ ERROR: Timer interval still exists after stopTimer for session ${sessionId}`);
      // Force stop again
      const interval = this.timers.get(sessionId);
      if (interval) {
        clearInterval(interval);
        this.timers.delete(sessionId);
        console.log(`[Timer] ✅ Force stopped timer interval for session ${sessionId}`);
      } else {
        console.error(`[Timer] ❌ Interval entry exists but interval is null/undefined for session ${sessionId}`);
        this.timers.delete(sessionId);
      }
    } else {
      console.log(`[Timer] ✅ Timer interval successfully removed for session ${sessionId}`);
    }
    
    // Then update state
    state.status = "paused";
    state.pausedAt = new Date();
    
    console.log(`[Timer] ========== PAUSE COMPLETE ==========`, {
      sessionId,
      newStatus: state.status,
      pausedAt: state.pausedAt.toISOString(),
      hasInterval: this.timers.has(sessionId),
      timersMapSize: this.timers.size,
      allActiveTimers: this.getActiveTimers(),
    });
    
    // Final verification
    this.debugTimerState(sessionId);

    // Calculate current elapsed time: (now - startTime) - totalPauseDuration
    // This gives us the actual active time, excluding all paused time
    const now = new Date();
    const totalElapsed = Math.floor((now.getTime() - state.startTime.getTime()) / 1000);
    const elapsedTime = Math.max(0, totalElapsed - state.totalPauseDuration);
    const remainingTime = Math.max(0, state.scheduledDuration - elapsedTime);

    console.log(`[Timer] Pausing session ${sessionId}`, {
      sessionId,
      elapsedTime,
      remainingTime,
      totalPauseDuration: state.totalPauseDuration,
      timerStopped: !this.timers.has(sessionId),
    });

    // Immediately sync pause duration to DB (even though paused, we want to save current state)
    // This prevents stale DB values from overwriting correct in-memory values later
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
        
        console.log(`[Timer] Immediately synced pause duration to DB on pause for session ${sessionId}`, {
          sessionId,
          totalPauseDuration: state.totalPauseDuration,
        });
      }
    } catch (error) {
      console.error(`[Timer] Error syncing pause duration to DB for session ${sessionId}:`, error);
      // Don't throw - pause should still succeed
    }

    // Verify timer is actually stopped
    if (this.timers.has(sessionId)) {
      console.error(`[Timer] WARNING: Timer interval still exists for paused session ${sessionId}, forcing stop`);
      this.stopTimer(sessionId);
    }

    // Emit pause event
    const namespace = this.io.of("/focus-session");
    namespace.to(`user-${state.userId}`).emit("session_paused", {
      session: {
        id: sessionId,
        status: "paused",
        pausedAt: state.pausedAt.toISOString(),
        elapsedTime, // Frozen elapsed time
      },
      timer: {
        sessionId,
        status: "paused",
        elapsedTime, // Frozen elapsed time
        remainingTime,
        pausedAt: state.pausedAt.toISOString(),
      },
    });
  }

  /**
   * Resume timer
   */
  async resumeTimer(sessionId: number, providedElapsedTime?: number) {
    const state = this.sessionStates.get(sessionId);
    if (!state || state.status !== "paused") return;

    const now = new Date();
    
    // Calculate pause duration for this pause cycle
    if (state.pausedAt) {
      const pauseDuration = Math.floor((now.getTime() - state.pausedAt.getTime()) / 1000);
      state.totalPauseDuration += pauseDuration;
      console.log(`[Timer] Resuming session ${sessionId}`, {
        sessionId,
        pauseDuration,
        totalPauseDuration: state.totalPauseDuration,
      });
    }

    // IMPORTANT: Do NOT adjust startTime - keep the original start time
    // We'll subtract totalPauseDuration when calculating elapsed time
    // startTime should always be the actual session start time

    state.status = "active";
    state.resumedAt = now;
    state.pausedAt = null; // Clear pausedAt since we've accounted for it

    // Calculate current elapsed time: (now - startTime) - totalPauseDuration
    // This gives us the actual active time, excluding all paused time
    const totalElapsed = Math.floor((now.getTime() - state.startTime.getTime()) / 1000);
    const elapsedTime = providedElapsedTime ?? Math.max(0, totalElapsed - state.totalPauseDuration);
    const remainingTime = Math.max(0, state.scheduledDuration - elapsedTime);

    // Restart timer interval
    const interval = setInterval(async () => {
      await this.updateTimer(sessionId);
    }, 1000);
    this.timers.set(sessionId, interval);

    console.log(`[Timer] Session ${sessionId} resumed`, {
      sessionId,
      elapsedTime,
      remainingTime,
      adjustedStartTime: state.startTime.toISOString(),
      totalPauseDuration: state.totalPauseDuration,
    });

    // Immediately sync pause duration to DB to prevent stale values
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
        
        console.log(`[Timer] Immediately synced pause duration to DB for session ${sessionId}`, {
          sessionId,
          totalPauseDuration: state.totalPauseDuration,
        });
      }
    } catch (error) {
      console.error(`[Timer] Error syncing pause duration to DB for session ${sessionId}:`, error);
      // Don't throw - resume should still succeed
    }

    // Emit resume event
    const namespace = this.io.of("/focus-session");
    namespace.to(`user-${state.userId}`).emit("session_resumed", {
      session: {
        id: sessionId,
        status: "active",
        resumedAt: now.toISOString(),
        elapsedTime, // Should continue from where it paused
      },
      timer: {
        sessionId,
        status: "active",
        elapsedTime, // Should continue from where it paused
        remainingTime,
        resumedAt: now.toISOString(),
      },
    });
  }

  /**
   * Stop timer
   */
  stopTimer(sessionId: number) {
    const hasInterval = this.timers.has(sessionId);
    const interval = this.timers.get(sessionId);
    
    console.log(`[Timer] stopTimer called for session ${sessionId}`, {
      sessionId,
      hasInterval,
      intervalExists: !!interval,
      timersMapSize: this.timers.size,
      allSessionIds: Array.from(this.timers.keys()),
    });
    
    if (interval) {
      clearInterval(interval);
      this.timers.delete(sessionId);
      console.log(`[Timer] ✅ Successfully stopped timer interval for session ${sessionId}`, {
        sessionId,
        timersMapSizeAfter: this.timers.size,
        stillHasInterval: this.timers.has(sessionId),
      });
    } else {
      // Timer was already stopped or never started
      if (this.timers.has(sessionId)) {
        // Edge case: entry exists but interval is null/undefined
        console.warn(`[Timer] Timer entry exists but interval is null for session ${sessionId}, cleaning up`);
        this.timers.delete(sessionId);
      } else {
        console.log(`[Timer] No timer interval found for session ${sessionId} (already stopped or never started)`);
      }
    }
  }

  /**
   * End timer and session
   */
  async endTimer(sessionId: number) {
    const state = this.sessionStates.get(sessionId);
    if (!state) return;

    this.stopTimer(sessionId);

    const elapsedTime = calculateElapsedTime(
      state.startTime,
      state.pausedAt,
      state.resumedAt
    );

    // Emit end event
    const namespace = this.io.of("/focus-session");
    namespace.to(`user-${state.userId}`).emit("session_ended", {
      session: {
        id: sessionId,
        status: "completed",
        endedAt: new Date().toISOString(),
        elapsedTime,
        actualDuration: elapsedTime,
      },
    });

    this.sessionStates.delete(sessionId);
  }

  /**
   * Get timer state for a session
   */
  async getTimerState(sessionId: number) {
    const session = await prisma.focusSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return null;
    }

    // Get scheduled duration from intention or calculate from tasks
    const intention = session.intention as any;
    let scheduledDuration = 0;
    const totalPauseDuration = intention?.totalPauseDuration || 0;

    if (intention?.scheduledDuration) {
      scheduledDuration = intention.scheduledDuration * 60; // Convert minutes to seconds
    } else if (intention?.taskIds && intention.taskIds.length > 0) {
      const tasks = await prisma.task.findMany({
        where: { id: { in: intention.taskIds } },
        select: { duration: true, category: true },
      });

      const category = intention.category;
      scheduledDuration =
        tasks
          .filter((t) => !category || t.category === category)
          .reduce((sum, t) => sum + t.duration, 0) * 60; // Convert to seconds
    } else if (session.duration) {
      scheduledDuration = session.duration * 60;
    }

    // Calculate elapsed time: (time - startTime) - totalPauseDuration
    const now = new Date();
    let elapsedTime = 0;
    
    if (session.status === "paused" && session.pausedAt) {
      // If paused, calculate elapsed time until pause
      const totalElapsed = Math.floor((session.pausedAt.getTime() - session.startedAt.getTime()) / 1000);
      elapsedTime = Math.max(0, totalElapsed - totalPauseDuration);
    } else {
      // If active, calculate current elapsed time
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
      await this.syncAllTimersToDb();
    }, 15000); // Every 15 seconds
  }

  /**
   * Sync all active timers to database
   */
  private async syncAllTimersToDb() {
    for (const [sessionId, state] of this.sessionStates.entries()) {
      if (state.status === "active") {
        try {
          // Calculate elapsed time: (now - startTime) - totalPauseDuration
          const now = new Date();
          const totalElapsed = Math.floor((now.getTime() - state.startTime.getTime()) / 1000);
          const elapsedTime = Math.max(0, totalElapsed - state.totalPauseDuration);

          // Update elapsed time and pause duration in intention JSON
          const session = await prisma.focusSession.findUnique({
            where: { id: sessionId },
            select: { intention: true },
          });

          if (session) {
            const intention = (session.intention as any) || {};
            intention.elapsedTime = elapsedTime;
            intention.totalPauseDuration = state.totalPauseDuration; // Store pause duration

            await prisma.focusSession.update({
              where: { id: sessionId },
              data: { intention },
            });

            state.lastDbSync = Date.now();
          }
        } catch (error) {
          console.error(
            `Error syncing timer to DB for session ${sessionId}:`,
            error
          );
        }
      }
    }
  }

  /**
   * Restore active sessions on server startup
   */
  async restoreActiveSessions() {
    try {
      const activeSessions = await prisma.focusSession.findMany({
        where: {
          status: { in: ["active", "paused"] },
          endedAt: null,
        },
      });

      for (const session of activeSessions) {
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
              .reduce((sum, t) => sum + t.duration, 0) * 60; // Convert to seconds
        } else if (intention?.scheduledDuration) {
          scheduledDuration = intention.scheduledDuration * 60;
        }

        // Ensure we have a valid duration
        if (scheduledDuration <= 0 && session.duration) {
          scheduledDuration = session.duration * 60; // Convert minutes to seconds
        }
        
        if (scheduledDuration <= 0) {
          console.warn(`[Timer] Skipping session ${session.id} - no valid duration`);
          continue;
        }

        if (session.status === "active") {
          // For active sessions, initialize state with pause/resume timestamps if they exist
          // Get total pause duration from intention (stored during sync) or calculate from timestamps
          const intention = session.intention as any;
          let totalPauseDuration = intention?.totalPauseDuration || 0;
          
          // If not in intention, calculate from timestamps (for backward compatibility)
          if (totalPauseDuration === 0 && session.pausedAt && session.resumedAt) {
            totalPauseDuration = Math.floor(
              (session.resumedAt.getTime() - session.pausedAt.getTime()) / 1000
            );
          }
          
          // IMPORTANT: Keep original startTime - do NOT adjust it
          // We'll subtract totalPauseDuration when calculating elapsed time
          
          const state: SessionTimerState = {
            sessionId: session.id,
            userId: session.userId,
            startTime: session.startedAt, // Original start time, never adjusted
            pausedAt: null, // Clear since we've accounted for it
            resumedAt: null, // Clear since we've accounted for it
            totalPauseDuration,
            scheduledDuration,
            status: "active",
            lastDbSync: Date.now(),
          };
          this.sessionStates.set(session.id, state);
          
          console.log(`[Timer] Restoring active session ${session.id}`, {
            sessionId: session.id,
            userId: session.userId,
            startTime: session.startedAt.toISOString(),
            scheduledDuration,
          });
          
          // Start timer interval
          const interval = setInterval(async () => {
            await this.updateTimer(session.id);
          }, 1000);
          this.timers.set(session.id, interval);
          
          // Emit initial update
          await this.updateTimer(session.id);
          } else if (session.status === "paused" && session.pausedAt) {
            // Calculate pause duration from previous pause/resume cycles
            const intention = session.intention as any;
            let totalPauseDuration = intention?.totalPauseDuration || 0;
            
            if (totalPauseDuration === 0 && session.resumedAt) {
              // If not in intention, calculate from timestamps (for backward compatibility)
              totalPauseDuration = Math.floor(
                (session.resumedAt.getTime() - session.pausedAt.getTime()) / 1000
              );
            }
            
            // IMPORTANT: Keep original startTime - do NOT adjust it
            // We'll subtract totalPauseDuration when calculating elapsed time
            
            // Create paused state
            const state: SessionTimerState = {
              sessionId: session.id,
              userId: session.userId,
              startTime: session.startedAt, // Original start time, never adjusted
              pausedAt: session.pausedAt, // Current pause
              resumedAt: null,
              totalPauseDuration,
              scheduledDuration,
              status: "paused",
              lastDbSync: Date.now(),
            };
            this.sessionStates.set(session.id, state);
            console.log(`[Timer] Restoring paused session ${session.id}`, {
              totalPauseDuration,
              pausedAt: session.pausedAt.toISOString(),
            });
          }
      }

      console.log(
        `Restored ${activeSessions.length} active focus sessions`
      );
    } catch (error) {
      console.error("Error restoring active sessions:", error);
    }
  }

  /**
   * Cleanup on shutdown
   */
  cleanup() {
    // Clear all timers
    for (const interval of this.timers.values()) {
      clearInterval(interval);
    }
    this.timers.clear();

    // Clear DB sync interval
    if (this.dbSyncInterval) {
      clearInterval(this.dbSyncInterval);
    }

    this.sessionStates.clear();
  }
}

