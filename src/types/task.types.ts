// Signal Layer Types
export type CognitiveCategory = "Deep" | "Creative" | "Reflective" | "Executive";
export type SignalType =
  | "Core-Signal"
  | "High-Signal"
  | "Strategic-Signal"
  | "Neutral"
  | "Noise";
export type PriorityLevel = "High" | "Medium" | "Low" | "Noise";

export interface CreateTaskRequest {
  title: string;
  description?: string;
  category: string;
  duration: number;
  priority: string;
  position: number;
  completed?: boolean;
  importance?: boolean;
  urgency?: boolean;
  // Signal Layer fields (user-controlled toggles from frontend)
  isHighLeverage?: boolean; // HLA toggle
  advancesKeyResults?: boolean; // AKR toggle
  dueDate?: Date;
  projectId?: number;
  objectiveId?: number;
  okrId?: number;
  planId?: number;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  category?: string;
  duration?: number;
  priority?: string;
  position?: number;
  completed?: boolean;
  importance?: boolean;
  urgency?: boolean;
  // Signal Layer fields (user-controlled toggles from frontend)
  isHighLeverage?: boolean; // HLA toggle
  advancesKeyResults?: boolean; // AKR toggle
  dueDate?: Date;
  projectId?: number;
  objectiveId?: number;
  okrId?: number;
  planId?: number;
}

export interface TaskResponse {
  id: number;
  title: string;
  description?: string;
  category: string;
  duration: number;
  priority: string;
  position: number;
  createdAt: Date;
  completed: boolean;
  importance: boolean;
  urgency: boolean;
  // Signal Layer fields
  isHighLeverage: boolean;
  advancesKeyResults: boolean;
  dueDate?: Date;
  userId: number;
  projectId?: number;
  objectiveId?: number;
  okrId?: number;
  planId?: number;
  // AI Recommendation relation
  aiRecommendation?: AIRecommendationResponse;
  user?: {
    id: number;
    name: string;
    email: string;
  };
  project?: {
    id: number;
    name: string;
  };
  objective?: {
    id: number;
    name: string;
  };
  okr?: {
    id: number;
    title: string;
  };
  plan?: {
    id: number;
    name: string;
    status: string;
    project: {
      id: number;
      name: string;
    };
    objective: {
      id: number;
      name: string;
    };
  };
}

export interface TaskListResponse {
  tasks: TaskResponse[];
  total: number;
}

export interface TaskQueryParams {
  page?: number;
  limit?: number;
  completed?: boolean;
  priority?: string;
  category?: string;
  importance?: boolean;
  urgency?: boolean;
  search?: string;
  projectId?: number;
  objectiveId?: number;
  okrId?: number;
  planId?: number;
  sortBy?: 'title' | 'createdAt' | 'priority' | 'position' | 'duration' | 'category';
  sortOrder?: 'asc' | 'desc';
}

export interface TaskStats {
  total: number;
  completed: number;
  pending: number;
  highPriority: number;
  importantUrgent: number;
  importantNotUrgent: number;
  notImportantUrgent: number;
  notImportantNotUrgent: number;
}

// AI Recommendation specific types
export interface AIRecommendationRequest {
  taskId: number;
  includeReasoning?: boolean;
  forceRegenerate?: boolean;
}

export interface AIRecommendationResponse {
  id: number;
  taskId: number;
  category: string;
  recommendedTime: string;
  confidence: number;
  reasoning?: string;
  // Enhanced Signal Layer fields
  signalType?: SignalType;
  recommendedDuration?: number;
  breakRecommendation?: string;
  loadWarning?: string;
  importanceFlag?: boolean;
  urgencyFlag?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BulkAIRecommendationRequest {
  taskIds: number[];
  includeReasoning?: boolean;
  forceRegenerate?: boolean;
}

export interface BulkAIRecommendationResponse {
  recommendations: AIRecommendationResponse[];
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  errors: Array<{
    taskId: number;
    error: string;
  }>;
}

export interface UserWorkPreferencesRequest {
  deepWorkStartTime?: string;
  deepWorkEndTime?: string;
  creativeWorkStartTime?: string;
  creativeWorkEndTime?: string;
  reflectiveWorkStartTime?: string;
  reflectiveWorkEndTime?: string;
  executiveWorkStartTime?: string;
  executiveWorkEndTime?: string;
}

export interface UserWorkPreferencesResponse {
  deepWorkStartTime: string;
  deepWorkEndTime: string;
  creativeWorkStartTime: string;
  creativeWorkEndTime: string;
  reflectiveWorkStartTime: string;
  reflectiveWorkEndTime: string;
  executiveWorkStartTime: string;
  executiveWorkEndTime: string;
  updatedAt: Date;
}

// Today's tasks with AI recommendations
export interface TodayTaskResponse {
  id: number;
  title: string;
  description?: string;
  duration: number;
  priority: string;
  importance: boolean;
  urgency: boolean;
  dueDate: Date;
  aiRecommendation?: AIRecommendationResponse;
  aiRecommendationStatus: 'available' | 'generating' | 'failed';
  rank: number;
}

export interface TodayTasksResponse {
  tasks: TodayTaskResponse[];
  total: number;
  generatedRecommendations: number;
  failedRecommendations: number;
}

// Bulk task creation types
export interface BulkTaskItem {
  title: string;
  category: string;
  duration: number;
  priority: string;
  dueDate?: string; // Optional, will be ignored - dueDate is derived from OKR/Objective endDate
}

export interface BulkTaskRequest {
  tasks: BulkTaskItem[];
  projectId?: number;
  objectiveId?: number;
  okrId?: number;
}

export interface BulkTaskResponse {
  tasks: TaskResponse[];
  message: string;
}

// Batch update types
export interface BatchUpdateTaskItem {
  id: number;
  title?: string;
  description?: string;
  category?: string;
  duration?: number;
  priority?: string;
  position?: number;
  completed?: boolean;
  importance?: boolean;
  urgency?: boolean;
  // Signal Layer fields
  isHighLeverage?: boolean;
  advancesKeyResults?: boolean;
  dueDate?: Date;
  projectId?: number;
  objectiveId?: number;
  okrId?: number;
  planId?: number;
}

export interface BatchUpdateTaskRequest {
  tasks: BatchUpdateTaskItem[];
}

export interface BatchUpdateTaskResponse {
  success: boolean;
  updated: number;
  tasks: TaskResponse[];
}
