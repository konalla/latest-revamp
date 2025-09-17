import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import type { LoginRequest, RegisterRequest, AuthResponse } from "../types/auth.types.js";
import { generateToken } from "../utils/jwt.utils.js";

const SALT_ROUNDS = 10;

const register = async (data: RegisterRequest): Promise<AuthResponse> => {
  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email }
  });

  if (existingUser) {
    throw new Error("User with this email already exists");
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

  // Generate JWT token
  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  return {
    user,
    token,
    message: "User registered successfully"
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
    message: "Login successful"
  };
};

export {
  register,
  login,
};
