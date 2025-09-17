import { Router } from "express";
import * as userController from "../controllers/user.controller";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

// Public routes
router.post("/", userController.createUser);
router.get("/", userController.getUsers);
router.get("/:id", userController.getUser);

// Protected routes (require JWT token)
router.get("/me", authenticateToken, userController.getCurrentUser);
router.put("/:id", authenticateToken, userController.updateUser);
router.delete("/:id", authenticateToken, userController.deleteUser);

export default router;
