import { sendEmail, escapeHtml, SESError } from "./ses.service.js";

interface SendFocusRoomInvitationParams {
  to: string;
  inviterName: string;
  roomName: string;
  invitationLink: string;
  expiresAt: Date;
}

/**
 * Send focus room invitation email
 * @param params - Invitation parameters
 * @returns Promise<string> - Message ID from SES
 * @throws {SESError} If validation or sending fails
 */
export const sendFocusRoomInvitationEmail = async (
  params: SendFocusRoomInvitationParams
): Promise<string> => {
  const { to, inviterName, roomName, invitationLink, expiresAt } = params;

  // Input validation
  if (!to || !to.trim()) {
    throw new SESError("Recipient email is required", "INVALID_INPUT");
  }
  if (!inviterName || !inviterName.trim()) {
    throw new SESError("Inviter name is required", "INVALID_INPUT");
  }
  if (!roomName || !roomName.trim()) {
    throw new SESError("Room name is required", "INVALID_INPUT");
  }
  if (!invitationLink || !invitationLink.trim()) {
    throw new SESError("Invitation link is required", "INVALID_INPUT");
  }
  if (!expiresAt || !(expiresAt instanceof Date) || isNaN(expiresAt.getTime())) {
    throw new SESError("Valid expiration date is required", "INVALID_INPUT");
  }

  // Format expiration date
  const expiryDate = new Date(expiresAt).toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  // Sanitize inputs
  const safeInviterName = inviterName.trim();
  const safeRoomName = roomName.trim();

  const textContent = generatePlainTextEmail(safeInviterName, safeRoomName, invitationLink, expiryDate);
  const htmlContent = generateHtmlEmail(safeInviterName, safeRoomName, invitationLink, expiryDate);

  try {
    const messageId = await sendEmail({
      to: to.trim(),
      subject: `${safeInviterName} invited you to join "${safeRoomName}" focus room`,
      textContent,
      htmlContent,
    });

    console.log(JSON.stringify({
      level: "info",
      message: "Focus room invitation email sent",
      messageId,
      recipient: to.trim(),
      roomName: safeRoomName,
      timestamp: new Date().toISOString(),
    }));

    return messageId;
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "Failed to send focus room invitation email",
      error: error instanceof Error ? error.message : "Unknown error",
      recipient: to.trim(),
      roomName: safeRoomName,
      timestamp: new Date().toISOString(),
    }));

    // Re-throw SESError, wrap other errors
    if (error instanceof SESError) {
      throw error;
    }
    throw new SESError(
      "Failed to send focus room invitation email",
      "EMAIL_SEND_FAILED",
      undefined,
      error
    );
  }
};

/**
 * Generate plain text email template
 */
const generatePlainTextEmail = (
  inviterName: string,
  roomName: string,
  invitationLink: string,
  expiryDate: string
): string => {
  return `Hi there!

${inviterName} has invited you to join the focus room "${roomName}" on IQniti.

Join them for focused work sessions and stay productive together!

Click the link below to accept the invitation:
${invitationLink}

This invitation will expire on ${expiryDate}.

If you didn't expect this invitation, you can safely ignore this email.

Best regards,
IQniti Team`;
};

/**
 * Generate HTML email template
 * All user-generated content is escaped to prevent XSS
 */
const generateHtmlEmail = (
  inviterName: string,
  roomName: string,
  invitationLink: string,
  expiryDate: string
): string => {
  // Escape all user-generated content
  const safeInviterName = escapeHtml(inviterName);
  const safeRoomName = escapeHtml(roomName);
  const safeInvitationLink = escapeHtml(invitationLink);
  const safeExpiryDate = escapeHtml(expiryDate);

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Focus Room Invitation - IQniti</title>
  </head>
  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #4A6CF7; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
      <h1 style="color: #ffffff; margin: 0;">IQniti</h1>
    </div>
    
    <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
      <h2 style="color: #4A6CF7; margin-top: 0;">You've been invited to a Focus Room!</h2>
      
      <p>Hi there!</p>
      
      <p><strong>${safeInviterName}</strong> has invited you to join the focus room <strong>"${safeRoomName}"</strong> on IQniti.</p>
      
      <p>Join them for focused work sessions and stay productive together!</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${invitationLink}" 
           style="background-color: #4A6CF7; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
          Accept Invitation
        </a>
      </div>
      
      <p style="font-size: 12px; color: #666; margin-top: 30px;">
        Or copy and paste this link into your browser:<br>
        <a href="${invitationLink}" style="color: #4A6CF7; word-break: break-all;">${safeInvitationLink}</a>
      </p>
      
      <p style="font-size: 12px; color: #666;">
        This invitation will expire on <strong>${safeExpiryDate}</strong>.
      </p>
      
      <p style="font-size: 12px; color: #666; margin-top: 30px;">
        If you didn't expect this invitation, you can safely ignore this email.
      </p>
      
      <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
      
      <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">
        Best regards,<br>
        IQniti Team
      </p>
    </div>
  </body>
</html>
  `;
};


