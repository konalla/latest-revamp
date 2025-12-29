import prisma from "../config/prisma.js";
import { CognitiveLoadService } from "./cognitive-load.service.js";
import userStatusService from "./user-status.service.js";

export interface FocusSessionResponse {
  id: number;
  userId: number;
  sessionType: string;
  startTime: Date;
  endTime?: Date | null;
  status: string;
  taskIds: number[];
  settings: Record<string, any>;
  isActive: boolean;
  duration: number;
  category?: string;
  elapsedTime?: number;
  completedTasks?: number[];
  productivityRating?: number;
  notes?: string;
  metrics?: {
    focusScore?: number;
    distractions?: number;
    breaksTaken?: number;
  };
}

export interface CreateFocusSessionRequest {
  sessionType: "focus_plan" | "ai_focus" | "manual";
  taskIds?: number[];
  settings?: {
    workBlockMinutes?: number;
    breakMinutes?: number;
    autoStartBreak?: boolean;
    enableNotifications?: boolean;
  };
  duration?: number;
  category?: string;
}

export interface UpdateSessionRequest {
  status?: "paused" | "resumed" | "completed";
  elapsedTime?: number;
  completedTasks?: number[];
  notes?: string;
}

export interface EndSessionRequest {
  reason: "completed" | "manually_ended" | "interrupted";
  elapsedTime: number;
  completedTasks?: number[];
  productivityRating?: number;
  notes?: string;
  metrics?: {
    focusScore?: number;
    distractions?: number;
    breaksTaken?: number;
  };
}

export interface PauseSessionRequest {
  elapsedTime: number;
  reason: "break" | "interruption" | "manual";
}

export interface ResumeSessionRequest {
  elapsedTime: number;
}

export class FocusSessionService {
  private cognitiveLoadService: CognitiveLoadService;

  constructor() {
    this.cognitiveLoadService = new CognitiveLoadService();
  }
  private mapDatabaseSessionToResponse(session: any, additionalData?: any): FocusSessionResponse {
    let taskIds: number[] = [];
    let settings: Record<string, any> = {};
    let category: string | undefined;
    let elapsedTime: number | undefined;

    if (session.intention) {
      try {
        const intentionData: any = session.intention as any;
        taskIds = Array.isArray(intentionData?.taskIds) ? intentionData.taskIds : [];
        settings = intentionData?.settings ?? {};
        category = intentionData?.category;
        elapsedTime = intentionData?.elapsedTime;
      } catch (e) {
        console.error("Error parsing intention data:", e);
      }
    }

    const response: FocusSessionResponse = {
      id: session.id,
      userId: session.user_id,
      sessionType: session.session_type,
      startTime: session.started_at,
      endTime: session.ended_at,
      status: session.status,
      taskIds,
      settings,
      isActive: session.status === "active",
      duration: session.duration,
      elapsedTime: additionalData?.elapsedTime ?? elapsedTime ?? 0,
      completedTasks: additionalData?.completedTasks,
      productivityRating: additionalData?.productivityRating,
      notes: session.notes,
      metrics: additionalData?.metrics,
    };

    if (category) {
      response.category = category;
    }

    return response;
  }

  /**
   * Get all focus sessions with insights for a user
   * @param userId User ID
   * @returns Array of sessions with insights
   */
  async getAllSessionsWithInsights(userId: number): Promise<any[]> {
    try {
      const sessions = await prisma.focusSession.findMany({
        where: {
          userId
        },
        orderBy: {
          startedAt: 'desc'
        }
      });

      return sessions.map(session => this.mapSessionToInsightsResponse(session));
    } catch (error) {
      console.error(`Error getting all sessions with insights for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Map session to response format with insights
   */
  private mapSessionToInsightsResponse(session: any): any {
    // Calculate duration from timestamps (not duration field)
    let durationMinutes = 0;
    const startedAt = session.startedAt instanceof Date ? session.startedAt : new Date(session.startedAt);
    const endedAt = session.endedAt ? (session.endedAt instanceof Date ? session.endedAt : new Date(session.endedAt)) : null;
    
    if (endedAt && startedAt) {
      const diffMs = endedAt.getTime() - startedAt.getTime();
      durationMinutes = Math.max(0, Math.floor(diffMs / 1000 / 60));
    }

    // Extract insights and category from intention JSON
    let insights: any[] = [];
    let category: string | undefined;
    try {
      const intention = session.intention as any;
      if (intention) {
        // Extract category
        category = intention.category;
        
        // Extract insights array
        if (Array.isArray(intention.insights)) {
          insights = intention.insights.map((insight: any) => ({
            id: insight.id || `${session.id}-${insight.createdAt || Date.now()}`,
            sessionId: session.id.toString(),
            userId: session.userId,
            insightType: insight.insightType || 'reflection',
            content: insight.content || '',
            createdAt: insight.createdAt || (session.createdAt instanceof Date ? session.createdAt.toISOString() : new Date(session.createdAt).toISOString())
          }));
        }
      }
    } catch (error) {
      console.error('Error parsing insights from intention:', error);
      insights = [];
    }

    const response: any = {
      id: session.id.toString(),
      startTime: startedAt.toISOString(),
      endTime: endedAt ? endedAt.toISOString() : null,
      durationMinutes,
      completed: session.completed,
      sessionType: session.sessionType,
      notes: session.notes || null,
      tasksCompleted: session.tasksCompleted || 0,
      insights,
      distractions: session.distractions ?? null,
      environment: session.environment || null,
      mood: session.mood || null,
      energyLevel: session.energyLevel || null,
      aiScore: session.aiScore ?? null,
      cognitiveFlowScore: session.cognitiveFlowScore ?? null,
      contextSwitchCount: session.contextSwitchCount ?? null,
      flowState: session.flowState || null
    };

    // Add category if it exists
    if (category) {
      response.category = category;
    }

    return response;
  }

  async getCurrentFocusSession(userId: number): Promise<FocusSessionResponse | null> {
    try {
      const sessions = await prisma.$queryRaw`
        SELECT * FROM focus_sessions 
        WHERE user_id = ${userId} 
          AND status IN ('active', 'paused')
        ORDER BY started_at DESC 
        LIMIT 1
      ` as any[];

      if (sessions.length === 0) return null;

      const session = sessions[0];
      return this.mapDatabaseSessionToResponse(session, {
        completedTasks: [],
        productivityRating: undefined,
        metrics: undefined
      });
    } catch (error) {
      console.error("Error getting current focus session:", error);
      return null;
    }
  }

  async createFocusSession(userId: number, data: CreateFocusSessionRequest): Promise<FocusSessionResponse> {
    try {
      const taskIds = data.taskIds || [];
      let calculatedDuration = data.duration || 0;

      // Calculate duration from tasks if category is provided and tasks exist
      if (taskIds.length > 0 && data.category) {
        const tasks = await prisma.task.findMany({
          where: { 
            id: { in: taskIds },
            userId: userId
          },
          select: { duration: true, category: true },
        });

        // Sum durations of tasks matching the category
        calculatedDuration = tasks
          .filter((t) => t.category === data.category)
          .reduce((sum, t) => sum + t.duration, 0);
      } else if (taskIds.length > 0 && !data.category) {
        // If no category specified, sum all task durations
        const tasks = await prisma.task.findMany({
          where: { 
            id: { in: taskIds },
            userId: userId
          },
          select: { duration: true },
        });

        calculatedDuration = tasks.reduce((sum, t) => sum + t.duration, 0);
      }

      const intentionData = {
        taskIds,
        settings: data.settings || {},
        category: data.category,
        scheduledDuration: calculatedDuration
      };

      const result = await prisma.$queryRaw`
        INSERT INTO focus_sessions (user_id, session_type, status, intention, duration)
        VALUES (${userId}, ${data.sessionType}, 'active', ${JSON.stringify(intentionData)}::jsonb, ${calculatedDuration})
        RETURNING *
      ` as any[];

      const session = result[0];
      
      // Update user status to online when focus session is created
      try {
        await userStatusService.updateUserStatus(userId, true);
      } catch (error) {
        console.error("Error updating user status after creating focus session:", error);
        // Don't throw error - session creation should still succeed
      }
      
      return this.mapDatabaseSessionToResponse(session, {
        elapsedTime: 0,
        completedTasks: [],
        productivityRating: undefined,
        metrics: undefined
      });
    } catch (error) {
      console.error("Error creating focus session:", error);
      throw error;
    }
  }

  async updateSessionStatus(sessionId: number, userId: number, data: UpdateSessionRequest): Promise<FocusSessionResponse | null> {
    try {
      // Build update query dynamically
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (data.status) {
        updateFields.push(`status = $${paramIndex}`);
        values.push(data.status);
        paramIndex++;
      }
      
      if (data.notes) {
        updateFields.push(`notes = $${paramIndex}`);
        values.push(data.notes);
        paramIndex++;
      }

      if (updateFields.length === 0) {
        // No fields to update, just return the existing session
        const existingSession = await prisma.$queryRaw`
          SELECT * FROM focus_sessions WHERE id = ${sessionId} AND user_id = ${userId}
        ` as any[];
        
        if (existingSession.length === 0) {
          return null;
        }
        
        const session = existingSession[0];
        return this.mapDatabaseSessionToResponse(session, data);
      }

      // Add sessionId and userId to values
      values.push(sessionId, userId);

      const updateQuery = `
        UPDATE focus_sessions 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
        RETURNING *
      `;

      const result = await prisma.$queryRawUnsafe(updateQuery, ...values) as any[];

      if (result.length === 0) {
        return null;
      }

      const updatedSession = result[0];
      return this.mapDatabaseSessionToResponse(updatedSession, data);
    } catch (error) {
      console.error("Error updating session status:", error);
      throw error;
    }
  }

  async endFocusSession(sessionId: number, userId: number, data: EndSessionRequest): Promise<FocusSessionResponse | null> {
    try {
      // Get existing session data first to calculate duration using Prisma for proper column mapping
      const existingSession = await prisma.focusSession.findFirst({
        where: { 
          id: sessionId,
          userId: userId
        },
        select: {
          intention: true,
          startedAt: true
        }
      });

      if (!existingSession) {
        return null;
      }
      
      console.log('Existing session data:', JSON.stringify(existingSession, null, 2));

      let intentionData: any = {};
      if (existingSession.intention) {
        try {
          intentionData = existingSession.intention as any;
        } catch (e) {
          console.error("Error parsing existing intention data:", e);
        }
      }

      // Add metrics and productivity rating to intention data
      if (data.metrics) {
        intentionData.metrics = data.metrics;
      }
      if (data.productivityRating) {
        intentionData.productivityRating = data.productivityRating;
      }

      // Calculate actual duration in minutes
      // Priority: 1) Use elapsedTime from frontend (most reliable), 2) Calculate from timestamps as fallback
      let calculatedDuration = 0;
      
      console.log('ElapsedTime from request:', data.elapsedTime);
      
      // First, use elapsedTime from the request (frontend tracks this accurately)
      if (data.elapsedTime !== undefined && data.elapsedTime > 0) {
        // elapsedTime from frontend is in seconds
        // Convert to minutes and round
        calculatedDuration = Math.max(1, Math.round(data.elapsedTime / 60));
        console.log(`Using elapsedTime: ${data.elapsedTime}s = ${calculatedDuration} minutes`);
      } else {
        // Fall back to calculating from timestamps if elapsedTime is not provided
        const startedAt = existingSession.startedAt;
        console.log('ElapsedTime not provided, falling back to timestamp calculation. StartedAt:', startedAt);
        
        if (startedAt) {
          try {
            const startTime = new Date(startedAt);
            const endTime = new Date();
            
            // Validate the date
            if (isNaN(startTime.getTime())) {
              console.error('Invalid startTime:', startedAt);
              throw new Error('Invalid startTime');
            }
            
            const diffMs = endTime.getTime() - startTime.getTime();
            const diffSeconds = Math.round(diffMs / 1000);
            const diffMinutes = diffMs / (1000 * 60);
            
            // Only use timestamp calculation if it's positive and reasonable
            if (diffMs > 0) {
              calculatedDuration = Math.max(1, Math.round(diffMinutes)); // At least 1 minute, round to nearest
              console.log(`Calculated duration from timestamps (fallback): ${calculatedDuration} minutes (${diffMs}ms difference, ${diffSeconds}s, ${diffMinutes.toFixed(2)} minutes)`);
            } else {
              console.warn('Timestamp difference is negative or zero');
              calculatedDuration = 1; // Default to 1 minute
            }
          } catch (error) {
            console.error('Error calculating duration from timestamps:', error);
            calculatedDuration = 1; // Default to 1 minute
          }
        } else {
          console.log('No startedAt found, defaulting to 1 minute');
          calculatedDuration = 1; // Default to 1 minute
        }
      }
      
      console.log(`Final calculated duration: ${calculatedDuration} minutes`);

      const result = await prisma.$queryRaw`
        UPDATE focus_sessions 
        SET status = 'completed', 
            ended_at = NOW(), 
            completed = true, 
            duration = ${calculatedDuration},
            notes = ${data.notes || null}, 
            tasks_completed = ${data.completedTasks?.length || 0},
            intention = ${JSON.stringify(intentionData)}::jsonb
        WHERE id = ${sessionId} AND user_id = ${userId}
        RETURNING *
      ` as any[];

      if (result.length === 0) {
        return null;
      }

      const updatedSession = result[0];
      
      // Update cognitive load meter after focus session completion
      try {
        await this.cognitiveLoadService.updateCognitiveLoadMeter(userId, {
          currentWorkloadScore: undefined // Will be recalculated based on current tasks and sessions
        });
      } catch (error) {
        console.error('Error updating cognitive load meter after focus session completion:', error);
        // Don't throw error - session completion should still succeed
      }

      // Update productivity patterns after focus session completion
      try {
        await this.updateProductivityPatterns(userId, {
          sessionDuration: data.elapsedTime || 0,
          sessionEffectiveness: data.productivityRating || 3,
          completedTasks: data.completedTasks?.length || 0,
          sessionHour: new Date().getHours()
        });
      } catch (error) {
        console.error('Error updating productivity patterns after focus session completion:', error);
        // Don't throw error - session completion should still succeed
      }

      // Update user status to offline when focus session ends
      // User can only have 1 active session at a time, so ending session means user is offline
      try {
        await userStatusService.updateUserStatus(userId, false);
      } catch (error) {
        console.error('Error updating user status after ending focus session:', error);
        // Don't throw error - session completion should still succeed
      }
      
      return this.mapDatabaseSessionToResponse(updatedSession, {
        elapsedTime: data.elapsedTime,
        completedTasks: data.completedTasks,
        productivityRating: data.productivityRating,
        metrics: data.metrics
      });
    } catch (error) {
      console.error("Error ending focus session:", error);
      throw error;
    }
  }

  async pauseSession(sessionId: number, userId: number, data: PauseSessionRequest): Promise<FocusSessionResponse | null> {
    try {
      // Get existing intention data first
      const existingSession = await prisma.$queryRaw`
        SELECT intention FROM focus_sessions WHERE id = ${sessionId} AND user_id = ${userId}
      ` as any[];

      if (existingSession.length === 0) {
        return null;
      }

      let intentionData: any = {};
      if (existingSession[0].intention) {
        try {
          intentionData = existingSession[0].intention as any;
        } catch (e) {
          console.error("Error parsing existing intention data:", e);
        }
      }

      // Add elapsedTime to intention data
      intentionData.elapsedTime = data.elapsedTime;

      const pausedAt = new Date();

      const result = await prisma.$queryRaw`
        UPDATE focus_sessions 
        SET status = 'paused', 
            paused_at = ${pausedAt},
            intention = ${JSON.stringify(intentionData)}::jsonb
        WHERE id = ${sessionId} AND user_id = ${userId}
        RETURNING *
      ` as any[];

      if (result.length === 0) {
        return null;
      }

      const updatedSession = result[0];
      
      // User remains online when session is paused (session is still active)
      // Update statusUpdatedAt to reflect the pause action
      try {
        await userStatusService.updateUserStatus(userId, true);
      } catch (error) {
        console.error("Error updating user status after pausing session:", error);
        // Don't throw error - session pause should still succeed
      }
      
      return this.mapDatabaseSessionToResponse(updatedSession, {
        elapsedTime: data.elapsedTime,
        completedTasks: [],
        productivityRating: undefined,
        metrics: undefined
      });
    } catch (error) {
      console.error("Error pausing session:", error);
      throw error;
    }
  }

  async resumeSession(sessionId: number, userId: number, data: ResumeSessionRequest): Promise<FocusSessionResponse | null> {
    try {
      const resumedAt = new Date();

      const result = await prisma.$queryRaw`
        UPDATE focus_sessions 
        SET status = 'active',
            resumed_at = ${resumedAt}
        WHERE id = ${sessionId} AND user_id = ${userId}
        RETURNING *
      ` as any[];

      if (result.length === 0) {
        return null;
      }

      const updatedSession = result[0];
      
      // User remains online when session is resumed
      // Update statusUpdatedAt to reflect the resume action
      try {
        await userStatusService.updateUserStatus(userId, true);
      } catch (error) {
        console.error("Error updating user status after resuming session:", error);
        // Don't throw error - session resume should still succeed
      }
      
      return this.mapDatabaseSessionToResponse(updatedSession, {
        elapsedTime: data.elapsedTime,
        completedTasks: [],
        productivityRating: undefined,
        metrics: undefined
      });
    } catch (error) {
      console.error("Error resuming session:", error);
      throw error;
    }
  }

  /**
   * Update productivity patterns based on focus session data
   * @param userId User ID
   * @param sessionData Session data to analyze
   */
  private async updateProductivityPatterns(userId: number, sessionData: {
    sessionDuration: number;
    sessionEffectiveness: number;
    completedTasks: number;
    sessionHour: number;
  }): Promise<void> {
    try {
      // Get existing productivity patterns
      const existingPatterns = await (prisma as any).userProductivityPatterns.findUnique({
        where: { userId }
      });

      if (!existingPatterns) {
        console.log(`No productivity patterns found for user ${userId}, skipping update`);
        return;
      }

      // Update hourly patterns
      const hourlyPatterns = existingPatterns.hourlyPatterns as Record<string, number> || {};
      const hourKey = sessionData.sessionHour.toString();
      const currentHourScore = hourlyPatterns[hourKey] || 0;
      
      // Calculate new score based on session effectiveness and duration
      const sessionScore = (sessionData.sessionEffectiveness * 2) + (sessionData.completedTasks * 3);
      const newHourScore = Math.round((currentHourScore + sessionScore) / 2); // Average with existing
      
      hourlyPatterns[hourKey] = newHourScore;

      // Update day of week patterns
      const dayOfWeekPatterns = existingPatterns.dayOfWeekPatterns as Record<string, number> || {};
      const dayKey = new Date().getDay().toString();
      const currentDayScore = dayOfWeekPatterns[dayKey] || 0;
      const newDayScore = Math.round((currentDayScore + sessionScore) / 2);
      
      dayOfWeekPatterns[dayKey] = newDayScore;

      // Update average focus session duration
      const currentAvgDuration = existingPatterns.averageFocusSessionDuration;
      const newAvgDuration = Math.round((currentAvgDuration + sessionData.sessionDuration) / 2);

      // Update peak productivity hours (top 3 hours)
      const sortedHours = Object.entries(hourlyPatterns)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([hour]) => parseInt(hour));

      // Update task switching metrics
      const taskSwitchingMetrics = existingPatterns.taskSwitchingMetrics as Record<string, any> || {};
      const currentSwitchCount = taskSwitchingMetrics.switchCount || 0;
      const currentRecoveryTime = taskSwitchingMetrics.recoveryTime || 0;
      
      // Estimate context switching based on session effectiveness
      const estimatedSwitches = sessionData.sessionEffectiveness < 3 ? 2 : 0;
      const estimatedRecovery = sessionData.sessionEffectiveness < 3 ? 5 : 0;
      
      taskSwitchingMetrics.switchCount = Math.round((currentSwitchCount + estimatedSwitches) / 2);
      taskSwitchingMetrics.recoveryTime = Math.round((currentRecoveryTime + estimatedRecovery) / 2);

      // Update the patterns in database
      await (prisma as any).userProductivityPatterns.update({
        where: { userId },
        data: {
          hourlyPatterns,
          dayOfWeekPatterns,
          averageFocusSessionDuration: newAvgDuration,
          peakProductivityHours: sortedHours,
          taskSwitchingMetrics
        }
      });

      console.log(`Updated productivity patterns for user ${userId}`);
    } catch (error) {
      console.error(`Error updating productivity patterns for user ${userId}:`, error);
      throw error;
    }
  }
}

const focusSessionService = new FocusSessionService();
export default focusSessionService;


