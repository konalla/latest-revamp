import bcrypt from "bcrypt";
import crypto from "crypto";
import prisma from "../config/prisma.js";
import type { 
  LoginRequest, 
  RegisterRequest, 
  AuthResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ResetPasswordRequest,
  ResetPasswordResponse
} from "../types/auth.types.js";
import { generateToken } from "../utils/jwt.utils.js";
import { ensureWorkspaceAndTeamForUser } from "./workspace.service.js";
import { subscriptionService } from "./subscription.service.js";
import { sendPasswordResetEmail } from "./email.service.js";
import { referralService } from "./referral.service.js";
import { webhookService } from "./webhook.service.js";

const SALT_ROUNDS = 10;

const register = async (data: RegisterRequest): Promise<AuthResponse> => {
  // Check if user with email already exists
  const existingUserByEmail = await prisma.user.findUnique({
    where: { email: data.email }
  });

  // Check if user with username already exists
  const existingUserByUsername = await prisma.user.findUnique({
    where: { username: data.username }
  });

  // Handle duplicate user scenarios
  if (existingUserByEmail && existingUserByUsername) {
    throw new Error("Both email and username already exist");
  } else if (existingUserByEmail) {
    throw new Error("Email already exists");
  } else if (existingUserByUsername) {
    throw new Error("Username already exists");
  }

  // Hash the password
  const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

  // Create the user
  const user = await prisma.user.create({
    data: {
      email: data.email,
      password: hashedPassword,
      username: data.username,
      name: data.name,
    },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      role: true,
    }
  });

  // Ensure workspace and team exist for this user
  await ensureWorkspaceAndTeamForUser(user.id, user.name, user.username);

  // Register referral if referral code is provided
  if (data.referralCode) {
    try {
      await referralService.registerReferral(user.id, data.referralCode);
    } catch (error: any) {
      // Log error but don't fail registration if referral fails
      console.error("Error registering referral during signup:", error);
    }
  }

  // Send signup webhook asynchronously (don't block registration)
  // Get the full user profile with all necessary data for webhook
  const fullUserData = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      phone_number: true,
      created_at: true,
      // Job & Company info
      job_title: true,
      company_name: true,
      company_size: true,
      company_description: true,
      industry: true,
      // Profile info
      bio: true,
      website: true,
      linkedin_url: true,
      website_url: true,
      timezone: true,
      profile_photo_url: true,
      // Referral status for badge info
      referralStatus: {
        select: {
          earlyAccessStatus: true,
          originId: true,
          vanguardId: true,
        },
      },
    },
  });

  if (fullUserData) {
    // Send webhook asynchronously - don't block registration
    webhookService
      .sendSignupWebhook({
        id: fullUserData.id,
        email: fullUserData.email,
        username: fullUserData.username,
        name: fullUserData.name,
        phone_number: fullUserData.phone_number,
        created_at: fullUserData.created_at,
        job_title: fullUserData.job_title,
        company_name: fullUserData.company_name,
        company_size: fullUserData.company_size,
        company_description: fullUserData.company_description,
        industry: fullUserData.industry,
        bio: fullUserData.bio,
        website: fullUserData.website,
        linkedin_url: fullUserData.linkedin_url,
        website_url: fullUserData.website_url,
        timezone: fullUserData.timezone,
        profile_photo_url: fullUserData.profile_photo_url,
        referralStatus: fullUserData.referralStatus,
      })
      .catch((error) => {
        // Log error but don't throw - registration is already successful
        // Webhook failures should not affect user registration
        console.error("Failed to send signup webhook (non-blocking):", error.message || error);
      });
  }

  // Note: Users need to select a subscription plan after registration
  // They can choose the free plan (POST /api/subscriptions/subscribe-free) or a paid plan (POST /api/subscriptions/checkout)
  // The free plan does not require payment, while paid plans require Stripe checkout

  // Check if user needs to select a plan
  const needsPaymentSetup = true; // New users always need to select a plan (free or paid)

  // Generate JWT token
  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  return {
    user,
    token,
    message: "User registered successfully",
    needsPaymentSetup, // Flag to indicate frontend should redirect to payment setup
  };
};

const login = async (data: LoginRequest): Promise<AuthResponse> => {
  // Find user by email or username
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: data.identifier },
        { username: data.identifier }
      ]
    }
  });

  if (!user) {
    throw new Error("Invalid credentials");
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(data.password, user.password);

  if (!isPasswordValid) {
    throw new Error("Invalid credentials");
  }

  // Prevent admin users from logging into customer app
  // Admin users must use /api/admin/auth/login endpoint
  if (user.role === "ADMIN") {
    throw new Error("Admin users must login through the admin panel");
  }

  // Ensure workspace/team backfill for existing users
  try {
    await ensureWorkspaceAndTeamForUser(user.id, user.name, user.username);
  } catch (e) {
    // Non-fatal for login
  }

  // Check if user needs to set up payment method
  // User needs payment setup if they don't have a subscription with Stripe customer ID
  const subscription = await prisma.subscription.findUnique({
    where: { userId: user.id },
  });
  
  const needsPaymentSetup = !subscription || !subscription.stripeCustomerId;

  // Generate JWT token
  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      role: user.role,
    },
    token,
    message: "Login successful",
    needsPaymentSetup, // Flag to indicate if user needs to set up payment method
  };
};

const logout = async (): Promise<{ message: string }> => {
  // Since JWT tokens are stateless, logout is primarily handled on the client side
  // by removing the token from storage. This endpoint provides a confirmation
  // and can be used for logging purposes or future token blacklisting features.
  
  return {
    message: "Logout successful"
  };
};

const forgotPassword = async (data: ForgotPasswordRequest): Promise<ForgotPasswordResponse> => {
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    throw new Error("Invalid email format");
  }

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: data.email.toLowerCase().trim() },
    select: {
      id: true,
      email: true,
      name: true,
    }
  });

  // Always return success message (don't reveal if email exists)
  // This prevents email enumeration attacks
  if (!user) {
    return {
      message: "If an account with that email exists, a password reset link has been sent."
    };
  }

  // Generate secure reset token (64 characters)
  const resetToken = crypto.randomBytes(32).toString("hex");

  // Set token expiry (1 hour from now)
  const resetTokenExpiry = new Date();
  resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1);

  // Store reset token and expiry in database
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetToken,
      resetTokenExpiry,
    }
  });

  // Send password reset email
  try {
    await sendPasswordResetEmail(user.email, user.name, resetToken);
  } catch (error) {
    // If email sending fails, clear the token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: null,
        resetTokenExpiry: null,
      }
    });
    throw new Error("Failed to send password reset email. Please try again later.");
  }

  return {
    message: "If an account with that email exists, a password reset link has been sent."
  };
};

const resetPassword = async (data: ResetPasswordRequest): Promise<ResetPasswordResponse> => {
  // Validate token
  if (!data.token || data.token.length !== 64) {
    throw new Error("Invalid or expired reset token");
  }

  // Validate password
  if (!data.newPassword || data.newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }

  // Find user by reset token
  const user = await prisma.user.findUnique({
    where: { resetToken: data.token },
    select: {
      id: true,
      resetToken: true,
      resetTokenExpiry: true,
    }
  });

  if (!user) {
    throw new Error("Invalid or expired reset token");
  }

  // Check if token has expired
  if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
    // Clear expired token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: null,
        resetTokenExpiry: null,
      }
    });
    throw new Error("Invalid or expired reset token");
  }

  // Hash the new password
  const hashedPassword = await bcrypt.hash(data.newPassword, SALT_ROUNDS);

  // Update password and clear reset token
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null,
    }
  });

  return {
    message: "Password reset successfully. You can now login with your new password."
  };
};

export {
  register,
  login,
  logout,
  forgotPassword,
  resetPassword,
};
