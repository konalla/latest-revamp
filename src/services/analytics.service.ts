import prisma from "../config/prisma.js";

export class AnalyticsService {
  /**
   * Get productivity analytics for a user within a specified timeframe
   * If days is undefined, calculates for all time
   */
  async getProductivityAnalytics(userId: number, days?: number): Promise<any> {
    try {
      if (days !== undefined) {
        console.log(`Getting productivity analytics for user ${userId} with ${days} days timeframe`);
      } else {
        console.log(`Getting productivity analytics for user ${userId} for all time`);
      }
      
      // Get tasks for the user
      const allTasks = await prisma.task.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });
      console.log(`Found ${allTasks.length} total tasks for user ${userId}`);
      
      // Get completed tasks
      const completedTasks = allTasks.filter(task => task.completed);
      console.log(`Found ${completedTasks.length} completed tasks for user ${userId}`);
      
      // If no tasks, return default values to prevent analytics errors
      if (allTasks.length === 0) {
        console.log(`No tasks found for user ${userId}, returning default productivity analytics`);
        return this.getDefaultProductivityAnalytics();
      }
      
      // Filter tasks by date range only if days is provided
      let filteredTasks = allTasks;
      let filteredCompletedTasks = completedTasks;
      
      if (days !== undefined) {
        // Calculate date range
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        console.log(`Using date range from ${startDate.toISOString()} to now`);
        
        // Filter tasks created within the time range
        filteredTasks = allTasks.filter(task => {
          try {
            const taskDate = new Date(task.createdAt);
            return taskDate >= startDate;
          } catch (error) {
            console.error('Error parsing task date, skipping task:', error);
            return false;
          }
        });
        console.log(`Filtered to ${filteredTasks.length} tasks within the timeframe`);
        
        // Filter completed tasks within the time range
        filteredCompletedTasks = completedTasks.filter(task => {
          try {
            const taskDate = new Date(task.createdAt);
            return taskDate >= startDate;
          } catch (error) {
            console.error('Error parsing completed task date, skipping task:', error);
            return false;
          }
        });
        console.log(`Filtered to ${filteredCompletedTasks.length} completed tasks within the timeframe`);
      } else {
        console.log(`No date filter applied - calculating for all time`);
      }
      
      // Calculate task completion rate
      const totalTasksCount = filteredTasks.length;
      const tasksCompletedCount = filteredCompletedTasks.length;
      const taskCompletionRate = totalTasksCount > 0 ? tasksCompletedCount / totalTasksCount : 0;
      console.log(`Task completion rate: ${taskCompletionRate * 100}%`);
      
      // Calculate average task duration (in minutes)
      let averageTaskDuration = 0;
      if (filteredCompletedTasks.length > 0) {
        const totalDuration = filteredCompletedTasks.reduce((sum, task) => {
          return sum + (task.duration || 0);
        }, 0);
        averageTaskDuration = totalDuration / filteredCompletedTasks.length;
      }
      console.log(`Average task duration: ${averageTaskDuration} minutes`);
      
      // Group tasks by category
      const tasksByCategory: Record<string, number> = {};
      filteredTasks.forEach(task => {
        const category = task.category || 'Uncategorized';
        tasksByCategory[category] = (tasksByCategory[category] || 0) + 1;
      });
      console.log('Tasks by category:', tasksByCategory);
      
      // Calculate most productive category
      let mostProductiveCategory = 'Uncategorized';
      let maxCategoryCount = 0;
      Object.entries(tasksByCategory).forEach(([category, count]) => {
        if (count > maxCategoryCount) {
          maxCategoryCount = count;
          mostProductiveCategory = category;
        }
      });
      console.log(`Most productive category: ${mostProductiveCategory}`);
      
      // Group completed tasks by day (using createdAt since completedAt doesn't exist)
      const tasksCompletedByDay: Record<string, number> = {};
      filteredCompletedTasks.forEach(task => {
        try {
          // Use createdAt as a proxy for completedAt
          const dateStr = new Date(task.createdAt).toISOString().split('T')[0];
          if (dateStr) {
            tasksCompletedByDay[dateStr] = (tasksCompletedByDay[dateStr] || 0) + 1;
          }
        } catch (error) {
          console.error('Error grouping task by day, skipping task:', error);
        }
      });
      console.log('Tasks completed by day:', tasksCompletedByDay);
      
      // Find most productive day
      let mostProductiveDay = new Date().toISOString().split('T')[0]; // default to today
      let maxCompletedTasks = 0;
      Object.entries(tasksCompletedByDay).forEach(([dateStr, count]) => {
        if (count > maxCompletedTasks) {
          maxCompletedTasks = count;
          mostProductiveDay = dateStr;
        }
      });
      console.log(`Most productive day: ${mostProductiveDay}`);
      
      return {
        taskCompletionRate,
        tasksCompletedCount,
        totalTasksCount,
        tasksByCategory,
        tasksCompletedByDay,
        averageTaskDuration,
        mostProductiveDay,
        mostProductiveCategory
      };
    } catch (error) {
      console.error('Error getting productivity analytics:', error);
      // Return default values instead of throwing an error
      return this.getDefaultProductivityAnalytics();
    }
  }

  /**
   * Get OKR analytics for a user
   */
  async getOkrAnalytics(userId: number): Promise<any> {
    try {
      // Get OKRs and objectives for the user
      const okrs = await prisma.okr.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });
      
      const objectives = await prisma.objective.findMany({
        where: { userId },
        orderBy: { created_at: 'desc' }
      });
      
      const projects = await prisma.project.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });
      
      // Calculate OKR completion rate
      const completedOkrs = okrs.filter(okr => okr.status === 'completed');
      const okrCount = okrs.length;
      const completionRate = okrCount > 0 ? completedOkrs.length / okrCount : 0;
      
      // Calculate average OKR progress
      let totalProgress = 0;
      okrs.forEach(okr => {
        // Calculate progress based on status or use a default value
        let progress = 0;
        if (okr.status === 'completed') {
          progress = 1; // 100%
        } else if (okr.status === 'inProgress') {
          progress = 0.5; // 50%
        } else if (okr.status === 'notStarted') {
          progress = 0; // 0%
        }
        totalProgress += progress;
      });
      const averageOkrProgress = okrCount > 0 ? totalProgress / okrCount : 0;
      
      // Group OKRs by status
      const okrsByStatus: Record<string, number> = {};
      okrs.forEach(okr => {
        const status = okr.status || 'notStarted';
        if (!okrsByStatus[status]) {
          okrsByStatus[status] = 0;
        }
        okrsByStatus[status]++;
      });
      
      // Group objectives by status
      const objectivesByStatus: Record<string, number> = {};
      objectives.forEach(objective => {
        const status = objective.status || 'active';
        if (!objectivesByStatus[status]) {
          objectivesByStatus[status] = 0;
        }
        objectivesByStatus[status]++;
      });
      
      // Calculate objectives per project
      const projectsCount = projects.length;
      const objectivesCount = objectives.length;
      const averageObjectivesPerProject = projectsCount > 0 ? objectivesCount / projectsCount : 0;
      
      return {
        completionRate,
        okrCount,
        averageOkrProgress,
        objectivesCount,
        okrsByStatus,
        objectivesByStatus,
        projectsCount,
        averageObjectivesPerProject
      };
    } catch (error) {
      console.error('Error getting OKR analytics:', error);
      // Return default OKR analytics values instead of throwing an error
      return this.getDefaultOkrAnalytics();
    }
  }

  /**
   * Get focus session analytics for a user within a specified timeframe
   */
  async getFocusAnalytics(userId: number, days: number = 30): Promise<any> {
    try {
      // Get all focus sessions for the user
      const allFocusSessions = await prisma.focusSession.findMany({
        where: { userId },
        orderBy: { startedAt: 'desc' }
      });
      
      const tasks = await prisma.task.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });
      
      // Calculate date range
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // Filter focus sessions within the time range
      const focusSessions = allFocusSessions.filter(session => {
        try {
          const sessionDate = new Date(session.startedAt);
          return sessionDate >= startDate;
        } catch (e) {
          // If date parsing fails, skip this session
          console.error('Error parsing session date:', e);
          return false;
        }
      });
      
      // Calculate focus session metrics
      const focusSessionCount = focusSessions.length;
      
      // Calculate total and average duration based on start and end times
      let totalFocusSessionTime = 0;
      let sessionsWithDuration = 0; // Count only sessions with both start and end times
      focusSessions.forEach(session => {
        if (session.startedAt && session.endedAt) {
          try {
            const startTime = new Date(session.startedAt);
            const endTime = new Date(session.endedAt);
            const durationMs = endTime.getTime() - startTime.getTime();
            const durationMinutes = durationMs / (1000 * 60); // Convert to minutes
            totalFocusSessionTime += durationMinutes;
            sessionsWithDuration++;
          } catch (e) {
            console.error('Error calculating session duration from start/end times:', e);
            // Skip this session if date parsing fails
          }
        }
      });
      
      const averageFocusSessionDuration = sessionsWithDuration > 0 
        ? totalFocusSessionTime / sessionsWithDuration 
        : 0;
      
      // Calculate task completion during focus sessions
      const tasksCompletedDuringFocus = tasks.filter(task => {
        if (!task.completed) return false;
        
        // Use createdAt as a proxy since we don't have completedAt
        try {
          const taskDate = new Date(task.createdAt);
          return taskDate >= startDate;
        } catch (error) {
          console.error('Error parsing task date:', error);
          return false;
        }
      }).length;
      
      // Calculate task completion rate during focus sessions
      const tasksScheduledForFocus = tasks.length;
      const taskCompletionRateDuringFocus = tasksScheduledForFocus > 0 
        ? tasksCompletedDuringFocus / tasksScheduledForFocus 
        : 0;
      
      // Find most productive 3-hour window
      const hourlyCompletions: Record<number, number> = {};
      tasks.forEach(task => {
        if (task.completed) {
          try {
            // Use task creation time as a proxy
            const hour = new Date(task.createdAt).getHours();
            if (!hourlyCompletions[hour]) {
              hourlyCompletions[hour] = 0;
            }
            hourlyCompletions[hour]++;
          } catch (error) {
            console.error('Error parsing task date for hourly completions:', error);
          }
        }
      });
      
      let mostProductiveHour = 9; // Default to 9 AM
      let maxHourlyCompletions = 0;
      
      for (let hour = 0; hour < 24; hour++) {
        const completions = (hourlyCompletions[hour] || 0) + 
                           (hourlyCompletions[(hour + 1) % 24] || 0) + 
                           (hourlyCompletions[(hour + 2) % 24] || 0);
        
        if (completions > maxHourlyCompletions) {
          maxHourlyCompletions = completions;
          mostProductiveHour = hour;
        }
      }
      
      // Format the most productive 3-hour window
      const formatHour = (hour: number) => {
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}${period}`;
      };
      
      const mostProductive3HourWindow = `${formatHour(mostProductiveHour)}-${formatHour((mostProductiveHour + 3) % 24)}`;
      
      return {
        averageFocusSessionDuration,
        totalFocusSessionTime,
        focusSessionCount,
        taskCompletionRateDuringFocus,
        mostProductive3HourWindow,
        tasksCompletedDuringFocus
      };
    } catch (error) {
      console.error('Error getting focus analytics:', error);
      // Return default focus analytics values instead of throwing an error
      return this.getDefaultFocusAnalytics();
    }
  }

  /**
   * Get trends analytics for a user within a specified timeframe
   */
  async getTrendsAnalytics(userId: number, days: number = 30): Promise<any> {
    try {
      console.log(`Getting trends analytics for user ${userId} with ${days} days timeframe`);
      
      // Get all necessary data
      const allTasks = await prisma.task.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });
      console.log(`Found ${allTasks.length} total tasks for user ${userId}`);
      
      const completedTasks = allTasks.filter(task => task.completed);
      console.log(`Found ${completedTasks.length} completed tasks for user ${userId}`);

      const allFocusSessions = await prisma.focusSession.findMany({
        where: { userId },
        orderBy: { startedAt: 'desc' }
      });

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // Generate daily data points for trends
      const dailyData = [];
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const currentDate = new Date(d);
        const dateStr = currentDate.toISOString().split('T')[0];
        
        // Count tasks completed on this day
        const tasksCompletedThisDay = completedTasks.filter(task => {
          try {
            const taskDate = new Date(task.createdAt).toISOString().split('T')[0];
            return taskDate === dateStr;
          } catch (e) {
            return false;
          }
        }).length;

        // Count focus sessions on this day
        const focusSessionsThisDay = allFocusSessions.filter(session => {
          try {
            const sessionDate = new Date(session.startedAt).toISOString().split('T')[0];
            return sessionDate === dateStr;
          } catch (e) {
            return false;
          }
        }).length;

        // Calculate total focus time for this day
        const totalFocusTimeThisDay = allFocusSessions
          .filter(session => {
            try {
              const sessionDate = new Date(session.startedAt).toISOString().split('T')[0];
              return sessionDate === dateStr;
            } catch (e) {
              return false;
            }
          })
          .reduce((sum, session) => sum + (session.duration || 0), 0);

        dailyData.push({
          date: dateStr,
          tasksCompleted: tasksCompletedThisDay,
          focusSessions: focusSessionsThisDay,
          totalFocusTime: totalFocusTimeThisDay
        });
      }

      // Calculate task completion trends
      const taskCompletionTrend = dailyData.map(day => ({
        date: day.date,
        value: day.tasksCompleted
      }));

      // Calculate focus session trends
      const focusSessionTrend = dailyData.map(day => ({
        date: day.date,
        value: day.focusSessions
      }));

      // Calculate productivity trends (tasks completed per focus session)
      const productivityTrend = dailyData.map(day => ({
        date: day.date,
        value: day.focusSessions > 0 ? (day.tasksCompleted / day.focusSessions) : 0
      }));

      // Calculate category distribution over time
      const categoryDistribution: Record<string, number> = {};
      allTasks.forEach(task => {
        const category = task.category || 'Uncategorized';
        categoryDistribution[category] = (categoryDistribution[category] || 0) + 1;
      });

      // Calculate weekly averages
      const weeklyTaskAverage = dailyData.length > 0 ? 
        dailyData.reduce((sum, day) => sum + day.tasksCompleted, 0) / Math.max(dailyData.length, 1) : 0;
      
      const weeklyFocusAverage = dailyData.length > 0 ? 
        dailyData.reduce((sum, day) => sum + day.focusSessions, 0) / Math.max(dailyData.length, 1) : 0;

      return {
        taskCompletionTrend,
        focusSessionTrend,
        productivityTrend,
        categoryDistribution,
        weeklyTaskAverage: Math.round(weeklyTaskAverage * 100) / 100,
        weeklyFocusAverage: Math.round(weeklyFocusAverage * 100) / 100,
        totalTasksCompleted: completedTasks.length,
        totalFocusSessions: allFocusSessions.length,
        timeframe: days
      };
    } catch (error) {
      console.error('Error getting trends analytics:', error);
      return this.getDefaultTrendsAnalytics();
    }
  }

  /**
   * Get default productivity analytics when data is not available or there's an error
   */
  private getDefaultProductivityAnalytics(): any {
    return {
      taskCompletionRate: 0,
      tasksCompletedCount: 0,
      totalTasksCount: 0,
      tasksByCategory: { 'Uncategorized': 0 },
      tasksCompletedByDay: {},
      averageTaskDuration: 0,
      mostProductiveDay: new Date().toISOString().split('T')[0],
      mostProductiveCategory: 'Uncategorized',
      message: "No task data available yet. Start by creating tasks to track your productivity."
    };
  }

  /**
   * Get default OKR analytics when data is not available or there's an error
   */
  private getDefaultOkrAnalytics(): any {
    return {
      completionRate: 0,
      okrCount: 0,
      averageOkrProgress: 0,
      objectivesCount: 0,
      okrsByStatus: {
        'notStarted': 0,
        'inProgress': 0,
        'completed': 0
      },
      objectivesByStatus: {
        'active': 0,
        'completed': 0
      },
      projectsCount: 0,
      averageObjectivesPerProject: 0,
      message: "No OKR data available yet. Start by creating objectives and key results."
    };
  }

  /**
   * Get default focus analytics when data is not available or there's an error
   */
  private getDefaultFocusAnalytics(): any {
    return {
      averageFocusSessionDuration: 0,
      totalFocusSessionTime: 0,
      focusSessionCount: 0,
      taskCompletionRateDuringFocus: 0,
      mostProductive3HourWindow: "9AM-12PM",
      tasksCompletedDuringFocus: 0,
      message: "No focus session data available yet. Start by creating focus sessions to track your productivity."
    };
  }

  /**
   * Get default trends analytics when data is not available or there's an error
   */
  private getDefaultTrendsAnalytics(): any {
    return {
      taskCompletionTrend: [],
      focusSessionTrend: [],
      productivityTrend: [],
      categoryDistribution: {},
      weeklyTaskAverage: 0,
      weeklyFocusAverage: 0,
      totalTasksCompleted: 0,
      totalFocusSessions: 0,
      timeframe: 30,
      message: "No trends data available yet. Start by creating and completing tasks to see your productivity trends."
    };
  }
}

export default new AnalyticsService();
