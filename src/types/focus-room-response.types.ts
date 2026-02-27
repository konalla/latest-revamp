/**
 * Focus Room Response Types
 * Production-level type definitions for all API responses
 */

import type { Prisma } from "@prisma/client";

// Base response wrapper
export interface ApiResponse<T> {
  success: boolean;
  error?: string;
  details?: unknown;
}

// Room Response Types
export interface RoomResponse {
  id: number;
  name: string;
  description: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  focusDuration: number;
  breakDuration: number;
  allowObservers: boolean;
  requiresPassword: boolean;
  status: string;
  createdAt: Date;
  creatorId?: number;
  creator?: {
    id: number;
    name: string;
    email?: string;
    profilePhoto?: string | null;
    profile_photo_url?: string | null;
  };
  participantCount?: number;
  sessionCount?: number;
  updatedAt?: Date;
  scheduledStartTime?: Date | null;
  recurringSchedule?: RecurringScheduleInfo | null;
}

export interface RoomDetailResponse extends RoomResponse {
  participants?: ParticipantResponse[];
  isCreator?: boolean;
  isParticipant?: boolean;
  activeSession?: SessionTimerResponse | null;
  scheduledSession?: ScheduledSessionInfo | null;
  recurringSchedule?: RecurringScheduleInfo | null;
}

export interface ScheduledSessionInfo {
  scheduledStartTime: Date;
  timeUntilStart: number;
  isScheduled: boolean;
}

export interface RecurringScheduleInfo {
  id: number;
  type: "DAILY" | "WEEKLY" | "CUSTOM";
  daysOfWeek: number[];
  time: string;
  timezone: string;
  startDate: Date;
  isActive: boolean;
  nextOccurrence: Date | null;
}

// Session Response Types
export interface SessionResponse {
  id: number;
  roomId: number;
  startedAt: Date;
  scheduledDuration: number;
  status: string;
  pausedAt?: Date | null;
  resumedAt?: Date | null;
  endedAt?: Date | null;
  actualDuration?: number | null;
}

export interface SessionTimerResponse {
  sessionId: number;
  roomId?: number;
  status: "running" | "paused" | "ended" | string;
  elapsedTime?: number;
  remainingTime: number;
  scheduledDuration: number;
  startedAt: Date;
  pausedAt?: Date | null;
  resumedAt?: Date | null;
  endedAt?: Date | null;
}

export interface SessionHistoryResponse {
  id: number;
  startedAt: Date;
  endedAt: Date | null;
  scheduledDuration: number;
  actualDuration: number | null;
  status: string;
  participants?: Array<{
    userId: number;
    user?: ParticipantResponse["user"];
    intention?: string | null;
    completion?: string | null;
    shareCompletion?: boolean;
    role?: string;
    joinedAt?: Date;
    leftAt?: Date | null;
  }>;
}

// Participant Response Types
export interface ParticipantResponse {
  id: number;
  userId: number;
  roomId?: number;
  role: "CREATOR" | "PARTICIPANT";
  status: "JOINED" | "FOCUSING" | "BREAK" | "IDLE" | "LEFT";
  intention?: string | null;
  completion?: string | null;
  shareCompletion?: boolean;
  joinedAt: Date;
  leftAt?: Date | null;
  user?: {
    id: number;
    name: string;
    email?: string;
    profilePhoto?: string | null;
    profile_photo_url?: string | null;
    username?: string;
  } | undefined;
}

// Invitation Response Types
export interface InvitationResponse {
  id: number;
  email: string;
  token?: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED";
  expiresAt: Date;
  respondedAt?: Date | null;
  createdAt?: Date;
  invitationLink?: string;
  room?: {
    id: number;
    name: string;
    description: string | null;
    focusDuration?: number;
    breakDuration?: number;
    creator?: {
      id: number;
      name: string;
      email?: string;
    } | undefined;
  };
  inviter?: {
    id: number;
    name: string;
    email?: string;
  } | undefined;
  invitee?: {
    id: number;
    name: string;
    email?: string;
  } | undefined;
}

// Template Response Types
export interface TemplateResponse {
  id: number;
  name: string;
  description: string | null;
  category: "DEEP_WORK" | "CREATIVE" | "PLANNING" | "LEARNING" | "CUSTOM";
  focusDuration: number;
  breakDuration: number;
  allowObservers?: boolean;
  visibility?: "PUBLIC" | "PRIVATE";
  usageCount?: number;
  createdAt?: Date;
  creator?: {
    id: number;
    name: string;
    email?: string;
  } | undefined;
}

// Recurring Schedule Response Types
export interface RecurringScheduleResponse {
  id: number;
  type: "DAILY" | "WEEKLY" | "CUSTOM" | string;
  daysOfWeek: number[];
  time: string;
  timezone: string;
  startDate: Date;
  isActive: boolean;
  nextOccurrence: Date | null;
}

export interface OccurrenceResponse {
  scheduledTime: string;
  status: string;
  sessionId: number | null;
}

// API Response Wrappers
export interface CreateRoomResponse extends ApiResponse<RoomResponse> {
  room: RoomResponse;
}

export interface GetRoomsResponse extends ApiResponse<RoomResponse[]> {
  rooms: RoomResponse[];
}

export interface GetMyRoomsResponse extends ApiResponse<{ created: RoomResponse[]; joined: RoomResponse[] }> {
  rooms: {
    created: RoomResponse[];
    joined: RoomResponse[];
  };
}

export interface GetRoomResponse extends ApiResponse<RoomDetailResponse> {
  room: RoomDetailResponse;
}

export interface UpdateRoomResponse extends ApiResponse<RoomResponse> {
  room: RoomResponse;
}

export interface DeleteRoomResponse extends ApiResponse<null> {
  message: string;
}

export interface StartSessionResponse extends ApiResponse<SessionResponse> {
  message: string;
  session: SessionResponse;
  timer: SessionTimerResponse;
}

export interface PauseSessionResponse extends ApiResponse<SessionResponse> {
  message: string;
  session: SessionResponse;
  timer: SessionTimerResponse;
}

export interface ResumeSessionResponse extends ApiResponse<SessionResponse> {
  message: string;
  session: SessionResponse;
  timer: SessionTimerResponse;
}

export interface EndSessionResponse extends ApiResponse<SessionResponse> {
  message: string;
  session: SessionResponse;
}

export interface GetSessionTimerResponse extends ApiResponse<SessionTimerResponse> {
  timer: SessionTimerResponse;
}

export interface JoinRoomResponse extends ApiResponse<ParticipantResponse> {
  participant: ParticipantResponse;
  roomId: number;
}

export interface LeaveRoomResponse extends ApiResponse<null> {
  message: string;
}

export interface GetParticipantsResponse extends ApiResponse<ParticipantResponse[]> {
  participants: ParticipantResponse[];
}

export interface UpdateIntentionResponse extends ApiResponse<Partial<ParticipantResponse>> {
  message: string;
  participant: Partial<ParticipantResponse>;
}

export interface UpdateCompletionResponse extends ApiResponse<Partial<ParticipantResponse>> {
  message: string;
  participant: Partial<ParticipantResponse>;
}

export interface UpdateParticipantStatusResponse extends ApiResponse<Partial<ParticipantResponse>> {
  message: string;
  participant: Partial<ParticipantResponse>;
}

export interface RemoveParticipantResponse extends ApiResponse<null> {
  message: string;
}

export interface CreateInvitationResponse extends ApiResponse<InvitationResponse> {
  invitation: InvitationResponse;
}

export interface GetInvitationResponse extends ApiResponse<InvitationResponse> {
  invitation: InvitationResponse;
}

export interface AcceptInvitationResponse extends ApiResponse<{ roomId: number }> {
  message: string;
  roomId: number;
}

export interface DeclineInvitationResponse extends ApiResponse<null> {
  message: string;
}

export interface GetInvitationsResponse extends ApiResponse<InvitationResponse[]> {
  invitations: InvitationResponse[];
}

export interface CancelInvitationResponse extends ApiResponse<null> {
  message: string;
}

export interface GetTemplatesResponse extends ApiResponse<TemplateResponse[]> {
  templates: TemplateResponse[];
}

export interface GetAllTemplatesResponse extends ApiResponse<{ system: TemplateResponse[]; user: TemplateResponse[]; public: TemplateResponse[] }> {
  templates: {
    system: TemplateResponse[];
    user: TemplateResponse[];
    public: TemplateResponse[];
  };
}

export interface GetTemplateResponse extends ApiResponse<TemplateResponse> {
  template: TemplateResponse;
}

export interface CreateTemplateResponse extends ApiResponse<TemplateResponse> {
  template: TemplateResponse;
}

export interface CreateRoomFromTemplateResponse extends ApiResponse<RoomResponse> {
  room: RoomResponse;
  roomId: number;
}

export interface ScheduleSessionResponse extends ApiResponse<RoomResponse> {
  message: string;
  room: RoomResponse & {
    scheduledStartTime: Date | null;
    recurringSchedule: RecurringScheduleResponse | null;
  };
}

export interface CancelScheduledSessionResponse extends ApiResponse<RoomResponse> {
  message: string;
  room: RoomResponse;
}

export interface UpdateRecurringScheduleResponse extends ApiResponse<RecurringScheduleResponse> {
  message: string;
  recurringSchedule: RecurringScheduleResponse;
}

export interface CancelRecurringScheduleResponse extends ApiResponse<null> {
  message: string;
}

export interface GetUpcomingOccurrencesResponse extends ApiResponse<OccurrenceResponse[]> {
  occurrences: OccurrenceResponse[];
}

export interface GetSessionHistoryResponse extends ApiResponse<SessionHistoryResponse[]> {
  sessions: SessionHistoryResponse[];
}

