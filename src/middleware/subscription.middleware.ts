import type { Request, Response, NextFunction } from "express";
import { subscriptionService } from "../services/subscription.service.js";

/**
 * Middleware to check if user can perform write operations (create/edit/delete)
 * Blocks requests if subscription is expired or canceled
 */
export const requireWriteAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const access = await subscriptionService.canPerformWriteOperations(userId);

    if (!access.canWrite) {
      res.status(403).json({
        error: access.reason || "Write access denied",
        subscription: access.subscription,
      });
      return;
    }

    next();
  } catch (error: any) {
    console.error("Error checking write access:", error);
    res.status(500).json({ error: "Failed to check subscription access" });
  }
};

/**
 * Middleware to check if user can create tasks
 * Blocks task creation if task limit reached or subscription expired
 */
export const requireTaskCreationAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const access = await subscriptionService.canCreateTask(userId);

    if (!access.canCreate) {
      res.status(403).json({
        error: access.reason || "Task creation denied",
        tasksRemaining: access.tasksRemaining || 0,
        subscription: access.subscription,
      });
      return;
    }

    // Attach task access info to request for use in controller
    (req as any).taskAccess = {
      canCreate: access.canCreate,
      tasksRemaining: access.tasksRemaining,
      subscription: access.subscription,
    };

    next();
  } catch (error: any) {
    console.error("Error checking task creation access:", error);
    res.status(500).json({ error: "Failed to check task creation access" });
  }
};

/**
 * Middleware to increment task count after successful task creation
 * Should be called after task is created successfully
 */
export const incrementTaskCount = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (userId) {
      await subscriptionService.incrementTaskCount(userId);
    }
    next();
  } catch (error: any) {
    console.error("Error incrementing task count:", error);
    // Don't fail the request if task count increment fails
    next();
  }
};

