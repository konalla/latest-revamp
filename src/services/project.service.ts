import prisma from "../config/prisma";
import type { Project, Prisma } from "../generated/prisma/index";
import type { CreateProjectRequest, UpdateProjectRequest, ProjectQueryParams } from "../types/project.types";

const createProject = async (data: CreateProjectRequest, userId: number) => {
  return prisma.project.create({
    data: {
      ...data,
      userId,
    },
  });
};

const getAllProjectsByUser = async (userId: number, queryParams: ProjectQueryParams = {}) => {
  const { page = 1, limit = 10, status, visibility, search } = queryParams;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Prisma.ProjectWhereInput = {
    userId,
    ...(status && { status }),
    ...(visibility && { visibility }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.project.count({ where }),
  ]);

  return { projects, total };
};

const getProjectById = async (id: number, userId: number) => {
  return prisma.project.findFirst({
    where: { id, userId },
  });
};

const updateProject = async (id: number, userId: number, data: UpdateProjectRequest) => {
  // First check if the project belongs to the user
  const existingProject = await prisma.project.findFirst({
    where: { id, userId },
  });

  if (!existingProject) {
    return null;
  }

  return prisma.project.update({
    where: { id },
    data,
  });
};

const deleteProject = async (id: number, userId: number) => {
  // First check if the project belongs to the user
  const existingProject = await prisma.project.findFirst({
    where: { id, userId },
  });

  if (!existingProject) {
    return null;
  }

  return prisma.project.delete({
    where: { id },
  });
};

const getProjectStats = async (userId: number) => {
  const [totalProjects, activeProjects, completedProjects] = await Promise.all([
    prisma.project.count({ where: { userId } }),
    prisma.project.count({ where: { userId, status: 'active' } }),
    prisma.project.count({ where: { userId, status: 'completed' } }),
  ]);

  return {
    total: totalProjects,
    active: activeProjects,
    completed: completedProjects,
  };
};

export {
  createProject,
  getAllProjectsByUser,
  getProjectById,
  updateProject,
  deleteProject,
  getProjectStats,
};
