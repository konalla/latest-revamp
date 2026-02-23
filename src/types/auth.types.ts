export interface LoginRequest {
  identifier: string; // Can be email or username
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
  name: string;
  referralCode?: string; // Optional referral code for signup
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
  needsPaymentSetup?: boolean; // Flag to indicate if user needs to set up payment method (for new registrations)
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
