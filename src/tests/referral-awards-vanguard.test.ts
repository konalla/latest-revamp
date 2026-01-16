/**
 * Comprehensive Unit Tests for Vanguard Badge System
 * Tests the complete flow including:
 * - Vanguard badge assignment
 * - Origin badge assignment
 * - Badge ID generation and validation
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma BEFORE importing services - use factory function
vi.mock('../config/prisma.js', () => {
  const mockPrisma = {
    referral: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    userReferralStatus: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    referralProgram: {
      findMany: vi.fn(),
    },
    referralClick: {
      create: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return {
    default: mockPrisma,
    __mockPrisma: mockPrisma,
  };
});

// Don't mock status assignment service - we want to test it directly
// Only mock the methods that are called from referral service

// Now import services after mocks are set up
import { referralService } from '../services/referral.service.js';
import { statusAssignmentService } from '../services/status-assignment.service.js';
import { badgeIdService } from '../services/badge-id.service.js';
import prisma from '../config/prisma.js';

// Helper to create mock referral
const createMockReferral = (overrides = {}) => ({
  id: 1,
  referrerId: 1,
  referredId: 2,
  referralCode: 'TEST123456',
  status: 'REGISTERED',
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Helper to create mock user referral status
const createMockUserReferralStatus = (overrides = {}) => ({
  id: 1,
  userId: 1,
  earlyAccessStatus: 'NONE',
  referralCode: 'TEST123456',
  rewardsUnlocked: false,
  originId: null,
  vanguardId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Helper to create mock subscription
const createMockSubscription = (overrides = {}) => ({
  id: 1,
  userId: 1,
  status: 'ACTIVE',
  currentPeriodStart: new Date(),
  currentPeriodEnd: new Date(),
  trialEnd: null,
  subscriptionPlan: {
    id: 1,
    name: 'pro',
    billingInterval: 'monthly',
  },
  payments: [],
  ...overrides,
});

// Helper to create mock payment
const createMockPayment = (overrides = {}) => ({
  id: 1,
  subscriptionId: 1,
  status: 'succeeded',
  amount: 1000,
  createdAt: new Date(),
  ...overrides,
});

describe('StatusAssignmentService - Vanguard Badge System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset count mock for each test
    prisma.userReferralStatus.count.mockReset();
    // Restore all spies
    vi.restoreAllMocks();
  });

  describe('assignVanguardStatus', () => {
    it('should assign Vanguard badge when user meets all requirements', async () => {
      const mockUserStatus = createMockUserReferralStatus({ earlyAccessStatus: 'NONE' });
      const mockSubscription = createMockSubscription({
        trialEnd: new Date('2024-01-01'),
        payments: [
          createMockPayment({ createdAt: new Date('2024-01-15') }), // After trial
        ],
      });

      prisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          referral: {
            count: vi.fn().mockResolvedValue(3), // 3+ referrals
          },
          subscription: {
            findUnique: vi.fn().mockResolvedValue(mockSubscription),
          },
          userReferralStatus: {
            count: vi.fn().mockResolvedValue(0), // Seats available
            findUnique: vi.fn().mockResolvedValue(mockUserStatus),
            update: vi.fn().mockResolvedValue({
              ...mockUserStatus,
              vanguardId: 'VNG-001',
              earlyAccessStatus: 'NONE',
            }),
          },
        });
      });

      const result = await statusAssignmentService.assignVanguardStatus(1);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Vanguard 300 ID assigned');
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should reject if user has less than 3 referrals', async () => {
      prisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          referral: {
            count: vi.fn().mockResolvedValue(2), // Only 2 referrals
          },
        });
      });

      const result = await statusAssignmentService.assignVanguardStatus(1);

      expect(result.success).toBe(false);
      expect(result.message).toContain('3+ completed referrals');
    });

    it('should reject if user has not paid after trial', async () => {
      const mockSubscription = createMockSubscription({
        trialEnd: new Date('2024-01-01'),
        payments: [
          createMockPayment({ createdAt: new Date('2023-12-15') }), // Before trial
        ],
      });

      prisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          referral: {
            count: vi.fn().mockResolvedValue(3),
          },
          subscription: {
            findUnique: vi.fn().mockResolvedValue(mockSubscription),
          },
        });
      });

      const result = await statusAssignmentService.assignVanguardStatus(1);

      expect(result.success).toBe(false);
      expect(result.message).toContain('paid at least once after their trial period');
    });

    it('should accept payment if no trial period exists', async () => {
      const mockUserStatus = createMockUserReferralStatus();
      const mockSubscription = createMockSubscription({
        trialEnd: null, // No trial
        payments: [createMockPayment()],
      });

      prisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          referral: {
            count: vi.fn().mockResolvedValue(3),
          },
          subscription: {
            findUnique: vi.fn().mockResolvedValue(mockSubscription),
          },
          userReferralStatus: {
            count: vi.fn().mockResolvedValue(0),
            findUnique: vi.fn().mockResolvedValue(mockUserStatus),
            update: vi.fn().mockResolvedValue({
              ...mockUserStatus,
              vanguardId: 'VNG-001',
            }),
          },
        });
      });

      const result = await statusAssignmentService.assignVanguardStatus(1);

      expect(result.success).toBe(true);
    });

    it('should reject if Vanguard seats are full', async () => {
      const mockSubscription = createMockSubscription({
        trialEnd: null,
        payments: [createMockPayment()],
      });

      prisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          referral: {
            count: vi.fn().mockResolvedValue(3),
          },
          subscription: {
            findUnique: vi.fn().mockResolvedValue(mockSubscription),
          },
          userReferralStatus: {
            count: vi.fn().mockResolvedValue(300), // Seats full
          },
        });
      });

      const result = await statusAssignmentService.assignVanguardStatus(1);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Vanguard 300 seats are full');
    });

    it('should assign Vanguard ID while keeping Origin status', async () => {
      const mockUserStatus = createMockUserReferralStatus({
        earlyAccessStatus: 'ORIGIN',
        originId: 'ORG-001',
      });
      const mockSubscription = createMockSubscription({
        trialEnd: null,
        payments: [createMockPayment()],
      });

      prisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          referral: {
            count: vi.fn().mockResolvedValue(3),
          },
          subscription: {
            findUnique: vi.fn().mockResolvedValue(mockSubscription),
          },
          userReferralStatus: {
            count: vi.fn().mockResolvedValue(0),
            findUnique: vi.fn().mockResolvedValue(mockUserStatus),
            update: vi.fn().mockResolvedValue({
              ...mockUserStatus,
              vanguardId: 'VNG-001',
              earlyAccessStatus: 'ORIGIN', // Keeps original status
            }),
          },
        });
      });

      const result = await statusAssignmentService.assignVanguardStatus(1);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Status remains: ORIGIN');
    });

    it('should reject if user already has Vanguard status', async () => {
      const mockUserStatus = createMockUserReferralStatus({
        earlyAccessStatus: 'VANGUARD',
        vanguardId: 'VNG-001',
      });
      const mockSubscription = createMockSubscription({
        trialEnd: null,
        payments: [createMockPayment()], // Has payment to pass payment check
      });

      prisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          referral: {
            count: vi.fn().mockResolvedValue(3),
          },
          subscription: {
            findUnique: vi.fn().mockResolvedValue(mockSubscription),
          },
          userReferralStatus: {
            count: vi.fn().mockResolvedValue(0),
            findUnique: vi.fn().mockResolvedValue(mockUserStatus),
          },
        });
      });

      const result = await statusAssignmentService.assignVanguardStatus(1);

      expect(result.success).toBe(false);
      expect(result.message).toContain('already has Vanguard status');
    });

    it('should assign Origin ID if user does not have one', async () => {
      const mockUserStatus = createMockUserReferralStatus({
        earlyAccessStatus: 'NONE',
        originId: null,
      });
      const mockSubscription = createMockSubscription({
        trialEnd: null,
        payments: [createMockPayment()],
      });

      prisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          referral: {
            count: vi.fn().mockResolvedValue(3),
          },
          subscription: {
            findUnique: vi.fn().mockResolvedValue(mockSubscription),
          },
          userReferralStatus: {
            count: vi.fn()
              .mockResolvedValueOnce(0) // Vanguard count
              .mockResolvedValueOnce(0), // Origin count
            findUnique: vi.fn().mockResolvedValue(mockUserStatus),
            update: vi.fn().mockResolvedValue({
              ...mockUserStatus,
              originId: 'ORG-001',
              vanguardId: 'VNG-001',
              earlyAccessStatus: 'ORIGIN',
            }),
          },
        });
      });

      const result = await statusAssignmentService.assignVanguardStatus(1);

      expect(result.success).toBe(true);
    });
  });

  describe('assignOriginStatus', () => {
    it('should assign Origin badge when seats are available', async () => {
      prisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          userReferralStatus: {
            count: vi.fn().mockResolvedValue(500), // Seats available
            findUnique: vi.fn().mockResolvedValue(null), // No existing status
            upsert: vi.fn().mockResolvedValue({
              id: 1,
              userId: 1,
              earlyAccessStatus: 'ORIGIN',
              originId: 'ORG-501',
            }),
          },
        });
      });

      const result = await statusAssignmentService.assignOriginStatus(1);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Origin 1000 status assigned');
      expect(result.message).toContain('Rank: 501');
    });

    it('should reject if Origin seats are full', async () => {
      prisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          userReferralStatus: {
            count: vi.fn().mockResolvedValue(1000), // Seats full
          },
        });
      });

      const result = await statusAssignmentService.assignOriginStatus(1);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Origin 1000 seats are full');
    });

    it('should reject if user already has Origin status', async () => {
      const mockUserStatus = createMockUserReferralStatus({
        earlyAccessStatus: 'ORIGIN',
        originId: 'ORG-001',
      });

      prisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          userReferralStatus: {
            count: vi.fn().mockResolvedValue(500),
            findUnique: vi.fn().mockResolvedValue(mockUserStatus),
          },
        });
      });

      const result = await statusAssignmentService.assignOriginStatus(1);

      expect(result.success).toBe(false);
      expect(result.message).toContain('already has Origin or Vanguard status');
    });

    it('should generate referral code if user does not have one', async () => {
      prisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          userReferralStatus: {
            count: vi.fn().mockResolvedValue(500),
            findUnique: vi.fn()
              .mockResolvedValueOnce(null) // First check - no status
              .mockResolvedValueOnce(null), // Code uniqueness check
            upsert: vi.fn().mockResolvedValue({
              id: 1,
              userId: 1,
              earlyAccessStatus: 'ORIGIN',
              originId: 'ORG-501',
              referralCode: '0001ABC123',
            }),
          },
        });
      });

      const result = await statusAssignmentService.assignOriginStatus(1);

      expect(result.success).toBe(true);
    });
  });

  describe('checkAndUpdateUserStatus', () => {
    it('should upgrade to Vanguard when eligible', async () => {
      const mockUserStatus = createMockUserReferralStatus({ earlyAccessStatus: 'NONE' });
      const mockSubscription = createMockSubscription({
        trialEnd: null,
        payments: [createMockPayment()],
      });

      prisma.userReferralStatus.findUnique.mockResolvedValue(mockUserStatus);
      prisma.referral.count.mockResolvedValue(3);
      prisma.userReferralStatus.count
        .mockResolvedValueOnce(0) // Vanguard seats
        .mockResolvedValueOnce(0); // Origin seats

      // Mock hasPaidAfterTrial to return true
      vi.spyOn(statusAssignmentService, 'hasPaidAfterTrial').mockResolvedValue(true);
      
      // Mock assignVanguardStatus to succeed
      vi.spyOn(statusAssignmentService, 'assignVanguardStatus').mockResolvedValue({
        success: true,
        message: 'Vanguard assigned',
      });

      const result = await statusAssignmentService.checkAndUpdateUserStatus(1);

      expect(result.updated).toBe(true);
    });

    it('should assign Origin when Vanguard not eligible but seats available', async () => {
      const mockUserStatus = createMockUserReferralStatus({ earlyAccessStatus: 'NONE' });

      prisma.userReferralStatus.findUnique.mockResolvedValue(mockUserStatus);
      prisma.referral.count.mockResolvedValue(1); // Less than 3
      prisma.userReferralStatus.count
        .mockResolvedValueOnce(0) // Vanguard seats
        .mockResolvedValueOnce(500); // Origin seats available

      // Mock assignOriginStatus to succeed
      const assignOriginSpy = vi.spyOn(statusAssignmentService, 'assignOriginStatus').mockResolvedValue({
        success: true,
        message: 'Origin assigned',
      });

      const result = await statusAssignmentService.checkAndUpdateUserStatus(1);

      expect(assignOriginSpy).toHaveBeenCalledWith(1);
      expect(result.updated).toBe(true);
      expect(result.newStatus).toBe('ORIGIN');
    });

    it('should not update if user already has Vanguard', async () => {
      const mockUserStatus = createMockUserReferralStatus({
        earlyAccessStatus: 'VANGUARD',
        vanguardId: 'VNG-001',
      });

      prisma.userReferralStatus.findUnique.mockResolvedValue(mockUserStatus);
      prisma.referral.count.mockResolvedValue(3);
      prisma.userReferralStatus.count.mockResolvedValue(0);

      const result = await statusAssignmentService.checkAndUpdateUserStatus(1);

      expect(result.updated).toBe(false);
    });
  });

  describe('hasPaidAfterTrial', () => {
    it('should return true if payment after trial', async () => {
      const mockSubscription = createMockSubscription({
        trialEnd: new Date('2024-01-01'),
        payments: [createMockPayment({ createdAt: new Date('2024-01-15') })],
      });

      prisma.subscription.findUnique.mockResolvedValue(mockSubscription);

      const result = await statusAssignmentService.hasPaidAfterTrial(1);

      expect(result).toBe(true);
    });

    it('should return false if payment before trial', async () => {
      const mockSubscription = createMockSubscription({
        trialEnd: new Date('2024-01-15'),
        payments: [createMockPayment({ createdAt: new Date('2024-01-01') })],
      });

      prisma.subscription.findUnique.mockResolvedValue(mockSubscription);

      const result = await statusAssignmentService.hasPaidAfterTrial(1);

      expect(result).toBe(false);
    });

    it('should return true if no trial and has payment', async () => {
      const mockSubscription = createMockSubscription({
        trialEnd: null,
        payments: [createMockPayment()],
      });

      prisma.subscription.findUnique.mockResolvedValue(mockSubscription);

      const result = await statusAssignmentService.hasPaidAfterTrial(1);

      expect(result).toBe(true);
    });

    it('should return false if no subscription', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);

      const result = await statusAssignmentService.hasPaidAfterTrial(1);

      expect(result).toBe(false);
      expect(prisma.subscription.findUnique).toHaveBeenCalled();
    });
  });

  describe('calculateSeatsRemaining', () => {
    it('should calculate remaining seats correctly', async () => {
      // Use sequential mocks - Promise.all may call them in any order
      // but we can verify the final calculation is correct
      const calls: any[] = [];
      prisma.userReferralStatus.count.mockImplementation((args: any) => {
        calls.push(args);
        const where = args?.where;
        // Check for Vanguard query
        if (where?.earlyAccessStatus === 'VANGUARD') {
          return Promise.resolve(50);
        }
        // Check for Origin query (includes ORIGIN and VANGUARD)
        if (where?.earlyAccessStatus?.in) {
          const inArray = Array.isArray(where.earlyAccessStatus.in) 
            ? where.earlyAccessStatus.in 
            : [where.earlyAccessStatus.in];
          if (inArray.includes('ORIGIN') || inArray.includes('VANGUARD')) {
            return Promise.resolve(200);
          }
        }
        return Promise.resolve(0);
      });

      const result = await statusAssignmentService.calculateSeatsRemaining();

      // Verify both queries were made
      expect(calls.length).toBe(2);
      expect(result.vanguardRemaining).toBe(250); // 300 - 50
      expect(result.originRemaining).toBe(800); // 1000 - 200
      expect(result.vanguardTotal).toBe(300);
      expect(result.originTotal).toBe(1000);
    });

    it('should return 0 for remaining if seats are full', async () => {
      prisma.userReferralStatus.count.mockImplementation((args: any) => {
        const where = args?.where;
        if (where?.earlyAccessStatus === 'VANGUARD') {
          return Promise.resolve(300);
        }
        if (where?.earlyAccessStatus?.in) {
          const inArray = Array.isArray(where.earlyAccessStatus.in) 
            ? where.earlyAccessStatus.in 
            : [where.earlyAccessStatus.in];
          if (inArray.includes('ORIGIN') || inArray.includes('VANGUARD')) {
            return Promise.resolve(1000);
          }
        }
        return Promise.resolve(0);
      });

      const result = await statusAssignmentService.calculateSeatsRemaining();

      expect(result.vanguardRemaining).toBe(0); // 300 - 300
      expect(result.originRemaining).toBe(0); // 1000 - 1000
    });
  });
});

describe('BadgeIdService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateOriginId', () => {
    it('should generate Origin ID with correct format', () => {
      const result = badgeIdService.generateOriginId(1);

      expect(result).toBe('ORG-001');
    });

    it('should pad single digit ranks', () => {
      const result = badgeIdService.generateOriginId(5);

      expect(result).toBe('ORG-005');
    });

    it('should handle three digit ranks', () => {
      const result = badgeIdService.generateOriginId(123);

      expect(result).toBe('ORG-123');
    });
  });

  describe('generateVanguardId', () => {
    it('should generate Vanguard ID with correct format', () => {
      const result = badgeIdService.generateVanguardId(1);

      expect(result).toBe('VNG-001');
    });

    it('should pad single digit ranks', () => {
      const result = badgeIdService.generateVanguardId(42);

      expect(result).toBe('VNG-042');
    });
  });

  describe('validateBadgeIdFormat', () => {
    it('should validate Origin ID format', () => {
      const result = badgeIdService.validateBadgeIdFormat('ORG-001');

      expect(result.valid).toBe(true);
      expect(result.type).toBe('origin');
    });

    it('should validate Vanguard ID format', () => {
      const result = badgeIdService.validateBadgeIdFormat('VNG-123');

      expect(result.valid).toBe(true);
      expect(result.type).toBe('vanguard');
    });

    it('should be case insensitive', () => {
      const result = badgeIdService.validateBadgeIdFormat('org-001');

      expect(result.valid).toBe(true);
      expect(result.type).toBe('origin');
    });

    it('should reject invalid format', () => {
      const result = badgeIdService.validateBadgeIdFormat('INVALID-001');

      expect(result.valid).toBe(false);
    });

    it('should reject missing digits', () => {
      const result = badgeIdService.validateBadgeIdFormat('ORG-1');

      expect(result.valid).toBe(false);
    });

    it('should reject null or empty string', () => {
      expect(badgeIdService.validateBadgeIdFormat(null as any).valid).toBe(false);
      expect(badgeIdService.validateBadgeIdFormat('').valid).toBe(false);
    });
  });

  describe('getBadgeRank', () => {
    it('should extract rank from Origin ID', async () => {
      const mockUserStatus = createMockUserReferralStatus({ originId: 'ORG-042' });

      prisma.userReferralStatus.findUnique.mockResolvedValue(mockUserStatus);

      const result = await badgeIdService.getBadgeRank(1, 'origin');

      expect(result).toBe(42);
    });

    it('should extract rank from Vanguard ID', async () => {
      const mockUserStatus = createMockUserReferralStatus({ vanguardId: 'VNG-123' });

      prisma.userReferralStatus.findUnique.mockResolvedValue(mockUserStatus);

      const result = await badgeIdService.getBadgeRank(1, 'vanguard');

      expect(result).toBe(123);
    });

    it('should return null if user status not found', async () => {
      prisma.userReferralStatus.findUnique.mockResolvedValue(null);

      const result = await badgeIdService.getBadgeRank(1, 'origin');

      expect(result).toBeNull();
    });

    it('should return null if badge ID not set', async () => {
      const mockUserStatus = createMockUserReferralStatus({ originId: null });

      prisma.userReferralStatus.findUnique.mockResolvedValue(mockUserStatus);

      const result = await badgeIdService.getBadgeRank(1, 'origin');

      expect(result).toBeNull();
    });
  });

  describe('restoreBadge', () => {
    it('should restore Origin badge successfully', async () => {
      const mockUserStatus = createMockUserReferralStatus({
        userId: 1,
        originId: 'ORG-001',
      });

      prisma.userReferralStatus.findFirst.mockResolvedValue(mockUserStatus);
      prisma.userReferralStatus.findUnique.mockResolvedValue(mockUserStatus);
      prisma.userReferralStatus.update.mockResolvedValue({
        ...mockUserStatus,
        earlyAccessStatus: 'ORIGIN',
      });

      const result = await badgeIdService.restoreBadge(1, 'ORG-001');

      expect(result.success).toBe(true);
      expect(result.badgeType).toBe('origin');
      expect(prisma.userReferralStatus.update).toHaveBeenCalled();
    });

    it('should restore Vanguard badge successfully', async () => {
      const mockUserStatus = createMockUserReferralStatus({
        userId: 1,
        vanguardId: 'VNG-001',
        originId: 'ORG-001',
      });

      prisma.userReferralStatus.findFirst.mockResolvedValue(mockUserStatus);
      prisma.userReferralStatus.findUnique.mockResolvedValue(mockUserStatus);
      prisma.userReferralStatus.update.mockResolvedValue({
        ...mockUserStatus,
        earlyAccessStatus: 'VANGUARD',
      });

      const result = await badgeIdService.restoreBadge(1, 'VNG-001');

      expect(result.success).toBe(true);
      expect(result.badgeType).toBe('vanguard');
    });

    it('should reject invalid badge ID format', async () => {
      const result = await badgeIdService.restoreBadge(1, 'INVALID-001');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid badge ID format');
    });

    it('should reject if badge ID not found', async () => {
      prisma.userReferralStatus.findFirst.mockResolvedValue(null);

      const result = await badgeIdService.restoreBadge(1, 'ORG-999');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Badge ID not found');
    });

    it('should reject if badge ID assigned to different user', async () => {
      const mockUserStatus = createMockUserReferralStatus({
        userId: 2, // Different user
        originId: 'ORG-001',
      });

      prisma.userReferralStatus.findFirst.mockResolvedValue(mockUserStatus);

      const result = await badgeIdService.restoreBadge(1, 'ORG-001');

      expect(result.success).toBe(false);
      expect(result.message).toContain('already assigned to another user');
    });
  });
});

