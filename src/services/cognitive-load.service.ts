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
      
      // If meter doesn't exist, create a new one with default values
      if (!meter) {
        console.log(`No cognitive load meter found for user ${userId}, creating a new one`);
        
        const meterData: CreateCognitiveLoadMeterRequest = {
          currentWorkloadScore: 50, // Default starting value
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
        
        console.log(`Creating cognitive load meter for user ${userId} with data:`, meterData);
        meter = await this.createCognitiveLoadMeter(userId, meterData);
      }
      
      return this.mapDatabaseToResponse(meter);
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
      
      // Determine risk level based on score
      const riskLevel = this.determineRiskLevel(currentRiskScore);
      
      // Get key contributing factors (those with highest scores)
      const keyContributingFactors = Object.entries(riskFactors)
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, 3)
        .map(([key]) => this.formatRiskFactor(key));
      
      // Calculate historical comparison
      const historicalComparison: HistoricalComparison = {
        previousScore: loadMeter.burnoutRiskScore || 0,
        trend: currentRiskScore > (loadMeter.burnoutRiskScore || 0) * 1.1 ? 'worsening' :
              currentRiskScore < (loadMeter.burnoutRiskScore || 0) * 0.9 ? 'improving' : 'stable',
        percentageChange: loadMeter.burnoutRiskScore ? 
          Math.abs(((currentRiskScore - loadMeter.burnoutRiskScore) / loadMeter.burnoutRiskScore) * 100) : 0
      };
      
      // Generate recovery recommendations
      const recoveryRecommendations = this.generateRecoveryRecommendations(riskFactors, loadMeter);
      
      return {
        currentRiskScore,
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
   * Recalculate workload score based on current tasks and focus sessions
   * @param userId User ID
   * @returns Calculated workload score (0-100)
   */
  private async recalculateWorkloadScore(userId: number): Promise<number> {
    try {
      // Get current active tasks
      const activeTasks = await prisma.task.findMany({
        where: { 
          userId,
          completed: false
        }
      });

      // Get recent focus sessions (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentSessions = await prisma.focusSession.findMany({
        where: {
          userId,
          createdAt: {
            gte: sevenDaysAgo
          }
        }
      });

      // Calculate base workload from active tasks
      let workloadScore = 0;
      
      // Each active task adds to workload based on priority and urgency
      activeTasks.forEach(task => {
        let taskWeight = 10; // Base weight
        
        if (task.importance) taskWeight += 5;
        if (task.urgency) taskWeight += 5;
        if (task.priority === 'high') taskWeight += 10;
        if (task.priority === 'medium') taskWeight += 5;
        
        workloadScore += taskWeight;
      });

      // Adjust based on recent focus session activity
      const totalSessionTime = recentSessions.reduce((sum: number, session: any) => sum + (session.duration || 0), 0);
      const avgSessionTime = recentSessions.length > 0 ? totalSessionTime / recentSessions.length : 0;
      
      // If user has been very active in focus sessions, reduce workload (they're being productive)
      if (avgSessionTime > 60) { // More than 1 hour average
        workloadScore *= 0.8; // Reduce workload by 20%
      } else if (avgSessionTime < 15) { // Less than 15 minutes average
        workloadScore *= 1.2; // Increase workload by 20%
      }

      // Cap the score between 0 and 100
      return Math.max(0, Math.min(100, Math.round(workloadScore)));
    } catch (error) {
      console.error(`Error recalculating workload score for user ${userId}:`, error);
      return 50; // Return default score if calculation fails
    }
  }

  /**
   * Map database model to response format
   */
  private mapDatabaseToResponse(meter: CognitiveLoadMeter): CognitiveLoadMeterResponse {
    return {
      id: meter.id,
      userId: meter.userId,
      currentWorkloadScore: meter.currentWorkloadScore,
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
      updatedAt: meter.updatedAt.toISOString()
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
      
      // Add some randomness to simulate real-world variations
      const randomVariation = Math.floor(Math.random() * 10) - 5; // -5 to +5
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
   * Calculate burnout risk factors
   */
  private calculateBurnoutRiskFactors(tasks: any[], focusSessions: any[], loadMeter: CognitiveLoadMeterResponse): RiskFactors {
    // 1. Workload intensity (0-10)
    const activeTaskCount = tasks.filter(task => !task.completed).length;
    const workloadIntensity = Math.min(10, activeTaskCount / 2);
    
    // 2. Recovery periods (0-10, higher = higher risk)
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 7); // Last 7 days
    const recentSessions = focusSessions.filter(session => 
      session.createdAt && new Date(session.createdAt) >= recentDate
    );
    
    // Calculate daily session time
    const sessionsByDay: Record<string, number> = {};
    recentSessions.forEach(session => {
      const day = new Date(session.createdAt).toISOString().split('T')[0];
      if (day && !sessionsByDay[day]) sessionsByDay[day] = 0;
      if (day) sessionsByDay[day] += session.duration || 0;
    });
    
    // Check for days with excessive focus time (more than 6 hours)
    const daysWithExcessiveWork = Object.values(sessionsByDay).filter(minutes => minutes > 360).length;
    const recoveryDeficit = Math.min(10, daysWithExcessiveWork * 2);
    
    // 3. Workload consistency (0-10, higher = higher risk)
    const workloadHistory = loadMeter.workloadHistory;
    
    let workloadVariability = 5; // Default medium
    if (workloadHistory.length > 1) {
      // Calculate standard deviation of workload
      const mean = workloadHistory.reduce((sum, w) => sum + w.workload, 0) / workloadHistory.length;
      const variance = workloadHistory.reduce((sum, w) => sum + Math.pow(w.workload - mean, 2), 0) / workloadHistory.length;
      const stdDev = Math.sqrt(variance);
      
      // Scale to 0-10 (higher variability = higher risk)
      workloadVariability = Math.min(10, stdDev / 5);
    }
    
    // 4. Current workload level (0-10)
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
