import prisma from "../config/prisma.js";
import type { CreateUserSettingsRequest, UpdateUserSettingsRequest } from "../types/user-settings.types.js";

const getUserSettings = async (userId: number) => {
  let userSettings = await prisma.userSettings.findUnique({
    where: { userId }
  });

  // If no settings exist, create default settings
  if (!userSettings) {
    userSettings = await prisma.userSettings.create({
      data: {
        userId,
        language: "english"
      }
    });
  }

  return userSettings;
};

const createUserSettings = async (userId: number, data: CreateUserSettingsRequest) => {
  // Check if settings already exist
  const existingSettings = await prisma.userSettings.findUnique({
    where: { userId }
  });

  if (existingSettings) {
    throw new Error("User settings already exist");
  }

  return prisma.userSettings.create({
    data: {
      userId,
      language: data.language || "english"
    }
  });
};

const updateUserSettings = async (userId: number, data: UpdateUserSettingsRequest) => {
  return prisma.userSettings.upsert({
    where: { userId },
    update: data,
    create: {
      userId,
      language: data.language || "english"
    }
  });
};

const deleteUserSettings = async (userId: number) => {
  return prisma.userSettings.delete({
    where: { userId }
  });
};

export {
  getUserSettings,
  createUserSettings,
  updateUserSettings,
  deleteUserSettings,
};
