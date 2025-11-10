import prisma from "../config/prisma.js";

import type { 
  CreateOkrRequest, 
  UpdateOkrRequest, 
  UpdateOkrProgressRequest,
  OkrQueryParams 
} from "../types/okr.types.js";

// Helper function to verify objective ownership
const verifyObjectiveOwnership = async (objectiveId: number, userId: number) => {
  const objective = await prisma.objective.findFirst({
    where: { 
      id: objectiveId, 
      userId,
    },
  });
  return !!objective;
};

// Helper function to verify plan ownership
const verifyPlanOwnership = async (planId: number, userId: number) => {
  const plan = await prisma.plan.findFirst({
    where: {
      id: planId,
      OR: [
        { project: { userId } },
        { objective: { userId } }
      ]
    },
  });
  return !!plan;
};

const createOkr = async (data: CreateOkrRequest, userId: number) => {
  // Verify ownership based on what's provided
  if (data.objectiveId) {
    const ownsObjective = await verifyObjectiveOwnership(data.objectiveId, userId);
    if (!ownsObjective) {
      throw new Error("Objective not found or access denied");
    }
  }

  if (data.planId) {
    const ownsPlan = await verifyPlanOwnership(data.planId, userId);
    if (!ownsPlan) {
      throw new Error("Plan not found or access denied");
    }
  }

  if (!data.objectiveId && !data.planId) {
    throw new Error("Either objectiveId or planId must be provided");
  }

  const includeConfig: any = {
    user: {
      select: { id: true, name: true, email: true },
    },
  };

  if (data.objectiveId) {
    includeConfig.objective = {
      select: { 
        id: true, 
        name: true,
      },
    };
  }

  if (data.planId) {
    includeConfig.plan = {
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
    };
  }

  return prisma.okr.create({
    data: {
      ...data,
      userId,
      keyResults: data.keyResults || [],
      progressHistory: [],
    },
    include: includeConfig,
  });
};

const getOkrsByObjective = async (objectiveId: number, userId: number, queryParams: OkrQueryParams = {}) => {
  // Verify that the user owns the objective
  const ownsObjective = await verifyObjectiveOwnership(objectiveId, userId);
  if (!ownsObjective) {
    throw new Error("Objective not found or access denied");
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
  const where: any = {
    objectiveId,
    userId,
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
            project: {
              select: { 
                id: true, 
                name: true 
              },
            },
          },
        },
      },
    }),
    prisma.okr.count({ where }),
  ]);

  return { okrs, total };
};

const getAllOkrsByUser = async (userId: number, queryParams: OkrQueryParams = {}) => {
  const { 
    page = 1, 
    limit = 10, 
    status, 
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = queryParams;
  
  const skip = (page - 1) * limit;

  // Build where clause - only OKRs owned by the user
  const where: any = {
    userId,
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
            project: {
              select: { 
                id: true, 
                name: true 
              },
            },
          },
        },
      },
    }),
    prisma.okr.count({ where }),
  ]);

  return { okrs, total };
};

const getOkrById = async (id: number, userId: number) => {
  return prisma.okr.findFirst({
    where: { 
      id, 
      userId,
    },
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
    },
  });
};

const updateOkr = async (id: number, userId: number, data: UpdateOkrRequest) => {
  // First check if the OKR belongs to the user and verify objective ownership
  const existingOkr = await prisma.okr.findFirst({
    where: { 
      id, 
      userId,
    },
  });

  if (!existingOkr) {
    return null;
  }

  return prisma.okr.update({
    where: { id },
    data,
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
    },
  });
};

const updateOkrProgress = async (id: number, userId: number, data: UpdateOkrProgressRequest) => {
  // First check if the OKR belongs to the user and verify objective ownership
  const existingOkr = await prisma.okr.findFirst({
    where: { 
      id, 
      userId,
    },
  });

  if (!existingOkr) {
    return null;
  }

  // Update progress history if provided
  let updatedProgressHistory = existingOkr.progressHistory as any[];
  if (data.progressUpdate) {
    updatedProgressHistory = [
      ...updatedProgressHistory,
      {
        ...data.progressUpdate,
        timestamp: new Date(),
      }
    ];
  }

  return prisma.okr.update({
    where: { id },
    data: {
      currentValue: data.currentValue,
      ...(data.confidenceScore && { confidenceScore: data.confidenceScore }),
      progressHistory: updatedProgressHistory,
    },
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
    },
  });
};

const deleteOkr = async (id: number, userId: number) => {
  // First check if the OKR belongs to the user and verify objective ownership
  const existingOkr = await prisma.okr.findFirst({
    where: { 
      id, 
      userId,
    },
  });

  if (!existingOkr) {
    return null;
  }

  return prisma.okr.delete({
    where: { id },
  });
};

const updateOkrPositions = async (okrPositions: { id: number; position: number }[], userId: number) => {
  // Verify all OKRs belong to the user and their objectives are owned by the user
  const okrIds = okrPositions.map(op => op.id);
  
  const existingOkrs = await prisma.okr.findMany({
    where: {
      id: { in: okrIds },
      userId,
    },
  });

  if (existingOkrs.length !== okrIds.length) {
    throw new Error("One or more OKRs not found or access denied");
  }

  // Update positions in a transaction
  const updatePromises = okrPositions.map(({ id, position }) =>
    prisma.okr.update({
      where: { id },
      data: { position },
    })
  );

  return Promise.all(updatePromises);
};

const getOkrStats = async (userId: number, objectiveId?: number) => {
  const whereClause: any = {
    userId,
    ...(objectiveId && { objectiveId }),
  };

  const [
    totalOkrs, 
    notStartedOkrs, 
    inProgressOkrs, 
    completedOkrs,
    allOkrs
  ] = await Promise.all([
    prisma.okr.count({ where: whereClause }),
    prisma.okr.count({ where: { ...whereClause, status: 'notStarted' } }),
    prisma.okr.count({ where: { ...whereClause, status: 'inProgress' } }),
    prisma.okr.count({ where: { ...whereClause, status: 'completed' } }),
    prisma.okr.findMany({
      where: whereClause,
      select: { 
        currentValue: true, 
        targetValue: true, 
        confidenceScore: true 
      },
    }),
  ]);

  // Calculate average progress percentage
  const averageProgress = allOkrs.length > 0 
    ? allOkrs.reduce((sum: any, anyokr: any) => {
        const progress = anyokr.targetValue > 0 ? (anyokr.currentValue / anyokr.targetValue) * 100 : 0;
        return sum + Math.min(progress, 100); // Cap at 100%
      }, 0) / allOkrs.length
    : 0;

  // Calculate average confidence score
  const averageConfidenceScore = allOkrs.length > 0 
    ? allOkrs.reduce((sum: any, anyokr: any) => sum + anyokr.confidenceScore, 0) / allOkrs.length
    : 0;

  return {
    total: totalOkrs,
    notStarted: notStartedOkrs,
    inProgress: inProgressOkrs,
    completed: completedOkrs,
    averageProgress: Math.round(averageProgress * 100) / 100, // Round to 2 decimal places
    averageConfidenceScore: Math.round(averageConfidenceScore * 100) / 100,
  };
};

export {
  createOkr,
  getOkrsByObjective,
  getAllOkrsByUser,
  getOkrById,
  updateOkr,
  updateOkrProgress,
  deleteOkr,
  updateOkrPositions,
  getOkrStats,
};
