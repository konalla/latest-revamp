# Workspaces & Teams

## Overview

Workspaces and Teams enable collaboration by allowing users to share projects, objectives, OKRs, and tasks. Workspaces contain teams, and both support role-based access control.

## Technical Architecture

### Workspace Model

```prisma
model Workspace {
  id        Int      @id @default(autoincrement())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  ownerId     Int
  owner       User                  @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  teams       Team[]
  projects    Project[]
  objectives  Objective[]
  okrs        Okr[]
  tasks       Task[]
  memberships WorkspaceMembership[]
}

model WorkspaceMembership {
  id        Int           @id @default(autoincrement())
  role      WorkspaceRole
  userId      Int
  workspaceId Int
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([userId, workspaceId])
}

enum WorkspaceRole {
  WORKSPACE_MANAGER
}
```

### Team Model

```prisma
model Team {
  id        Int      @id @default(autoincrement())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  workspaceId Int
  workspace   Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  memberships TeamMembership[]
  projects    Project[]
  objectives  Objective[]
  okrs        Okr[]
  tasks       Task[]
}

model TeamMembership {
  id        Int              @id @default(autoincrement())
  role      TeamRole         @default(MEMBER)
  status    TeamMemberStatus @default(ACTIVE)
  userId    Int
  teamId    Int
  user      User @relation(fields: [userId], references: [id], onDelete: Cascade)
  team      Team @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@unique([userId, teamId])
}

enum TeamRole {
  ADMIN
  MEMBER
  TEAM_MANAGER
}

enum TeamMemberStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
  UNDER_REVIEW
}
```

### Key Features

#### 1. Workspace Creation

```typescript
async createWorkspace(userId: number, name: string): Promise<Workspace> {
  // Check subscription limits
  const canCreate = await subscriptionService.canCreateWorkspace(userId);
  if (!canCreate.canCreate) {
    throw new Error(canCreate.reason);
  }

  const workspace = await prisma.workspace.create({
    data: {
      name,
      ownerId: userId,
    },
  });

  // Create membership for owner
  await prisma.workspaceMembership.create({
    data: {
      userId,
      workspaceId: workspace.id,
      role: "WORKSPACE_MANAGER",
    },
  });

  await subscriptionService.incrementWorkspaceCount(userId);
  return workspace;
}
```

#### 2. Team Management

- **Create Team**: Teams belong to workspaces
- **Add Members**: Invite users to teams
- **Role Management**: ADMIN, MEMBER, TEAM_MANAGER roles
- **Status Tracking**: ACTIVE, INACTIVE, SUSPENDED, UNDER_REVIEW

#### 3. Auto-Creation on Registration

```typescript
async ensureWorkspaceAndTeamForUser(userId: number, name: string, username: string): Promise<void> {
  // Create default workspace
  const workspace = await prisma.workspace.create({
    data: {
      name: `${name}'s Workspace`,
      ownerId: userId,
    },
  });

  // Create default team
  const team = await prisma.team.create({
    data: {
      name: `${name}'s Team`,
      workspaceId: workspace.id,
    },
  });

  // Create memberships
  await prisma.workspaceMembership.create({
    data: {
      userId,
      workspaceId: workspace.id,
      role: "WORKSPACE_MANAGER",
    },
  });

  await prisma.teamMembership.create({
    data: {
      userId,
      teamId: team.id,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
}
```

### API Endpoints

**Workspaces:**
- `POST /api/workspaces` - Create workspace
- `GET /api/workspaces` - Get user workspaces
- `GET /api/workspaces/:id` - Get workspace by ID
- `PUT /api/workspaces/:id` - Update workspace
- `DELETE /api/workspaces/:id` - Delete workspace
- `POST /api/workspaces/:id/members` - Add workspace member

**Teams:**
- `POST /api/teams` - Create team
- `GET /api/teams` - Get user teams
- `GET /api/teams/:id` - Get team by ID
- `PUT /api/teams/:id` - Update team
- `DELETE /api/teams/:id` - Delete team
- `POST /api/teams/:id/members` - Add team member
- `PUT /api/teams/:id/members/:userId` - Update team member role/status

### Important Code Snippets

**Check Workspace Access:**
```typescript
const membership = await prisma.workspaceMembership.findUnique({
  where: {
    userId_workspaceId: {
      userId,
      workspaceId,
    },
  },
});

if (!membership) {
  throw new Error("Unauthorized workspace access");
}
```

**Get Team Projects:**
```typescript
const projects = await prisma.project.findMany({
  where: {
    teamId: teamId,
    OR: [
      { userId }, // User's own projects
      { team: { memberships: { some: { userId } } } }, // Team projects
    ],
  },
});
```

