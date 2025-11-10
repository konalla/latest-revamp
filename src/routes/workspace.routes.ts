import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { bootstrapMine, getMine, getMyTeamController, renameMyTeam, renameMyWorkspace, createWorkspaceAndTeamController, createTeamController, updateTeamController, deleteTeamController, getTeamsInWorkspaceController } from "../controllers/workspace.controller.js";

const router = Router();

router.get("/workspace/me", authenticateToken, getMine);
router.get("/team/me", authenticateToken, getMyTeamController);
router.post("/workspace/bootstrap", authenticateToken, bootstrapMine);
router.post("/workspace/create", authenticateToken, createWorkspaceAndTeamController);
router.patch("/workspace/name", authenticateToken, renameMyWorkspace);
router.patch("/team/name", authenticateToken, renameMyTeam);

// Team management routes (workspace owner only)
router.get("/workspace/teams", authenticateToken, getTeamsInWorkspaceController);
router.post("/workspace/teams", authenticateToken, createTeamController);
router.patch("/workspace/teams/:teamId", authenticateToken, updateTeamController);
router.delete("/workspace/teams/:teamId", authenticateToken, deleteTeamController);

export default router;


