export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
  name: string;
  phone_number?: string;
  referralCode?: string;
  profile?: {
    professionalIdentity?: string[];
    primaryRole?: string[];
    country?: string;
    workingHours?: string;
    productivityScore?: number;
    iqnitiGoal?: string[];
  };
}

export interface AuthResponse {
  user: {
    id: number;
    email: string;
    username: string;
    name: string;
    role: string;
    profile_photo_url?: string | null;
  };
  token: string;
  message: string;
  needsPaymentSetup?: boolean;
}

export interface CheckAvailabilityRequest {
  field: "email" | "username";
  value: string;
}

export interface CheckAvailabilityResponse {
  available: boolean;
  field: string;
}

export interface UserJWTPayload {
  userId: number;
  email: string;
  role: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  message: string;
}
