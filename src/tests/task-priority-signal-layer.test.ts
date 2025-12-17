/**
 * Unit Tests for Task Priority Service with Signal Layer Integration
 * Tests that Signal Layer is properly integrated into priority calculation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskPriorityService } from '../services/task-priority.service.js';

describe('Task Priority Service - Signal Layer Integration', () => {
  let taskPriorityService: TaskPriorityService;

  beforeEach(() => {
    taskPriorityService = new TaskPriorityService();
  });

  it('should calculate highest priority for Core-Signal task', async () => {
    const task = {
      id: 1,
      priority: 'low',
      importance: false,
      urgency: false,
      isHighLeverage: true,
      advancesKeyResults: true,
      duration: 90,
      category: 'deepWork',
    };

    const score = await taskPriorityService.calculatePriorityScore(task, 1);

    // Core-Signal should have highest priority (100,000 points)
    expect(score.hardRuleScore).toBeGreaterThanOrEqual(100000);
    expect(score.totalScore).toBeGreaterThan(1000000);
  });

  it('should calculate high priority for High-Signal task', async () => {
    const task = {
      id: 1,
      priority: 'medium',
      importance: true,
      urgency: false,
      isHighLeverage: true,
      advancesKeyResults: false,
      duration: 60,
      category: 'deepWork',
    };

    const score = await taskPriorityService.calculatePriorityScore(task, 1);

    // High-Signal should have very high priority (80,000 points)
    expect(score.hardRuleScore).toBeGreaterThanOrEqual(80000);
  });

  it('should calculate high priority for Strategic-Signal task', async () => {
    const task = {
      id: 1,
      priority: 'medium',
      importance: true,
      urgency: false,
      isHighLeverage: false,
      advancesKeyResults: true,
      duration: 45,
      category: 'reflective',
    };

    const score = await taskPriorityService.calculatePriorityScore(task, 1);

    // Strategic-Signal should have high priority (60,000 points)
    expect(score.hardRuleScore).toBeGreaterThanOrEqual(60000);
  });

  it('should calculate minimum priority for Noise task', async () => {
    const task = {
      id: 1,
      priority: 'low',
      importance: false,
      urgency: false,
      isHighLeverage: false,
      advancesKeyResults: false,
      duration: 15,
      category: 'executive',
    };

    const score = await taskPriorityService.calculatePriorityScore(task, 1);

    // Noise should have minimum priority (1,000 points)
    expect(score.hardRuleScore).toBe(1000);
  });

  it('should use standard scoring for Neutral task', async () => {
    const task = {
      id: 1,
      priority: 'high',
      importance: true,
      urgency: false,
      isHighLeverage: false,
      advancesKeyResults: false,
      duration: 60,
      category: 'deepWork',
    };

    const score = await taskPriorityService.calculatePriorityScore(task, 1);

    // Neutral should use standard scoring (no Signal Layer bonus)
    expect(score.hardRuleScore).toBeLessThan(10000);
  });

  it('should prioritize Core-Signal over standard high priority', async () => {
    const coreSignalTask = {
      id: 1,
      priority: 'low',
      importance: false,
      urgency: false,
      isHighLeverage: true,
      advancesKeyResults: true,
      duration: 90,
      category: 'deepWork',
    };

    const highPriorityTask = {
      id: 2,
      priority: 'high',
      importance: true,
      urgency: true,
      isHighLeverage: false,
      advancesKeyResults: false,
      duration: 60,
      category: 'deepWork',
    };

    const coreSignalScore = await taskPriorityService.calculatePriorityScore(coreSignalTask, 1);
    const highPriorityScore = await taskPriorityService.calculatePriorityScore(highPriorityTask, 1);

    // Core-Signal should rank higher than standard high priority
    expect(coreSignalScore.totalScore).toBeGreaterThan(highPriorityScore.totalScore);
  });

  it('should handle missing Signal Layer fields (backward compatibility)', async () => {
    const task = {
      id: 1,
      priority: 'medium',
      importance: true,
      urgency: false,
      // No Signal Layer fields
      duration: 60,
      category: 'deepWork',
    };

    const score = await taskPriorityService.calculatePriorityScore(task, 1);

    // Should use standard scoring when Signal Layer fields are missing
    expect(score.hardRuleScore).toBeLessThan(10000);
    expect(score.totalScore).toBeDefined();
  });
});



