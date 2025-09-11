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
  projectId?: number;
  objectiveId?: number;
  okrId?: number;
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
  projectId?: number;
  objectiveId?: number;
  okrId?: number;
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
  userId: number;
  projectId?: number;
  objectiveId?: number;
  okrId?: number;
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
