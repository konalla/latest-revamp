# IQniti Backend API Documentation

## Base URL
```
http://localhost:3000
```

## Authentication
Most API endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## Data Model Overview

The IQniti application uses a flexible hierarchical structure:

### Core Entities
- **Users** - Own and manage all other entities
- **Projects** - Top-level containers for organizing work
- **Objectives** - Goals that can be independent OR directly associated with projects
- **Plans** - Many-to-many junction connecting Projects and Objectives (alternative organization method)
- **OKRs** - Can belong to Objectives directly OR to Plans
- **Tasks** - Can belong to Projects, Objectives, OKRs, OR Plans (all optional)

### Key Relationships
```
User
├── Projects
│   ├── Tasks (direct project tasks)
│   └── Objectives (direct project objectives)
├── Objectives (independent OR project-associated)
├── Plans (Project ↔ Objective connections via junction table)
│   ├── OKRs (optional)
│   └── Tasks (optional)
├── OKRs (can be independent or belong to Objective/Plan)
└── Tasks (can be independent or belong to Project/Objective/OKR/Plan)
```

This structure allows maximum flexibility - objectives and tasks can be:
1. **Independent** - Not associated with any project
2. **Directly associated with projects** - Via projectId relationship
3. **Connected through Plans** - Via the Plan junction table (for complex many-to-many relationships)

---

## 1. Health Check API

### GET /health
Get application health status.

**Authentication:** Not required

**Response:**
```json
{
  "status": "Healthy",
  "timestamp": "2025-09-15T10:30:00.000Z",
  "uptime": 12345.678,
  "environment": "development"
}
```

**Curl Example:**
```bash
curl -X GET http://localhost:3000/health
```

---

## 2. Authentication APIs

### POST /api/auth/register
Register a new user.

**Authentication:** Not required

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "username": "johndoe",
  "name": "John Doe"
}
```

**Response:**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "johndoe",
    "name": "John Doe",
    "role": "user"
  },
  "token": "jwt_token_here",
  "message": "User registered successfully"
}
```

**Curl Example:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "username": "johndoe",
    "name": "John Doe"
  }'
```

### POST /api/auth/login
Login user with email or username.

**Authentication:** Not required

**Request Body:**
```json
{
  "identifier": "user@example.com",
  "password": "password123"
}
```

**Note:** The `identifier` field can be either an email address or a username.

**Response:**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "johndoe",
    "name": "John Doe",
    "role": "user"
  },
  "token": "jwt_token_here",
  "message": "Login successful"
}
```

**Curl Example:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

---

## 3. User Management APIs

### POST /api/users
Create a new user.

**Authentication:** Not required

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "username": "johndoe",
  "name": "John Doe"
}
```

**Response:** User object

**Curl Example:**
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "username": "johndoe",
    "name": "John Doe"
  }'
```

### GET /api/users
Get all users.

**Authentication:** Not required

**Response:** Array of user objects

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/users
```

### GET /api/users/:id
Get user by ID.

**Authentication:** Not required

**Response:** User object

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/users/1
```

### GET /api/users/me
Get current authenticated user.

**Authentication:** Required

**Response:** User object

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/users/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### PUT /api/users/:id
Update user by ID.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Updated Name",
  "email": "updated@example.com"
}
```

**Response:** Updated user object

**Curl Example:**
```bash
curl -X PUT http://localhost:3000/api/users/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Name",
    "email": "updated@example.com"
  }'
```

### DELETE /api/users/:id
Delete user by ID.

**Authentication:** Required

**Response:**
```json
{
  "message": "User deleted successfully"
}
```

**Curl Example:**
```bash
curl -X DELETE http://localhost:3000/api/users/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### PATCH /api/users/change-password
Change the current user's password.

**Authentication:** Required

**Request Body:**
```json
{
  "currentPassword": "currentPassword123",
  "newPassword": "newPassword456"
}
```

**Response:**
```json
{
  "message": "Password changed successfully"
}
```

**Error Responses:**
- 400 Bad Request: Current password is incorrect
- 401 Unauthorized: User not authenticated

**Curl Example:**
```bash
curl -X PATCH http://localhost:3000/api/users/change-password \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "currentPassword123",
    "newPassword": "newPassword456"
  }'
```

---

## 4. Project Management APIs

All project endpoints require authentication.

### POST /api/projects
Create a new project.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Project Name",
  "description": "Project Description",
  "status": "active",
  "color": "#FF5733",
  "icon": "📊",
  "startDate": "2025-01-01T00:00:00.000Z",
  "endDate": "2025-12-31T00:00:00.000Z",
  "is_private": false,
  "visibility": "public"
}
```

**Response:**
```json
{
  "message": "Project created successfully",
  "project": {
    "id": 1,
    "name": "Project Name",
    "description": "Project Description",
    "status": "active",
    "color": "#FF5733",
    "icon": "📊",
    "startDate": "2025-01-01T00:00:00.000Z",
    "endDate": "2025-12-31T00:00:00.000Z",
    "createdAt": "2025-09-15T10:30:00.000Z",
    "userId": 1,
    "is_private": false,
    "visibility": "public"
  }
}
```

**Curl Example:**
```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Project Name",
    "description": "Project Description",
    "status": "active",
    "color": "#FF5733",
    "icon": "📊",
    "startDate": "2025-01-01T00:00:00.000Z",
    "endDate": "2025-12-31T00:00:00.000Z",
    "is_private": false,
    "visibility": "public"
  }'
```

### GET /api/projects
Get all projects for authenticated user.

**Authentication:** Required

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `status` (optional): Filter by status
- `visibility` (optional): Filter by visibility
- `search` (optional): Search term

**Response:**
```json
{
  "message": "Projects retrieved successfully",
  "data": {
    "projects": [
      {
        "id": 1,
        "name": "Project Name",
        "description": "Project Description",
        "status": "active",
        "color": "#FF5733",
        "icon": "📊",
        "startDate": "2025-01-01T00:00:00.000Z",
        "endDate": "2025-12-31T00:00:00.000Z",
        "createdAt": "2025-09-15T10:30:00.000Z",
        "userId": 1,
        "is_private": false,
        "visibility": "public",
        "plans": []
      }
    ],
    "total": 1
  },
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

**Curl Example:**
```bash
curl -X GET "http://localhost:3000/api/projects?page=1&limit=10&status=active" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/projects/stats
Get project statistics.

**Authentication:** Required

**Response:** Project statistics object

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/projects/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/projects/:id
Get specific project by ID.

**Authentication:** Required

**Response:** Project object

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/projects/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### PUT /api/projects/:id
Update project by ID.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Updated Project Name",
  "description": "Updated Description",
  "status": "paused"
}
```

**Response:** Updated project object

**Curl Example:**
```bash
curl -X PUT http://localhost:3000/api/projects/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Project Name",
    "description": "Updated Description",
    "status": "paused"
  }'
```

### DELETE /api/projects/:id
Delete project by ID.

**Authentication:** Required

**Response:** Success message

**Curl Example:**
```bash
curl -X DELETE http://localhost:3000/api/projects/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/projects/:id/tasks
Get all tasks for a specific project.

**Authentication:** Required

**Response:**
```json
{
  "message": "Project tasks retrieved successfully",
  "tasks": [
    {
      "id": 1,
      "title": "Task Title",
      "description": "Task Description",
      "category": "development",
      "duration": 120,
      "priority": "high",
      "position": 1,
      "createdAt": "2025-09-15T10:30:00.000Z",
      "completed": false,
      "importance": true,
      "urgency": false,
      "userId": 1,
      "projectId": 1,
      "objectiveId": null,
      "okrId": null,
      "planId": null
    }
  ]
}
```

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/projects/1/tasks \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/projects/:id/objectives
Get all objectives for a specific project.

**Authentication:** Required

**Response:**
```json
{
  "message": "Project objectives retrieved successfully",
  "objectives": [
    {
      "id": 1,
      "name": "Objective Name",
      "description": "Objective Description",
      "status": "active",
      "color": "#FF5733",
      "start_date": "2025-01-01T00:00:00.000Z",
      "end_date": "2025-12-31T00:00:00.000Z",
      "created_at": "2025-09-15T10:30:00.000Z",
      "position": 1,
      "userId": 1,
      "projectId": 1,
      "project": {
        "id": 1,
        "name": "Project Name"
      }
    }
  ]
}
```

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/projects/1/objectives \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 5. Objective Management APIs

All objective endpoints require authentication.

### POST /api/objectives
Create a new objective. Objectives can be independent or associated with a specific project.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Objective Name",
  "description": "Objective Description",
  "status": "active",
  "color": "#FF5733",
  "start_date": "2025-01-01T00:00:00.000Z",
  "end_date": "2025-12-31T00:00:00.000Z",
  "position": 1,
  "projectId": 1
}
```

**Request Body Fields:**
- `name` (required): Objective name
- `description` (optional): Objective description
- `status` (optional): Objective status (default: "active")
- `color` (optional): Objective color (default: "#4A6CF7")
- `start_date` (optional): Start date (default: current date)
- `end_date` (optional): End date
- `position` (optional): Position for ordering (default: 0)
- `projectId` (optional): ID of the project to associate with this objective

**Response:** Objective object

**Curl Example:**
```bash
# Create an objective associated with a project
curl -X POST http://localhost:3000/api/objectives \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Objective Name",
    "description": "Objective Description",
    "status": "active",
    "color": "#FF5733",
    "start_date": "2025-01-01T00:00:00.000Z",
    "end_date": "2025-12-31T00:00:00.000Z",
    "position": 1,
    "projectId": 1
  }'

# Create an independent objective (without project association)
curl -X POST http://localhost:3000/api/objectives \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Independent Objective",
    "description": "This objective is not associated with any project"
  }'
```

### GET /api/objectives
Get all objectives for authenticated user.

**Authentication:** Required

**Query Parameters:**
- `page`, `limit`, `status`, `search`, `sortBy`, `sortOrder`

**Response:** List of objectives with pagination

**Curl Example:**
```bash
curl -X GET "http://localhost:3000/api/objectives?page=1&limit=10&status=active" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/objectives/stats
Get objective statistics.

**Authentication:** Required

**Response:** Objective statistics

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/objectives/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/objectives/project/:projectId
Get objectives for a specific project.

**Authentication:** Required

**Response:** List of objectives for the project

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/objectives/project/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/objectives/:id
Get specific objective by ID.

**Authentication:** Required

**Response:** Objective object

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/objectives/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### PUT /api/objectives/:id
Update objective by ID.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Updated Objective Name",
  "status": "completed"
}
```

**Response:** Updated objective object

**Curl Example:**
```bash
curl -X PUT http://localhost:3000/api/objectives/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Objective Name",
    "status": "completed"
  }'
```

### PUT /api/objectives/positions
Update multiple objective positions.

**Authentication:** Required

**Request Body:**
```json
{
  "positions": [
    {"id": 1, "position": 2},
    {"id": 2, "position": 1}
  ]
}
```

**Response:** Success message

**Curl Example:**
```bash
curl -X PUT http://localhost:3000/api/objectives/positions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "positions": [
      {"id": 1, "position": 2},
      {"id": 2, "position": 1}
    ]
  }'
```

### DELETE /api/objectives/:id
Delete objective by ID.

**Authentication:** Required

**Response:** Success message

**Curl Example:**
```bash
curl -X DELETE http://localhost:3000/api/objectives/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 6. Plan Management APIs

All plan endpoints require authentication.

### POST /api/plans
Create a new plan.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Plan Name",
  "description": "Plan Description",
  "status": "active",
  "projectId": 1,
  "objectiveId": 1
}
```

**Response:** Plan object

**Curl Example:**
```bash
curl -X POST http://localhost:3000/api/plans \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Plan Name",
    "description": "Plan Description",
    "status": "active",
    "projectId": 1,
    "objectiveId": 1
  }'
```

### GET /api/plans
Get all plans.

**Authentication:** Required

**Query Parameters:**
- `page`, `limit`, `status`, `search`, `projectId`, `objectiveId`, `sortBy`, `sortOrder`

**Response:** List of plans with pagination

**Curl Example:**
```bash
curl -X GET "http://localhost:3000/api/plans?page=1&limit=10&status=active" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/plans/stats
Get plan statistics.

**Authentication:** Required

**Response:** Plan statistics

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/plans/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/plans/:id
Get specific plan by ID.

**Authentication:** Required

**Response:** Plan object

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/plans/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/plans/:id/details
Get plan with detailed information.

**Authentication:** Required

**Response:** Plan object with additional details

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/plans/1/details \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/plans/project/:projectId
Get plans for a specific project.

**Authentication:** Required

**Response:** List of plans for the project

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/plans/project/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/plans/objective/:objectiveId
Get plans for a specific objective.

**Authentication:** Required

**Response:** List of plans for the objective

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/plans/objective/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### PUT /api/plans/:id
Update plan by ID.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Updated Plan Name",
  "status": "completed"
}
```

**Response:** Updated plan object

**Curl Example:**
```bash
curl -X PUT http://localhost:3000/api/plans/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Plan Name",
    "status": "completed"
  }'
```

### DELETE /api/plans/:id
Delete plan by ID.

**Authentication:** Required

**Response:** Success message

**Curl Example:**
```bash
curl -X DELETE http://localhost:3000/api/plans/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 7. OKR Management APIs

All OKR endpoints require authentication.

### POST /api/okrs
Create a new OKR.

**Authentication:** Required

**Request Body:**
```json
{
  "title": "OKR Title",
  "description": "OKR Description",
  "status": "active",
  "targetValue": 100,
  "currentValue": 0,
  "startDate": "2025-01-01T00:00:00.000Z",
  "endDate": "2025-12-31T00:00:00.000Z",
  "position": 1,
  "confidenceScore": 7,
  "keyResults": [],
  "objectiveId": 1,
  "planId": 1
}
```

**Response:** OKR object

**Curl Example:**
```bash
curl -X POST http://localhost:3000/api/okrs \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "OKR Title",
    "description": "OKR Description",
    "status": "active",
    "targetValue": 100,
    "currentValue": 0,
    "startDate": "2025-01-01T00:00:00.000Z",
    "endDate": "2025-12-31T00:00:00.000Z",
    "position": 1,
    "confidenceScore": 7,
    "keyResults": [],
    "objectiveId": 1,
    "planId": 1
  }'
```

### GET /api/okrs
Get all OKRs for authenticated user.

**Authentication:** Required

**Query Parameters:**
- `page`, `limit`, `status`, `search`, `sortBy`, `sortOrder`

**Response:** List of OKRs with pagination

**Curl Example:**
```bash
curl -X GET "http://localhost:3000/api/okrs?page=1&limit=10&status=active" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/okrs/stats
Get OKR statistics.

**Authentication:** Required

**Response:**
```json
{
  "total": 10,
  "notStarted": 2,
  "inProgress": 5,
  "completed": 3,
  "averageProgress": 65.5,
  "averageConfidenceScore": 7.2
}
```

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/okrs/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/okrs/objective/:objectiveId
Get OKRs for a specific objective.

**Authentication:** Required

**Response:** List of OKRs for the objective

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/okrs/objective/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/okrs/:id
Get specific OKR by ID.

**Authentication:** Required

**Response:** OKR object

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/okrs/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### PUT /api/okrs/:id
Update OKR by ID.

**Authentication:** Required

**Request Body:**
```json
{
  "title": "Updated OKR Title",
  "currentValue": 75,
  "status": "in-progress"
}
```

**Response:** Updated OKR object

**Curl Example:**
```bash
curl -X PUT http://localhost:3000/api/okrs/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated OKR Title",
    "currentValue": 75,
    "status": "in-progress"
  }'
```

### PUT /api/okrs/:id/progress
Update OKR progress.

**Authentication:** Required

**Request Body:**
```json
{
  "currentValue": 75,
  "confidenceScore": 8,
  "progressUpdate": {
    "date": "2025-09-15T10:30:00.000Z",
    "value": 75,
    "note": "Made significant progress this week"
  }
}
```

**Response:** Updated OKR object

**Curl Example:**
```bash
curl -X PUT http://localhost:3000/api/okrs/1/progress \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentValue": 75,
    "confidenceScore": 8,
    "progressUpdate": {
      "date": "2025-09-15T10:30:00.000Z",
      "value": 75,
      "note": "Made significant progress this week"
    }
  }'
```

### PUT /api/okrs/positions
Update multiple OKR positions.

**Authentication:** Required

**Request Body:**
```json
{
  "positions": [
    {"id": 1, "position": 2},
    {"id": 2, "position": 1}
  ]
}
```

**Response:** Success message

**Curl Example:**
```bash
curl -X PUT http://localhost:3000/api/okrs/positions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "positions": [
      {"id": 1, "position": 2},
      {"id": 2, "position": 1}
    ]
  }'
```

### DELETE /api/okrs/:id
Delete OKR by ID.

**Authentication:** Required

**Response:** Success message

**Curl Example:**
```bash
curl -X DELETE http://localhost:3000/api/okrs/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 8. Task Management APIs

All task endpoints require authentication.

### POST /api/tasks
Create a new task. Tasks can be independent or associated with projects, objectives, OKRs, or plans.

**Authentication:** Required

**Request Body:**
```json
{
  "title": "Task Title",
  "description": "Task Description",
  "category": "development",
  "duration": 120,
  "priority": "high",
  "position": 1,
  "completed": false,
  "importance": true,
  "urgency": false,
  "projectId": 1,
  "objectiveId": 1,
  "okrId": 1,
  "planId": 1
}
```

**Request Body Fields:**
- `title` (required): Task title
- `description` (optional): Task description
- `category` (required): Task category
- `duration` (required): Task duration in minutes
- `priority` (required): Task priority level
- `position` (required): Position for ordering
- `completed` (optional): Completion status (default: false)
- `importance` (optional): Eisenhower matrix importance (default: false)
- `urgency` (optional): Eisenhower matrix urgency (default: false)
- `projectId` (optional): ID of the project to associate with this task
- `objectiveId` (optional): ID of the objective to associate with this task
- `okrId` (optional): ID of the OKR to associate with this task
- `planId` (optional): ID of the plan to associate with this task

**Response:** Task object

**Curl Example:**
```bash
# Create a task associated with a project
curl -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Project Task",
    "description": "This task belongs to a project",
    "category": "development",
    "duration": 120,
    "priority": "high",
    "position": 1,
    "projectId": 1
  }'

# Create an independent task
curl -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Independent Task",
    "description": "This task is not associated with any project",
    "category": "personal",
    "duration": 60,
    "priority": "medium",
    "position": 1
  }'
```

### GET /api/tasks
Get all tasks for authenticated user.

**Authentication:** Required

**Query Parameters:**
- `page`, `limit`, `completed`, `priority`, `category`, `importance`, `urgency`, `search`, `projectId`, `objectiveId`, `okrId`, `planId`, `sortBy`, `sortOrder`

**Response:** List of tasks with pagination

**Curl Example:**
```bash
curl -X GET "http://localhost:3000/api/tasks?page=1&limit=10&completed=false&priority=high" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/tasks/stats
Get task statistics.

**Authentication:** Required

**Response:**
```json
{
  "total": 50,
  "completed": 25,
  "pending": 25,
  "highPriority": 10,
  "importantUrgent": 5,
  "importantNotUrgent": 15,
  "notImportantUrgent": 8,
  "notImportantNotUrgent": 22
}
```

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/tasks/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/tasks/project/:projectId
Get tasks for a specific project.

**Authentication:** Required

**Response:** List of tasks for the project

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/tasks/project/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/tasks/objective/:objectiveId
Get tasks for a specific objective.

**Authentication:** Required

**Response:** List of tasks for the objective

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/tasks/objective/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/tasks/okr/:okrId
Get tasks for a specific OKR.

**Authentication:** Required

**Response:** List of tasks for the OKR

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/tasks/okr/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### GET /api/tasks/:id
Get specific task by ID.

**Authentication:** Required

**Response:** Task object

**Curl Example:**
```bash
curl -X GET http://localhost:3000/api/tasks/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### PUT /api/tasks/:id
Update task by ID.

**Authentication:** Required

**Request Body:**
```json
{
  "title": "Updated Task Title",
  "priority": "medium",
  "completed": true
}
```

**Response:** Updated task object

**Curl Example:**
```bash
curl -X PUT http://localhost:3000/api/tasks/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Task Title",
    "priority": "medium",
    "completed": true
  }'
```

### PUT /api/tasks/:id/toggle
Toggle task completion status.

**Authentication:** Required

**Response:** Updated task object

**Curl Example:**
```bash
curl -X PUT http://localhost:3000/api/tasks/1/toggle \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### PUT /api/tasks/positions
Update multiple task positions.

**Authentication:** Required

**Request Body:**
```json
{
  "positions": [
    {"id": 1, "position": 2},
    {"id": 2, "position": 1}
  ]
}
```

**Response:** Success message

**Curl Example:**
```bash
curl -X PUT http://localhost:3000/api/tasks/positions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "positions": [
      {"id": 1, "position": 2},
      {"id": 2, "position": 1}
    ]
  }'
```

### DELETE /api/tasks/:id
Delete task by ID.

**Authentication:** Required

**Response:** Success message

**Curl Example:**
```bash
curl -X DELETE http://localhost:3000/api/tasks/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Summary

**Total API Endpoints: 42**

### Breakdown by Category:
1. **Health Check**: 1 endpoint
2. **Authentication**: 2 endpoints
3. **User Management**: 6 endpoints
4. **Project Management**: 6 endpoints
5. **Objective Management**: 8 endpoints
6. **Plan Management**: 8 endpoints
7. **OKR Management**: 9 endpoints
8. **Task Management**: 10 endpoints

### Authentication Summary:
- **Public endpoints**: 7 (health, auth, basic user operations)
- **Protected endpoints**: 35 (require JWT token)

### HTTP Methods Used:
- **GET**: 25 endpoints (data retrieval)
- **POST**: 7 endpoints (resource creation)
- **PUT**: 9 endpoints (resource updates)
- **DELETE**: 6 endpoints (resource deletion)

All protected endpoints require a valid JWT token in the Authorization header. Make sure to include `Bearer <token>` in your requests.
