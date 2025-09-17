export interface CreatePlanRequest {
  name: string;
  description?: string;
  status?: string;
  projectId: number;
  objectiveId: number;
}

export interface UpdatePlanRequest {
  name?: string;
  description?: string;
  status?: string;
}

export interface PlanResponse {
  id: number;
  name: string;
  description?: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  projectId: number;
  objectiveId: number;
  project?: {
    id: number;
    name: string;
    description?: string;
    color: string;
  };
  objective?: {
    id: number;
    name: string;
    description?: string;
    color: string;
  };
  okrs?: {
    id: number;
    title: string;
    status: string;
    currentValue: number;
    targetValue: number;
  }[];
  tasks?: {
    id: number;
    title: string;
    completed: boolean;
    priority: string;
    category: string;
  }[];
}

export interface PlanListResponse {
  plans: PlanResponse[];
  total: number;
}

export interface PlanQueryParams {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  projectId?: number;
  objectiveId?: number;
  sortBy?: 'name' | 'created_at' | 'updated_at' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface PlanStats {
  total: number;
  active: number;
  completed: number;
  paused: number;
  cancelled: number;
  totalOkrs: number;
  totalTasks: number;
  completedTasks: number;
}

export interface PlanWithDetails extends PlanResponse {
  okrCount: number;
  taskCount: number;
  completedTaskCount: number;
  progressPercentage: number;
}
