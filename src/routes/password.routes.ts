/**
 * Password Routes
 * 
 * @module routes/password
 */

import { Router } from "express";
import * as passwordController from "../controllers/password.controller.js";

const router = Router();

// Get password requirements (public endpoint)
router.get("/requirements", passwordController.getPasswordRequirements);

export default router;
