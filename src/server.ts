import dotenv from "dotenv";
dotenv.config();

import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import app from "./app.js";
import { redisPub, redisSub, closeRedisConnections, isRedisConnected } from "./config/redis.js";
import { FocusRoomWebSocketService } from "./services/focus-room-websocket.service.js";
import { FocusSessionWebSocketService } from "./services/focus-session-websocket.service.js";
import { FocusRoomSchedulerService } from "./services/focus-room-scheduler.service.js";
import "./types/global.types.js"; // Load global type definitions

const port = process.env.PORT || 3000;

// Create HTTP server
const httpServer = createServer(app);

// Setup Socket.io with explicit path for nginx proxy
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map(origin => origin.trim())
  : ["http://localhost:5173"]; // Default fallback for development

const io = new SocketIOServer(httpServer, {
  path: "/socket.io/", // Explicit path for Socket.io (required for nginx proxy)
  cors: {
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST"],
  },
  // Connection settings for production
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ["websocket", "polling"],
  allowUpgrades: true,
});

// Setup Redis adapter for horizontal scaling
// This allows multiple server instances to share WebSocket connections
async function setupRedisAdapter() {
  try {
    // Wait for Redis connections to be ready
    const maxWaitTime = 10000; // 10 seconds
    const startTime = Date.now();

    while (!isRedisConnected() && Date.now() - startTime < maxWaitTime) {
      console.log("[Server] Waiting for Redis connections...");
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (isRedisConnected()) {
      io.adapter(createAdapter(redisPub, redisSub));
      console.log("[Server] Redis adapter configured for Socket.IO - horizontal scaling enabled");
    } else {
      console.warn("[Server] Redis not available - running in single-server mode");
      console.warn("[Server] WebSocket connections will not be shared across instances");
    }
  } catch (error) {
    console.error("[Server] Failed to setup Redis adapter:", error);
    console.warn("[Server] Continuing without Redis adapter - single-server mode");
  }
}

// Initialize Focus Room WebSocket service
let focusRoomWebSocketService: FocusRoomWebSocketService;
let focusSessionWebSocketService: FocusSessionWebSocketService;
let focusRoomSchedulerService: FocusRoomSchedulerService;

async function startServer() {
  // Setup Redis adapter first
  await setupRedisAdapter();

  // Initialize WebSocket services
  focusRoomWebSocketService = new FocusRoomWebSocketService(io);
  focusSessionWebSocketService = new FocusSessionWebSocketService(io);

  // Make WebSocket services available globally (for use in controllers)
  global.focusRoomWebSocketService = focusRoomWebSocketService;
  global.focusSessionWebSocketService = focusSessionWebSocketService;

  // Initialize Focus Room Scheduler service
  focusRoomSchedulerService = new FocusRoomSchedulerService(focusRoomWebSocketService);

  // Start scheduler and reschedule missed sessions on startup
  focusRoomSchedulerService.start();
  focusRoomSchedulerService.rescheduleMissedSessions().catch((error) => {
    console.error("Error rescheduling missed sessions:", error);
  });

  // Restore active sessions on startup
  focusSessionWebSocketService.restoreActiveSessions().catch((error) => {
    console.error("Error restoring active focus sessions:", error);
  });

  httpServer.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
    console.log(`📡 WebSocket server ready`);
    console.log(`🔧 Instance ID: ${process.pid}`);
    if (isRedisConnected()) {
      console.log(`🔴 Redis connected - horizontal scaling enabled`);
    } else {
      console.log(`⚠️  Redis not connected - single-server mode`);
    }
  });
}

// Graceful shutdown handling
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    console.log(`[Server] Already shutting down, ignoring ${signal}`);
    return;
  }

  isShuttingDown = true;
  console.log(`\n[Server] ${signal} received, starting graceful shutdown...`);

  // Stop accepting new connections
  httpServer.close(() => {
    console.log("[Server] HTTP server closed");
  });

  // Give existing connections time to complete
  const shutdownTimeout = setTimeout(() => {
    console.error("[Server] Shutdown timeout reached, forcing exit");
    process.exit(1);
  }, 30000); // 30 second timeout

  try {
    // Cleanup WebSocket services
    if (focusSessionWebSocketService) {
      console.log("[Server] Cleaning up Focus Session WebSocket service...");
      await focusSessionWebSocketService.cleanup();
    }

    // Stop scheduler
    if (focusRoomSchedulerService) {
      console.log("[Server] Stopping scheduler...");
      focusRoomSchedulerService.stop();
    }

    // Close Socket.IO connections
    console.log("[Server] Closing Socket.IO connections...");
    await new Promise<void>((resolve) => {
      io.close(() => {
        console.log("[Server] Socket.IO connections closed");
        resolve();
      });
    });

    // Close Redis connections
    console.log("[Server] Closing Redis connections...");
    await closeRedisConnections();

    clearTimeout(shutdownTimeout);
    console.log("[Server] Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    console.error("[Server] Error during shutdown:", error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("[Server] Uncaught exception:", error);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[Server] Unhandled rejection at:", promise, "reason:", reason);
  // Don't exit on unhandled rejection, just log it
});

// Start the server
startServer().catch((error) => {
  console.error("[Server] Failed to start server:", error);
  process.exit(1);
});
