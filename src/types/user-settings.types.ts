export interface UserSettings {
  id: number;
  language: string;
  createdAt: Date;
  updatedAt: Date;
  userId: number;
}

export interface CreateUserSettingsRequest {
  language?: string;
}

export interface UpdateUserSettingsRequest {
  language?: string;
}
