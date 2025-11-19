import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { 
  bootstrapMine, 
  getMine, 
  getAllWorkspacesController,
  getWorkspaceByIdController,
  getMyTeamController, 
  renameMyTeam, 
  renameMyWorkspace, 
  createWorkspaceAndTeamController,
  createWorkspaceController,
  updateWorkspaceController,
  deleteWorkspaceController,
  createTeamController, 
  updateTeamController, 
  deleteTeamController, 
  getTeamsInWorkspaceController,
  assignWorkspaceManagerController,
  removeWorkspaceManagerController,
  getWorkspaceManagersController
} from "../controllers/workspace.controller.js";
import { requireWriteAccess } from "../middleware/subscription.middleware.js";

const router = Router();

// Legacy routes (for backward compatibility)
router.get("/workspace/me", authenticateToken, getMine);
router.get("/team/me", authenticateToken, getMyTeamController);
router.post("/workspace/bootstrap", authenticateToken, bootstrapMine);
router.post("/workspace/create", authenticateToken, requireWriteAccess, createWorkspaceAndTeamController);
router.patch("/workspace/name", authenticateToken, requireWriteAccess, renameMyWorkspace);
router.patch("/team/name", authenticateToken, requireWriteAccess, renameMyTeam);

// Workspace CRUD routes
router.get("/workspaces", authenticateToken, getAllWorkspacesController);
router.get("/workspaces/:workspaceId", authenticateToken, getWorkspaceByIdController);
router.post("/workspaces", authenticateToken, requireWriteAccess, createWorkspaceController);
router.patch("/workspaces/:workspaceId", authenticateToken, requireWriteAccess, updateWorkspaceController);
router.delete("/workspaces/:workspaceId", authenticateToken, requireWriteAccess, deleteWorkspaceController);

// Team management routes (workspace owner only)
router.get("/workspace/teams", authenticateToken, getTeamsInWorkspaceController);
router.post("/workspace/teams", authenticateToken, createTeamController);
router.patch("/workspace/teams/:teamId", authenticateToken, updateTeamController);
router.delete("/workspace/teams/:teamId", authenticateToken, deleteTeamController);

// Workspace manager management routes (workspace owner/admin only)
router.post("/workspaces/:workspaceId/managers", authenticateToken, requireWriteAccess, assignWorkspaceManagerController);
router.delete("/workspaces/:workspaceId/managers", authenticateToken, requireWriteAccess, removeWorkspaceManagerController);
router.get("/workspaces/:workspaceId/managers", authenticateToken, getWorkspaceManagersController);

export default router;


