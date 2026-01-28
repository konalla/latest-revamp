# Objectives

## Overview

Objectives are high-level goals within projects. They can contain OKRs, plans, and tasks, and can be associated with workspaces and teams.

## Technical Architecture

### Objective Model

```prisma
model Objective {
  id          Int       @id @default(autoincrement())
  name        String
  description String?
  status      String    @default("active")
  color       String    @default("#4A6CF7")
  start_date  DateTime  @default(now())
  end_date    DateTime?
  created_at  DateTime  @default(now())
  position    Int       @default(0)
  workspaceId Int?
  teamId      Int?

  // Relations
  userId    Int
  projectId Int?
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  project   Project?   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  workspace Workspace? @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  team      Team?      @relation(fields: [teamId], references: [id], onDelete: Cascade)
  plans     Plan[]
  okrs      Okr[]
  tasks     Task[]
}
```

### Key Features

- **Project Association**: Objectives belong to projects
- **OKR Tracking**: Objectives contain OKRs (Objectives and Key Results)
- **Plan Integration**: Objectives can have multiple plans
- **Task Linking**: Tasks can be linked to objectives
- **Workspace/Team Support**: Objectives can be shared in workspaces/teams
- **Status Management**: Active, completed, archived statuses
- **Position Ordering**: Objectives can be reordered

### API Endpoints

- `POST /api/objectives` - Create objective
- `GET /api/objectives` - Get all objectives
- `GET /api/objectives/:id` - Get objective by ID
- `PUT /api/objectives/:id` - Update objective
- `DELETE /api/objectives/:id` - Delete objective
- `GET /api/objectives/:id/okrs` - Get objective OKRs
- `GET /api/objectives/:id/tasks` - Get objective tasks

### Important Code Snippets

**Create Objective:**
```typescript
const objective = await prisma.objective.create({
  data: {
    name: "Increase Revenue",
    description: "Goal to increase company revenue",
    userId,
    projectId,
    status: "active",
  },
});
```

**Get Objectives with Relations:**
```typescript
const objectives = await prisma.objective.findMany({
  where: { userId },
  include: {
    okrs: true,
    tasks: true,
    plans: true,
  },
});
```

