import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import type { LoginRequest, RegisterRequest, AuthResponse } from "../types/auth.types.js";
import { generateToken } from "../utils/jwt.utils.js";
import { ensureWorkspaceAndTeamForUser } from "./workspace.service.js";
import { subscriptionService } from "./subscription.service.js";

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

  // Note: Trial subscription will be created when user sets up payment method
  // via POST /api/subscriptions/setup-clarity-plan endpoint
  // This allows us to collect payment method upfront for seamless upgrades

  // Check if user needs to set up payment method
  const needsPaymentSetup = true; // New users always need to set up payment

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

export {
  register,
  login,
  logout,
};
