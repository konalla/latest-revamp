import sgMail from "@sendgrid/mail";

// Initialize SendGrid
const initializeSendGrid = () => {
  const apiKey = process.env.SEND_GRID_API_KEY;
  if (!apiKey) {
    throw new Error("SEND_GRID_API_KEY is not set in environment variables");
  }
  sgMail.setApiKey(apiKey);
};

interface SendFocusRoomInvitationParams {
  to: string;
  inviterName: string;
  roomName: string;
  invitationLink: string;
  expiresAt: Date;
}

/**
 * Send focus room invitation email
 */
export const sendFocusRoomInvitationEmail = async (
  params: SendFocusRoomInvitationParams
): Promise<void> => {
  initializeSendGrid();

  const fromEmail = process.env.SEND_GRID_EMAIL;
  if (!fromEmail) {
    throw new Error("SEND_GRID_EMAIL is not set in environment variables");
  }

  const { to, inviterName, roomName, invitationLink, expiresAt } = params;

  // Format expiration date
  const expiryDate = new Date(expiresAt).toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const msg = {
    to,
    from: {
      email: fromEmail,
      name: "IQniti",
    },
    subject: `${inviterName} invited you to join "${roomName}" focus room`,
    text: generatePlainTextEmail(inviterName, roomName, invitationLink, expiryDate),
    html: generateHtmlEmail(inviterName, roomName, invitationLink, expiryDate),
  };

  try {
    await sgMail.send(msg);
  } catch (error: any) {
    console.error("Error sending focus room invitation email:", error);
    if (error.response) {
      console.error("SendGrid Error:", error.response.body);
    }
    throw new Error("Failed to send focus room invitation email");
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
 */
const generateHtmlEmail = (
  inviterName: string,
  roomName: string,
  invitationLink: string,
  expiryDate: string
): string => {
  return `
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
      <h2 style="color: #4A6CF7; margin-top: 0;">You've been invited to a Focus Room!</h2>
      
      <p>Hi there!</p>
      
      <p><strong>${inviterName}</strong> has invited you to join the focus room <strong>"${roomName}"</strong> on IQniti.</p>
      
      <p>Join them for focused work sessions and stay productive together!</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${invitationLink}" 
           style="background-color: #4A6CF7; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
          Accept Invitation
        </a>
      </div>
      
      <p style="font-size: 12px; color: #666; margin-top: 30px;">
        Or copy and paste this link into your browser:<br>
        <a href="${invitationLink}" style="color: #4A6CF7; word-break: break-all;">${invitationLink}</a>
      </p>
      
      <p style="font-size: 12px; color: #666;">
        This invitation will expire on <strong>${expiryDate}</strong>.
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

