import { Router } from 'express';
import {
  createPlan,
  getPlanById,
  getPlanWithDetails,
  getPlans,
  updatePlan,
  deletePlan,
  getPlanStats,
  getPlansForProject,
  getPlansForObjective
} from '../controllers/plan.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Plan CRUD operations
router.post('/', createPlan);
router.get('/', getPlans);
router.get('/stats', getPlanStats);
router.get('/:id', getPlanById);
router.get('/:id/details', getPlanWithDetails);
router.put('/:id', updatePlan);
router.delete('/:id', deletePlan);

// Get plans by project or objective
router.get('/project/:projectId', getPlansForProject);
router.get('/objective/:objectiveId', getPlansForObjective);

export default router;
