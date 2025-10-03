import prisma from "../config/prisma.js";
import bcrypt from "bcrypt";
import type { ChangePasswordRequest } from "../types/user.types.js";

const SALT_ROUNDS = 10;


const createUser = async (data: any) => {
  // Check for duplicates if email or username are provided
  if (data.email || data.username) {
    const existingUserByEmail = data.email ? await prisma.user.findUnique({
      where: { email: data.email }
    }) : null;

    const existingUserByUsername = data.username ? await prisma.user.findUnique({
      where: { username: data.username }
    }) : null;

    // Handle duplicate user scenarios
    if (existingUserByEmail && existingUserByUsername) {
      throw new Error("Both email and username already exist");
    } else if (existingUserByEmail) {
      throw new Error("Email already exists");
    } else if (existingUserByUsername) {
      throw new Error("Username already exists");
    }
  }

  // Hash password if provided
  if (data.password) {
    data.password = await bcrypt.hash(data.password, SALT_ROUNDS);
  }

  return prisma.user.create({ data });
};

const getAllUsers = async () => {
  return prisma.user.findMany();
};

const getUserById = async (id: number) => {
  return prisma.user.findUnique({ 
    where: { id },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      password: true,
      role: true,
      phone_number: true,
      company_name: true,
      website: true,
      profile_photo_url: true,
      job_title: true,
      industry: true,
      bio: true,
      timezone: true,
      linkedin_url: true,
      website_url: true,
      secondary_social_url: true,
      secondary_social_type: true,
      preferred_working_hours: true,
      communication_preference: true,
      primary_work_focus: true,
      profile_completion_percentage: true,
      last_profile_update: true,
      credits: true,
      credit_refresh_period: true,
      credit_refresh_amount: true,
      last_credit_refresh: true,
      created_at: true,
      // Explicitly exclude relations
      projects: false,
      objectives: false,
      okrs: false,
      tasks: false
    }
  });
};

const updateUser = async (id: number, data: any) => {
  return prisma.user.update({ where: { id }, data });
};

const deleteUser = async (id: number) => {
  return prisma.user.delete({ where: { id } });
};

const changePassword = async (userId: number, data: ChangePasswordRequest) => {
  // Get the current user with password
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true }
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Verify current password
  const isCurrentPasswordValid = await bcrypt.compare(data.currentPassword, user.password);
  if (!isCurrentPasswordValid) {
    throw new Error("Current password is incorrect");
  }

  // Hash the new password
  const hashedNewPassword = await bcrypt.hash(data.newPassword, SALT_ROUNDS);

  // Update the password
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedNewPassword }
  });

  return { message: "Password changed successfully" };
};

export {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  changePassword,
};