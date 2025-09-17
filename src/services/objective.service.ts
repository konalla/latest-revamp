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
  // Verify that the user owns the project
  const ownsProject = await verifyProjectOwnership(data.projectId, userId);
  if (!ownsProject) {
    throw new Error("Project not found or access denied");
  }

  return prisma.objective.create({
    data: {
      ...data,
      userId,
    },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      project: {
        select: { id: true, name: true },
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

  // Build where clause
  const where: Prisma.ObjectiveWhereInput = {
    projectId,
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
        project: {
          select: { id: true, name: true },
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

  // Build where clause - only objectives for projects owned by the user
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
        project: {
          select: { id: true, name: true },
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
      // Also ensure the project belongs to the user
      project: {
        userId,
      },
    },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      project: {
        select: { id: true, name: true },
      },
    },
  });
};

const updateObjective = async (id: number, userId: number, data: UpdateObjectiveRequest) => {
  // First check if the objective belongs to the user and the user owns the project
  const existingObjective = await prisma.objective.findFirst({
    where: { 
      id, 
      userId,
      project: {
        userId,
      },
    },
  });

  if (!existingObjective) {
    return null;
  }

  return prisma.objective.update({
    where: { id },
    data,
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      project: {
        select: { id: true, name: true },
      },
    },
  });
};

const deleteObjective = async (id: number, userId: number) => {
  // First check if the objective belongs to the user and the user owns the project
  const existingObjective = await prisma.objective.findFirst({
    where: { 
      id, 
      userId,
      project: {
        userId,
      },
    },
  });

  if (!existingObjective) {
    return null;
  }

  return prisma.objective.delete({
    where: { id },
  });
};

const updateObjectivePositions = async (objectivePositions: { id: number; position: number }[], userId: number) => {
  // Verify all objectives belong to the user and their projects are owned by the user
  const objectiveIds = objectivePositions.map(op => op.id);
  
  const existingObjectives = await prisma.objective.findMany({
    where: {
      id: { in: objectiveIds },
      userId,
      project: {
        userId,
      },
    },
  });

  if (existingObjectives.length !== objectiveIds.length) {
    throw new Error("One or more objectives not found or access denied");
  }

  // Update positions in a transaction
  const updatePromises = objectivePositions.map(({ id, position }) =>
    prisma.objective.update({
      where: { id },
      data: { position },
    })
  );

  return Promise.all(updatePromises);
};

const getObjectiveStats = async (userId: number, projectId?: number) => {
  const whereClause: Prisma.ObjectiveWhereInput = {
    userId,
    project: {
      userId,
    },
    ...(projectId && { projectId }),
  };

  const [totalObjectives, activeObjectives, completedObjectives, pendingObjectives] = await Promise.all([
    prisma.objective.count({ where: whereClause }),
    prisma.objective.count({ where: { ...whereClause, status: 'active' } }),
    prisma.objective.count({ where: { ...whereClause, status: 'completed' } }),
    prisma.objective.count({ where: { ...whereClause, status: 'pending' } }),
  ]);

  return {
    total: totalObjectives,
    active: activeObjectives,
    completed: completedObjectives,
    pending: pendingObjectives,
  };
};

export {
  createObjective,
  getObjectivesByProject,
  getAllObjectivesByUser,
  getObjectiveById,
  updateObjective,
  deleteObjective,
  updateObjectivePositions,
  getObjectiveStats,
};
