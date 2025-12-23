import dotenv from "dotenv";
dotenv.config();

import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import app from "./app.js";
import { FocusRoomWebSocketService } from "./services/focus-room-websocket.service.js";

const port = process.env.PORT || 3000;

// Create HTTP server
const httpServer = createServer(app);

// Setup Socket.io with explicit path for nginx proxy
const io = new SocketIOServer(httpServer, {
  path: "/socket.io/", // Explicit path for Socket.io (required for nginx proxy)
  cors: {
    origin: [
      "https://workspace.iqniti.com",
      "https://dashboard.iqniti.com",
      "http://workspace-detail.s3-website.eu-north-1.amazonaws.com",
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174",
      "http://127.0.0.1:5175",
    ],
    credentials: true,
    methods: ["GET", "POST"],
  },
});

// Initialize Focus Room WebSocket service
const focusRoomWebSocketService = new FocusRoomWebSocketService(io);

// Make WebSocket service available globally (for use in controllers)
(global as any).focusRoomWebSocketService = focusRoomWebSocketService;

httpServer.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`📡 WebSocket server ready`);
});
