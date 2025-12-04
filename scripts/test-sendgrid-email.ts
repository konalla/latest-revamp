import dotenv from "dotenv";
import sgMail from "@sendgrid/mail";

// Load environment variables
dotenv.config();

async function testSendGridEmail() {
  // Get environment variables
  const apiKey = process.env.SEND_GRID_API_KEY;
  const fromEmail = process.env.SEND_GRID_EMAIL;
  const toEmail = "ahmadkashif983dev@gmail.com";

  // Validate environment variables
  if (!apiKey) {
    console.error("❌ Error: SEND_GRID_API_KEY is not set in environment variables");
    process.exit(1);
  }

  if (!fromEmail) {
    console.error("❌ Error: SEND_GRID_EMAIL is not set in environment variables");
    process.exit(1);
  }

  console.log("📧 Testing SendGrid email configuration...");
  console.log(`From: ${fromEmail}`);
  console.log(`To: ${toEmail}`);
  console.log("");

  // Set SendGrid API key
  sgMail.setApiKey(apiKey);

  // Email message
  const msg = {
    to: toEmail,
    from: fromEmail,
    subject: "Test Email from IQniti Backend",
    text: "Hi Ahmed Kashif\n\nThis is a test email to verify SendGrid configuration is working correctly.",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4A6CF7;">Test Email from IQniti Backend</h2>
        <p>Hi Ahmed Kashif,</p>
        <p>This is a test email to verify SendGrid configuration is working correctly.</p>
        <p>If you received this email, it means:</p>
        <ul>
          <li>✅ SendGrid API key is valid</li>
          <li>✅ Sender email is verified</li>
          <li>✅ Email service is configured correctly</li>
        </ul>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          This is an automated test email. You can safely ignore it.
        </p>
      </div>
    `,
  };

  try {
    // Send email
    const [response] = await sgMail.send(msg);
    console.log("✅ Email sent successfully!");
    console.log("\n📋 SendGrid Response:");
    console.log("Status Code:", response.statusCode);
    if (response.headers) {
      console.log("Message ID:", response.headers['x-message-id'] || 'N/A');
    }
    console.log("\n📬 Check the inbox of:", toEmail);
    console.log("⚠️  Also check SPAM/JUNK folder!");
    console.log("\n💡 Troubleshooting Steps:");
    console.log("1. Check SendGrid Dashboard > Activity Feed for delivery status");
    console.log("2. Verify sender email (", fromEmail, ") is authenticated in SendGrid");
    console.log("3. Check spam/junk folder in Gmail");
    console.log("4. Wait 2-5 minutes - emails can be delayed");
    console.log("5. Check SendGrid Activity Feed: https://app.sendgrid.com/email_activity");
  } catch (error: any) {
    console.error("❌ Error sending email:");
    
    if (error.response) {
      console.error("\nStatus Code:", error.response.statusCode);
      console.error("Response Body:", JSON.stringify(error.response.body, null, 2));
      
      // Common SendGrid errors
      if (error.response.body?.errors) {
        console.error("\n🔍 Error Details:");
        error.response.body.errors.forEach((err: any) => {
          console.error(`  - ${err.message}`);
          if (err.field) console.error(`    Field: ${err.field}`);
          if (err.help) console.error(`    Help: ${err.help}`);
        });
      }
    } else {
      console.error("Error:", error.message);
      console.error("Full error:", error);
    }
    
    process.exit(1);
  }
}

// Run the test
testSendGridEmail()
  .then(() => {
    console.log("\n✨ Test completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });

