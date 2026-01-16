import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import * as redemptionController from "../controllers/redemption.controller.js";

const router = Router();

// All redemption endpoints require authentication
router.use(authenticateToken);

router.get("/items", redemptionController.getAvailableItems);
router.post("/redeem", redemptionController.redeemItem);
router.get("/history", redemptionController.getUserRedemptions);
router.get("/:id", redemptionController.getRedemptionById);

export default router;

