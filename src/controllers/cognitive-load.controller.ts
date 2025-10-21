import type { Request, Response } from "express";
import { CognitiveLoadService } from "../services/cognitive-load.service.js";
import type { CognitiveLoadError } from "../types/cognitive-load.types.js";

export class CognitiveLoadController {
  private cognitiveLoadService: CognitiveLoadService;

  constructor() {
    this.cognitiveLoadService = new CognitiveLoadService();
  }

  /**
   * Get user's cognitive load meter
   * GET /api/cognitive-load/meter
   */
  async getCognitiveLoadMeter(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        console.error('No user ID found in cognitive load meter request');
        res.status(401).json({ 
          error: 'Unauthorized - no user ID',
          details: 'User authentication required to access cognitive load data'
        });
        return;
      }

      console.log(`Getting cognitive load meter for user ID: ${userId}`);
      const meterData = await this.cognitiveLoadService.getUserCognitiveLoadMeter(userId);
      
      res.json(meterData);
    } catch (error) {
      console.error('Error getting cognitive load meter:', error);
      
      const errorResponse: CognitiveLoadError = {
        error: 'Failed to retrieve cognitive load meter',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      res.status(500).json(errorResponse);
    }
  }

  /**
   * Generate workload forecast
   * GET /api/cognitive-load/forecast
   */
  async generateWorkloadForecast(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        console.error('No user ID found in workload forecast request');
        res.status(401).json({ 
          error: 'Unauthorized - no user ID',
          details: 'User authentication required to generate workload forecast'
        });
        return;
      }

      const days = req.query.days ? parseInt(req.query.days as string) : 7;
      
      // Validate days parameter
      if (isNaN(days) || days < 1 || days > 30) {
        res.status(400).json({
          error: 'Invalid days parameter',
          details: 'Days must be a number between 1 and 30'
        });
        return;
      }

      console.log(`Generating workload forecast for user ${userId} for ${days} days`);
      const forecast = await this.cognitiveLoadService.generateWorkloadForecast(userId, days);
      
      res.json(forecast);
    } catch (error) {
      console.error('Error generating workload forecast:', error);
      
      const errorResponse: CognitiveLoadError = {
        error: 'Failed to generate workload forecast',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      res.status(500).json(errorResponse);
    }
  }

  /**
   * Assess burnout risk
   * GET /api/cognitive-load/burnout-risk
   */
  async assessBurnoutRisk(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        console.error('No user ID found in burnout risk assessment request');
        res.status(401).json({ 
          error: 'Unauthorized - no user ID',
          details: 'User authentication required to assess burnout risk'
        });
        return;
      }

      console.log(`Assessing burnout risk for user ${userId}`);
      const riskAssessment = await this.cognitiveLoadService.assessBurnoutRisk(userId);
      
      res.json(riskAssessment);
    } catch (error) {
      console.error('Error assessing burnout risk:', error);
      
      const errorResponse: CognitiveLoadError = {
        error: 'Failed to assess burnout risk',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      res.status(500).json(errorResponse);
    }
  }

  /**
   * Get adaptive recommendations
   * GET /api/cognitive-load/recommendations
   */
  async getAdaptiveRecommendations(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        console.error('No user ID found in adaptive recommendations request');
        res.status(401).json({ 
          error: 'Unauthorized - no user ID',
          details: 'User authentication required to generate adaptive recommendations'
        });
        return;
      }

      console.log(`Generating adaptive recommendations for user ${userId}`);
      const recommendations = await this.cognitiveLoadService.generateAdaptiveRecommendations(userId);
      
      res.json(recommendations);
    } catch (error) {
      console.error('Error generating adaptive recommendations:', error);
      
      const errorResponse: CognitiveLoadError = {
        error: 'Failed to generate adaptive recommendations',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      res.status(500).json(errorResponse);
    }
  }

  /**
   * Update cognitive load meter
   * PUT /api/cognitive-load/meter
   */
  async updateCognitiveLoadMeter(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        console.error('No user ID found in cognitive load meter update request');
        res.status(401).json({ 
          error: 'Unauthorized - no user ID',
          details: 'User authentication required to update cognitive load meter'
        });
        return;
      }

      const updateData = req.body;
      
      // Validate required fields if provided
      if (updateData.currentWorkloadScore !== undefined) {
        if (typeof updateData.currentWorkloadScore !== 'number' || 
            updateData.currentWorkloadScore < 0 || 
            updateData.currentWorkloadScore > 100) {
          res.status(400).json({
            error: 'Invalid currentWorkloadScore',
            details: 'Current workload score must be a number between 0 and 100'
          });
          return;
        }
      }

      if (updateData.burnoutRiskScore !== undefined) {
        if (typeof updateData.burnoutRiskScore !== 'number' || 
            updateData.burnoutRiskScore < 0 || 
            updateData.burnoutRiskScore > 100) {
          res.status(400).json({
            error: 'Invalid burnoutRiskScore',
            details: 'Burnout risk score must be a number between 0 and 100'
          });
          return;
        }
      }

      console.log(`Updating cognitive load meter for user ${userId}`);
      const updatedMeter = await this.cognitiveLoadService.updateCognitiveLoadMeter(userId, updateData);
      
      res.json(updatedMeter);
    } catch (error) {
      console.error('Error updating cognitive load meter:', error);
      
      const errorResponse: CognitiveLoadError = {
        error: 'Failed to update cognitive load meter',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      res.status(500).json(errorResponse);
    }
  }

  /**
   * Get user focus preferences
   * GET /api/cognitive-load/focus-preferences
   */
  async getFocusPreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        console.error('No user ID found in focus preferences request');
        res.status(401).json({ 
          error: 'Unauthorized - no user ID',
          details: 'User authentication required to access focus preferences'
        });
        return;
      }

      console.log(`Getting focus preferences for user ${userId}`);
      const preferences = await this.cognitiveLoadService.getUserFocusPreferences(userId);
      
      res.json(preferences);
    } catch (error) {
      console.error('Error getting focus preferences:', error);
      
      const errorResponse: CognitiveLoadError = {
        error: 'Failed to retrieve focus preferences',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      res.status(500).json(errorResponse);
    }
  }

  /**
   * Update user focus preferences
   * PUT /api/cognitive-load/focus-preferences
   */
  async updateFocusPreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        console.error('No user ID found in focus preferences update request');
        res.status(401).json({ 
          error: 'Unauthorized - no user ID',
          details: 'User authentication required to update focus preferences'
        });
        return;
      }

      const updateData = req.body;
      
      // Validate focus duration
      if (updateData.preferredFocusDuration !== undefined) {
        if (typeof updateData.preferredFocusDuration !== 'number' || 
            updateData.preferredFocusDuration < 5 || 
            updateData.preferredFocusDuration > 120) {
          res.status(400).json({
            error: 'Invalid preferredFocusDuration',
            details: 'Preferred focus duration must be a number between 5 and 120 minutes'
          });
          return;
        }
      }

      // Validate break duration
      if (updateData.preferredBreakDuration !== undefined) {
        if (typeof updateData.preferredBreakDuration !== 'number' || 
            updateData.preferredBreakDuration < 1 || 
            updateData.preferredBreakDuration > 60) {
          res.status(400).json({
            error: 'Invalid preferredBreakDuration',
            details: 'Preferred break duration must be a number between 1 and 60 minutes'
          });
          return;
        }
      }

      console.log(`Updating focus preferences for user ${userId}`);
      const updatedPreferences = await this.cognitiveLoadService.updateUserFocusPreferences(userId, updateData);
      
      res.json(updatedPreferences);
    } catch (error) {
      console.error('Error updating focus preferences:', error);
      
      const errorResponse: CognitiveLoadError = {
        error: 'Failed to update focus preferences',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      res.status(500).json(errorResponse);
    }
  }

  /**
   * Get user productivity patterns
   * GET /api/cognitive-load/productivity-patterns
   */
  async getProductivityPatterns(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        console.error('No user ID found in productivity patterns request');
        res.status(401).json({ 
          error: 'Unauthorized - no user ID',
          details: 'User authentication required to access productivity patterns'
        });
        return;
      }

      console.log(`Getting productivity patterns for user ${userId}`);
      const patterns = await this.cognitiveLoadService.getUserProductivityPatterns(userId);
      
      res.json(patterns);
    } catch (error) {
      console.error('Error getting productivity patterns:', error);
      
      const errorResponse: CognitiveLoadError = {
        error: 'Failed to retrieve productivity patterns',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      res.status(500).json(errorResponse);
    }
  }

  /**
   * Health check for cognitive load service
   * GET /api/cognitive-load/health
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      res.json({
        status: 'healthy',
        service: 'cognitive-load',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    } catch (error) {
      console.error('Error in cognitive load health check:', error);
      res.status(500).json({
        status: 'unhealthy',
        service: 'cognitive-load',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
