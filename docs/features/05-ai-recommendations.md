# AI Recommendations

## Overview

The AI Recommendations system is a sophisticated AI-powered task classification and scheduling engine that uses OpenAI's GPT-4o-mini to analyze tasks and provide intelligent recommendations for categorization, prioritization, and optimal scheduling based on cognitive work modes and user preferences.

## Technical Architecture

### Core Components

#### 1. AI Recommendation Service

The service uses LangChain with OpenAI to generate structured recommendations:

```typescript
export class AIRecommendationService {
  private llm: ChatOpenAI;
  private parser: StructuredOutputParser;
  private systemPrompt: string;

  constructor() {
    this.parser = StructuredOutputParser.fromZodSchema(TaskRecommendationSchema);
    this.systemPrompt = this.createSystemPrompt(); // Comprehensive rulebook
    
    this.llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.3, // Lower temperature for more deterministic outputs
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
  }
}
```

#### 2. Recommendation Schema

The system uses structured output parsing with Zod schemas:

```typescript
const EnhancedTaskRecommendationSchema = z.object({
  category: z.nativeEnum(WorkCategory),
  signalType: z.enum(["Core-Signal", "High-Signal", "Strategic-Signal", "Neutral", "Noise"]),
  importance: z.boolean(),
  urgency: z.boolean(),
  importanceFlag: z.boolean().nullable(),
  urgencyFlag: z.boolean().nullable(),
  priority: z.enum(["High", "Medium", "Low", "Noise"]),
  recommendedTime: z.string(), // HH:MM format
  recommendedDuration: z.number().min(25).max(90),
  breakRecommendation: z.string().nullable(),
  loadWarning: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
```

### Priority Evaluation System

The system evaluates tasks in a strict priority order:

#### 1. Signal Layer (Tier 0 - Highest Priority)

The Signal Layer is determined by user-controlled toggles:

```typescript
determineSignalType(
  isHighLeverage: boolean,
  advancesKeyResults: boolean,
  importance: boolean,
  urgency: boolean
): SignalType {
  // Core-Signal: HLA=true + AKR=true (HIGHEST PRIORITY)
  if (isHighLeverage && advancesKeyResults) {
    return "Core-Signal";
  }
  
  // High-Signal: HLA=true only
  if (isHighLeverage) {
    return "High-Signal";
  }
  
  // Strategic-Signal: AKR=true only
  if (advancesKeyResults) {
    return "Strategic-Signal";
  }
  
  // Noise: All toggles OFF
  if (!isHighLeverage && !advancesKeyResults && !importance && !urgency) {
    return "Noise";
  }
  
  // Neutral: Default
  return "Neutral";
}
```

**Signal Type Classifications:**
- **Core-Signal**: Must be scheduled in first/second peak block, no batching, strict load protection, mandatory recovery block, 45-90 min duration
- **High-Signal**: Very high priority, scheduled in peak cognitive windows, protected from batching, 45-90 min duration
- **Strategic-Signal**: High priority, aligned with OKRs, never treated as Noise, 45-90 min duration
- **Neutral**: Default classification, importance and urgency then evaluated
- **Noise**: User confirmation required, batching recommended, low-energy scheduling

#### 2. FocusZone Priority Layer (Eisenhower Matrix)

User-controlled inputs:
- `Important = true/false`
- `Urgent = true/false`

**Rules:**
- Fully respect Important/Urgent booleans - NEVER override user settings
- If conflict detected between Signal Layer and FocusZone → flag for user confirmation
- FocusZone determines HOW task is handled, not whether it's meaningful

**Eisenhower Matrix Integration:**
- Quadrant I (Urgent + Important): Complex → Deep Work; Creative → Creative Work; Simple → Executive Work
- Quadrant II (Important + Not Urgent): Complex/analytical → Deep Work; Creative → Creative Work; Planning/learning → Reflective Work
- Quadrant III (Urgent + Not Important): Usually Executive Work
- Quadrant IV (Not Urgent + Not Important): Executive Work or consider eliminating

#### 3. Cognitive Mode Classification

Tasks are classified into four cognitive work modes:

**1. DEEP WORK MODE:**
- **Definition**: Analytical, technical, high-load tasks requiring intense concentration
- **Characteristics**: High cognitive demand, uninterrupted focus needed
- **Examples**: Coding algorithms, writing reports, strategic analysis, debugging
- **Classification Criteria**: Duration ≥ 60 minutes AND (Importance = true OR complex technical nature)
- **Keywords**: "design", "develop", "analyze", "strategy", "focus", "implement", "debug", "research"

**2. CREATIVE WORK MODE:**
- **Definition**: Ideation, conceptual work involving imagination and original content creation
- **Characteristics**: Original creation, ideation and divergent thinking
- **Examples**: Designing visuals, writing blog posts, creating art, brainstorming
- **Keywords**: "brainstorm", "invent", "imagine", "conceptualize", "draft creative copy", "design", "create"

**3. REFLECTIVE WORK MODE:**
- **Definition**: Reviewing, learning, strategic thinking tasks focused on insight and analysis
- **Characteristics**: Strategic or analytical thinking, insight and learning oriented
- **Examples**: Reading research, mapping strategy, risk analysis, learning frameworks
- **Keywords**: "plan", "review", "learn", "research", "analyze options", "consider", "strategize", "reflect"

**4. EXECUTIVE WORK MODE:**
- **Definition**: Admin, coordination, logistics tasks involving rapid action and operations
- **Characteristics**: Reactive and fast-paced, short, fragmented tasks
- **Examples**: Checking email, returning calls, status updates, scheduling, meetings
- **Classification Criteria**: Duration ≤ 30 minutes OR urgent nature
- **Keywords**: "reply", "call", "meeting", "update", "schedule", "approve", "coordinate"

#### 4. Scheduling Engine

**Focus Windows:**
- All sessions must fall within 25-90 minutes (depending on cognitive mode)
- Signal tasks (Core-Signal, High-Signal, Strategic-Signal) → 45-90 minutes
- Deep Work → 60-90 minutes typically
- Creative Work → 45-90 minutes
- Reflective Work → 45-75 minutes
- Executive Work → 25-45 minutes

**Break Recommendations:**
```typescript
calculateBreakRecommendation(duration: number, consecutiveSessions: number): string | null {
  // 3×90 min sessions → 1-hour recovery
  if (consecutiveSessions >= 3 && duration >= 90) {
    return "Take a 1-hour recovery break to prevent cognitive overload";
  }
  
  // 2×90 min sessions → 15-30 min break
  if (consecutiveSessions >= 2 && duration >= 90) {
    return "Take a 15-30 minute break to maintain focus";
  }
  
  // ≥45 min session → 5-10 min break
  if (duration >= 45) {
    return "Take a 5-10 minute break after this session";
  }
  
  return null;
}
```

**Load Detection:**
```typescript
async detectLoadWarning(userId: number, taskCategory: string): Promise<string | null> {
  // Get user's recent focus sessions from last 24 hours
  const recentSessions = await prisma.focusSession.findMany({
    where: {
      userId,
      createdAt: { gte: oneDayAgo },
    },
  });

  // Detect Deep Work clusters
  const deepWorkSessions = recentSessions.filter(s => 
    s.intention?.category === "deepWork"
  );

  if (deepWorkSessions.length >= 3) {
    return "You have performed multiple high-load sessions. Reduce intensity to avoid fatigue.";
  }

  // Detect repeated high-load days
  // ... additional load detection logic

  return null;
}
```

#### 5. User Work Preferences

The system uses user's preferred working hours for each cognitive mode:

```typescript
interface UserWorkPreferences {
  deepWorkStartTime: string;      // Default: "09:00"
  deepWorkEndTime: string;        // Default: "12:00"
  creativeWorkStartTime: string;   // Default: "12:00"
  creativeWorkEndTime: string;     // Default: "15:00"
  reflectiveWorkStartTime: string; // Default: "15:00"
  reflectiveWorkEndTime: string;   // Default: "18:00"
  executiveWorkStartTime: string;  // Default: "18:00"
  executiveWorkEndTime: string;    // Default: "21:00"
}
```

**Usage:**
- Recommended time slots are calculated based on these preferences
- AI suggests optimal times within user's preferred windows
- Respects user's natural work rhythms

### System Prompt (Rulebook)

The system uses a comprehensive rulebook prompt that includes:

1. **Priority Order** (exact evaluation sequence)
2. **Signal Layer Rules** (HLA/AKR classification)
3. **FocusZone Rules** (Eisenhower Matrix)
4. **Cognitive Mode Classification** (detailed criteria)
5. **Disambiguation Rules** (for ambiguous tasks)
6. **Scheduling Rules** (windows, breaks, load)
7. **Noise Rules** (handling low-priority tasks)
8. **Output Format** (structured schema)

### Recommendation Generation Process

```typescript
async generateTaskRecommendation(
  taskAnalysis: TaskAnalysis,
  userPreferences: UserWorkPreferences,
  userId: number
): Promise<EnhancedTaskRecommendation> {
  // 1. Determine Signal Type
  const signalType = this.determineSignalType(
    taskAnalysis.isHighLeverage || false,
    taskAnalysis.advancesKeyResults || false,
    taskAnalysis.importance,
    taskAnalysis.urgency
  );

  // 2. Calculate break recommendation
  const breakRecommendation = this.calculateBreakRecommendation(
    taskAnalysis.duration,
    consecutiveSessions
  );

  // 3. Detect load warning
  const loadWarning = await this.detectLoadWarning(
    userId,
    taskAnalysis.category
  );

  // 4. Build prompt with task context
  const prompt = this.buildRecommendationPrompt(
    taskAnalysis,
    userPreferences,
    signalType
  );

  // 5. Call LLM with structured output parser
  const response = await this.llm.invoke(prompt);
  const parsed = await this.parser.parse(response.content);

  // 6. Return enhanced recommendation
  return {
    ...parsed,
    signalType,
    recommendedDuration: calculateOptimalDuration(signalType, parsed.category),
    breakRecommendation,
    loadWarning,
  };
}
```

### Confidence Scoring

The system assigns confidence scores:

- **0.90-1.00**: High certainty → Proceed with recommendation
- **0.70-0.89**: Acceptable → Stable classification, proceed
- **0.50-0.69**: Confirm → Ask user to confirm classification
- **<0.50**: Clarify → Request clarification from user

### Database Schema

```prisma
model AIRecommendation {
  id              Int     @id @default(autoincrement())
  taskId          Int     @unique
  category        String  // DEEP_WORK, CREATIVE_WORK, etc.
  recommendedTime String  // HH:MM format
  confidence      Float   // 0.0 to 1.0
  reasoning       String?
  
  // Enhanced Signal Layer fields
  signalType          String? // Core-Signal | High-Signal | etc.
  recommendedDuration Int?    // 25-90 minutes
  breakRecommendation String?
  loadWarning         String?
  importanceFlag      Boolean? // Conflict detection
  urgencyFlag         Boolean? // Conflict detection
  
  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
}
```

### API Endpoints

- `POST /api/ai-recommendations/generate` - Generate recommendation for task
- `GET /api/ai-recommendations/task/:taskId` - Get recommendation for task
- `POST /api/ai-recommendations/batch` - Generate recommendations for multiple tasks

### Important Code Snippets

**Signal Type Priority:**
```typescript
// Signal Layer ALWAYS outranks all other priority factors
if (isHighLeverage || advancesKeyResults) {
  // Must be prioritized accordingly regardless of other factors
  return "High-Signal" or "Strategic-Signal" or "Core-Signal";
}
```

**Optimal Time Calculation:**
```typescript
function calculateOptimalTime(
  category: WorkCategory,
  userPreferences: UserWorkPreferences
): string {
  const now = new Date();
  const currentHour = now.getHours();
  
  switch (category) {
    case WorkCategory.DEEP_WORK:
      // Suggest time within deep work window
      return suggestTimeInWindow(
        userPreferences.deepWorkStartTime,
        userPreferences.deepWorkEndTime
      );
    // ... other categories
  }
}
```

### Error Handling

- **400 Bad Request**: Invalid task data
- **500 Internal Server Error**: OpenAI API errors, parsing errors
- **503 Service Unavailable**: OpenAI API rate limits

### Testing Considerations

1. Test Signal Layer prioritization
2. Test cognitive mode classification accuracy
3. Test break recommendation logic
4. Test load warning detection
5. Test user preference integration
6. Test confidence scoring
7. Test structured output parsing

