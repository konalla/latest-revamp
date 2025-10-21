import prisma from "../config/prisma.js";

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

    return {
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
      category: category,
      elapsedTime: additionalData?.elapsedTime ?? elapsedTime ?? 0,
      completedTasks: additionalData?.completedTasks,
      productivityRating: additionalData?.productivityRating,
      notes: session.notes,
      metrics: additionalData?.metrics,
    };
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
}

const focusSessionService = new FocusSessionService();
export default focusSessionService;


