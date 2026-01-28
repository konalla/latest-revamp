# OKRs (Objectives and Key Results)

## Overview

OKRs (Objectives and Key Results) are goal-setting framework items that track progress toward objectives. They include target values, current values, confidence scores, and progress history.

## Technical Architecture

### OKR Model

```prisma
model Okr {
  id              Int       @id @default(autoincrement())
  title           String
  description     String?
  status          String    @default("notStarted")
  targetValue     Float
  currentValue    Float     @default(0)
  startDate       DateTime  @default(now())
  endDate         DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  userId          Int
  objectiveId     Int?
  planId          Int?
  position        Int       @default(0)
  confidenceScore Int       @default(3) // 1-5 scale
  keyResults      Json      @default("[]") // Array of key results
  progressHistory Json      @default("[]") // Progress tracking over time
  workspaceId     Int?
  teamId          Int?

  // Relations
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  objective Objective? @relation(fields: [objectiveId], references: [id], onDelete: Cascade)
  plan      Plan?      @relation(fields: [planId], references: [id], onDelete: Cascade)
  workspace Workspace? @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  team      Team?      @relation(fields: [teamId], references: [id], onDelete: Cascade)
  tasks     Task[]
}
```

### Key Features

- **Progress Tracking**: Tracks current value vs target value
- **Confidence Scoring**: 1-5 scale confidence in achieving the OKR
- **Key Results**: JSON array of measurable key results
- **Progress History**: JSON array tracking progress over time
- **Status Management**: notStarted, inProgress, completed, etc.
- **Task Linking**: Tasks can be linked to OKRs
- **Workspace/Team Support**: OKRs can be shared in workspaces/teams

### API Endpoints

- `POST /api/okrs` - Create OKR
- `GET /api/okrs` - Get all OKRs
- `GET /api/okrs/:id` - Get OKR by ID
- `PUT /api/okrs/:id` - Update OKR
- `PATCH /api/okrs/:id/progress` - Update OKR progress
- `DELETE /api/okrs/:id` - Delete OKR
- `GET /api/okrs/:id/tasks` - Get OKR tasks

### Important Code Snippets

**Update OKR Progress:**
```typescript
const okr = await prisma.okr.update({
  where: { id: okrId },
  data: {
    currentValue: newValue,
    progressHistory: {
      push: {
        date: new Date().toISOString(),
        value: newValue,
        percentage: (newValue / targetValue) * 100,
      },
    },
  },
});
```

**Calculate Progress Percentage:**
```typescript
const progressPercentage = (okr.currentValue / okr.targetValue) * 100;
```

