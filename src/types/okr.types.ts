export interface CreateOkrRequest {
  title: string;
  description?: string;
  status?: string;
  targetValue: number;
  currentValue?: number;
  startDate?: Date;
  endDate?: Date;
  position?: number;
  confidenceScore?: number;
  keyResults?: any[];
  objectiveId: number;
}

export interface UpdateOkrRequest {
  title?: string;
  description?: string;
  status?: string;
  targetValue?: number;
  currentValue?: number;
  startDate?: Date;
  endDate?: Date;
  position?: number;
  confidenceScore?: number;
  keyResults?: any[];
}

export interface UpdateOkrProgressRequest {
  currentValue: number;
  confidenceScore?: number;
  progressUpdate?: {
    date: Date;
    value: number;
    note?: string;
  };
}

export interface OkrResponse {
  id: number;
  title: string;
  description?: string;
  status: string;
  targetValue: number;
  currentValue: number;
  startDate: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  userId: number;
  objectiveId: number;
  position: number;
  confidenceScore: number;
  keyResults: any[];
  progressHistory: any[];
  user?: {
    id: number;
    name: string;
    email: string;
  };
  objective?: {
    id: number;
    name: string;
    projectId: number;
    project?: {
      id: number;
      name: string;
    };
  };
}

export interface OkrListResponse {
  okrs: OkrResponse[];
  total: number;
}

export interface OkrQueryParams {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sortBy?: 'title' | 'createdAt' | 'startDate' | 'endDate' | 'position' | 'currentValue';
  sortOrder?: 'asc' | 'desc';
}

export interface OkrStats {
  total: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  averageProgress: number;
  averageConfidenceScore: number;
}
