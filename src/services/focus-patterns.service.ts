import prisma from "../config/prisma.js";

export class FocusPatternsService {
  /**
   * Get user focus patterns data
   */
  async getUserFocusPatterns(userId: number): Promise<any> {
    try {
      console.log(`Getting focus patterns for user ${userId}`);
      
      // Get user productivity patterns if they exist
      const productivityPatterns = await prisma.userProductivityPatterns.findUnique({
        where: { userId }
      });
      
      // Get focus sessions for pattern analysis
      const focusSessions = await prisma.focusSession.findMany({
        where: { userId },
        orderBy: { startedAt: 'desc' }
      });
      
      // Get tasks for pattern analysis
      const tasks = await prisma.task.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });
      
      // Analyze patterns
      const timePatterns = this.analyzeTimePatterns(focusSessions, tasks);
      const flowStates = this.analyzeFlowStates(focusSessions);
      const distractionPatterns = this.analyzeDistractionPatterns(focusSessions);
      
      return {
        timePatterns,
        flowStates,
        distractionPatterns
      };
    } catch (error) {
      console.error('Error getting focus patterns:', error);
      return this.getDefaultFocusPatterns();
    }
  }

  /**
   * Analyze time patterns from focus sessions and tasks
   */
  private analyzeTimePatterns(focusSessions: any[], tasks: any[]): any {
    // Analyze hourly productivity patterns
    const hourlyProductivity: Record<string, number> = {};
    const dailyPatterns: Record<string, number> = {};
    
    // Initialize hourly patterns
    for (let hour = 0; hour < 24; hour++) {
      hourlyProductivity[hour.toString()] = 0;
    }
    
    // Initialize daily patterns
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    days.forEach(day => {
      dailyPatterns[day] = 0;
    });
    
    // Analyze focus sessions for hourly patterns
    focusSessions.forEach(session => {
      try {
        const hour = new Date(session.startedAt).getHours();
        const dayOfWeek = new Date(session.startedAt).getDay();
        
        // Calculate productivity score based on session effectiveness
        const productivityScore = this.calculateSessionProductivity(session);
        
        hourlyProductivity[hour.toString()] = (hourlyProductivity[hour.toString()] || 0) + productivityScore;
        dailyPatterns[days[dayOfWeek]!] = (dailyPatterns[days[dayOfWeek]!] || 0) + productivityScore;
      } catch (error) {
        console.error('Error analyzing session time pattern:', error);
      }
    });
    
    // Analyze tasks for completion patterns
    tasks.forEach(task => {
      if (task.completed) {
        try {
          const hour = new Date(task.createdAt).getHours();
          const dayOfWeek = new Date(task.createdAt).getDay();
          
          hourlyProductivity[hour.toString()] = (hourlyProductivity[hour.toString()] || 0) + 1;
          dailyPatterns[days[dayOfWeek]!] = (dailyPatterns[days[dayOfWeek]!] || 0) + 1;
        } catch (error) {
          console.error('Error analyzing task time pattern:', error);
        }
      }
    });
    
    // Normalize patterns (convert to percentages)
    const hourlyValues = Object.values(hourlyProductivity);
    const dailyValues = Object.values(dailyPatterns);
    const maxHourly = hourlyValues.length > 0 ? Math.max(...hourlyValues) : 0;
    const maxDaily = dailyValues.length > 0 ? Math.max(...dailyValues) : 0;
    
    if (maxHourly > 0) {
      Object.keys(hourlyProductivity).forEach(hour => {
        hourlyProductivity[hour] = Math.round((hourlyProductivity[hour]! / maxHourly) * 100);
      });
    }
    
    if (maxDaily > 0) {
      Object.keys(dailyPatterns).forEach(day => {
        dailyPatterns[day] = Math.round((dailyPatterns[day]! / maxDaily) * 100) / 100;
      });
    }
    
    return {
      hourlyProductivity,
      dailyPatterns
    };
  }

  /**
   * Analyze flow states from focus sessions
   */
  private analyzeFlowStates(focusSessions: any[]): any {
    const flowStates = {
      struggling: 0,
      neutral: 0,
      engaged: 0,
      flowing: 0,
      optimal: 0
    };
    
    if (focusSessions.length === 0) {
      return flowStates;
    }
    
    focusSessions.forEach(session => {
      // Use cognitive flow score if available, otherwise estimate from session data
      let flowState = 'neutral';
      
      if (session.cognitiveFlowScore !== null && session.cognitiveFlowScore !== undefined) {
        if (session.cognitiveFlowScore >= 90) flowState = 'optimal';
        else if (session.cognitiveFlowScore >= 75) flowState = 'flowing';
        else if (session.cognitiveFlowScore >= 60) flowState = 'engaged';
        else if (session.cognitiveFlowScore >= 40) flowState = 'neutral';
        else flowState = 'struggling';
      } else if (session.flowState) {
        flowState = session.flowState.toLowerCase();
      } else {
        // Estimate based on session effectiveness
        const effectiveness = this.calculateSessionProductivity(session);
        if (effectiveness >= 0.8) flowState = 'optimal';
        else if (effectiveness >= 0.6) flowState = 'flowing';
        else if (effectiveness >= 0.4) flowState = 'engaged';
        else if (effectiveness >= 0.2) flowState = 'neutral';
        else flowState = 'struggling';
      }
      
      flowStates[flowState as keyof typeof flowStates]++;
    });
    
    // Convert to percentages
    const total = focusSessions.length;
    Object.keys(flowStates).forEach(state => {
      flowStates[state as keyof typeof flowStates] = Math.round((flowStates[state as keyof typeof flowStates] / total) * 100) / 100;
    });
    
    return flowStates;
  }

  /**
   * Analyze distraction patterns from focus sessions
   */
  private analyzeDistractionPatterns(focusSessions: any[]): any {
    const distractionPatterns = {
      notifications: 0,
      contextSwitching: 0,
      environmental: 0
    };
    
    if (focusSessions.length === 0) {
      return distractionPatterns;
    }
    
    let totalDistractions = 0;
    
    focusSessions.forEach(session => {
      // Count distractions from session data
      const distractions = session.distractions || 0;
      const contextSwitches = session.contextSwitchCount || 0;
      
      totalDistractions += distractions;
      
      // Estimate distraction types based on session metrics
      if (contextSwitches > 0) {
        distractionPatterns.contextSwitching += contextSwitches;
      }
      
      if (distractions > 0) {
        // Assume 30% are notifications, 20% are environmental
        distractionPatterns.notifications += distractions * 0.3;
        distractionPatterns.environmental += distractions * 0.2;
      }
    });
    
    // Convert to percentages
    if (totalDistractions > 0) {
      Object.keys(distractionPatterns).forEach(pattern => {
        distractionPatterns[pattern as keyof typeof distractionPatterns] = 
          Math.round((distractionPatterns[pattern as keyof typeof distractionPatterns] / totalDistractions) * 100) / 100;
      });
    }
    
    return distractionPatterns;
  }

  /**
   * Calculate session productivity score
   */
  private calculateSessionProductivity(session: any): number {
    let score = 0;
    
    // Base score from duration
    const duration = session.duration || 0;
    if (duration > 0) {
      score += Math.min(duration / 60, 1); // Normalize to 0-1, cap at 60 minutes
    }
    
    // Bonus for completed tasks
    const tasksCompleted = session.tasksCompleted || 0;
    score += tasksCompleted * 0.2;
    
    // Penalty for distractions
    const distractions = session.distractions || 0;
    score -= distractions * 0.1;
    
    // Bonus for high cognitive flow score
    if (session.cognitiveFlowScore) {
      score += (session.cognitiveFlowScore / 100) * 0.3;
    }
    
    return Math.max(0, Math.min(1, score)); // Clamp between 0 and 1
  }

  /**
   * Get default focus patterns when data is not available or there's an error
   */
  private getDefaultFocusPatterns(): any {
    return {
      timePatterns: {
        hourlyProductivity: {
          "9": 85,
          "10": 90,
          "11": 88,
          "14": 75,
          "15": 80
        },
        dailyPatterns: {
          "monday": 0.8,
          "tuesday": 0.9,
          "wednesday": 0.85,
          "thursday": 0.9,
          "friday": 0.7,
          "saturday": 0.3,
          "sunday": 0.2
        }
      },
      flowStates: {
        struggling: 0.1,
        neutral: 0.3,
        engaged: 0.4,
        flowing: 0.15,
        optimal: 0.05
      },
      distractionPatterns: {
        notifications: 0.3,
        contextSwitching: 0.25,
        environmental: 0.2
      },
      message: "No focus pattern data available yet. Start by creating focus sessions to track your patterns."
    };
  }
}

export default new FocusPatternsService();
