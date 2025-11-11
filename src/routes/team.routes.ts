import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { addMemberController, getMembers, searchUsersController, removeMemberController, updateMemberStatusController } from "../controllers/team.controller.js";

const router = Router();

// Team member management routes - all require teamId
router.get("/team/:teamId/members", authenticateToken, getMembers);
router.get("/team/:teamId/search-users", authenticateToken, searchUsersController);
router.post("/team/:teamId/members", authenticateToken, addMemberController);
router.delete("/team/:teamId/members/:userId", authenticateToken, removeMemberController);
router.patch("/team/:teamId/members/:userId/status", authenticateToken, updateMemberStatusController);

export default router;


