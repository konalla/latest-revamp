import prisma from "../config/prisma.js";
import type {
  CognitiveLoadMeterResponse,
  WorkloadForecastResponse,
  BurnoutRiskAssessmentResponse,
  AdaptiveRecommendationResponse,
  CreateCognitiveLoadMeterRequest,
  UpdateCognitiveLoadMeterRequest,
  CognitiveLoadMeter,
  UserProductivityPatterns,
  UserFocusPreferences,
  WorkloadHistoryEntry,
  CapacityUtilizationEntry,
  DailyForecastEntry,
  WeeklyForecast,
  MonthlyTrend,
  RecoveryOpportunity,
  HistoricalComparison,
  TaskTypeDistribution,
  OptimalTimeBlock,
  PersonalizationProfile,
  RiskFactors,
  RiskFactor
} from "../types/cognitive-load.types.js";
import { BurnoutRiskLevel, WorkloadCapacityStatus } from "../types/cognitive-load.types.js";

export class CognitiveLoadService {
  /**
   * Get the cognitive load meter for a user
   * @param userId User ID to get cognitive load meter for
   * @returns User's cognitive load meter data
   */
  async getUserCognitiveLoadMeter(userId: number): Promise<CognitiveLoadMeterResponse> {
    try {
      console.log(`Getting cognitive load meter for user ${userId}`);
      
      if (!userId || userId === null || userId === undefined) {
        throw new Error(`Invalid user ID: ${userId}`);
      }
      
      // Get user's cognitive load meter from database
      let meter = await (prisma as any).cognitiveLoadMeter.findUnique({
        where: { userId }
      });
      
      // If meter doesn't exist, create a new one with calculated values
      if (!meter) {
        console.log(`No cognitive load meter found for user ${userId}, creating a new one`);
        
        // Calculate actual workload score from current tasks
        const calculatedWorkloadScore = await this.recalculateWorkloadScore(userId);
        
        const meterData: CreateCognitiveLoadMeterRequest = {
          currentWorkloadScore: calculatedWorkloadScore, // Use calculated value instead of default
          cognitiveCapacity: 100,
          sustainableCapacity: 75,
          burnoutRiskScore: 0,
          burnoutRiskLevel: BurnoutRiskLevel.NONE,
          recoveryRate: 5,
          workloadHistory: [],
          capacityUtilization: [],
          recommendedTaskLimit: 5,
          recommendedFocusSessionDuration: 25,
          recommendedBreakFrequency: 5,
          currentStatus: WorkloadCapacityStatus.OPTIMAL
        };
        
        console.log(`Creating cognitive load meter for user ${userId} with calculated workload: ${calculatedWorkloadScore}`);
        meter = await this.createCognitiveLoadMeter(userId, meterData);
      } else {
        // For existing meters, recalculate workload score to ensure accuracy
        // Only recalculate if score is stale (more than 5 minutes old or significant change expected)
        const lastUpdate = new Date(meter.updatedAt);
        const now = new Date();
        const minutesSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
        
        // Only recalculate if it's been more than 5 minutes since last update
        if (minutesSinceUpdate > 5) {
          console.log(`Recalculating workload for existing meter for user ${userId} (last update: ${minutesSinceUpdate.toFixed(1)} min ago)`);
          const recalculatedScore = await this.recalculateWorkloadScore(userId);
          
          // Only update if the score has changed significantly (more than 5 points difference)
          if (Math.abs(meter.currentWorkloadScore - recalculatedScore) > 5) {
            console.log(`Updating workload score from ${meter.currentWorkloadScore} to ${recalculatedScore}`);
            meter = await this.updateCognitiveLoadMeter(userId, { currentWorkloadScore: recalculatedScore });
          } else {
            // Update timestamp to prevent frequent recalculations
            meter = await (prisma as any).cognitiveLoadMeter.update({
              where: { userId },
              data: { updatedAt: new Date() }
            });
          }
          // Skip recalculation in mapDatabaseToResponse since we just did it
          return await this.mapDatabaseToResponse(meter, true);
        } else {
          console.log(`Using cached workload for user ${userId} (updated ${minutesSinceUpdate.toFixed(1)} min ago)`);
          // Use cached value, no recalculation needed
          return await this.mapDatabaseToResponse(meter, true);
        }
      }
    } catch (error) {
      console.error(`Error getting cognitive load meter for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new cognitive load meter for a user
   * @param userId User ID
   * @param data Meter data
   * @returns Created cognitive load meter
   */
  async createCognitiveLoadMeter(userId: number, data: CreateCognitiveLoadMeterRequest): Promise<CognitiveLoadMeter> {
    try {
      console.log(`Creating cognitive load meter for user ${userId}`);
      
      // Check if meter already exists for this user
      const existingMeter = await (prisma as any).cognitiveLoadMeter.findUnique({
        where: { userId }
      });
      
      if (existingMeter) {
        console.log(`Cognitive load meter already exists for user ${userId}, updating instead`);
        return this.updateCognitiveLoadMeter(userId, data);
      }
      
      // Create new meter
      const meter = await (prisma as any).cognitiveLoadMeter.create({
        data: {
          userId,
          currentWorkloadScore: data.currentWorkloadScore || 50,
          cognitiveCapacity: data.cognitiveCapacity || 100,
          sustainableCapacity: data.sustainableCapacity || 75,
          burnoutRiskScore: data.burnoutRiskScore || 0,
          burnoutRiskLevel: data.burnoutRiskLevel || BurnoutRiskLevel.NONE,
          recoveryRate: data.recoveryRate || 5,
          workloadHistory: data.workloadHistory || [],
          capacityUtilization: data.capacityUtilization || [],
          recommendedTaskLimit: data.recommendedTaskLimit || 5,
          recommendedFocusSessionDuration: data.recommendedFocusSessionDuration || 25,
          recommendedBreakFrequency: data.recommendedBreakFrequency || 5,
          currentStatus: data.currentStatus || WorkloadCapacityStatus.OPTIMAL
        }
      });
      
      return meter;
    } catch (error) {
      console.error(`Error creating cognitive load meter for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get coaching message before starting a session
   * @param userId User ID
   * @returns Coaching message and workload info
   */
  async getPreSessionCoaching(userId: number): Promise<{
    message: string;
    workloadScore: number;
    workloadZone: string;
    canProceed: boolean;
    warning?: string;
  }> {
    try {
      const meter = await this.getUserCognitiveLoadMeter(userId);
      const zone = meter.workloadZone || "BASELINE";
      const score = meter.currentWorkloadScore;
      const sustainableCapacity = meter.sustainableCapacity;

      let message = meter.coachingMessage || "Ready to start your session.";
      let canProceed = true;
      let warning: string | undefined;

      // Special warnings for overload zone
      if (zone === "OVERLOAD") {
        message = `You're currently in overload (${score}/100). Starting another deep session may impact tomorrow's performance.`;
        warning = "Consider lighter work or taking a break instead.";
        canProceed = false; // Still allow, but warn
      } else if (score >= sustainableCapacity && score < 100) {
        message = `You're at optimal capacity (${score}/${sustainableCapacity}). Consider scheduling lighter work.`;
        canProceed = true;
      }

      return {
        message,
        workloadScore: score,
        workloadZone: zone,
        canProceed,
        warning
      };
    } catch (error) {
      console.error(`Error getting pre-session coaching for user ${userId}:`, error);
      return {
        message: "Ready to start your session.",
        workloadScore: 15,
        workloadZone: "BASELINE",
        canProceed: true
      };
    }
  }

  /**
   * Update cognitive load meter for a user
   * @param userId User ID
   * @param data Update data
   * @returns Updated cognitive load meter
   */
  async updateCognitiveLoadMeter(userId: number, data: UpdateCognitiveLoadMeterRequest): Promise<CognitiveLoadMeter> {
    try {
      console.log(`Updating cognitive load meter for user ${userId}`);
      
      // If currentWorkloadScore is undefined, recalculate it
      let updateData = { ...data };
      if (data.currentWorkloadScore === undefined) {
        const recalculatedScore = await this.recalculateWorkloadScore(userId);
        updateData.currentWorkloadScore = recalculatedScore;
      }
      
      const meter = await (prisma as any).cognitiveLoadMeter.update({
        where: { userId },
        data: {
          ...(updateData.currentWorkloadScore !== undefined && { currentWorkloadScore: updateData.currentWorkloadScore }),
          ...(updateData.cognitiveCapacity !== undefined && { cognitiveCapacity: updateData.cognitiveCapacity }),
          ...(updateData.sustainableCapacity !== undefined && { sustainableCapacity: updateData.sustainableCapacity }),
          ...(updateData.burnoutRiskScore !== undefined && { burnoutRiskScore: updateData.burnoutRiskScore }),
          ...(updateData.burnoutRiskLevel !== undefined && { burnoutRiskLevel: updateData.burnoutRiskLevel }),
          ...(updateData.recoveryRate !== undefined && { recoveryRate: updateData.recoveryRate }),
          ...(updateData.workloadHistory !== undefined && { workloadHistory: updateData.workloadHistory }),
          ...(updateData.capacityUtilization !== undefined && { capacityUtilization: updateData.capacityUtilization }),
          ...(updateData.recommendedTaskLimit !== undefined && { recommendedTaskLimit: updateData.recommendedTaskLimit }),
          ...(updateData.recommendedFocusSessionDuration !== undefined && { recommendedFocusSessionDuration: updateData.recommendedFocusSessionDuration }),
          ...(updateData.recommendedBreakFrequency !== undefined && { recommendedBreakFrequency: updateData.recommendedBreakFrequency }),
          ...(updateData.currentStatus !== undefined && { currentStatus: updateData.currentStatus })
        }
      });
      
      return meter;
    } catch (error) {
      console.error(`Error updating cognitive load meter for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Generate a workload forecast for a user based on their task history and patterns
   * @param userId User ID to generate forecast for
   * @param days Number of days to forecast (default: 7)
   * @returns Workload forecast data
   */
  async generateWorkloadForecast(userId: number, days: number = 7): Promise<WorkloadForecastResponse> {
    try {
      console.log(`Generating workload forecast for user ${userId} for ${days} days`);
      
      // Get user's cognitive load meter
      const loadMeter = await this.getUserCognitiveLoadMeter(userId);
      
      // Get user's tasks, focus sessions, and productivity patterns
      const tasks = await prisma.task.findMany({
        where: { userId }
      });
      
      const focusSessions = await (prisma as any).focusSession.findMany({
        where: { userId }
      });
      
      const productivityPatterns = await (prisma as any).userProductivityPatterns.findUnique({
        where: { userId }
      });

      // Generate daily workload forecast
      const dailyForecasts = this.generateDailyWorkloadForecast(
        tasks, 
        focusSessions, 
        productivityPatterns, 
        loadMeter, 
        days
      );
      
      // Generate weekly forecast based on daily forecasts
      const weeklyForecast = this.generateWeeklyForecast(dailyForecasts);
      
      // Generate monthly trend analysis
      const monthlyTrend = this.generateMonthlyTrend(loadMeter);
      
      return {
        dailyForecast: dailyForecasts,
        weeklyForecast,
        monthlyTrend
      };
    } catch (error) {
      console.error(`Error generating workload forecast for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Assess burnout risk for a user based on their workload patterns
   * @param userId User ID to assess burnout risk for
   * @returns Burnout risk assessment data
   */
  async assessBurnoutRisk(userId: number): Promise<BurnoutRiskAssessmentResponse> {
    try {
      console.log(`Assessing burnout risk for user ${userId}`);
      
      // Get user's cognitive load meter
      const loadMeter = await this.getUserCognitiveLoadMeter(userId);
      
      // Get user's tasks and focus sessions
      const tasks = await prisma.task.findMany({
        where: { userId }
      });
      
      const focusSessions = await (prisma as any).focusSession.findMany({
        where: { userId }
      });
      
      // Calculate burnout risk factors
      const riskFactors = this.calculateBurnoutRiskFactors(tasks, focusSessions, loadMeter);
      
      // Calculate overall risk score (weighted average of risk factors)
      const currentRiskScore = Object.values(riskFactors).reduce((sum, factor) => sum + factor.score, 0) / 
        Object.values(riskFactors).length;
      
      // Round to 2 decimal places
      const roundedRiskScore = Math.round(currentRiskScore * 100) / 100;
      
      // Determine risk level based on score
      const riskLevel = this.determineRiskLevel(roundedRiskScore);
      
      // Get key contributing factors (those with highest scores)
      const keyContributingFactors = Object.entries(riskFactors)
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, 3)
        .map(([key]) => this.formatRiskFactor(key));
      
      // Calculate historical comparison
      const previousScore = loadMeter.burnoutRiskScore || 0;
      const roundedPreviousScore = Math.round(previousScore * 100) / 100;
      const percentageChange = previousScore ? 
        Math.abs(((roundedRiskScore - previousScore) / previousScore) * 100) : 0;
      
      const historicalComparison: HistoricalComparison = {
        previousScore: roundedPreviousScore,
        trend: roundedRiskScore > previousScore * 1.1 ? 'worsening' :
              roundedRiskScore < previousScore * 0.9 ? 'improving' : 'stable',
        percentageChange: Math.round(percentageChange * 100) / 100
      };
      
      // Generate recovery recommendations
      const recoveryRecommendations = this.generateRecoveryRecommendations(riskFactors, loadMeter);
      
      return {
        currentRiskScore: roundedRiskScore,
        riskLevel,
        keyContributingFactors,
        historicalComparison,
        recoveryRecommendations
      };
    } catch (error) {
      console.error(`Error assessing burnout risk for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Generate adaptive workload recommendations based on user's cognitive capacity
   * @param userId User ID to generate recommendations for
   * @returns Adaptive recommendations
   */
  async generateAdaptiveRecommendations(userId: number): Promise<AdaptiveRecommendationResponse> {
    try {
      console.log(`Generating adaptive recommendations for user ${userId}`);
      
      // Get user's cognitive load meter
      const loadMeter = await this.getUserCognitiveLoadMeter(userId);
      
      // Get user's productivity patterns and focus preferences
      const productivityPatterns = await (prisma as any).userProductivityPatterns.findUnique({
        where: { userId }
      });
      
      const focusPreferences = await (prisma as any).userFocusPreferences.findUnique({
        where: { userId }
      });
      
      // Calculate optimal task type distribution
      const taskTypeDistribution = this.calculateOptimalTaskDistribution(
        loadMeter, 
        productivityPatterns, 
        focusPreferences
      );
      
      // Calculate recommended focus session duration
      const recommendedFocusSessionDuration = this.calculateOptimalFocusSessionDuration(
        loadMeter, 
        focusPreferences
      );
      
      // Calculate recommended break frequency
      const recommendedBreakFrequency = this.calculateOptimalBreakFrequency(
        loadMeter, 
        focusPreferences
      );
      
      // Calculate recommended task limit
      const recommendedTaskLimit = this.calculateRecommendedTaskLimit(
        loadMeter, 
        productivityPatterns
      );
      
      // Generate optimal time blocks
      const optimalTimeBlocks = this.generateOptimalTimeBlocks(
        productivityPatterns, 
        loadMeter, 
        focusPreferences
      );
      
      // Determine user's energy, context switching, and recovery patterns
      const userEnergyPattern = this.determineEnergyPattern(productivityPatterns);
      const contextSwitchingProfile = this.determineContextSwitchingProfile(productivityPatterns);
      const recoveryPattern = this.determineRecoveryPattern(loadMeter, focusPreferences);
      
      return {
        recommendedTaskLimit,
        recommendedFocusSessionDuration,
        recommendedBreakFrequency,
        taskTypeDistribution,
        optimalTimeBlocks,
        personalization: {
          userEnergyPattern,
          contextSwitchingProfile,
          recoveryPattern
        }
      };
    } catch (error) {
      console.error(`Error generating adaptive recommendations for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get user focus preferences
   * @param userId User ID
   * @returns User's focus preferences
   */
  async getUserFocusPreferences(userId: number): Promise<UserFocusPreferences> {
    try {
      console.log(`Getting focus preferences for user ${userId}`);
      
      const preferences = await (prisma as any).userFocusPreferences.findUnique({
        where: { userId }
      });
      
      if (!preferences) {
        throw new Error(`No focus preferences found for user ${userId}`);
      }
      
      return preferences;
    } catch (error) {
      console.error(`Error getting focus preferences for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update user focus preferences
   * @param userId User ID
   * @param data Update data
   * @returns Updated focus preferences
   */
  async updateUserFocusPreferences(userId: number, data: any): Promise<UserFocusPreferences> {
    try {
      console.log(`Updating focus preferences for user ${userId}`);
      
      const preferences = await (prisma as any).userFocusPreferences.update({
        where: { userId },
        data: {
          ...(data.workingHours !== undefined && { workingHours: data.workingHours }),
          ...(data.cognitiveLoadPreferences !== undefined && { cognitiveLoadPreferences: data.cognitiveLoadPreferences }),
          ...(data.preferredFocusDuration !== undefined && { preferredFocusDuration: data.preferredFocusDuration }),
          ...(data.preferredBreakDuration !== undefined && { preferredBreakDuration: data.preferredBreakDuration }),
          ...(data.maxConsecutiveSessions !== undefined && { maxConsecutiveSessions: data.maxConsecutiveSessions }),
          ...(data.breakFrequency !== undefined && { breakFrequency: data.breakFrequency }),
          ...(data.deepWorkPreferences !== undefined && { deepWorkPreferences: data.deepWorkPreferences }),
          ...(data.environmentPreferences !== undefined && { environmentPreferences: data.environmentPreferences })
        }
      });
      
      return preferences;
    } catch (error) {
      console.error(`Error updating focus preferences for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get user productivity patterns
   * @param userId User ID
   * @returns User's productivity patterns
   */
  async getUserProductivityPatterns(userId: number): Promise<UserProductivityPatterns> {
    try {
      console.log(`Getting productivity patterns for user ${userId}`);
      
      const patterns = await (prisma as any).userProductivityPatterns.findUnique({
        where: { userId }
      });
      
      if (!patterns) {
        throw new Error(`No productivity patterns found for user ${userId}`);
      }
      
      return patterns;
    } catch (error) {
      console.error(`Error getting productivity patterns for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Detect work mode from task categories in a session
   * @param taskIds Array of task IDs from session intention
   * @returns Detected work mode
   */
  private async detectWorkModeFromTasks(taskIds: number[]): Promise<string> {
    if (!taskIds || taskIds.length === 0) {
      return "EXECUTIVE"; // Default to Executive if no tasks
    }

    try {
      const tasks = await prisma.task.findMany({
        where: { id: { in: taskIds } },
        select: { category: true }
      });

      if (tasks.length === 0) {
        return "EXECUTIVE";
      }

      // Count categories (task.category values: "deepWork", "creative", "reflection", "execution")
      const categoryCounts: Record<string, number> = {
        DEEP: 0,
        CREATIVE: 0,
        REFLECTIVE: 0,
        EXECUTIVE: 0
      };

      tasks.forEach(task => {
        const category = (task.category || "").toLowerCase();
        if (category === "deepwork" || category.includes("deep")) {
          categoryCounts.DEEP++;
        } else if (category === "creative" || category.includes("creative")) {
          categoryCounts.CREATIVE++;
        } else if (category === "reflection" || category.includes("reflective") || category.includes("reflection")) {
          categoryCounts.REFLECTIVE++;
        } else {
          // Default to executive (includes "execution" and any unknown categories)
          categoryCounts.EXECUTIVE++;
        }
      });

      // Return the most common category
      const maxCategory = Object.entries(categoryCounts).reduce((a, b) => 
        categoryCounts[a[0]] > categoryCounts[b[0]] ? a : b
      );

      return maxCategory[0];
    } catch (error) {
      console.error("Error detecting work mode from tasks:", error);
      return "EXECUTIVE";
    }
  }

  /**
   * Calculate work mode weight multiplier
   * @param workMode Work mode string
   * @param durationMinutes Duration in minutes
   * @returns Weight multiplier (0-1)
   */
  private getWorkModeWeight(workMode: string, durationMinutes: number): number {
    const mode = workMode.toUpperCase();
    const buffer = 5; // 4-5 minute buffer

    // Very short sessions (<25 min with buffer = <20 min)
    if (durationMinutes < 20) {
      return 0.2;
    }

    // Deep work
    if (mode === "DEEP" || mode.includes("DEEP")) {
      // 60-90 minutes (55-95 with buffer)
      if (durationMinutes >= 55 && durationMinutes <= 95) {
        return 1.0;
      } else if (durationMinutes < 55) {
        return 0.8;
      } else {
        // >95 minutes, still count as deep work
        return 1.0;
      }
    }

    // Executive work
    if (mode === "EXECUTIVE" || mode.includes("EXECUTIVE")) {
      return 0.6;
    }

    // Creative work
    if (mode === "CREATIVE" || mode.includes("CREATIVE")) {
      return 0.5;
    }

    // Reflective work
    if (mode === "REFLECTIVE" || mode.includes("REFLECTIVE")) {
      return 0.4;
    }

    // Default to Executive
    return 0.6;
  }

  /**
   * Calculate task pressure from due/overdue tasks
   * @param userId User ID
   * @returns Task pressure score (0-20)
   */
  private async calculateTaskPressure(userId: number): Promise<number> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get tasks due today or overdue
      const dueTasks = await prisma.task.findMany({
        where: {
          userId,
          completed: false,
          dueDate: {
            lte: new Date() // Due today or in the past
          }
        }
      });

      let pressure = 0;

      dueTasks.forEach(task => {
        // Priority weights
        if (task.priority === 'high') pressure += 5;
        else if (task.priority === 'medium') pressure += 3;
        else if (task.priority === 'low') pressure += 1;

        // Urgency weight
        if (task.urgency) pressure += 3;

        // Importance weight
        if (task.importance) pressure += 2;
      });

      // Cap at 20 points
      return Math.min(20, pressure);
    } catch (error) {
      console.error(`Error calculating task pressure for user ${userId}:`, error);
      return 0;
    }
  }

  /**
   * Calculate session duration from timestamps (not duration attribute)
   * @param startedAt Session start time
   * @param endedAt Session end time
   * @returns Duration in minutes
   */
  private calculateSessionDuration(startedAt: Date, endedAt: Date | null): number {
    if (!endedAt) {
      return 0; // Incomplete session
    }

    const diffMs = endedAt.getTime() - startedAt.getTime();
    const diffMinutes = Math.max(0, Math.floor(diffMs / 1000 / 60));
    return diffMinutes;
  }

  /**
   * Apply overnight decay - complete reset to baseline
   * @param userId User ID
   */
  private async applyOvernightDecay(userId: number): Promise<void> {
    try {
      const meter = await (prisma as any).cognitiveLoadMeter.findUnique({
        where: { userId }
      });

      if (!meter) return;

      const lastUpdate = new Date(meter.updatedAt);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      lastUpdate.setHours(0, 0, 0, 0);

      // If last update was before today, reset to baseline
      if (lastUpdate < today) {
        const baseline = 15; // Baseline between 10-20
        const workloadHistory = Array.isArray(meter.workloadHistory) 
          ? meter.workloadHistory 
          : [];

        // Archive yesterday's final score if it exists
        if (workloadHistory.length > 0) {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          yesterday.setHours(23, 59, 59, 999);

          // Add yesterday's entry if not already there
          const yesterdayEntry = {
            date: yesterday.toISOString().split('T')[0],
            workload: meter.currentWorkloadScore
          };

          // Check if entry for yesterday already exists
          const existingEntry = workloadHistory.find((entry: any) => 
            entry.date === yesterdayEntry.date
          );

          if (!existingEntry) {
            workloadHistory.push(yesterdayEntry);
          }
        }

        await (prisma as any).cognitiveLoadMeter.update({
          where: { userId },
          data: {
            currentWorkloadScore: baseline,
            workloadHistory: workloadHistory.slice(-30) // Keep last 30 days
          }
        });

        console.log(`Applied overnight decay for user ${userId}: reset to baseline ${baseline}`);
      }
    } catch (error) {
      console.error(`Error applying overnight decay for user ${userId}:`, error);
    }
  }

  /**
   * Recalculate workload score based on executed focus sessions (session-based, not task-count-based)
   * @param userId User ID
   * @param targetDate Optional target date (defaults to today)
   * @returns Calculated workload score (0-100+)
   */
  private async recalculateWorkloadScore(userId: number, targetDate?: Date): Promise<number> {
    try {
      // Apply overnight decay first
      await this.applyOvernightDecay(userId);

      const today = targetDate || new Date();
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      // Get today's completed focus sessions (count toward day session started)
      const todaySessions = await prisma.focusSession.findMany({
        where: {
          userId,
          startedAt: {
            gte: startOfDay,
            lte: endOfDay
          },
          completed: true,
          endedAt: {
            not: null
          }
        }
      });

      console.log(`Recalculating workload for user ${userId}: Found ${todaySessions.length} completed sessions today`);

      // Calculate weighted workload from sessions
      let totalWeightedMinutes = 0;

      for (const session of todaySessions) {
        // Calculate duration from timestamps
        const durationMinutes = this.calculateSessionDuration(
          session.startedAt,
          session.endedAt
        );

        if (durationMinutes <= 0) continue;

        // Detect work mode from task categories
        const intention = session.intention as any;
        const taskIds = intention?.taskIds || [];
        const workMode = await this.detectWorkModeFromTasks(taskIds);

        // Get weight multiplier for this work mode and duration
        const weight = this.getWorkModeWeight(workMode, durationMinutes);

        // Add weighted minutes
        totalWeightedMinutes += durationMinutes * weight;

        console.log(`Session ${session.id}: ${durationMinutes}min ${workMode} mode, weight ${weight}, weighted: ${durationMinutes * weight}min`);
      }

      // Convert to 0-100 scale (240 minutes = 4 hours deep-equivalent = 100)
      const baseWorkload = (totalWeightedMinutes / 240) * 100;

      // Add task pressure (only from due today/overdue tasks)
      const taskPressure = await this.calculateTaskPressure(userId);

      // Combined score (allow overflow for overload detection)
      const finalScore = Math.max(0, Math.round(baseWorkload + taskPressure));

      console.log(`Final workload calculation: ${totalWeightedMinutes} weighted min = ${baseWorkload.toFixed(1)} base + ${taskPressure} pressure = ${finalScore} total`);

      return finalScore;
    } catch (error) {
      console.error(`Error recalculating workload score for user ${userId}:`, error);
      return 15; // Return baseline if calculation fails
    }
  }

  /**
   * Get workload zone based on score
   */
  private getWorkloadZone(score: number, sustainableCapacity: number): string {
    if (score <= 30) return "BASELINE";
    if (score <= 60) return "BUILDING";
    if (score <= sustainableCapacity) return "SUSTAINABLE";
    if (score <= 100) return "OPTIMAL";
    return "OVERLOAD";
  }

  /**
   * Get coaching message based on workload zone
   */
  private getCoachingMessage(workloadScore: number, sustainableCapacity: number, sessionsToday: number): string {
    const zone = this.getWorkloadZone(workloadScore, sustainableCapacity);

    switch (zone) {
      case "BASELINE":
        return "You're well-rested. Great time for deep work sessions.";
      case "BUILDING":
        return "You're building momentum. Consider scheduling your most important work now.";
      case "SUSTAINABLE":
        return `You're at your optimal daily load (${workloadScore}/${sustainableCapacity}). You can keep going, but consider winding down high-intensity work.`;
      case "OPTIMAL":
        return `You're at peak capacity (${workloadScore}/100). Excellent work today! Consider lighter tasks or breaks.`;
      case "OVERLOAD":
        return `You're moving into overload (${workloadScore}/100). Adding another deep session today may impact tomorrow's performance. Do you still want to continue?`;
      default:
        return "Monitor your workload to maintain optimal performance.";
    }
  }

  /**
   * Update hourly workload history
   */
  private async updateHourlyWorkloadHistory(userId: number, workloadScore: number): Promise<void> {
    try {
      const meter = await (prisma as any).cognitiveLoadMeter.findUnique({
        where: { userId }
      });

      if (!meter) return;

      const now = new Date();
      const currentHour = now.getHours();
      const today = now.toISOString().split('T')[0];

      let workloadHistory = Array.isArray(meter.workloadHistory) 
        ? [...meter.workloadHistory] 
        : [];

      // Find or create today's hourly entry
      const hourlyEntryKey = `${today}-${currentHour}`;
      let hourlyEntry = workloadHistory.find((entry: any) => 
        entry.hour === currentHour && entry.date === today
      );

      if (hourlyEntry) {
        // Update existing entry
        hourlyEntry.workload = workloadScore;
      } else {
        // Create new hourly entry
        hourlyEntry = {
          date: today,
          hour: currentHour,
          workload: workloadScore
        };
        workloadHistory.push(hourlyEntry);
      }

      // Keep only last 7 days of hourly data (24 hours * 7 days = 168 entries max)
      // Group by date and keep most recent
      const dateGroups: Record<string, any[]> = {};
      workloadHistory.forEach((entry: any) => {
        if (entry.date) {
          if (!dateGroups[entry.date]) {
            dateGroups[entry.date] = [];
          }
          dateGroups[entry.date].push(entry);
        }
      });

      // Sort dates and keep last 7 days
      const sortedDates = Object.keys(dateGroups).sort().slice(-7);
      workloadHistory = sortedDates.flatMap(date => dateGroups[date]);

      await (prisma as any).cognitiveLoadMeter.update({
        where: { userId },
        data: { workloadHistory }
      });
    } catch (error) {
      console.error(`Error updating hourly workload history for user ${userId}:`, error);
    }
  }

  /**
   * Get count of sessions today
   */
  private async getSessionsTodayCount(userId: number): Promise<number> {
    try {
      const today = new Date();
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      const count = await prisma.focusSession.count({
        where: {
          userId,
          startedAt: {
            gte: startOfDay,
            lte: endOfDay
          },
          completed: true
        }
      });

      return count;
    } catch (error) {
      console.error(`Error getting sessions today count for user ${userId}:`, error);
      return 0;
    }
  }

  /**
   * Map database model to response format
   */
  private async mapDatabaseToResponse(meter: CognitiveLoadMeter, skipRecalculation: boolean = false): Promise<CognitiveLoadMeterResponse> {
    // Use existing workload score if we just recalculated, otherwise use stored value
    const currentWorkload = skipRecalculation ? meter.currentWorkloadScore : await this.recalculateWorkloadScore(meter.userId);
    const sessionsToday = await this.getSessionsTodayCount(meter.userId);
    const zone = this.getWorkloadZone(currentWorkload, meter.sustainableCapacity);
    const coachingMessage = this.getCoachingMessage(currentWorkload, meter.sustainableCapacity, sessionsToday);

    // Update hourly history (only if we recalculated)
    if (!skipRecalculation) {
      await this.updateHourlyWorkloadHistory(meter.userId, currentWorkload);
    }

    // Calculate deep-equivalent hours
    const deepEquivalentHours = (currentWorkload / 100) * 4; // 100 = 4 hours

    return {
      id: meter.id,
      userId: meter.userId,
      currentWorkloadScore: currentWorkload,
      cognitiveCapacity: meter.cognitiveCapacity,
      sustainableCapacity: meter.sustainableCapacity,
      burnoutRiskScore: meter.burnoutRiskScore,
      burnoutRiskLevel: meter.burnoutRiskLevel,
      recoveryRate: meter.recoveryRate,
      workloadHistory: meter.workloadHistory as WorkloadHistoryEntry[],
      capacityUtilization: meter.capacityUtilization as CapacityUtilizationEntry[],
      recommendedTaskLimit: meter.recommendedTaskLimit || 5,
      recommendedFocusSessionDuration: meter.recommendedFocusSessionDuration || 25,
      recommendedBreakFrequency: meter.recommendedBreakFrequency || 5,
      currentStatus: meter.currentStatus,
      createdAt: meter.createdAt.toISOString(),
      updatedAt: meter.updatedAt.toISOString(),
      // Extended fields for new system
      workloadZone: zone as any,
      coachingMessage,
      sessionsToday,
      deepEquivalentHours: parseFloat(deepEquivalentHours.toFixed(2))
    };
  }

  /**
   * Generate daily workload forecast
   */
  private generateDailyWorkloadForecast(
    tasks: any[],
    focusSessions: any[],
    productivityPatterns: UserProductivityPatterns | null,
    loadMeter: CognitiveLoadMeterResponse,
    days: number
  ): DailyForecastEntry[] {
    const forecasts: DailyForecastEntry[] = [];
    const today = new Date();
    
    // Handle case when no tasks exist
    if (!tasks || tasks.length === 0) {
      for (let i = 0; i < days; i++) {
        const forecastDate = new Date();
        forecastDate.setDate(today.getDate() + i);
        
        forecasts.push({
          date: forecastDate.toISOString(),
          predictedWorkload: loadMeter.currentWorkloadScore, // Use current meter value
          confidenceScore: Math.max(50, 100 - (i * 5)),
          sustainableThreshold: loadMeter.sustainableCapacity
        });
      }
      return forecasts;
    }
    
    for (let i = 0; i < days; i++) {
      const forecastDate = new Date();
      forecastDate.setDate(today.getDate() + i);
      
      // Calculate tasks due on this day
      const dueTasks = tasks.filter(task => {
        if (!task.dueDate) return false;
        const deadline = new Date(task.dueDate);
        const deadlineDay = deadline.toISOString().split('T')[0];
        const forecastDay = forecastDate.toISOString().split('T')[0];
        return deadlineDay === forecastDay;
      });
      
      // Calculate workload based on tasks due and historical patterns
      let predictedWorkload = loadMeter.currentWorkloadScore;
      
      // Adjust based on tasks due
      const taskImpact = dueTasks.length * 5; // Each task adds 5 points to workload
      predictedWorkload = Math.min(100, Math.max(0, predictedWorkload + taskImpact));
      
      // Add minimal randomness only if there are tasks or historical data
      // For users with no tasks, keep predictions stable
      let randomVariation = 0;
      if (dueTasks.length > 0 || loadMeter.workloadHistory.length > 0) {
        randomVariation = Math.floor(Math.random() * 6) - 3; // Reduced to -3 to +3
      }
      predictedWorkload = Math.min(100, Math.max(0, predictedWorkload + randomVariation));
      
      // Calculate confidence score based on historical data
      const confidenceScore = Math.max(50, 100 - (i * 5)); // Decreases over time
      
      forecasts.push({
        date: forecastDate.toISOString(),
        predictedWorkload,
        confidenceScore,
        sustainableThreshold: loadMeter.sustainableCapacity
      });
    }
    
    return forecasts;
  }

  /**
   * Generate weekly forecast from daily forecasts
   */
  private generateWeeklyForecast(dailyForecasts: DailyForecastEntry[]): WeeklyForecast {
    const workloads = dailyForecasts.map(f => f.predictedWorkload);
    const averageWorkload = workloads.reduce((sum, w) => sum + w, 0) / workloads.length;
    const peakWorkload = Math.max(...workloads);
    
    // Find recovery opportunities (days with lower workload)
    const recoveryOpportunities: RecoveryOpportunity[] = dailyForecasts
      .filter(f => f.predictedWorkload < 50)
      .map(f => ({
        date: f.date,
        potentialRecoveryScore: 100 - f.predictedWorkload
      }));
    
    return {
      startDate: dailyForecasts[0]?.date || new Date().toISOString(),
      endDate: dailyForecasts[dailyForecasts.length - 1]?.date || new Date().toISOString(),
      averageWorkload,
      peakWorkload,
      recoveryOpportunities
    };
  }

  /**
   * Generate monthly trend analysis
   */
  private generateMonthlyTrend(loadMeter: CognitiveLoadMeterResponse): MonthlyTrend {
    const workloadHistory = loadMeter.workloadHistory;
    
    if (workloadHistory.length < 2) {
      return {
        direction: "stable",
        volatility: 25,
        sustainabilityScore: 75
      };
    }
    
    // Calculate trend direction
    const recent = workloadHistory.slice(-7);
    const older = workloadHistory.slice(-14, -7);
    
    const recentAvg = recent.reduce((sum, w) => sum + w.workload, 0) / recent.length;
    const olderAvg = older.reduce((sum, w) => sum + w.workload, 0) / older.length;
    
    let direction: "improving" | "stable" | "worsening" = "stable";
    if (recentAvg > olderAvg * 1.1) direction = "worsening";
    else if (recentAvg < olderAvg * 0.9) direction = "improving";
    
    // Calculate volatility (standard deviation)
    const mean = workloadHistory.reduce((sum, w) => sum + w.workload, 0) / workloadHistory.length;
    const variance = workloadHistory.reduce((sum, w) => sum + Math.pow(w.workload - mean, 2), 0) / workloadHistory.length;
    const volatility = Math.sqrt(variance);
    
    // Calculate sustainability score
    const sustainableDays = workloadHistory.filter(w => w.workload <= loadMeter.sustainableCapacity).length;
    const sustainabilityScore = (sustainableDays / workloadHistory.length) * 100;
    
    return {
      direction,
      volatility,
      sustainabilityScore
    };
  }

  /**
   * Calculate burnout risk factors (updated for session-based workload)
   */
  private calculateBurnoutRiskFactors(tasks: any[], focusSessions: any[], loadMeter: CognitiveLoadMeterResponse): RiskFactors {
    // 1. Workload intensity based on sessions (0-10)
    // Count sessions in last 7 days with high cognitive load
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 7);
    const recentSessions = focusSessions.filter(session => 
      session.startedAt && new Date(session.startedAt) >= recentDate && session.completed
    );

    // Calculate weighted session minutes per day
    let totalWeightedMinutes = 0;
    for (const session of recentSessions) {
      if (!session.endedAt || !session.startedAt) continue;
      const duration = this.calculateSessionDuration(session.startedAt, session.endedAt);
      if (duration <= 0) continue;

      // Get work mode from tasks
      const intention = session.intention as any;
      const taskIds = intention?.taskIds || [];
      // Use a simplified approach - count deep work sessions
      const isDeepWork = duration >= 55 && duration <= 95; // Deep work range
      const weight = isDeepWork ? 1.0 : 0.6; // Simplified weights
      totalWeightedMinutes += duration * weight;
    }

    const avgDailyWeightedMinutes = totalWeightedMinutes / 7;
    // 240 minutes = 4 hours = sustainable, so >300 = high intensity
    const workloadIntensity = Math.min(10, (avgDailyWeightedMinutes / 30)); // Scale to 0-10
    
    // 2. Recovery periods (0-10, higher = higher risk)
    // Calculate daily session time
    const sessionsByDay: Record<string, number> = {};
    recentSessions.forEach(session => {
      if (!session.startedAt) return;
      const day = new Date(session.startedAt).toISOString().split('T')[0];
      if (day) {
        if (!sessionsByDay[day]) sessionsByDay[day] = 0;
        const duration = session.endedAt && session.startedAt
          ? this.calculateSessionDuration(session.startedAt, session.endedAt)
          : (session.duration || 0);
        sessionsByDay[day] += duration;
      }
    });
    
    // Check for days with excessive focus time (more than 6 hours = 360 minutes)
    const daysWithExcessiveWork = Object.values(sessionsByDay).filter(minutes => minutes > 360).length;
    const recoveryDeficit = Math.min(10, daysWithExcessiveWork * 2);
    
    // 3. Workload consistency (0-10, higher = higher risk)
    const workloadHistory = loadMeter.workloadHistory || [];
    
    let workloadVariability = 0;
    // Filter to daily entries (not hourly) for variability calculation
    const dailyEntries = workloadHistory.filter((entry: any) => entry.date && !entry.hour);
    
    if (dailyEntries.length > 1) {
      // Calculate standard deviation of workload
      const workloads = dailyEntries.map((w: any) => w.workload || 0);
      const mean = workloads.reduce((sum: number, w: number) => sum + w, 0) / workloads.length;
      const variance = workloads.reduce((sum: number, w: number) => sum + Math.pow(w - mean, 2), 0) / workloads.length;
      const stdDev = Math.sqrt(variance);
      
      // Scale to 0-10 (higher variability = higher risk)
      workloadVariability = Math.min(10, stdDev / 5);
    } else if (dailyEntries.length === 1) {
      // Single data point = low variability
      workloadVariability = 1;
    }
    
    // 4. Current workload level (0-10) - scale based on actual workload
    const currentWorkloadRisk = loadMeter.currentWorkloadScore / 10;
    
    return {
      workloadIntensity: { score: workloadIntensity, weight: 0.3 },
      recoveryDeficit: { score: recoveryDeficit, weight: 0.3 },
      workloadVariability: { score: workloadVariability, weight: 0.2 },
      currentWorkloadLevel: { score: currentWorkloadRisk, weight: 0.2 }
    };
  }

  /**
   * Determine risk level based on score
   */
  private determineRiskLevel(score: number): BurnoutRiskLevel {
    if (score > 80) return BurnoutRiskLevel.SEVERE;
    if (score > 60) return BurnoutRiskLevel.HIGH;
    if (score > 40) return BurnoutRiskLevel.MODERATE;
    if (score > 20) return BurnoutRiskLevel.LOW;
    return BurnoutRiskLevel.NONE;
  }

  /**
   * Format risk factor name for display
   */
  private formatRiskFactor(factor: string): string {
    const factorMap: Record<string, string> = {
      workloadIntensity: "High workload intensity",
      recoveryDeficit: "Insufficient recovery periods",
      workloadVariability: "Inconsistent workload patterns",
      currentWorkloadLevel: "Current high workload level"
    };
    return factorMap[factor] || factor;
  }

  /**
   * Generate recovery recommendations
   */
  private generateRecoveryRecommendations(riskFactors: RiskFactors, loadMeter: CognitiveLoadMeterResponse): string[] {
    const recommendations: string[] = [];
    
    // Check if user has no active tasks (workload intensity = 0)
    if (riskFactors.workloadIntensity.score === 0) {
      recommendations.push("You have no active tasks - this is a great time to plan your next priorities or take a well-deserved break");
      return recommendations;
    }
    
    if (riskFactors.workloadIntensity.score > 7) {
      recommendations.push("Consider reducing your active task count to prevent cognitive overload");
    }
    
    if (riskFactors.recoveryDeficit.score > 5) {
      recommendations.push("Include more recovery days with lighter workloads in your schedule");
    }
    
    if (riskFactors.workloadVariability.score > 7) {
      recommendations.push("Work on establishing more consistent workload patterns");
    }
    
    if (riskFactors.currentWorkloadLevel.score > 8) {
      recommendations.push("Your current workload is high - consider delegating or postponing some tasks");
    }
    
    if (recommendations.length === 0) {
      recommendations.push("Your workload patterns look healthy - maintain your current approach");
    }
    
    return recommendations;
  }

  /**
   * Calculate optimal task type distribution
   */
  private calculateOptimalTaskDistribution(
    loadMeter: CognitiveLoadMeterResponse, 
    productivityPatterns: UserProductivityPatterns | null, 
    focusPreferences: UserFocusPreferences | null
  ): TaskTypeDistribution {
    // Default distribution
    const defaultDistribution: TaskTypeDistribution = {
      deepWork: 25,
      execution: 40,
      creative: 20,
      reflection: 15
    };
    
    // If we have no data, return default
    if (!loadMeter || !productivityPatterns) {
      return defaultDistribution;
    }
    
    // Adjust based on current workload and burnout risk
    const currentWorkload = loadMeter.currentWorkloadScore || 50;
    const burnoutRisk = loadMeter.burnoutRiskScore || 0;
    
    let distribution = { ...defaultDistribution };
    
    // High workload or burnout risk: reduce deep work, increase reflection
    if (currentWorkload > 70 || burnoutRisk > 60) {
      distribution.deepWork = Math.max(10, distribution.deepWork - 10);
      distribution.execution = Math.max(30, distribution.execution - 5);
      distribution.creative = distribution.creative;
      distribution.reflection = Math.min(35, distribution.reflection + 15);
    } 
    // Low workload: increase deep work and creative
    else if (currentWorkload < 30) {
      distribution.deepWork = Math.min(40, distribution.deepWork + 10);
      distribution.execution = Math.max(30, distribution.execution - 5);
      distribution.creative = Math.min(25, distribution.creative + 5);
      distribution.reflection = Math.max(10, distribution.reflection - 10);
    }
    
    // Normalize to ensure sum is 100%
    const sum = Object.values(distribution).reduce((total, val) => total + val, 0);
    if (sum !== 100) {
      const factor = 100 / sum;
      Object.keys(distribution).forEach(key => {
        distribution[key as keyof TaskTypeDistribution] = Math.round(distribution[key as keyof TaskTypeDistribution] * factor);
      });
      
      // Ensure sum is exactly 100 by adjusting the largest category
      const newSum = Object.values(distribution).reduce((total, val) => total + val, 0);
      if (newSum !== 100) {
        const diff = 100 - newSum;
        const largestCategory = Object.entries(distribution)
          .sort((a, b) => b[1] - a[1])[0]?.[0] as keyof TaskTypeDistribution;
        if (largestCategory) {
          distribution[largestCategory] += diff;
        }
      }
    }
    
    return distribution;
  }

  /**
   * Calculate optimal focus session duration
   */
  private calculateOptimalFocusSessionDuration(
    loadMeter: CognitiveLoadMeterResponse, 
    focusPreferences: UserFocusPreferences | null
  ): number {
    // Default duration based on Pomodoro Technique - proven effective
    const defaultDuration = 25;
    
    // If we have no data, return default
    if (!loadMeter) {
      return defaultDuration;
    }
    
    // Current workload and burnout risk
    const currentWorkload = loadMeter.currentWorkloadScore || 50;
    const burnoutRisk = loadMeter.burnoutRiskScore || 0;
    
    // Start with conservative base duration
    let duration = defaultDuration;
    
    // Adjust based on current state - allowing for extended deep work sessions
    if (burnoutRisk > 50 || currentWorkload > 80) {
      // High stress state - shorter sessions for mental health
      duration = 25;
    } else if (burnoutRisk > 30 || currentWorkload > 60) {
      // Moderate stress - standard sessions
      duration = 45;
    } else if (currentWorkload < 40 && burnoutRisk < 20) {
      // Low stress and good capacity - can handle extended deep work
      duration = 90;
    } else if (currentWorkload < 60 && burnoutRisk < 30) {
      // Good capacity - longer sessions for productivity
      duration = 60;
    } else {
      // Default safe duration
      duration = 25;
    }
    
    // Apply user preference as adjustment within healthy bounds
    const userPreference = focusPreferences?.preferredFocusDuration;
    if (userPreference) {
      if (userPreference < duration) {
        // User prefers shorter - respect this for comfort
        duration = Math.max(25, userPreference);
      } else if (userPreference > duration) {
        // User prefers longer - allow within limits
        duration = Math.min(90, userPreference);
      }
    }
    
    // Hard limits for mental health - 25 to 90 minutes range
    duration = Math.max(25, Math.min(90, duration));
    
    // Round to nearest 15 minutes for longer sessions, 5 minutes for shorter
    if (duration >= 45) {
      return Math.round(duration / 15) * 15;
    } else {
      return Math.round(duration / 5) * 5;
    }
  }

  /**
   * Calculate optimal break frequency
   */
  private calculateOptimalBreakFrequency(
    loadMeter: CognitiveLoadMeterResponse, 
    focusPreferences: UserFocusPreferences | null
  ): number {
    // Default break frequency
    const defaultFrequency = 5;
    
    if (!loadMeter) {
      return defaultFrequency;
    }
    
    const currentWorkload = loadMeter.currentWorkloadScore || 50;
    const burnoutRisk = loadMeter.burnoutRiskScore || 0;
    
    let frequency = defaultFrequency;
    
    // Adjust based on stress levels
    if (burnoutRisk > 50 || currentWorkload > 80) {
      // High stress - more frequent breaks
      frequency = 3;
    } else if (burnoutRisk > 30 || currentWorkload > 60) {
      // Moderate stress - standard breaks
      frequency = 5;
    } else if (currentWorkload < 40 && burnoutRisk < 20) {
      // Low stress - can handle longer sessions
      frequency = 10;
    }
    
    // Apply user preference
    const userPreference = focusPreferences?.breakFrequency;
    if (userPreference) {
      frequency = Math.max(3, Math.min(30, userPreference));
    }
    
    return frequency;
  }

  /**
   * Calculate recommended task limit
   */
  private calculateRecommendedTaskLimit(
    loadMeter: CognitiveLoadMeterResponse, 
    productivityPatterns: UserProductivityPatterns | null
  ): number {
    // Default healthy task limit - based on research showing 3-5 tasks per day is optimal
    const defaultLimit = 3;
    
    // If we have no data, return conservative default
    if (!loadMeter) {
      return defaultLimit;
    }
    
    // Current workload and capacity
    const currentWorkload = loadMeter.currentWorkloadScore || 50;
    const sustainableCapacity = loadMeter.sustainableCapacity || 75;
    const burnoutRisk = loadMeter.burnoutRiskScore || 0;
    
    // Calculate available capacity
    const availableCapacity = sustainableCapacity - currentWorkload;
    
    // Base task limit on available capacity and burnout risk
    let taskLimit;
    
    if (burnoutRisk > 50 || currentWorkload > 80) {
      // High burnout risk or overloaded - very conservative
      taskLimit = 2;
    } else if (availableCapacity > 30 && burnoutRisk < 25) {
      // Good capacity and low burnout risk
      taskLimit = 4;
    } else if (availableCapacity > 15) {
      // Moderate capacity available
      taskLimit = 3;
    } else {
      // Limited capacity available
      taskLimit = 2;
    }
    
    // Consider user's historical task completion rate
    if (productivityPatterns && productivityPatterns.taskCompletionRate) {
      const completionRate = productivityPatterns.taskCompletionRate;
      
      if (completionRate < 0.6) {
        // Low completion rate, reduce limit
        taskLimit = Math.max(1, taskLimit - 1);
      } else if (completionRate > 0.9 && taskLimit < 4) {
        // Very high completion rate, slightly increase but cap at 4
        taskLimit = Math.min(4, taskLimit + 1);
      }
    }
    
    // Never exceed 4 tasks per day - this is a hard limit for mental health
    return Math.min(4, Math.max(1, taskLimit));
  }

  /**
   * Generate optimal time blocks
   */
  private generateOptimalTimeBlocks(
    productivityPatterns: UserProductivityPatterns | null,
    loadMeter: CognitiveLoadMeterResponse,
    focusPreferences: UserFocusPreferences | null
  ): OptimalTimeBlock[] {
    const timeBlocks: OptimalTimeBlock[] = [];
    
    // Default time blocks based on common productivity patterns
    const defaultBlocks = [
      { startHour: 9, endHour: 11, recommendedActivity: "Deep Work" },
      { startHour: 11, endHour: 12, recommendedActivity: "Communication" },
      { startHour: 14, endHour: 16, recommendedActivity: "Creative Work" },
      { startHour: 16, endHour: 17, recommendedActivity: "Reflection" }
    ];
    
    // Adjust based on user's productivity patterns
    if (productivityPatterns && productivityPatterns.hourlyPatterns) {
      const hourlyPatterns = productivityPatterns.hourlyPatterns;
      
      // Find peak hours (highest productivity scores)
      const peakHours = Object.entries(hourlyPatterns)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([hour]) => parseInt(hour));
      
      // Generate time blocks based on peak hours
      peakHours.forEach((hour, index) => {
        const activities = ["Deep Work", "Creative Work", "Execution", "Reflection"];
        const activity = activities[index % activities.length] || "Deep Work";
        timeBlocks.push({
          startHour: hour,
          endHour: hour + 2,
          recommendedActivity: activity
        });
      });
    } else {
      // Use default blocks
      timeBlocks.push(...defaultBlocks);
    }
    
    return timeBlocks;
  }

  /**
   * Determine user's energy pattern
   */
  private determineEnergyPattern(productivityPatterns: UserProductivityPatterns | null): string {
    if (!productivityPatterns || !productivityPatterns.hourlyPatterns) {
      return "Standard energy pattern with peak productivity in morning hours";
    }
    
    const hourlyPatterns = productivityPatterns.hourlyPatterns;
    const morningHours = [8, 9, 10, 11];
    const afternoonHours = [14, 15, 16, 17];
    
    const morningAvg = morningHours.reduce((sum, hour) => sum + (hourlyPatterns[hour.toString()] || 0), 0) / morningHours.length;
    const afternoonAvg = afternoonHours.reduce((sum, hour) => sum + (hourlyPatterns[hour.toString()] || 0), 0) / afternoonHours.length;
    
    if (morningAvg > afternoonAvg * 1.2) {
      return "Morning person with gradually decreasing energy throughout the day";
    } else if (afternoonAvg > morningAvg * 1.2) {
      return "Afternoon person with energy building throughout the day";
    } else {
      return "Consistent energy pattern with stable productivity throughout the day";
    }
  }

  /**
   * Determine context switching profile
   */
  private determineContextSwitchingProfile(productivityPatterns: UserProductivityPatterns | null): string {
    if (!productivityPatterns || !productivityPatterns.taskSwitchingMetrics) {
      return "Moderate context switching adaptability with some recovery needed";
    }
    
    const switchingMetrics = productivityPatterns.taskSwitchingMetrics;
    const switchCount = switchingMetrics.switchCount || 0;
    const recoveryTime = switchingMetrics.recoveryTime || 0;
    
    if (switchCount > 10 && recoveryTime > 15) {
      return "High context switching difficulty requiring significant recovery time";
    } else if (switchCount < 5 && recoveryTime < 5) {
      return "Excellent context switching adaptability with minimal recovery needed";
    } else {
      return "Moderate context switching adaptability with some recovery needed";
    }
  }

  /**
   * Determine recovery pattern
   */
  private determineRecoveryPattern(loadMeter: CognitiveLoadMeterResponse, focusPreferences: UserFocusPreferences | null): string {
    const recoveryRate = loadMeter.recoveryRate || 5;
    const burnoutRisk = loadMeter.burnoutRiskScore || 0;
    
    if (recoveryRate > 8 && burnoutRisk < 20) {
      return "Fast recovery rate with excellent stress management";
    } else if (recoveryRate < 3 || burnoutRisk > 60) {
      return "Slow recovery rate requiring extended breaks and recovery days";
    } else {
      return "Moderate recovery rate requiring regular breaks and occasional recovery days";
    }
  }
}
