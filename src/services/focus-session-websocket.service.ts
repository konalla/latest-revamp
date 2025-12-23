import { Server as SocketIOServer, Socket, Namespace } from "socket.io";
import { verifyToken } from "../utils/jwt.utils.js";
import prisma from "../config/prisma.js";
import focusSessionService from "./focus-session.service.js";
import { FocusSessionTimerService } from "./focus-session-timer.service.js";
import { calculateTotalDurationFromTasks } from "../utils/focus-session.utils.js";

interface AuthenticatedSocket extends Socket {
  userId?: number;
}

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
        // Try to get token from auth object (preferred) or query params (fallback)
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;

        if (token && typeof token === "string") {
          try {
            const user = verifyToken(token) as any;
            const userId = user?.id ?? user?.userId;

            if (userId) {
              socket.userId = userId;
              next();
              return;
            }
          } catch (error) {
            // Token invalid, continue to check query params fallback
          }
        }

        // Fallback: Get userId from query params (for development/testing)
        const userId = socket.handshake.query.userId
          ? parseInt(socket.handshake.query.userId as string)
          : undefined;

        if (userId) {
          socket.userId = userId;
          next();
        } else {
          next(new Error("Authentication required"));
        }
      } catch (error) {
        next(new Error("Authentication failed"));
      }
    });
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers() {
    this.namespace.on("connection", (socket: AuthenticatedSocket) => {
      console.log(`Focus session client connected: ${socket.id}`);

      if (!socket.userId) {
        socket.emit("error", { message: "Authentication required" });
        socket.disconnect();
        return;
      }

      const userId = socket.userId;
      const userRoom = `user-${userId}`;

      // Auto-join user's room
      socket.join(userRoom);

      // Send current session info immediately
      this.sendSessionInfo(socket, userId);

      // Join focus session
      socket.on("join_focus_session", async () => {
        try {
          socket.join(userRoom);
          await this.sendSessionInfo(socket, userId);
        } catch (error: any) {
          console.error("Error joining focus session:", error);
          socket.emit("error", {
            message: error.message || "Failed to join focus session",
          });
        }
      });

      // Leave focus session
      socket.on("leave_focus_session", () => {
        socket.leave(userRoom);
      });

      // Sync timer
      socket.on("sync_timer", async (data: { sessionId?: number }) => {
        try {
          const sessionId = data?.sessionId;
          const timer = await this.timerService.getTimerState(
            sessionId || (await this.getActiveSessionId(userId)) || 0
          );

          if (timer) {
            socket.emit("timer_sync", timer);
          } else {
            socket.emit("error", { message: "Session not found" });
          }
        } catch (error: any) {
          console.error("Error syncing timer:", error);
          socket.emit("error", { message: "Failed to sync timer" });
        }
      });

      // Update task progress
      socket.on(
        "update_task_progress",
        async (data: { sessionId: number; taskId: number; completed: boolean }) => {
          try {
            if (!socket.userId) {
              socket.emit("error", { message: "Authentication required" });
              return;
            }

            const { sessionId, taskId, completed } = data;

            // Verify session belongs to user
            const session = await prisma.focusSession.findFirst({
              where: {
                id: sessionId,
                userId: socket.userId,
              },
              select: { intention: true },
            });

            if (!session) {
              socket.emit("error", { message: "Session not found" });
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

            // Update completed tasks in session intention
            const intention = (session.intention as any) || {};
            const completedTasks: number[] = intention.completedTasks || [];
            const taskIds: number[] = intention.taskIds || [];

            if (completed && !completedTasks.includes(taskId)) {
              completedTasks.push(taskId);
            } else if (!completed) {
              const index = completedTasks.indexOf(taskId);
              if (index > -1) {
                completedTasks.splice(index, 1);
              }
            }

            intention.completedTasks = completedTasks;

            await prisma.focusSession.update({
              where: { id: sessionId },
              data: { intention },
            });

            // Emit task progress updated
            socket.emit("task_progress_updated", {
              sessionId,
              taskId,
              completed,
              completedTasks,
            });

            // Check if all tasks are completed
            if (completedTasks.length === taskIds.length && taskIds.length > 0) {
              // Emit task completed event for the last task
              const lastTask = await prisma.task.findUnique({
                where: { id: taskId },
                select: { id: true, title: true, category: true, duration: true },
              });

              if (lastTask) {
                this.namespace.to(userRoom).emit("task_completed", {
                  sessionId,
                  taskId: lastTask.id,
                  completedTasks,
                  nextTask: null, // All tasks completed
                });
              }
            } else if (completed) {
              // Get next incomplete task
              const incompleteTaskIds = taskIds.filter(
                (id) => !completedTasks.includes(id)
              );
              if (incompleteTaskIds.length > 0) {
                const nextTask = await prisma.task.findUnique({
                  where: { id: incompleteTaskIds[0] },
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
          } catch (error: any) {
            console.error("Error updating task progress:", error);
            socket.emit("error", {
              message: error.message || "Failed to update task progress",
            });
          }
        }
      );

      // Disconnect
      socket.on("disconnect", () => {
        console.log(`Focus session client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Send current session info to client
   */
  private async sendSessionInfo(socket: AuthenticatedSocket, userId: number) {
    try {
      const session = await focusSessionService.getCurrentFocusSession(userId);

      if (!session) {
        // No active session
        socket.emit("focus_session_info", {
          session: null,
          currentTask: null,
        });
        return;
      }

      // Get tasks
      const taskIds = session.taskIds || [];
      let tasks: any[] = [];
      let currentTask = null;

      if (taskIds.length > 0) {
        tasks = await prisma.task.findMany({
          where: { id: { in: taskIds } },
          select: {
            id: true,
            title: true,
            category: true,
            duration: true,
            completed: true,
          },
        });

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
      socket.emit("error", { message: "Failed to get session info" });
    }
  }

  /**
   * Get active session ID for user
   */
  private async getActiveSessionId(userId: number): Promise<number | null> {
    const session = await focusSessionService.getCurrentFocusSession(userId);
    return session?.id || null;
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
        const tasks = await prisma.task.findMany({
          where: { id: { in: taskIds } },
          select: { duration: true, category: true },
        });

        scheduledDuration =
          calculateTotalDurationFromTasks(tasks, category) * 60; // Convert to seconds
      } else if (session.duration) {
        // Fallback to session duration if no tasks
        scheduledDuration = session.duration * 60; // Convert minutes to seconds
      }

      // Ensure we have a valid duration
      if (scheduledDuration <= 0) {
        console.warn(`[WebSocket] Invalid scheduled duration (${scheduledDuration}) for session ${sessionId}, using default 25 minutes`);
        scheduledDuration = 25 * 60; // Default to 25 minutes
      }

      console.log(`[WebSocket] Starting timer for session ${sessionId}`, {
        sessionId,
        userId,
        scheduledDuration,
        taskIds,
        category,
      });

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
          duration: scheduledDuration / 60, // Convert back to minutes
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
    console.log(`[WebSocket] broadcastSessionPaused called for session ${sessionId}`, {
      sessionId,
      userId,
    });
    await this.timerService.pauseTimer(sessionId);
    console.log(`[WebSocket] broadcastSessionPaused completed for session ${sessionId}`);
  }

  /**
   * Broadcast session resumed event
   */
  async broadcastSessionResumed(sessionId: number, userId: number, elapsedTime?: number) {
    await this.timerService.resumeTimer(sessionId, elapsedTime);
  }

  /**
   * Broadcast session ended event
   */
  async broadcastSessionEnded(sessionId: number, userId: number) {
    await this.timerService.endTimer(sessionId);
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
}
