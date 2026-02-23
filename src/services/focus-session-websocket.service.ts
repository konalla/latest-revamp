import { Server as SocketIOServer, Socket, Namespace } from "socket.io";
import { z } from "zod";
import { verifyToken } from "../utils/jwt.utils.js";
import prisma from "../config/prisma.js";
import focusSessionService from "./focus-session.service.js";
import { FocusSessionTimerService } from "./focus-session-timer.service.js";
import { sessionCacheService } from "./session-cache.service.js";
import { isRateLimited } from "../utils/rate-limiter.js";
import { calculateTotalDurationFromTasks } from "../utils/focus-session.utils.js";

interface AuthenticatedSocket extends Socket {
  userId?: number;
}

// Validation schemas using Zod
const syncTimerSchema = z.object({
  sessionId: z.number().int().positive().optional(),
});

const updateTaskProgressSchema = z.object({
  sessionId: z.number().int().positive(),
  taskId: z.number().int().positive(),
  completed: z.boolean(),
});

// Connection limits per user
const MAX_CONNECTIONS_PER_USER = 5;
const userConnections: Map<number, Set<string>> = new Map();

// Grace period before auto-ending a session after all sockets disconnect
const DISCONNECT_GRACE_PERIOD_MS = 60_000; // 60 seconds
const disconnectTimers: Map<number, NodeJS.Timeout> = new Map();

export class FocusSessionWebSocketService {
  private io: SocketIOServer;
  private namespace: Namespace;
  private timerService: FocusSessionTimerService;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.namespace = io.of("/focus-session");
    this.timerService = new FocusSessionTimerService(io);
    this.setupMiddleware();
    this.setupEventHandlers();
  }

  /**
   * Setup authentication middleware
   */
  private setupMiddleware() {
    this.namespace.use(async (socket: AuthenticatedSocket, next) => {
      try {
        // Get token from auth object (preferred) or query params (fallback for older clients)
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;

        if (!token || typeof token !== "string") {
          console.warn(`[WebSocket] Connection rejected - no token provided from ${socket.handshake.address}`);
          next(new Error("Authentication required"));
          return;
        }

        try {
          const user = verifyToken(token) as any;
          const userId = user?.id ?? user?.userId;

          if (!userId || typeof userId !== "number") {
            console.warn(`[WebSocket] Connection rejected - invalid token from ${socket.handshake.address}`);
            next(new Error("Invalid authentication token"));
            return;
          }

          // Check connection limit per user
          const connections = userConnections.get(userId) || new Set();
          if (connections.size >= MAX_CONNECTIONS_PER_USER) {
            console.warn(`[WebSocket] Connection rejected - user ${userId} has too many connections (${connections.size})`);
            next(new Error("Too many connections. Please close other sessions."));
            return;
          }

          socket.userId = userId;
          next();
        } catch (error) {
          console.warn(`[WebSocket] Token verification failed from ${socket.handshake.address}:`, error);
          next(new Error("Authentication failed - invalid or expired token"));
        }
      } catch (error) {
        console.error("[WebSocket] Middleware error:", error);
        next(new Error("Authentication failed"));
      }
    });
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers() {
    this.namespace.on("connection", (socket: AuthenticatedSocket) => {
      console.log(`[WebSocket] Client connected: ${socket.id}`);

      if (!socket.userId) {
        socket.emit("error", { message: "Authentication required" });
        socket.disconnect();
        return;
      }

      const userId = socket.userId;
      const userRoom = `user-${userId}`;

      // Track connection
      if (!userConnections.has(userId)) {
        userConnections.set(userId, new Set());
      }
      userConnections.get(userId)!.add(socket.id);

      // Cancel any pending disconnect grace period since user reconnected
      const pendingTimer = disconnectTimers.get(userId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        disconnectTimers.delete(userId);
        console.log(`[WebSocket] Cancelled disconnect grace period for user ${userId} (reconnected)`);
      }

      // Auto-join user's room
      socket.join(userRoom);

      // Send current session info immediately
      this.sendSessionInfo(socket, userId);

      // Join focus session
      socket.on("join_focus_session", async () => {
        try {
          // Rate limiting
          const limited = await isRateLimited(userId, "join_focus_session", socket.id);
          if (limited) {
            socket.emit("error", { message: "Too many requests. Please wait a moment.", code: "RATE_LIMITED" });
            return;
          }

          socket.join(userRoom);
          await this.sendSessionInfo(socket, userId);
        } catch (error: any) {
          console.error("Error joining focus session:", error);
          socket.emit("error", {
            message: "Failed to join focus session",
            code: "JOIN_ERROR",
          });
        }
      });

      // Leave focus session
      socket.on("leave_focus_session", async () => {
        try {
          const limited = await isRateLimited(userId, "leave_focus_session", socket.id);
          if (limited) return; // Silently ignore rate limited leave requests

          socket.leave(userRoom);
        } catch (error) {
          console.error("Error leaving focus session:", error);
        }
      });

      // Sync timer
      socket.on("sync_timer", async (data: unknown) => {
        try {
          // Rate limiting
          const limited = await isRateLimited(userId, "sync_timer", socket.id);
          if (limited) {
            socket.emit("error", { message: "Too many sync requests. Please wait.", code: "RATE_LIMITED" });
            return;
          }

          // Validate input
          const parseResult = syncTimerSchema.safeParse(data);
          if (!parseResult.success) {
            socket.emit("error", { message: "Invalid request data", code: "VALIDATION_ERROR" });
            return;
          }

          const { sessionId } = parseResult.data;
          const targetSessionId = sessionId || (await this.getActiveSessionId(userId)) || 0;

          if (!targetSessionId) {
            socket.emit("error", { message: "No active session found", code: "NO_SESSION" });
            return;
          }

          const timer = await this.timerService.getTimerState(targetSessionId);

          if (timer) {
            socket.emit("timer_sync", timer);
          } else {
            socket.emit("error", { message: "Session not found", code: "SESSION_NOT_FOUND" });
          }
        } catch (error: any) {
          console.error("Error syncing timer:", error);
          socket.emit("error", { message: "Failed to sync timer", code: "SYNC_ERROR" });
        }
      });

      // Update task progress
      socket.on("update_task_progress", async (data: unknown) => {
        try {
          if (!socket.userId) {
            socket.emit("error", { message: "Authentication required", code: "AUTH_REQUIRED" });
            return;
          }

          // Rate limiting
          const limited = await isRateLimited(userId, "update_task_progress", socket.id);
          if (limited) {
            socket.emit("error", { message: "Too many updates. Please wait.", code: "RATE_LIMITED" });
            return;
          }

          // Validate input
          const parseResult = updateTaskProgressSchema.safeParse(data);
          if (!parseResult.success) {
            socket.emit("error", { 
              message: "Invalid request data", 
              code: "VALIDATION_ERROR",
              details: parseResult.error.issues.map(i => i.message),
            });
            return;
          }

          const { sessionId, taskId, completed } = parseResult.data;

          // Verify session belongs to user (using cache)
          const session = await sessionCacheService.getSession(sessionId);
          
          if (!session || session.userId !== socket.userId) {
            socket.emit("error", { message: "Session not found or access denied", code: "ACCESS_DENIED" });
            return;
          }

          // Use atomic update with distributed lock
          const { completedTasks, success } = await sessionCacheService.atomicUpdateCompletedTasks(
            sessionId,
            taskId,
            completed
          );

          if (!success) {
            socket.emit("error", { message: "Could not update task. Please try again.", code: "UPDATE_FAILED" });
            return;
          }

          // Update task completion in database
          await prisma.task.updateMany({
            where: {
              id: taskId,
              userId: socket.userId,
            },
            data: { completed },
          });

          // Invalidate task cache
          await sessionCacheService.invalidateTasks([taskId]);

          // Emit task progress updated
          socket.emit("task_progress_updated", {
            sessionId,
            taskId,
            completed,
            completedTasks,
          });

          // Get task IDs from intention
          const intention = session.intention || {};
          const taskIds: number[] = intention.taskIds || [];

          // Check if all tasks are completed
          if (completedTasks.length === taskIds.length && taskIds.length > 0) {
            const lastTask = await prisma.task.findUnique({
              where: { id: taskId },
              select: { id: true, title: true, category: true, duration: true },
            });

            if (lastTask) {
              this.namespace.to(userRoom).emit("task_completed", {
                sessionId,
                taskId: lastTask.id,
                completedTasks,
                nextTask: null,
              });
            }
          } else if (completed) {
            // Get next incomplete task
            const incompleteTaskIds = taskIds.filter(
              (id: number) => !completedTasks.includes(id)
            );
            if (incompleteTaskIds.length > 0) {
              const firstIncompleteTaskId = incompleteTaskIds[0];
              if (firstIncompleteTaskId !== undefined) {
                const nextTask = await prisma.task.findUnique({
                  where: { id: firstIncompleteTaskId },
                  select: { id: true, title: true, category: true, duration: true },
                });

                if (nextTask) {
                  this.namespace.to(userRoom).emit("task_completed", {
                    sessionId,
                    taskId,
                    completedTasks,
                    nextTask: {
                      id: nextTask.id,
                      title: nextTask.title,
                      category: nextTask.category,
                      duration: nextTask.duration,
                    },
                  });
                }
              }
            }
          }
        } catch (error: any) {
          console.error("Error updating task progress:", error);
          socket.emit("error", {
            message: "Failed to update task progress",
            code: "UPDATE_ERROR",
          });
        }
      });

      // Disconnect
      socket.on("disconnect", (reason) => {
        console.log(`[WebSocket] Client disconnected: ${socket.id} (${reason})`);
        
        // Remove from connection tracking
        const connections = userConnections.get(userId);
        if (connections) {
          connections.delete(socket.id);
          if (connections.size === 0) {
            userConnections.delete(userId);

            // All sockets for this user are gone -- start grace period
            console.log(`[WebSocket] All connections closed for user ${userId}, starting ${DISCONNECT_GRACE_PERIOD_MS / 1000}s grace period`);
            const timer = setTimeout(() => {
              disconnectTimers.delete(userId);
              this.handleUserFullyDisconnected(userId);
            }, DISCONNECT_GRACE_PERIOD_MS);
            disconnectTimers.set(userId, timer);
          }
        }
      });

      // Error handling
      socket.on("error", (error) => {
        console.error(`[WebSocket] Socket error for ${socket.id}:`, error);
      });
    });
  }

  /**
   * Called after the grace period expires and the user has not reconnected.
   * Auto-ends any active session using the last known elapsed time.
   */
  private async handleUserFullyDisconnected(userId: number) {
    try {
      // Check if user actually reconnected in the meantime
      const connections = userConnections.get(userId);
      if (connections && connections.size > 0) {
        console.log(`[WebSocket] User ${userId} reconnected before grace period action, skipping auto-end`);
        return;
      }

      const session = await focusSessionService.getCurrentFocusSession(userId);
      if (!session) {
        console.log(`[WebSocket] No active session for user ${userId} after disconnect, nothing to end`);
        return;
      }

      // Use the last known elapsed time from the session (synced every 15s by timer service)
      const elapsedTime = session.elapsedTime && session.elapsedTime > 0 ? session.elapsedTime : 1;

      console.log(`[WebSocket] Auto-ending session ${session.id} for user ${userId} after disconnect (elapsedTime: ${elapsedTime}s)`);

      await focusSessionService.endFocusSession(session.id, userId, {
        reason: "interrupted",
        elapsedTime,
        notes: "Session auto-ended: user disconnected",
      });

      await this.timerService.endTimer(session.id);
      await sessionCacheService.invalidateSession(session.id);
      await sessionCacheService.clearUserActiveSession(userId);
    } catch (error) {
      console.error(`[WebSocket] Error auto-ending session for user ${userId} after disconnect:`, error);
    }
  }

  /**
   * Send current session info to client
   */
  private async sendSessionInfo(socket: AuthenticatedSocket, userId: number) {
    try {
      const session = await focusSessionService.getCurrentFocusSession(userId);

      if (!session) {
        socket.emit("focus_session_info", {
          session: null,
          currentTask: null,
        });
        return;
      }

      // Get tasks using cache
      const taskIds = session.taskIds || [];
      let tasks: any[] = [];
      let currentTask = null;

      if (taskIds.length > 0) {
        tasks = await sessionCacheService.getTasks(taskIds);

        // Get first incomplete task as current task
        const completedTasks = session.completedTasks || [];
        const incompleteTask = tasks.find((t) => !completedTasks.includes(t.id));
        currentTask = incompleteTask || tasks[0] || null;
      }

      socket.emit("focus_session_info", {
        session: {
          id: session.id,
          userId: session.userId,
          sessionType: session.sessionType,
          category: session.category,
          startTime: session.startTime.toISOString(),
          endTime: session.endTime?.toISOString() || null,
          status: session.status,
          isActive: session.isActive,
          taskIds: session.taskIds,
          completedTasks: session.completedTasks || [],
          elapsedTime: session.elapsedTime || 0,
          duration: session.duration,
        },
        currentTask: currentTask
          ? {
              id: currentTask.id,
              title: currentTask.title,
              category: currentTask.category,
              duration: currentTask.duration,
            }
          : null,
      });
    } catch (error) {
      console.error("Error sending session info:", error);
      socket.emit("error", { message: "Failed to get session info", code: "SESSION_INFO_ERROR" });
    }
  }

  /**
   * Get active session ID for user
   */
  private async getActiveSessionId(userId: number): Promise<number | null> {
    // Try cache first
    const cachedSessionId = await sessionCacheService.getUserActiveSessionId(userId);
    if (cachedSessionId) {
      return cachedSessionId;
    }

    // Fallback to service
    const session = await focusSessionService.getCurrentFocusSession(userId);
    if (session?.id) {
      await sessionCacheService.setUserActiveSessionId(userId, session.id);
      return session.id;
    }
    return null;
  }

  /**
   * Broadcast session started event
   */
  async broadcastSessionStarted(sessionId: number, userId: number) {
    try {
      const session = await prisma.focusSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) return;

      const intention = session.intention as any;
      const taskIds: number[] = intention?.taskIds || [];
      const category = intention?.category;

      // Calculate scheduled duration from tasks
      let scheduledDuration = 0;
      if (taskIds.length > 0) {
        const tasks = await sessionCacheService.getTasks(taskIds);

        scheduledDuration =
          calculateTotalDurationFromTasks(tasks, category) * 60;
      } else if (session.duration) {
        scheduledDuration = session.duration * 60;
      }

      // Ensure we have a valid duration
      if (scheduledDuration <= 0) {
        console.warn(`[WebSocket] Invalid scheduled duration (${scheduledDuration}) for session ${sessionId}, using default 25 minutes`);
        scheduledDuration = 25 * 60;
      }

      console.log(`[WebSocket] Starting timer for session ${sessionId}`, {
        sessionId,
        userId,
        scheduledDuration,
        taskIds,
        category,
      });

      // Cache user's active session
      await sessionCacheService.setUserActiveSessionId(userId, sessionId);

      // Start timer
      await this.timerService.startTimer(
        sessionId,
        userId,
        session.startedAt,
        scheduledDuration
      );

      // Get timer state
      const timer = await this.timerService.getTimerState(sessionId);

      const userRoom = `user-${userId}`;
      this.namespace.to(userRoom).emit("session_started", {
        session: {
          id: session.id,
          userId: session.userId,
          sessionType: session.sessionType,
          category,
          startTime: session.startedAt.toISOString(),
          status: session.status,
          isActive: true,
          taskIds,
          duration: scheduledDuration / 60,
        },
        timer: timer || {
          sessionId,
          status: "active",
          elapsedTime: 0,
          remainingTime: scheduledDuration,
          startTime: session.startedAt.toISOString(),
        },
      });
    } catch (error) {
      console.error("Error broadcasting session started:", error);
    }
  }

  /**
   * Broadcast session paused event
   */
  async broadcastSessionPaused(sessionId: number, userId: number) {
    console.log(`[WebSocket] broadcastSessionPaused called for session ${sessionId}`);
    await this.timerService.pauseTimer(sessionId);
    await sessionCacheService.invalidateSession(sessionId);
    console.log(`[WebSocket] broadcastSessionPaused completed for session ${sessionId}`);
  }

  /**
   * Broadcast session resumed event
   */
  async broadcastSessionResumed(sessionId: number, userId: number, elapsedTime?: number) {
    await this.timerService.resumeTimer(sessionId, elapsedTime);
    await sessionCacheService.invalidateSession(sessionId);
  }

  /**
   * Broadcast session ended event
   */
  async broadcastSessionEnded(sessionId: number, userId: number) {
    // skipDbUpdate=true because the caller (REST endpoint / beacon) already wrote to the DB
    await this.timerService.endTimer(sessionId, true);
    await sessionCacheService.invalidateSession(sessionId);
    await sessionCacheService.clearUserActiveSession(userId);
  }

  /**
   * Get timer service instance
   */
  getTimerService(): FocusSessionTimerService {
    return this.timerService;
  }

  /**
   * Restore active sessions on server startup
   */
  async restoreActiveSessions() {
    await this.timerService.restoreActiveSessions();
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup() {
    await this.timerService.cleanup();
    userConnections.clear();
    for (const timer of disconnectTimers.values()) {
      clearTimeout(timer);
    }
    disconnectTimers.clear();
  }
}
