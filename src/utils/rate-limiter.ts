/**
 * Rate Limiter Module
 *
 * Provides distributed rate limiting for WebSocket events using Redis.
 * Falls back to in-memory rate limiting when Redis is unavailable.
 *
 * Features:
 * - Sliding window rate limiting algorithm
 * - Per-user, per-event-type rate limits
 * - Configurable limits for different event types
 * - Automatic Redis fallback to in-memory
 *
 * @module utils/rate-limiter
 */

import redisClient from "../config/redis.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Rate limit configuration for a specific event type
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed in the time window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

/**
 * Result of a rate limit check
 */
export interface RateLimitResult {
  /** Whether the request is rate limited */
  limited: boolean;
  /** Number of remaining requests in current window */
  remaining: number;
  /** Timestamp when the rate limit resets (Unix ms) */
  resetAt: number;
}

/**
 * Event types that support rate limiting
 */
export type RateLimitableEvent =
  | "sync_timer"
  | "update_task_progress"
  | "join_focus_session"
  | "leave_focus_session"
  | "default";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Default rate limit configurations by event type
 *
 * These values are tuned for typical usage patterns:
 * - Timer sync: Frequent but bounded
 * - Task updates: Moderate frequency
 * - Join/leave: Infrequent operations
 */
const RATE_LIMITS: Record<RateLimitableEvent, RateLimitConfig> = {
  // Timer sync - allow reasonable syncing but prevent spam
  sync_timer: {
    maxRequests: 10,
    windowMs: 10_000, // 10 requests per 10 seconds
  },
  // Task progress updates - moderate rate
  update_task_progress: {
    maxRequests: 20,
    windowMs: 60_000, // 20 requests per minute
  },
  // Join/leave operations - very permissive
  join_focus_session: {
    maxRequests: 10,
    windowMs: 60_000, // 10 per minute
  },
  leave_focus_session: {
    maxRequests: 10,
    windowMs: 60_000, // 10 per minute
  },
  // Default for any other event
  default: {
    maxRequests: 30,
    windowMs: 60_000, // 30 per minute
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get rate limit config for an event type with fallback to default
 */
function getConfig(eventType: string): RateLimitConfig {
  return RATE_LIMITS[eventType as RateLimitableEvent] ?? RATE_LIMITS.default;
}

/**
 * Check if Redis is available for rate limiting operations
 */
function isRedisAvailable(): boolean {
  return redisClient.status === "ready";
}

/**
 * Generate a unique request identifier
 */
function generateRequestId(socketId?: string): string {
  return socketId ?? `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// In-Memory Rate Limiter (Fallback)
// ============================================================================

/**
 * In-memory rate limiter for fallback when Redis is unavailable
 *
 * Uses a sliding window approach with periodic cleanup.
 * Note: This does not support horizontal scaling.
 */
class InMemoryRateLimiter {
  private readonly requests: Map<string, number[]> = new Map();
  private readonly CLEANUP_PROBABILITY = 0.01; // 1% chance to cleanup on each request

  /**
   * Check if a request should be rate limited
   */
  check(key: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Get and filter timestamps
    let timestamps = this.requests.get(key) ?? [];
    timestamps = timestamps.filter((ts) => ts > windowStart);

    const limited = timestamps.length >= config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - timestamps.length);
    const firstTimestamp = timestamps[0];
    const resetAt = firstTimestamp !== undefined ? firstTimestamp + config.windowMs : now + config.windowMs;

    // Record request if not limited
    if (!limited) {
      timestamps.push(now);
      this.requests.set(key, timestamps);
    }

    // Probabilistic cleanup
    if (Math.random() < this.CLEANUP_PROBABILITY) {
      this.cleanup();
    }

    return { limited, remaining, resetAt };
  }

  /**
   * Clean up expired entries to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    const maxWindow = Math.max(...Object.values(RATE_LIMITS).map((c) => c.windowMs));

    for (const [key, timestamps] of this.requests.entries()) {
      const filtered = timestamps.filter((ts) => ts > now - maxWindow);
      if (filtered.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, filtered);
      }
    }
  }

  /**
   * Clear rate limit for a specific key (for testing/admin)
   */
  clear(key: string): void {
    this.requests.delete(key);
  }
}

const inMemoryLimiter = new InMemoryRateLimiter();

// ============================================================================
// Redis Rate Limiter
// ============================================================================

/**
 * Check rate limit using Redis sorted set (sliding window algorithm)
 */
async function checkRedisRateLimit(
  key: string,
  config: RateLimitConfig,
  requestId: string
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = config.windowMs;
  const windowSeconds = Math.ceil(windowMs / 1000);

  // Execute rate limit check atomically using pipeline
  const pipeline = redisClient.pipeline();

  // Remove entries outside the window
  pipeline.zremrangebyscore(key, 0, now - windowMs);

  // Count current entries
  pipeline.zcard(key);

  // Add current request
  pipeline.zadd(key, now.toString(), requestId);

  // Set key expiry
  pipeline.expire(key, windowSeconds + 1);

  const results = await pipeline.exec();

  if (!results) {
    throw new Error("Redis pipeline execution failed");
  }

  // Extract count from results (second command)
  const countResult = results[1];
  const count = countResult && !countResult[0] ? (countResult[1] as number) : 0;

  const limited = count >= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - count);
  const resetAt = now + windowMs;

  return { limited, remaining, resetAt };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if a request should be rate limited
 *
 * Uses Redis for distributed rate limiting when available,
 * falls back to in-memory rate limiting otherwise.
 *
 * @param userId - User ID making the request
 * @param eventType - Type of event being rate limited
 * @param socketId - Optional socket ID for request deduplication
 * @returns Whether the request is rate limited
 *
 * @example
 * ```typescript
 * const limited = await isRateLimited(userId, "sync_timer", socket.id);
 * if (limited) {
 *   socket.emit("error", { message: "Rate limit exceeded" });
 *   return;
 * }
 * ```
 */
export async function isRateLimited(
  userId: number,
  eventType: string,
  socketId?: string
): Promise<boolean> {
  const config = getConfig(eventType);
  const key = `ratelimit:${eventType}:${userId}`;
  const requestId = generateRequestId(socketId);

  try {
    if (!isRedisAvailable()) {
      const result = inMemoryLimiter.check(key, config);
      return result.limited;
    }

    const result = await checkRedisRateLimit(key, config, requestId);

    if (result.limited) {
      console.warn(
        `[RateLimiter] User ${userId} rate limited on ${eventType} ` +
          `(${config.maxRequests - result.remaining}/${config.maxRequests})`
      );
    }

    return result.limited;
  } catch (error) {
    console.error("[RateLimiter] Error checking rate limit, using fallback:", error);
    return inMemoryLimiter.check(key, config).limited;
  }
}

/**
 * Check rate limit and return detailed result
 *
 * @param userId - User ID making the request
 * @param eventType - Type of event being rate limited
 * @param socketId - Optional socket ID for request deduplication
 * @returns Detailed rate limit result
 */
export async function checkRateLimit(
  userId: number,
  eventType: string,
  socketId?: string
): Promise<RateLimitResult> {
  const config = getConfig(eventType);
  const key = `ratelimit:${eventType}:${userId}`;
  const requestId = generateRequestId(socketId);

  try {
    if (!isRedisAvailable()) {
      return inMemoryLimiter.check(key, config);
    }

    return await checkRedisRateLimit(key, config, requestId);
  } catch (error) {
    console.error("[RateLimiter] Error checking rate limit:", error);
    return inMemoryLimiter.check(key, config);
  }
}

/**
 * Create a rate-limited wrapper for an event handler
 *
 * @param eventType - Type of event being rate limited
 * @param handler - The handler function to wrap
 * @returns Wrapped handler that enforces rate limiting
 *
 * @example
 * ```typescript
 * const rateLimitedHandler = createRateLimitedHandler(
 *   "sync_timer",
 *   async (data, userId, socketId) => {
 *     // Handle the event
 *   }
 * );
 * ```
 */
export function createRateLimitedHandler<TData>(
  eventType: string,
  handler: (data: TData, userId: number, socketId: string) => Promise<void>
): (data: TData, userId: number, socketId: string) => Promise<void> {
  return async (data: TData, userId: number, socketId: string): Promise<void> => {
    const limited = await isRateLimited(userId, eventType, socketId);

    if (limited) {
      throw new Error(`Rate limit exceeded for ${eventType}`);
    }

    return handler(data, userId, socketId);
  };
}

/**
 * Get remaining requests for a user on an event type
 *
 * @param userId - User ID to check
 * @param eventType - Type of event
 * @returns Number of remaining requests in current window
 */
export async function getRemainingRequests(userId: number, eventType: string): Promise<number> {
  const config = getConfig(eventType);
  const key = `ratelimit:${eventType}:${userId}`;

  try {
    if (!isRedisAvailable()) {
      return config.maxRequests;
    }

    const now = Date.now();

    // Clean up old entries and count current
    await redisClient.zremrangebyscore(key, 0, now - config.windowMs);
    const count = await redisClient.zcard(key);

    return Math.max(0, config.maxRequests - count);
  } catch (error) {
    console.error("[RateLimiter] Error getting remaining requests:", error);
    return config.maxRequests;
  }
}

/**
 * Clear rate limit for a specific user and event type
 *
 * Use for testing or admin purposes only.
 *
 * @param userId - User ID to clear
 * @param eventType - Type of event to clear
 */
export async function clearRateLimit(userId: number, eventType: string): Promise<void> {
  const key = `ratelimit:${eventType}:${userId}`;

  try {
    inMemoryLimiter.clear(key);

    if (isRedisAvailable()) {
      await redisClient.del(key);
    }
  } catch (error) {
    console.error("[RateLimiter] Error clearing rate limit:", error);
  }
}

/**
 * Get rate limit configuration for an event type
 *
 * @param eventType - Type of event
 * @returns Rate limit configuration
 */
export function getRateLimitConfig(eventType: string): Readonly<RateLimitConfig> {
  return Object.freeze({ ...getConfig(eventType) });
}
