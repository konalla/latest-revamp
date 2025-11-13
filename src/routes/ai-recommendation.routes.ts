import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import {
  generateTaskRecommendation,
  generateBulkTaskRecommendations,
  getTaskRecommendation,
  getTodayTasksWithAIRecommendations,
  getNowRecommendedTask,
  getUserWorkPreferences,
  updateUserWorkPreferences,
  getTasksWithAIRecommendations,
  getPastTasksWithAIRecommendations
} from "../controllers/ai-recommendation.controller.js";

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

/**
 * @route POST /api/ai-recommendations/generate
 * @desc Generate AI recommendation for a single task
 * @access Private
 */
router.post("/generate", generateTaskRecommendation);

/**
 * @route POST /api/ai-recommendations/generate-bulk
 * @desc Generate AI recommendations for multiple tasks
 * @access Private
 */
router.post("/generate-bulk", generateBulkTaskRecommendations);

/**
 * @route GET /api/ai-recommendations/task/:taskId
 * @desc Get AI recommendation for a specific task
 * @access Private
 */
router.get("/task/:taskId", getTaskRecommendation);

/**
 * @route GET /api/ai-recommendations/preferences
 * @desc Get user work preferences
 * @access Private
 */
router.get("/preferences", getUserWorkPreferences);

/**
 * @route PUT /api/ai-recommendations/preferences
 * @desc Update user work preferences
 * @access Private
 */
router.put("/preferences", updateUserWorkPreferences);

/**
 * @route GET /api/ai-recommendations/tasks
 * @desc Get tasks with AI recommendations
 * @access Private
 */
router.get("/tasks", getTasksWithAIRecommendations);

/**
 * @route GET /api/ai-recommendations/today-tasks
 * @desc Get today's tasks with AI recommendations, ranked by priority
 * @access Private
 */
router.get("/today-tasks", getTodayTasksWithAIRecommendations);

/**
 * @route GET /api/ai-recommendations/now
 * @desc Get task recommended for RIGHT NOW based on current time and AI recommendations
 * @access Private
 */
router.get("/now", getNowRecommendedTask);

/**
 * @route GET /api/ai-recommendations/past-tasks
 * @desc Get all past pending tasks with AI recommendations, ordered by priority (urgency, importance, due date)
 * @access Private
 */
router.get("/past-tasks", getPastTasksWithAIRecommendations);

export default router;
