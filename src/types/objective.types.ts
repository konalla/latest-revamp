export interface CreateObjectiveRequest {
  name: string;
  description?: string;
  status?: string;
  color?: string;
  start_date?: Date;
  end_date?: Date;
  // Support both camelCase (frontend) and snake_case (database) field names
  startDate?: Date | string;
  endDate?: Date | string;
  position?: number;
  projectId?: number;
}

export interface UpdateObjectiveRequest {
  name?: string;
  description?: string;
  status?: string;
  color?: string;
  start_date?: Date;
  end_date?: Date;
  // Support both camelCase (frontend) and snake_case (database) field names
  startDate?: Date | string;
  endDate?: Date | string;
  position?: number;
  projectId?: number;
}

export interface ObjectiveResponse {
  id: number;
  name: string;
  description?: string;
  status: string;
  color: string;
  start_date: Date;
  end_date?: Date;
  created_at: Date;
  position: number;
  userId: number;
  projectId?: number;
  user?: {
    id: number;
    name: string;
    email: string;
  };
  project?: {
    id: number;
    name: string;
  };
  plans?: {
    id: number;
    name: string;
    status: string;
    project: {
      id: number;
      name: string;
    };
  }[];
}

export interface ObjectiveListResponse {
  objectives: ObjectiveResponse[];
  total: number;
}

export interface ObjectiveQueryParams {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sortBy?: 'name' | 'created_at' | 'start_date' | 'end_date' | 'position';
  sortOrder?: 'asc' | 'desc';
}
