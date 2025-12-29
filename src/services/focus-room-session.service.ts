import prisma from "../config/prisma.js";
import { Prisma } from "@prisma/client";
import type { StartSessionInput } from "../types/focus-room.types.js";
import {
  calculateRemainingTime,
  isSessionEnded,
  calculateActualDuration,
} from "../utils/focus-room.utils.js";

export class FocusRoomSessionService {
  /**
   * Start a new focus session in a room (creator only)
   */
  async startSession(roomId: number, userId: number, data?: StartSessionInput) {
    // Verify user is creator
    const room = await prisma.focusRoom.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new Error("Room not found");
    }

    if (room.creatorId !== userId) {
      throw new Error("Only room creator can start a session");
    }

    // Check if there's already an active session
    const activeSession = await prisma.focusRoomSession.findFirst({
      where: {
        roomId,
        status: { in: ["ACTIVE", "PAUSED"] },
      },
    });

    if (activeSession) {
      throw new Error("A session is already in progress");
    }

    // Use provided duration or room default
    const durationMinutes = data?.duration || room.focusDuration;
    const scheduledDuration = durationMinutes * 60; // Convert to seconds

    // Use database transaction to ensure atomicity
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

      return newSession;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    return session;
  }

  /**
   * Pause an active session (creator only)
   */
  async pauseSession(roomId: number, sessionId: number, userId: number) {
    // Verify user is creator
    const room = await prisma.focusRoom.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new Error("Room not found");
    }

    if (room.creatorId !== userId) {
      throw new Error("Only room creator can pause a session");
    }

    const session = await prisma.focusRoomSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error("Session not found");
    }

    if (session.status !== "ACTIVE") {
      throw new Error("Only active sessions can be paused");
    }

    return prisma.focusRoomSession.update({
      where: { id: sessionId },
      data: {
        status: "PAUSED",
        pausedAt: new Date(),
      },
    });
  }

  /**
   * Resume a paused session (creator only)
   */
  async resumeSession(roomId: number, sessionId: number, userId: number) {
    // Verify user is creator
    const room = await prisma.focusRoom.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new Error("Room not found");
    }

    if (room.creatorId !== userId) {
      throw new Error("Only room creator can resume a session");
    }

    const session = await prisma.focusRoomSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error("Session not found");
    }

    if (session.status !== "PAUSED") {
      throw new Error("Only paused sessions can be resumed");
    }

    return prisma.focusRoomSession.update({
      where: { id: sessionId },
      data: {
        status: "ACTIVE",
        resumedAt: new Date(),
      },
    });
  }

  /**
   * End a session (creator only, or auto-end when timer reaches zero)
   */
  async endSession(roomId: number, sessionId: number, userId?: number) {
    const session = await prisma.focusRoomSession.findUnique({
      where: { id: sessionId },
      include: { room: true },
    });

    if (!session) {
      throw new Error("Session not found");
    }

    // If userId provided, verify creator (for manual end)
    if (userId && session.room.creatorId !== userId) {
      throw new Error("Only room creator can manually end a session");
    }

    if (session.status === "COMPLETED") {
      return session; // Already completed
    }

    const endedAt = new Date();
    const actualDuration = calculateActualDuration(
      session.startedAt,
      endedAt,
      session.pausedAt,
      session.resumedAt
    );

    // Use transaction to update session and participant statuses
    return prisma.$transaction(async (tx) => {
      // Update session
      const updatedSession = await tx.focusRoomSession.update({
        where: { id: sessionId },
        data: {
          status: "COMPLETED",
          endedAt,
          actualDuration,
        },
      });

      // Update all participants to "IDLE" status
      await tx.focusRoomParticipant.updateMany({
        where: {
          roomId,
          status: { not: "LEFT" },
        },
        data: {
          status: "IDLE",
        },
      });

      return updatedSession;
    });
  }

  /**
   * Get active session for a room
   */
  async getActiveSession(roomId: number) {
    return prisma.focusRoomSession.findFirst({
      where: {
        roomId,
        status: { in: ["ACTIVE", "PAUSED"] },
      },
      include: {
        room: {
          select: {
            focusDuration: true,
            breakDuration: true,
          },
        },
      },
    });
  }

  /**
   * Get session by ID
   */
  async getSessionById(sessionId: number) {
    return prisma.focusRoomSession.findUnique({
      where: { id: sessionId },
      include: {
        room: {
          include: {
            participants: {
              where: {
                status: { not: "LEFT" },
              },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    email: true,
                    profile_photo_url: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Get session timer info (remaining time, status)
   */
  async getSessionTimer(sessionId: number) {
    const session = await prisma.focusRoomSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return null;
    }

    const remainingTime = calculateRemainingTime(
      session.startedAt,
      session.scheduledDuration,
      session.pausedAt,
      session.resumedAt
    );

    const hasEnded = isSessionEnded(
      session.startedAt,
      session.scheduledDuration,
      session.pausedAt,
      session.resumedAt
    );

    return {
      sessionId: session.id,
      status: hasEnded ? "COMPLETED" : session.status,
      remainingTime,
      startedAt: session.startedAt,
      scheduledDuration: session.scheduledDuration,
      pausedAt: session.pausedAt,
      resumedAt: session.resumedAt,
    };
  }

  /**
   * Check and auto-end expired sessions
   * This should be called periodically or on-demand
   */
  async checkAndEndExpiredSessions() {
    const activeSessions = await prisma.focusRoomSession.findMany({
      where: {
        status: { in: ["ACTIVE", "PAUSED"] },
      },
    });

    const expiredSessions = [];

    for (const session of activeSessions) {
      const hasEnded = isSessionEnded(
        session.startedAt,
        session.scheduledDuration,
        session.pausedAt,
        session.resumedAt
      );

      if (hasEnded && session.status !== "COMPLETED") {
        try {
          await this.endSession(session.roomId, session.id);
          expiredSessions.push(session.id);
        } catch (error) {
          console.error(`Error ending expired session ${session.id}:`, error);
        }
      }
    }

    return expiredSessions;
  }

  /**
   * Get session history for a room
   */
  async getSessionHistory(roomId: number, limit: number = 20) {
    return prisma.focusRoomSession.findMany({
      where: {
        roomId,
        status: "COMPLETED",
      },
      orderBy: {
        endedAt: "desc",
      },
      take: limit,
      include: {
        _count: {
          select: {
            // We'll need to count participants who were in this session
            // This might require a separate table or we track it differently
          },
        },
      },
    });
  }
}

export const focusRoomSessionService = new FocusRoomSessionService();

