# Focus Planning & Sessions

## Overview

The Focus Planning & Sessions system helps users organize their tasks into focused work sessions. It generates focus plans based on task categories, AI recommendations, and cognitive load considerations.

## Technical Architecture

### Focus Session Model

```prisma
model FocusSession {
  id             Int       @id @default(autoincrement())
  userId         Int
  sessionType    String    // "deepWork", "creative", "reflection", "execution"
  status         String    @default("active") // active, paused, completed
  intention      Json      @default("{}") // Task IDs, goals, etc.
  startedAt      DateTime  @default(now())
  endedAt        DateTime?
  pausedAt       DateTime?
  resumedAt      DateTime?
  duration       Int       @default(0) // in seconds
  completed      Boolean   @default(false)
  notes          String?
  tasksCompleted Int       @default(0)
  
  // AI Analytics
  aiScore                Int?
  distractions           Int     @default(0)
  environment            String?
  mood                   String?
  energyLevel            String?
  cognitiveFlowScore     Int?
  contextSwitchCount     Int     @default(0)
  flowState              String?
  taskGroupEffectiveness Json    @default("{}")
}
```

### Key Features

#### 1. Focus Plan Generation

```typescript
async generateFocusPlan(userId: number): Promise<FocusPlanResponse> {
  // Fetch incomplete tasks
  const tasks = await this.getAllIncompleteTasks(userId);
  
  // Group tasks by category
  const tasksByCategory = this.groupTasksByCategory(tasks);
  
  // Prioritize tasks within categories
  const categoryPlans = this.prioritizeTasksInCategories(tasksByCategory);
  
  // Generate recommended order
  const recommendedOrder = this.generateRecommendedOrder(categoryPlans);
  
  // Fetch existing AI recommendations
  const existingRecommendations = await this.getExistingAiRecommendations(taskIds);
  
  return {
    categoryPlans,
    recommendedOrder,
    aiRecommendations: existingRecommendations,
  };
}
```

#### 2. Focus Session Management

- **Start Session**: Creates focus session with task intentions
- **Pause/Resume**: Tracks session pauses and resumes
- **End Session**: Records completion, duration, and analytics
- **WebSocket Support**: Real-time session updates via WebSocket

#### 3. Task Prioritization

Tasks are prioritized based on:
- Signal Layer (HLA/AKR)
- Eisenhower Matrix (Importance/Urgency)
- Cognitive Mode
- AI Recommendations
- Due Dates

### API Endpoints

- `GET /api/focus/plan` - Generate focus plan
- `POST /api/focus/sessions` - Start focus session
- `GET /api/focus/sessions` - Get user focus sessions
- `GET /api/focus/sessions/:id` - Get focus session by ID
- `PATCH /api/focus/sessions/:id/pause` - Pause session
- `PATCH /api/focus/sessions/:id/resume` - Resume session
- `PATCH /api/focus/sessions/:id/end` - End session
- `GET /api/focus/sessions/active` - Get active session

### WebSocket Events

- `focus:session:start` - Session started
- `focus:session:pause` - Session paused
- `focus:session:resume` - Session resumed
- `focus:session:end` - Session ended
- `focus:session:update` - Session updated

### Important Code Snippets

**Start Focus Session:**
```typescript
const session = await prisma.focusSession.create({
  data: {
    userId,
    sessionType: "deepWork",
    status: "active",
    intention: { taskIds: [1, 2, 3] },
    startedAt: new Date(),
  },
});
```

**End Focus Session:**
```typescript
const session = await prisma.focusSession.update({
  where: { id: sessionId },
  data: {
    status: "completed",
    completed: true,
    endedAt: new Date(),
    duration: calculateDuration(startedAt, endedAt),
    tasksCompleted: completedTaskIds.length,
  },
});
```

