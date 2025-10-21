import prisma from "../config/prisma.js";
import { CognitiveLoadService } from "./cognitive-load.service.js";

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
      const intentionData = {
        taskIds: data.taskIds || [],
        settings: data.settings || {},
        category: data.category
      };

      const result = await prisma.$queryRaw`
        INSERT INTO focus_sessions (user_id, session_type, status, intention, duration)
        VALUES (${userId}, ${data.sessionType}, 'active', ${JSON.stringify(intentionData)}::jsonb, ${data.duration || 0})
        RETURNING *
      ` as any[];

      const session = result[0];
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

      // Add metrics and productivity rating to intention data
      if (data.metrics) {
        intentionData.metrics = data.metrics;
      }
      if (data.productivityRating) {
        intentionData.productivityRating = data.productivityRating;
      }

      const result = await prisma.$queryRaw`
        UPDATE focus_sessions 
        SET status = 'completed', 
            ended_at = NOW(), 
            completed = true, 
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

      const result = await prisma.$queryRaw`
        UPDATE focus_sessions 
        SET status = 'paused', intention = ${JSON.stringify(intentionData)}::jsonb
        WHERE id = ${sessionId} AND user_id = ${userId}
        RETURNING *
      ` as any[];

      if (result.length === 0) {
        return null;
      }

      const updatedSession = result[0];
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
      const result = await prisma.$queryRaw`
        UPDATE focus_sessions 
        SET status = 'active'
        WHERE id = ${sessionId} AND user_id = ${userId}
        RETURNING *
      ` as any[];

      if (result.length === 0) {
        return null;
      }

      const updatedSession = result[0];
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


