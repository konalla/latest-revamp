// Cognitive Load API Types

export enum BurnoutRiskLevel {
  NONE = "NONE",
  LOW = "LOW", 
  MODERATE = "MODERATE",
  HIGH = "HIGH",
  SEVERE = "SEVERE"
}

export enum WorkloadCapacityStatus {
  UNDERUTILIZED = "UNDERUTILIZED",
  OPTIMAL = "OPTIMAL", 
  HEAVY = "HEAVY",
  OVERLOADED = "OVERLOADED"
}

// Cognitive Load Meter Types
export interface CognitiveLoadMeterResponse {
  id: number;
  userId: number;
  currentWorkloadScore: number;
  cognitiveCapacity: number;
  sustainableCapacity: number;
  burnoutRiskScore: number;
  burnoutRiskLevel: BurnoutRiskLevel;
  recoveryRate: number;
  workloadHistory: WorkloadHistoryEntry[];
  capacityUtilization: CapacityUtilizationEntry[];
  recommendedTaskLimit: number;
  recommendedFocusSessionDuration: number;
  recommendedBreakFrequency: number;
  currentStatus: WorkloadCapacityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorkloadHistoryEntry {
  date: string;
  workload: number;
}

export interface CapacityUtilizationEntry {
  year: number;
  week: number;
  average: number;
  peak: number;
  data: number[];
}

// Workload Forecast Types
export interface WorkloadForecastResponse {
  dailyForecast: DailyForecastEntry[];
  weeklyForecast: WeeklyForecast;
  monthlyTrend: MonthlyTrend;
}

export interface DailyForecastEntry {
  date: string;
  predictedWorkload: number;
  confidenceScore: number;
  sustainableThreshold: number;
}

export interface WeeklyForecast {
  startDate: string;
  endDate: string;
  averageWorkload: number;
  peakWorkload: number;
  recoveryOpportunities: RecoveryOpportunity[];
}

export interface RecoveryOpportunity {
  date: string;
  potentialRecoveryScore: number;
}

export interface MonthlyTrend {
  direction: "improving" | "stable" | "worsening";
  volatility: number;
  sustainabilityScore: number;
}

// Burnout Risk Assessment Types
export interface BurnoutRiskAssessmentResponse {
  currentRiskScore: number;
  riskLevel: BurnoutRiskLevel;
  keyContributingFactors: string[];
  historicalComparison: HistoricalComparison;
  recoveryRecommendations: string[];
}

export interface HistoricalComparison {
  previousScore: number;
  trend: "improving" | "stable" | "worsening";
  percentageChange: number;
}

// Adaptive Recommendations Types
export interface AdaptiveRecommendationResponse {
  recommendedTaskLimit: number;
  recommendedFocusSessionDuration: number;
  recommendedBreakFrequency: number;
  taskTypeDistribution: TaskTypeDistribution;
  optimalTimeBlocks: OptimalTimeBlock[];
  personalization: PersonalizationProfile;
}

export interface TaskTypeDistribution {
  deepWork: number;
  execution: number;
  creative: number;
  reflection: number;
}

export interface OptimalTimeBlock {
  startHour: number;
  endHour: number;
  recommendedActivity: string;
}

export interface PersonalizationProfile {
  userEnergyPattern: string;
  contextSwitchingProfile: string;
  recoveryPattern: string;
}

// Database Model Types
export interface CognitiveLoadMeter {
  id: number;
  userId: number;
  currentWorkloadScore: number;
  cognitiveCapacity: number;
  sustainableCapacity: number;
  burnoutRiskScore: number;
  burnoutRiskLevel: BurnoutRiskLevel;
  recoveryRate: number;
  workloadHistory: WorkloadHistoryEntry[];
  capacityUtilization: CapacityUtilizationEntry[];
  recommendedTaskLimit?: number;
  recommendedFocusSessionDuration?: number;
  recommendedBreakFrequency?: number;
  currentStatus: WorkloadCapacityStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProductivityPatterns {
  id: number;
  userId: number;
  hourlyPatterns: Record<string, number>;
  dayOfWeekPatterns: Record<string, number>;
  taskSwitchingMetrics: Record<string, any>;
  taskCompletionRate: number;
  averageFocusSessionDuration: number;
  peakProductivityHours: number[];
  energyPattern?: string;
  contextSwitchingProfile?: string;
  recoveryPattern?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserFocusPreferences {
  id: number;
  userId: number;
  workingHours: Record<string, any>;
  cognitiveLoadPreferences: Record<string, any>;
  preferredFocusDuration: number;
  preferredBreakDuration: number;
  maxConsecutiveSessions: number;
  breakFrequency: number;
  deepWorkPreferences: Record<string, any>;
  environmentPreferences: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Service Method Types
export interface CreateCognitiveLoadMeterRequest {
  currentWorkloadScore?: number;
  cognitiveCapacity?: number;
  sustainableCapacity?: number;
  burnoutRiskScore?: number;
  burnoutRiskLevel?: BurnoutRiskLevel;
  recoveryRate?: number;
  workloadHistory?: WorkloadHistoryEntry[];
  capacityUtilization?: CapacityUtilizationEntry[];
  recommendedTaskLimit?: number;
  recommendedFocusSessionDuration?: number;
  recommendedBreakFrequency?: number;
  currentStatus?: WorkloadCapacityStatus;
}

export interface UpdateCognitiveLoadMeterRequest {
  currentWorkloadScore?: number | undefined;
  cognitiveCapacity?: number;
  sustainableCapacity?: number;
  burnoutRiskScore?: number;
  burnoutRiskLevel?: BurnoutRiskLevel;
  recoveryRate?: number;
  workloadHistory?: WorkloadHistoryEntry[];
  capacityUtilization?: CapacityUtilizationEntry[];
  recommendedTaskLimit?: number;
  recommendedFocusSessionDuration?: number;
  recommendedBreakFrequency?: number;
  currentStatus?: WorkloadCapacityStatus;
}

// Risk Factor Types
export interface RiskFactor {
  score: number;
  weight: number;
}

export interface RiskFactors {
  workloadIntensity: RiskFactor;
  recoveryDeficit: RiskFactor;
  workloadVariability: RiskFactor;
  currentWorkloadLevel: RiskFactor;
}

// Error Types
export interface CognitiveLoadError {
  error: string;
  details?: string;
}
