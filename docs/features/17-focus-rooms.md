# Focus Rooms

## Overview

Focus Rooms enable users to create collaborative focus sessions where multiple participants can join, set intentions, and work together. Rooms support scheduling, recurring sessions, templates, and real-time WebSocket updates.

## Technical Architecture

### Focus Room Models

```prisma
model FocusRoom {
  id                 Int                 @id @default(autoincrement())
  name               String              @db.VarChar(50)
  description        String?             @db.VarChar(500)
  creatorId          Int
  status             String              @default("active") // draft, active, scheduled, completed, archived
  visibility         FocusRoomVisibility @default(PUBLIC)
  focusDuration      Int                 @default(25) // minutes
  breakDuration      Int                 @default(5) // minutes
  allowObservers     Boolean             @default(true)
  passwordHash       String?
  requiresPassword   Boolean             @default(false)
  settings           Json?               @default("{}")
  scheduledStartTime DateTime?
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt

  creator           User                   @relation("FocusRoomCreator")
  sessions          FocusRoomSession[]
  participants      FocusRoomParticipant[]
  invitations       FocusRoomInvitation[]
  recurringSchedule RecurringSchedule?
}

model FocusRoomSession {
  id                Int                @id @default(autoincrement())
  roomId            Int
  startedAt         DateTime
  endedAt           DateTime?
  pausedAt          DateTime?
  resumedAt         DateTime?
  scheduledDuration Int                // seconds
  actualDuration    Int?               // seconds
  status            FocusSessionStatus @default(ACTIVE) // PENDING, ACTIVE, PAUSED, COMPLETED
}

model FocusRoomParticipant {
  id              Int                    @id @default(autoincrement())
  roomId          Int
  userId          Int
  role            FocusParticipantRole   @default(PARTICIPANT) // CREATOR, PARTICIPANT
  status          FocusParticipantStatus @default(JOINED) // JOINED, FOCUSING, BREAK, IDLE, LEFT
  joinedAt        DateTime               @default(now())
  leftAt          DateTime?
  intention       String?
  completion      String?
  shareCompletion Boolean                @default(false)
}

enum FocusRoomVisibility {
  PUBLIC
  PRIVATE
}

enum FocusSessionStatus {
  PENDING
  ACTIVE
  PAUSED
  COMPLETED
}

enum FocusParticipantStatus {
  JOINED
  FOCUSING
  BREAK
  IDLE
  LEFT
}
```

### Key Features

#### 1. Room Creation

```typescript
async createFocusRoom(
  userId: number,
  data: CreateFocusRoomRequest
): Promise<FocusRoom> {
  const room = await prisma.focusRoom.create({
    data: {
      name: data.name,
      description: data.description,
      creatorId: userId,
      focusDuration: data.focusDuration || 25,
      breakDuration: data.breakDuration || 5,
      visibility: data.visibility || "PUBLIC",
      requiresPassword: !!data.password,
      passwordHash: data.password ? await hashPassword(data.password) : null,
      scheduledStartTime: data.scheduledStartTime,
    },
  });

  // Add creator as participant
  await prisma.focusRoomParticipant.create({
    data: {
      roomId: room.id,
      userId,
      role: "CREATOR",
      status: "JOINED",
    },
  });

  return room;
}
```

#### 2. Recurring Sessions

```typescript
model RecurringSchedule {
  id             Int      @id @default(autoincrement())
  roomId         Int      @unique
  recurrenceType String   // "DAILY", "WEEKLY", "CUSTOM"
  daysOfWeek     Int[]    // [0,1,2,3,4,5,6] for Sun-Sat
  time           String   // "HH:mm" format
  timezone       String   @default("UTC")
  startDate      DateTime
  isActive       Boolean  @default(true)
}
```

#### 3. Templates

```prisma
model FocusRoomTemplate {
  id             Int                  @id @default(autoincrement())
  name           String
  description    String?
  creatorId      Int
  isSystem       Boolean              @default(false)
  category       RoomTemplateCategory @default(CUSTOM)
  focusDuration  Int                  @default(25)
  breakDuration  Int                  @default(5)
  allowObservers Boolean              @default(true)
  visibility     FocusRoomVisibility  @default(PUBLIC)
  settings       Json?
  usageCount     Int                  @default(0)
}

enum RoomTemplateCategory {
  DEEP_WORK
  CREATIVE
  PLANNING
  LEARNING
  CUSTOM
}
```

#### 4. WebSocket Support

Real-time updates via WebSocket:
- Participant join/leave
- Session start/pause/resume/end
- Status updates
- Timer synchronization

### API Endpoints

- `POST /api/focus-rooms` - Create focus room
- `GET /api/focus-rooms` - Get focus rooms
- `GET /api/focus-rooms/:id` - Get focus room by ID
- `PUT /api/focus-rooms/:id` - Update focus room
- `DELETE /api/focus-rooms/:id` - Delete focus room
- `POST /api/focus-rooms/:id/join` - Join focus room
- `POST /api/focus-rooms/:id/leave` - Leave focus room
- `POST /api/focus-rooms/:id/sessions` - Start session
- `GET /api/focus-rooms/templates` - Get room templates
- `POST /api/focus-rooms/:id/recurring` - Create recurring schedule

### Important Code Snippets

**Join Room:**
```typescript
const participant = await prisma.focusRoomParticipant.create({
  data: {
    roomId,
    userId,
    role: "PARTICIPANT",
    status: "JOINED",
  },
});
```

**Start Session:**
```typescript
const session = await prisma.focusRoomSession.create({
  data: {
    roomId,
    startedAt: new Date(),
    scheduledDuration: room.focusDuration * 60, // Convert to seconds
    status: "ACTIVE",
  },
});
```

