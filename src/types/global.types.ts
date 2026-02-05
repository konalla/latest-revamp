import type { FocusRoomWebSocketService } from "../services/focus-room-websocket.service.js";
import type { FocusSessionWebSocketService } from "../services/focus-session-websocket.service.js";

/**
 * Global type definitions for services available on the global object
 * These services are initialized in server.ts and made available globally
 * for use in controllers and other modules
 */
declare global {
  // eslint-disable-next-line no-var
  var focusRoomWebSocketService: FocusRoomWebSocketService | undefined;
  // eslint-disable-next-line no-var
  var focusSessionWebSocketService: FocusSessionWebSocketService | undefined;
}

export {};

