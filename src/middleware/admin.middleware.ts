import type { Request, Response, NextFunction } from "express";

/**
 * Middleware to require admin role
 * Must be used after authenticateToken middleware
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ message: "Admin access required" });
  }
  
  next();
};



