import prisma from "../config/prisma.js";

export interface AdminQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface AdminUserFilters extends AdminQueryParams {
  email?: string;
  username?: string;
  name?: string;
  role?: string;
  subscriptionStatus?: string;
  hasSubscription?: boolean;
  createdAtFrom?: string;
  createdAtTo?: string;
}

export interface AdminProjectFilters extends AdminQueryParams {
  name?: string;
  status?: string;
  visibility?: string;
  userId?: number;
  workspaceId?: number;
  teamId?: number;
  createdAtFrom?: string;
  createdAtTo?: string;
}

export interface AdminTaskFilters extends AdminQueryParams {
  title?: string;
  category?: string;
  priority?: string;
  completed?: boolean;
  userId?: number;
  projectId?: number;
  objectiveId?: number;
  okrId?: number;
  workspaceId?: number;
  teamId?: number;
  importance?: boolean;
  urgency?: boolean;
  createdAtFrom?: string;
  createdAtTo?: string;
}

export interface AdminOkrFilters extends AdminQueryParams {
  title?: string;
  status?: string;
  userId?: number;
  objectiveId?: number;
  planId?: number;
  workspaceId?: number;
  teamId?: number;
  createdAtFrom?: string;
  createdAtTo?: string;
}

export interface AdminObjectiveFilters extends AdminQueryParams {
  name?: string;
  status?: string;
  userId?: number;
  projectId?: number;
  workspaceId?: number;
  teamId?: number;
  createdAtFrom?: string;
  createdAtTo?: string;
}

export interface AdminWorkspaceFilters extends AdminQueryParams {
  name?: string;
  ownerId?: number;
  createdAtFrom?: string;
  createdAtTo?: string;
}

export interface AdminTeamFilters extends AdminQueryParams {
  name?: string;
  workspaceId?: number;
  createdAtFrom?: string;
  createdAtTo?: string;
}

export interface AdminSubscriptionFilters extends AdminQueryParams {
  status?: string;
  subscriptionPlanId?: number;
  userId?: number;
  createdAtFrom?: string;
  createdAtTo?: string;
}

export class AdminService {
  /**
   * Get all users with filters and pagination
   */
  async getAllUsers(filters: AdminUserFilters) {
    const {
      page = 1,
      limit = 20,
      search,
      email,
      username,
      name,
      role,
      subscriptionStatus,
      hasSubscription,
      createdAtFrom,
      createdAtTo,
      sortBy = "created_at",
      sortOrder = "desc",
    } = filters;

    const maxLimit = Math.min(limit, 100);
    const skip = (page - 1) * maxLimit;

    const where: any = {};

    // Text search
    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { username: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    // Specific filters
    if (email) where.email = { contains: email, mode: "insensitive" };
    if (username) where.username = { contains: username, mode: "insensitive" };
    if (name) where.name = { contains: name, mode: "insensitive" };
    if (role) where.role = role;

    // Date range - User model uses created_at (snake_case)
    if (createdAtFrom || createdAtTo) {
      where.created_at = {};
      if (createdAtFrom) where.created_at.gte = new Date(createdAtFrom);
      if (createdAtTo) where.created_at.lte = new Date(createdAtTo);
    }

    // Subscription filters
    if (subscriptionStatus || hasSubscription !== undefined) {
      where.subscription = {};
      if (subscriptionStatus) where.subscription.status = subscriptionStatus;
      if (hasSubscription === false) where.subscription = null;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: maxLimit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          username: true,
          name: true,
          email: true,
          role: true,
          phone_number: true,
          company_name: true,
          profile_photo_url: true,
          created_at: true,
          updated_at: true,
          subscription: {
            include: {
              subscriptionPlan: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                  price: true,
                  billingInterval: true,
                  maxTasks: true,
                },
              },
              paymentProvider: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  /**
   * Get user details by ID
   */
  async getUserDetails(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        phone_number: true,
        company_name: true,
        company_size: true,
        company_description: true,
        founded_year: true,
        website: true,
        profile_photo_url: true,
        job_title: true,
        industry: true,
        bio: true,
        timezone: true,
        linkedin_url: true,
        website_url: true,
        created_at: true,
        updated_at: true,
        subscription: {
          include: {
            subscriptionPlan: true,
            paymentProvider: true,
            payments: {
              select: {
                id: true,
                amount: true,
                currency: true,
                paymentType: true,
                status: true,
                createdAt: true,
              },
              orderBy: { createdAt: "desc" },
              take: 10,
            },
          },
        },
        _count: {
          select: {
            projects: true,
            tasks: true,
            okrs: true,
            objectives: true,
            ownedWorkspaces: true,
            teamMemberships: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  }

  /**
   * Get all projects with filters and pagination
   */
  async getAllProjects(filters: AdminProjectFilters) {
    const {
      page = 1,
      limit = 20,
      search,
      name,
      status,
      visibility,
      userId,
      workspaceId,
      teamId,
      createdAtFrom,
      createdAtTo,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    const maxLimit = Math.min(limit, 100);
    const skip = (page - 1) * maxLimit;

    const where: any = {};

    if (search || name) {
      where.name = { contains: search || name, mode: "insensitive" };
    }
    if (status) where.status = status;
    if (visibility) where.visibility = visibility;
    if (userId) where.userId = userId;
    if (workspaceId) where.workspaceId = workspaceId;
    if (teamId) where.teamId = teamId;

    if (createdAtFrom || createdAtTo) {
      where.createdAt = {};
      if (createdAtFrom) where.createdAt.gte = new Date(createdAtFrom);
      if (createdAtTo) where.createdAt.lte = new Date(createdAtTo);
    }

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take: maxLimit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          workspace: {
            select: {
              id: true,
              name: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              tasks: true,
              objectives: true,
            },
          },
        },
      }),
      prisma.project.count({ where }),
    ]);

    return { projects, total };
  }

  /**
   * Get project details by ID
   */
  async getProjectDetails(projectId: number) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        workspace: {
          select: {
            id: true,
            name: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
          },
        },
        tasks: {
          take: 10,
          orderBy: { createdAt: "desc" },
        },
        objectives: {
          take: 10,
          orderBy: { created_at: "desc" },
        },
        _count: {
          select: {
            tasks: true,
            objectives: true,
            plans: true,
          },
        },
      },
    });

    if (!project) {
      throw new Error("Project not found");
    }

    return project;
  }

  /**
   * Get all tasks with filters and pagination
   */
  async getAllTasks(filters: AdminTaskFilters) {
    const {
      page = 1,
      limit = 20,
      search,
      title,
      category,
      priority,
      completed,
      userId,
      projectId,
      objectiveId,
      okrId,
      workspaceId,
      teamId,
      importance,
      urgency,
      createdAtFrom,
      createdAtTo,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    const maxLimit = Math.min(limit, 100);
    const skip = (page - 1) * maxLimit;

    const where: any = {};

    if (search || title) {
      where.OR = [
        { title: { contains: search || title, mode: "insensitive" } },
        { description: { contains: search || title, mode: "insensitive" } },
      ];
    }
    if (category) where.category = category;
    if (priority) where.priority = priority;
    if (completed !== undefined) where.completed = completed;
    if (userId) where.userId = userId;
    if (projectId) where.projectId = projectId;
    if (objectiveId) where.objectiveId = objectiveId;
    if (okrId) where.okrId = okrId;
    if (workspaceId) where.workspaceId = workspaceId;
    if (teamId) where.teamId = teamId;
    if (importance !== undefined) where.importance = importance;
    if (urgency !== undefined) where.urgency = urgency;

    if (createdAtFrom || createdAtTo) {
      where.createdAt = {};
      if (createdAtFrom) where.createdAt.gte = new Date(createdAtFrom);
      if (createdAtTo) where.createdAt.lte = new Date(createdAtTo);
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take: maxLimit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          objective: {
            select: {
              id: true,
              name: true,
            },
          },
          okr: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
      prisma.task.count({ where }),
    ]);

    return { tasks, total };
  }

  /**
   * Get task details by ID
   */
  async getTaskDetails(taskId: number) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        objective: {
          select: {
            id: true,
            name: true,
          },
        },
        okr: {
          select: {
            id: true,
            title: true,
          },
        },
        aiRecommendation: true,
      },
    });

    if (!task) {
      throw new Error("Task not found");
    }

    return task;
  }

  /**
   * Get all OKRs with filters and pagination
   */
  async getAllOkrs(filters: AdminOkrFilters) {
    const {
      page = 1,
      limit = 20,
      search,
      title,
      status,
      userId,
      objectiveId,
      planId,
      workspaceId,
      teamId,
      createdAtFrom,
      createdAtTo,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    const maxLimit = Math.min(limit, 100);
    const skip = (page - 1) * maxLimit;

    const where: any = {};

    if (search || title) {
      where.title = { contains: search || title, mode: "insensitive" };
    }
    if (status) where.status = status;
    if (userId) where.userId = userId;
    if (objectiveId) where.objectiveId = objectiveId;
    if (planId) where.planId = planId;
    if (workspaceId) where.workspaceId = workspaceId;
    if (teamId) where.teamId = teamId;

    if (createdAtFrom || createdAtTo) {
      where.createdAt = {};
      if (createdAtFrom) where.createdAt.gte = new Date(createdAtFrom);
      if (createdAtTo) where.createdAt.lte = new Date(createdAtTo);
    }

    const [okrs, total] = await Promise.all([
      prisma.okr.findMany({
        where,
        skip,
        take: maxLimit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
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
            },
          },
          workspace: {
            select: {
              id: true,
              name: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.okr.count({ where }),
    ]);

    return { okrs, total };
  }

  /**
   * Get OKR details by ID
   */
  async getOkrDetails(okrId: number) {
    const okr = await prisma.okr.findUnique({
      where: { id: okrId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
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
          },
        },
        tasks: {
          take: 10,
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });

    if (!okr) {
      throw new Error("OKR not found");
    }

    return okr;
  }

  /**
   * Get all objectives with filters and pagination
   */
  async getAllObjectives(filters: AdminObjectiveFilters) {
    const {
      page = 1,
      limit = 20,
      search,
      name,
      status,
      userId,
      projectId,
      workspaceId,
      teamId,
      createdAtFrom,
      createdAtTo,
      sortBy = "created_at",
      sortOrder = "desc",
    } = filters;

    const maxLimit = Math.min(limit, 100);
    const skip = (page - 1) * maxLimit;

    const where: any = {};

    if (search || name) {
      where.name = { contains: search || name, mode: "insensitive" };
    }
    if (status) where.status = status;
    if (userId) where.userId = userId;
    if (projectId) where.projectId = projectId;
    if (workspaceId) where.workspaceId = workspaceId;
    if (teamId) where.teamId = teamId;

    // Objective model uses created_at (snake_case)
    if (createdAtFrom || createdAtTo) {
      where.created_at = {};
      if (createdAtFrom) where.created_at.gte = new Date(createdAtFrom);
      if (createdAtTo) where.created_at.lte = new Date(createdAtTo);
    }

    const [objectives, total] = await Promise.all([
      prisma.objective.findMany({
        where,
        skip,
        take: maxLimit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          workspace: {
            select: {
              id: true,
              name: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.objective.count({ where }),
    ]);

    return { objectives, total };
  }

  /**
   * Get objective details by ID
   */
  async getObjectiveDetails(objectiveId: number) {
    const objective = await prisma.objective.findUnique({
      where: { id: objectiveId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        tasks: {
          take: 10,
          orderBy: { createdAt: "desc" },
        },
        okrs: {
          take: 10,
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            tasks: true,
            okrs: true,
            plans: true,
          },
        },
      },
    });

    if (!objective) {
      throw new Error("Objective not found");
    }

    return objective;
  }

  /**
   * Get all workspaces with filters and pagination
   */
  async getAllWorkspaces(filters: AdminWorkspaceFilters) {
    const {
      page = 1,
      limit = 20,
      search,
      name,
      ownerId,
      createdAtFrom,
      createdAtTo,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    const maxLimit = Math.min(limit, 100);
    const skip = (page - 1) * maxLimit;

    const where: any = {};

    if (search || name) {
      where.name = { contains: search || name, mode: "insensitive" };
    }
    if (ownerId) where.ownerId = ownerId;

    if (createdAtFrom || createdAtTo) {
      where.createdAt = {};
      if (createdAtFrom) where.createdAt.gte = new Date(createdAtFrom);
      if (createdAtTo) where.createdAt.lte = new Date(createdAtTo);
    }

    const [workspaces, total] = await Promise.all([
      prisma.workspace.findMany({
        where,
        skip,
        take: maxLimit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              teams: true,
              projects: true,
              tasks: true,
              memberships: true,
            },
          },
        },
      }),
      prisma.workspace.count({ where }),
    ]);

    return { workspaces, total };
  }

  /**
   * Get workspace details by ID
   */
  async getWorkspaceDetails(workspaceId: number) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        teams: {
          take: 10,
          orderBy: { createdAt: "desc" },
        },
        projects: {
          take: 10,
          orderBy: { createdAt: "desc" },
        },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            teams: true,
            projects: true,
            tasks: true,
            objectives: true,
            okrs: true,
            memberships: true,
          },
        },
      },
    });

    if (!workspace) {
      throw new Error("Workspace not found");
    }

    return workspace;
  }

  /**
   * Get all teams with filters and pagination
   */
  async getAllTeams(filters: AdminTeamFilters) {
    const {
      page = 1,
      limit = 20,
      search,
      name,
      workspaceId,
      createdAtFrom,
      createdAtTo,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    const maxLimit = Math.min(limit, 100);
    const skip = (page - 1) * maxLimit;

    const where: any = {};

    if (search || name) {
      where.name = { contains: search || name, mode: "insensitive" };
    }
    if (workspaceId) where.workspaceId = workspaceId;

    if (createdAtFrom || createdAtTo) {
      where.createdAt = {};
      if (createdAtFrom) where.createdAt.gte = new Date(createdAtFrom);
      if (createdAtTo) where.createdAt.lte = new Date(createdAtTo);
    }

    const [teams, total] = await Promise.all([
      prisma.team.findMany({
        where,
        skip,
        take: maxLimit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          workspace: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              memberships: true,
              projects: true,
              tasks: true,
            },
          },
        },
      }),
      prisma.team.count({ where }),
    ]);

    return { teams, total };
  }

  /**
   * Get team details by ID
   */
  async getTeamDetails(teamId: number) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
          },
        },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            memberships: true,
            projects: true,
            tasks: true,
          },
        },
      },
    });

    if (!team) {
      throw new Error("Team not found");
    }

    return team;
  }

  /**
   * Get all subscriptions with filters and pagination
   */
  async getAllSubscriptions(filters: AdminSubscriptionFilters) {
    const {
      page = 1,
      limit = 20,
      status,
      subscriptionPlanId,
      userId,
      createdAtFrom,
      createdAtTo,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    const maxLimit = Math.min(limit, 100);
    const skip = (page - 1) * maxLimit;

    const where: any = {};

    if (status) where.status = status;
    if (subscriptionPlanId) where.subscriptionPlanId = subscriptionPlanId;
    if (userId) where.userId = userId;

    if (createdAtFrom || createdAtTo) {
      where.createdAt = {};
      if (createdAtFrom) where.createdAt.gte = new Date(createdAtFrom);
      if (createdAtTo) where.createdAt.lte = new Date(createdAtTo);
    }

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        skip,
        take: maxLimit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          userId: true,
          subscriptionPlanId: true,
          paymentProviderId: true,
          status: true,
          stripeSubscriptionId: true,
          stripeCustomerId: true,
          // Only include trialStart, exclude currentPeriodStart and currentPeriodEnd
          trialStart: true,
          trialEnd: true,
          gracePeriodEnd: true,
          cancelAtPeriodEnd: true,
          canceledAt: true,
          tasksCreatedThisPeriod: true,
          lastTaskCountReset: true,
          paymentRetryCount: true,
          lastPaymentRetryAt: true,
          paymentFailureReason: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
            },
          },
          subscriptionPlan: {
            select: {
              id: true,
              name: true,
              displayName: true,
              price: true,
              billingInterval: true,
              maxTasks: true,
            },
          },
          paymentProvider: {
            select: {
              id: true,
              name: true,
            },
          },
          payments: {
            select: {
              id: true,
              amount: true,
              currency: true,
              paymentType: true,
              status: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      }),
      prisma.subscription.count({ where }),
    ]);

    return { subscriptions, total };
  }

  /**
   * Get subscription details by ID
   */
  async getSubscriptionDetails(subscriptionId: number) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        id: true,
        userId: true,
        subscriptionPlanId: true,
        paymentProviderId: true,
        status: true,
        stripeSubscriptionId: true,
        stripeCustomerId: true,
        // Only include trialStart, exclude currentPeriodStart and currentPeriodEnd
        trialStart: true,
        trialEnd: true,
        gracePeriodEnd: true,
        cancelAtPeriodEnd: true,
        canceledAt: true,
        tasksCreatedThisPeriod: true,
        lastTaskCountReset: true,
        paymentRetryCount: true,
        lastPaymentRetryAt: true,
        paymentFailureReason: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
          },
        },
        subscriptionPlan: true,
        paymentProvider: true,
        payments: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    return subscription;
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats() {
    const [
      totalUsers,
      totalProjects,
      totalTasks,
      totalOkrs,
      totalObjectives,
      totalWorkspaces,
      totalTeams,
      totalSubscriptions,
      activeSubscriptions,
      trialSubscriptions,
      usersLast30Days,
      subscriptionsByStatus,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.project.count(),
      prisma.task.count(),
      prisma.okr.count(),
      prisma.objective.count(),
      prisma.workspace.count(),
      prisma.team.count(),
      prisma.subscription.count(),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.subscription.count({ where: { status: "TRIAL" } }),
      prisma.user.count({
        where: {
          created_at: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.subscription.groupBy({
        by: ["status"],
        _count: true,
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        last30Days: usersLast30Days,
      },
      projects: {
        total: totalProjects,
      },
      tasks: {
        total: totalTasks,
      },
      okrs: {
        total: totalOkrs,
      },
      objectives: {
        total: totalObjectives,
      },
      workspaces: {
        total: totalWorkspaces,
      },
      teams: {
        total: totalTeams,
      },
      subscriptions: {
        total: totalSubscriptions,
        active: activeSubscriptions,
        trial: trialSubscriptions,
        byStatus: subscriptionsByStatus.map((s) => ({
          status: s.status,
          count: s._count,
        })),
      },
    };
  }
}

export const adminService = new AdminService();



