import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { addMemberController, getMembers, searchUsersController, removeMemberController, updateMemberStatusController } from "../controllers/team.controller.js";

const router = Router();

router.get("/team/members", authenticateToken, getMembers);
router.get("/team/search-users", authenticateToken, searchUsersController);
router.post("/team/members", authenticateToken, addMemberController);
router.delete("/team/members/:userId", authenticateToken, removeMemberController);
router.patch("/team/members/:userId/status", authenticateToken, updateMemberStatusController);

export default router;


