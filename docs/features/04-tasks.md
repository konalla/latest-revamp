# Tasks

## Overview

The Tasks feature is the core work management system that allows users to create, organize, and manage tasks with AI-powered recommendations, Signal Layer prioritization, and integration with Projects, Objectives, OKRs, and Plans.

## Technical Architecture

### Task Model

```prisma
model Task {
  id          Int       @id @default(autoincrement())
  title       String
  description String?
  category    String
  duration    Int
  priority    String
  position    Int
  createdAt   DateTime  @default(now())
  completed   Boolean   @default(false)
  dueDate     DateTime?

  // Eisenhower Matrix
  importance Boolean @default(false)
  urgency    Boolean @default(false)

  // Signal Layer (User-controlled toggles)
  isHighLeverage     Boolean @default(false) // HLA - High-Leverage Activity
  advancesKeyResults Boolean @default(false) // AKR - Advances Key Results

  // Relations
  userId      Int
  projectId   Int?
  objectiveId Int?
  okrId       Int?
  planId      Int?
  workspaceId Int?
  teamId      Int?

  // AI Recommendation relation
  aiRecommendation AIRecommendation?

  @@index([userId, completed])
}
```

### Key Features

#### 1. Task Creation with AI Classification

Tasks are automatically classified by AI when created:

```typescript
async createTask(data: CreateTaskRequest, userId: number) {
  // 1. Check subscription limits
  const canCreate = await subscriptionService.canCreateTask(userId);
  if (!canCreate.canCreate) {
    throw new Error(canCreate.reason);
  }

  // 2. Create task
  const task = await prisma.task.create({
    data: { ...data, userId },
    include: { project: true, objective: true, okr: true },
  });

  // 3. Get user work preferences for AI
  const userPreferences = await aiRecommendationService.getUserWorkPreferences(userId);

  // 4. Generate AI recommendation
  const taskAnalysis = {
    title: task.title,
    description: task.description || "",
    duration: task.duration,
    importance: task.importance,
    urgency: task.urgency,
    isHighLeverage: task.isHighLeverage,
    advancesKeyResults: task.advancesKeyResults,
    dueDate: task.dueDate,
    projectName: task.project?.name || "",
    objectiveName: task.objective?.name || "",
    okrTitle: task.okr?.title || "",
  };

  const recommendation = await aiRecommendationService.generateTaskRecommendation(
    taskAnalysis,
    userPreferences,
    userId
  );

  // 5. Update task category based on AI recommendation
  const mappedCategory = mapAICategoryToTaskCategory(recommendation.category);
  await prisma.task.update({
    where: { id: task.id },
    data: { category: mappedCategory },
  });

  // 6. Save AI recommendation
  await prisma.aiRecommendation.create({
    data: {
      taskId: task.id,
      category: recommendation.category,
      recommendedTime: recommendation.recommendedTime,
      confidence: recommendation.confidence,
      reasoning: recommendation.reasoning,
      // Enhanced fields
      signalType: recommendation.signalType,
      recommendedDuration: recommendation.recommendedDuration,
      breakRecommendation: recommendation.breakRecommendation,
      loadWarning: recommendation.loadWarning,
    },
  });

  // 7. Update cognitive load
  await cognitiveLoadService.updateCognitiveLoad(userId);

  // 8. Increment task counter
  await subscriptionService.incrementTaskCount(userId);

  return task;
}
```

#### 2. Bulk Task Creation

Tasks can be created in bulk with optimized AI processing:

```typescript
async createBulkTasks(bulkData: BulkTaskRequest, userId: number) {
  // 1. Determine dueDate from OKR/Objective endDate
  let dueDate: Date | undefined = undefined;
  if (bulkData.okrId) {
    const okr = await prisma.okr.findUnique({
      where: { id: bulkData.okrId },
      select: { endDate: true }
    });
    if (okr?.endDate) dueDate = okr.endDate;
  }

  // 2. Process all tasks in transaction
  const createdTasks = await prisma.$transaction(
    bulkData.tasks.map(taskItem =>
      prisma.task.create({
        data: {
          ...taskItem,
          userId,
          dueDate, // Use OKR/Objective dueDate
        },
      })
    )
  );

  // 3. Generate AI recommendations in parallel
  await Promise.all(
    createdTasks.map(async (task) => {
      const recommendation = await aiRecommendationService.generateTaskRecommendation(...);
      // Update task and save recommendation
    })
  );

  return { tasks: createdTasks };
}
```

#### 3. Signal Layer Prioritization

The Signal Layer is the highest priority system:

```typescript
// Signal Type Determination
determineSignalType(
  isHighLeverage: boolean,
  advancesKeyResults: boolean,
  importance: boolean,
  urgency: boolean
): SignalType {
  // Core-Signal: Both HLA and AKR are ON (highest priority)
  if (isHighLeverage && advancesKeyResults) {
    return "Core-Signal";
  }
  
  // High-Signal: Only HLA is ON
  if (isHighLeverage) {
    return "High-Signal";
  }
  
  // Strategic-Signal: Only AKR is ON
  if (advancesKeyResults) {
    return "Strategic-Signal";
  }
  
  // Noise: All toggles are OFF
  if (!isHighLeverage && !advancesKeyResults && !importance && !urgency) {
    return "Noise";
  }
  
  // Neutral: Default
  return "Neutral";
}
```

**Priority Hierarchy:**
1. **Signal Layer** (HLA/AKR) - Highest priority
2. **FocusZone** (Importance/Urgency) - Eisenhower Matrix
3. **Cognitive Mode** - Deep/Creative/Reflective/Executive
4. **Scheduling** - Time windows and duration
5. **Noise Handling** - Low-priority tasks

#### 4. Task Categories (Cognitive Modes)

Tasks are classified into four cognitive work modes:

- **Deep Work** (`deepWork`): Analytical, technical, high-load tasks
- **Creative Work** (`creative`): Ideation, conceptual work
- **Reflective Work** (`reflection`): Reviewing, learning, strategic thinking
- **Executive Work** (`execution`): Admin, coordination, logistics

#### 5. Task Completion and Updates

```typescript
async updateTask(id: number, userId: number, data: UpdateTaskRequest) {
  // Verify ownership
  const existingTask = await prisma.task.findFirst({
    where: { id, userId },
  });

  if (!existingTask) {
    return null;
  }

  // Update task
  const updatedTask = await prisma.task.update({
    where: { id },
    data,
  });

  // If category or Signal Layer changed, regenerate AI recommendation
  if (data.category || data.isHighLeverage !== undefined || data.advancesKeyResults !== undefined) {
    await regenerateAIRecommendation(updatedTask);
  }

  // Update cognitive load if completion status changed
  if (data.completed !== undefined) {
    await cognitiveLoadService.updateCognitiveLoad(userId);
  }

  return updatedTask;
}
```

#### 6. Today's Tasks

Get tasks scheduled for today with AI recommendations:

```typescript
async getTodayTasks(userId: number): Promise<TodayTasksResponse> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const tasks = await prisma.task.findMany({
    where: {
      userId,
      completed: false,
      OR: [
        { dueDate: { gte: today, lt: tomorrow } },
        { dueDate: null }, // Tasks without due date
      ],
    },
    include: {
      aiRecommendation: true,
      project: true,
      objective: true,
      okr: true,
    },
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'desc' },
    ],
  });

  return {
    tasks: tasks.map(task => ({
      ...task,
      aiRecommendation: task.aiRecommendation ? {
        recommendedTime: task.aiRecommendation.recommendedTime,
        category: task.aiRecommendation.category,
        confidence: task.aiRecommendation.confidence,
      } : null,
    })),
  };
}
```

### AI Recommendation Integration

Every task gets an AI recommendation with:

```typescript
model AIRecommendation {
  taskId          Int     @unique
  category        String  // DEEP_WORK, CREATIVE_WORK, etc.
  recommendedTime String  // HH:MM format
  confidence      Float   // 0.0 to 1.0
  reasoning       String?
  
  // Enhanced Signal Layer fields
  signalType          String? // Core-Signal, High-Signal, etc.
  recommendedDuration Int?    // 25-90 minutes
  breakRecommendation String? // Break advice
  loadWarning         String? // Load warning
  importanceFlag      Boolean? // Conflict detection
  urgencyFlag         Boolean? // Conflict detection
}
```

### Subscription Limits

Tasks are limited by subscription plan:

| Plan | Max Tasks |
|------|-----------|
| Free | 50 |
| Trial | 50 |
| Monthly | 1000 |
| Yearly | 10000 |

**Tracking:** `tasksCreatedThisPeriod` is incremented on each task creation.

### API Endpoints

- `POST /api/tasks` - Create task
- `POST /api/tasks/bulk` - Create multiple tasks
- `GET /api/tasks` - Get all tasks (with filtering)
- `GET /api/tasks/today` - Get today's tasks
- `GET /api/tasks/:id` - Get task by ID
- `PUT /api/tasks/:id` - Update task
- `PATCH /api/tasks/batch` - Batch update tasks
- `DELETE /api/tasks/:id` - Delete task
- `POST /api/tasks/:id/complete` - Mark task as complete

### Important Code Snippets

**Category Mapping:**
```typescript
private mapAICategoryToTaskCategory(aiCategory: WorkCategory): string {
  const categoryMap = {
    [WorkCategory.DEEP_WORK]: "deepWork",
    [WorkCategory.CREATIVE_WORK]: "creative",
    [WorkCategory.REFLECTIVE_WORK]: "reflection",
    [WorkCategory.EXECUTIVE_WORK]: "execution"
  };
  return categoryMap[aiCategory] || "execution";
}
```

**Priority Evaluation:**
```typescript
// For tasks with importance=false and urgency=false
if (needsPriorityEvaluation) {
  const recommendation = await aiRecommendationService
    .generateTaskRecommendationWithPriority(taskAnalysis, userPreferences, userId);
  
  // Update importance, urgency, priority, and category
  updateData = {
    category: mappedCategory,
    importance: recommendation.importance,
    urgency: recommendation.urgency,
    priority: recommendation.priority
  };
}
```

### Error Handling

- **400 Bad Request**: Invalid task data, subscription limit exceeded
- **403 Forbidden**: User doesn't own the task
- **404 Not Found**: Task not found
- **500 Internal Server Error**: Database or AI service errors

### Testing Considerations

1. Test AI recommendation generation
2. Test Signal Layer prioritization
3. Test bulk task creation
4. Test subscription limit enforcement
5. Test task completion and cognitive load updates
6. Test today's tasks filtering

