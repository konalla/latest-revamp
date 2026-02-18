import prisma from "../config/prisma.js";
import { checkWorkspaceAccess } from "./workspace-content.service.js";
import { subscriptionService } from "./subscription.service.js";
import {
  aiRecommendationService,
  type TaskAnalysis,
} from "./ai-recommendation.service.js";

// ============================================
// Authorization helper
// ============================================

async function requireWorkspaceAccess(workspaceId: number, userId: number) {
  const access = await checkWorkspaceAccess(workspaceId, userId);
  if (!access.hasAccess) {
    throw new Error("Access denied: You don't have access to this workspace");
  }
  return access;
}

async function verifyItemInWorkspace(
  model: "project" | "objective" | "okr" | "task",
  itemId: number,
  workspaceId: number
) {
  const item = await (prisma[model] as any).findFirst({
    where: { id: itemId, workspaceId },
  });
  if (!item) {
    throw new Error(`${model.charAt(0).toUpperCase() + model.slice(1)} not found in this workspace`);
  }
  return item;
}

// ============================================
// PROJECT CRUD
// ============================================

export async function createProjectInWorkspace(
  workspaceId: number,
  teamId: number | null,
  userId: number,
  data: {
    name: string;
    description?: string | null;
    status?: string;
    color?: string;
    icon?: string;
    startDate?: string;
    endDate?: string | null;
    is_private?: boolean;
    visibility?: string;
  }
) {
  await requireWorkspaceAccess(workspaceId, userId);

  try {
    await subscriptionService.canCreateProject(userId);
  } catch {
    throw new Error("Subscription limit reached for projects");
  }

  const project = await prisma.project.create({
    data: {
      name: data.name,
      description: data.description || null,
      status: data.status || "planning",
      color: data.color || "#4A6CF7",
      icon: data.icon || null,
      startDate: data.startDate ? new Date(data.startDate) : new Date(),
      endDate: data.endDate ? new Date(data.endDate) : null,
      is_private: data.is_private || false,
      visibility: data.visibility || "public",
      userId,
      workspaceId,
      teamId,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, name: true } },
      _count: { select: { objectives: true, tasks: true } },
    },
  });

  try {
    await subscriptionService.incrementProjectCount(userId);
  } catch {}

  return project;
}

export async function updateProjectInWorkspace(
  workspaceId: number,
  projectId: number,
  userId: number,
  data: {
    name?: string;
    description?: string | null;
    status?: string;
    color?: string;
    icon?: string;
    startDate?: string;
    endDate?: string | null;
    is_private?: boolean;
    visibility?: string;
    teamId?: number | null;
  }
) {
  await requireWorkspaceAccess(workspaceId, userId);
  await verifyItemInWorkspace("project", projectId, workspaceId);

  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.color !== undefined) updateData.color = data.color;
  if (data.icon !== undefined) updateData.icon = data.icon;
  if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
  if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null;
  if (data.is_private !== undefined) updateData.is_private = data.is_private;
  if (data.visibility !== undefined) updateData.visibility = data.visibility;
  if (data.teamId !== undefined) updateData.teamId = data.teamId;

  return prisma.project.update({
    where: { id: projectId },
    data: updateData,
    include: {
      user: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, name: true } },
      _count: { select: { objectives: true, tasks: true } },
    },
  });
}

export async function deleteProjectInWorkspace(
  workspaceId: number,
  projectId: number,
  userId: number
) {
  await requireWorkspaceAccess(workspaceId, userId);
  await verifyItemInWorkspace("project", projectId, workspaceId);
  return prisma.project.delete({ where: { id: projectId } });
}

// ============================================
// OBJECTIVE CRUD
// ============================================

export async function createObjectiveInWorkspace(
  workspaceId: number,
  teamId: number | null,
  userId: number,
  data: {
    name: string;
    description?: string | null;
    status?: string;
    color?: string;
    startDate?: string;
    endDate?: string | null;
    position?: number;
    projectId?: number | null;
  }
) {
  await requireWorkspaceAccess(workspaceId, userId);

  try {
    await subscriptionService.canCreateObjective(userId);
  } catch {
    throw new Error("Subscription limit reached for objectives");
  }

  const objective = await prisma.objective.create({
    data: {
      name: data.name,
      description: data.description || null,
      status: data.status || "active",
      color: data.color || "#4A6CF7",
      start_date: data.startDate ? new Date(data.startDate) : new Date(),
      end_date: data.endDate ? new Date(data.endDate) : null,
      position: data.position || 0,
      projectId: data.projectId || null,
      userId,
      workspaceId,
      teamId,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      _count: { select: { okrs: true, tasks: true } },
    },
  });

  try {
    await subscriptionService.incrementObjectiveCount(userId);
  } catch {}

  return objective;
}

export async function updateObjectiveInWorkspace(
  workspaceId: number,
  objectiveId: number,
  userId: number,
  data: {
    name?: string;
    description?: string | null;
    status?: string;
    color?: string;
    startDate?: string;
    endDate?: string | null;
    position?: number;
    projectId?: number | null;
    teamId?: number | null;
  }
) {
  await requireWorkspaceAccess(workspaceId, userId);
  await verifyItemInWorkspace("objective", objectiveId, workspaceId);

  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.color !== undefined) updateData.color = data.color;
  if (data.startDate !== undefined) updateData.start_date = new Date(data.startDate);
  if (data.endDate !== undefined) updateData.end_date = data.endDate ? new Date(data.endDate) : null;
  if (data.position !== undefined) updateData.position = data.position;
  if (data.projectId !== undefined) updateData.projectId = data.projectId;
  if (data.teamId !== undefined) updateData.teamId = data.teamId;

  return prisma.objective.update({
    where: { id: objectiveId },
    data: updateData,
    include: {
      user: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      _count: { select: { okrs: true, tasks: true } },
    },
  });
}

export async function deleteObjectiveInWorkspace(
  workspaceId: number,
  objectiveId: number,
  userId: number
) {
  await requireWorkspaceAccess(workspaceId, userId);
  await verifyItemInWorkspace("objective", objectiveId, workspaceId);
  return prisma.objective.delete({ where: { id: objectiveId } });
}

// ============================================
// OKR CRUD
// ============================================

export async function createOkrInWorkspace(
  workspaceId: number,
  teamId: number | null,
  userId: number,
  data: {
    title: string;
    description?: string | null;
    status?: string;
    targetValue?: number;
    currentValue?: number;
    startDate?: string;
    endDate?: string | null;
    position?: number;
    confidenceScore?: number;
    keyResults?: any[];
    objectiveId?: number | null;
  }
) {
  await requireWorkspaceAccess(workspaceId, userId);

  const okr = await prisma.okr.create({
    data: {
      title: data.title,
      description: data.description || null,
      status: data.status || "notStarted",
      targetValue: data.targetValue ?? 100,
      currentValue: data.currentValue ?? 0,
      startDate: data.startDate ? new Date(data.startDate) : new Date(),
      endDate: data.endDate ? new Date(data.endDate) : null,
      position: data.position || 0,
      confidenceScore: data.confidenceScore ?? 3,
      keyResults: data.keyResults || [],
      progressHistory: [],
      objectiveId: data.objectiveId || null,
      userId,
      workspaceId,
      teamId,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, name: true } },
      objective: { select: { id: true, name: true } },
      _count: { select: { tasks: true } },
    },
  });

  return okr;
}

export async function updateOkrInWorkspace(
  workspaceId: number,
  okrId: number,
  userId: number,
  data: {
    title?: string;
    description?: string | null;
    status?: string;
    targetValue?: number;
    currentValue?: number;
    startDate?: string;
    endDate?: string | null;
    position?: number;
    confidenceScore?: number;
    keyResults?: any[];
    objectiveId?: number | null;
    teamId?: number | null;
  }
) {
  await requireWorkspaceAccess(workspaceId, userId);
  await verifyItemInWorkspace("okr", okrId, workspaceId);

  const updateData: any = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.targetValue !== undefined) updateData.targetValue = data.targetValue;
  if (data.currentValue !== undefined) updateData.currentValue = data.currentValue;
  if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
  if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null;
  if (data.position !== undefined) updateData.position = data.position;
  if (data.confidenceScore !== undefined) updateData.confidenceScore = data.confidenceScore;
  if (data.keyResults !== undefined) updateData.keyResults = data.keyResults;
  if (data.objectiveId !== undefined) updateData.objectiveId = data.objectiveId;
  if (data.teamId !== undefined) updateData.teamId = data.teamId;

  return prisma.okr.update({
    where: { id: okrId },
    data: updateData,
    include: {
      user: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, name: true } },
      objective: { select: { id: true, name: true } },
      _count: { select: { tasks: true } },
    },
  });
}

export async function deleteOkrInWorkspace(
  workspaceId: number,
  okrId: number,
  userId: number
) {
  await requireWorkspaceAccess(workspaceId, userId);
  await verifyItemInWorkspace("okr", okrId, workspaceId);
  return prisma.okr.delete({ where: { id: okrId } });
}

// ============================================
// TASK CRUD (with AI recommendation support)
// ============================================

export async function createTaskInWorkspace(
  workspaceId: number,
  teamId: number | null,
  userId: number,
  data: {
    title: string;
    description?: string | null;
    category?: string;
    duration?: number;
    priority?: string;
    position?: number;
    importance?: boolean;
    urgency?: boolean;
    isHighLeverage?: boolean;
    advancesKeyResults?: boolean;
    dueDate?: string | null;
    projectId?: number | null;
    objectiveId?: number | null;
    okrId?: number | null;
  }
) {
  await requireWorkspaceAccess(workspaceId, userId);

  try {
    await subscriptionService.canCreateTask(userId);
  } catch {
    throw new Error("Subscription limit reached for tasks");
  }

  const task = await prisma.task.create({
    data: {
      title: data.title,
      description: data.description || null,
      category: data.category || "deepWork",
      duration: data.duration ?? 25,
      priority: data.priority || "medium",
      position: data.position ?? 0,
      importance: data.importance ?? false,
      urgency: data.urgency ?? false,
      isHighLeverage: data.isHighLeverage ?? false,
      advancesKeyResults: data.advancesKeyResults ?? false,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      projectId: data.projectId || null,
      objectiveId: data.objectiveId || null,
      okrId: data.okrId || null,
      userId,
      workspaceId,
      teamId,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      objective: { select: { id: true, name: true } },
      okr: { select: { id: true, title: true } },
      aiRecommendation: true,
    },
  });

  try {
    await subscriptionService.incrementTaskCount(userId);
  } catch {}

  // Generate AI recommendation asynchronously
  generateAiRecommendationForTask(task, userId).catch((err) => {
    console.error("[WorkspaceCRUD] AI recommendation generation failed:", err);
  });

  return task;
}

export async function updateTaskInWorkspace(
  workspaceId: number,
  taskId: number,
  userId: number,
  data: {
    title?: string;
    description?: string | null;
    category?: string;
    duration?: number;
    priority?: string;
    position?: number;
    completed?: boolean;
    importance?: boolean;
    urgency?: boolean;
    isHighLeverage?: boolean;
    advancesKeyResults?: boolean;
    dueDate?: string | null;
    projectId?: number | null;
    objectiveId?: number | null;
    okrId?: number | null;
    teamId?: number | null;
  }
) {
  await requireWorkspaceAccess(workspaceId, userId);
  const existingTask = await verifyItemInWorkspace("task", taskId, workspaceId);

  const updateData: any = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.duration !== undefined) updateData.duration = data.duration;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.position !== undefined) updateData.position = data.position;
  if (data.completed !== undefined) updateData.completed = data.completed;
  if (data.importance !== undefined) updateData.importance = data.importance;
  if (data.urgency !== undefined) updateData.urgency = data.urgency;
  if (data.isHighLeverage !== undefined) updateData.isHighLeverage = data.isHighLeverage;
  if (data.advancesKeyResults !== undefined) updateData.advancesKeyResults = data.advancesKeyResults;
  if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  if (data.projectId !== undefined) updateData.projectId = data.projectId;
  if (data.objectiveId !== undefined) updateData.objectiveId = data.objectiveId;
  if (data.okrId !== undefined) updateData.okrId = data.okrId;
  if (data.teamId !== undefined) updateData.teamId = data.teamId;

  const task = await prisma.task.update({
    where: { id: taskId },
    data: updateData,
    include: {
      user: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      objective: { select: { id: true, name: true } },
      okr: { select: { id: true, title: true } },
      aiRecommendation: true,
    },
  });

  // Regenerate AI recommendation if relevant fields changed
  const shouldRegenerate =
    data.title !== undefined ||
    data.description !== undefined ||
    data.duration !== undefined ||
    data.importance !== undefined ||
    data.urgency !== undefined ||
    data.dueDate !== undefined ||
    data.isHighLeverage !== undefined ||
    data.advancesKeyResults !== undefined;

  if (shouldRegenerate) {
    generateAiRecommendationForTask(task, userId).catch((err) => {
      console.error("[WorkspaceCRUD] AI recommendation regeneration failed:", err);
    });
  }

  return task;
}

export async function toggleTaskInWorkspace(
  workspaceId: number,
  taskId: number,
  userId: number
) {
  await requireWorkspaceAccess(workspaceId, userId);
  const task = await verifyItemInWorkspace("task", taskId, workspaceId);

  return prisma.task.update({
    where: { id: taskId },
    data: { completed: !task.completed },
    include: {
      user: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      objective: { select: { id: true, name: true } },
      okr: { select: { id: true, title: true } },
      aiRecommendation: true,
    },
  });
}

export async function deleteTaskInWorkspace(
  workspaceId: number,
  taskId: number,
  userId: number
) {
  await requireWorkspaceAccess(workspaceId, userId);
  await verifyItemInWorkspace("task", taskId, workspaceId);
  return prisma.task.delete({ where: { id: taskId } });
}

// Get task with its AI recommendation
export async function getTaskWithRecommendation(
  workspaceId: number,
  taskId: number,
  userId: number
) {
  await requireWorkspaceAccess(workspaceId, userId);

  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      objective: { select: { id: true, name: true } },
      okr: { select: { id: true, title: true } },
      aiRecommendation: true,
    },
  });

  if (!task) throw new Error("Task not found in this workspace");
  return task;
}

// ============================================
// AI Recommendation helper
// ============================================

async function generateAiRecommendationForTask(task: any, userId: number) {
  try {
    const userPreferences = await aiRecommendationService.getUserWorkPreferences(userId);

    const taskAnalysis: TaskAnalysis = {
      title: task.title,
      description: task.description || "",
      duration: task.duration,
      importance: task.importance,
      urgency: task.urgency,
      isHighLeverage: task.isHighLeverage || false,
      advancesKeyResults: task.advancesKeyResults || false,
      dueDate: task.dueDate || undefined,
    };

    const recommendation =
      await aiRecommendationService.generateEnhancedTaskRecommendation(
        taskAnalysis,
        userPreferences,
        userId
      );

    // Upsert the recommendation
    await prisma.aIRecommendation.upsert({
      where: { taskId: task.id },
      update: {
        category: recommendation.category,
        recommendedTime: recommendation.recommendedTime,
        confidence: recommendation.confidence,
        reasoning: recommendation.reasoning || null,
        signalType: recommendation.signalType || null,
        recommendedDuration: recommendation.recommendedDuration || null,
        breakRecommendation: recommendation.breakRecommendation || null,
        loadWarning: recommendation.loadWarning || null,
        importanceFlag: recommendation.importanceFlag ?? null,
        urgencyFlag: recommendation.urgencyFlag ?? null,
      },
      create: {
        taskId: task.id,
        category: recommendation.category,
        recommendedTime: recommendation.recommendedTime,
        confidence: recommendation.confidence,
        reasoning: recommendation.reasoning || null,
        signalType: recommendation.signalType || null,
        recommendedDuration: recommendation.recommendedDuration || null,
        breakRecommendation: recommendation.breakRecommendation || null,
        loadWarning: recommendation.loadWarning || null,
        importanceFlag: recommendation.importanceFlag ?? null,
        urgencyFlag: recommendation.urgencyFlag ?? null,
      },
    });

    // Update task category based on AI recommendation
    const categoryMap: Record<string, string> = {
      "Deep Work": "deepWork",
      "Creative Work": "creative",
      "Reflective Work": "reflection",
      "Executive Work": "execution",
    };
    const mappedCategory = categoryMap[recommendation.category];
    if (mappedCategory) {
      await prisma.task.update({
        where: { id: task.id },
        data: { category: mappedCategory },
      });
    }
  } catch (err) {
    console.error("[AI Rec] Failed to generate for task", task.id, err);
  }
}
