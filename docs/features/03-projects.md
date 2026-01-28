# Projects

## Overview

The Projects feature allows users to organize their work into projects with associated objectives, OKRs, plans, and tasks. Projects can be private or shared within workspaces and teams.

## Technical Architecture

### Project Model

```prisma
model Project {
  id          Int       @id @default(autoincrement())
  name        String
  description String?
  status      String?
  color       String    @default("#4A6CF7")
  icon        String?
  startDate   DateTime  @default(now())
  endDate     DateTime?
  createdAt   DateTime  @default(now())
  userId      Int
  is_private  Boolean   @default(false)
  visibility  String    @default("private")
  workspaceId Int?
  teamId      Int?

  // Relations
  user       User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspace  Workspace?  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  team       Team?       @relation(fields: [teamId], references: [id], onDelete: Cascade)
  plans      Plan[]
  tasks      Task[]
  objectives Objective[]
}
```

### Key Features

#### 1. Project Creation with Subscription Limits

Projects are subject to subscription plan limits:

```typescript
const createProject = async (data: CreateProjectRequest, userId: number) => {
  // Check subscription limits before creating
  const canCreate = await subscriptionService.canCreateProject(userId);
  if (!canCreate.canCreate) {
    throw new Error(canCreate.reason || "Cannot create project");
  }

  const project = await prisma.project.create({
    data: {
      ...data,
      userId,
    },
  });

  // Increment project counter for subscription tracking
  await subscriptionService.incrementProjectCount(userId);

  return project;
};
```

**Subscription Integration:**
- Checks `maxProjects` limit from subscription plan
- Tracks `projectsCreatedThisPeriod` in subscription
- Throws error if limit exceeded

#### 2. Project Visibility

Projects can have different visibility levels:
- **private**: Only visible to owner
- **workspace**: Visible to workspace members
- **team**: Visible to team members

#### 3. Project Filtering and Search

```typescript
const getAllProjectsByUser = async (userId: number, queryParams: ProjectQueryParams) => {
  const { page = 1, limit = 10, status, visibility, search } = queryParams;
  
  const where: any = {
    userId,
    ...(status && { status }),
    ...(visibility && { visibility }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.project.count({ where }),
  ]);

  return { projects, total };
};
```

#### 4. Project Statistics

```typescript
const getProjectStats = async (userId: number) => {
  const [totalProjects, activeProjects, completedProjects] = await Promise.all([
    prisma.project.count({ where: { userId } }),
    prisma.project.count({ where: { userId, status: 'active' } }),
    prisma.project.count({ where: { userId, status: 'completed' } }),
  ]);

  return {
    total: totalProjects,
    active: activeProjects,
    completed: completedProjects,
  };
};
```

#### 5. Project Relations

Projects can contain:
- **Objectives**: High-level goals within the project
- **OKRs**: Objectives and Key Results
- **Plans**: Action plans linking objectives to OKRs
- **Tasks**: Individual work items

### Project Service Operations

#### Get Project with Relations

```typescript
const getProjectById = async (id: number, userId: number) => {
  return prisma.project.findFirst({
    where: { id, userId },
    include: {
      objectives: true,
      tasks: true,
      plans: {
        include: {
          okrs: true,
        },
      },
    },
  });
};
```

#### Get Project Tasks

```typescript
const getProjectTasks = async (projectId: number, userId: number) => {
  // Verify project ownership
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });

  if (!project) {
    return null;
  }

  return prisma.task.findMany({
    where: { 
      projectId,
      userId, // Ensure user can only see their own tasks
    },
    orderBy: { createdAt: 'desc' },
  });
};
```

#### Get Project Objectives

```typescript
const getProjectObjectives = async (projectId: number, userId: number) => {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });

  if (!project) {
    return null;
  }

  return prisma.objective.findMany({
    where: { 
      projectId,
      userId,
    },
    orderBy: { created_at: 'desc' },
  });
};
```

### Workspace and Team Integration

Projects can be associated with workspaces and teams:

```typescript
// Project in workspace
const workspaceProject = await prisma.project.create({
  data: {
    name: "Team Project",
    userId: ownerId,
    workspaceId: workspaceId,
    visibility: "workspace",
  },
});

// Project in team
const teamProject = await prisma.project.create({
  data: {
    name: "Team Project",
    userId: ownerId,
    teamId: teamId,
    visibility: "team",
  },
});
```

### API Endpoints

- `POST /api/projects` - Create new project
- `GET /api/projects` - Get all user projects (with pagination, filtering, search)
- `GET /api/projects/:id` - Get project by ID
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project
- `GET /api/projects/stats` - Get project statistics
- `GET /api/projects/:id/tasks` - Get project tasks
- `GET /api/projects/:id/objectives` - Get project objectives
- `GET /api/projects/:id/okrs` - Get project OKRs

### Subscription Limits

Projects are limited by subscription plan:

| Plan | Max Projects |
|------|--------------|
| Free | 1 |
| Trial | 1 |
| Monthly | Based on plan |
| Yearly | Based on plan |

**Important:** The system tracks `projectsCreatedThisPeriod` and enforces limits before allowing project creation.

### Important Code Snippets

**Subscription Limit Check:**
```typescript
const canCreate = await subscriptionService.canCreateProject(userId);
if (!canCreate.canCreate) {
  throw new Error(canCreate.reason || "Cannot create project");
}
```

**Project Ownership Verification:**
```typescript
const existingProject = await prisma.project.findFirst({
  where: { id, userId },
});

if (!existingProject) {
  return null; // Project doesn't exist or user doesn't own it
}
```

**Cascade Deletion:**
```typescript
// When project is deleted, all related data is cascade deleted:
// - Objectives
// - OKRs
// - Plans
// - Tasks
// This is handled by Prisma's onDelete: Cascade
```

### Error Handling

- **400 Bad Request**: Invalid project data, subscription limit exceeded
- **403 Forbidden**: User doesn't own the project
- **404 Not Found**: Project not found
- **500 Internal Server Error**: Database errors

### Testing Considerations

1. Test subscription limit enforcement
2. Test project creation with workspace/team
3. Test project filtering and search
4. Test cascade deletion of related data
5. Test project statistics calculation
6. Test visibility settings

