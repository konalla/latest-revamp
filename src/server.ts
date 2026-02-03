import dotenv from "dotenv";
dotenv.config();

import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import app from "./app.js";
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
});

// Initialize Focus Room WebSocket service
const focusRoomWebSocketService = new FocusRoomWebSocketService(io);

// Initialize Focus Session WebSocket service
const focusSessionWebSocketService = new FocusSessionWebSocketService(io);

// Make WebSocket services available globally (for use in controllers)
global.focusRoomWebSocketService = focusRoomWebSocketService;
global.focusSessionWebSocketService = focusSessionWebSocketService;

// Initialize Focus Room Scheduler service
const focusRoomSchedulerService = new FocusRoomSchedulerService(focusRoomWebSocketService);

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
});
