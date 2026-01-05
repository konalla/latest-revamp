import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import * as walletController from "../controllers/wallet.controller.js";

const router = Router();

// All wallet endpoints require authentication
router.use(authenticateToken);

router.get("/balance", walletController.getWalletBalance);
router.get("/transactions", walletController.getTransactionHistory);
router.get("/stats", walletController.getWalletStats);

export default router;

