import { PrismaClient, Prisma } from '../generated/prisma';
import type { 
  CreatePlanRequest, 
  UpdatePlanRequest, 
  PlanResponse, 
  PlanListResponse, 
  PlanQueryParams,
  PlanStats,
  PlanWithDetails
} from '../types/plan.types';

export class PlanService {
  constructor(private prisma: PrismaClient) {}

  async createPlan(userId: number, data: CreatePlanRequest): Promise<PlanResponse> {
    // Verify that both project and objective belong to the user
    const project = await this.prisma.project.findFirst({
      where: { id: data.projectId, userId }
    });

    if (!project) {
      throw new Error('Project not found or access denied');
    }

    const objective = await this.prisma.objective.findFirst({
      where: { id: data.objectiveId, userId }
    });

    if (!objective) {
      throw new Error('Objective not found or access denied');
    }

    // Check if plan already exists for this project-objective combination
    const existingPlan = await this.prisma.plan.findUnique({
      where: {
        projectId_objectiveId: {
          projectId: data.projectId,
          objectiveId: data.objectiveId
        }
      }
    });

    if (existingPlan) {
      throw new Error('A plan already exists for this project-objective combination');
    }

    const plan = await this.prisma.plan.create({
      data: {
        name: data.name,
        description: data.description,
        status: data.status || 'active',
        projectId: data.projectId,
        objectiveId: data.objectiveId
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            description: true,
            color: true
          }
        },
        objective: {
          select: {
            id: true,
            name: true,
            description: true,
            color: true
          }
        },
        okrs: {
          select: {
            id: true,
            title: true,
            status: true,
            currentValue: true,
            targetValue: true
          }
        },
        tasks: {
          select: {
            id: true,
            title: true,
            completed: true,
            priority: true,
            category: true
          }
        }
      }
    });

    return plan;
  }

  async getPlanById(id: number, userId?: number): Promise<PlanResponse | null> {
    const whereClause: any = { id };
    
    if (userId) {
      whereClause.OR = [
        { project: { userId } },
        { objective: { userId } }
      ];
    }

    const plan = await this.prisma.plan.findFirst({
      where: whereClause,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            description: true,
            color: true
          }
        },
        objective: {
          select: {
            id: true,
            name: true,
            description: true,
            color: true
          }
        },
        okrs: {
          select: {
            id: true,
            title: true,
            status: true,
            currentValue: true,
            targetValue: true
          }
        },
        tasks: {
          select: {
            id: true,
            title: true,
            completed: true,
            priority: true,
            category: true
          }
        }
      }
    });

    return plan;
  }

  async getPlanWithDetails(id: number, userId?: number): Promise<PlanWithDetails | null> {
    const plan = await this.getPlanById(id, userId);
    if (!plan) return null;

    const okrCount = plan.okrs?.length || 0;
    const taskCount = plan.tasks?.length || 0;
    const completedTaskCount = plan.tasks?.filter(task => task.completed).length || 0;
    const progressPercentage = taskCount > 0 ? Math.round((completedTaskCount / taskCount) * 100) : 0;

    return {
      ...plan,
      okrCount,
      taskCount,
      completedTaskCount,
      progressPercentage
    };
  }

  async getPlans(userId: number, params: PlanQueryParams): Promise<PlanListResponse> {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      projectId,
      objectiveId,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = params;

    const skip = (page - 1) * limit;
    
    const where: Prisma.PlanWhereInput = {
      OR: [
        { project: { userId } },
        { objective: { userId } }
      ]
    };

    if (status) {
      where.status = status;
    }

    if (projectId) {
      where.projectId = projectId;
    }

    if (objectiveId) {
      where.objectiveId = objectiveId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    const orderBy: Prisma.PlanOrderByWithRelationInput = {};
    orderBy[sortBy] = sortOrder;

    const [plans, total] = await Promise.all([
      this.prisma.plan.findMany({
        where,
        include: {
          project: {
            select: {
              id: true,
              name: true,
              description: true,
              color: true
            }
          },
          objective: {
            select: {
              id: true,
              name: true,
              description: true,
              color: true
            }
          },
          okrs: {
            select: {
              id: true,
              title: true,
              status: true,
              currentValue: true,
              targetValue: true
            }
          },
          tasks: {
            select: {
              id: true,
              title: true,
              completed: true,
              priority: true,
              category: true
            }
          }
        },
        orderBy,
        skip,
        take: limit
      }),
      this.prisma.plan.count({ where })
    ]);

    return { plans, total };
  }

  async updatePlan(id: number, userId: number, data: UpdatePlanRequest): Promise<PlanResponse> {
    // Verify plan exists and user has access
    const existingPlan = await this.prisma.plan.findFirst({
      where: {
        id,
        OR: [
          { project: { userId } },
          { objective: { userId } }
        ]
      }
    });

    if (!existingPlan) {
      throw new Error('Plan not found or access denied');
    }

    const plan = await this.prisma.plan.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        status: data.status
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            description: true,
            color: true
          }
        },
        objective: {
          select: {
            id: true,
            name: true,
            description: true,
            color: true
          }
        },
        okrs: {
          select: {
            id: true,
            title: true,
            status: true,
            currentValue: true,
            targetValue: true
          }
        },
        tasks: {
          select: {
            id: true,
            title: true,
            completed: true,
            priority: true,
            category: true
          }
        }
      }
    });

    return plan;
  }

  async deletePlan(id: number, userId: number): Promise<void> {
    // Verify plan exists and user has access
    const existingPlan = await this.prisma.plan.findFirst({
      where: {
        id,
        OR: [
          { project: { userId } },
          { objective: { userId } }
        ]
      }
    });

    if (!existingPlan) {
      throw new Error('Plan not found or access denied');
    }

    // Delete the plan (this will cascade to related OKRs and Tasks due to onDelete: Cascade)
    await this.prisma.plan.delete({
      where: { id }
    });
  }

  async getPlanStats(userId: number): Promise<PlanStats> {
    const plans = await this.prisma.plan.findMany({
      where: {
        OR: [
          { project: { userId } },
          { objective: { userId } }
        ]
      },
      include: {
        okrs: true,
        tasks: true
      }
    });

    const stats = {
      total: plans.length,
      active: 0,
      completed: 0,
      paused: 0,
      cancelled: 0,
      totalOkrs: 0,
      totalTasks: 0,
      completedTasks: 0
    };

    plans.forEach(plan => {
      switch (plan.status) {
        case 'active':
          stats.active++;
          break;
        case 'completed':
          stats.completed++;
          break;
        case 'paused':
          stats.paused++;
          break;
        case 'cancelled':
          stats.cancelled++;
          break;
      }

      stats.totalOkrs += plan.okrs.length;
      stats.totalTasks += plan.tasks.length;
      stats.completedTasks += plan.tasks.filter(task => task.completed).length;
    });

    return stats;
  }

  async getPlansForProject(projectId: number, userId: number): Promise<PlanResponse[]> {
    return this.prisma.plan.findMany({
      where: {
        projectId,
        project: { userId }
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            description: true,
            color: true
          }
        },
        objective: {
          select: {
            id: true,
            name: true,
            description: true,
            color: true
          }
        },
        okrs: {
          select: {
            id: true,
            title: true,
            status: true,
            currentValue: true,
            targetValue: true
          }
        },
        tasks: {
          select: {
            id: true,
            title: true,
            completed: true,
            priority: true,
            category: true
          }
        }
      }
    });
  }

  async getPlansForObjective(objectiveId: number, userId: number): Promise<PlanResponse[]> {
    return this.prisma.plan.findMany({
      where: {
        objectiveId,
        objective: { userId }
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            description: true,
            color: true
          }
        },
        objective: {
          select: {
            id: true,
            name: true,
            description: true,
            color: true
          }
        },
        okrs: {
          select: {
            id: true,
            title: true,
            status: true,
            currentValue: true,
            targetValue: true
          }
        },
        tasks: {
          select: {
            id: true,
            title: true,
            completed: true,
            priority: true,
            category: true
          }
        }
      }
    });
  }
}
