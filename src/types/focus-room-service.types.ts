import type { Prisma } from "@prisma/client";
import type {
  FocusRoom,
  FocusRoomSession,
  FocusRoomParticipant,
  FocusRoomInvitation,
  FocusRoomTemplate,
  RecurringSchedule,
} from "@prisma/client";

// Re-export Prisma types for convenience
export type { FocusRoom, FocusRoomSession, FocusRoomParticipant, FocusRoomInvitation, FocusRoomTemplate, RecurringSchedule };

// Prisma includes for common queries
export type FocusRoomWithCreator = Prisma.FocusRoomGetPayload<{
  include: {
    creator: {
      select: {
        id: true;
        name: true;
        username: true;
        email: true;
        profile_photo_url: true;
      };
    };
  };
}>;

export type FocusRoomWithDetails = Prisma.FocusRoomGetPayload<{
  include: {
    creator: {
      select: {
        id: true;
        name: true;
        username: true;
        email: true;
        profile_photo_url: true;
      };
    };
    participants: {
      where: {
        status: { not: "LEFT" };
      };
      include: {
        user: {
          select: {
            id: true;
            name: true;
            username: true;
            email: true;
            profile_photo_url: true;
          };
        };
      };
      take: number;
    };
    _count: {
      select: {
        participants: {
          where: {
            status: { not: "LEFT" };
          };
        };
      };
    };
  };
}>;

export type FocusRoomSessionWithRoom = Prisma.FocusRoomSessionGetPayload<{
  include: {
    room: {
      select: {
        focusDuration: true;
        breakDuration: true;
      };
    };
  };
}>;

export type FocusRoomSessionWithDetails = Prisma.FocusRoomSessionGetPayload<{
  include: {
    room: {
      include: {
        participants: {
          where: {
            status: { not: "LEFT" };
          };
          include: {
            user: {
              select: {
                id: true;
                name: true;
                username: true;
                email: true;
                profile_photo_url: true;
              };
            };
          };
        };
      };
    };
  };
}>;

export type FocusRoomParticipantWithUser = Prisma.FocusRoomParticipantGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        name: true;
        username: true;
        email: true;
        profile_photo_url: true;
      };
    };
  };
}>;

export type FocusRoomParticipantWithRoom = Prisma.FocusRoomParticipantGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        name: true;
        username: true;
        email: true;
        profile_photo_url: true;
      };
    };
    room: {
      select: {
        id: true;
        name: true;
        focusDuration: true;
        breakDuration: true;
      };
    };
  };
}>;

export type FocusRoomInvitationWithDetails = Prisma.FocusRoomInvitationGetPayload<{
  include: {
    room: {
      include: {
        creator: {
          select: {
            id: true;
            name: true;
            username: true;
            email: true;
            profile_photo_url: true;
          };
        };
      };
    };
    inviter: {
      select: {
        id: true;
        name: true;
        username: true;
        email: true;
      };
    };
  };
}>;

export type FocusRoomTemplateWithCreator = Prisma.FocusRoomTemplateGetPayload<{
  include: {
    creator: {
      select: {
        id: true;
        name: true;
        username: true;
      };
    };
  };
}>;

// Update data types
export type FocusRoomUpdateData = Prisma.FocusRoomUpdateInput;

export type FocusRoomTemplateUpdateData = Prisma.FocusRoomTemplateUpdateInput;

export type RecurringScheduleUpdateData = Prisma.RecurringScheduleUpdateInput;

// WebSocket event payload types
export interface SessionTimerInfo {
  sessionId: number;
  status: "PENDING" | "ACTIVE" | "PAUSED" | "COMPLETED";
  remainingTime: number;
  startedAt: Date;
  scheduledDuration: number;
  pausedAt: Date | null;
  resumedAt: Date | null;
}

export interface WebSocketSessionPayload {
  id: number;
  roomId: number;
  startedAt: Date;
  endedAt: Date | null;
  pausedAt: Date | null;
  resumedAt: Date | null;
  scheduledDuration: number;
  actualDuration: number | null;
  status: "PENDING" | "ACTIVE" | "PAUSED" | "COMPLETED";
}

export interface WebSocketTimerPayload extends SessionTimerInfo {}

// JWT User type
export interface JWTUser {
  id: number;
  userId?: number;
  email?: string;
  [key: string]: unknown;
}

