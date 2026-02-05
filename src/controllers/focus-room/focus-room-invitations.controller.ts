import type { Request, Response } from "express";
import { focusRoomInvitationService } from "../../services/focus-room-invitation.service.js";
import { createInvitationSchema, acceptInvitationSchema } from "../../types/focus-room.types.js";
import type {
  CreateInvitationResponse,
  GetInvitationResponse,
  AcceptInvitationResponse,
  DeclineInvitationResponse,
  GetInvitationsResponse,
  CancelInvitationResponse,
  InvitationResponse,
} from "../../types/focus-room-response.types.js";
import { parseRoomId, parseInvitationId } from "../../utils/focus-room.utils.js";

/**
 * Focus Room Invitations Controller
 * Handles invitation management: create, accept, decline, cancel, and retrieval
 */

export const createInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomId = parseRoomId(req.params.roomId);
    if (roomId === null) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    const validatedData = createInvitationSchema.parse(req.body);
    const invitation = await focusRoomInvitationService.createInvitation(roomId, userId, validatedData);

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const invitationLink = `${frontendUrl}/focus-rooms/invite/${invitation.token}`;

    const response: CreateInvitationResponse = {
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.inviteeEmail,
        token: invitation.token,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        invitationLink,
      },
    };

    res.json(response);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid invitation data",
        details: (error as unknown as { errors: unknown }).errors,
      });
      return;
    }

    console.error("Error creating invitation:", error);
    const message = error instanceof Error ? error.message : "Failed to create invitation";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const getInvitationByToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.params.token;
    if (!token) {
      res.status(400).json({ success: false, error: "Token is required" });
      return;
    }

    const invitation = await focusRoomInvitationService.getInvitationByToken(token);

    if (!invitation) {
      res.status(404).json({ success: false, error: "Invalid or expired invitation token" });
      return;
    }

    const response: GetInvitationResponse = {
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.inviteeEmail,
        token: invitation.token,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        room: {
          id: invitation.room.id,
          name: invitation.room.name,
          description: invitation.room.description,
          focusDuration: invitation.room.focusDuration,
          breakDuration: invitation.room.breakDuration,
          creator: invitation.room.creator,
        },
        inviter: invitation.inviter,
      },
    };

    res.json(response);
  } catch (error: unknown) {
    console.error("Error fetching invitation:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch invitation",
    });
  }
};

export const acceptInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const token = req.params.token;
    if (!token) {
      res.status(400).json({ success: false, error: "Token is required" });
      return;
    }

    const result = await focusRoomInvitationService.acceptInvitation(token, userId);

    const response: AcceptInvitationResponse = {
      success: true,
      message: "Invitation accepted successfully",
      roomId: result.roomId,
    };

    res.json(response);
  } catch (error: unknown) {
    console.error("Error accepting invitation:", error);
    const message = error instanceof Error ? error.message : "Failed to accept invitation";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const declineInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const token = req.params.token;
    if (!token) {
      res.status(400).json({ success: false, error: "Token is required" });
      return;
    }

    await focusRoomInvitationService.declineInvitation(token, userId);

    const response: DeclineInvitationResponse = {
      success: true,
      message: "Invitation declined",
    };

    res.json(response);
  } catch (error: unknown) {
    console.error("Error declining invitation:", error);
    const message = error instanceof Error ? error.message : "Failed to decline invitation";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const getRoomInvitations = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomId = parseRoomId(req.params.roomId);
    if (roomId === null) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    const invitations = await focusRoomInvitationService.getRoomInvitations(roomId, userId);

    const response: GetInvitationsResponse = {
      success: true,
      invitations: invitations.map((inv) => {
        const invitation: InvitationResponse = {
          id: inv.id,
          email: inv.inviteeEmail,
          token: inv.token,
          status: inv.status,
          expiresAt: inv.expiresAt,
          respondedAt: inv.respondedAt,
          createdAt: inv.createdAt,
        };
        if (inv.invitee) {
          invitation.invitee = {
            id: inv.invitee.id,
            name: inv.invitee.name,
            email: inv.invitee.email,
          };
        }
        return invitation;
      }),
    };

    res.json(response);
  } catch (error: unknown) {
    console.error("Error fetching invitations:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch invitations";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const getUserInvitations = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const invitations = await focusRoomInvitationService.getUserInvitations(userId);

    const response: GetInvitationsResponse = {
      success: true,
      invitations: invitations.map((inv) => {
        const invitation: InvitationResponse = {
          id: inv.id,
          email: inv.inviteeEmail,
          token: inv.token,
          status: inv.status,
          expiresAt: inv.expiresAt,
          createdAt: inv.createdAt,
          room: {
            id: inv.room.id,
            name: inv.room.name,
            description: inv.room.description,
          },
        };
        if (inv.room.creator) {
          const creatorObj: { id: number; name: string; email?: string } = {
            id: inv.room.creator.id,
            name: inv.room.creator.name,
          };
          const email = (inv.room.creator as { email?: string }).email;
          if (email) {
            creatorObj.email = email;
          }
          invitation.room!.creator = creatorObj;
        }
        if (inv.inviter) {
          const inviterObj: { id: number; name: string; email?: string } = {
            id: inv.inviter.id,
            name: inv.inviter.name,
          };
          const email = inv.inviter.email;
          if (email) {
            inviterObj.email = email;
          }
          invitation.inviter = inviterObj;
        }
        return invitation;
      }),
    };

    res.json(response);
  } catch (error: unknown) {
    console.error("Error fetching user invitations:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch invitations",
    });
  }
};

export const cancelInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const invitationId = parseInvitationId(req.params.invitationId);
    if (invitationId === null) {
      res.status(400).json({ success: false, error: "Invalid invitation ID" });
      return;
    }

    await focusRoomInvitationService.cancelInvitation(invitationId, userId);

    const response: CancelInvitationResponse = {
      success: true,
      message: "Invitation canceled successfully",
    };

    res.json(response);
  } catch (error: unknown) {
    console.error("Error canceling invitation:", error);
    const message = error instanceof Error ? error.message : "Failed to cancel invitation";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

