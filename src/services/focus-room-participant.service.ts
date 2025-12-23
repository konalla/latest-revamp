import prisma from "../config/prisma.js";
import type {
  JoinRoomInput,
  UpdateParticipantIntentionInput,
  UpdateParticipantCompletionInput,
  UpdateParticipantStatusInput,
} from "../types/focus-room.types.js";
import { focusRoomService } from "./focus-room.service.js";

export class FocusRoomParticipantService {
  /**
   * Join a room as a participant
   */
  async joinRoom(roomId: number, userId: number, data: JoinRoomInput) {
    // Check if room exists
    const room = await prisma.focusRoom.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new Error("Room not found");
    }

    // Check if room is full
    const isFull = await focusRoomService.isRoomFull(roomId);
    if (isFull) {
      throw new Error("Room is full. Maximum 10 participants allowed.");
    }

    // Verify password if required
    if (room.requiresPassword) {
      if (!data.password) {
        throw new Error("This room requires a password");
      }

      const isValid = await focusRoomService.verifyRoomPassword(roomId, data.password);
      if (!isValid) {
        throw new Error("Invalid password");
      }
    }

    // Check if user is already a participant
    const existingParticipant = await prisma.focusRoomParticipant.findUnique({
      where: {
        room_user_idx: {
          roomId,
          userId,
        },
      },
    });

    if (existingParticipant) {
      // If they left, rejoin them
      if (existingParticipant.status === "LEFT") {
        return prisma.focusRoomParticipant.update({
          where: { id: existingParticipant.id },
          data: {
            status: "JOINED",
            leftAt: null,
            intention: data.intention || null,
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
            room: {
              select: {
                id: true,
                name: true,
                focusDuration: true,
                breakDuration: true,
              },
            },
          },
        });
      }

      // Already joined, return existing
      return prisma.focusRoomParticipant.findUnique({
        where: { id: existingParticipant.id },
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
          room: {
            select: {
              id: true,
              name: true,
              focusDuration: true,
              breakDuration: true,
            },
          },
        },
      });
    }

    // Create new participant
    return prisma.focusRoomParticipant.create({
      data: {
        roomId,
        userId,
        role: data.role || "PARTICIPANT",
        status: "JOINED",
        intention: data.intention || null,
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
        room: {
          select: {
            id: true,
            name: true,
            focusDuration: true,
            breakDuration: true,
          },
        },
      },
    });
  }

  /**
   * Leave a room
   */
  async leaveRoom(roomId: number, userId: number) {
    const participant = await prisma.focusRoomParticipant.findUnique({
      where: {
        room_user_idx: {
          roomId,
          userId,
        },
      },
    });

    if (!participant) {
      throw new Error("You are not a participant in this room");
    }

    // Don't allow creator to leave
    if (participant.role === "CREATOR") {
      throw new Error("Room creator cannot leave the room. Delete the room instead.");
    }

    return prisma.focusRoomParticipant.update({
      where: { id: participant.id },
      data: {
        status: "LEFT",
        leftAt: new Date(),
      },
    });
  }

  /**
   * Get all participants in a room
   */
  async getRoomParticipants(roomId: number) {
    return prisma.focusRoomParticipant.findMany({
      where: {
        roomId,
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
      orderBy: [
        { role: "asc" }, // Creator first
        { joinedAt: "asc" },
      ],
    });
  }

  /**
   * Get participant by ID
   */
  async getParticipantById(participantId: number) {
    return prisma.focusRoomParticipant.findUnique({
      where: { id: participantId },
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
        room: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Update participant intention
   */
  async updateIntention(
    roomId: number,
    userId: number,
    data: UpdateParticipantIntentionInput
  ) {
    const participant = await prisma.focusRoomParticipant.findUnique({
      where: {
        room_user_idx: {
          roomId,
          userId,
        },
      },
    });

    if (!participant) {
      throw new Error("You are not a participant in this room");
    }

    return prisma.focusRoomParticipant.update({
      where: { id: participant.id },
      data: {
        intention: data.intention,
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
    });
  }

  /**
   * Update participant completion notes
   */
  async updateCompletion(
    roomId: number,
    userId: number,
    data: UpdateParticipantCompletionInput
  ) {
    const participant = await prisma.focusRoomParticipant.findUnique({
      where: {
        room_user_idx: {
          roomId,
          userId,
        },
      },
    });

    if (!participant) {
      throw new Error("You are not a participant in this room");
    }

    return prisma.focusRoomParticipant.update({
      where: { id: participant.id },
      data: {
        completion: data.completion,
        shareCompletion: data.shareCompletion,
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
    });
  }

  /**
   * Update participant status
   */
  async updateStatus(
    roomId: number,
    userId: number,
    data: UpdateParticipantStatusInput
  ) {
    const participant = await prisma.focusRoomParticipant.findUnique({
      where: {
        room_user_idx: {
          roomId,
          userId,
        },
      },
    });

    if (!participant) {
      throw new Error("You are not a participant in this room");
    }

    return prisma.focusRoomParticipant.update({
      where: { id: participant.id },
      data: {
        status: data.status,
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
    });
  }

  /**
   * Remove a participant from room (creator only)
   */
  async removeParticipant(roomId: number, participantId: number, creatorId: number) {
    // Verify user is creator
    const room = await prisma.focusRoom.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new Error("Room not found");
    }

    if (room.creatorId !== creatorId) {
      throw new Error("Only room creator can remove participants");
    }

    const participant = await prisma.focusRoomParticipant.findUnique({
      where: { id: participantId },
    });

    if (!participant) {
      throw new Error("Participant not found");
    }

    if (participant.role === "CREATOR") {
      throw new Error("Cannot remove room creator");
    }

    return prisma.focusRoomParticipant.update({
      where: { id: participantId },
      data: {
        status: "LEFT",
        leftAt: new Date(),
      },
    });
  }
}

export const focusRoomParticipantService = new FocusRoomParticipantService();
