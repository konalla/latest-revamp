import { SESClient, SendEmailCommand, SendEmailCommandInput } from "@aws-sdk/client-ses";

/**
 * Amazon SES Email Service
 * Handles email sending through AWS Simple Email Service
 */

/**
 * SES Configuration
 */
interface SESConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  fromEmail: string;
  fromName: string;
}

/**
 * Custom error for SES operations
 */
export class SESError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public originalError?: unknown
  ) {
    super(message);
    this.name = "SESError";
    Object.setPrototypeOf(this, SESError.prototype);
  }
}

// Initialize SES Client (Singleton)
let sesClient: SESClient | null = null;
let sesConfig: SESConfig | null = null;

/**
 * Get SES configuration from environment variables
 * @throws {SESError} If required configuration is missing
 */
const getSESConfig = (): SESConfig => {
  if (!sesConfig) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || "us-east-1";
    const fromEmail = process.env.AWS_SES_FROM_EMAIL;
    const fromName = process.env.AWS_SES_FROM_NAME || "IQniti";

    if (!accessKeyId || !secretAccessKey) {
      throw new SESError(
        "AWS credentials not configured",
        "MISSING_CREDENTIALS"
      );
    }

    if (!fromEmail) {
      throw new SESError(
        "AWS SES from email not configured",
        "MISSING_FROM_EMAIL"
      );
    }

    sesConfig = {
      accessKeyId,
      secretAccessKey,
      region,
      fromEmail,
      fromName,
    };
  }

  return sesConfig;
};

/**
 * Get or create SES client instance
 * @throws {SESError} If configuration is invalid
 */
const getSESClient = (): SESClient => {
  if (!sesClient) {
    const config = getSESConfig();

    sesClient = new SESClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      maxAttempts: 3, // Retry failed requests up to 3 times
    });
  }

  return sesClient;
};

/**
 * Email message parameters
 */
export interface EmailParams {
  to: string | string[];
  subject: string;
  textContent: string;
  htmlContent: string;
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
}

/**
 * Email validation regex (basic)
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate email address format
 */
const isValidEmail = (email: string): boolean => {
  return EMAIL_REGEX.test(email);
};

/**
 * Validate email parameters
 * @throws {SESError} If validation fails
 */
const validateEmailParams = (params: EmailParams): void => {
  // Validate recipient emails
  const toEmails = Array.isArray(params.to) ? params.to : [params.to];
  
  if (toEmails.length === 0) {
    throw new SESError("At least one recipient email is required", "INVALID_RECIPIENT");
  }

  for (const email of toEmails) {
    if (!email || typeof email !== "string" || email.trim().length === 0) {
      throw new SESError("Invalid recipient email: empty or invalid format", "INVALID_RECIPIENT");
    }
    if (!isValidEmail(email.trim())) {
      throw new SESError(`Invalid recipient email format: ${email}`, "INVALID_EMAIL_FORMAT");
    }
  }

  // Validate subject
  if (!params.subject || params.subject.trim().length === 0) {
    throw new SESError("Email subject is required", "INVALID_SUBJECT");
  }

  if (params.subject.length > 998) {
    throw new SESError("Email subject is too long (max 998 characters)", "SUBJECT_TOO_LONG");
  }

  // Validate content
  if (!params.textContent || params.textContent.trim().length === 0) {
    throw new SESError("Email text content is required", "INVALID_CONTENT");
  }

  if (!params.htmlContent || params.htmlContent.trim().length === 0) {
    throw new SESError("Email HTML content is required", "INVALID_CONTENT");
  }

  // Validate reply-to if provided
  if (params.replyTo && !isValidEmail(params.replyTo)) {
    throw new SESError(`Invalid reply-to email format: ${params.replyTo}`, "INVALID_REPLY_TO");
  }
};

/**
 * Escape HTML to prevent XSS attacks
 * This should be used for any user-generated content in HTML emails
 */
export const escapeHtml = (text: string): string => {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m] || m);
};

/**
 * Send email using Amazon SES
 * @param params - Email parameters
 * @returns Promise<string> - Message ID from SES
 * @throws {SESError} If sending fails
 */
export const sendEmail = async (params: EmailParams): Promise<string> => {
  // Validate input parameters
  validateEmailParams(params);

  const client = getSESClient();
  const config = getSESConfig();

  const fromEmail = params.fromEmail || config.fromEmail;
  const fromName = params.fromName || config.fromName;

  // Format the From address (RFC 5322)
  const fromAddress = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  // Ensure 'to' is an array and trim whitespace
  const toAddresses = (Array.isArray(params.to) ? params.to : [params.to])
    .map((email) => email.trim());

  const emailParams: SendEmailCommandInput = {
    Source: fromAddress,
    Destination: {
      ToAddresses: toAddresses,
    },
    Message: {
      Subject: {
        Data: params.subject.trim(),
        Charset: "UTF-8",
      },
      Body: {
        Text: {
          Data: params.textContent,
          Charset: "UTF-8",
        },
        Html: {
          Data: params.htmlContent,
          Charset: "UTF-8",
        },
      },
    },
  };

  // Add reply-to if provided
  if (params.replyTo) {
    emailParams.ReplyToAddresses = [params.replyTo];
  }

  try {
    const command = new SendEmailCommand(emailParams);
    const response = await client.send(command);
    
    // Structured logging (can be replaced with Winston/Pino in production)
    console.log(JSON.stringify({
      level: "info",
      message: "Email sent successfully",
      messageId: response.MessageId,
      to: toAddresses,
      subject: params.subject,
      timestamp: new Date().toISOString(),
    }));

    return response.MessageId || "unknown";
  } catch (error: any) {
    // Map AWS SES errors to our custom error type
    const errorCode = error.name || "UNKNOWN_ERROR";
    const errorMessage = error.message || "Unknown error occurred";

    // Structured error logging
    console.error(JSON.stringify({
      level: "error",
      message: "Failed to send email via Amazon SES",
      error: errorMessage,
      errorCode,
      to: toAddresses,
      subject: params.subject,
      timestamp: new Date().toISOString(),
    }));

    // Map specific SES errors to user-friendly messages
    let userMessage = "Failed to send email";
    
    switch (errorCode) {
      case "MessageRejected":
        userMessage = "Email was rejected. Please check the recipient address.";
        break;
      case "MailFromDomainNotVerifiedException":
        userMessage = "Email domain is not verified. Please contact support.";
        break;
      case "ConfigurationSetDoesNotExistException":
        userMessage = "Email configuration error. Please contact support.";
        break;
      case "AccountSendingPausedException":
        userMessage = "Email sending is temporarily paused. Please try again later.";
        break;
      case "ThrottlingException":
        userMessage = "Too many emails sent. Please try again later.";
        break;
    }

    throw new SESError(
      userMessage,
      errorCode,
      error.$metadata?.httpStatusCode,
      error
    );
  }
};

/**
 * Validate SES configuration
 * Checks if all required environment variables are set
 * @returns {boolean} True if configuration is valid
 */
export const validateSESConfig = (): boolean => {
  try {
    getSESConfig();
    return true;
  } catch (error) {
    if (error instanceof SESError) {
      console.warn(JSON.stringify({
        level: "warn",
        message: "Invalid SES configuration",
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
      }));
    }
    return false;
  }
};

/**
 * Test SES configuration by attempting to get the client
 * @throws {SESError} If configuration is invalid
 */
export const testSESConnection = async (): Promise<boolean> => {
  try {
    const client = getSESClient();
    // Just verify we can create the client without errors
    return true;
  } catch (error) {
    throw new SESError(
      "Failed to initialize SES client",
      "INITIALIZATION_ERROR",
      undefined,
      error
    );
  }
};
