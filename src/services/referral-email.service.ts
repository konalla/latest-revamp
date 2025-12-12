import sgMail from "@sendgrid/mail";

// Initialize SendGrid
const initializeSendGrid = () => {
  const apiKey = process.env.SEND_GRID_API_KEY;
  if (!apiKey) {
    throw new Error("SEND_GRID_API_KEY is not set in environment variables");
  }
  sgMail.setApiKey(apiKey);
};

interface SendReferralInvitationParams {
  to: string;
  referrerName: string;
  referrerEmail: string;
  referralLink: string;
}

/**
 * Send referral invitation email
 * @param params - Email parameters including recipient, referrer info, and referral link
 * @returns Promise<void>
 */
export const sendReferralInvitationEmail = async (
  params: SendReferralInvitationParams
): Promise<void> => {
  initializeSendGrid();

  const fromEmail = process.env.SEND_GRID_EMAIL;
  if (!fromEmail) {
    throw new Error("SEND_GRID_EMAIL is not set in environment variables");
  }

  const { to, referrerName, referrerEmail, referralLink } = params;

  const msg = {
    to,
    from: {
      email: fromEmail,
      name: "IQniti"
    },
    subject: "Join me on IQniti - Exclusive Early Access! 🚀",
    text: generatePlainTextEmail(referrerName, referrerEmail, referralLink),
    html: generateHtmlEmail(referrerName, referrerEmail, referralLink),
  };

  try {
    await sgMail.send(msg);
  } catch (error: any) {
    console.error("Error sending referral invitation email:", error);
    if (error.response) {
      console.error("SendGrid Error:", error.response.body);
    }
    throw new Error("Failed to send referral invitation email");
  }
};

/**
 * Generate HTML email template for referral invitation
 */
const generateHtmlEmail = (
  referrerName: string,
  referrerEmail: string,
  referralLink: string
): string => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background-color: #6366F1;
          padding: 20px;
          text-align: center;
          border-radius: 8px 8px 0 0;
        }
        .header h1 {
          color: #ffffff;
          margin: 0;
        }
        .content {
          background-color: #f9f9f9;
          padding: 30px;
          border-radius: 0 0 8px 8px;
        }
        .button {
          background-color: #6366F1;
          color: #ffffff;
          padding: 15px 30px;
          text-decoration: none;
          border-radius: 5px;
          display: inline-block;
          font-weight: bold;
          margin: 20px 0;
        }
        .button-container {
          text-align: center;
          margin: 30px 0;
        }
        .footer {
          font-size: 12px;
          color: #666;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
        }
        ul {
          margin: 15px 0;
          padding-left: 20px;
        }
        li {
          margin: 8px 0;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>IQniti</h1>
      </div>
      
      <div class="content">
        <h2 style="color: #6366F1; margin-top: 0;">Hi there! 👋</h2>
        
        <p>My name is <strong>${escapeHtml(referrerName)}</strong>, and I'd like to invite you to join <strong>IQniti</strong> - the productivity platform that's changing how I work!</p>
        
        <p>IQniti is offering exclusive early access, and by using my referral link, you'll get special benefits when you join.</p>
        
        <div class="button-container">
          <a href="${referralLink}" class="button">Join IQniti Now</a>
        </div>
        
        <p style="font-size: 14px; color: #666;">
          Or copy and paste this link into your browser:<br>
          <a href="${referralLink}" style="color: #6366F1; word-break: break-all;">${referralLink}</a>
        </p>
        
        <h3 style="color: #6366F1;">What you'll get:</h3>
        <ul>
          <li>Early access to new features</li>
          <li>Exclusive rewards and badges</li>
          <li>Priority support</li>
        </ul>
        
        <p>Looking forward to seeing you on IQniti!</p>
        
        <p>Best regards,<br>
        <strong>${escapeHtml(referrerName)}</strong></p>
        
        <div class="footer">
          <p>This invitation was sent by ${escapeHtml(referrerName)} (${escapeHtml(referrerEmail)}). 
          If you didn't expect this email, you can safely ignore it.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Generate plain text email template for referral invitation
 */
const generatePlainTextEmail = (
  referrerName: string,
  referrerEmail: string,
  referralLink: string
): string => {
  return `Hi there! 👋

My name is ${referrerName}, and I'd like to invite you to join IQniti - the productivity platform that's changing how I work!

IQniti is offering exclusive early access, and by using my referral link, you'll get special benefits when you join.

Join here: ${referralLink}

What you'll get:
- Early access to new features
- Exclusive rewards and badges
- Priority support

Looking forward to seeing you on IQniti!

Best regards,
${referrerName}

---
This invitation was sent by ${referrerName} (${referrerEmail}). 
If you didn't expect this email, you can safely ignore it.`;
};

/**
 * Escape HTML to prevent XSS
 */
const escapeHtml = (text: string): string => {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
};

