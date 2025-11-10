import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.utils.js";
import type { UserJWTPayload } from "../types/auth.types.js";

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: UserJWTPayload;
    }
  }
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  try {
    const user = verifyToken(token) as any;
    // Normalize payload to ensure req.user.id is present even if token has userId
    const normalized = { ...user, id: user?.id ?? user?.userId };
    req.user = normalized;
    next();
  } catch (error) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};

// Optional middleware - doesn't fail if no token provided
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (token) {
    try {
      const user = verifyToken(token) as any;
      const normalized = { ...user, id: user?.id ?? user?.userId };
      req.user = normalized;
    } catch (error) {
      // Token exists but is invalid - continue without user
      req.user = undefined as any;
    }
  }

  next();
};
