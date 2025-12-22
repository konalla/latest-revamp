import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { addMemberController, getMembers, searchUsersController, removeMemberController, updateMemberStatusController, getTeamByIdController, updateMemberRoleController, getUserTeamsController } from "../controllers/team.controller.js";
import * as userStatusController from "../controllers/user-status.controller.js";

const router = Router();

// Team member management routes - all require teamId
router.get("/team/:teamId", authenticateToken, getTeamByIdController);
router.get("/team/:teamId/members", authenticateToken, getMembers);
router.get("/team/:teamId/search-users", authenticateToken, searchUsersController);
router.post("/team/:teamId/members", authenticateToken, addMemberController);
router.delete("/team/:teamId/members/:userId", authenticateToken, removeMemberController);
router.patch("/team/:teamId/members/:userId/status", authenticateToken, updateMemberStatusController);
router.patch("/team/:teamId/members/:userId/role", authenticateToken, updateMemberRoleController);

// Get teams for a specific user (workspace owner only)
router.get("/workspace/users/:userId/teams", authenticateToken, getUserTeamsController);

// Team members status route
router.get("/team/:teamId/members/status", authenticateToken, userStatusController.getTeamMembersStatus);

export default router;


