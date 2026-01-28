# Cognitive Load Management

## Overview

The Cognitive Load Management system tracks and manages user cognitive workload to prevent burnout and optimize productivity. It monitors workload scores, capacity utilization, and provides recommendations.

## Technical Architecture

### Cognitive Load Meter Model

```prisma
model CognitiveLoadMeter {
  id                              Int      @id @default(autoincrement())
  userId                          Int      @unique
  currentWorkloadScore            Int      @default(50) // 0-100
  cognitiveCapacity               Int      @default(100) // Max capacity
  sustainableCapacity             Int      @default(75) // Sustainable level
  burnoutRiskScore                Int      @default(0) // 0-100
  burnoutRiskLevel                String   @default("NONE") // NONE, LOW, MEDIUM, HIGH, CRITICAL
  recoveryRate                    Int      @default(5) // Recovery per hour
  workloadHistory                 Json     @default("[]") // Historical data
  capacityUtilization             Json     @default("[]") // Utilization over time
  recommendedTaskLimit            Int?
  recommendedFocusSessionDuration Int?
  recommendedBreakFrequency       Int?
  currentStatus                   String   @default("OPTIMAL") // OPTIMAL, MODERATE, HIGH, CRITICAL
}
```

### Key Features

#### 1. Workload Calculation

```typescript
async updateCognitiveLoad(userId: number): Promise<void> {
  // Get recent focus sessions
  const recentSessions = await prisma.focusSession.findMany({
    where: {
      userId,
      createdAt: { gte: oneDayAgo },
    },
  });

  // Calculate workload based on:
  // - Number of sessions
  // - Session duration
  // - Session type (Deep Work = higher load)
  // - Task complexity
  const workloadScore = calculateWorkloadScore(recentSessions);

  // Calculate burnout risk
  const burnoutRisk = calculateBurnoutRisk(workloadScore, recentSessions);

  // Update cognitive load meter
  await prisma.cognitiveLoadMeter.upsert({
    where: { userId },
    update: {
      currentWorkloadScore: workloadScore,
      burnoutRiskScore: burnoutRisk.score,
      burnoutRiskLevel: burnoutRisk.level,
      currentStatus: determineStatus(workloadScore),
      workloadHistory: { push: { date: new Date(), score: workloadScore } },
    },
    create: {
      userId,
      currentWorkloadScore: workloadScore,
      burnoutRiskScore: burnoutRisk.score,
      burnoutRiskLevel: burnoutRisk.level,
    },
  });
}
```

#### 2. Recommendations

The system provides recommendations based on cognitive load:

- **Task Limit**: Maximum tasks recommended per day
- **Focus Session Duration**: Optimal session length
- **Break Frequency**: Recommended break intervals
- **Recovery Time**: Time needed to recover

#### 3. Status Levels

- **OPTIMAL**: Workload is sustainable
- **MODERATE**: Slightly elevated, monitor
- **HIGH**: Reduce intensity, take breaks
- **CRITICAL**: Immediate rest required

### API Endpoints

- `GET /api/cognitive-load` - Get cognitive load status
- `POST /api/cognitive-load/update` - Update cognitive load
- `GET /api/cognitive-load/recommendations` - Get recommendations
- `GET /api/cognitive-load/history` - Get workload history

### Important Code Snippets

**Calculate Workload Score:**
```typescript
function calculateWorkloadScore(sessions: FocusSession[]): number {
  let score = 0;
  
  sessions.forEach(session => {
    const baseLoad = session.sessionType === "deepWork" ? 20 : 10;
    const durationMultiplier = session.duration / 3600; // hours
    score += baseLoad * durationMultiplier;
  });
  
  return Math.min(100, score);
}
```

**Determine Status:**
```typescript
function determineStatus(workloadScore: number): string {
  if (workloadScore < 50) return "OPTIMAL";
  if (workloadScore < 70) return "MODERATE";
  if (workloadScore < 90) return "HIGH";
  return "CRITICAL";
}
```

