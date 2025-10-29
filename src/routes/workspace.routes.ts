import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { bootstrapMine, getMine, getMyTeamController, renameMyTeam, renameMyWorkspace } from "../controllers/workspace.controller.js";

const router = Router();

router.get("/workspace/me", authenticateToken, getMine);
router.get("/team/me", authenticateToken, getMyTeamController);
router.post("/workspace/bootstrap", authenticateToken, bootstrapMine);
router.patch("/workspace/name", authenticateToken, renameMyWorkspace);
router.patch("/team/name", authenticateToken, renameMyTeam);

export default router;


