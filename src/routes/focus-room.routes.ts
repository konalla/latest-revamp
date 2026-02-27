import { Router } from "express";
import { authenticateToken, optionalAuth } from "../middleware/auth.middleware.js";
import {
  // Room Management
  createRoom,
  getPublicRooms,
  getMyRooms,
  getCompletedSessionRooms,
  getRoomById,
  updateRoom,
  deleteRoom,
  // Session Management
  startSession,
  pauseSession,
  resumeSession,
  endSession,
  getSessionTimer,
  getRoomSessionHistory,
  // Participant Management
  joinRoom,
  leaveRoom,
  getRoomParticipants,
  updateIntention,
  updateCompletion,
  updateParticipantStatus,
  removeParticipant,
  // Invitation Management
  createInvitation,
  getInvitationByToken,
  acceptInvitation,
  declineInvitation,
  getRoomInvitations,
  getUserInvitations,
  cancelInvitation,
  // Template Management
  getSystemTemplates,
  getAllTemplates,
  getTemplateById,
  createTemplate,
  createRoomFromTemplate,
  updateTemplate,
  deleteTemplate,
  // Scheduling Management
  scheduleSession,
  cancelScheduledSession,
  updateRecurringSchedule,
  cancelRecurringSchedule,
  getUpcomingOccurrences,
} from "../controllers/focus-room/index.js";

const router = Router();

// ============================================
// Room Management Routes
// ============================================

// POST /api/focus-rooms - Create a new room
router.post("/", authenticateToken, createRoom);

// GET /api/focus-rooms/public - Get all public rooms (no auth required)
router.get("/public", getPublicRooms);

// GET /api/focus-rooms/my-rooms - Get user's rooms (created + joined)
router.get("/my-rooms", authenticateToken, getMyRooms);

// GET /api/focus-rooms/completed-sessions - Get completed session rooms
router.get("/completed-sessions", authenticateToken, getCompletedSessionRooms);

// ============================================
// Session Management Routes
// ============================================

// GET /api/focus-rooms/sessions/:sessionId/timer - Get session timer (no auth required for public access)
router.get("/sessions/:sessionId/timer", getSessionTimer);

// ============================================
// Invitation Management Routes
// ============================================

// GET /api/focus-rooms/invite/:token - Get invitation by token
router.get("/invite/:token", getInvitationByToken);

// POST /api/focus-rooms/invite/:token/accept - Accept invitation
router.post("/invite/:token/accept", authenticateToken, acceptInvitation);

// POST /api/focus-rooms/invite/:token/decline - Decline invitation
router.post("/invite/:token/decline", authenticateToken, declineInvitation);

// GET /api/focus-rooms/invitations/my-invitations - Get user's invitations
router.get("/invitations/my-invitations", authenticateToken, getUserInvitations);

// DELETE /api/focus-rooms/invitations/:invitationId - Cancel invitation (creator only)
router.delete("/invitations/:invitationId", authenticateToken, cancelInvitation);

// ============================================
// Template Management Routes
// ============================================

// GET /api/focus-rooms/templates/system - Get system templates (no auth required)
router.get("/templates/system", getSystemTemplates);

// GET /api/focus-rooms/templates/all - Get all templates (system + user's)
router.get("/templates/all", authenticateToken, getAllTemplates);

// GET /api/focus-rooms/templates - Get system templates by default (no auth required)
// Must come before /templates/:templateId to match exact /templates path
router.get("/templates", getSystemTemplates);

// GET /api/focus-rooms/templates/:templateId - Get template by ID
router.get("/templates/:templateId", getTemplateById);

// POST /api/focus-rooms/templates - Create a new template
router.post("/templates", authenticateToken, createTemplate);

// POST /api/focus-rooms/templates/:templateId/create-room - Create room from template
router.post("/templates/:templateId/create-room", authenticateToken, createRoomFromTemplate);

// PATCH /api/focus-rooms/templates/:templateId - Update template (creator only)
router.patch("/templates/:templateId", authenticateToken, updateTemplate);

// DELETE /api/focus-rooms/templates/:templateId - Delete template (creator only)
router.delete("/templates/:templateId", authenticateToken, deleteTemplate);

// ============================================
// Room-specific Routes (must come after specific paths)
// ============================================

// GET /api/focus-rooms/:roomId - Get room by ID
router.get("/:roomId", optionalAuth, getRoomById);

// PUT /api/focus-rooms/:roomId - Update room (creator only)
router.put("/:roomId", authenticateToken, updateRoom);

// DELETE /api/focus-rooms/:roomId - Delete room (creator only)
router.delete("/:roomId", authenticateToken, deleteRoom);

// POST /api/focus-rooms/:roomId/schedule - Schedule a session (creator only)
router.post("/:roomId/schedule", authenticateToken, scheduleSession);

// DELETE /api/focus-rooms/:roomId/schedule - Cancel scheduled session (creator only)
router.delete("/:roomId/schedule", authenticateToken, cancelScheduledSession);

// PUT /api/focus-rooms/:roomId/recurring-schedule - Update recurring schedule (creator only)
router.put("/:roomId/recurring-schedule", authenticateToken, updateRecurringSchedule);

// DELETE /api/focus-rooms/:roomId/recurring-schedule - Cancel recurring schedule or occurrence (creator only)
router.delete("/:roomId/recurring-schedule", authenticateToken, cancelRecurringSchedule);

// GET /api/focus-rooms/:roomId/recurring-schedule/occurrences - Get upcoming occurrences
router.get("/:roomId/recurring-schedule/occurrences", authenticateToken, getUpcomingOccurrences);

// GET /api/focus-rooms/:roomId/sessions/history - Get room session history
router.get("/:roomId/sessions/history", authenticateToken, getRoomSessionHistory);

// POST /api/focus-rooms/:roomId/sessions - Start a session (creator only)
router.post("/:roomId/sessions", authenticateToken, startSession);

// POST /api/focus-rooms/:roomId/sessions/:sessionId/pause - Pause session (creator only)
router.post("/:roomId/sessions/:sessionId/pause", authenticateToken, pauseSession);

// POST /api/focus-rooms/:roomId/sessions/:sessionId/resume - Resume session (creator only)
router.post("/:roomId/sessions/:sessionId/resume", authenticateToken, resumeSession);

// POST /api/focus-rooms/:roomId/sessions/:sessionId/end - End session (creator only)
router.post("/:roomId/sessions/:sessionId/end", authenticateToken, endSession);

// POST /api/focus-rooms/:roomId/join - Join a room
router.post("/:roomId/join", authenticateToken, joinRoom);

// POST /api/focus-rooms/:roomId/leave - Leave a room
router.post("/:roomId/leave", authenticateToken, leaveRoom);

// GET /api/focus-rooms/:roomId/participants - Get room participants
router.get("/:roomId/participants", getRoomParticipants);

// POST /api/focus-rooms/:roomId/update-intention - Update participant intention
router.post("/:roomId/update-intention", authenticateToken, updateIntention);

// POST /api/focus-rooms/:roomId/update-completion - Update participant completion
router.post("/:roomId/update-completion", authenticateToken, updateCompletion);

// POST /api/focus-rooms/:roomId/update-status - Update participant status
router.post("/:roomId/update-status", authenticateToken, updateParticipantStatus);

// DELETE /api/focus-rooms/:roomId/participants/:participantId - Remove participant (creator only)
router.delete("/:roomId/participants/:participantId", authenticateToken, removeParticipant);

// POST /api/focus-rooms/:roomId/invite - Create invitation (creator only)
router.post("/:roomId/invite", authenticateToken, createInvitation);

// GET /api/focus-rooms/:roomId/invitations - Get room invitations (creator only)
router.get("/:roomId/invitations", authenticateToken, getRoomInvitations);

export default router;


