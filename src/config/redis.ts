/**
 * Redis Configuration Module
 *
 * Provides Redis client instances for:
 * - General caching and state management
 * - Socket.IO adapter (pub/sub for horizontal scaling)
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Graceful shutdown support
 * - Health check utilities
 *
 * @module config/redis
 */

import Redis from "ioredis";
import type { RedisOptions } from "ioredis";

/** Redis connection status types */
type RedisStatus = "connecting" | "connect" | "ready" | "close" | "reconnecting" | "end" | "wait";

/** Environment-based Redis configuration */
interface RedisEnvConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
}

/**
 * Parse Redis configuration from environment variables
 */
function getRedisEnvConfig(): RedisEnvConfig {
  return {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
    db: parseInt(process.env.REDIS_DB || "0", 10),
  };
}

/**
 * Create Redis connection options with retry strategy
 */
function createRedisOptions(): RedisOptions {
  const envConfig = getRedisEnvConfig();

  return {
    ...envConfig,
    // Required for Socket.IO adapter compatibility
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    // Exponential backoff retry strategy
    retryStrategy: (times: number): number | null => {
      const MAX_RETRIES = 10;
      const MAX_DELAY_MS = 3000;

      if (times > MAX_RETRIES) {
        console.error("[Redis] Max retry attempts reached, stopping retries");
        return null;
      }

      const delay = Math.min(times * 100, MAX_DELAY_MS);
      console.log(`[Redis] Retrying connection in ${delay}ms (attempt ${times}/${MAX_RETRIES})`);
      return delay;
    },
    // Connection timeout
    connectTimeout: 10000,
    // Command timeout
    commandTimeout: 5000,
  };
}

/**
 * Setup event handlers for a Redis client
 */
function setupClientEventHandlers(client: Redis, clientName: string): void {
  client.on("connect", () => {
    console.log(`[Redis] ${clientName} connected`);
  });

  client.on("ready", () => {
    console.log(`[Redis] ${clientName} ready`);
  });

  client.on("error", (err: Error) => {
    console.error(`[Redis] ${clientName} error:`, err.message);
  });

  client.on("close", () => {
    console.log(`[Redis] ${clientName} connection closed`);
  });

  client.on("reconnecting", () => {
    console.log(`[Redis] ${clientName} reconnecting...`);
  });
}

// Create Redis client instances
const redisOptions = createRedisOptions();

/** Main Redis client for general operations (caching, state management) */
export const redisClient = new Redis(redisOptions);

/** Publisher client for Socket.IO adapter */
export const redisPub = new Redis(redisOptions);

/** Subscriber client for Socket.IO adapter */
export const redisSub = new Redis(redisOptions);

// Setup event handlers for all clients
setupClientEventHandlers(redisClient, "Main client");
setupClientEventHandlers(redisPub, "Publisher client");
setupClientEventHandlers(redisSub, "Subscriber client");

/**
 * Gracefully close all Redis connections
 * Should be called during application shutdown
 */
export async function closeRedisConnections(): Promise<void> {
  console.log("[Redis] Closing connections...");

  const closePromises = [
    redisClient.quit().catch((err) => console.error("[Redis] Error closing main client:", err)),
    redisPub.quit().catch((err) => console.error("[Redis] Error closing publisher:", err)),
    redisSub.quit().catch((err) => console.error("[Redis] Error closing subscriber:", err)),
  ];

  await Promise.all(closePromises);
  console.log("[Redis] All connections closed");
}

/**
 * Check if all Redis clients are connected and ready
 */
export function isRedisConnected(): boolean {
  const isReady = (status: RedisStatus): boolean => status === "ready";

  return (
    isReady(redisClient.status as RedisStatus) &&
    isReady(redisPub.status as RedisStatus) &&
    isReady(redisSub.status as RedisStatus)
  );
}

/**
 * Get Redis connection status for health checks
 */
export function getRedisStatus(): {
  main: RedisStatus;
  publisher: RedisStatus;
  subscriber: RedisStatus;
  isHealthy: boolean;
} {
  return {
    main: redisClient.status as RedisStatus,
    publisher: redisPub.status as RedisStatus,
    subscriber: redisSub.status as RedisStatus,
    isHealthy: isRedisConnected(),
  };
}

export default redisClient;
