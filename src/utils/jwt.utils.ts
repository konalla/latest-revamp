import jwt from "jsonwebtoken";
import type { UserJWTPayload } from "../types/auth.types.js";

// JWT_SECRET is required - no fallback for security
const JWT_SECRET: string = process.env.JWT_SECRET as string;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    "FATAL SECURITY ERROR: JWT_SECRET environment variable must be set and at least 32 characters long. " +
    "Generate one using: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
  );
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "3d";

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
