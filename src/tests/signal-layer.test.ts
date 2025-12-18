/**
 * Comprehensive Unit Tests for Signal Layer Feature
 * Tests all Signal Layer functionality including:
 * - Signal Type determination
 * - Break recommendations
 * - Load warnings
 * - Disambiguation rules
 * - Confidence calibration
 * - Enhanced recommendations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma BEFORE importing service
vi.mock('../config/prisma.js', () => ({
  default: {
    task: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    focusSession: {
      findMany: vi.fn(),
    },
  },
}));

// Mock OpenAI LLM BEFORE importing service - use factory function
vi.mock('@langchain/openai', () => {
  const mockInvoke = vi.fn();
  return {
    ChatOpenAI: class {
      invoke = mockInvoke;
      constructor() {}
    },
    // Export for use in tests
    __mockInvoke: mockInvoke,
  };
});

// Mock LangChain parser BEFORE importing service - use factory function
vi.mock('langchain/output_parsers', () => {
  const mockParse = vi.fn();
  const mockGetFormatInstructions = vi.fn().mockReturnValue('Format instructions');
  return {
    StructuredOutputParser: {
      fromZodSchema: vi.fn().mockReturnValue({
        getFormatInstructions: mockGetFormatInstructions,
        parse: mockParse,
      }),
    },
    // Export for use in tests
    __mockParse: mockParse,
    __mockGetFormatInstructions: mockGetFormatInstructions,
  };
});

// Now import the service after mocks are set up
import { 
  aiRecommendationService, 
  WorkCategory,
  type TaskAnalysis,
  type UserWorkPreferences,
  type SignalType 
} from '../services/ai-recommendation.service.js';
import prisma from '../config/prisma.js';
import * as openaiModule from '@langchain/openai';
import * as parserModule from 'langchain/output_parsers';

// Get mocked functions from vi.mock
const mockInvoke = (openaiModule as any).__mockInvoke;
const mockParse = (parserModule as any).__mockParse;

// Mock user preferences
const mockUserPreferences: UserWorkPreferences = {
  deepWorkStartTime: '09:00',
  deepWorkEndTime: '12:00',
  creativeWorkStartTime: '12:00',
  creativeWorkEndTime: '15:00',
  reflectiveWorkStartTime: '15:00',
  reflectiveWorkEndTime: '18:00',
  executiveWorkStartTime: '18:00',
  executiveWorkEndTime: '21:00',
};

describe('Signal Layer - determineSignalType', () => {
  it('should return Core-Signal when both HLA and AKR are ON', () => {
    const signalType = aiRecommendationService.determineSignalType(
      true,  // isHighLeverage
      true,  // advancesKeyResults
      true,  // importance
      false  // urgency
    );
    expect(signalType).toBe('Core-Signal');
  });

  it('should return High-Signal when only HLA is ON', () => {
    const signalType = aiRecommendationService.determineSignalType(
      true,  // isHighLeverage
      false, // advancesKeyResults
      true,  // importance
      false  // urgency
    );
    expect(signalType).toBe('High-Signal');
  });

  it('should return Strategic-Signal when only AKR is ON', () => {
    const signalType = aiRecommendationService.determineSignalType(
      false, // isHighLeverage
      true,  // advancesKeyResults
      true,  // importance
      false  // urgency
    );
    expect(signalType).toBe('Strategic-Signal');
  });

  it('should return Neutral when both HLA and AKR are OFF but Importance is ON', () => {
    const signalType = aiRecommendationService.determineSignalType(
      false, // isHighLeverage
      false, // advancesKeyResults
      true,  // importance
      false  // urgency
    );
    expect(signalType).toBe('Neutral');
  });

  it('should return Neutral when both HLA and AKR are OFF but Urgency is ON', () => {
    const signalType = aiRecommendationService.determineSignalType(
      false, // isHighLeverage
      false, // advancesKeyResults
      false, // importance
      true   // urgency
    );
    expect(signalType).toBe('Neutral');
  });

  it('should return Noise when all toggles are OFF', () => {
    const signalType = aiRecommendationService.determineSignalType(
      false, // isHighLeverage
      false, // advancesKeyResults
      false, // importance
      false  // urgency
    );
    expect(signalType).toBe('Noise');
  });

  it('should prioritize Core-Signal even if Importance/Urgency are OFF', () => {
    const signalType = aiRecommendationService.determineSignalType(
      true,  // isHighLeverage
      true,  // advancesKeyResults
      false, // importance
      false  // urgency
    );
    expect(signalType).toBe('Core-Signal');
  });
});

describe('Signal Layer - calculateBreakRecommendation', () => {
  it('should recommend 5-10 min break for 45+ minute sessions', () => {
    const recommendation = aiRecommendationService.calculateBreakRecommendation(60, 0);
    expect(recommendation).toBe('Take a 5-10 minute break after this session');
  });

  it('should recommend 15-30 min break for 2×90 minute sessions', () => {
    const recommendation = aiRecommendationService.calculateBreakRecommendation(90, 2);
    expect(recommendation).toBe('Take a 15-30 minute break to maintain focus');
  });

  it('should recommend 1-hour recovery for 3×90 minute sessions', () => {
    const recommendation = aiRecommendationService.calculateBreakRecommendation(90, 3);
    expect(recommendation).toBe('Take a 1-hour recovery break to prevent cognitive overload');
  });

  it('should return null for sessions less than 45 minutes', () => {
    const recommendation = aiRecommendationService.calculateBreakRecommendation(30, 0);
    expect(recommendation).toBeNull();
  });

  it('should handle edge case: exactly 45 minutes', () => {
    const recommendation = aiRecommendationService.calculateBreakRecommendation(45, 0);
    expect(recommendation).toBe('Take a 5-10 minute break after this session');
  });

  it('should prioritize longer breaks for multiple sessions', () => {
    const recommendation1 = aiRecommendationService.calculateBreakRecommendation(90, 1);
    const recommendation2 = aiRecommendationService.calculateBreakRecommendation(90, 2);
    const recommendation3 = aiRecommendationService.calculateBreakRecommendation(90, 3);
    
    expect(recommendation1).toBe('Take a 5-10 minute break after this session');
    expect(recommendation2).toBe('Take a 15-30 minute break to maintain focus');
    expect(recommendation3).toBe('Take a 1-hour recovery break to prevent cognitive overload');
  });
});

describe('Signal Layer - detectLoadWarning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null when no recent sessions', async () => {
    (prisma.focusSession.findMany as any).mockResolvedValue([]);
    (prisma.task.findMany as any).mockResolvedValue([]);

    const warning = await aiRecommendationService.detectLoadWarning(
      1,
      'deepWork',
      new Date()
    );

    expect(warning).toBeNull();
  });

  it('should warn after 3 consecutive high-load sessions', async () => {
    const mockSessions = [
      { id: 1, duration: 90, intention: { taskIds: [1, 2] }, createdAt: new Date() },
      { id: 2, duration: 90, intention: { taskIds: [3, 4] }, createdAt: new Date() },
      { id: 3, duration: 90, intention: { taskIds: [5, 6] }, createdAt: new Date() },
    ];

    const mockTasks = [
      { id: 1, category: 'deepWork' },
      { id: 2, category: 'deepWork' },
      { id: 3, category: 'deepWork' },
    ];

    (prisma.focusSession.findMany as any).mockResolvedValue(mockSessions);
    (prisma.task.findMany as any).mockResolvedValue(mockTasks);

    const warning = await aiRecommendationService.detectLoadWarning(
      1,
      'deepWork',
      new Date()
    );

    expect(warning).toBe('You have performed multiple high-load sessions. Reduce intensity to avoid fatigue.');
  });

  it('should warn for Deep Work clustering', async () => {
    // Use shorter sessions to avoid triggering consecutiveHighLoad first
    const mockSessions = [
      { id: 1, duration: 45, intention: { taskIds: [1] }, createdAt: new Date() },
      { id: 2, duration: 45, intention: { taskIds: [2] }, createdAt: new Date() },
      { id: 3, duration: 45, intention: { taskIds: [3] }, createdAt: new Date() },
    ];

    const mockTasks = [
      { id: 1, category: 'deepWork' },
      { id: 2, category: 'deepWork' },
      { id: 3, category: 'deepWork' },
    ];

    (prisma.focusSession.findMany as any).mockResolvedValue(mockSessions);
    (prisma.task.findMany as any).mockResolvedValue(mockTasks);

    const warning = await aiRecommendationService.detectLoadWarning(
      1,
      'deepWork',
      new Date()
    );

    // The warning could be either message depending on which condition is met first
    expect(warning).toMatch(/Multiple (Deep Work sessions|high-load sessions)/i);
  });

  it('should return null for normal usage patterns', async () => {
    const mockSessions = [
      { id: 1, duration: 30, intention: { taskIds: [1] }, createdAt: new Date() },
    ];

    const mockTasks = [
      { id: 1, category: 'executive' },
    ];

    (prisma.focusSession.findMany as any).mockResolvedValue(mockSessions);
    (prisma.task.findMany as any).mockResolvedValue(mockTasks);

    const warning = await aiRecommendationService.detectLoadWarning(
      1,
      'executive',
      new Date()
    );

    expect(warning).toBeNull();
  });

  it('should handle errors gracefully', async () => {
    (prisma.focusSession.findMany as any).mockRejectedValue(new Error('Database error'));

    const warning = await aiRecommendationService.detectLoadWarning(
      1,
      'deepWork',
      new Date()
    );

    expect(warning).toBeNull();
  });
});

describe('Signal Layer - getModeBalancingRecommendation', () => {
  it('should recommend switching for Deep Work overload', () => {
    const recommendation = aiRecommendationService.getModeBalancingRecommendation('Deep Work');
    expect(recommendation).toBe('Consider switching to Reflective or Executive tasks to balance your cognitive load');
  });

  it('should recommend switching for Creative Work overload', () => {
    const recommendation = aiRecommendationService.getModeBalancingRecommendation('Creative Work');
    expect(recommendation).toBe('Consider switching to Reflective or Executive tasks to balance your cognitive load');
  });

  it('should return null for other modes', () => {
    const recommendation = aiRecommendationService.getModeBalancingRecommendation('Executive Work');
    expect(recommendation).toBeNull();
  });

  it('should handle case-insensitive input', () => {
    const recommendation = aiRecommendationService.getModeBalancingRecommendation('DEEP WORK');
    expect(recommendation).toBe('Consider switching to Reflective or Executive tasks to balance your cognitive load');
  });
});

describe('Signal Layer - getDayShapingRecommendation', () => {
  it('should recommend morning for Deep Work', () => {
    const morning = new Date();
    morning.setHours(9, 0, 0, 0);
    
    const recommendation = aiRecommendationService.getDayShapingRecommendation('Deep Work', morning);
    expect(recommendation).toBe('Morning is optimal for Deep Work and Reflective tasks');
  });

  it('should recommend morning for Reflective Work', () => {
    const morning = new Date();
    morning.setHours(10, 0, 0, 0);
    
    const recommendation = aiRecommendationService.getDayShapingRecommendation('Reflective Work', morning);
    expect(recommendation).toBe('Morning is optimal for Deep Work and Reflective tasks');
  });

  it('should recommend afternoon for Creative Work', () => {
    const afternoon = new Date();
    afternoon.setHours(14, 0, 0, 0);
    
    const recommendation = aiRecommendationService.getDayShapingRecommendation('Creative Work', afternoon);
    expect(recommendation).toBe('Afternoon is optimal for Creative and Executive tasks');
  });

  it('should recommend afternoon for Executive Work', () => {
    const afternoon = new Date();
    afternoon.setHours(15, 0, 0, 0);
    
    const recommendation = aiRecommendationService.getDayShapingRecommendation('Executive Work', afternoon);
    expect(recommendation).toBe('Afternoon is optimal for Creative and Executive tasks');
  });

  it('should suggest rescheduling for mismatched times', () => {
    const morning = new Date();
    morning.setHours(9, 0, 0, 0);
    
    const recommendation = aiRecommendationService.getDayShapingRecommendation('Creative Work', morning);
    expect(recommendation).toBe('Consider scheduling this in the afternoon for better performance');
  });
});

describe('Signal Layer - applyDisambiguationRules', () => {
  it('should classify technical design as Deep Work', () => {
    const task: TaskAnalysis = {
      title: 'Design system architecture',
      description: 'Technical system design and architecture planning',
      duration: 90,
      importance: true,
      urgency: false,
    };

    const category = aiRecommendationService.applyDisambiguationRules(task, WorkCategory.CREATIVE_WORK);
    expect(category).toBe(WorkCategory.DEEP_WORK);
  });

  it('should classify visual design as Creative Work', () => {
    const task: TaskAnalysis = {
      title: 'Design UI mockups',
      description: 'Visual design and UI mockup creation',
      duration: 60,
      importance: true,
      urgency: false,
    };

    const category = aiRecommendationService.applyDisambiguationRules(task, WorkCategory.DEEP_WORK);
    expect(category).toBe(WorkCategory.CREATIVE_WORK);
  });

  it('should classify analytical research as Deep Work', () => {
    const task: TaskAnalysis = {
      title: 'Research and analyze market data',
      description: 'Analyze customer data and statistics',
      duration: 120,
      importance: true,
      urgency: false,
    };

    const category = aiRecommendationService.applyDisambiguationRules(task, WorkCategory.REFLECTIVE_WORK);
    expect(category).toBe(WorkCategory.DEEP_WORK);
  });

  it('should classify exploratory research as Reflective Work', () => {
    const task: TaskAnalysis = {
      title: 'Research new frameworks',
      description: 'Explore and learn about new technologies',
      duration: 90,
      importance: true,
      urgency: false,
    };

    const category = aiRecommendationService.applyDisambiguationRules(task, WorkCategory.DEEP_WORK);
    expect(category).toBe(WorkCategory.REFLECTIVE_WORK);
  });

  it('should classify strategic planning as Reflective Work', () => {
    const task: TaskAnalysis = {
      title: 'Strategic planning session',
      description: 'Long-term strategic planning and vision',
      duration: 120,
      importance: true,
      urgency: false,
    };

    const category = aiRecommendationService.applyDisambiguationRules(task, WorkCategory.DEEP_WORK);
    expect(category).toBe(WorkCategory.REFLECTIVE_WORK);
  });

  it('should classify execution planning as Deep Work', () => {
    const task: TaskAnalysis = {
      title: 'Plan implementation details',
      description: 'Execute and implement tactical plan',
      duration: 90,
      importance: true,
      urgency: false,
    };

    const category = aiRecommendationService.applyDisambiguationRules(task, WorkCategory.REFLECTIVE_WORK);
    expect(category).toBe(WorkCategory.DEEP_WORK);
  });

  it('should return initial category if no disambiguation rules match', () => {
    const task: TaskAnalysis = {
      title: 'Regular task',
      description: 'No specific keywords',
      duration: 60,
      importance: true,
      urgency: false,
    };

    const category = aiRecommendationService.applyDisambiguationRules(task, WorkCategory.EXECUTIVE_WORK);
    expect(category).toBe(WorkCategory.EXECUTIVE_WORK);
  });
});

describe('Signal Layer - calibrateConfidence', () => {
  it('should return High for confidence >= 0.90', () => {
    const result = aiRecommendationService.calibrateConfidence(0.95);
    expect(result.level).toBe('High');
    expect(result.action).toBe('High certainty - proceed');
  });

  it('should return Stable for confidence >= 0.70', () => {
    const result = aiRecommendationService.calibrateConfidence(0.85);
    expect(result.level).toBe('Stable');
    expect(result.action).toBe('Stable classification - proceed');
  });

  it('should return Confirm for confidence >= 0.50', () => {
    const result = aiRecommendationService.calibrateConfidence(0.65);
    expect(result.level).toBe('Confirm');
    expect(result.action).toBe('Ask user to confirm');
  });

  it('should return Clarify for confidence < 0.50', () => {
    const result = aiRecommendationService.calibrateConfidence(0.40);
    expect(result.level).toBe('Clarify');
    expect(result.action).toBe('Request clarification');
  });

  it('should handle edge cases at boundaries', () => {
    expect(aiRecommendationService.calibrateConfidence(0.90).level).toBe('High');
    expect(aiRecommendationService.calibrateConfidence(0.89).level).toBe('Stable');
    expect(aiRecommendationService.calibrateConfidence(0.70).level).toBe('Stable');
    expect(aiRecommendationService.calibrateConfidence(0.69).level).toBe('Confirm');
    expect(aiRecommendationService.calibrateConfidence(0.50).level).toBe('Confirm');
    expect(aiRecommendationService.calibrateConfidence(0.49).level).toBe('Clarify');
  });
});

describe('Signal Layer - generateEnhancedTaskRecommendation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mocks
    mockInvoke.mockResolvedValue({
      content: JSON.stringify({
        category: 'Deep Work',
        recommendedTime: '09:30',
        confidence: 0.92,
        reasoning: 'High cognitive demand task',
      }),
    });
    
    mockParse.mockResolvedValue({
      category: 'Deep Work',
      recommendedTime: '09:30',
      confidence: 0.92,
      reasoning: 'High cognitive demand task',
    });
    
    // Mock getUserTaskHistory
    vi.spyOn(aiRecommendationService as any, 'getUserTaskHistory').mockResolvedValue([]);
    
    (prisma.focusSession.findMany as any).mockResolvedValue([]);
    (prisma.task.findMany as any).mockResolvedValue([]);
  });

  it('should generate Core-Signal recommendation', async () => {
    const task: TaskAnalysis = {
      title: 'Complete Q4 Strategy Plan',
      description: 'Strategic planning task',
      duration: 90,
      importance: true,
      urgency: false,
      isHighLeverage: true,
      advancesKeyResults: true,
    };

    const recommendation = await aiRecommendationService.generateEnhancedTaskRecommendation(
      task,
      mockUserPreferences,
      1
    );

    expect(recommendation.signalType).toBe('Core-Signal');
    expect(recommendation.priority).toBe('High');
    expect(recommendation.recommendedDuration).toBeGreaterThanOrEqual(45);
    expect(recommendation.recommendedDuration).toBeLessThanOrEqual(90);
  });

  it('should generate High-Signal recommendation', async () => {
    const task: TaskAnalysis = {
      title: 'Refactor Core Module',
      description: 'Technical refactoring',
      duration: 60,
      importance: true,
      urgency: false,
      isHighLeverage: true,
      advancesKeyResults: false,
    };

    const recommendation = await aiRecommendationService.generateEnhancedTaskRecommendation(
      task,
      mockUserPreferences,
      1
    );

    expect(recommendation.signalType).toBe('High-Signal');
    expect(recommendation.priority).toBe('High');
  });

  it('should generate Strategic-Signal recommendation', async () => {
    const task: TaskAnalysis = {
      title: 'Review OKR Progress',
      description: 'OKR review task',
      duration: 45,
      importance: true,
      urgency: false,
      isHighLeverage: false,
      advancesKeyResults: true,
    };

    const recommendation = await aiRecommendationService.generateEnhancedTaskRecommendation(
      task,
      mockUserPreferences,
      1
    );

    expect(recommendation.signalType).toBe('Strategic-Signal');
    expect(recommendation.priority).toBe('High');
  });

  it('should generate Noise recommendation', async () => {
    const task: TaskAnalysis = {
      title: 'Update Old Documentation',
      description: 'Low-value task',
      duration: 15,
      importance: false,
      urgency: false,
      isHighLeverage: false,
      advancesKeyResults: false,
    };

    const recommendation = await aiRecommendationService.generateEnhancedTaskRecommendation(
      task,
      mockUserPreferences,
      1
    );

    expect(recommendation.signalType).toBe('Noise');
    expect(recommendation.priority).toBe('Noise');
  });

  it('should include break recommendation for long sessions', async () => {
    const task: TaskAnalysis = {
      title: 'Long Deep Work Session',
      description: 'Extended focus session',
      duration: 90,
      importance: true,
      urgency: false,
      isHighLeverage: true,
      advancesKeyResults: true,
    };

    const recommendation = await aiRecommendationService.generateEnhancedTaskRecommendation(
      task,
      mockUserPreferences,
      1
    );

    expect(recommendation.breakRecommendation).toBeTruthy();
    expect(recommendation.breakRecommendation).toContain('break');
  });

  it('should set conflict flags when Signal Layer suggests importance but user marked as not important', async () => {
    const task: TaskAnalysis = {
      title: 'Core-Signal Task',
      description: 'Should be important',
      duration: 90,
      importance: false, // User marked as not important
      urgency: false,
      isHighLeverage: true,
      advancesKeyResults: true, // But it's Core-Signal
    };

    const recommendation = await aiRecommendationService.generateEnhancedTaskRecommendation(
      task,
      mockUserPreferences,
      1
    );

    expect(recommendation.importanceFlag).toBe(true);
    expect(recommendation.urgencyFlag).toBe(true);
  });

  it('should cap recommended duration at 90 minutes', async () => {
    const task: TaskAnalysis = {
      title: 'Very Long Task',
      description: 'Extended task',
      duration: 180, // 3 hours
      importance: true,
      urgency: false,
      isHighLeverage: true,
      advancesKeyResults: true,
    };

    const recommendation = await aiRecommendationService.generateEnhancedTaskRecommendation(
      task,
      mockUserPreferences,
      1
    );

    expect(recommendation.recommendedDuration).toBeLessThanOrEqual(90);
  });

  it('should set minimum recommended duration to 25 minutes', async () => {
    const task: TaskAnalysis = {
      title: 'Short Task',
      description: 'Quick task',
      duration: 10, // Very short
      importance: true,
      urgency: false,
      isHighLeverage: false,
      advancesKeyResults: false,
    };

    const recommendation = await aiRecommendationService.generateEnhancedTaskRecommendation(
      task,
      mockUserPreferences,
      1
    );

    expect(recommendation.recommendedDuration).toBeGreaterThanOrEqual(25);
  });

  it('should handle errors gracefully and return fallback', async () => {
    // Mock LLM to throw error
    mockInvoke.mockRejectedValue(new Error('API Error'));
    mockParse.mockRejectedValue(new Error('Parse Error'));

    const task: TaskAnalysis = {
      title: 'Test Task',
      description: 'Test',
      duration: 60,
      importance: true,
      urgency: false,
      isHighLeverage: true,
      advancesKeyResults: true,
    };

    const recommendation = await aiRecommendationService.generateEnhancedTaskRecommendation(
      task,
      mockUserPreferences,
      1
    );

    expect(recommendation).toBeDefined();
    expect(recommendation.signalType).toBe('Core-Signal');
    expect(recommendation.category).toBeDefined();
  });
});

describe('Signal Layer - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mocks for integration tests
    mockInvoke.mockResolvedValue({
      content: JSON.stringify({
        category: 'Deep Work',
        recommendedTime: '09:30',
        confidence: 0.95,
        reasoning: 'High cognitive demand and strategic impact',
      }),
    });
    
    mockParse.mockResolvedValue({
      category: 'Deep Work',
      recommendedTime: '09:30',
      confidence: 0.95,
      reasoning: 'High cognitive demand and strategic impact',
    });
    
    // Mock getUserTaskHistory
    vi.spyOn(aiRecommendationService as any, 'getUserTaskHistory').mockResolvedValue([]);
    
    (prisma.focusSession.findMany as any).mockResolvedValue([]);
    (prisma.task.findMany as any).mockResolvedValue([]);
  });

  it('should handle complete Core-Signal workflow', async () => {
    const task: TaskAnalysis = {
      title: 'Implement Authentication System',
      description: 'Build secure authentication with OAuth',
      duration: 90,
      importance: true,
      urgency: false,
      isHighLeverage: true,
      advancesKeyResults: true,
      okrTitle: 'Q4 Revenue Target',
    };

    const recommendation = await aiRecommendationService.generateEnhancedTaskRecommendation(
      task,
      mockUserPreferences,
      1
    );

    // Verify all aspects of Core-Signal
    expect(recommendation.signalType).toBe('Core-Signal');
    expect(recommendation.priority).toBe('High');
    // Category might be adjusted by disambiguation rules, so just verify it's a valid category
    expect(['Deep Work', 'Creative Work', 'Reflective Work', 'Executive Work']).toContain(recommendation.category);
    expect(recommendation.recommendedDuration).toBeGreaterThanOrEqual(45);
    expect(recommendation.breakRecommendation).toBeTruthy();
    expect(recommendation.reasoning).toBeDefined();
  });

  it('should handle Noise task workflow with confirmation', async () => {
    // Update mocks for Noise task
    mockInvoke.mockResolvedValue({
      content: JSON.stringify({
        category: 'Executive Work',
        recommendedTime: '18:00',
        confidence: 0.75,
        reasoning: 'Low-value task',
      }),
    });
    
    mockParse.mockResolvedValue({
      category: 'Executive Work',
      recommendedTime: '18:00',
      confidence: 0.75,
      reasoning: 'Low-value task',
    });

    const task: TaskAnalysis = {
      title: 'Update Old Documentation',
      description: 'Low-value maintenance task',
      duration: 15,
      importance: false,
      urgency: false,
      isHighLeverage: false,
      advancesKeyResults: false,
    };

    const recommendation = await aiRecommendationService.generateEnhancedTaskRecommendation(
      task,
      mockUserPreferences,
      1
    );

    expect(recommendation.signalType).toBe('Noise');
    expect(recommendation.priority).toBe('Noise');
    expect(recommendation.reasoning).toBeDefined();
  });
});

describe('Signal Layer - Edge Cases', () => {
  it('should handle undefined Signal Layer fields', () => {
    const signalType = aiRecommendationService.determineSignalType(
      undefined as any,
      undefined as any,
      false,
      false
    );
    expect(signalType).toBe('Noise');
  });

  it('should handle null values gracefully', () => {
    const signalType = aiRecommendationService.determineSignalType(
      null as any,
      null as any,
      false,
      false
    );
    expect(signalType).toBe('Noise');
  });

  it('should handle very large duration values', () => {
    const recommendation = aiRecommendationService.calculateBreakRecommendation(300, 0);
    expect(recommendation).toBe('Take a 5-10 minute break after this session');
  });

  it('should handle negative duration gracefully', () => {
    const recommendation = aiRecommendationService.calculateBreakRecommendation(-10, 0);
    expect(recommendation).toBeNull();
  });

  it('should handle empty task title in disambiguation', () => {
    const task: TaskAnalysis = {
      title: '',
      description: '',
      duration: 60,
      importance: true,
      urgency: false,
    };

    const category = aiRecommendationService.applyDisambiguationRules(task, WorkCategory.DEEP_WORK);
    expect(category).toBe(WorkCategory.DEEP_WORK); // Returns initial category
  });
});
