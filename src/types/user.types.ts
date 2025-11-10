export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface CreateUserRequest {
  username: string;
  name: string;
  email: string;
  password: string;
  language?: string; // Optional language parameter
  role?: string;
  phone_number?: string;
  company_name?: string;
  website?: string;
  profile_photo_url?: string;
  job_title?: string;
  industry?: string;
  bio?: string;
  timezone?: string;
  linkedin_url?: string;
  website_url?: string;
  secondary_social_url?: string;
  secondary_social_type?: string;
  preferred_working_hours?: any;
  communication_preference?: string;
  primary_work_focus?: string;
}
