/**
 * Comprehensive Unit Tests for Focus Rooms Feature
 * Tests the complete flow of focus rooms including:
 * - Room creation, update, deletion
 * - Session management (start, pause, resume, end)
 * - Participant management (join, leave, update)
 * - Invitation management (create, accept, decline)
 * - Access control and security
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma BEFORE importing services - use factory function
vi.mock('../config/prisma.js', () => {
  const mockPrisma = {
    focusRoom: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    focusRoomSession: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    focusRoomParticipant: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    focusRoomInvitation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    recurringSchedule: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return {
    default: mockPrisma,
    __mockPrisma: mockPrisma,
  };
});

// Mock bcrypt - use factory function
vi.mock('bcrypt', () => {
  const mockHash = vi.fn();
  const mockCompare = vi.fn();
  return {
    default: {
      hash: mockHash,
      compare: mockCompare,
    },
    __mockHash: mockHash,
    __mockCompare: mockCompare,
  };
});

// Mock user-status service - use factory function
vi.mock('../services/user-status.service.js', () => {
  const mockUpdateUserStatus = vi.fn();
  return {
    default: {
      updateUserStatus: mockUpdateUserStatus,
    },
    __mockUpdateUserStatus: mockUpdateUserStatus,
  };
});

// Mock email service
vi.mock('../services/focus-room-email.service.js', () => ({
  sendFocusRoomInvitationEmail: vi.fn().mockResolvedValue(undefined),
}));

// Now import services after mocks are set up
import { focusRoomService } from '../services/focus-room.service.js';
import { focusRoomSessionService } from '../services/focus-room-session.service.js';
import { focusRoomParticipantService } from '../services/focus-room-participant.service.js';
import { focusRoomInvitationService } from '../services/focus-room-invitation.service.js';
import prisma from '../config/prisma.js';
import * as bcryptModule from 'bcrypt';
import * as userStatusModule from '../services/user-status.service.js';

// Get mocked functions
const mockHash = (bcryptModule as any).__mockHash || bcryptModule.default.hash;
const mockCompare = (bcryptModule as any).__mockCompare || bcryptModule.default.compare;
const mockUpdateUserStatus = (userStatusModule as any).__mockUpdateUserStatus || userStatusModule.default.updateUserStatus;

// Helper to create mock room
const createMockRoom = (overrides = {}) => ({
  id: 1,
  name: 'Test Focus Room',
  description: 'Test Description',
  creatorId: 1,
  status: 'active',
  visibility: 'PUBLIC',
  focusDuration: 25,
  breakDuration: 5,
  allowObservers: true,
  passwordHash: null,
  requiresPassword: false,
  settings: {},
  scheduledStartTime: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Helper to create mock user
const createMockUser = (overrides = {}) => ({
  id: 1,
  name: 'Test User',
  username: 'testuser',
  email: 'test@example.com',
  profile_photo_url: null,
  ...overrides,
});

// Helper to create mock participant
const createMockParticipant = (overrides = {}) => ({
  id: 1,
  roomId: 1,
  userId: 1,
  role: 'CREATOR',
  status: 'JOINED',
  joinedAt: new Date(),
  leftAt: null,
  intention: null,
  completion: null,
  shareCompletion: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Helper to create mock session
const createMockSession = (overrides = {}) => ({
  id: 1,
  roomId: 1,
  startedAt: new Date(),
  endedAt: null,
  pausedAt: null,
  resumedAt: null,
  scheduledDuration: 1500, // 25 minutes in seconds
  actualDuration: null,
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Helper to create mock invitation
const createMockInvitation = (overrides = {}) => {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  return {
    id: 1,
    roomId: 1,
    inviterId: 1,
    inviteeId: null,
    inviteeEmail: 'invitee@example.com',
    token: 'TEST_TOKEN_1234567890123456789012345678',
    status: 'PENDING',
    expiresAt,
    respondedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
};

describe('FocusRoomService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHash.mockResolvedValue('hashed_password');
    mockCompare.mockResolvedValue(true);
    mockUpdateUserStatus.mockResolvedValue(undefined);
  });

  describe('createRoom', () => {
    it('should create a public room successfully', async () => {
      const mockRoom = createMockRoom();
      const mockUser = createMockUser();
      const mockParticipant = createMockParticipant();

      prisma.focusRoom.create.mockResolvedValue({
        ...mockRoom,
        creator: mockUser,
      });
      prisma.focusRoomParticipant.create.mockResolvedValue(mockParticipant);

      const result = await focusRoomService.createRoom(1, {
        name: 'Test Focus Room',
        description: 'Test Description',
        visibility: 'PUBLIC',
        focusDuration: 25,
        breakDuration: 5,
        allowObservers: true,
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('Test Focus Room');
      expect(prisma.focusRoom.create).toHaveBeenCalled();
      expect(prisma.focusRoomParticipant.create).toHaveBeenCalled();
    });

    it('should create a private room with password', async () => {
      const mockRoom = createMockRoom({
        visibility: 'PRIVATE',
        requiresPassword: true,
        passwordHash: 'hashed_password',
      });
      const mockUser = createMockUser();
      const mockParticipant = createMockParticipant();

      prisma.focusRoom.create.mockResolvedValue({
        ...mockRoom,
        creator: mockUser,
      });
      prisma.focusRoomParticipant.create.mockResolvedValue(mockParticipant);

      const result = await focusRoomService.createRoom(1, {
        name: 'Private Room',
        visibility: 'PRIVATE',
        focusDuration: 25,
        breakDuration: 5,
        password: 'testpassword',
      });

      expect(result).toBeDefined();
      expect(mockHash).toHaveBeenCalledWith('testpassword', 10);
      expect(prisma.focusRoom.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requiresPassword: true,
            passwordHash: 'hashed_password',
          }),
        })
      );
    });

    it('should create a scheduled room', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1);
      const mockRoom = createMockRoom({
        status: 'scheduled',
        scheduledStartTime: futureDate,
      });
      const mockUser = createMockUser();
      const mockParticipant = createMockParticipant();

      prisma.focusRoom.create.mockResolvedValue({
        ...mockRoom,
        creator: mockUser,
      });
      prisma.focusRoomParticipant.create.mockResolvedValue(mockParticipant);

      const result = await focusRoomService.createRoom(1, {
        name: 'Scheduled Room',
        visibility: 'PUBLIC',
        focusDuration: 25,
        breakDuration: 5,
        scheduledStartTime: futureDate.toISOString(),
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('scheduled');
    });

    it('should reject scheduled time in the past', async () => {
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);

      await expect(
        focusRoomService.createRoom(1, {
          name: 'Test Room',
          visibility: 'PUBLIC',
          focusDuration: 25,
          breakDuration: 5,
          scheduledStartTime: pastDate.toISOString(),
        })
      ).rejects.toThrow('Scheduled start time must be in the future');
    });
  });

  describe('getRoomById', () => {
    it('should return public room for any user', async () => {
      const mockRoom = createMockRoom();
      const mockUser = createMockUser();

      prisma.focusRoom.findUnique.mockResolvedValue({
        ...mockRoom,
        creator: mockUser,
        participants: [],
        _count: { participants: 0 },
      });

      const result = await focusRoomService.getRoomById(1, 2);

      expect(result).toBeDefined();
      expect(result.hasAccess).toBe(true);
      expect(result.room).toBeDefined();
    });

    it('should deny access to private room without invitation', async () => {
      const mockRoom = createMockRoom({ visibility: 'PRIVATE' });
      const mockUser = createMockUser();

      prisma.focusRoom.findUnique.mockResolvedValue({
        ...mockRoom,
        creator: mockUser,
        participants: [],
        _count: { participants: 0 },
      });
      prisma.focusRoomInvitation.findFirst.mockResolvedValue(null);

      const result = await focusRoomService.getRoomById(1, 2);

      expect(result.hasAccess).toBe(false);
      expect(result.requiresInvitation).toBe(true);
    });

    it('should allow access to private room for creator', async () => {
      const mockRoom = createMockRoom({ visibility: 'PRIVATE' });
      const mockUser = createMockUser();

      prisma.focusRoom.findUnique.mockResolvedValue({
        ...mockRoom,
        creator: mockUser,
        participants: [],
        _count: { participants: 0 },
      });

      const result = await focusRoomService.getRoomById(1, 1);

      expect(result.hasAccess).toBe(true);
      expect(result.isCreator).toBe(true);
    });

    it('should allow access to private room with accepted invitation', async () => {
      const mockRoom = createMockRoom({ visibility: 'PRIVATE' });
      const mockUser = createMockUser();
      const mockInvitation = createMockInvitation({ status: 'ACCEPTED' });

      prisma.focusRoom.findUnique.mockResolvedValue({
        ...mockRoom,
        creator: mockUser,
        participants: [],
        _count: { participants: 0 },
      });
      prisma.focusRoomInvitation.findFirst.mockResolvedValue(mockInvitation);

      const result = await focusRoomService.getRoomById(1, 2);

      expect(result.hasAccess).toBe(true);
    });

    it('should return null for non-existent room', async () => {
      prisma.focusRoom.findUnique.mockResolvedValue(null);

      const result = await focusRoomService.getRoomById(999);

      expect(result).toBeNull();
    });
  });

  describe('updateRoom', () => {
    it('should update room successfully', async () => {
      const mockRoom = createMockRoom();
      const mockUser = createMockUser();

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomSession.findFirst.mockResolvedValue(null);
      prisma.focusRoom.update.mockResolvedValue({
        ...mockRoom,
        name: 'Updated Name',
        creator: mockUser,
      });

      const result = await focusRoomService.updateRoom(1, 1, {
        name: 'Updated Name',
      });

      expect(result.name).toBe('Updated Name');
      expect(prisma.focusRoom.update).toHaveBeenCalled();
    });

    it('should reject update from non-creator', async () => {
      const mockRoom = createMockRoom();

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);

      await expect(
        focusRoomService.updateRoom(1, 2, { name: 'Updated Name' })
      ).rejects.toThrow('Only room creator can update the room');
    });

    it('should reject update during active session', async () => {
      const mockRoom = createMockRoom();
      const mockSession = createMockSession();

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomSession.findFirst.mockResolvedValue(mockSession);

      await expect(
        focusRoomService.updateRoom(1, 1, { name: 'Updated Name' })
      ).rejects.toThrow('Cannot update room settings while a session is active');
    });

    it('should update password correctly', async () => {
      const mockRoom = createMockRoom();
      const mockUser = createMockUser();

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomSession.findFirst.mockResolvedValue(null);
      prisma.focusRoom.update.mockResolvedValue({
        ...mockRoom,
        requiresPassword: true,
        creator: mockUser,
      });

      await focusRoomService.updateRoom(1, 1, {
        password: 'newpassword',
      });

      expect(mockHash).toHaveBeenCalledWith('newpassword', 10);
      expect(prisma.focusRoom.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requiresPassword: true,
            passwordHash: 'hashed_password',
          }),
        })
      );
    });

    it('should remove password when set to null', async () => {
      const mockRoom = createMockRoom({ requiresPassword: true });
      const mockUser = createMockUser();

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomSession.findFirst.mockResolvedValue(null);
      prisma.focusRoom.update.mockResolvedValue({
        ...mockRoom,
        requiresPassword: false,
        passwordHash: null,
        creator: mockUser,
      });

      await focusRoomService.updateRoom(1, 1, {
        password: null,
      });

      expect(prisma.focusRoom.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requiresPassword: false,
            passwordHash: null,
          }),
        })
      );
    });
  });

  describe('deleteRoom', () => {
    it('should delete room successfully', async () => {
      const mockRoom = createMockRoom();

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomSession.findFirst.mockResolvedValue(null);
      prisma.focusRoom.delete.mockResolvedValue(mockRoom);

      const result = await focusRoomService.deleteRoom(1, 1);

      expect(result).toBe(true);
      expect(prisma.focusRoom.delete).toHaveBeenCalled();
    });

    it('should reject delete from non-creator', async () => {
      const mockRoom = createMockRoom();

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);

      await expect(focusRoomService.deleteRoom(1, 2)).rejects.toThrow(
        'Only room creator can delete the room'
      );
    });

    it('should reject delete during active session', async () => {
      const mockRoom = createMockRoom();
      const mockSession = createMockSession();

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomSession.findFirst.mockResolvedValue(mockSession);

      await expect(focusRoomService.deleteRoom(1, 1)).rejects.toThrow(
        'Cannot delete room while a session is active'
      );
    });
  });

  describe('verifyRoomPassword', () => {
    it('should verify correct password', async () => {
      const mockRoom = createMockRoom({
        requiresPassword: true,
        passwordHash: 'hashed_password',
      });

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      mockCompare.mockResolvedValue(true);

      const result = await focusRoomService.verifyRoomPassword(1, 'password');

      expect(result).toBe(true);
      expect(mockCompare).toHaveBeenCalledWith('password', 'hashed_password');
    });

    it('should reject incorrect password', async () => {
      const mockRoom = createMockRoom({
        requiresPassword: true,
        passwordHash: 'hashed_password',
      });

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      mockCompare.mockResolvedValue(false);

      const result = await focusRoomService.verifyRoomPassword(1, 'wrong');

      expect(result).toBe(false);
    });

    it('should return true for room without password', async () => {
      const mockRoom = createMockRoom({ requiresPassword: false });

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);

      const result = await focusRoomService.verifyRoomPassword(1, 'any');

      expect(result).toBe(true);
    });
  });

  describe('isRoomFull', () => {
    it('should return true when room has 10 participants', async () => {
      prisma.focusRoomParticipant.count.mockResolvedValue(10);

      const result = await focusRoomService.isRoomFull(1);

      expect(result).toBe(true);
    });

    it('should return false when room has less than 10 participants', async () => {
      prisma.focusRoomParticipant.count.mockResolvedValue(5);

      const result = await focusRoomService.isRoomFull(1);

      expect(result).toBe(false);
    });
  });
});

describe('FocusRoomSessionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateUserStatus.mockResolvedValue(undefined);
  });

  describe('startSession', () => {
    it('should start session successfully', async () => {
      const mockRoom = createMockRoom();
      const mockSession = createMockSession();
      const mockParticipant = createMockParticipant();

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomSession.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          focusRoomSession: {
            create: vi.fn().mockResolvedValue(mockSession),
          },
          focusRoomParticipant: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        });
      });
      prisma.focusRoomParticipant.findMany.mockResolvedValue([
        mockParticipant,
      ]);

      const result = await focusRoomSessionService.startSession(1, 1);

      expect(result).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockUpdateUserStatus).toHaveBeenCalled();
    });

    it('should reject start from non-creator', async () => {
      const mockRoom = createMockRoom();

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);

      await expect(
        focusRoomSessionService.startSession(1, 2)
      ).rejects.toThrow('Only room creator can start a session');
    });

    it('should reject start when session already active', async () => {
      const mockRoom = createMockRoom();
      const mockSession = createMockSession();

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomSession.findFirst.mockResolvedValue(mockSession);

      await expect(
        focusRoomSessionService.startSession(1, 1)
      ).rejects.toThrow('A session is already in progress');
    });

    it('should use custom duration when provided', async () => {
      const mockRoom = createMockRoom();
      const mockSession = createMockSession({ scheduledDuration: 1800 }); // 30 minutes

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomSession.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          focusRoomSession: {
            create: vi.fn().mockResolvedValue(mockSession),
          },
          focusRoomParticipant: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        });
      });
      prisma.focusRoomParticipant.findMany.mockResolvedValue([]);

      await focusRoomSessionService.startSession(1, 1, { duration: 30 });

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('pauseSession', () => {
    it('should pause active session', async () => {
      const mockRoom = createMockRoom();
      const mockSession = createMockSession({ status: 'ACTIVE' });

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomSession.findUnique.mockResolvedValue(mockSession);
      prisma.focusRoomSession.update.mockResolvedValue({
        ...mockSession,
        status: 'PAUSED',
        pausedAt: new Date(),
      });

      const result = await focusRoomSessionService.pauseSession(1, 1, 1);

      expect(result.status).toBe('PAUSED');
      expect(result.pausedAt).toBeDefined();
    });

    it('should reject pause from non-creator', async () => {
      const mockRoom = createMockRoom();
      const mockSession = createMockSession();

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomSession.findUnique.mockResolvedValue(mockSession);

      await expect(
        focusRoomSessionService.pauseSession(1, 1, 2)
      ).rejects.toThrow('Only room creator can pause a session');
    });

    it('should reject pause of non-active session', async () => {
      const mockRoom = createMockRoom();
      const mockSession = createMockSession({ status: 'PAUSED' });

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomSession.findUnique.mockResolvedValue(mockSession);

      await expect(
        focusRoomSessionService.pauseSession(1, 1, 1)
      ).rejects.toThrow('Only active sessions can be paused');
    });
  });

  describe('resumeSession', () => {
    it('should resume paused session', async () => {
      const mockRoom = createMockRoom();
      const pausedAt = new Date();
      pausedAt.setMinutes(pausedAt.getMinutes() - 10);
      const mockSession = createMockSession({
        status: 'PAUSED',
        pausedAt,
      });
      const mockParticipant = createMockParticipant();

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomSession.findUnique.mockResolvedValue(mockSession);
      prisma.focusRoomSession.update.mockResolvedValue({
        ...mockSession,
        status: 'ACTIVE',
        resumedAt: new Date(),
      });
      prisma.focusRoomParticipant.findMany.mockResolvedValue([
        mockParticipant,
      ]);

      const result = await focusRoomSessionService.resumeSession(1, 1, 1);

      expect(result.status).toBe('ACTIVE');
      expect(result.resumedAt).toBeDefined();
      expect(mockUpdateUserStatus).toHaveBeenCalled();
    });

    it('should reject resume of non-paused session', async () => {
      const mockRoom = createMockRoom();
      const mockSession = createMockSession({ status: 'ACTIVE' });

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomSession.findUnique.mockResolvedValue(mockSession);

      await expect(
        focusRoomSessionService.resumeSession(1, 1, 1)
      ).rejects.toThrow('Only paused sessions can be resumed');
    });
  });

  describe('endSession', () => {
    it('should end session successfully', async () => {
      const mockRoom = createMockRoom();
      const mockSession = createMockSession({ status: 'ACTIVE' });
      const mockParticipant = createMockParticipant();

      prisma.focusRoomSession.findUnique.mockResolvedValue({
        ...mockSession,
        room: mockRoom,
      });
      prisma.recurringSchedule.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          focusRoomSession: {
            update: vi.fn().mockResolvedValue({
              ...mockSession,
              status: 'COMPLETED',
              endedAt: new Date(),
            }),
          },
          focusRoom: {
            update: vi.fn().mockResolvedValue({
              ...mockRoom,
              status: 'completed',
            }),
          },
          focusRoomParticipant: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        });
      });
      prisma.focusRoomParticipant.findMany.mockResolvedValue([
        mockParticipant,
      ]);

      const result = await focusRoomSessionService.endSession(1, 1, 1);

      expect(result.status).toBe('COMPLETED');
      expect(result.endedAt).toBeDefined();
      expect(mockUpdateUserStatus).toHaveBeenCalled();
    });

    it('should reject end from non-creator', async () => {
      const mockRoom = createMockRoom();
      const mockSession = createMockSession();

      prisma.focusRoomSession.findUnique.mockResolvedValue({
        ...mockSession,
        room: mockRoom,
      });

      await expect(
        focusRoomSessionService.endSession(1, 1, 2)
      ).rejects.toThrow('Only room creator can manually end a session');
    });

    it('should keep room active if recurring schedule exists', async () => {
      const mockRoom = createMockRoom();
      const mockSession = createMockSession({ status: 'ACTIVE' });
      const mockRecurringSchedule = { id: 1, roomId: 1, isActive: true };

      prisma.focusRoomSession.findUnique.mockResolvedValue({
        ...mockSession,
        room: mockRoom,
      });
      prisma.recurringSchedule.findUnique.mockResolvedValue(
        mockRecurringSchedule
      );
      prisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          focusRoomSession: {
            update: vi.fn().mockResolvedValue({
              ...mockSession,
              status: 'COMPLETED',
            }),
          },
          focusRoom: {
            update: vi.fn().mockResolvedValue({
              ...mockRoom,
              status: 'active',
            }),
          },
          focusRoomParticipant: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        });
      });
      prisma.focusRoomParticipant.findMany.mockResolvedValue([]);

      await focusRoomSessionService.endSession(1, 1, 1);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should return session if already completed', async () => {
      const mockRoom = createMockRoom();
      const mockSession = createMockSession({
        status: 'COMPLETED',
        endedAt: new Date(),
      });

      prisma.focusRoomSession.findUnique.mockResolvedValue({
        ...mockSession,
        room: mockRoom,
      });

      const result = await focusRoomSessionService.endSession(1, 1);

      expect(result.status).toBe('COMPLETED');
    });
  });

  describe('getActiveSession', () => {
    it('should return active session', async () => {
      const mockSession = createMockSession({ status: 'ACTIVE' });
      const mockRoom = createMockRoom();

      prisma.focusRoomSession.findFirst.mockResolvedValue({
        ...mockSession,
        room: mockRoom,
      });

      const result = await focusRoomSessionService.getActiveSession(1);

      expect(result).toBeDefined();
      expect(result.status).toBe('ACTIVE');
    });

    it('should return null when no active session', async () => {
      prisma.focusRoomSession.findFirst.mockResolvedValue(null);

      const result = await focusRoomSessionService.getActiveSession(1);

      expect(result).toBeNull();
    });
  });

  describe('getSessionTimer', () => {
    it('should calculate remaining time correctly', async () => {
      const startedAt = new Date();
      startedAt.setMinutes(startedAt.getMinutes() - 10); // Started 10 minutes ago
      const mockSession = createMockSession({
        startedAt,
        scheduledDuration: 1500, // 25 minutes
      });

      prisma.focusRoomSession.findUnique.mockResolvedValue(mockSession);

      const result = await focusRoomSessionService.getSessionTimer(1);

      expect(result).toBeDefined();
      expect(result.remainingTime).toBeGreaterThan(0);
      expect(result.remainingTime).toBeLessThan(1500);
    });

    it('should handle paused session correctly', async () => {
      const startedAt = new Date();
      startedAt.setMinutes(startedAt.getMinutes() - 20);
      const pausedAt = new Date();
      pausedAt.setMinutes(pausedAt.getMinutes() - 10);
      const mockSession = createMockSession({
        startedAt,
        pausedAt,
        scheduledDuration: 1500,
        status: 'PAUSED',
      });

      prisma.focusRoomSession.findUnique.mockResolvedValue(mockSession);

      const result = await focusRoomSessionService.getSessionTimer(1);

      expect(result).toBeDefined();
      expect(result.status).toBe('PAUSED');
    });
  });

  describe('checkAndEndExpiredSessions', () => {
    it('should end expired sessions', async () => {
      const startedAt = new Date();
      startedAt.setMinutes(startedAt.getMinutes() - 30); // Started 30 minutes ago
      const mockSession = createMockSession({
        startedAt,
        scheduledDuration: 1500, // 25 minutes
        status: 'ACTIVE',
      });
      const mockRoom = createMockRoom();

      prisma.focusRoomSession.findMany.mockResolvedValue([mockSession]);
      prisma.focusRoomSession.findUnique.mockResolvedValue({
        ...mockSession,
        room: mockRoom,
      });
      prisma.recurringSchedule.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          focusRoomSession: {
            update: vi.fn().mockResolvedValue({
              ...mockSession,
              status: 'COMPLETED',
            }),
          },
          focusRoom: {
            update: vi.fn().mockResolvedValue(mockRoom),
          },
          focusRoomParticipant: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        });
      });
      prisma.focusRoomParticipant.findMany.mockResolvedValue([]);

      const result =
        await focusRoomSessionService.checkAndEndExpiredSessions();

      expect(result).toContain(mockSession.id);
    });
  });
});

describe('FocusRoomParticipantService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompare.mockResolvedValue(true);
  });

  describe('joinRoom', () => {
    it('should join public room successfully', async () => {
      const mockRoom = createMockRoom();
      const mockUser = createMockUser();
      const mockParticipant = createMockParticipant({
        role: 'PARTICIPANT',
        userId: 2,
      });

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomParticipant.count.mockResolvedValue(5);
      prisma.focusRoomParticipant.findUnique.mockResolvedValue(null);
      prisma.focusRoomParticipant.create.mockResolvedValue({
        ...mockParticipant,
        user: mockUser,
        room: mockRoom,
      });

      const result = await focusRoomParticipantService.joinRoom(1, 2, {});

      expect(result).toBeDefined();
      expect(prisma.focusRoomParticipant.create).toHaveBeenCalled();
    });

    it('should join room with password', async () => {
      const mockRoom = createMockRoom({
        requiresPassword: true,
        passwordHash: 'hashed_password',
      });
      const mockUser = createMockUser({ id: 2 });
      const mockParticipant = createMockParticipant({
        role: 'PARTICIPANT',
        userId: 2,
      });

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomParticipant.count.mockResolvedValue(5);
      prisma.focusRoomParticipant.findUnique.mockResolvedValue(null);
      prisma.focusRoomParticipant.create.mockResolvedValue({
        ...mockParticipant,
        user: mockUser,
        room: mockRoom,
      });

      const result = await focusRoomParticipantService.joinRoom(1, 2, {
        password: 'correctpassword',
      });

      expect(result).toBeDefined();
      expect(mockCompare).toHaveBeenCalled();
    });

    it('should reject join with wrong password', async () => {
      const mockRoom = createMockRoom({
        requiresPassword: true,
        passwordHash: 'hashed_password',
      });

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      mockCompare.mockResolvedValue(false);

      await expect(
        focusRoomParticipantService.joinRoom(1, 2, {
          password: 'wrongpassword',
        })
      ).rejects.toThrow('Invalid password');
    });

    it('should reject join when room is full', async () => {
      const mockRoom = createMockRoom();

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomParticipant.count.mockResolvedValue(10);

      await expect(
        focusRoomParticipantService.joinRoom(1, 2, {})
      ).rejects.toThrow('Room is full');
    });

    it('should rejoin if participant previously left', async () => {
      const mockRoom = createMockRoom();
      const mockParticipant = createMockParticipant({
        status: 'LEFT',
        leftAt: new Date(),
      });
      const mockUser = createMockUser();

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomParticipant.count.mockResolvedValue(5);
      prisma.focusRoomParticipant.findUnique.mockResolvedValue(
        mockParticipant
      );
      prisma.focusRoomParticipant.update.mockResolvedValue({
        ...mockParticipant,
        status: 'JOINED',
        leftAt: null,
        user: mockUser,
        room: mockRoom,
      });

      const result = await focusRoomParticipantService.joinRoom(1, 1, {});

      expect(result.status).toBe('JOINED');
      expect(result.leftAt).toBeNull();
    });

    it('should return existing participant if already joined', async () => {
      const mockRoom = createMockRoom();
      const mockParticipant = createMockParticipant();
      const mockUser = createMockUser();

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomParticipant.count.mockResolvedValue(5);
      prisma.focusRoomParticipant.findUnique.mockResolvedValue(
        mockParticipant
      );
      prisma.focusRoomParticipant.findUnique.mockResolvedValueOnce(
        mockParticipant
      ).mockResolvedValueOnce({
        ...mockParticipant,
        user: mockUser,
        room: mockRoom,
      });

      const result = await focusRoomParticipantService.joinRoom(1, 1, {});

      expect(result).toBeDefined();
    });
  });

  describe('leaveRoom', () => {
    it('should leave room successfully', async () => {
      const mockParticipant = createMockParticipant({
        role: 'PARTICIPANT',
        userId: 2,
      });

      prisma.focusRoomParticipant.findUnique.mockResolvedValue(
        mockParticipant
      );
      prisma.focusRoomParticipant.update.mockResolvedValue({
        ...mockParticipant,
        status: 'LEFT',
        leftAt: new Date(),
      });

      const result = await focusRoomParticipantService.leaveRoom(1, 2);

      expect(result.status).toBe('LEFT');
      expect(result.leftAt).toBeDefined();
    });

    it('should reject leave for creator', async () => {
      const mockParticipant = createMockParticipant({ role: 'CREATOR' });

      prisma.focusRoomParticipant.findUnique.mockResolvedValue(
        mockParticipant
      );

      await expect(
        focusRoomParticipantService.leaveRoom(1, 1)
      ).rejects.toThrow('Room creator cannot leave the room');
    });

    it('should reject leave for non-participant', async () => {
      prisma.focusRoomParticipant.findUnique.mockResolvedValue(null);

      await expect(
        focusRoomParticipantService.leaveRoom(1, 2)
      ).rejects.toThrow('You are not a participant in this room');
    });
  });

  describe('updateIntention', () => {
    it('should update intention successfully', async () => {
      const mockParticipant = createMockParticipant();
      const mockUser = createMockUser();

      prisma.focusRoomParticipant.findUnique.mockResolvedValue(
        mockParticipant
      );
      prisma.focusRoomParticipant.update.mockResolvedValue({
        ...mockParticipant,
        intention: 'Focus on coding',
        user: mockUser,
      });

      const result = await focusRoomParticipantService.updateIntention(1, 1, {
        intention: 'Focus on coding',
      });

      expect(result.intention).toBe('Focus on coding');
    });

    it('should reject update for non-participant', async () => {
      prisma.focusRoomParticipant.findUnique.mockResolvedValue(null);

      await expect(
        focusRoomParticipantService.updateIntention(1, 2, {
          intention: 'Test',
        })
      ).rejects.toThrow('You are not a participant in this room');
    });
  });

  describe('updateCompletion', () => {
    it('should update completion successfully', async () => {
      const mockParticipant = createMockParticipant();
      const mockUser = createMockUser();

      prisma.focusRoomParticipant.findUnique.mockResolvedValue(
        mockParticipant
      );
      prisma.focusRoomParticipant.update.mockResolvedValue({
        ...mockParticipant,
        completion: 'Completed task',
        shareCompletion: true,
        user: mockUser,
      });

      const result = await focusRoomParticipantService.updateCompletion(1, 1, {
        completion: 'Completed task',
        shareCompletion: true,
      });

      expect(result.completion).toBe('Completed task');
      expect(result.shareCompletion).toBe(true);
    });
  });

  describe('removeParticipant', () => {
    it('should remove participant successfully', async () => {
      const mockRoom = createMockRoom();
      const mockParticipant = createMockParticipant({
        role: 'PARTICIPANT',
        userId: 2,
      });

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomParticipant.findUnique.mockResolvedValue(
        mockParticipant
      );
      prisma.focusRoomParticipant.update.mockResolvedValue({
        ...mockParticipant,
        status: 'LEFT',
      });

      const result = await focusRoomParticipantService.removeParticipant(
        1,
        1,
        1
      );

      expect(result.status).toBe('LEFT');
    });

    it('should reject remove from non-creator', async () => {
      const mockRoom = createMockRoom();

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);

      await expect(
        focusRoomParticipantService.removeParticipant(1, 1, 2)
      ).rejects.toThrow('Only room creator can remove participants');
    });

    it('should reject remove of creator', async () => {
      const mockRoom = createMockRoom();
      const mockParticipant = createMockParticipant({ role: 'CREATOR' });

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.focusRoomParticipant.findUnique.mockResolvedValue(
        mockParticipant
      );

      await expect(
        focusRoomParticipantService.removeParticipant(1, 1, 1)
      ).rejects.toThrow('Cannot remove room creator');
    });
  });
});

describe('FocusRoomInvitationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createInvitation', () => {
    it('should create invitation for private room', async () => {
      const mockRoom = createMockRoom({ visibility: 'PRIVATE' });
      const mockInviter = createMockUser();
      const mockInvitation = createMockInvitation();

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.focusRoomInvitation.findFirst.mockResolvedValue(null);
      prisma.focusRoomInvitation.findUnique.mockResolvedValue(null);
      prisma.focusRoomInvitation.create.mockResolvedValue({
        ...mockInvitation,
        room: mockRoom,
        inviter: mockInviter,
      });

      const result = await focusRoomInvitationService.createInvitation(1, 1, {
        email: 'invitee@example.com',
        expireHours: 24,
      });

      expect(result).toBeDefined();
      expect(prisma.focusRoomInvitation.create).toHaveBeenCalled();
    });

    it('should reject invitation for public room', async () => {
      const mockRoom = createMockRoom({ visibility: 'PUBLIC' });

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);

      await expect(
        focusRoomInvitationService.createInvitation(1, 1, {
          email: 'invitee@example.com',
        })
      ).rejects.toThrow('Invitations can only be sent for private rooms');
    });

    it('should reject invitation from non-creator', async () => {
      const mockRoom = createMockRoom({ visibility: 'PRIVATE' });

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);

      await expect(
        focusRoomInvitationService.createInvitation(1, 2, {
          email: 'invitee@example.com',
        })
      ).rejects.toThrow('Only room creator can send invitations');
    });

    it('should reject invitation if user already has access', async () => {
      const mockRoom = createMockRoom({ visibility: 'PRIVATE' });
      const mockUser = createMockUser({ id: 2, email: 'invitee@example.com' });
      const mockInvitation = createMockInvitation({ status: 'ACCEPTED' });

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.focusRoomInvitation.findFirst.mockResolvedValue(
        mockInvitation
      );

      await expect(
        focusRoomInvitationService.createInvitation(1, 1, {
          email: 'invitee@example.com',
        })
      ).rejects.toThrow('User already has access to this room');
    });

    it('should reject invitation if pending invitation exists', async () => {
      const mockRoom = createMockRoom({ visibility: 'PRIVATE' });
      const mockInvitation = createMockInvitation({ status: 'PENDING' });

      prisma.focusRoom.findUnique.mockResolvedValue(mockRoom);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.focusRoomInvitation.findFirst.mockResolvedValue(
        mockInvitation
      );

      await expect(
        focusRoomInvitationService.createInvitation(1, 1, {
          email: 'invitee@example.com',
        })
      ).rejects.toThrow('An invitation has already been sent to this email');
    });
  });

  describe('acceptInvitation', () => {
    it('should accept invitation successfully', async () => {
      const mockInvitation = createMockInvitation();
      const mockRoom = createMockRoom();
      const mockUser = createMockUser({ email: 'invitee@example.com' });

      prisma.focusRoomInvitation.findUnique.mockResolvedValue(
        mockInvitation
      );
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.focusRoomParticipant.count.mockResolvedValue(5);
      prisma.focusRoomInvitation.update.mockResolvedValue({
        ...mockInvitation,
        status: 'ACCEPTED',
      });
      prisma.focusRoomParticipant.findUnique.mockResolvedValue(null);
      prisma.focusRoomParticipant.create.mockResolvedValue(
        createMockParticipant()
      );

      const result = await focusRoomInvitationService.acceptInvitation(
        'TEST_TOKEN_1234567890123456789012345678',
        2
      );

      expect(result).toBeDefined();
      expect(prisma.focusRoomInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ACCEPTED',
          }),
        })
      );
    });

    it('should reject expired invitation', async () => {
      const expiredDate = new Date();
      expiredDate.setHours(expiredDate.getHours() - 1);
      const mockInvitation = createMockInvitation({
        expiresAt: expiredDate,
      });

      prisma.focusRoomInvitation.findUnique.mockResolvedValue(
        mockInvitation
      );
      prisma.focusRoomInvitation.update.mockResolvedValue({
        ...mockInvitation,
        status: 'EXPIRED',
      });

      await expect(
        focusRoomInvitationService.acceptInvitation('TOKEN', 2)
      ).rejects.toThrow('Invitation is expired');
    });

    it('should reject already accepted invitation', async () => {
      const mockInvitation = createMockInvitation({ status: 'ACCEPTED' });

      prisma.focusRoomInvitation.findUnique.mockResolvedValue(
        mockInvitation
      );

      await expect(
        focusRoomInvitationService.acceptInvitation('TOKEN', 2)
      ).rejects.toThrow('Invitation is accepted');
    });

    it('should reject when room is full', async () => {
      const mockInvitation = createMockInvitation();
      const mockUser = createMockUser({ email: 'invitee@example.com' });

      prisma.focusRoomInvitation.findUnique.mockResolvedValue(
        mockInvitation
      );
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.focusRoomParticipant.count.mockResolvedValue(10);

      await expect(
        focusRoomInvitationService.acceptInvitation('TOKEN', 2)
      ).rejects.toThrow('Room is full');
    });
  });

  describe('declineInvitation', () => {
    it('should decline invitation successfully', async () => {
      const mockInvitation = createMockInvitation();
      const mockUser = createMockUser({ email: 'invitee@example.com' });

      prisma.focusRoomInvitation.findUnique.mockResolvedValue(
        mockInvitation
      );
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.focusRoomInvitation.update.mockResolvedValue({
        ...mockInvitation,
        status: 'DECLINED',
      });

      const result = await focusRoomInvitationService.declineInvitation(
        'TOKEN',
        2
      );

      expect(result.status).toBe('DECLINED');
    });

    it('should reject decline of already accepted invitation', async () => {
      const mockInvitation = createMockInvitation({ status: 'ACCEPTED' });

      prisma.focusRoomInvitation.findUnique.mockResolvedValue(
        mockInvitation
      );

      await expect(
        focusRoomInvitationService.declineInvitation('TOKEN', 2)
      ).rejects.toThrow('Invitation is accepted');
    });
  });

  describe('getInvitationByToken', () => {
    it('should return invitation by token', async () => {
      const mockInvitation = createMockInvitation();
      const mockRoom = createMockRoom();
      const mockUser = createMockUser();

      prisma.focusRoomInvitation.findUnique.mockResolvedValue({
        ...mockInvitation,
        room: { ...mockRoom, creator: mockUser },
        inviter: mockUser,
      });

      const result =
        await focusRoomInvitationService.getInvitationByToken('TOKEN');

      expect(result).toBeDefined();
      expect(result?.token).toBe('TEST_TOKEN_1234567890123456789012345678');
    });

    it('should auto-expire expired invitation', async () => {
      const expiredDate = new Date();
      expiredDate.setHours(expiredDate.getHours() - 1);
      const mockInvitation = createMockInvitation({
        expiresAt: expiredDate,
        status: 'PENDING',
      });
      const mockRoom = createMockRoom();
      const mockUser = createMockUser();

      prisma.focusRoomInvitation.findUnique.mockResolvedValue({
        ...mockInvitation,
        room: { ...mockRoom, creator: mockUser },
        inviter: mockUser,
      });
      prisma.focusRoomInvitation.update.mockResolvedValue({
        ...mockInvitation,
        status: 'EXPIRED',
      });

      const result =
        await focusRoomInvitationService.getInvitationByToken('TOKEN');

      expect(result?.status).toBe('EXPIRED');
      expect(prisma.focusRoomInvitation.update).toHaveBeenCalled();
    });
  });
});

