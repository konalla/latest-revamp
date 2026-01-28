# Plans

## Overview

Plans link projects and objectives together and can contain OKRs and tasks. They provide a structured way to organize work across the project hierarchy.

## Technical Architecture

### Plan Model

```prisma
model Plan {
  id          Int      @id @default(autoincrement())
  name        String
  description String?
  status      String   @default("active")
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  // Relations
  projectId   Int
  objectiveId Int
  project     Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  objective   Objective @relation(fields: [objectiveId], references: [id], onDelete: Cascade)
  okrs        Okr[]
  tasks       Task[]

  @@unique([projectId, objectiveId])
}
```

### Key Features

- **Project-Objective Link**: Plans uniquely link a project to an objective
- **OKR Organization**: Plans can contain multiple OKRs
- **Task Management**: Tasks can be linked to plans
- **Status Tracking**: Active, completed, archived statuses
- **Unique Constraint**: One plan per project-objective pair

### API Endpoints

- `POST /api/plans` - Create plan
- `GET /api/plans` - Get all plans
- `GET /api/plans/:id` - Get plan by ID
- `PUT /api/plans/:id` - Update plan
- `DELETE /api/plans/:id` - Delete plan
- `GET /api/plans/:id/okrs` - Get plan OKRs
- `GET /api/plans/:id/tasks` - Get plan tasks

### Important Code Snippets

**Create Plan:**
```typescript
const plan = await prisma.plan.create({
  data: {
    name: "Q1 Revenue Plan",
    description: "Plan to achieve Q1 revenue goals",
    projectId,
    objectiveId,
    status: "active",
  },
});
```

**Get Plan with Relations:**
```typescript
const plan = await prisma.plan.findUnique({
  where: { id: planId },
  include: {
    project: true,
    objective: true,
    okrs: true,
    tasks: true,
  },
});
```

