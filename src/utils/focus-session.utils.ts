/**
 * Utility functions for Focus Session timer calculations
 */

/**
 * Calculate elapsed time in seconds for a session
 * Takes into account paused time
 */
export function calculateElapsedTime(
  startedAt: Date,
  pausedAt: Date | null,
  resumedAt: Date | null
): number {
  const now = new Date();
  
  // If session is paused, calculate time until pause
  if (pausedAt && !resumedAt) {
    const elapsed = Math.floor((pausedAt.getTime() - startedAt.getTime()) / 1000);
    return Math.max(0, elapsed); // Ensure non-negative
  }
  
  // If session was paused and resumed, subtract paused duration
  if (pausedAt && resumedAt) {
    // Ensure timestamps are valid and in correct order
    if (pausedAt.getTime() < startedAt.getTime() || resumedAt.getTime() < pausedAt.getTime()) {
      // Invalid timestamp order, fall back to simple calculation
      const elapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
      return Math.max(0, elapsed);
    }
    
    const pausedDuration = Math.floor((resumedAt.getTime() - pausedAt.getTime()) / 1000);
    const totalElapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
    const elapsed = totalElapsed - pausedDuration;
    return Math.max(0, elapsed); // Ensure non-negative
  }
  
  // Normal running session
  const elapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
  return Math.max(0, elapsed); // Ensure non-negative
}

/**
 * Calculate remaining time in seconds for a session
 * Takes into account paused time and scheduled duration
 */
export function calculateRemainingTime(
  startedAt: Date,
  scheduledDuration: number, // in seconds
  pausedAt: Date | null,
  resumedAt: Date | null
): number {
  const elapsed = calculateElapsedTime(startedAt, pausedAt, resumedAt);
  return Math.max(0, scheduledDuration - elapsed);
}

/**
 * Check if a session has ended (remaining time <= 0)
 */
export function isSessionEnded(
  startedAt: Date,
  scheduledDuration: number,
  pausedAt: Date | null,
  resumedAt: Date | null
): boolean {
  return calculateRemainingTime(startedAt, scheduledDuration, pausedAt, resumedAt) <= 0;
}

/**
 * Calculate elapsed time for current task
 * Tasks run sequentially, so we need to subtract completed task durations
 */
export function calculateCurrentTaskElapsed(
  totalElapsed: number,
  completedTasks: Array<{ duration: number }>,
  currentTaskIndex: number
): number {
  // Sum durations of completed tasks before current task
  const completedDuration = completedTasks
    .slice(0, currentTaskIndex)
    .reduce((sum, task) => sum + task.duration * 60, 0); // Convert minutes to seconds
  
  // Elapsed time for current task = total elapsed - completed tasks duration
  return Math.max(0, totalElapsed - completedDuration);
}

/**
 * Calculate remaining time for current task
 */
export function calculateCurrentTaskRemaining(
  currentTaskDuration: number, // in minutes
  currentTaskElapsed: number // in seconds
): number {
  const taskDurationSeconds = currentTaskDuration * 60;
  return Math.max(0, taskDurationSeconds - currentTaskElapsed);
}

/**
 * Get current task index based on elapsed time and task durations
 */
export function getCurrentTaskIndex(
  totalElapsed: number, // in seconds
  tasks: Array<{ duration: number; completed?: boolean }>
): number {
  let cumulativeDuration = 0;
  
  for (let i = 0; i < tasks.length; i++) {
    const taskDurationSeconds = tasks[i].duration * 60;
    cumulativeDuration += taskDurationSeconds;
    
    if (totalElapsed < cumulativeDuration) {
      return i;
    }
  }
  
  // If elapsed time exceeds all tasks, return last task index
  return Math.max(0, tasks.length - 1);
}

/**
 * Calculate total duration from tasks of a specific category
 */
export function calculateTotalDurationFromTasks(
  tasks: Array<{ duration: number; category: string }>,
  category?: string
): number {
  const filteredTasks = category
    ? tasks.filter(task => task.category === category)
    : tasks;
  
  return filteredTasks.reduce((sum, task) => sum + task.duration, 0);
}
