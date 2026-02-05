/**
 * Session Cache Service
 *
 * Provides Redis-based caching for focus session data to reduce database queries
 * and improve performance. Includes distributed locking for atomic operations.
 *
 * Features:
 * - Session data caching with TTL
 * - Timer state management for horizontal scaling
 * - Task data caching
 * - Distributed locks for race condition prevention
 * - Automatic fallback to database on cache miss
 *
 * @module services/session-cache
 */

import redisClient from "../config/redis.js";
import prisma from "../config/prisma.js";

// ============================================================================
// Constants
// ============================================================================

/** Cache key prefixes for different data types */
const CACHE_PREFIX = {
  SESSION: "focus:session:",
  SESSION_STATE: "focus:state:",
  TASKS: "focus:tasks:",
  USER_SESSION: "focus:user:",
  LOCK: "lock:session:",
} as const;

/** TTL values in seconds for different cache types */
const TTL = {
  SESSION: 60 * 30, // 30 minutes
  SESSION_STATE: 60 * 60, // 1 hour
  TASKS: 60 * 60 * 2, // 2 hours
  USER_SESSION: 60 * 30, // 30 minutes
  LOCK: 5, // 5 seconds max lock
} as const;

// ============================================================================
// Types
// ============================================================================

/** Timer state status */
export type TimerStatus = "active" | "paused" | "completed";

/** Session intention data structure */
export interface SessionIntention {
  taskIds?: number[];
  completedTasks?: number[];
  category?: string;
  totalPauseDuration?: number;
  elapsedTime?: number;
  scheduledDuration?: number;
}

/** Cached timer state for a session (stored in Redis for horizontal scaling) */
export interface CachedSessionState {
  sessionId: number;
  userId: number;
  startTime: string; // ISO string for JSON serialization
  pausedAt: string | null;
  resumedAt: string | null;
  totalPauseDuration: number;
  scheduledDuration: number;
  status: TimerStatus;
  lastDbSync: number; // Unix timestamp
}

/** Cached session data from database */
export interface CachedSession {
  id: number;
  userId: number;
  sessionType: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  pausedAt: string | null;
  resumedAt: string | null;
  duration: number | null;
  intention: SessionIntention | null;
}

/** Cached task data */
export interface CachedTask {
  id: number;
  title: string;
  category: string;
  duration: number;
  completed: boolean;
}

/** Result of atomic task update operation */
export interface AtomicUpdateResult {
  completedTasks: number[];
  success: boolean;
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Safely parse JSON with type guard
 */
function safeJsonParse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Generate a unique lock value for distributed locking
 */
function generateLockValue(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Check if Redis is available for operations
 */
function isRedisAvailable(): boolean {
  return redisClient.status === "ready";
}

// ============================================================================
// Service Class
// ============================================================================

/**
 * Session Cache Service
 *
 * Provides caching layer between the application and database
 * with support for distributed state management.
 */
export class SessionCacheService {
  // ==========================================================================
  // Session Caching
  // ==========================================================================

  /**
   * Get session from cache or database
   * @param sessionId - The session ID to fetch
   * @returns Cached session data or null if not found
   */
  async getSession(sessionId: number): Promise<CachedSession | null> {
    const cacheKey = `${CACHE_PREFIX.SESSION}${sessionId}`;

    try {
      if (isRedisAvailable()) {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          const parsed = safeJsonParse<CachedSession>(cached);
          if (parsed) return parsed;
        }
      }

      return await this.fetchAndCacheSession(sessionId, cacheKey);
    } catch (error) {
      console.error(`[SessionCache] Error getting session ${sessionId}:`, error);
      return this.fetchSessionFromDb(sessionId);
    }
  }

  /**
   * Fetch session from database and cache it
   */
  private async fetchAndCacheSession(
    sessionId: number,
    cacheKey: string
  ): Promise<CachedSession | null> {
    const session = await prisma.focusSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) return null;

    const cachedSession = this.mapSessionToCache(session);

    if (isRedisAvailable()) {
      await redisClient
        .setex(cacheKey, TTL.SESSION, JSON.stringify(cachedSession))
        .catch((err) => console.error("[SessionCache] Cache write error:", err));
    }

    return cachedSession;
  }

  /**
   * Fetch session directly from database (fallback)
   */
  private async fetchSessionFromDb(sessionId: number): Promise<CachedSession | null> {
    const session = await prisma.focusSession.findUnique({
      where: { id: sessionId },
    });

    return session ? this.mapSessionToCache(session) : null;
  }

  /**
   * Map database session to cached session format
   */
  private mapSessionToCache(session: {
    id: number;
    userId: number;
    sessionType: string;
    status: string;
    startedAt: Date;
    endedAt: Date | null;
    pausedAt: Date | null;
    resumedAt: Date | null;
    duration: number | null;
    intention: unknown;
  }): CachedSession {
    return {
      id: session.id,
      userId: session.userId,
      sessionType: session.sessionType,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      pausedAt: session.pausedAt?.toISOString() ?? null,
      resumedAt: session.resumedAt?.toISOString() ?? null,
      duration: session.duration,
      intention: session.intention as SessionIntention | null,
    };
  }

  /**
   * Invalidate session cache
   * @param sessionId - The session ID to invalidate
   */
  async invalidateSession(sessionId: number): Promise<void> {
    if (!isRedisAvailable()) return;

    try {
      await redisClient.del(`${CACHE_PREFIX.SESSION}${sessionId}`);
    } catch (error) {
      console.error(`[SessionCache] Error invalidating session ${sessionId}:`, error);
    }
  }

  // ==========================================================================
  // Timer State Management (for horizontal scaling)
  // ==========================================================================

  /**
   * Get session timer state from Redis
   * @param sessionId - The session ID
   * @returns Timer state or null if not found
   */
  async getSessionState(sessionId: number): Promise<CachedSessionState | null> {
    if (!isRedisAvailable()) return null;

    const cacheKey = `${CACHE_PREFIX.SESSION_STATE}${sessionId}`;

    try {
      const cached = await redisClient.get(cacheKey);
      if (!cached) return null;

      return safeJsonParse<CachedSessionState>(cached);
    } catch (error) {
      console.error(`[SessionCache] Error getting session state ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Save session timer state to Redis
   * @param state - The timer state to save
   */
  async setSessionState(state: CachedSessionState): Promise<void> {
    if (!isRedisAvailable()) return;

    const cacheKey = `${CACHE_PREFIX.SESSION_STATE}${state.sessionId}`;

    try {
      await redisClient.setex(cacheKey, TTL.SESSION_STATE, JSON.stringify(state));
    } catch (error) {
      console.error(`[SessionCache] Error setting session state ${state.sessionId}:`, error);
    }
  }

  /**
   * Delete session timer state from Redis
   * @param sessionId - The session ID
   */
  async deleteSessionState(sessionId: number): Promise<void> {
    if (!isRedisAvailable()) return;

    try {
      await redisClient.del(`${CACHE_PREFIX.SESSION_STATE}${sessionId}`);
    } catch (error) {
      console.error(`[SessionCache] Error deleting session state ${sessionId}:`, error);
    }
  }

  /**
   * Get all active session states (for server startup/recovery)
   * @returns Array of active session states
   */
  async getAllActiveSessionStates(): Promise<CachedSessionState[]> {
    if (!isRedisAvailable()) return [];

    try {
      const keys = await redisClient.keys(`${CACHE_PREFIX.SESSION_STATE}*`);
      if (keys.length === 0) return [];

      const states: CachedSessionState[] = [];

      // Use pipeline for better performance
      const pipeline = redisClient.pipeline();
      keys.forEach((key) => pipeline.get(key));
      const results = await pipeline.exec();

      if (results) {
        for (const [err, value] of results) {
          if (!err && typeof value === "string") {
            const parsed = safeJsonParse<CachedSessionState>(value);
            if (parsed) states.push(parsed);
          }
        }
      }

      return states;
    } catch (error) {
      console.error("[SessionCache] Error getting all session states:", error);
      return [];
    }
  }

  // ==========================================================================
  // Task Caching
  // ==========================================================================

  /**
   * Get tasks from cache or database
   * @param taskIds - Array of task IDs to fetch
   * @returns Array of cached tasks
   */
  async getTasks(taskIds: number[]): Promise<CachedTask[]> {
    if (taskIds.length === 0) return [];

    const sortedIds = [...taskIds].sort((a, b) => a - b);
    const cacheKey = `${CACHE_PREFIX.TASKS}${sortedIds.join(",")}`;

    try {
      if (isRedisAvailable()) {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          const parsed = safeJsonParse<CachedTask[]>(cached);
          if (parsed) return parsed;
        }
      }

      return await this.fetchAndCacheTasks(taskIds, cacheKey);
    } catch (error) {
      console.error("[SessionCache] Error getting tasks:", error);
      return this.fetchTasksFromDb(taskIds);
    }
  }

  /**
   * Fetch tasks from database and cache them
   */
  private async fetchAndCacheTasks(taskIds: number[], cacheKey: string): Promise<CachedTask[]> {
    const tasks = await this.fetchTasksFromDb(taskIds);

    if (isRedisAvailable() && tasks.length > 0) {
      await redisClient
        .setex(cacheKey, TTL.TASKS, JSON.stringify(tasks))
        .catch((err) => console.error("[SessionCache] Task cache write error:", err));
    }

    return tasks;
  }

  /**
   * Fetch tasks directly from database
   */
  private async fetchTasksFromDb(taskIds: number[]): Promise<CachedTask[]> {
    return prisma.task.findMany({
      where: { id: { in: taskIds } },
      select: {
        id: true,
        title: true,
        category: true,
        duration: true,
        completed: true,
      },
    });
  }

  /**
   * Invalidate tasks cache for specific task IDs
   * @param taskIds - Array of task IDs to invalidate
   */
  async invalidateTasks(taskIds: number[]): Promise<void> {
    if (!isRedisAvailable() || taskIds.length === 0) return;

    try {
      const keys = await redisClient.keys(`${CACHE_PREFIX.TASKS}*`);

      const keysToDelete = keys.filter((key) =>
        taskIds.some((taskId) => key.includes(taskId.toString()))
      );

      if (keysToDelete.length > 0) {
        await redisClient.del(...keysToDelete);
      }
    } catch (error) {
      console.error("[SessionCache] Error invalidating tasks:", error);
    }
  }

  // ==========================================================================
  // User Session Mapping
  // ==========================================================================

  /**
   * Get active session ID for a user from cache
   * @param userId - The user ID
   * @returns Session ID or null if not found
   */
  async getUserActiveSessionId(userId: number): Promise<number | null> {
    if (!isRedisAvailable()) return null;

    const cacheKey = `${CACHE_PREFIX.USER_SESSION}${userId}`;

    try {
      const cached = await redisClient.get(cacheKey);
      return cached ? parseInt(cached, 10) : null;
    } catch (error) {
      console.error(`[SessionCache] Error getting user session ${userId}:`, error);
      return null;
    }
  }

  /**
   * Set active session ID for a user
   * @param userId - The user ID
   * @param sessionId - The session ID
   */
  async setUserActiveSessionId(userId: number, sessionId: number): Promise<void> {
    if (!isRedisAvailable()) return;

    const cacheKey = `${CACHE_PREFIX.USER_SESSION}${userId}`;

    try {
      await redisClient.setex(cacheKey, TTL.USER_SESSION, sessionId.toString());
    } catch (error) {
      console.error(`[SessionCache] Error setting user session ${userId}:`, error);
    }
  }

  /**
   * Clear active session for a user
   * @param userId - The user ID
   */
  async clearUserActiveSession(userId: number): Promise<void> {
    if (!isRedisAvailable()) return;

    try {
      await redisClient.del(`${CACHE_PREFIX.USER_SESSION}${userId}`);
    } catch (error) {
      console.error(`[SessionCache] Error clearing user session ${userId}:`, error);
    }
  }

  // ==========================================================================
  // Atomic Operations with Distributed Locking
  // ==========================================================================

  /**
   * Atomically update completed tasks with distributed locking
   *
   * This prevents race conditions when multiple requests update the same session.
   * Uses Redis-based distributed lock with Prisma transaction.
   *
   * @param sessionId - The session ID
   * @param taskId - The task ID to update
   * @param completed - Whether the task is completed
   * @returns Result containing the updated completed tasks array
   */
  async atomicUpdateCompletedTasks(
    sessionId: number,
    taskId: number,
    completed: boolean
  ): Promise<AtomicUpdateResult> {
    const lockKey = `${CACHE_PREFIX.LOCK}${sessionId}`;
    const lockValue = generateLockValue();

    try {
      // Acquire distributed lock
      const lockAcquired = await this.acquireLock(lockKey, lockValue);
      if (!lockAcquired) {
        return {
          completedTasks: [],
          success: false,
          error: "Could not acquire lock. Please try again.",
        };
      }

      try {
        // Perform atomic update within transaction
        const completedTasks = await prisma.$transaction(async (tx) => {
          const session = await tx.focusSession.findUnique({
            where: { id: sessionId },
            select: { intention: true },
          });

          if (!session) {
            throw new Error("Session not found");
          }

          const intention = (session.intention as SessionIntention) || {};
          const tasks: number[] = intention.completedTasks || [];

          // Update completed tasks array
          if (completed && !tasks.includes(taskId)) {
            tasks.push(taskId);
          } else if (!completed) {
            const index = tasks.indexOf(taskId);
            if (index > -1) tasks.splice(index, 1);
          }

          // Save updated intention
          await tx.focusSession.update({
            where: { id: sessionId },
            data: {
              intention: { ...intention, completedTasks: tasks },
            },
          });

          return tasks;
        });

        // Invalidate cache after successful update
        await this.invalidateSession(sessionId);

        return { completedTasks, success: true };
      } finally {
        // Always release lock
        await this.releaseLock(lockKey, lockValue);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[SessionCache] Atomic update error for session ${sessionId}:`, error);
      return { completedTasks: [], success: false, error: message };
    }
  }

  /**
   * Acquire a distributed lock
   */
  private async acquireLock(lockKey: string, lockValue: string): Promise<boolean> {
    if (!isRedisAvailable()) return true; // Allow operation without Redis

    const result = await redisClient.set(lockKey, lockValue, "EX", TTL.LOCK, "NX");
    if (result) return true;

    // Retry once after short delay
    await new Promise((resolve) => setTimeout(resolve, 100));
    const retryResult = await redisClient.set(lockKey, lockValue, "EX", TTL.LOCK, "NX");
    return retryResult !== null;
  }

  /**
   * Release a distributed lock (only if we own it)
   */
  private async releaseLock(lockKey: string, lockValue: string): Promise<void> {
    if (!isRedisAvailable()) return;

    try {
      const currentValue = await redisClient.get(lockKey);
      if (currentValue === lockValue) {
        await redisClient.del(lockKey);
      }
    } catch (error) {
      console.error("[SessionCache] Error releasing lock:", error);
    }
  }
}

// Export singleton instance
export const sessionCacheService = new SessionCacheService();
export default sessionCacheService;
