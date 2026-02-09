/**
 * CSRF Protection Middleware
 * 
 * Implements double-submit cookie pattern for CSRF protection
 * Uses modern csrf-csrf package (successor to deprecated csurf)
 * 
 * @module middleware/csrf
 */

import crypto from "crypto";
import { doubleCsrf } from "csrf-csrf";
import type { Request, Response, NextFunction } from "express";
import { csrfConfig } from "../config/security.config.js";

/**
 * Configure CSRF protection with double-submit cookie pattern
 */
const csrfUtilities = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || generateCsrfSecret(),
  getSessionIdentifier: (req: any) => {
    // Use user ID if authenticated, otherwise use a session ID
    // For stateless JWT, we can use a random identifier per session
    return req.user?.id?.toString() || req.session?.id || 'anonymous';
  },
  cookieName: csrfConfig.cookie.name,
  cookieOptions: {
    httpOnly: csrfConfig.cookie.httpOnly,
    secure: csrfConfig.cookie.secure,
    sameSite: csrfConfig.cookie.sameSite,
    path: csrfConfig.cookie.path,
    maxAge: csrfConfig.cookie.maxAge,
  },
  size: csrfConfig.token.length,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"], // Safe methods don't need CSRF
});

// Extract the middleware and token generator
const doubleCsrfProtection = csrfUtilities.doubleCsrfProtection;

/**
 * Generate CSRF secret if not provided (development only)
 */
function generateCsrfSecret(): string {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CSRF_SECRET must be set in production environment');
  }
  console.warn('⚠️  Using generated CSRF secret for development. Set CSRF_SECRET in .env for production.');
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Check if route should be excluded from CSRF protection
 */
function shouldExcludeRoute(path: string): boolean {
  return csrfConfig.excludeRoutes.some(route => path.startsWith(route));
}

/**
 * CSRF Protection Middleware
 * 
 * Applies CSRF protection to all non-safe HTTP methods (POST, PUT, DELETE, PATCH)
 * Excludes specific routes like webhooks
 * 
 * @example
 * ```typescript
 * app.use(csrfProtection);
 * ```
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Skip CSRF for excluded routes
  if (shouldExcludeRoute(req.path)) {
    return next();
  }

  // Apply double CSRF protection
  doubleCsrfProtection(req, res, next);
};

/**
 * Generate and attach CSRF token to response
 * 
 * Use this for endpoints that need to provide a CSRF token to clients
 * 
 * @example
 * ```typescript
 * app.get('/api/csrf-token', generateCsrfToken, (req, res) => {
 *   res.json({ csrfToken: req.csrfToken });
 * });
 * ```
 */
export const generateCsrfToken = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Generate token using the utilities
    const token = csrfUtilities.generateCsrfToken(req, res);
    
    // Attach to request for use in route handler
    (req as any).csrfToken = token;
    
    next();
  } catch (error) {
    console.error('[CSRF] Error generating token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate CSRF token'
    });
  }
};

/**
 * CSRF Error Handler
 * 
 * Provides user-friendly error messages for CSRF failures
 * Should be added after routes that use CSRF protection
 */
export const csrfErrorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
  // Check if this is a CSRF error
  if (error.code === 'EBADCSRFTOKEN' || error.message?.includes('csrf')) {
    return res.status(403).json({
      success: false,
      error: 'Invalid or missing CSRF token',
      code: 'CSRF_VALIDATION_FAILED',
      message: 'Your session may have expired. Please refresh the page and try again.'
    });
  }

  // Not a CSRF error, pass to next error handler
  next(error);
};

/**
 * Refresh CSRF Token Endpoint Handler
 * 
 * Allows clients to request a new CSRF token
 * Useful for long-running single-page applications
 */
export const refreshCsrfToken = (req: Request, res: Response) => {
  try {
    const token = csrfUtilities.generateCsrfToken(req, res);
    
    res.json({
      success: true,
      csrfToken: token,
      message: 'CSRF token refreshed'
    });
  } catch (error) {
    console.error('[CSRF] Error refreshing token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh CSRF token'
    });
  }
};
