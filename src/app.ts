import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { ipKeyGenerator } from "express-rate-limit";
import path from "path";

// Import security configuration
import { helmetConfig, corsOptions, rateLimitConfig, trustedProxies, getCorsOrigins } from "./config/security.config.js";
import { csrfProtection, csrfErrorHandler, generateCsrfToken, refreshCsrfToken } from "./middleware/csrf.middleware.js";

// Import routes
import userRoutes from "./routes/user.routes.js";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import passwordRoutes from "./routes/password.routes.js";
import projectRoutes from "./routes/project.routes.js";
import objectiveRoutes from "./routes/objective.routes.js";
import planRoutes from "./routes/plan.routes.js";
import okrRoutes from "./routes/okr.routes.js";
import taskRoutes from "./routes/task.routes.js";
import aiRecommendationRoutes from "./routes/ai-recommendation.routes.js";
import userSettingsRoutes from "./routes/user-settings.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import focusRoutes from "./routes/focus.routes.js";
import cognitiveLoadRoutes from "./routes/cognitive-load.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import workspaceRoutes from "./routes/workspace.routes.js";
import teamRoutes from "./routes/team.routes.js";
import subscriptionRoutes from "./routes/subscription.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import referralRoutes from "./routes/referral.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import focusRoomRoutes from "./routes/focus-room.routes.js";
import walletRoutes from "./routes/wallet.routes.js";
import redemptionRoutes from "./routes/redemption.routes.js";

const app = express();

// ============================================================================
// SECURITY MIDDLEWARE (Order matters!)
// ============================================================================

// 1. Trust proxy (if behind load balancer/reverse proxy)
if (trustedProxies) {
  app.set('trust proxy', trustedProxies);
}

// 2. Security headers (Helmet) - must be first
app.use(helmet(helmetConfig));

// 3. CORS - enable cross-origin requests
app.use(cors(corsOptions));

// 4. Cookie parser - needed for CSRF
app.use(cookieParser());

// 5. Rate limiting - general API rate limit
// Only applies to state-changing operations (POST, PUT, PATCH, DELETE)
// GET/HEAD/OPTIONS are unlimited in ALL environments (safe, idempotent)
// Uses PER-USER rate limiting for authenticated requests
const generalLimiter = rateLimit({
  ...rateLimitConfig.general,
  // Per-user rate limiting for authenticated requests
  // Falls back to IP-based for unauthenticated requests
  keyGenerator: (req, res) => {
    // Extract user ID from JWT token if present
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        // Decode JWT to get user ID (don't verify here, just extract)
        const parts = token.split('.');
        if (parts.length === 3 && parts[1]) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          if (payload.userId) {
            return `user:${payload.userId}`;
          }
        }
      } catch (e) {
        // If token is invalid, fall back to IP
      }
    }
    // Fall back to IP-based rate limiting for unauthenticated requests
    // Use ipKeyGenerator helper to properly handle IPv6 addresses
    return `ip:${ipKeyGenerator(req.ip || '')}`;
  },
  // Skip rate limiting for:
  // - GET/HEAD/OPTIONS requests (safe methods) - UNLIMITED in all environments
  // - CSRF token endpoints (infrastructure)
  skip: (req) => {
    // Skip safe methods that don't modify data (ALL ENVIRONMENTS)
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return true;
    }
    // Skip CSRF token endpoints (infrastructure)
    if (req.path === '/api/csrf-token' || req.path === '/api/csrf-token/refresh') {
      return true;
    }
    return false;
  }
});
app.use('/api/', generalLimiter);

// ============================================================================
// BODY PARSING MIDDLEWARE
// ============================================================================

// Webhook routes need raw body for Stripe signature verification
// This must be before express.json() middleware
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhookRoutes);

// JSON body parser for all other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================================
// CSRF PROTECTION
// ============================================================================

// CSRF token endpoint (must be before CSRF protection middleware)
app.get('/api/csrf-token', generateCsrfToken, (req, res) => {
  res.json({
    success: true,
    csrfToken: (req as any).csrfToken,
    message: 'CSRF token generated'
  });
});

// Refresh CSRF token endpoint
app.post('/api/csrf-token/refresh', refreshCsrfToken);

// Apply CSRF protection to all routes (except excluded ones)
app.use(csrfProtection);

// ============================================================================
// STATIC FILES
// ============================================================================

// Serve static files from uploads directory with CORS support
// This allows the frontend (different origin/port) to load uploaded images
app.use("/uploads", (req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = getCorsOrigins();
  
  // Set CORS headers for uploaded files
  // Only allow requests from configured origins (security in production)
  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
  }
  
  // Always set CORP to cross-origin to allow frontend to load images
  // This is safe because:
  // 1. Uploads require authentication
  // 2. CORS restricts which origins can request the files
  // 3. Files are behind rate limiting
  res.header("Cross-Origin-Resource-Policy", "cross-origin");
  
  // Prevent browsers from caching profile images too aggressively,
  // which can cause intermittent loading failures across components
  res.header("Cache-Control", "public, max-age=300, must-revalidate");
  res.header("Vary", "Origin");
  
  next();
}, express.static(path.join(process.cwd(), "uploads")));

// ============================================================================
// API ROUTES
// ============================================================================

app.use("/api/health", healthRoutes);
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/password", passwordRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/objectives", objectiveRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/okrs", okrRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/ai-recommendations", aiRecommendationRoutes);
app.use("/api/user-settings", userSettingsRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api", focusRoutes);
app.use("/api/cognitive-load", cognitiveLoadRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api", workspaceRoutes);
app.use("/api", teamRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/focus-rooms", focusRoomRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/redemption", redemptionRoutes);

// ============================================================================
// ERROR HANDLERS
// ============================================================================

// CSRF error handler (must be after routes)
app.use(csrfErrorHandler);

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Error]', err);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    success: false,
    error: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack }),
  });
});

// 404 handler
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path,
  });
});

export default app;
