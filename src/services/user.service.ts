import prisma from "../config/prisma.js";
import bcrypt from "bcrypt";
import type { ChangePasswordRequest, CreateUserRequest } from "../types/user.types.js";

const SALT_ROUNDS = 10;


const createUser = async (data: CreateUserRequest) => {
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

  // Extract language from data and remove it from user data
  const { language, ...userData } = data;

  // Hash password if provided
  if (userData.password) {
    userData.password = await bcrypt.hash(userData.password, SALT_ROUNDS);
  }

  // Create user and user settings in a transaction
  return prisma.$transaction(async (tx) => {
    // Create the user
    const user = await tx.user.create({ data: userData });

    // Create user settings with language
    await (tx as any).userSettings.create({
      data: {
        userId: user.id,
        language: language || "english" // Default to "english" if not provided
      }
    });

    return user;
  });
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
      // company_size: true,
      // company_description: true,
      // founded_year: true,
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
      // Work Duration Preferences (AI Recommendation System)
      deep_work_start_time: true,
      deep_work_end_time: true,
      creative_work_start_time: true,
      creative_work_end_time: true,
      reflective_work_start_time: true,
      reflective_work_end_time: true,
      executive_work_start_time: true,
      executive_work_end_time: true,
      credits: true,
      credit_refresh_period: true,
      credit_refresh_amount: true,
      last_credit_refresh: true,
      created_at: true,
      // updated_at: true,
      // userSettings: {
      //   select: {
      //     language: true
      //   }
      // },
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

const updateProfilePhoto = async (userId: number, photoUrl: string) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { profile_photo_url: photoUrl },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
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
      // Work Duration Preferences (AI Recommendation System)
      deep_work_start_time: true,
      deep_work_end_time: true,
      creative_work_start_time: true,
      creative_work_end_time: true,
      reflective_work_start_time: true,
      reflective_work_end_time: true,
      executive_work_start_time: true,
      executive_work_end_time: true,
      credits: true,
      credit_refresh_period: true,
      credit_refresh_amount: true,
      last_credit_refresh: true,
      created_at: true,
    }
  });

  return user;
};

export {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  changePassword,
  updateProfilePhoto,
};