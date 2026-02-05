/**
 * Focus Room WebSocket Service
 *
 * Handles real-time communication for focus room sessions including:
 * - Participant presence tracking (online/offline status)
 * - Session timer broadcasts
 * - Participant status and intention updates
 * - Room join/leave management
 *
 * @module services/focus-room-websocket
 */

import { Server as SocketIOServer, Socket } from "socket.io";
import { focusRoomSessionService } from "./focus-room-session.service.js";
import { focusRoomParticipantService } from "./focus-room-participant.service.js";
import { verifyToken } from "../utils/jwt.utils.js";
import type { UserJWTPayload } from "../types/auth.types.js";
import type {
  WebSocketSessionPayload,
  WebSocketTimerPayload,
} from "../types/focus-room-service.types.js";
import prisma from "../config/prisma.js";

// ============================================================================
// Types
// ============================================================================

/** Socket extended with authentication data */
interface AuthenticatedSocket extends Socket {
  userId?: number;
  currentRoomId?: number;
}

/** Participant status types */
type ParticipantStatus = "JOINED" | "FOCUSING" | "BREAK" | "IDLE" | "LEFT";

/** User information for participant */
interface ParticipantUser {
  id: number;
  username: string;
  email: string;
}

/** Participant data sent to clients */
interface ParticipantData {
  id: number;
  userId: number;
  role: string;
  status: string;
  intention: string | null;
  completion: string | null;
  user: ParticipantUser | null;
  isOnline: boolean;
}

/** Socket to user mapping for cleanup */
interface SocketUserMapping {
  userId: number;
  roomId: number;
}

// ============================================================================
// Constants
// ============================================================================

const LOG_PREFIX = "[FocusRoom WS]";
const TIMER_BROADCAST_INTERVAL_MS = 1000;

// ============================================================================
// Online Tracking State
// ============================================================================

/** Track online users per room: Map<roomId, Set<userId>> */
const roomOnlineUsers = new Map<number, Set<number>>();

/** Track socket to user mapping for cleanup on disconnect */
const socketToUser = new Map<string, SocketUserMapping>();

// ============================================================================
// Service Class
// ============================================================================

/**
 * Focus Room WebSocket Service
 *
 * Manages WebSocket connections and real-time events for focus rooms.
 */
export class FocusRoomWebSocketService {
  private readonly io: SocketIOServer;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupMiddleware();
    this.setupEventHandlers();
    this.startTimerBroadcasts();
  }

  // ==========================================================================
  // Authentication Middleware
  // ==========================================================================

  /**
   * Setup authentication middleware for WebSocket connections
   */
  private setupMiddleware(): void {
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = this.extractToken(socket);

        if (!token) {
          console.warn(`${LOG_PREFIX} Connection rejected - no token from ${socket.handshake.address}`);
          return next(new Error("Authentication required"));
        }

        const userId = this.verifyAndExtractUserId(token);

        if (!userId) {
          console.warn(`${LOG_PREFIX} Connection rejected - invalid token from ${socket.handshake.address}`);
          return next(new Error("Invalid authentication token"));
        }

        socket.userId = userId;
        next();
      } catch (error) {
        console.error(`${LOG_PREFIX} Middleware error:`, error);
        next(new Error("Authentication failed"));
      }
    });
  }

  /**
   * Extract token from socket handshake
   */
  private extractToken(socket: Socket): string | null {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    return typeof token === "string" ? token : null;
  }

  /**
   * Verify token and extract user ID
   */
  private verifyAndExtractUserId(token: string): number | null {
    try {
      const user = verifyToken(token) as UserJWTPayload;
      const userId = user?.userId;
      return typeof userId === "number" ? userId : null;
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // Online Tracking
  // ==========================================================================

  /**
   * Check if a user is online in a room
   */
  isUserOnline(roomId: number, userId: number): boolean {
    return roomOnlineUsers.get(roomId)?.has(userId) ?? false;
  }

  /**
   * Get all online user IDs for a room
   */
  getOnlineUsers(roomId: number): number[] {
    const onlineSet = roomOnlineUsers.get(roomId);
    return onlineSet ? Array.from(onlineSet) : [];
  }

  /**
   * Add user to online tracking (in-memory for real-time participant list)
   * Note: Database isOnline status is managed by focus-room-session.service when sessions start/end
   */
  private addUserOnline(roomId: number, userId: number, socketId: string): void {
    if (!roomOnlineUsers.has(roomId)) {
      roomOnlineUsers.set(roomId, new Set());
    }
    roomOnlineUsers.get(roomId)!.add(userId);
    socketToUser.set(socketId, { userId, roomId });
    console.log(`${LOG_PREFIX} User ${userId} joined room ${roomId} (WebSocket presence)`);
  }

  /**
   * Remove user from online tracking (in-memory for real-time participant list)
   * Only removes if no other sockets for this user exist in the room
   * Note: Database isOnline status is managed by focus-room-session.service when sessions end
   */
  private removeUserOnline(socketId: string): SocketUserMapping | null {
    const mapping = socketToUser.get(socketId);
    if (!mapping) return null;

    const { userId, roomId } = mapping;
    socketToUser.delete(socketId);

    // Check if user has other sockets in this room
    const hasOtherSocketInRoom = Array.from(socketToUser.entries()).some(
      ([, otherMapping]) => otherMapping.userId === userId && otherMapping.roomId === roomId
    );

    if (!hasOtherSocketInRoom) {
      const onlineSet = roomOnlineUsers.get(roomId);
      if (onlineSet) {
        onlineSet.delete(userId);
        if (onlineSet.size === 0) {
          roomOnlineUsers.delete(roomId);
        }
        console.log(`${LOG_PREFIX} User ${userId} left room ${roomId} (WebSocket presence)`);
      }
    }

    return mapping;
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    this.io.on("connection", (socket: AuthenticatedSocket) => {
      console.log(`${LOG_PREFIX} Client connected: ${socket.id}`);

      if (!socket.userId) {
        socket.emit("error", { message: "Authentication required" });
        socket.disconnect();
        return;
      }

      this.setupJoinRoomHandler(socket);
      this.setupLeaveRoomHandler(socket);
      this.setupParticipantStatusHandler(socket);
      this.setupIntentionHandler(socket);
      this.setupTimerSyncHandler(socket);
      this.setupParticipantsListHandler(socket);
      this.setupDisconnectHandler(socket);
    });
  }

  /**
   * Handle join_room event
   */
  private setupJoinRoomHandler(socket: AuthenticatedSocket): void {
    socket.on("join_room", async (data: { roomId: number }) => {
      try {
        const userId = socket.userId!;
        const { roomId } = data;
        const roomName = this.getRoomName(roomId);

        // Verify access
        const participant = await this.verifyRoomAccess(roomId, userId);
        if (!participant) {
          socket.emit("error", { message: "You are not a participant in this room" });
          return;
        }

        // Leave previous room if switching
        await this.handleRoomSwitch(socket, roomId);

        // Join new room
        socket.join(roomName);
        socket.currentRoomId = roomId;
        this.addUserOnline(roomId, userId, socket.id);

        // Send room info
        await this.sendRoomInfo(socket, roomId);

        // Notify others
        const participants = await focusRoomParticipantService.getRoomParticipants(roomId);
        const participantData = participants.find((p) => p.userId === userId);
        const activeSession = await focusRoomSessionService.getActiveSession(roomId);
        const hasActiveSession = activeSession !== null && 
          (activeSession.status === "ACTIVE" || activeSession.status === "PAUSED");

        socket.to(roomName).emit("participant_joined", {
          participant: participantData 
            ? this.mapParticipant(participantData, this.isParticipantFocusing(participantData.status, hasActiveSession)) 
            : null,
        });

        // Only emit participant_online if session is active and user is focusing
        if (participantData && this.isParticipantFocusing(participantData.status, hasActiveSession)) {
          socket.to(roomName).emit("participant_online", {
            participantId: participant.id,
            userId,
          });
        }
      } catch (error) {
        this.handleError(socket, "joining room", error);
      }
    });
  }

  /**
   * Handle leave_room event
   */
  private setupLeaveRoomHandler(socket: AuthenticatedSocket): void {
    socket.on("leave_room", (data: { roomId: number }) => {
      const { roomId } = data;
      const roomName = this.getRoomName(roomId);

      const mapping = this.removeUserOnline(socket.id);
      socket.leave(roomName);
      delete socket.currentRoomId;

      if (mapping) {
        socket.to(roomName).emit("participant_left", { userId: socket.userId });
        socket.to(roomName).emit("participant_offline", { userId: socket.userId });
      }
    });
  }

  /**
   * Handle update_participant_status event
   */
  private setupParticipantStatusHandler(socket: AuthenticatedSocket): void {
    socket.on("update_participant_status", async (data: { roomId: number; status: string }) => {
      try {
        const userId = socket.userId!;
        const { roomId, status } = data;

        const participant = await focusRoomParticipantService.updateStatus(roomId, userId, {
          status: status as ParticipantStatus,
        });

        const activeSession = await focusRoomSessionService.getActiveSession(roomId);
        const hasActiveSession = activeSession !== null && 
          (activeSession.status === "ACTIVE" || activeSession.status === "PAUSED");

        const roomName = this.getRoomName(roomId);
        this.io.to(roomName).emit("participant_status_updated", {
          participant: this.mapParticipant(
            participant, 
            this.isParticipantFocusing(participant.status, hasActiveSession)
          ),
        });
      } catch (error) {
        this.handleError(socket, "updating participant status", error);
      }
    });
  }

  /**
   * Handle update_intention event
   */
  private setupIntentionHandler(socket: AuthenticatedSocket): void {
    socket.on("update_intention", async (data: { roomId: number; intention: string }) => {
      try {
        const userId = socket.userId!;
        const { roomId, intention } = data;

        const participant = await focusRoomParticipantService.updateIntention(roomId, userId, {
          intention,
        });

        const activeSession = await focusRoomSessionService.getActiveSession(roomId);
        const hasActiveSession = activeSession !== null && 
          (activeSession.status === "ACTIVE" || activeSession.status === "PAUSED");

        const roomName = this.getRoomName(roomId);
        this.io.to(roomName).emit("intention_updated", {
          participant: this.mapParticipant(
            participant, 
            this.isParticipantFocusing(participant.status, hasActiveSession)
          ),
        });
      } catch (error) {
        this.handleError(socket, "updating intention", error);
      }
    });
  }

  /**
   * Handle sync_timer event
   */
  private setupTimerSyncHandler(socket: AuthenticatedSocket): void {
    socket.on("sync_timer", async (data: { sessionId: number }) => {
      try {
        const { sessionId } = data;
        const timer = await focusRoomSessionService.getSessionTimer(sessionId);

        if (timer) {
          socket.emit("timer_sync", timer);
        } else {
          socket.emit("error", { message: "Session not found" });
        }
      } catch (error) {
        this.handleError(socket, "syncing timer", error);
      }
    });
  }

  /**
   * Handle get_participants event
   */
  private setupParticipantsListHandler(socket: AuthenticatedSocket): void {
    socket.on("get_participants", async (data: { roomId: number }) => {
      try {
        const { roomId } = data;
        const participants = await focusRoomParticipantService.getRoomParticipants(roomId);
        const activeSession = await focusRoomSessionService.getActiveSession(roomId);
        const hasActiveSession = activeSession !== null && 
          (activeSession.status === "ACTIVE" || activeSession.status === "PAUSED");

        socket.emit("participants_list", {
          participants: participants.map((p) =>
            this.mapParticipant(p, this.isParticipantFocusing(p.status, hasActiveSession))
          ),
        });
      } catch (error) {
        this.handleError(socket, "getting participants", error);
      }
    });
  }

  /**
   * Handle disconnect event
   */
  private setupDisconnectHandler(socket: AuthenticatedSocket): void {
    socket.on("disconnect", (reason) => {
      console.log(`${LOG_PREFIX} Client disconnected: ${socket.id} (${reason})`);

      const mapping = this.removeUserOnline(socket.id);
      if (mapping) {
        const roomName = this.getRoomName(mapping.roomId);
        socket.to(roomName).emit("participant_offline", { userId: mapping.userId });
      }
    });
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Get Socket.IO room name for a focus room
   */
  private getRoomName(roomId: number): string {
    return `room:${roomId}`;
  }

  /**
   * Verify user has access to a room
   */
  private async verifyRoomAccess(
    roomId: number,
    userId: number
  ): Promise<{ id: number; userId: number } | null> {
    const participant = await prisma.focusRoomParticipant.findFirst({
      where: {
        roomId,
        userId,
        status: { not: "LEFT" },
      },
      select: { id: true, userId: true },
    });

    return participant;
  }

  /**
   * Handle room switching (leave previous room)
   */
  private async handleRoomSwitch(socket: AuthenticatedSocket, newRoomId: number): Promise<void> {
    if (socket.currentRoomId && socket.currentRoomId !== newRoomId) {
      const prevRoomName = this.getRoomName(socket.currentRoomId);
      socket.leave(prevRoomName);

      const mapping = this.removeUserOnline(socket.id);
      if (mapping) {
        socket.to(prevRoomName).emit("participant_offline", {
          userId: socket.userId,
        });
      }
    }
  }

  /**
   * Send room info to a socket
   */
  private async sendRoomInfo(socket: AuthenticatedSocket, roomId: number): Promise<void> {
    const activeSession = await focusRoomSessionService.getActiveSession(roomId);
    const participants = await focusRoomParticipantService.getRoomParticipants(roomId);
    const hasActiveSession = activeSession !== null && 
      (activeSession.status === "ACTIVE" || activeSession.status === "PAUSED");

    socket.emit("room_info", {
      roomId,
      activeSession: activeSession
        ? await focusRoomSessionService.getSessionTimer(activeSession.id)
        : null,
      participants: participants.map((p) =>
        this.mapParticipant(p, this.isParticipantFocusing(p.status, hasActiveSession))
      ),
    });
  }

  /**
   * Determine if a participant is "online" (actively focusing)
   * A participant is online only when:
   * 1. There is an active/paused session in the room
   * 2. The participant's status is FOCUSING
   */
  private isParticipantFocusing(participantStatus: string, hasActiveSession: boolean): boolean {
    if (!hasActiveSession) return false;
    return participantStatus === "FOCUSING";
  }

  /**
   * Map participant to client format
   */
  private mapParticipant(
    participant: {
      id: number;
      userId: number;
      role: string;
      status: string;
      intention: string | null;
      completion?: string | null;
      shareCompletion?: boolean;
      user: { id: number; username: string; email: string } | null;
    },
    isOnline: boolean
  ): ParticipantData {
    return {
      id: participant.id,
      userId: participant.userId,
      role: participant.role,
      status: participant.status,
      intention: participant.intention,
      completion: participant.shareCompletion ? (participant.completion ?? null) : null,
      user: participant.user,
      isOnline,
    };
  }

  /**
   * Handle and emit error
   */
  private handleError(socket: Socket, action: string, error: unknown): void {
    const message = error instanceof Error ? error.message : `Failed to ${action}`;
    console.error(`${LOG_PREFIX} Error ${action}:`, error);
    socket.emit("error", { message });
  }

  // ==========================================================================
  // Timer Broadcasts
  // ==========================================================================

  /**
   * Start periodic timer broadcasts for all active sessions
   */
  private startTimerBroadcasts(): void {
    setInterval(async () => {
      try {
        await this.broadcastAllActiveTimers();
      } catch (error) {
        console.error(`${LOG_PREFIX} Error in timer broadcast:`, error);
      }
    }, TIMER_BROADCAST_INTERVAL_MS);
  }

  /**
   * Broadcast timer updates to all active sessions
   */
  private async broadcastAllActiveTimers(): Promise<void> {
    const sessions = await prisma.focusRoomSession.findMany({
      where: {
        status: { in: ["ACTIVE", "PAUSED"] },
      },
      select: {
        id: true,
        roomId: true,
        status: true,
      },
    });

    for (const session of sessions) {
      await this.broadcastTimerForSession(session);
    }
  }

  /**
   * Broadcast timer for a single session
   */
  private async broadcastTimerForSession(session: {
    id: number;
    roomId: number;
    status: string;
  }): Promise<void> {
    const timer = await focusRoomSessionService.getSessionTimer(session.id);
    if (!timer) return;

    const roomName = this.getRoomName(session.roomId);

    // Only broadcast timer_update for ACTIVE sessions
    if (session.status === "ACTIVE" && timer.status === "ACTIVE") {
      this.io.to(roomName).emit("timer_update", timer);
    }

    // Auto-end expired sessions
    if (timer.status === "COMPLETED" && session.status !== "COMPLETED") {
      try {
        await focusRoomSessionService.endSession(session.roomId, session.id);
        this.io.to(roomName).emit("session_ended", {
          sessionId: session.id,
          endedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error(`${LOG_PREFIX} Error auto-ending session ${session.id}:`, error);
      }
    }
  }

  // ==========================================================================
  // Public Broadcast Methods
  // ==========================================================================

  /**
   * Broadcast session started event and update participant statuses
   */
  async broadcastSessionStarted(
    roomId: number,
    session: WebSocketSessionPayload,
    timer: WebSocketTimerPayload
  ): Promise<void> {
    const roomName = this.getRoomName(roomId);
    this.io.to(roomName).emit("session_started", { session, timer });
    // Broadcast updated participant statuses (isOnline will now be based on FOCUSING status)
    await this.broadcastParticipantsUpdate(roomId);
  }

  /**
   * Broadcast session paused event and update participant statuses
   */
  async broadcastSessionPaused(
    roomId: number,
    session: WebSocketSessionPayload,
    timer: WebSocketTimerPayload
  ): Promise<void> {
    const roomName = this.getRoomName(roomId);
    this.io.to(roomName).emit("session_paused", { session, timer });
    // Broadcast updated participant statuses
    await this.broadcastParticipantsUpdate(roomId);
  }

  /**
   * Broadcast session resumed event and update participant statuses
   */
  async broadcastSessionResumed(
    roomId: number,
    session: WebSocketSessionPayload,
    timer: WebSocketTimerPayload
  ): Promise<void> {
    const roomName = this.getRoomName(roomId);
    this.io.to(roomName).emit("session_resumed", { session, timer });
    // Broadcast updated participant statuses
    await this.broadcastParticipantsUpdate(roomId);
  }

  /**
   * Broadcast session ended event and update participant statuses
   */
  async broadcastSessionEnded(roomId: number, session: WebSocketSessionPayload): Promise<void> {
    const roomName = this.getRoomName(roomId);
    this.io.to(roomName).emit("session_ended", { session });
    // Broadcast updated participant statuses (all will be offline now)
    await this.broadcastParticipantsUpdate(roomId);
  }

  /**
   * Broadcast participants update with online status based on session state
   */
  async broadcastParticipantsUpdate(roomId: number): Promise<void> {
    const roomName = this.getRoomName(roomId);
    const participants = await focusRoomParticipantService.getRoomParticipants(roomId);
    const activeSession = await focusRoomSessionService.getActiveSession(roomId);
    const hasActiveSession = activeSession !== null && 
      (activeSession.status === "ACTIVE" || activeSession.status === "PAUSED");

    this.io.to(roomName).emit("participants_updated", {
      participants: participants.map((p) =>
        this.mapParticipant(p, this.isParticipantFocusing(p.status, hasActiveSession))
      ),
    });
  }
}
