import prisma from "../config/prisma.js";

import type { CreateTaskRequest, UpdateTaskRequest, TaskQueryParams } from "../types/task.types.js";

// Helper functions to verify ownership
const verifyProjectOwnership = async (projectId: number, userId: number) => {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });
  return !!project;
};

const verifyObjectiveOwnership = async (objectiveId: number, userId: number) => {
  const objective = await prisma.objective.findFirst({
    where: { 
      id: objectiveId, 
      userId,
      // Only verify project ownership if the objective is associated with a project
      OR: [
        { projectId: null }, // Objective not associated with any project
        { project: { userId } } // Objective associated with a project owned by the user
      ]
    },
  });
  return !!objective;
};

const verifyOkrOwnership = async (okrId: number, userId: number) => {
  const okr = await prisma.okr.findFirst({
    where: { 
      id: okrId, 
      userId,
      objective: { 
        userId,
        project: { userId } // Also verify project ownership
      }
    },
  });
  return !!okr;
};

const createTask = async (data: CreateTaskRequest, userId: number) => {
  // Verify ownership of related entities if provided
  if (data.projectId) {
    const ownsProject = await verifyProjectOwnership(data.projectId, userId);
    if (!ownsProject) {
      throw new Error("Project not found or access denied");
    }
  }

  if (data.objectiveId) {
    const ownsObjective = await verifyObjectiveOwnership(data.objectiveId, userId);
    if (!ownsObjective) {
      throw new Error("Objective not found or access denied");
    }
  }

  if (data.okrId) {
    const ownsOkr = await verifyOkrOwnership(data.okrId, userId);
    if (!ownsOkr) {
      throw new Error("OKR not found or access denied");
    }
  }

  return prisma.task.create({
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
      objective: {
        select: { id: true, name: true },
      },
      okr: {
        select: { id: true, title: true },
      },
    },
  });
};

const getTasksByUser = async (userId: number, queryParams: TaskQueryParams = {}) => {
  const { 
    page = 1, 
    limit = 10, 
    completed, 
    priority,
    category,
    importance,
    urgency,
    search,
    projectId,
    objectiveId,
    okrId,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = queryParams;
  
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {
    userId,
    ...(completed !== undefined && { completed }),
    ...(priority && { priority }),
    ...(category && { category }),
    ...(importance !== undefined && { importance }),
    ...(urgency !== undefined && { urgency }),
    ...(projectId && { projectId }),
    ...(objectiveId && { objectiveId }),
    ...(okrId && { okrId }),
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
  } else if (sortBy === 'priority') {
    orderBy.priority = sortOrder;
  } else if (sortBy === 'duration') {
    orderBy.duration = sortOrder;
  } else if (sortBy === 'category') {
    orderBy.category = sortOrder;
  } else {
    orderBy.position = sortOrder;
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
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
        objective: {
          select: { id: true, name: true },
        },
        okr: {
          select: { id: true, title: true },
        },
      },
    }),
    prisma.task.count({ where }),
  ]);

  return { tasks, total };
};

const getTasksByProject = async (projectId: number, userId: number, queryParams: TaskQueryParams = {}) => {
  // Verify that the user owns the project
  const ownsProject = await verifyProjectOwnership(projectId, userId);
  if (!ownsProject) {
    throw new Error("Project not found or access denied");
  }

  return getTasksByUser(userId, { ...queryParams, projectId });
};

const getTasksByObjective = async (objectiveId: number, userId: number, queryParams: TaskQueryParams = {}) => {
  // Verify that the user owns the objective
  const ownsObjective = await verifyObjectiveOwnership(objectiveId, userId);
  if (!ownsObjective) {
    throw new Error("Objective not found or access denied");
  }

  return getTasksByUser(userId, { ...queryParams, objectiveId });
};

const getTasksByOkr = async (okrId: number, userId: number, queryParams: TaskQueryParams = {}) => {
  // Verify that the user owns the OKR
  const ownsOkr = await verifyOkrOwnership(okrId, userId);
  if (!ownsOkr) {
    throw new Error("OKR not found or access denied");
  }

  return getTasksByUser(userId, { ...queryParams, okrId });
};

const getTaskById = async (id: number, userId: number) => {
  return prisma.task.findFirst({
    where: { 
      id, 
      userId,
    },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      project: {
        select: { id: true, name: true },
      },
      objective: {
        select: { id: true, name: true },
      },
      okr: {
        select: { id: true, title: true },
      },
    },
  });
};

const updateTask = async (id: number, userId: number, data: UpdateTaskRequest) => {
  // First check if the task belongs to the user
  const existingTask = await prisma.task.findFirst({
    where: { 
      id, 
      userId,
    },
  });

  if (!existingTask) {
    return null;
  }

  // Verify ownership of related entities if they're being updated
  if (data.projectId !== undefined) {
    if (data.projectId && !(await verifyProjectOwnership(data.projectId, userId))) {
      throw new Error("Project not found or access denied");
    }
  }

  if (data.objectiveId !== undefined) {
    if (data.objectiveId && !(await verifyObjectiveOwnership(data.objectiveId, userId))) {
      throw new Error("Objective not found or access denied");
    }
  }

  if (data.okrId !== undefined) {
    if (data.okrId && !(await verifyOkrOwnership(data.okrId, userId))) {
      throw new Error("OKR not found or access denied");
    }
  }

  return prisma.task.update({
    where: { id },
    data,
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      project: {
        select: { id: true, name: true },
      },
      objective: {
        select: { id: true, name: true },
      },
      okr: {
        select: { id: true, title: true },
      },
    },
  });
};

const deleteTask = async (id: number, userId: number) => {
  // First check if the task belongs to the user
  const existingTask = await prisma.task.findFirst({
    where: { 
      id, 
      userId,
    },
  });

  if (!existingTask) {
    return null;
  }

  return prisma.task.delete({
    where: { id },
  });
};

const updateTaskPositions = async (taskPositions: { id: number; position: number }[], userId: number) => {
  // Verify all tasks belong to the user
  const taskIds = taskPositions.map(tp => tp.id);
  
  const existingTasks = await prisma.task.findMany({
    where: {
      id: { in: taskIds },
      userId,
    },
  });

  if (existingTasks.length !== taskIds.length) {
    throw new Error("One or more tasks not found or access denied");
  }

  // Update positions in a transaction
  const updatePromises = taskPositions.map(({ id, position }) =>
    prisma.task.update({
      where: { id },
      data: { position },
    })
  );

  return Promise.all(updatePromises);
};

const toggleTaskCompletion = async (id: number, userId: number) => {
  // First check if the task belongs to the user
  const existingTask = await prisma.task.findFirst({
    where: { 
      id, 
      userId,
    },
  });

  if (!existingTask) {
    return null;
  }

  return prisma.task.update({
    where: { id },
    data: { completed: !existingTask.completed },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      project: {
        select: { id: true, name: true },
      },
      objective: {
        select: { id: true, name: true },
      },
      okr: {
        select: { id: true, title: true },
      },
    },
  });
};

const getArchivedTasks = async (userId: number, queryParams: TaskQueryParams = {}) => {
  return getTasksByUser(userId, { ...queryParams, completed: true });
};

const restoreTask = async (id: number, userId: number) => {
  // First check if the task belongs to the user
  const existingTask = await prisma.task.findFirst({
    where: { 
      id, 
      userId,
    },
  });

  if (!existingTask) {
    return null;
  }

  return prisma.task.update({
    where: { id },
    data: { completed: false },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      project: {
        select: { id: true, name: true },
      },
      objective: {
        select: { id: true, name: true },
      },
      okr: {
        select: { id: true, title: true },
      },
    },
  });
};

const getTaskStats = async (userId: number, projectId?: number, objectiveId?: number, okrId?: number) => {
  const whereClause: any = {
    userId,
    ...(projectId && { projectId }),
    ...(objectiveId && { objectiveId }),
    ...(okrId && { okrId }),
  };

  const [
    totalTasks,
    completedTasks,
    pendingTasks,
    highPriorityTasks,
    importantUrgentTasks,
    importantNotUrgentTasks,
    notImportantUrgentTasks,
    notImportantNotUrgentTasks,
  ] = await Promise.all([
    prisma.task.count({ where: whereClause }),
    prisma.task.count({ where: { ...whereClause, completed: true } }),
    prisma.task.count({ where: { ...whereClause, completed: false } }),
    prisma.task.count({ where: { ...whereClause, priority: 'high' } }),
    prisma.task.count({ where: { ...whereClause, importance: true, urgency: true } }),
    prisma.task.count({ where: { ...whereClause, importance: true, urgency: false } }),
    prisma.task.count({ where: { ...whereClause, importance: false, urgency: true } }),
    prisma.task.count({ where: { ...whereClause, importance: false, urgency: false } }),
  ]);

  return {
    total: totalTasks,
    completed: completedTasks,
    pending: pendingTasks,
    highPriority: highPriorityTasks,
    importantUrgent: importantUrgentTasks,
    importantNotUrgent: importantNotUrgentTasks,
    notImportantUrgent: notImportantUrgentTasks,
    notImportantNotUrgent: notImportantNotUrgentTasks,
  };
};

export {
  createTask,
  getTasksByUser,
  getTasksByProject,
  getTasksByObjective,
  getTasksByOkr,
  getTaskById,
  updateTask,
  deleteTask,
  updateTaskPositions,
  toggleTaskCompletion,
  getArchivedTasks,
  restoreTask,
  getTaskStats,
};
