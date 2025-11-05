import { Router } from "express";
import { subscriptionController } from "../controllers/subscription.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

// Get user's subscription
router.get("/me", authenticateToken, subscriptionController.getMySubscription.bind(subscriptionController));

// Get available plans
router.get("/plans", subscriptionController.getAvailablePlans.bind(subscriptionController));

// Create checkout session
router.post("/checkout", authenticateToken, subscriptionController.createCheckoutSession.bind(subscriptionController));

// Cancel subscription
router.post("/cancel", authenticateToken, subscriptionController.cancelSubscription.bind(subscriptionController));

// Resume subscription
router.post("/resume", authenticateToken, subscriptionController.resumeSubscription.bind(subscriptionController));

// Get access status
router.get("/access", authenticateToken, subscriptionController.getAccessStatus.bind(subscriptionController));

// Check if can add team members
router.get("/can-add-team-members", authenticateToken, subscriptionController.canAddTeamMembers.bind(subscriptionController));

export default router;

