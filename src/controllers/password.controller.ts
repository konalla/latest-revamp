/**
 * Password Controller
 * 
 * Handles password-related endpoints
 * 
 * @module controllers/password
 */

import type { Request, Response } from "express";
import { getPasswordRequirementsText, DEFAULT_PASSWORD_RULES } from "../utils/password-validator.js";

/**
 * Get password requirements
 * 
 * Returns the current password requirements for client-side display and validation
 * 
 * GET /api/password/requirements
 */
export const getPasswordRequirements = async (req: Request, res: Response): Promise<void> => {
  try {
    const requirements = getPasswordRequirementsText(DEFAULT_PASSWORD_RULES);
    
    res.json({
      success: true,
      data: {
        requirements,
        rules: {
          minLength: DEFAULT_PASSWORD_RULES.minLength,
          maxLength: DEFAULT_PASSWORD_RULES.maxLength,
          requireLowercase: DEFAULT_PASSWORD_RULES.requireLowercase,
          requireUppercase: DEFAULT_PASSWORD_RULES.requireUppercase,
          requireNumbers: DEFAULT_PASSWORD_RULES.requireNumbers,
          requireSpecialChars: DEFAULT_PASSWORD_RULES.requireSpecialChars,
          preventCommonPasswords: DEFAULT_PASSWORD_RULES.preventCommonPasswords,
          preventUserInfo: DEFAULT_PASSWORD_RULES.preventUserInfo,
        }
      }
    });
  } catch (error: any) {
    console.error('[Password] Error getting requirements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get password requirements'
    });
  }
};
