/**
 * Security Configuration
 * 
 * Centralized security settings for the application
 * Based on OWASP recommendations and industry best practices
 * 
 * @module config/security
 */

import crypto from "crypto";
import type { HelmetOptions } from "helmet";

/**
 * Environment check
 */
export const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
export const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

/**
 * Helmet Security Headers Configuration
 * 
 * Provides protection against common web vulnerabilities:
 * - XSS (Cross-Site Scripting)
 * - Clickjacking
 * - MIME type sniffing
 * - DNS prefetch control
 */
export const helmetConfig: HelmetOptions = {
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Required for some frameworks, remove if possible
        "https://js.stripe.com", // Stripe checkout
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Required for styled-components and similar
        "https://fonts.googleapis.com",
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "data:",
      ],
      imgSrc: [
        "'self'",
        "data:",
        "https:",
        "blob:", // For image uploads preview
      ],
      connectSrc: [
        "'self'",
        "https://api.stripe.com",
        "https://api.openai.com",
        ...(IS_DEVELOPMENT ? ["http://localhost:*", "ws://localhost:*"] : []),
      ],
      frameSrc: [
        "'self'",
        "https://js.stripe.com",
        "https://hooks.stripe.com",
      ],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"], // Prevent clickjacking
      baseUri: ["'self'"],
      manifestSrc: ["'self'"],
    },
  },

  // HTTP Strict Transport Security (HSTS)
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },

  // X-Frame-Options: Prevent clickjacking
  frameguard: {
    action: 'deny',
  },

  // X-Content-Type-Options: Prevent MIME sniffing
  noSniff: true,

  // X-DNS-Prefetch-Control
  dnsPrefetchControl: {
    allow: false,
  },

  // X-Download-Options for IE8+
  ieNoOpen: true,

  // X-Permitted-Cross-Domain-Policies
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none',
  },

  // Referrer-Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },

  // X-XSS-Protection (legacy but still useful)
  xssFilter: true,

  // Cross-Origin-Resource-Policy
  // Allow cross-origin access for uploaded files when frontend and backend are on different origins
  // This is common in modern deployments (e.g., app.domain.com vs api.domain.com)
  // Security is still maintained through:
  // - Authentication required for uploads
  // - CSRF protection on upload endpoints
  // - CORS restrictions to allowed origins only
  // - Rate limiting on all endpoints
  crossOriginResourcePolicy: {
    policy: 'cross-origin',
  },
};

/**
 * CORS Configuration
 */
export const getCorsOrigins = (): string[] => {
  const originsEnv = process.env.CORS_ORIGINS;
  
  if (!originsEnv) {
    if (IS_PRODUCTION) {
      throw new Error('CORS_ORIGINS must be set in production environment');
    }
    // Development fallback
    return [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:5175',
    ];
  }

  const origins = originsEnv.split(',').map(origin => origin.trim());

  // In production, ensure all origins are HTTPS
  if (IS_PRODUCTION) {
    const invalidOrigins = origins.filter(origin => {
      return !origin.startsWith('https://') && !origin.startsWith('wss://');
    });

    if (invalidOrigins.length > 0) {
      throw new Error(
        `Invalid CORS origins in production (must use HTTPS): ${invalidOrigins.join(', ')}`
      );
    }
  }

  return origins;
};

/**
 * CORS Options
 */
export const corsOptions = {
  origin: getCorsOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-CSRF-Token', // CSRF token header
    'X-Requested-With',
  ],
  exposedHeaders: ['X-CSRF-Token'],
  maxAge: 86400, // 24 hours
};

/**
 * CSRF Protection Configuration
 */
export const csrfConfig = {
  // Cookie options
  cookie: {
    // __Host- prefix requires secure:true, so use it only in production
    name: IS_PRODUCTION ? '__Host-csrf' : 'csrf-token',
    httpOnly: true,
    secure: IS_PRODUCTION, // Only send over HTTPS in production
    sameSite: IS_PRODUCTION ? ('strict' as const) : ('lax' as const), // Lax for localhost development
    path: '/',
    maxAge: 3600000, // 1 hour
  },
  
  // Token options
  token: {
    headerName: 'X-CSRF-Token',
    fieldName: '_csrf',
    length: 32,
  },

  // Routes to exclude from CSRF protection
  excludeRoutes: [
    '/api/webhooks', // Stripe webhooks
    '/api/health', // Health check
  ],
};

/**
 * Rate Limiting Configuration
 */
export const rateLimitConfig = {
  // General API rate limit (applies only to state-changing operations)
  // GET/HEAD/OPTIONS requests are excluded in app.ts (safe methods)
  general: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // 500 state-changing requests per 15 minutes (all environments)
    message: 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
  },

  // Authentication endpoints (stricter)
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 authentication attempts per 15 minutes (all environments)
    message: 'Too many authentication attempts, please try again later',
    skipSuccessfulRequests: true, // Don't count successful login attempts
    standardHeaders: true,
    legacyHeaders: false,
  },

  // Password reset (strict)
  passwordReset: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 password reset attempts per hour (all environments)
    message: 'Too many password reset attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
  },

  // File upload
  upload: {
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 uploads per minute
    message: 'Too many upload requests, please slow down',
    standardHeaders: true,
    legacyHeaders: false,
  },
};

/**
 * Session Configuration
 */
export const sessionConfig = {
  secret: process.env.SESSION_SECRET || generateSessionSecret(),
  name: '__Host-session', // Secure cookie prefix
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'strict' as const,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
};

/**
 * Generate a session secret if not provided (development only)
 */
function generateSessionSecret(): string {
  if (IS_PRODUCTION) {
    throw new Error('SESSION_SECRET must be set in production environment');
  }
  console.warn('⚠️  Using generated session secret for development. Set SESSION_SECRET in .env for production.');
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Trusted Proxies (for X-Forwarded-* headers)
 */
export const trustedProxies = IS_PRODUCTION
  ? ['loopback', 'linklocal', 'uniquelocal'] // Trust common proxy setups
  : undefined;

/**
 * File Upload Security
 */
export const fileUploadConfig = {
  maxFileSize: 2 * 1024 * 1024, // 2MB
  allowedMimeTypes: {
    images: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    documents: ['application/pdf'],
  },
  allowedExtensions: {
    images: ['.jpg', '.jpeg', '.png', '.webp'],
    documents: ['.pdf'],
  },
};

/**
 * Security Headers for API Responses
 */
export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};
