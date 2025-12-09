import { CognitiveLoadService } from "./cognitive-load.service.js";
import prisma from "../config/prisma.js";

/**
 * Task Priority Service
 * Implements a strict three-tier priority hierarchy:
 * 1. Hard Rules (1000-9000 points) - Absolute priority, cannot be overridden
 * 2. Weighted Rules (0-100 points) - Primary ranking factors
 * 3. Enhancement Rules (0-10 points) - Tie-breakers only
 */

interface TaskWithRelations {
  id: number;
  priority: string;
  importance: boolean;
  urgency: boolean;
  dueDate?: Date | null;
  okrId?: number | null;
  okr?: {
    id: number;
    currentValue: number;
    targetValue: number;
    endDate?: Date | null;
    confidenceScore: number;
  } | null;
  aiRecommendation?: {
    category: string;
    confidence: number;
    recommendedTime: string;
  } | null;
  duration: number;
  category: string;
}

interface PriorityScore {
  hardRuleScore: number;
  weightedRuleScore: number;
  enhancementRuleScore: number;
  totalScore: number;
  breakdown: {
    okrRelevance: number;
    impact: number;
    cognitiveLoadAlignment: number;
    workModeAlignment: number;
    dueDateProximity: number;
  };
}

export class TaskPriorityService {
  private cognitiveLoadService: CognitiveLoadService;

  constructor() {
    this.cognitiveLoadService = new CognitiveLoadService();
  }

  /**
   * Calculate complete priority score for a task
   */
  async calculatePriorityScore(
    task: TaskWithRelations,
    userId: number,
    currentTime?: Date,
    userPreferences?: {
      deepWorkStartTime: string;
      deepWorkEndTime: string;
      creativeWorkStartTime: string;
      creativeWorkEndTime: string;
      reflectiveWorkStartTime: string;
      reflectiveWorkEndTime: string;
      executiveWorkStartTime: string;
      executiveWorkEndTime: string;
    }
  ): Promise<PriorityScore> {
    const now = currentTime || new Date();

    // Calculate all three tiers
    const hardRuleScore = this.calculateHardRuleScore(task);
    const weightedRuleScore = await this.calculateWeightedRuleScore(task);
    const enhancementRuleScore = await this.calculateEnhancementRuleScore(
      task,
      userId,
      now,
      userPreferences
    );

    const totalScore = hardRuleScore * 10000 + weightedRuleScore * 100 + enhancementRuleScore;

    return {
      hardRuleScore,
      weightedRuleScore,
      enhancementRuleScore,
      totalScore,
      breakdown: {
        okrRelevance: await this.calculateOKRRelevanceScore(task),
        impact: this.calculateImpactScore(task),
        cognitiveLoadAlignment: await this.calculateCognitiveLoadAlignment(task, userId),
        workModeAlignment: this.calculateWorkModeAlignment(task, now, userPreferences),
        dueDateProximity: this.calculateDueDateProximity(task, now),
      },
    };
  }

  /**
   * Tier 1: Hard Rules (1000-9000 points)
   * These rules have absolute priority and cannot be overridden
   */
  private calculateHardRuleScore(task: TaskWithRelations): number {
    const priority = (task.priority || "").toLowerCase();
    const isHighPriority = priority === "high";
    const isMediumPriority = priority === "medium";
    const isImportant = task.importance === true;
    const isUrgent = task.urgency === true;

    // 1. Critical Impact + High Priority = 9000 points
    if (isHighPriority && isImportant && isUrgent) {
      return 9000;
    }

    // 2. OKR Critical Path = 7000 points
    if (this.isOKRCriticalPath(task)) {
      return 7000;
    }

    // 3. High Priority + Important + Urgent = 6000 points (same as #1, but explicit)
    if (isHighPriority && isImportant && isUrgent) {
      return 6000;
    }

    // 4. High Priority + Important = 5000 points
    if (isHighPriority && isImportant) {
      return 5000;
    }

    // 5. Medium Priority + Important + Urgent = 4000 points
    if (isMediumPriority && isImportant && isUrgent) {
      return 4000;
    }

    // 6. High Priority + Urgent = 3000 points
    if (isHighPriority && isUrgent) {
      return 3000;
    }

    // 7. Important + Urgent = 2000 points
    if (isImportant && isUrgent) {
      return 2000;
    }

    // 8. High Priority = 1000 points
    if (isHighPriority) {
      return 1000;
    }

    return 0;
  }

  /**
   * Check if task is on OKR critical path
   */
  private isOKRCriticalPath(task: TaskWithRelations): boolean {
    if (!task.okrId || !task.okr) {
      return false;
    }

    const okr = task.okr;
    const progress = okr.targetValue > 0 ? okr.currentValue / okr.targetValue : 0;

    // OKR is less than 50% complete
    if (progress >= 0.5) {
      return false;
    }

    // OKR deadline is within 7 days
    if (okr.endDate) {
      const now = new Date();
      const endDate = new Date(okr.endDate);
      const daysUntilDeadline = Math.floor(
        (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysUntilDeadline > 7) {
        return false;
      }
    } else {
      // No deadline, not critical
      return false;
    }

    return true;
  }

  /**
   * Tier 2: Weighted Rules (0-100 points)
   * Primary ranking factors with specific weights
   */
  private async calculateWeightedRuleScore(task: TaskWithRelations): Promise<number> {
    // 1. Importance = 30 points
    const importanceScore = task.importance ? 30 : 0;

    // 2. Urgency = 25 points
    const urgencyScore = task.urgency ? 25 : 0;

    // 3. OKR Relevance = 20 points
    const okrRelevanceScore = await this.calculateOKRRelevanceScore(task);

    // 4. Impact Level = 15 points
    const impactScore = this.calculateImpactScore(task);

    // 5. Priority Field = 10 points
    const priorityScore = this.calculatePriorityFieldScore(task);

    return importanceScore + urgencyScore + okrRelevanceScore + impactScore + priorityScore;
  }

  /**
   * Calculate OKR relevance score (0-20 points)
   */
  private async calculateOKRRelevanceScore(task: TaskWithRelations): Promise<number> {
    if (!task.okrId || !task.okr) {
      return 0;
    }

    const okr = task.okr;
    const okrProgress = okr.targetValue > 0 ? okr.currentValue / okr.targetValue : 0;
    const okrUrgency = this.calculateOKRUrgency(okr);
    const okrImportance = okr.confidenceScore / 5; // Normalize 1-5 to 0-1

    // If OKR is far from completion (<50%) and deadline is approaching, task is more relevant
    const progressFactor = okrProgress < 0.5 ? 1 : 0.5;
    const relevanceScore = progressFactor * okrUrgency * okrImportance;

    return relevanceScore * 20; // Scale to 0-20 points
  }

  /**
   * Calculate OKR urgency based on deadline proximity (0-1)
   */
  private calculateOKRUrgency(okr: { endDate?: Date | null }): number {
    if (!okr.endDate) {
      return 0.5; // No deadline, medium urgency
    }

    const now = new Date();
    const endDate = new Date(okr.endDate);
    const daysUntilDeadline = Math.floor(
      (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilDeadline < 0) {
      return 1.0; // Overdue, maximum urgency
    } else if (daysUntilDeadline <= 7) {
      return 1.0; // Within 7 days, maximum urgency
    } else if (daysUntilDeadline <= 14) {
      return 0.8; // Within 14 days, high urgency
    } else if (daysUntilDeadline <= 30) {
      return 0.6; // Within 30 days, medium-high urgency
    } else {
      return 0.4; // More than 30 days, low-medium urgency
    }
  }

  /**
   * Calculate impact score (0-15 points)
   * Derived from priority, importance, and urgency
   */
  private calculateImpactScore(task: TaskWithRelations): number {
    const priority = (task.priority || "").toLowerCase();
    const isHighPriority = priority === "high";
    const isMediumPriority = priority === "medium";
    const isImportant = task.importance === true;
    const isUrgent = task.urgency === true;

    // Critical = 15 (high priority + important + urgent)
    if (isHighPriority && isImportant && isUrgent) {
      return 15;
    }

    // High = 10 (high priority + important OR high priority + urgent)
    if ((isHighPriority && isImportant) || (isHighPriority && isUrgent)) {
      return 10;
    }

    // Medium = 5 (medium priority + important OR high priority alone)
    if ((isMediumPriority && isImportant) || isHighPriority) {
      return 5;
    }

    // Low = 0
    return 0;
  }

  /**
   * Calculate priority field score (0-10 points)
   */
  private calculatePriorityFieldScore(task: TaskWithRelations): number {
    const priority = (task.priority || "").toLowerCase();
    switch (priority) {
      case "high":
        return 10;
      case "medium":
        return 5;
      case "low":
      default:
        return 0;
    }
  }

  /**
   * Tier 3: Enhancement Rules (0-10 points)
   * Tie-breakers only
   */
  private async calculateEnhancementRuleScore(
    task: TaskWithRelations,
    userId: number,
    currentTime: Date,
    userPreferences?: {
      deepWorkStartTime: string;
      deepWorkEndTime: string;
      creativeWorkStartTime: string;
      creativeWorkEndTime: string;
      reflectiveWorkStartTime: string;
      reflectiveWorkEndTime: string;
      executiveWorkStartTime: string;
      executiveWorkEndTime: string;
    }
  ): Promise<number> {
    // 1. Cognitive Load Alignment = 3 points
    const cognitiveLoadScore = await this.calculateCognitiveLoadAlignment(task, userId);

    // 2. Work Mode Alignment = 3 points
    const workModeScore = this.calculateWorkModeAlignment(task, currentTime, userPreferences);

    // 3. AI Confidence = 2 points
    const aiConfidenceScore = this.calculateAIConfidenceScore(task);

    // 4. Due Date Proximity = 2 points (REDUCED WEIGHT)
    const dueDateScore = this.calculateDueDateProximity(task, currentTime);

    return cognitiveLoadScore + workModeScore + aiConfidenceScore + dueDateScore;
  }

  /**
   * Calculate cognitive load alignment (0-3 points)
   */
  private async calculateCognitiveLoadAlignment(
    task: TaskWithRelations,
    userId: number
  ): Promise<number> {
    try {
      const cognitiveLoadMeter = await this.cognitiveLoadService.getUserCognitiveLoadMeter(
        userId
      );

      const currentCapacity = cognitiveLoadMeter.cognitiveCapacity;
      const currentWorkload = cognitiveLoadMeter.currentWorkloadScore;
      const availableCapacity = currentCapacity - currentWorkload;

      // Estimate task cognitive demand based on duration and category
      const taskDemand = this.estimateTaskCognitiveDemand(task);

      // Calculate alignment
      if (taskDemand <= availableCapacity * 0.8) {
        return 3; // High alignment - task fits well within capacity
      } else if (taskDemand <= availableCapacity) {
        return 1; // Medium alignment - task fits but tight
      } else {
        return 0; // Low alignment - task exceeds capacity
      }
    } catch (error) {
      console.error("Error calculating cognitive load alignment:", error);
      return 0; // Default to 0 if calculation fails
    }
  }

  /**
   * Estimate task cognitive demand (0-100 scale)
   */
  private estimateTaskCognitiveDemand(task: TaskWithRelations): number {
    // Base demand from duration (longer tasks = higher demand)
    const durationDemand = Math.min(task.duration / 60, 1) * 50; // Max 50 points from duration

    // Category-based demand
    const category = (task.category || "").toLowerCase();
    let categoryDemand = 0;
    if (category.includes("deep") || category === "deep_work") {
      categoryDemand = 40; // High cognitive demand
    } else if (category.includes("creative") || category === "creative_work") {
      categoryDemand = 30; // Medium-high cognitive demand
    } else if (category.includes("reflective") || category === "reflective_work") {
      categoryDemand = 25; // Medium cognitive demand
    } else {
      categoryDemand = 15; // Lower cognitive demand (executive work)
    }

    return durationDemand + categoryDemand;
  }

  /**
   * Calculate work mode alignment (0-3 points)
   */
  private calculateWorkModeAlignment(
    task: TaskWithRelations,
    currentTime: Date,
    userPreferences?: {
      deepWorkStartTime: string;
      deepWorkEndTime: string;
      creativeWorkStartTime: string;
      creativeWorkEndTime: string;
      reflectiveWorkStartTime: string;
      reflectiveWorkEndTime: string;
      executiveWorkStartTime: string;
      executiveWorkEndTime: string;
    }
  ): number {
    if (!task.aiRecommendation || !userPreferences) {
      return 0;
    }

    const taskCategory = task.aiRecommendation.category;
    const currentHour = currentTime.getHours();
    const currentMinutes = currentTime.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinutes;

    // Determine which work mode user should be in now
    const currentWorkMode = this.getCurrentWorkMode(currentTimeMinutes, userPreferences);

    // Check if task category matches current work mode
    if (this.categoriesMatch(taskCategory, currentWorkMode)) {
      return 3; // Perfect match
    } else if (this.categoriesPartiallyMatch(taskCategory, currentWorkMode)) {
      return 1.5; // Partial match
    }

    return 0; // No match
  }

  /**
   * Get current work mode based on time and user preferences
   */
  private getCurrentWorkMode(
    currentTimeMinutes: number,
    preferences: {
      deepWorkStartTime: string;
      deepWorkEndTime: string;
      creativeWorkStartTime: string;
      creativeWorkEndTime: string;
      reflectiveWorkStartTime: string;
      reflectiveWorkEndTime: string;
      executiveWorkStartTime: string;
      executiveWorkEndTime: string;
    }
  ): string {
    const timeInRange = (start: string, end: string): boolean => {
      const [startHour, startMin] = start.split(":").map(Number);
      const [endHour, endMin] = end.split(":").map(Number);
      const startMinutes = (startHour || 0) * 60 + (startMin || 0);
      const endMinutes = (endHour || 0) * 60 + (endMin || 0);

      if (startMinutes <= endMinutes) {
        return currentTimeMinutes >= startMinutes && currentTimeMinutes <= endMinutes;
      } else {
        // Handles overnight ranges
        return currentTimeMinutes >= startMinutes || currentTimeMinutes <= endMinutes;
      }
    };

    if (timeInRange(preferences.deepWorkStartTime, preferences.deepWorkEndTime)) {
      return "Deep Work";
    } else if (
      timeInRange(preferences.creativeWorkStartTime, preferences.creativeWorkEndTime)
    ) {
      return "Creative Work";
    } else if (
      timeInRange(preferences.reflectiveWorkStartTime, preferences.reflectiveWorkEndTime)
    ) {
      return "Reflective Work";
    } else if (
      timeInRange(preferences.executiveWorkStartTime, preferences.executiveWorkEndTime)
    ) {
      return "Executive Work";
    }

    return "Executive Work"; // Default
  }

  /**
   * Check if task category matches work mode
   */
  private categoriesMatch(taskCategory: string, workMode: string): boolean {
    const categoryLower = taskCategory.toLowerCase();
    const modeLower = workMode.toLowerCase();

    return (
      (categoryLower.includes("deep") && modeLower.includes("deep")) ||
      (categoryLower.includes("creative") && modeLower.includes("creative")) ||
      (categoryLower.includes("reflective") && modeLower.includes("reflective")) ||
      (categoryLower.includes("executive") && modeLower.includes("executive"))
    );
  }

  /**
   * Check if task category partially matches work mode
   */
  private categoriesPartiallyMatch(taskCategory: string, workMode: string): boolean {
    // Some categories are compatible (e.g., deep work and creative work)
    const categoryLower = taskCategory.toLowerCase();
    const modeLower = workMode.toLowerCase();

    // Deep work and creative work are somewhat compatible
    if (
      (categoryLower.includes("deep") || categoryLower.includes("creative")) &&
      (modeLower.includes("deep") || modeLower.includes("creative"))
    ) {
      return true;
    }

    return false;
  }

  /**
   * Calculate AI confidence score (0-2 points)
   */
  private calculateAIConfidenceScore(task: TaskWithRelations): number {
    if (!task.aiRecommendation || !task.aiRecommendation.confidence) {
      return 0;
    }

    const confidence = task.aiRecommendation.confidence;

    if (confidence > 0.8) {
      return 2; // High confidence
    } else if (confidence >= 0.5) {
      return 1; // Medium confidence
    } else {
      return 0; // Low confidence
    }
  }

  /**
   * Calculate due date proximity score (0-2 points) - REDUCED WEIGHT
   */
  private calculateDueDateProximity(task: TaskWithRelations, currentTime: Date): number {
    if (!task.dueDate) {
      return 0;
    }

    // Validate due date (flag potentially incorrect dates)
    if (this.isDueDatePotentiallyIncorrect(task, currentTime)) {
      return 0; // Don't give points for potentially incorrect dates
    }

    const dueDate = new Date(task.dueDate);
    const now = currentTime;
    const daysUntilDue = Math.floor(
      (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilDue < 0) {
      // Overdue
      if (daysUntilDue >= -1) {
        return 2; // Just overdue, still urgent
      } else {
        return 1; // Overdue but not too long
      }
    } else if (daysUntilDue === 0) {
      return 2; // Due today
    } else if (daysUntilDue <= 3) {
      return 1; // Due within 3 days
    } else if (daysUntilDue <= 7) {
      return 0.5; // Due within 7 days
    }

    return 0; // Due later or no due date
  }

  /**
   * Validate due date - detect potentially incorrect dates
   */
  private isDueDatePotentiallyIncorrect(
    task: TaskWithRelations,
    currentTime: Date
  ): boolean {
    if (!task.dueDate) {
      return false;
    }

    const dueDate = new Date(task.dueDate);
    const daysDiff = Math.floor(
      (currentTime.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Flag if due date is in past > 30 days
    if (daysDiff > 30) {
      return true;
    }

    // Flag if due date conflicts with task priority (low priority but urgent due date)
    const priority = (task.priority || "").toLowerCase();
    const isLowPriority = priority === "low";
    const daysUntilDue = -daysDiff;
    if (isLowPriority && daysUntilDue <= 1 && !task.importance && !task.urgency) {
      return true; // Low priority task with urgent due date but not marked important/urgent
    }

    // Flag if due date way in future (>1 year)
    if (daysUntilDue > 365) {
      return true;
    }

    return false;
  }

  /**
   * Rank tasks by priority score
   */
  async rankTasksByPriority(
    tasks: TaskWithRelations[],
    userId: number,
    currentTime?: Date,
    userPreferences?: {
      deepWorkStartTime: string;
      deepWorkEndTime: string;
      creativeWorkStartTime: string;
      creativeWorkEndTime: string;
      reflectiveWorkStartTime: string;
      reflectiveWorkEndTime: string;
      executiveWorkStartTime: string;
      executiveWorkEndTime: string;
    }
  ): Promise<Array<TaskWithRelations & { priorityScore: PriorityScore; rank: number }>> {
    const now = currentTime || new Date();

    // Calculate priority scores for all tasks
    const tasksWithScores = await Promise.all(
      tasks.map(async (task) => {
        const priorityScore = await this.calculatePriorityScore(
          task,
          userId,
          now,
          userPreferences
        );
        return {
          ...task,
          priorityScore,
        };
      })
    );

    // Sort by total score (descending)
    tasksWithScores.sort((a, b) => b.priorityScore.totalScore - a.priorityScore.totalScore);

    // Add rank
    return tasksWithScores.map((task, index) => ({
      ...task,
      rank: index + 1,
    }));
  }
}

// Export singleton instance
export const taskPriorityService = new TaskPriorityService();

