# Analytics

## Overview

The Analytics system provides insights into user productivity, task completion rates, focus session patterns, and overall performance metrics.

## Technical Architecture

### Key Metrics

1. **Task Analytics**
   - Task completion rate
   - Tasks by category
   - Tasks by priority
   - Average task duration

2. **Focus Session Analytics**
   - Total focus time
   - Sessions by type
   - Average session duration
   - Completion rate

3. **Productivity Patterns**
   - Peak productivity hours
   - Day of week patterns
   - Energy patterns
   - Context switching metrics

4. **Project Analytics**
   - Project completion rate
   - Objectives achieved
   - OKR progress
   - Time to completion

### API Endpoints

- `GET /api/analytics/overview` - Get analytics overview
- `GET /api/analytics/tasks` - Get task analytics
- `GET /api/analytics/focus-sessions` - Get focus session analytics
- `GET /api/analytics/productivity` - Get productivity patterns
- `GET /api/analytics/projects` - Get project analytics
- `GET /api/analytics/time-range` - Get analytics for date range

### Important Code Snippets

**Calculate Task Completion Rate:**
```typescript
const totalTasks = await prisma.task.count({ where: { userId } });
const completedTasks = await prisma.task.count({
  where: { userId, completed: true },
});
const completionRate = (completedTasks / totalTasks) * 100;
```

**Get Productivity Patterns:**
```typescript
const patterns = await prisma.userProductivityPatterns.findUnique({
  where: { userId },
});

return {
  peakHours: patterns.peakProductivityHours,
  dayOfWeekPatterns: patterns.dayOfWeekPatterns,
  hourlyPatterns: patterns.hourlyPatterns,
  energyPattern: patterns.energyPattern,
};
```

