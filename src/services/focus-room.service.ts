import prisma from "../config/prisma.js";
import bcrypt from "bcrypt";
import type { CreateRoomInput, UpdateRoomInput } from "../types/focus-room.types.js";

export class FocusRoomService {
  /**
   * Validate scheduled time doesn't overlap with existing scheduled sessions in the same room
   * Note: We allow multiple scheduled sessions per room, but they must not overlap
   */
  private async validateScheduledTime(roomId: number, scheduledTime: Date, excludeRoomId?: number) {
    if (!scheduledTime) return;

    // Get the room to know its focus duration
    const room = await prisma.focusRoom.findUnique({
      where: { id: roomId },
      select: { focusDuration: true },
    });

    if (!room) {
      throw new Error("Room not found");
    }

    // Calculate session end time based on room's focus duration
    const sessionEndTime = new Date(scheduledTime.getTime() + room.focusDuration * 60 * 1000);

    // Check if this room already has a scheduled session that would overlap
    // Since each room can only have one scheduledStartTime, we check the current room's scheduled session
    const currentRoom = await prisma.focusRoom.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        scheduledStartTime: true,
        focusDuration: true,
        status: true,
      },
    });

    if (!currentRoom) {
      throw new Error("Room not found");
    }

    // If room already has a scheduled session, check for overlap
    if (currentRoom.scheduledStartTime && currentRoom.status === "scheduled") {
      const existingStart = new Date(currentRoom.scheduledStartTime);
      const existingEnd = new Date(existingStart.getTime() + currentRoom.focusDuration * 60 * 1000);

      // Check if new scheduled time overlaps with existing scheduled session
      const overlaps =
        (scheduledTime >= existingStart && scheduledTime < existingEnd) ||
        (sessionEndTime > existingStart && sessionEndTime <= existingEnd) ||
        (scheduledTime <= existingStart && sessionEndTime >= existingEnd);

      if (overlaps) {
        throw new Error(
          `Scheduled session overlaps with existing scheduled session at ${existingStart.toISOString()}`
        );
      }
    }
  }

  /**
   * Create a new focus room
   */
  async createRoom(userId: number, data: CreateRoomInput) {
    let passwordHash: string | null = null;

    // Hash password if provided
    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 10);
    }

    // Validate scheduled time if provided
    let scheduledStartTime: Date | null = null;
    let roomStatus = "active";

    if (data.scheduledStartTime) {
      scheduledStartTime = new Date(data.scheduledStartTime);

      // Validate scheduled time is in the future
      if (scheduledStartTime <= new Date()) {
        throw new Error("Scheduled start time must be in the future");
      }

      // Note: Overlap validation for new rooms will be handled when scheduling additional sessions
      // For now, a new room can have one scheduled session

      roomStatus = "scheduled";
    }

    const room = await prisma.focusRoom.create({
      data: {
        name: data.name,
        description: data.description,
        creatorId: userId,
        visibility: data.visibility,
        focusDuration: data.focusDuration,
        breakDuration: data.breakDuration,
        allowObservers: data.allowObservers,
        passwordHash,
        requiresPassword: !!data.password,
        scheduledStartTime,
        status: roomStatus,
        settings: {},
      },
      include: {
        creator: {
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

    // Create creator as participant
    await prisma.focusRoomParticipant.create({
      data: {
        roomId: room.id,
        userId,
        role: "CREATOR",
        status: "JOINED",
      },
    });

    return room;
  }

  /**
   * Get room by ID with access control
   */
  async getRoomById(roomId: number, userId?: number) {
    const room = await prisma.focusRoom.findUnique({
      where: { id: roomId },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            profile_photo_url: true,
          },
        },
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
          take: 10, // Max 10 participants
        },
        _count: {
          select: {
            participants: {
              where: {
                status: { not: "LEFT" },
              },
            },
          },
        },
      },
    });

    if (!room) {
      return null;
    }

    // Check access for private rooms
    if (room.visibility === "PRIVATE") {
      if (!userId) {
        return { room: null, hasAccess: false, requiresInvitation: true };
      }

      // Check if user is creator or has accepted invitation
      const isCreator = room.creatorId === userId;
      const hasInvitation = await prisma.focusRoomInvitation.findFirst({
        where: {
          roomId,
          inviteeId: userId,
          status: "ACCEPTED",
        },
      });

      if (!isCreator && !hasInvitation) {
        return { room: null, hasAccess: false, requiresInvitation: true };
      }
    }

    // Check if user is participant
    const isParticipant = userId
      ? await prisma.focusRoomParticipant.findFirst({
          where: {
            roomId,
            userId,
            status: { not: "LEFT" },
          },
        })
      : null;

    return {
      room,
      hasAccess: true,
      isCreator: room.creatorId === userId,
      isParticipant: !!isParticipant,
    };
  }

  /**
   * Get all public rooms
   */
  async getPublicRooms(userId?: number) {
    const rooms = await prisma.focusRoom.findMany({
      where: {
        visibility: "PUBLIC",
        status: { in: ["active", "scheduled"] }, // Include both active and scheduled rooms
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            username: true,
            profile_photo_url: true,
          },
        },
        _count: {
          select: {
            participants: {
              where: {
                status: { not: "LEFT" },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return rooms;
  }

  /**
   * Get rooms created by user
   */
  async getRoomsByCreator(userId: number) {
    return prisma.focusRoom.findMany({
      where: {
        creatorId: userId,
      },
      include: {
        _count: {
          select: {
            participants: {
              where: {
                status: { not: "LEFT" },
              },
            },
            sessions: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  /**
   * Get rooms user has joined (via invitation)
   */
  async getRoomsByParticipant(userId: number) {
    const participantRooms = await prisma.focusRoomParticipant.findMany({
      where: {
        userId,
        status: { not: "LEFT" },
        role: { not: "CREATOR" }, // Exclude rooms they created
      },
      include: {
        room: {
          include: {
            creator: {
              select: {
                id: true,
                name: true,
                username: true,
                profile_photo_url: true,
              },
            },
            _count: {
              select: {
                participants: {
                  where: {
                    status: { not: "LEFT" },
                  },
                },
                sessions: true,
              },
            },
          },
        },
      },
      orderBy: {
        joinedAt: "desc",
      },
    });

    return participantRooms.map((p) => p.room);
  }

  /**
   * Update room (creator only)
   */
  async updateRoom(roomId: number, userId: number, data: UpdateRoomInput) {
    // Verify user is creator
    const room = await prisma.focusRoom.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new Error("Room not found");
    }

    if (room.creatorId !== userId) {
      throw new Error("Only room creator can update the room");
    }

    // Check if there's an active session
    const activeSession = await prisma.focusRoomSession.findFirst({
      where: {
        roomId,
        status: "ACTIVE",
      },
    });

    if (activeSession) {
      throw new Error("Cannot update room settings while a session is active");
    }

    const updateData: any = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.focusDuration !== undefined) updateData.focusDuration = data.focusDuration;
    if (data.breakDuration !== undefined) updateData.breakDuration = data.breakDuration;
    if (data.allowObservers !== undefined) updateData.allowObservers = data.allowObservers;
    
    // Handle scheduled time update
    if (data.scheduledStartTime !== undefined) {
      if (data.scheduledStartTime === null || data.scheduledStartTime === "") {
        // Cancel scheduled session
        updateData.scheduledStartTime = null;
        updateData.status = "active";
      } else {
        const scheduledTime = new Date(data.scheduledStartTime);

        // Validate scheduled time is in the future
        if (scheduledTime <= new Date()) {
          throw new Error("Scheduled start time must be in the future");
        }

        // Validate no overlapping scheduled sessions in the same room
        // Check if there are other scheduled sessions in this room that would overlap
        await this.validateScheduledTime(roomId, scheduledTime);

        updateData.scheduledStartTime = scheduledTime;
        updateData.status = "scheduled";
      }
    }

    // Handle password update
    if (data.password !== undefined) {
      if (data.password === null || data.password === "") {
        updateData.passwordHash = null;
        updateData.requiresPassword = false;
      } else {
        updateData.passwordHash = await bcrypt.hash(data.password, 10);
        updateData.requiresPassword = true;
      }
    }

    return prisma.focusRoom.update({
      where: { id: roomId },
      data: updateData,
      include: {
        creator: {
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
   * Delete room (creator only)
   */
  async deleteRoom(roomId: number, userId: number) {
    const room = await prisma.focusRoom.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new Error("Room not found");
    }

    if (room.creatorId !== userId) {
      throw new Error("Only room creator can delete the room");
    }

    // Check if there's an active session
    const activeSession = await prisma.focusRoomSession.findFirst({
      where: {
        roomId,
        status: "ACTIVE",
      },
    });

    if (activeSession) {
      throw new Error("Cannot delete room while a session is active");
    }

    // Cascade delete will handle related records
    await prisma.focusRoom.delete({
      where: { id: roomId },
    });

    return true;
  }

  /**
   * Verify room password
   */
  async verifyRoomPassword(roomId: number, password: string): Promise<boolean> {
    const room = await prisma.focusRoom.findUnique({
      where: { id: roomId },
      select: { passwordHash: true, requiresPassword: true },
    });

    if (!room || !room.requiresPassword || !room.passwordHash) {
      return !room?.requiresPassword; // If no password required, return true
    }

    return bcrypt.compare(password, room.passwordHash);
  }

  /**
   * Check if room is full (max 10 participants)
   */
  async isRoomFull(roomId: number): Promise<boolean> {
    const count = await prisma.focusRoomParticipant.count({
      where: {
        roomId,
        status: { not: "LEFT" },
      },
    });

    return count >= 10;
  }
}

export const focusRoomService = new FocusRoomService();

