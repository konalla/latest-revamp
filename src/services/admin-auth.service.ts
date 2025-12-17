import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import { generateToken } from "../utils/jwt.utils.js";
import type { LoginRequest, AuthResponse } from "../types/auth.types.js";

const SALT_ROUNDS = 10;

/**
 * Admin login service
 * Only allows users with ADMIN role to login
 */
export const adminLogin = async (data: LoginRequest): Promise<AuthResponse> => {
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

  // Check if user is admin
  if (user.role !== "ADMIN") {
    throw new Error("Admin access required");
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(data.password, user.password);

  if (!isPasswordValid) {
    throw new Error("Invalid credentials");
  }

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
    message: "Admin login successful",
  };
};



