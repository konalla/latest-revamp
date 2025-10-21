import type { Request, Response } from "express";
import analyticsService from "../services/analytics.service.js";

class AnalyticsController {
  /**
   * GET /api/analytics/productivity - Personal productivity analytics
   */
  async getProductivityAnalytics(req: Request, res: Response): Promise<void> {
    try {
      console.log("GET /api/analytics/productivity - Fetching productivity analytics");
      
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      
      // Parse the timeframe - it can be a string like '30days' or a number of days
      let days = 30; // Default to 30 days
      const timeframe = req.query.timeframe as string || '30days';
      
      if (timeframe) {
        try {
          // Convert to days if it's a number
          if (/^\d+$/.test(timeframe)) {
            days = parseInt(timeframe, 10);
          } else if (timeframe.endsWith('days')) {
            // Parse '30days' format
            days = parseInt(timeframe.replace('days', ''), 10);
          }
        } catch (parseError) {
          console.warn("Invalid timeframe format, using default 30 days:", parseError);
        }
      }
      
      console.log(`Fetching productivity analytics for user ${userId} with ${days} days timeframe`);
      const data = await analyticsService.getProductivityAnalytics(userId, days);
      
      // Set JSON content type to ensure client processes response as JSON
      res.setHeader('Content-Type', 'application/json');
      res.json(data);
    } catch (error) {
      console.error("Error fetching productivity analytics:", error);
      res.status(500).json({ 
        error: "Failed to fetch productivity analytics",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * GET /api/analytics/okr - OKR analytics
   */
  async getOkrAnalytics(req: Request, res: Response): Promise<void> {
    try {
      console.log("GET /api/analytics/okr - Fetching OKR analytics");
      
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      
      console.log(`Fetching OKR analytics for user ${userId}`);
      const data = await analyticsService.getOkrAnalytics(userId);
      
      // Set JSON content type to ensure client processes response as JSON
      res.setHeader('Content-Type', 'application/json');
      res.json(data);
    } catch (error) {
      console.error("Error fetching OKR analytics:", error);
      res.status(500).json({ 
        error: "Failed to fetch OKR analytics",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * GET /api/analytics/focus - Focus analytics
   */
  async getFocusAnalytics(req: Request, res: Response): Promise<void> {
    try {
      console.log("GET /api/analytics/focus - Fetching focus analytics");
      
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      
      // Parse the timeframe - it can be a string like '30days' or a number of days
      let days = 30; // Default to 30 days
      const timeframe = req.query.timeframe as string || '30days';
      
      if (timeframe) {
        try {
          // Convert to days if it's a number
          if (/^\d+$/.test(timeframe)) {
            days = parseInt(timeframe, 10);
          } else if (timeframe.endsWith('days')) {
            // Parse '30days' format
            days = parseInt(timeframe.replace('days', ''), 10);
          }
        } catch (parseError) {
          console.warn("Invalid timeframe format, using default 30 days:", parseError);
        }
      }
      
      console.log(`Fetching focus analytics for user ${userId} with ${days} days timeframe`);
      const data = await analyticsService.getFocusAnalytics(userId, days);
      
      // Set JSON content type to ensure client processes response as JSON
      res.setHeader('Content-Type', 'application/json');
      res.json(data);
    } catch (error) {
      console.error("Error fetching focus analytics:", error);
      res.status(500).json({ 
        error: "Failed to fetch focus analytics",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * GET /api/analytics/trends - Trends analytics
   */
  async getTrendsAnalytics(req: Request, res: Response): Promise<void> {
    try {
      console.log("GET /api/analytics/trends - Fetching trends analytics");
      
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      
      // Parse the timeframe - it can be a string like '30days' or a number of days
      let days = 30; // Default to 30 days
      const timeframe = req.query.days as string || req.query.timeframe as string || '30';
      
      if (timeframe) {
        try {
          // Convert to days if it's a number
          if (/^\d+$/.test(timeframe)) {
            days = parseInt(timeframe, 10);
          } else if (timeframe.endsWith('days')) {
            // Parse '30days' format
            days = parseInt(timeframe.replace('days', ''), 10);
          }
        } catch (parseError) {
          console.warn("Invalid timeframe format, using default 30 days:", parseError);
        }
      }
      
      console.log(`Fetching trends analytics for user ${userId} with ${days} days timeframe`);
      const data = await analyticsService.getTrendsAnalytics(userId, days);
      
      // Set JSON content type to ensure client processes response as JSON
      res.setHeader('Content-Type', 'application/json');
      res.json(data);
    } catch (error) {
      console.error("Error fetching trends analytics:", error);
      res.status(500).json({ 
        error: "Failed to fetch trends analytics",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export default new AnalyticsController();
