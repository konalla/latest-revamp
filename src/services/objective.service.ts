import prisma from "../config/prisma";
import type { Objective, Prisma } from "../generated/prisma/index";
import type { CreateObjectiveRequest, UpdateObjectiveRequest, ObjectiveQueryParams } from "../types/objective.types";

// Helper function to verify project ownership
const verifyProjectOwnership = async (projectId: number, userId: number) => {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });
  return !!project;
};

const createObjective = async (data: CreateObjectiveRequest, userId: number) => {
  // If projectId is provided, verify that the user owns the project
  if (data.projectId) {
    const ownsProject = await verifyProjectOwnership(data.projectId, userId);
    if (!ownsProject) {
      throw new Error("Project not found or access denied");
    }
  }

  // Handle field mapping between camelCase (frontend) and snake_case (database)
  const mappedData: any = { ...data, userId };
  
  // Map camelCase to snake_case for date fields if they exist
  if ('startDate' in mappedData) {
    mappedData.start_date = mappedData.startDate;
    delete mappedData.startDate;
  }
  if ('endDate' in mappedData) {
    mappedData.end_date = mappedData.endDate;
    delete mappedData.endDate;
  }

  return prisma.objective.create({
    data: mappedData,
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      ...(data.projectId && {
        project: {
          select: { id: true, name: true },
        },
      }),
      plans: {
        select: {
          id: true,
          name: true,
          status: true,
          project: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });
};

const getObjectivesByProject = async (projectId: number, userId: number, queryParams: ObjectiveQueryParams = {}) => {
  // Verify that the user owns the project
  const ownsProject = await verifyProjectOwnership(projectId, userId);
  if (!ownsProject) {
    throw new Error("Project not found or access denied");
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

  // Build where clause - find objectives through plans
  const where: Prisma.ObjectiveWhereInput = {
    userId,
    plans: {
      some: {
        projectId
      }
    },
    ...(status && { status }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  // Build orderBy clause
  const orderBy: Prisma.ObjectiveOrderByWithRelationInput = {};
  if (sortBy === 'name') {
    orderBy.name = sortOrder;
  } else if (sortBy === 'created_at') {
    orderBy.created_at = sortOrder;
  } else if (sortBy === 'start_date') {
    orderBy.start_date = sortOrder;
  } else if (sortBy === 'end_date') {
    orderBy.end_date = sortOrder;
  } else {
    orderBy.position = sortOrder;
  }

  const [objectives, total] = await Promise.all([
    prisma.objective.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        plans: {
          select: {
            id: true,
            name: true,
            status: true,
            project: {
              select: { id: true, name: true },
            },
          },
        },
      },
    }),
    prisma.objective.count({ where }),
  ]);

  return { objectives, total };
};

const getAllObjectivesByUser = async (userId: number, queryParams: ObjectiveQueryParams = {}) => {
  const { 
    page = 1, 
    limit = 10, 
    status, 
    search,
    sortBy = 'created_at',
    sortOrder = 'desc'
  } = queryParams;
  
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Prisma.ObjectiveWhereInput = {
    userId,
    ...(status && { status }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  // Build orderBy clause
  const orderBy: Prisma.ObjectiveOrderByWithRelationInput = {};
  if (sortBy === 'name') {
    orderBy.name = sortOrder;
  } else if (sortBy === 'created_at') {
    orderBy.created_at = sortOrder;
  } else if (sortBy === 'start_date') {
    orderBy.start_date = sortOrder;
  } else if (sortBy === 'end_date') {
    orderBy.end_date = sortOrder;
  } else {
    orderBy.position = sortOrder;
  }

  const [objectives, total] = await Promise.all([
    prisma.objective.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        plans: {
          select: {
            id: true,
            name: true,
            status: true,
            project: {
              select: { id: true, name: true },
            },
          },
        },
      },
    }),
    prisma.objective.count({ where }),
  ]);

  return { objectives, total };
};

const getObjectiveById = async (id: number, userId: number) => {
  return prisma.objective.findFirst({
    where: { 
      id, 
      userId,
    },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      plans: {
        select: {
          id: true,
          name: true,
          status: true,
          project: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });
};

const updateObjective = async (id: number, userId: number, data: UpdateObjectiveRequest) => {
  // First check if the objective belongs to the user
  const existingObjective = await prisma.objective.findFirst({
    where: { 
      id, 
      userId,
    },
  });

  if (!existingObjective) {
    return null;
  }

  // Handle field mapping between camelCase (frontend) and snake_case (database)
  const mappedData: any = { ...data };
  
  // Map camelCase to snake_case for date fields if they exist
  if ('startDate' in mappedData) {
    mappedData.start_date = mappedData.startDate;
    delete mappedData.startDate;
  }
  if ('endDate' in mappedData) {
    mappedData.end_date = mappedData.endDate;
    delete mappedData.endDate;
  }

  return prisma.objective.update({
    where: { id },
    data: mappedData,
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      plans: {
        select: {
          id: true,
          name: true,
          status: true,
          project: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });
};

const deleteObjective = async (id: number, userId: number) => {
  // First check if the objective belongs to the user
  const existingObjective = await prisma.objective.findFirst({
    where: { 
      id, 
      userId,
    },
  });

  if (!existingObjective) {
    return null;
  }

  return prisma.objective.delete({
    where: { id },
  });
};

const reorderObjectives = async (
  projectId: number,
  userId: number,
  objectiveIds: number[]
) => {
  // Verify that the user owns the project
  const ownsProject = await verifyProjectOwnership(projectId, userId);
  if (!ownsProject) {
    throw new Error("Project not found or access denied");
  }

  // Update positions in a transaction
  const updatePromises = objectiveIds.map((objectiveId, index) =>
    prisma.objective.updateMany({
      where: {
        id: objectiveId,
        userId,
        plans: {
          some: {
            projectId
          }
        }
      },
      data: { position: index },
    })
  );

  await prisma.$transaction(updatePromises);

  // Return updated objectives
  return getObjectivesByProject(projectId, userId);
};

const getObjectiveStats = async (userId: number) => {
  const objectives = await prisma.objective.findMany({
    where: { userId },
    include: {
      okrs: true,
      tasks: true,
    },
  });

  const stats = {
    total: objectives.length,
    active: 0,
    completed: 0,
    paused: 0,
    totalOkrs: 0,
    totalTasks: 0,
    completedTasks: 0,
  };

  objectives.forEach((objective) => {
    switch (objective.status) {
      case 'active':
        stats.active++;
        break;
      case 'completed':
        stats.completed++;
        break;
      case 'paused':
        stats.paused++;
        break;
    }

    stats.totalOkrs += objective.okrs.length;
    stats.totalTasks += objective.tasks.length;
    stats.completedTasks += objective.tasks.filter((task) => task.completed).length;
  });

  return stats;
};

export {
  createObjective,
  getObjectivesByProject,
  getAllObjectivesByUser,
  getObjectiveById,
  updateObjective,
  deleteObjective,
  reorderObjectives,
  getObjectiveStats,
};