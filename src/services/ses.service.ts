import { SESClient, SendEmailCommand, SendEmailCommandInput } from "@aws-sdk/client-ses";

/**
 * Amazon SES Email Service
 * Handles email sending through AWS Simple Email Service
 */

// Initialize SES Client
let sesClient: SESClient | null = null;

/**
 * Get or create SES client instance
 */
const getSESClient = (): SESClient => {
  if (!sesClient) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || "us-east-1";

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        "AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in environment variables."
      );
    }

    sesClient = new SESClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
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
}

/**
 * Send email using Amazon SES
 * @param params - Email parameters
 * @returns Promise<void>
 */
export const sendEmail = async (params: EmailParams): Promise<void> => {
  const client = getSESClient();

  const fromEmail = params.fromEmail || process.env.AWS_SES_FROM_EMAIL;
  const fromName = params.fromName || process.env.AWS_SES_FROM_NAME || "IQniti";

  if (!fromEmail) {
    throw new Error(
      "AWS_SES_FROM_EMAIL is not set in environment variables"
    );
  }

  // Format the From address
  const fromAddress = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  // Ensure 'to' is an array
  const toAddresses = Array.isArray(params.to) ? params.to : [params.to];

  const emailParams: SendEmailCommandInput = {
    Source: fromAddress,
    Destination: {
      ToAddresses: toAddresses,
    },
    Message: {
      Subject: {
        Data: params.subject,
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

  try {
    const command = new SendEmailCommand(emailParams);
    const response = await client.send(command);
    
    console.log("Email sent successfully:", {
      messageId: response.MessageId,
      to: toAddresses,
      subject: params.subject,
    });
  } catch (error: any) {
    console.error("Error sending email via Amazon SES:", error);
    
    // Provide helpful error messages
    if (error.name === "MessageRejected") {
      console.error("SES Error: Email was rejected by Amazon SES");
    } else if (error.name === "MailFromDomainNotVerifiedException") {
      console.error("SES Error: The sender's email domain is not verified in Amazon SES");
    } else if (error.name === "ConfigurationSetDoesNotExistException") {
      console.error("SES Error: Configuration set does not exist");
    }
    
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

/**
 * Validate SES configuration
 * Checks if all required environment variables are set
 */
export const validateSESConfig = (): boolean => {
  const requiredEnvVars = [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SES_FROM_EMAIL",
  ];

  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName]
  );

  if (missingVars.length > 0) {
    console.warn(
      `Missing SES configuration: ${missingVars.join(", ")}`
    );
    return false;
  }

  return true;
};
