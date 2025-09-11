import prisma from "../config/prisma";
import type { User, Prisma } from "../generated/prisma/index";

const createUser = async (data: Prisma.UserCreateInput) => {
  return prisma.user.create({ data });
};

const getAllUsers = async () => {
  return prisma.user.findMany();
};

const getUserById = async (id: number) => {
  return prisma.user.findUnique({ where: { id } });
};

const updateUser = async (id: number, data: Prisma.UserUpdateInput) => {
  return prisma.user.update({ where: { id }, data });
};

const deleteUser = async (id: number) => {
  return prisma.user.delete({ where: { id } });
};

export {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
};