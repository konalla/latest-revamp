import { Server as SocketIOServer, Socket } from "socket.io";
import { focusRoomSessionService } from "./focus-room-session.service.js";
import { focusRoomParticipantService } from "./focus-room-participant.service.js";
import { verifyToken } from "../utils/jwt.utils.js";
import prisma from "../config/prisma.js";

interface AuthenticatedSocket extends Socket {
  userId?: number;
}

export class FocusRoomWebSocketService {
  private io: SocketIOServer;
  private roomTimers: Map<number, NodeJS.Timeout> = new Map();

  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupMiddleware();
    this.setupEventHandlers();
    this.startTimerBroadcasts();
  }

  /**
   * Setup authentication middleware
   */
  private setupMiddleware() {
    this.io.use(async (socket: AuthenticatedSocket, next) => {
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
        // In production, this should be removed and only JWT should be used
        const userId = socket.handshake.query.userId
          ? parseInt(socket.handshake.query.userId as string)
          : undefined;

        if (userId) {
          socket.userId = userId;
          next();
        } else {
          // Allow connection but mark as unauthenticated
          // Some events will require authentication
          next();
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
    this.io.on("connection", (socket: AuthenticatedSocket) => {
      console.log(`Client connected: ${socket.id}`);

      // Join room
      socket.on("join_room", async (data: { roomId: number }) => {
        try {
          if (!socket.userId) {
            socket.emit("error", { message: "Authentication required" });
            return;
          }

          const { roomId } = data;
          const roomName = `room:${roomId}`;

          // Verify user has access to room
          const participant = await prisma.focusRoomParticipant.findFirst({
            where: {
              roomId,
              userId: socket.userId,
              status: { not: "LEFT" },
            },
          });

          if (!participant) {
            socket.emit("error", { message: "You are not a participant in this room" });
            return;
          }

          socket.join(roomName);

          // Get current room state
          const activeSession = await focusRoomSessionService.getActiveSession(roomId);
          const participants = await focusRoomParticipantService.getRoomParticipants(roomId);

          // Send room info to the joining client
          socket.emit("room_info", {
            roomId,
            activeSession: activeSession
              ? await focusRoomSessionService.getSessionTimer(activeSession.id)
              : null,
            participants: participants.map((p) => ({
              id: p.id,
              userId: p.userId,
              role: p.role,
              status: p.status,
              intention: p.intention,
              completion: p.shareCompletion ? p.completion : null,
              user: p.user,
            })),
          });

          // Notify others that someone joined
          socket.to(roomName).emit("participant_joined", {
            participant: participants.find((p) => p.userId === socket.userId),
          });
        } catch (error: any) {
          console.error("Error joining room:", error);
          socket.emit("error", { message: error.message || "Failed to join room" });
        }
      });

      // Leave room
      socket.on("leave_room", (data: { roomId: number }) => {
        const { roomId } = data;
        const roomName = `room:${roomId}`;
        socket.leave(roomName);

        // Notify others
        socket.to(roomName).emit("participant_left", {
          userId: socket.userId,
        });
      });

      // Update participant status
      socket.on("update_participant_status", async (data: { roomId: number; status: string }) => {
        try {
          if (!socket.userId) {
            socket.emit("error", { message: "Authentication required" });
            return;
          }

          const { roomId, status } = data;
          const participant = await focusRoomParticipantService.updateStatus(roomId, socket.userId, {
            status: status as any,
          });

          const roomName = `room:${roomId}`;
          this.io.to(roomName).emit("participant_status_updated", {
            participant: {
              id: participant.id,
              userId: participant.userId,
              status: participant.status,
              user: participant.user,
            },
          });
        } catch (error: any) {
          console.error("Error updating participant status:", error);
          socket.emit("error", { message: error.message || "Failed to update status" });
        }
      });

      // Update intention
      socket.on("update_intention", async (data: { roomId: number; intention: string }) => {
        try {
          if (!socket.userId) {
            socket.emit("error", { message: "Authentication required" });
            return;
          }

          const { roomId, intention } = data;
          const participant = await focusRoomParticipantService.updateIntention(roomId, socket.userId, {
            intention,
          });

          const roomName = `room:${roomId}`;
          this.io.to(roomName).emit("intention_updated", {
            participant: {
              id: participant.id,
              userId: participant.userId,
              intention: participant.intention,
              user: participant.user,
            },
          });
        } catch (error: any) {
          console.error("Error updating intention:", error);
          socket.emit("error", { message: error.message || "Failed to update intention" });
        }
      });

      // Request timer sync
      socket.on("sync_timer", async (data: { sessionId: number }) => {
        try {
          const { sessionId } = data;
          const timer = await focusRoomSessionService.getSessionTimer(sessionId);

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

      // Disconnect
      socket.on("disconnect", () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Broadcast timer updates to all active sessions
   */
  private startTimerBroadcasts() {
    setInterval(async () => {
      try {
        // Get all active sessions
        const activeSessions = await prisma.focusRoomSession.findMany({
          where: {
            status: { in: ["ACTIVE", "PAUSED"] },
          },
        });

        for (const session of activeSessions) {
          const timer = await focusRoomSessionService.getSessionTimer(session.id);
          const roomName = `room:${session.roomId}`;

          if (timer) {
            // Broadcast timer update
            this.io.to(roomName).emit("timer_update", timer);

            // Auto-end expired sessions
            if (timer.status === "COMPLETED" && session.status !== "COMPLETED") {
              try {
                await focusRoomSessionService.endSession(session.roomId, session.id);
                this.io.to(roomName).emit("session_ended", {
                  sessionId: session.id,
                  endedAt: new Date(),
                });
              } catch (error) {
                console.error(`Error auto-ending session ${session.id}:`, error);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error in timer broadcast:", error);
      }
    }, 1000); // Every second
  }

  /**
   * Broadcast session started event
   */
  broadcastSessionStarted(roomId: number, session: any, timer: any) {
    const roomName = `room:${roomId}`;
    this.io.to(roomName).emit("session_started", {
      session,
      timer,
    });
  }

  /**
   * Broadcast session paused event
   */
  broadcastSessionPaused(roomId: number, session: any, timer: any) {
    const roomName = `room:${roomId}`;
    this.io.to(roomName).emit("session_paused", {
      session,
      timer,
    });
  }

  /**
   * Broadcast session resumed event
   */
  broadcastSessionResumed(roomId: number, session: any, timer: any) {
    const roomName = `room:${roomId}`;
    this.io.to(roomName).emit("session_resumed", {
      session,
      timer,
    });
  }

  /**
   * Broadcast session ended event
   */
  broadcastSessionEnded(roomId: number, session: any) {
    const roomName = `room:${roomId}`;
    this.io.to(roomName).emit("session_ended", {
      session,
    });
  }
}

