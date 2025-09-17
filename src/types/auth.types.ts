export interface LoginRequest {
  identifier: string; // Can be email or username
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
  name: string;
}

export interface AuthResponse {
  user: {
    id: number;
    email: string;
    username: string;
    name: string;
    role: string;
  };
  token: string;
  message: string;
}

export interface JWTPayload {
  userId: number;
  email: string;
  role: string;
}
