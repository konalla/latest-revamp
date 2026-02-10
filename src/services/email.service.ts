import { sendEmail } from "./ses.service.js";

/**
 * Send password reset email
 * @param email - Recipient email address
 * @param name - Recipient name
 * @param resetToken - Password reset token
 * @returns Promise<void>
 */
const sendPasswordResetEmail = async (
  email: string,
  name: string,
  resetToken: string
): Promise<void> => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

  // Token expiry time (1 hour)
  const expiryHours = 1;

  const textContent = `Hi ${name},\n\nYou requested to reset your password. Click the link below to reset it:\n\n${resetUrl}\n\nThis link will expire in ${expiryHours} hour(s).\n\nIf you didn't request this password reset, please ignore this email. Your password will remain unchanged.\n\nBest regards,\nIQniti Team`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #4A6CF7; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: #ffffff; margin: 0;">IQniti</h1>
        </div>
        
        <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
          <h2 style="color: #4A6CF7; margin-top: 0;">Reset Your Password</h2>
          
          <p>Hi ${name},</p>
          
          <p>You requested to reset your password. Click the button below to reset it:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #4A6CF7; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Reset Password
            </a>
          </div>
          
          <p style="font-size: 14px; color: #666;">
            Or copy and paste this link into your browser:<br>
            <a href="${resetUrl}" style="color: #4A6CF7; word-break: break-all;">${resetUrl}</a>
          </p>
          
          <p style="font-size: 14px; color: #666;">
            <strong>This link will expire in ${expiryHours} hour(s).</strong>
          </p>
          
          <p style="font-size: 14px; color: #666; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
            If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
          </p>
          
          <p style="font-size: 14px; color: #666; margin-top: 20px;">
            Best regards,<br>
            <strong>IQniti Team</strong>
          </p>
        </div>
      </body>
    </html>
  `;

  try {
    await sendEmail({
      to: email,
      subject: "Reset Your Password - IQniti",
      textContent,
      htmlContent,
    });
  } catch (error: any) {
    console.error("Error sending password reset email:", error);
    throw new Error("Failed to send password reset email");
  }
};

export { sendPasswordResetEmail };

