import prisma from "../config/prisma.js";
import type { CreateInvitationInput } from "../types/focus-room.types.js";
import { generateInvitationToken } from "../utils/focus-room.utils.js";
import { sendFocusRoomInvitationEmail } from "./focus-room-email.service.js";

export class FocusRoomInvitationService {
  /**
   * Create an invitation for a private room
   */
  async createInvitation(
    roomId: number,
    inviterId: number,
    data: CreateInvitationInput
  ) {
    // Verify user is creator
    const room = await prisma.focusRoom.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new Error("Room not found");
    }

    if (room.creatorId !== inviterId) {
      throw new Error("Only room creator can send invitations");
    }

    if (room.visibility !== "PRIVATE") {
      throw new Error("Invitations can only be sent for private rooms");
    }

    // Check if user with this email already has access
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      // Check if they already have an accepted invitation
      const existingInvitation = await prisma.focusRoomInvitation.findFirst({
        where: {
          roomId,
          inviteeId: existingUser.id,
          status: "ACCEPTED",
        },
      });

      if (existingInvitation) {
        throw new Error("User already has access to this room");
      }

      // Check if they're already a participant
      const existingParticipant = await prisma.focusRoomParticipant.findFirst({
        where: {
          roomId,
          userId: existingUser.id,
          status: { not: "LEFT" },
        },
      });

      if (existingParticipant) {
        throw new Error("User is already a participant in this room");
      }
    }

    // Check for existing pending invitation
    const existingPending = await prisma.focusRoomInvitation.findFirst({
      where: {
        roomId,
        inviteeEmail: data.email.toLowerCase(),
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });

    if (existingPending) {
      throw new Error("An invitation has already been sent to this email");
    }

    // Generate token
    let token: string;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      token = generateInvitationToken();

      const existing = await prisma.focusRoomInvitation.findUnique({
        where: { token },
      });

      if (!existing) {
        break;
      }

      attempts++;
    }

    if (attempts >= maxAttempts) {
      throw new Error("Failed to generate unique invitation token");
    }

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + data.expireHours);

    // Create invitation
    const invitation = await prisma.focusRoomInvitation.create({
      data: {
        roomId,
        inviterId,
        inviteeEmail: data.email.toLowerCase(),
        inviteeId: existingUser?.id || null,
        token: token!,
        expiresAt,
        status: "PENDING",
      },
      include: {
        room: {
          select: {
            id: true,
            name: true,
            description: true,
            focusDuration: true,
            breakDuration: true,
          },
        },
        inviter: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
          },
        },
      },
    });

    // Send email invitation
    try {
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      const invitationLink = `${frontendUrl}/focus-rooms/invite/${token}`;

      await sendFocusRoomInvitationEmail({
        to: data.email,
        inviterName: invitation.inviter.name || invitation.inviter.username,
        roomName: invitation.room.name,
        invitationLink,
        expiresAt,
      });
    } catch (error) {
      console.error("Error sending invitation email:", error);
      // Don't throw - invitation is created, email failure is not critical
    }

    return invitation;
  }

  /**
   * Get invitation by token
   */
  async getInvitationByToken(token: string) {
    const invitation = await prisma.focusRoomInvitation.findUnique({
      where: { token },
      include: {
        room: {
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
        },
        inviter: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
          },
        },
      },
    });

    if (!invitation) {
      return null;
    }

    // Check if expired
    if (invitation.expiresAt < new Date() && invitation.status === "PENDING") {
      // Auto-update to expired
      await prisma.focusRoomInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });

      return {
        ...invitation,
        status: "EXPIRED" as const,
      };
    }

    return invitation;
  }

  /**
   * Accept an invitation
   */
  async acceptInvitation(token: string, userId: number) {
    const invitation = await this.getInvitationByToken(token);

    if (!invitation) {
      throw new Error("Invalid invitation token");
    }

    if (invitation.status !== "PENDING") {
      throw new Error(`Invitation is ${invitation.status.toLowerCase()}`);
    }

    if (invitation.expiresAt < new Date()) {
      await prisma.focusRoomInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      throw new Error("Invitation has expired");
    }

    // Verify email matches (if inviteeId is set)
    if (invitation.inviteeId && invitation.inviteeId !== userId) {
      throw new Error("This invitation is for a different user");
    }

    // Check if user with this email exists and matches
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (user && user.email.toLowerCase() !== invitation.inviteeEmail.toLowerCase()) {
      throw new Error("This invitation is for a different email address");
    }

    // Check if room is full
    const participantCount = await prisma.focusRoomParticipant.count({
      where: {
        roomId: invitation.roomId,
        status: { not: "LEFT" },
      },
    });

    if (participantCount >= 10) {
      throw new Error("Room is full. Maximum 10 participants allowed.");
    }

    // Update invitation
    await prisma.focusRoomInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "ACCEPTED",
        inviteeId: userId,
        respondedAt: new Date(),
      },
    });

    // Create participant if not already exists
    const existingParticipant = await prisma.focusRoomParticipant.findUnique({
      where: {
        room_user_idx: {
          roomId: invitation.roomId,
          userId,
        },
      },
    });

    if (!existingParticipant) {
      await prisma.focusRoomParticipant.create({
        data: {
          roomId: invitation.roomId,
          userId,
          role: "PARTICIPANT",
          status: "JOINED",
        },
      });
    } else if (existingParticipant.status === "LEFT") {
      // Rejoin if they left
      await prisma.focusRoomParticipant.update({
        where: { id: existingParticipant.id },
        data: {
          status: "JOINED",
          leftAt: null,
        },
      });
    }

    return {
      roomId: invitation.roomId,
      invitation,
    };
  }

  /**
   * Decline an invitation
   */
  async declineInvitation(token: string, userId: number) {
    const invitation = await this.getInvitationByToken(token);

    if (!invitation) {
      throw new Error("Invalid invitation token");
    }

    if (invitation.status !== "PENDING") {
      throw new Error(`Invitation is ${invitation.status.toLowerCase()}`);
    }

    // Verify user matches
    if (invitation.inviteeId && invitation.inviteeId !== userId) {
      throw new Error("This invitation is for a different user");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (user && user.email.toLowerCase() !== invitation.inviteeEmail.toLowerCase()) {
      throw new Error("This invitation is for a different email address");
    }

    return prisma.focusRoomInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "DECLINED",
        inviteeId: userId,
        respondedAt: new Date(),
      },
    });
  }

  /**
   * Get all invitations for a room (creator only)
   */
  async getRoomInvitations(roomId: number, creatorId: number) {
    const room = await prisma.focusRoom.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new Error("Room not found");
    }

    if (room.creatorId !== creatorId) {
      throw new Error("Only room creator can view invitations");
    }

    return prisma.focusRoomInvitation.findMany({
      where: { roomId },
      include: {
        invitee: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            profile_photo_url: true,
          },
        },
        inviter: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  /**
   * Get all invitations for a user
   */
  async getUserInvitations(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    return prisma.focusRoomInvitation.findMany({
      where: {
        OR: [
          { inviteeId: userId },
          { inviteeEmail: user.email.toLowerCase() },
        ],
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
          },
        },
        inviter: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  /**
   * Cancel an invitation (creator only)
   */
  async cancelInvitation(invitationId: number, creatorId: number) {
    const invitation = await prisma.focusRoomInvitation.findUnique({
      where: { id: invitationId },
      include: { room: true },
    });

    if (!invitation) {
      throw new Error("Invitation not found");
    }

    if (invitation.room.creatorId !== creatorId) {
      throw new Error("Only room creator can cancel invitations");
    }

    if (invitation.status !== "PENDING") {
      throw new Error("Can only cancel pending invitations");
    }

    return prisma.focusRoomInvitation.update({
      where: { id: invitationId },
      data: {
        status: "DECLINED", // Use DECLINED as canceled status
      },
    });
  }
}

export const focusRoomInvitationService = new FocusRoomInvitationService();
