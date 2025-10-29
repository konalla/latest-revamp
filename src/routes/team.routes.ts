import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { addMemberController, getMembers, searchUsersController } from "../controllers/team.controller.js";

const router = Router();

router.get("/team/members", authenticateToken, getMembers);
router.get("/team/search-users", authenticateToken, searchUsersController);
router.post("/team/members", authenticateToken, addMemberController);

export default router;


