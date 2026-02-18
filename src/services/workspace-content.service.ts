import prisma from "../config/prisma.js";

interface WorkspaceContentQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  teamId?: number;
  projectId?: number;
  objectiveId?: number;
  okrId?: number;
}

interface WorkspaceAccessResult {
  hasAccess: boolean;
  isOwner: boolean;
  isManager: boolean;
  teamIds: number[];
}

/**
 * Check user's access level for a workspace.
 * Returns access flags and the team IDs the user belongs to in the workspace.
 */
const checkWorkspaceAccess = async (
  workspaceId: number,
  userId: number
): Promise<WorkspaceAccessResult> => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true },
  });

  if (!workspace) {
    return { hasAccess: false, isOwner: false, isManager: false, teamIds: [] };
  }

  const isOwner = workspace.ownerId === userId;

  const workspaceMembership = await prisma.workspaceMembership.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId },
    },
    select: { role: true },
  });

  const isManager = workspaceMembership?.role === "WORKSPACE_MANAGER";

  const teamMemberships = await prisma.teamMembership.findMany({
    where: {
      userId,
      team: { workspaceId },
      status: "ACTIVE",
    },
    select: { teamId: true },
  });

  const teamIds = teamMemberships.map((tm) => tm.teamId);
  const hasAccess = isOwner || isManager || teamIds.length > 0;

  return { hasAccess, isOwner, isManager, teamIds };
};

/**
 * Build the access-control portion of a where clause.
 * Non-owner/non-manager users can only see items in their teams or their own items.
 * When a search OR clause is already present, we combine it with AND.
 */
function applyAccessFilter(
  where: any,
  access: WorkspaceAccessResult,
  userId: number
) {
  if (access.isOwner || access.isManager) return;

  const accessFilter = {
    OR: [{ teamId: { in: access.teamIds } }, { userId }],
  };

  // If there's already an OR (from search), wrap both in AND
  if (where.OR) {
    const searchOr = where.OR;
    delete where.OR;
    where.AND = [{ OR: searchOr }, accessFilter];
  } else {
    where.OR = accessFilter.OR;
  }
}

/**
 * Get all projects assigned to a workspace.
 * Includes _count for objectives and tasks.
 */
const getWorkspaceProjects = async (
  workspaceId: number,
  userId: number,
  queryParams: WorkspaceContentQueryParams = {}
) => {
  const access = await checkWorkspaceAccess(workspaceId, userId);
  if (!access.hasAccess) {
    throw new Error("Access denied: You don't have access to this workspace");
  }

  const { page = 1, limit = 20, search, status, teamId } = queryParams;
  const skip = (page - 1) * limit;

  const where: any = {
    workspaceId,
    ...(status && { status }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  if (teamId) {
    where.teamId = teamId;
  } else {
    applyAccessFilter(where, access, userId);
  }

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        team: {
          select: { id: true, name: true },
        },
        _count: {
          select: { objectives: true, tasks: true },
        },
      },
    }),
    prisma.project.count({ where }),
  ]);

  const projectsWithPermissions = projects.map((project) => ({
    ...project,
    canEdit: project.userId === userId || access.isOwner || access.isManager,
    canDelete: project.userId === userId || access.isOwner,
    isOwner: project.userId === userId,
  }));

  return { projects: projectsWithPermissions, total };
};

/**
 * Get all objectives assigned to a workspace.
 * Supports optional projectId filter. Includes _count for okrs and tasks.
 */
const getWorkspaceObjectives = async (
  workspaceId: number,
  userId: number,
  queryParams: WorkspaceContentQueryParams = {}
) => {
  const access = await checkWorkspaceAccess(workspaceId, userId);
  if (!access.hasAccess) {
    throw new Error("Access denied: You don't have access to this workspace");
  }

  const { page = 1, limit = 20, search, status, teamId, projectId } = queryParams;
  const skip = (page - 1) * limit;

  const where: any = {
    workspaceId,
    ...(status && { status }),
    ...(projectId && { projectId }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  if (teamId) {
    where.teamId = teamId;
  } else {
    applyAccessFilter(where, access, userId);
  }

  const [objectives, total] = await Promise.all([
    prisma.objective.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: "desc" },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        team: {
          select: { id: true, name: true },
        },
        project: {
          select: { id: true, name: true },
        },
        _count: {
          select: { okrs: true, tasks: true },
        },
      },
    }),
    prisma.objective.count({ where }),
  ]);

  const objectivesWithPermissions = objectives.map((obj) => ({
    ...obj,
    canEdit: obj.userId === userId || access.isOwner || access.isManager,
    canDelete: obj.userId === userId || access.isOwner,
    isOwner: obj.userId === userId,
  }));

  return { objectives: objectivesWithPermissions, total };
};

/**
 * Get all OKRs assigned to a workspace.
 * Supports optional objectiveId filter. Includes _count for tasks.
 */
const getWorkspaceOkrs = async (
  workspaceId: number,
  userId: number,
  queryParams: WorkspaceContentQueryParams = {}
) => {
  const access = await checkWorkspaceAccess(workspaceId, userId);
  if (!access.hasAccess) {
    throw new Error("Access denied: You don't have access to this workspace");
  }

  const { page = 1, limit = 20, search, status, teamId, objectiveId } = queryParams;
  const skip = (page - 1) * limit;

  const where: any = {
    workspaceId,
    ...(status && { status }),
    ...(objectiveId && { objectiveId }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  if (teamId) {
    where.teamId = teamId;
  } else {
    applyAccessFilter(where, access, userId);
  }

  const [okrs, total] = await Promise.all([
    prisma.okr.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        team: {
          select: { id: true, name: true },
        },
        objective: {
          select: { id: true, name: true },
        },
        _count: {
          select: { tasks: true },
        },
      },
    }),
    prisma.okr.count({ where }),
  ]);

  const okrsWithPermissions = okrs.map((okr) => ({
    ...okr,
    canEdit: okr.userId === userId || access.isOwner || access.isManager,
    canDelete: okr.userId === userId || access.isOwner,
    isOwner: okr.userId === userId,
  }));

  return { okrs: okrsWithPermissions, total };
};

/**
 * Get all tasks assigned to a workspace.
 * Supports optional projectId, objectiveId, okrId filters.
 */
const getWorkspaceTasks = async (
  workspaceId: number,
  userId: number,
  queryParams: WorkspaceContentQueryParams & { completed?: boolean; priority?: string } = {}
) => {
  const access = await checkWorkspaceAccess(workspaceId, userId);
  if (!access.hasAccess) {
    throw new Error("Access denied: You don't have access to this workspace");
  }

  const {
    page = 1,
    limit = 20,
    search,
    teamId,
    completed,
    priority,
    projectId,
    objectiveId,
    okrId,
  } = queryParams;
  const skip = (page - 1) * limit;

  const where: any = {
    workspaceId,
    ...(completed !== undefined && { completed }),
    ...(priority && { priority }),
    ...(projectId && { projectId }),
    ...(objectiveId && { objectiveId }),
    ...(okrId && { okrId }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  if (teamId) {
    where.teamId = teamId;
  } else {
    applyAccessFilter(where, access, userId);
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        team: {
          select: { id: true, name: true },
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

  const tasksWithPermissions = tasks.map((task) => ({
    ...task,
    canEdit: task.userId === userId || access.isOwner || access.isManager,
    canDelete: task.userId === userId || access.isOwner,
    isOwner: task.userId === userId,
  }));

  return { tasks: tasksWithPermissions, total };
};

/**
 * Get summary counts for all content types in a workspace.
 */
const getWorkspaceContentSummary = async (
  workspaceId: number,
  userId: number
) => {
  const access = await checkWorkspaceAccess(workspaceId, userId);
  if (!access.hasAccess) {
    throw new Error("Access denied: You don't have access to this workspace");
  }

  const baseWhere: any = { workspaceId };

  if (!access.isOwner && !access.isManager) {
    baseWhere.OR = [
      { teamId: { in: access.teamIds } },
      { userId },
    ];
  }

  const [projectsCount, objectivesCount, okrsCount, tasksTotal, tasksCompleted] =
    await Promise.all([
      prisma.project.count({ where: baseWhere }),
      prisma.objective.count({ where: baseWhere }),
      prisma.okr.count({ where: baseWhere }),
      prisma.task.count({ where: baseWhere }),
      prisma.task.count({ where: { ...baseWhere, completed: true } }),
    ]);

  return {
    projects: projectsCount,
    objectives: objectivesCount,
    okrs: okrsCount,
    tasks: {
      total: tasksTotal,
      completed: tasksCompleted,
      pending: tasksTotal - tasksCompleted,
    },
  };
};

export {
  checkWorkspaceAccess,
  getWorkspaceProjects,
  getWorkspaceObjectives,
  getWorkspaceOkrs,
  getWorkspaceTasks,
  getWorkspaceContentSummary,
};
