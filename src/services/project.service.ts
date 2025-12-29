import prisma from "../config/prisma.js";
import { subscriptionService } from "./subscription.service.js";

import type { CreateProjectRequest, UpdateProjectRequest, ProjectQueryParams } from "../types/project.types.js";
import type { OkrQueryParams } from "../types/okr.types.js";

const createProject = async (data: CreateProjectRequest, userId: number) => {
  // Check subscription limits
  const canCreate = await subscriptionService.canCreateProject(userId);
  if (!canCreate.canCreate) {
    throw new Error(canCreate.reason || "Cannot create project");
  }

  const project = await prisma.project.create({
    data: {
      ...data,
      userId,
    },
  });

  // Increment project counter
  await subscriptionService.incrementProjectCount(userId);

  return project;
};

const getAllProjectsByUser = async (userId: number, queryParams: ProjectQueryParams = {}) => {
  const { page = 1, limit = 10, status, visibility, search } = queryParams;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {
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

const getProjectTasks = async (projectId: number, userId: number) => {
  // First check if the project belongs to the user
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });

  if (!project) {
    return null;
  }

  // Get all tasks for this project
  return prisma.task.findMany({
    where: { 
      projectId,
      userId, // Ensure user can only see their own tasks
    },
    orderBy: { createdAt: 'desc' },
  });
};

const getProjectObjectives = async (projectId: number, userId: number) => {
  // First check if the project belongs to the user
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });

  if (!project) {
    return null;
  }

  // Get all objectives for this project
  return prisma.objective.findMany({
    where: { 
      projectId,
      userId, // Ensure user can only see their own objectives
    },
    orderBy: { created_at: 'desc' },
  });
};

const getProjectKeyResults = async (projectId: number, userId: number, queryParams: OkrQueryParams = {}) => {
  // First check if the project belongs to the user
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });

  if (!project) {
    return null;
  }

  const { 
    page = 1, 
    limit = 10, 
    status, 
    search,
    sortBy = 'position',
    sortOrder = 'asc'
  } = queryParams;
  
  const skip = (page - 1) * limit;

  // Build where clause to find OKRs connected to this project through Plans or Objectives
  const where: any = {
    userId, // Ensure user can only see their own OKRs
    OR: [
      // OKRs connected through Plans
      {
        plan: {
          projectId,
        },
      },
      // OKRs connected through Objectives
      {
        objective: {
          projectId,
        },
      },
    ],
    ...(status && { status }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  // Build orderBy clause
  const orderBy: any = {};
  if (sortBy === 'title') {
    orderBy.title = sortOrder;
  } else if (sortBy === 'createdAt') {
    orderBy.createdAt = sortOrder;
  } else if (sortBy === 'startDate') {
    orderBy.startDate = sortOrder;
  } else if (sortBy === 'endDate') {
    orderBy.endDate = sortOrder;
  } else if (sortBy === 'currentValue') {
    orderBy.currentValue = sortOrder;
  } else {
    orderBy.position = sortOrder;
  }

  const [okrs, total] = await Promise.all([
    prisma.okr.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        objective: {
          select: { 
            id: true, 
            name: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
            status: true,
            project: {
              select: { id: true, name: true },
            },
            objective: {
              select: { id: true, name: true },
            },
          },
        },
      },
    }),
    prisma.okr.count({ where }),
  ]);

  return { okrs, total };
};

export {
  createProject,
  getAllProjectsByUser,
  getProjectById,
  updateProject,
  deleteProject,
  getProjectStats,
  getProjectTasks,
  getProjectObjectives,
  getProjectKeyResults,
};
