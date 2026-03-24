import type { Request, Response } from "express";
import { focusRoomParticipantService } from "../../services/focus-room-participant.service.js";
import {
  joinRoomSchema,
  updateParticipantIntentionSchema,
  updateParticipantCompletionSchema,
  updateParticipantStatusSchema,
} from "../../types/focus-room.types.js";
import type {
  JoinRoomResponse,
  LeaveRoomResponse,
  GetParticipantsResponse,
  UpdateIntentionResponse,
  UpdateCompletionResponse,
  UpdateParticipantStatusResponse,
  RemoveParticipantResponse,
  ParticipantResponse,
} from "../../types/focus-room-response.types.js";
import { parseRoomId, parseParticipantId } from "../../utils/focus-room.utils.js";

/**
 * Focus Room Participants Controller
 * Handles participant management: join, leave, update status, intentions, and completions
 */

export const joinRoom = async (req: Request, res: Response): Promise<void> => {
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

    const validatedData = joinRoomSchema.parse(req.body);
    const participant = await focusRoomParticipantService.joinRoom(roomId, userId, validatedData);

    if (!participant) {
      res.status(404).json({ success: false, error: "Participant not found" });
      return;
    }

    const response: JoinRoomResponse = {
      success: true,
      participant: {
        id: participant.id,
        roomId: participant.roomId,
        userId: participant.userId,
        role: participant.role,
        status: participant.status,
        intention: participant.intention,
        joinedAt: participant.joinedAt,
        user: participant.user ? {
          id: participant.user.id,
          name: participant.user.name,
          email: participant.user.email,
          profilePhoto: participant.user.profile_photo_url || null,
          profile_photo_url: participant.user.profile_photo_url || null,
        } : undefined,
      },
      roomId: participant.roomId,
    };

    res.json(response);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid join data",
        details: (error as unknown as { errors: unknown }).errors,
      });
      return;
    }

    console.error("Error joining room:", error);
    const message = error instanceof Error ? error.message : "Failed to join room";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const leaveRoom = async (req: Request, res: Response): Promise<void> => {
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

    await focusRoomParticipantService.leaveRoom(roomId, userId);

    const response: LeaveRoomResponse = {
      success: true,
      message: "Left room successfully",
    };

    res.json(response);
  } catch (error: unknown) {
    console.error("Error leaving room:", error);
    const message = error instanceof Error ? error.message : "Failed to leave room";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const getRoomParticipants = async (req: Request, res: Response): Promise<void> => {
  try {
    const roomId = parseRoomId(req.params.roomId);
    if (roomId === null) {
      res.status(400).json({ success: false, error: "Invalid room ID" });
      return;
    }

    const participants = await focusRoomParticipantService.getRoomParticipants(roomId);

    const response: GetParticipantsResponse = {
      success: true,
      participants: (participants.map((p) => ({
        id: p.id,
        userId: p.userId,
        role: p.role,
        status: p.status,
        intention: p.intention,
        completion: p.shareCompletion ? p.completion : null,
        joinedAt: p.joinedAt,
        user: p.user ? {
          id: p.user.id,
          name: p.user.name,
          username: (p.user as { username?: string }).username ?? null,
          email: p.user.email,
          profilePhoto: p.user.profile_photo_url || null,
          profile_photo_url: p.user.profile_photo_url || null,
        } : undefined,
      })) as ParticipantResponse[]),
    };

    res.json(response);
  } catch (error: unknown) {
    console.error("Error fetching participants:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch participants",
    });
  }
};

export const updateIntention = async (req: Request, res: Response): Promise<void> => {
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

    const validatedData = updateParticipantIntentionSchema.parse(req.body);
    const participant = await focusRoomParticipantService.updateIntention(roomId, userId, validatedData);

    const response: UpdateIntentionResponse = {
      success: true,
      message: "Intention updated successfully",
      participant: {
        id: participant.id,
        userId: participant.userId,
        role: participant.role,
        status: participant.status,
        intention: participant.intention,
        joinedAt: participant.joinedAt,
        user: participant.user ? {
          id: participant.user.id,
          name: participant.user.name,
          email: participant.user.email,
          profilePhoto: participant.user.profile_photo_url || null,
          profile_photo_url: participant.user.profile_photo_url || null,
        } : undefined,
      },
    };

    res.json(response);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid intention data",
        details: (error as unknown as { errors: unknown }).errors,
      });
      return;
    }

    console.error("Error updating intention:", error);
    const message = error instanceof Error ? error.message : "Failed to update intention";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const updateCompletion = async (req: Request, res: Response): Promise<void> => {
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

    const validatedData = updateParticipantCompletionSchema.parse(req.body);
    const participant = await focusRoomParticipantService.updateCompletion(roomId, userId, validatedData);

    const response: UpdateCompletionResponse = {
      success: true,
      message: "Completion updated successfully",
      participant: {
        id: participant.id,
        userId: participant.userId,
        role: participant.role,
        status: participant.status,
        completion: participant.completion,
        shareCompletion: participant.shareCompletion,
        joinedAt: participant.joinedAt,
        user: participant.user ? {
          id: participant.user.id,
          name: participant.user.name,
          email: participant.user.email,
          profilePhoto: participant.user.profile_photo_url || null,
          profile_photo_url: participant.user.profile_photo_url || null,
        } : undefined,
      },
    };

    res.json(response);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid completion data",
        details: (error as unknown as { errors: unknown }).errors,
      });
      return;
    }

    console.error("Error updating completion:", error);
    const message = error instanceof Error ? error.message : "Failed to update completion";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const updateParticipantStatus = async (req: Request, res: Response): Promise<void> => {
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

    const validatedData = updateParticipantStatusSchema.parse(req.body);
    const participant = await focusRoomParticipantService.updateStatus(roomId, userId, validatedData);

    const response: UpdateParticipantStatusResponse = {
      success: true,
      message: "Status updated successfully",
      participant: {
        id: participant.id,
        userId: participant.userId,
        role: participant.role,
        status: participant.status,
        joinedAt: participant.joinedAt,
        user: participant.user ? {
          id: participant.user.id,
          name: participant.user.name,
          email: participant.user.email,
          profilePhoto: participant.user.profile_photo_url || null,
          profile_photo_url: participant.user.profile_photo_url || null,
        } : undefined,
      },
    };

    res.json(response);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid status data",
        details: (error as unknown as { errors: unknown }).errors,
      });
      return;
    }

    console.error("Error updating status:", error);
    const message = error instanceof Error ? error.message : "Failed to update status";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const removeParticipant = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const roomId = parseRoomId(req.params.roomId);
    const participantId = parseParticipantId(req.params.participantId);

    if (roomId === null || participantId === null) {
      res.status(400).json({ success: false, error: "Invalid room or participant ID" });
      return;
    }

    await focusRoomParticipantService.removeParticipant(roomId, participantId, userId);

    const response: RemoveParticipantResponse = {
      success: true,
      message: "Participant removed successfully",
    };

    res.json(response);
  } catch (error: unknown) {
    console.error("Error removing participant:", error);
    const message = error instanceof Error ? error.message : "Failed to remove participant";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

