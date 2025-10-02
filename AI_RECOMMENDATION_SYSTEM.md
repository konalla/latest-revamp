# AI Recommendation System for Task Categorization

## Overview

This AI recommendation system automatically categorizes tasks into four work modes based on cognitive science principles and provides optimal scheduling recommendations. The system uses LangChain with OpenAI's GPT-4o-mini to analyze task attributes and generate intelligent recommendations.

## Work Categories

Based on the comprehensive rulebook for task classification by brain mode, the system categorizes tasks into four cognitive work modes:

### 1. Deep Work Mode
- **Definition**: Tasks demanding intense concentration and uninterrupted focus on cognitively demanding activities that produce high-value output
- **Characteristics**: 
  - High cognitive demand: Complex problem-solving, analytical thinking, skill-intensive work
  - Uninterrupted focus needed: Cannot be effectively broken into tiny chunks without losing productivity
  - Important/High-value: Usually maps to Important items in Eisenhower Matrix (Quadrant I or II)
  - Longer duration: Typically 1-4 hours of focused effort
- **Examples**: Writing code for complex features, analyzing research data, drafting scholarly articles, learning difficult concepts, debugging hard problems, strategic planning
- **Optimal Time**: User's configured deep work window (default: 9:00 AM - 12:00 PM)
- **Classification Criteria**: Duration ≥ 60 minutes AND (Importance = true OR complex technical/analytical nature)

### 2. Creative Work Mode
- **Definition**: Tasks involving ideation, imagination, and producing original content or designs. Emphasis on innovation and creativity
- **Characteristics**:
  - Original creation: Making something new - artistic or inventive
  - Ideation and divergent thinking: Exploring diverse ideas, no single "correct" answer
  - Flexible focus & environment: Benefits from flow state, relaxed yet alert mind state
  - Importance and deadlines: Often tied to important long-term projects (Quadrant II)
- **Examples**: Designing presentation visuals, writing blog posts/stories, creating art, drafting marketing copy, brainstorming solutions, developing prototypes
- **Optimal Time**: User's configured creative work window (default: 12:00 PM - 3:00 PM)
- **Classification Criteria**: Keywords like "brainstorm", "invent", "imagine", "conceptualize", "create", "write", "compose", "design"

### 3. Reflective Work Mode
- **Definition**: Tasks focused on thinking, learning, and strategic analysis rather than immediate execution. Deliberate reflection and high-level thinking
- **Characteristics**:
  - Strategic or analytical thinking: Planning, strategizing, reviewing, problem-solving at conceptual level
  - Requires deep thought: Benefits from uninterrupted time and focus. Output is insight or decision, not physical product
  - Important but often not urgent: Typically Quadrant II - high importance, low urgency
  - Insight and learning oriented: Aim to gain insight, improve understanding, connect dots, make decisions
- **Examples**: Meditation on goals, reading industry research, mapping business strategy, risk analysis, learning new frameworks, conducting post-mortems
- **Optimal Time**: User's configured reflective work window (default: 3:00 PM - 6:00 PM)
- **Classification Criteria**: Keywords like "plan", "review", "learn", "research", "consider", "strategize", "reflect", "study"

### 4. Executive Work Mode
- **Definition**: Tasks involving rapid action, decision-making, and managing day-to-day operations. Reactive, interrupt-driven tasks
- **Characteristics**:
  - Reactive and fast-paced: Responding to immediate demands, external inputs, urgent situations
  - Short, fragmented tasks: Brief duration, often interrupted. Fits into small time windows
  - Decision-making & multitasking: Quick decisions, context switching, coordination among many issues
  - Often urgent or deadline-driven: Quadrants I and III (urgent categories)
  - People-facing and outward-focused: Communication, coordination, dealing with clients/team members
- **Examples**: Checking email, returning calls, status updates, scheduling, routine paperwork, meetings, quick fixes
- **Optimal Time**: User's configured executive work window (default: 6:00 PM - 9:00 PM)
- **Classification Criteria**: Duration ≤ 30 minutes OR urgent nature OR keywords like "reply", "call", "meeting", "update", "schedule"

## System Architecture

### Core Components

1. **AI Recommendation Service** (`src/services/ai-recommendation.service.ts`)
   - LangChain integration with OpenAI GPT-4o-mini
   - Dynamic prompt generation based on task attributes
   - User work preferences management
   - Fallback recommendation system

2. **Decorators** (`src/decorators/ai-recommendation.decorators.ts`)
   - `@AIRecommendation`: Enable AI recommendations for methods
   - `@PromptTemplate`: Define custom prompt templates
   - `@CategoryRules`: Define category-specific classification rules
   - `@AutoCategorize`: Automatically categorize tasks
   - `@WithAIRecommendation`: Enhance data with AI recommendations
   - `@ValidateRecommendation`: Validate AI recommendations

3. **Controller** (`src/controllers/ai-recommendation.controller.ts`)
   - REST API endpoints for AI recommendations
   - Bulk recommendation processing
   - User work preferences management

4. **Routes** (`src/routes/ai-recommendation.routes.ts`)
   - API route definitions
   - Authentication middleware integration

## API Endpoints

### Generate Single Task Recommendation
```
POST /api/ai-recommendations/generate
```

**Request Body:**
```json
{
  "taskId": 123,
  "includeReasoning": true,
  "forceRegenerate": false
}
```

**Response:**
```json
{
  "message": "AI recommendation generated successfully",
  "recommendation": {
    "taskId": 123,
    "category": "Deep Work",
    "recommendedTime": "09:00",
    "confidence": 0.85,
    "reasoning": "This task requires sustained concentration and is important but not urgent, making it ideal for deep work.",
    "generatedAt": "2024-01-15T10:30:00Z"
  }
}
```

### Generate Bulk Task Recommendations
```
POST /api/ai-recommendations/generate-bulk
```

**Request Body:**
```json
{
  "taskIds": [123, 124, 125],
  "includeReasoning": true,
  "forceRegenerate": false
}
```

### Get Task Recommendation
```
GET /api/ai-recommendations/task/:taskId
```

### Get User Work Preferences
```
GET /api/ai-recommendations/preferences
```

### Update User Work Preferences
```
PUT /api/ai-recommendations/preferences
```

**Request Body:**
```json
{
  "deepWorkStartTime": "08:00",
  "deepWorkEndTime": "11:00",
  "creativeWorkStartTime": "11:00",
  "creativeWorkEndTime": "14:00",
  "reflectiveWorkStartTime": "14:00",
  "reflectiveWorkEndTime": "17:00",
  "executiveWorkStartTime": "17:00",
  "executiveWorkEndTime": "20:00"
}
```

### Get Tasks with AI Recommendations
```
GET /api/ai-recommendations/tasks?category=Deep Work&hasRecommendation=true&page=1&limit=10
```

## Database Schema Changes

### User Table Additions
```sql
-- Work Duration Preferences (AI Recommendation System)
deep_work_start_time       String   @default("09:00")
deep_work_end_time         String   @default("12:00")
creative_work_start_time   String   @default("12:00")
creative_work_end_time     String   @default("15:00")
reflective_work_start_time String   @default("15:00")
reflective_work_end_time   String   @default("18:00")
executive_work_start_time  String   @default("18:00")
executive_work_end_time    String   @default("21:00")
```

### Task Table Additions
```sql
-- AI Recommendation fields
ai_category         String?
ai_recommended_time String?
ai_confidence       Float?
ai_reasoning        String?
```

## Usage Examples

### 1. Basic Task Creation with AI Recommendation
```typescript
import { taskService } from './services/task.service.js';

const taskData = {
  title: "Write quarterly report",
  description: "Analyze Q4 performance and create comprehensive report",
  duration: 120,
  importance: true,
  urgency: false,
  category: "work",
  priority: "high",
  position: 1
};

const task = await taskService.createTask(taskData, userId);
// AI recommendation is automatically generated and stored in separate table
console.log(task.aiRecommendation?.category); // "DEEP_WORK"
console.log(task.aiRecommendation?.recommendedTime); // "09:00"
```

### 2. Using Decorators
```typescript
import { AIRecommendation, WithAIRecommendation } from './decorators/ai-recommendation.decorators.js';

class TaskController {
  @AIRecommendation({ enabled: true, priority: 1 })
  @WithAIRecommendation()
  async getTasks(userId: number) {
    // Method automatically enhanced with AI recommendations
    return await taskService.getTasksByUser(userId, {});
  }
}
```

### 3. Custom Category Rules
```typescript
import { CategoryRules, WorkCategory } from './decorators/ai-recommendation.decorators.js';

@CategoryRules([
  {
    category: WorkCategory.DEEP_WORK,
    conditions: [
      { field: "importance", operator: "equals", value: true },
      { field: "urgency", operator: "equals", value: false },
      { field: "duration", operator: "greaterThan", value: 60 }
    ],
    weight: 10
  }
])
async categorizeTask(task: Task) {
  // Custom categorization logic
}
```

## Configuration

### Environment Variables
```env
OPENAI_API_KEY=your_openai_api_key_here
```

### Default Work Schedule
- **Deep Work**: 9:00 AM - 12:00 PM
- **Creative Work**: 12:00 PM - 3:00 PM
- **Reflective Work**: 3:00 PM - 6:00 PM
- **Executive Work**: 6:00 PM - 9:00 PM

## AI Prompt Engineering

The system uses comprehensive rulebook-based prompts that consider:
- Task attributes (title, description, duration, importance, urgency, project context)
- User work preferences and schedule
- Historical task patterns
- Eisenhower Matrix classification
- Cognitive science principles and productivity best practices

### Rulebook-Based Classification

The AI prompt includes the complete rulebook with:

1. **Detailed Category Definitions**: Each work mode with specific characteristics
2. **Classification Criteria**: Keywords, duration thresholds, and project context indicators
3. **Eisenhower Matrix Integration**: How urgency/importance maps to work modes
4. **Examples**: Real-world task examples for each category
5. **Priority Guidelines**: How to handle overlapping characteristics

### Sample Prompt Structure
```
You are an AI productivity expert specializing in task categorization based on cognitive work modes. Use the comprehensive rulebook below to classify tasks accurately.

TASK ANALYSIS:
- Title: {title}
- Description: {description}
- Duration: {duration} minutes
- Importance: {importance}
- Urgency: {urgency}
- Project: {projectName}

COMPREHENSIVE CLASSIFICATION RULEBOOK:

1. DEEP WORK MODE:
   Definition: Tasks demanding intense concentration and uninterrupted focus on cognitively demanding activities that produce high-value output.
   
   Characteristics:
   - HIGH COGNITIVE DEMAND: Complex problem-solving, analytical thinking, skill-intensive work
   - UNINTERRUPTED FOCUS NEEDED: Cannot be effectively broken into tiny chunks without losing productivity
   - IMPORTANT/HIGH-VALUE: Usually maps to Important items in Eisenhower Matrix (Quadrant I or II)
   - LONGER DURATION: Typically 1-4 hours of focused effort
   
   Classification Criteria:
   - Duration ≥ 60 minutes AND (Importance = true OR complex technical/analytical nature)
   - Keywords: "design", "develop", "analyze", "strategy", "focus", "implement", "debug", "research"
   - Project contexts: "Software Development", "Thesis Research", "Strategic Planning"

2. CREATIVE WORK MODE:
   [Similar detailed structure for each category...]

EISENHOWER MATRIX INTEGRATION:
- Quadrant I (Urgent + Important): Complex tasks → Deep Work; Creative tasks → Creative Work; Simple execution → Executive Work
- Quadrant II (Important + Not Urgent): Complex/analytical → Deep Work; Creative → Creative Work; Planning/learning → Reflective Work
- Quadrant III (Urgent + Not Important): Usually Executive Work (handle efficiently or delegate)
- Quadrant IV (Not Urgent + Not Important): Executive Work or consider eliminating

CLASSIFICATION PRIORITY:
1. Analyze task's core nature and cognitive demands
2. Consider duration and complexity
3. Evaluate urgency and importance
4. Look at project context and keywords
5. Apply predominant mode when tasks involve multiple modes
```

## Error Handling

The system includes comprehensive error handling:
- Fallback recommendations when AI fails
- Validation of AI recommendations
- Graceful degradation for missing data
- Rate limiting and timeout handling

## Performance Considerations

- Bulk processing for multiple tasks
- Caching of user preferences
- Async processing for AI recommendations
- Database indexing for efficient queries

## Security

- Authentication required for all endpoints
- User data isolation
- API key protection
- Input validation and sanitization

## Monitoring and Analytics

- Recommendation confidence scores
- User preference tracking
- Performance metrics
- Error logging and monitoring

## Rulebook Implementation

The system now implements the comprehensive rulebook for task classification by brain mode, ensuring:

### ✅ **Complete Rulebook Integration**
- **Detailed Category Definitions**: Each work mode with specific characteristics from the rulebook
- **Classification Criteria**: Keywords, duration thresholds, and project context indicators
- **Eisenhower Matrix Integration**: Proper mapping of urgency/importance to work modes
- **Examples and Context**: Real-world task examples for each category
- **Priority Guidelines**: Handling of overlapping characteristics

### ✅ **Enhanced AI Prompts**
- **Comprehensive Rulebook**: Full rulebook included in AI prompts for accurate classification
- **Context-Aware Analysis**: Considers all task fields together (name, description, duration, project, Eisenhower ranking)
- **Fallback Logic**: Rulebook-based fallback when AI is unavailable
- **Confidence Scoring**: AI provides confidence levels for recommendations

### ✅ **Robust Classification Logic**
- **Multi-Factor Analysis**: Duration, importance, urgency, keywords, and project context
- **Predominant Mode Selection**: Chooses most defining characteristic when tasks involve multiple modes
- **Extensible Framework**: Designed to accommodate additional heuristics in the future
- **Validation and Error Handling**: Comprehensive validation of AI recommendations

### ✅ **Test Coverage**
- **Rulebook-Based Test Cases**: Comprehensive test suite demonstrating classification accuracy
- **Fallback Testing**: Validation of rulebook-based fallback logic
- **Edge Case Handling**: Tests for overlapping characteristics and ambiguous tasks

## Database Schema

The system uses a clean, normalized database structure:

### User Table
- `deep_work_start_time`: Start time for deep work (default: "09:00")
- `deep_work_end_time`: End time for deep work (default: "12:00")
- `creative_work_start_time`: Start time for creative work (default: "12:00")
- `creative_work_end_time`: End time for creative work (default: "15:00")
- `reflective_work_start_time`: Start time for reflective work (default: "15:00")
- `reflective_work_end_time`: End time for reflective work (default: "18:00")
- `executive_work_start_time`: Start time for executive work (default: "18:00")
- `executive_work_end_time`: End time for executive work (default: "21:00")

### Task Table
- Standard task fields (title, description, duration, etc.)
- Eisenhower Matrix fields (importance, urgency)
- **No AI fields** - kept clean and focused on core task data

### AIRecommendation Table (New)
- `id`: Primary key
- `taskId`: Foreign key to Task table (unique)
- `category`: AI-determined work category (DEEP_WORK, CREATIVE_WORK, etc.)
- `recommendedTime`: AI-recommended time slot (HH:MM format)
- `confidence`: Confidence score (0.0-1.0)
- `reasoning`: Optional AI reasoning for the recommendation
- `createdAt`: When the recommendation was created
- `updatedAt`: When the recommendation was last updated

### Benefits of Separate Table
- **Clean separation**: Task data and AI recommendations are separate
- **Flexibility**: Multiple recommendations per task (if needed in future)
- **Performance**: Better query performance for task operations
- **Maintainability**: Easier to modify AI logic without affecting core task schema
- **Scalability**: AI recommendations can be stored/archived independently

## API Endpoints

### 1. Generate AI Recommendation for Single Task

**Endpoint:** `POST /api/ai-recommendations/tasks/:taskId/recommendation`

**Description:** Generate AI recommendation for a specific task

**Request:**
```http
POST /api/ai-recommendations/tasks/123/recommendation
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "includeReasoning": true
}
```

**Request Body:**
```typescript
{
  includeReasoning?: boolean; // Optional, defaults to true
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "id": 1,
    "taskId": 123,
    "category": "Deep Work",
    "recommendedTime": "09:00",
    "confidence": 0.85,
    "reasoning": "This task requires intense focus and analytical thinking, making it ideal for Deep Work mode during peak cognitive hours.",
    "createdAt": "2024-01-15T09:00:00Z",
    "updatedAt": "2024-01-15T09:00:00Z"
  }
}
```

**Error Response:**
```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": "Task not found"
}
```

### 2. Get AI Recommendation for Task

**Endpoint:** `GET /api/ai-recommendations/tasks/:taskId/recommendation`

**Description:** Retrieve existing AI recommendation for a task

**Request:**
```http
GET /api/ai-recommendations/tasks/123/recommendation?includeReasoning=true
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `includeReasoning` (optional): Include reasoning in response (default: true)

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "id": 1,
    "taskId": 123,
    "category": "Creative Work",
    "recommendedTime": "14:00",
    "confidence": 0.92,
    "reasoning": "Creative brainstorming task benefits from afternoon energy when creative thinking peaks.",
    "createdAt": "2024-01-15T08:30:00Z",
    "updatedAt": "2024-01-15T08:30:00Z"
  }
}
```

### 3. Bulk Generate AI Recommendations

**Endpoint:** `POST /api/ai-recommendations/bulk`

**Description:** Generate AI recommendations for multiple tasks

**Request:**
```http
POST /api/ai-recommendations/bulk
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "taskIds": [123, 124, 125],
  "includeReasoning": true
}
```

**Request Body:**
```typescript
{
  taskIds: number[];
  includeReasoning?: boolean;
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "recommendations": [
      {
        "taskId": 123,
        "recommendation": {
          "id": 1,
          "taskId": 123,
          "category": "Deep Work",
          "recommendedTime": "09:00",
          "confidence": 0.85,
          "reasoning": "Complex analytical work requiring focus",
          "createdAt": "2024-01-15T09:00:00Z",
          "updatedAt": "2024-01-15T09:00:00Z"
        }
      },
      {
        "taskId": 124,
        "recommendation": {
          "id": 2,
          "taskId": 124,
          "category": "Executive Work",
          "recommendedTime": "16:00",
          "confidence": 0.78,
          "reasoning": "Quick decision-making task suitable for executive mode",
          "createdAt": "2024-01-15T09:00:00Z",
          "updatedAt": "2024-01-15T09:00:00Z"
        }
      }
    ],
    "errors": [
      {
        "taskId": 125,
        "error": "Task not found or access denied"
      }
    ]
  }
}
```

### 4. Get Tasks with AI Recommendations

**Endpoint:** `GET /api/ai-recommendations/tasks`

**Description:** Get all tasks with their AI recommendations

**Request:**
```http
GET /api/ai-recommendations/tasks?category=Deep Work&includeReasoning=true&page=1&limit=10
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `category` (optional): Filter by AI recommendation category
- `includeReasoning` (optional): Include reasoning in response (default: true)
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Items per page (default: 10)

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "tasks": [
      {
        "id": 123,
        "title": "Complete project report",
        "description": "Write quarterly report",
        "category": "work",
        "duration": 120,
        "priority": "high",
        "position": 1,
        "createdAt": "2024-01-15T08:00:00Z",
        "completed": false,
        "importance": true,
        "urgency": true,
        "dueDate": "2024-01-15T17:00:00Z",
        "userId": 1,
        "projectId": 5,
        "objectiveId": 10,
        "okrId": 15,
        "planId": 20,
        "aiRecommendation": {
          "id": 1,
          "taskId": 123,
          "category": "Deep Work",
          "recommendedTime": "09:00",
          "confidence": 0.85,
          "reasoning": "Complex analytical work requiring focus",
          "createdAt": "2024-01-15T09:00:00Z",
          "updatedAt": "2024-01-15T09:00:00Z"
        }
      }
    ],
    "total": 25,
    "page": 1,
    "limit": 10,
    "totalPages": 3
  }
}
```

### 5. Get Today's Tasks with AI Recommendations

**Endpoint:** `GET /api/ai-recommendations/today-tasks`

**Description:** Get today's tasks with AI recommendations, ranked by priority

**Request:**
```http
GET /api/ai-recommendations/today-tasks?timezone=America/New_York
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `timezone` (optional): User's timezone for filtering (default: UTC)

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "tasks": [
      {
        "id": 123,
        "title": "Urgent client meeting",
        "description": "Prepare presentation for client",
        "duration": 60,
        "priority": "high",
        "importance": true,
        "urgency": true,
        "dueDate": "2024-01-15T14:00:00Z",
        "aiRecommendation": {
          "id": 1,
          "taskId": 123,
          "category": "Executive Work",
          "recommendedTime": "13:00",
          "confidence": 0.92,
          "reasoning": "Urgent meeting preparation requires quick decision-making",
          "createdAt": "2024-01-15T08:00:00Z",
          "updatedAt": "2024-01-15T08:00:00Z"
        },
        "aiRecommendationStatus": "available",
        "rank": 1
      },
      {
        "id": 124,
        "title": "Code review",
        "description": "Review team's pull requests",
        "duration": 90,
        "priority": "medium",
        "importance": true,
        "urgency": false,
        "dueDate": "2024-01-15T18:00:00Z",
        "aiRecommendation": null,
        "aiRecommendationStatus": "generating",
        "rank": 2
      }
    ],
    "total": 5,
    "generatedRecommendations": 2,
    "failedRecommendations": 0
  }
}
```

### 6. Get Task Recommended for RIGHT NOW

**Endpoint:** `GET /api/ai-recommendations/now`

**Description:** Get task that user should work on RIGHT NOW based on current time and AI recommendations

**Request:**
```http
GET /api/ai-recommendations/now?timezone=America/Los_Angeles
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `timezone` (required): User's timezone for current time calculation (e.g., "America/Los_Angeles", "Europe/London")

**Response (Perfect Timing - Current Task):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "task": {
      "id": 123,
      "title": "Code review for authentication",
      "description": "Review team's pull requests for security",
      "duration": 90,
      "priority": "high",
      "importance": true,
      "urgency": true,
      "dueDate": "2024-01-15T18:00:00Z",
      "aiRecommendation": {
        "id": 1,
        "taskId": 123,
        "category": "Deep Work",
        "recommendedTime": "09:15",
        "confidence": 0.92,
        "reasoning": "Complex analytical work requiring focus",
        "createdAt": "2024-01-15T08:00:00Z",
        "updatedAt": "2024-01-15T08:00:00Z"
      },
      "aiRecommendationStatus": "available",
      "rank": 1
    },
    "nextRecommendation": null,
    "currentTime": "09:15:32",
    "reasoning": "Perfect timing! This task is recommended for 09:15, and it's deep work that aligns with your current focus window."
  }
}
```

**Response (Next Recommendation):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "task": null,
    "nextRecommendation": {
      "id": 124,
      "title": "Design user interface",
      "description": "Create wireframes for new feature",
      "duration": 120,
      "priority": "medium",
      "importance": true,
      "urgency": false,
      "dueDate": "2024-01-15T20:00:00Z",
      "aiRecommendation": {
        "id": 2,
        "taskId": 124,
        "category": "Creative Work",
        "recommendedTime": "14:00",
        "confidence": 0.88,
        "reasoning": "Creative design work benefits from afternoon energy",
        "createdAt": "2024-01-15T08:30:00Z",
        "updatedAt": "2024-01-15T08:30:00Z"
      },
      "aiRecommendationStatus": "available",
      "rank": 2
    },
    "currentTime": "10:30:45",
    "reasoning": "No tasks recommended for right now (10:30). Next recommendation is \"Design user interface\" at 14:00 (in 210 minutes)."
  }
}
```

**Response (No Tasks Today):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "task": null,
    "nextRecommendation": null,
    "currentTime": "15:30:20",
    "reasoning": "No tasks found for today"
  }
}
```

### 7. Get User Work Preferences

**Endpoint:** `GET /api/ai-recommendations/user/preferences`

**Description:** Get user's work time preferences

**Request:**
```http
GET /api/ai-recommendations/user/preferences
Authorization: Bearer <jwt_token>
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "deepWorkStartTime": "09:00",
    "deepWorkEndTime": "12:00",
    "creativeWorkStartTime": "12:00",
    "creativeWorkEndTime": "15:00",
    "reflectiveWorkStartTime": "15:00",
    "reflectiveWorkEndTime": "18:00",
    "executiveWorkStartTime": "18:00",
    "executiveWorkEndTime": "21:00",
    "updatedAt": "2024-01-15T08:00:00Z"
  }
}
```

### 7. Update User Work Preferences

**Endpoint:** `PUT /api/ai-recommendations/user/preferences`

**Description:** Update user's work time preferences

**Request:**
```http
PUT /api/ai-recommendations/user/preferences
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "deepWorkStartTime": "08:00",
  "deepWorkEndTime": "11:00",
  "creativeWorkStartTime": "11:00",
  "creativeWorkEndTime": "14:00",
  "reflectiveWorkStartTime": "14:00",
  "reflectiveWorkEndTime": "17:00",
  "executiveWorkStartTime": "17:00",
  "executiveWorkEndTime": "20:00"
}
```

**Request Body:**
```typescript
{
  deepWorkStartTime?: string;
  deepWorkEndTime?: string;
  creativeWorkStartTime?: string;
  creativeWorkEndTime?: string;
  reflectiveWorkStartTime?: string;
  reflectiveWorkEndTime?: string;
  executiveWorkStartTime?: string;
  executiveWorkEndTime?: string;
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "deepWorkStartTime": "08:00",
    "deepWorkEndTime": "11:00",
    "creativeWorkStartTime": "11:00",
    "creativeWorkEndTime": "14:00",
    "reflectiveWorkStartTime": "14:00",
    "reflectiveWorkEndTime": "17:00",
    "executiveWorkStartTime": "17:00",
    "executiveWorkEndTime": "20:00",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

## Error Responses

### Common Error Codes

**401 Unauthorized:**
```json
{
  "error": "User not authenticated"
}
```

**403 Forbidden:**
```json
{
  "error": "Access denied to this resource"
}
```

**404 Not Found:**
```json
{
  "error": "Task not found"
}
```

**422 Unprocessable Entity:**
```json
{
  "error": "Invalid request data",
  "details": {
    "field": "recommendedTime",
    "message": "Time must be in HH:MM format"
  }
}
```

**500 Internal Server Error:**
```json
{
  "error": "Failed to generate AI recommendation",
  "details": "OpenAI API error: Rate limit exceeded"
}
```

## Authentication

All endpoints require JWT authentication. Include the token in the Authorization header:

```http
Authorization: Bearer <your_jwt_token>
```

## Rate Limiting

- **Individual recommendations**: 10 requests per minute
- **Bulk recommendations**: 5 requests per minute
- **Today's tasks**: 20 requests per minute

## Future Enhancements

1. **Machine Learning Integration**
   - User behavior learning
   - Personalized recommendations
   - Continuous improvement based on user feedback

2. **Advanced Scheduling**
   - Calendar integration
   - Conflict detection
   - Dynamic rescheduling based on energy levels

3. **Team Collaboration**
   - Shared work preferences
   - Team scheduling optimization
   - Collaborative task planning

4. **Analytics Dashboard**
   - Productivity insights
   - Time tracking
   - Performance metrics
   - Classification accuracy tracking

## Troubleshooting

### Common Issues

1. **AI Recommendation Generation Fails**
   - Check OpenAI API key
   - Verify network connectivity
   - Review task data completeness

2. **Database Migration Issues**
   - Ensure Prisma schema is updated
   - Run database migrations
   - Check column permissions

3. **Decorator Not Working**
   - Verify reflect-metadata import
   - Check decorator syntax
   - Ensure proper TypeScript configuration

### Debug Mode
Enable debug logging by setting:
```env
DEBUG=ai-recommendation:*
```

## Contributing

When contributing to the AI recommendation system:
1. Follow the existing code structure
2. Add comprehensive tests
3. Update documentation
4. Consider performance implications
5. Maintain backward compatibility
