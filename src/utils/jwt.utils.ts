import jwt from "jsonwebtoken";
import type { UserJWTPayload } from "../types/auth.types.js";

const JWT_SECRET: string = process.env.JWT_SECRET || "your-super-secret-jwt-key-change-this-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export const generateToken = (payload: UserJWTPayload): string => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  } as jwt.SignOptions);
};

export const verifyToken = (token: string): UserJWTPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as UserJWTPayload;
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
};

export const decodeToken = (token: string): UserJWTPayload | null => {
  try {
    return jwt.decode(token) as UserJWTPayload;
  } catch (error) {
    return null;
  }
};
