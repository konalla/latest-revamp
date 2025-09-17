export interface CreateProjectRequest {
  name: string;
  description?: string;
  status?: string;
  color?: string;
  icon?: string;
  startDate?: Date;
  endDate?: Date;
  is_private?: boolean;
  visibility?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  status?: string;
  color?: string;
  icon?: string;
  startDate?: Date;
  endDate?: Date;
  is_private?: boolean;
  visibility?: string;
}

export interface ProjectResponse {
  id: number;
  name: string;
  description?: string;
  status?: string;
  color: string;
  icon?: string;
  startDate: Date;
  endDate?: Date;
  createdAt: Date;
  userId: number;
  is_private: boolean;
  visibility: string;
}

export interface ProjectListResponse {
  projects: ProjectResponse[];
  total: number;
}

export interface ProjectQueryParams {
  page?: number;
  limit?: number;
  status?: string;
  visibility?: string;
  search?: string;
}
