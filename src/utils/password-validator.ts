/**
 * Password Validation Utility
 * 
 * Implements comprehensive password security validation based on OWASP guidelines
 * and NIST SP 800-63B recommendations.
 * 
 * @module utils/password-validator
 */

export interface PasswordValidationResult {
  /** Whether the password meets all requirements */
  isValid: boolean;
  /** Array of validation errors (empty if valid) */
  errors: string[];
  /** Password strength score (0-100) */
  strength: number;
  /** Strength label: weak, medium, strong, very-strong */
  strengthLabel: 'weak' | 'medium' | 'strong' | 'very-strong';
}

/**
 * Common passwords list (top 100 most common passwords)
 * In production, consider using a larger list or external service
 */
const COMMON_PASSWORDS = [
  'password', 'password123', '12345678', '123456789', '1234567890',
  'qwerty', 'abc123', 'password1', 'letmein', 'welcome',
  'monkey', '1234', 'dragon', 'master', 'login',
  'princess', 'qwertyuiop', 'solo', 'passw0rd', 'starwars',
  'iloveyou', 'admin', 'welcome123', 'password!', 'Pa$$w0rd',
  'pass123', 'test123', 'user123', 'root', 'admin123'
];

/**
 * Configuration for password validation rules
 */
export interface PasswordRules {
  minLength: number;
  maxLength: number;
  requireLowercase: boolean;
  requireUppercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  preventCommonPasswords: boolean;
  preventUserInfo: boolean;
}

/**
 * Default password rules (configurable)
 */
export const DEFAULT_PASSWORD_RULES: PasswordRules = {
  minLength: 8,
  maxLength: 128,
  requireLowercase: true,
  requireUppercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  preventCommonPasswords: true,
  preventUserInfo: true,
};

/**
 * Calculate password strength score (0-100)
 * 
 * Factors:
 * - Length (max 30 points)
 * - Character variety (max 40 points)
 * - Pattern complexity (max 30 points)
 */
function calculateStrength(password: string): number {
  let score = 0;

  // Length score (max 30 points)
  if (password.length >= 8) score += 10;
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 5;
  if (password.length >= 20) score += 5;

  // Character variety score (max 40 points)
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  if (hasLower) score += 10;
  if (hasUpper) score += 10;
  if (hasNumber) score += 10;
  if (hasSpecial) score += 10;

  // Pattern complexity (max 30 points)
  // Penalize repeated characters
  const repeatedChars = password.match(/(.)\1{2,}/g);
  if (!repeatedChars) score += 10;

  // Penalize sequential characters (123, abc, etc.)
  const hasSequential = /(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789)/i.test(password);
  if (!hasSequential) score += 10;

  // Reward character diversity
  const uniqueChars = new Set(password).size;
  if (uniqueChars / password.length > 0.7) score += 10;

  return Math.min(score, 100);
}

/**
 * Get strength label from score
 */
function getStrengthLabel(score: number): 'weak' | 'medium' | 'strong' | 'very-strong' {
  if (score < 40) return 'weak';
  if (score < 60) return 'medium';
  if (score < 80) return 'strong';
  return 'very-strong';
}

/**
 * Check if password contains user information
 * 
 * @param password - Password to check
 * @param userInfo - Optional user information (email, username, name)
 */
function containsUserInfo(password: string, userInfo?: { email?: string; username?: string; name?: string }): boolean {
  if (!userInfo) return false;

  const lowerPassword = password.toLowerCase();

  // Check email (without domain)
  if (userInfo.email && userInfo.email.includes('@')) {
    const emailName = userInfo.email.split('@')[0]?.toLowerCase() || '';
    if (emailName.length >= 3 && lowerPassword.includes(emailName)) {
      return true;
    }
  }

  // Check username
  if (userInfo.username && userInfo.username.length >= 3) {
    if (lowerPassword.includes(userInfo.username.toLowerCase())) {
      return true;
    }
  }

  // Check name parts
  if (userInfo.name) {
    const nameParts = userInfo.name.toLowerCase().split(/\s+/);
    for (const part of nameParts) {
      if (part.length >= 3 && lowerPassword.includes(part)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Validate password against security rules
 * 
 * @param password - Password to validate
 * @param rules - Validation rules (uses defaults if not provided)
 * @param userInfo - Optional user information to prevent password containing user data
 * @returns Validation result with errors and strength score
 * 
 * @example
 * ```typescript
 * const result = validatePassword('MySecureP@ssw0rd!', DEFAULT_PASSWORD_RULES);
 * if (!result.isValid) {
 *   console.log('Errors:', result.errors);
 * }
 * ```
 */
export function validatePassword(
  password: string,
  rules: PasswordRules = DEFAULT_PASSWORD_RULES,
  userInfo?: { email?: string; username?: string; name?: string }
): PasswordValidationResult {
  const errors: string[] = [];

  // Null/undefined check
  if (!password) {
    return {
      isValid: false,
      errors: ['Password is required'],
      strength: 0,
      strengthLabel: 'weak',
    };
  }

  // Length validation
  if (password.length < rules.minLength) {
    errors.push(`Password must be at least ${rules.minLength} characters long`);
  }

  if (password.length > rules.maxLength) {
    errors.push(`Password must not exceed ${rules.maxLength} characters`);
  }

  // Character requirements
  if (rules.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter (a-z)');
  }

  if (rules.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter (A-Z)');
  }

  if (rules.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number (0-9)');
  }

  if (rules.requireSpecialChars && !/[^a-zA-Z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)');
  }

  // Common password check
  if (rules.preventCommonPasswords) {
    const lowerPassword = password.toLowerCase();
    if (COMMON_PASSWORDS.includes(lowerPassword)) {
      errors.push('Password is too common and easily guessable');
    }
  }

  // User information check
  if (rules.preventUserInfo && userInfo) {
    if (containsUserInfo(password, userInfo)) {
      errors.push('Password must not contain your email, username, or name');
    }
  }

  // Calculate strength
  const strength = calculateStrength(password);
  const strengthLabel = getStrengthLabel(strength);

  return {
    isValid: errors.length === 0,
    errors,
    strength,
    strengthLabel,
  };
}

/**
 * Get password requirements text for display to users
 */
export function getPasswordRequirementsText(rules: PasswordRules = DEFAULT_PASSWORD_RULES): string[] {
  const requirements: string[] = [];

  requirements.push(`At least ${rules.minLength} characters long`);

  if (rules.requireLowercase) {
    requirements.push('At least one lowercase letter');
  }

  if (rules.requireUppercase) {
    requirements.push('At least one uppercase letter');
  }

  if (rules.requireNumbers) {
    requirements.push('At least one number');
  }

  if (rules.requireSpecialChars) {
    requirements.push('At least one special character');
  }

  if (rules.preventCommonPasswords) {
    requirements.push('Must not be a commonly used password');
  }

  if (rules.preventUserInfo) {
    requirements.push('Must not contain your personal information');
  }

  return requirements;
}

/**
 * Format validation errors for API response
 */
export function formatPasswordErrors(result: PasswordValidationResult): string {
  if (result.isValid) return '';
  return result.errors.join('. ') + '.';
}
