import type { Request, Response } from "express";
import { PlanService } from '../services/plan.service';
import prisma from '../config/prisma';
import type { 
  CreatePlanRequest, 
  UpdatePlanRequest, 
  PlanQueryParams 
} from '../types/plan.types';

const planService = new PlanService(prisma);

export const createPlan = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const data: CreatePlanRequest = req.body;
    
    // Validate required fields
    if (!data.name || !data.projectId || !data.objectiveId) {
      return res.status(400).json({ 
        error: 'Name, projectId, and objectiveId are required' 
      });
    }

    const plan = await planService.createPlan(userId, data);
    res.status(201).json(plan);
  } catch (error: any) {
    console.error('Error creating plan:', error);
    res.status(400).json({ error: error.message });
  }
};

export const getPlanById = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const planId = parseInt(req.params.id);

    if (!planId || isNaN(planId)) {
      return res.status(400).json({ error: 'Valid plan ID is required' });
    }

    const plan = await planService.getPlanById(planId, userId);
    
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    res.json(plan);
  } catch (error: any) {
    console.error('Error getting plan:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getPlanWithDetails = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const planId = parseInt(req.params.id);

    if (!planId || isNaN(planId)) {
      return res.status(400).json({ error: 'Valid plan ID is required' });
    }

    const plan = await planService.getPlanWithDetails(planId, userId);
    
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    res.json(plan);
  } catch (error: any) {
    console.error('Error getting plan details:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getPlans = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const queryParams: PlanQueryParams = {
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      status: req.query.status as string,
      search: req.query.search as string,
      projectId: req.query.projectId ? parseInt(req.query.projectId as string) : undefined,
      objectiveId: req.query.objectiveId ? parseInt(req.query.objectiveId as string) : undefined,
      sortBy: req.query.sortBy as any,
      sortOrder: req.query.sortOrder as any,
    };

    const result = await planService.getPlans(userId, queryParams);
    res.json(result);
  } catch (error: any) {
    console.error('Error getting plans:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updatePlan = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const planId = parseInt(req.params.id);
    if (!planId || isNaN(planId)) {
      return res.status(400).json({ error: 'Valid plan ID is required' });
    }

    const data: UpdatePlanRequest = req.body;
    const plan = await planService.updatePlan(planId, userId, data);
    
    res.json(plan);
  } catch (error: any) {
    console.error('Error updating plan:', error);
    if (error.message === 'Plan not found or access denied') {
      return res.status(404).json({ error: error.message });
    }
    res.status(400).json({ error: error.message });
  }
};

export const deletePlan = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const planId = parseInt(req.params.id);
    if (!planId || isNaN(planId)) {
      return res.status(400).json({ error: 'Valid plan ID is required' });
    }

    await planService.deletePlan(planId, userId);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting plan:', error);
    if (error.message === 'Plan not found or access denied') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
};

export const getPlanStats = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const stats = await planService.getPlanStats(userId);
    res.json(stats);
  } catch (error: any) {
    console.error('Error getting plan stats:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getPlansForProject = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const projectId = parseInt(req.params.projectId);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ error: 'Valid project ID is required' });
    }

    const plans = await planService.getPlansForProject(projectId, userId);
    res.json(plans);
  } catch (error: any) {
    console.error('Error getting plans for project:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getPlansForObjective = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const objectiveId = parseInt(req.params.objectiveId);
    if (!objectiveId || isNaN(objectiveId)) {
      return res.status(400).json({ error: 'Valid objective ID is required' });
    }

    const plans = await planService.getPlansForObjective(objectiveId, userId);
    res.json(plans);
  } catch (error: any) {
    console.error('Error getting plans for objective:', error);
    res.status(500).json({ error: error.message });
  }
};
