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
  getWorkspaceManagersController,
  searchWorkspaceManagersController
} from "../controllers/workspace.controller.js";
import {
  getWorkspaceProjectsController,
  getWorkspaceObjectivesController,
  getWorkspaceOkrsController,
  getWorkspaceTasksController,
  getWorkspaceContentSummaryController,
} from "../controllers/workspace-content.controller.js";
import {
  wsCreateProject, wsUpdateProject, wsDeleteProject,
  wsCreateObjective, wsUpdateObjective, wsDeleteObjective,
  wsCreateOkr, wsUpdateOkr, wsDeleteOkr,
  wsCreateTask, wsUpdateTask, wsDeleteTask, wsToggleTask, wsGetTaskWithRec,
} from "../controllers/workspace-content-crud.controller.js";
import * as userStatusController from "../controllers/user-status.controller.js";
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
router.get("/workspaces/:workspaceId/managers/search", authenticateToken, searchWorkspaceManagersController);
router.post("/workspaces/:workspaceId/managers", authenticateToken, requireWriteAccess, assignWorkspaceManagerController);
router.delete("/workspaces/:workspaceId/managers", authenticateToken, requireWriteAccess, removeWorkspaceManagerController);
router.get("/workspaces/:workspaceId/managers", authenticateToken, getWorkspaceManagersController);

// Workspace members status route
router.get("/workspaces/:workspaceId/members/status", authenticateToken, userStatusController.getWorkspaceMembersStatus);

// Workspace content routes (projects, objectives, OKRs, tasks scoped to workspace)
router.get("/workspaces/:workspaceId/content/summary", authenticateToken, getWorkspaceContentSummaryController);
router.get("/workspaces/:workspaceId/content/projects", authenticateToken, getWorkspaceProjectsController);
router.get("/workspaces/:workspaceId/content/objectives", authenticateToken, getWorkspaceObjectivesController);
router.get("/workspaces/:workspaceId/content/okrs", authenticateToken, getWorkspaceOkrsController);
router.get("/workspaces/:workspaceId/content/tasks", authenticateToken, getWorkspaceTasksController);

// Workspace content CRUD routes (create/update/delete scoped to workspace)
// Projects
router.post("/workspaces/:workspaceId/content/projects", authenticateToken, requireWriteAccess, wsCreateProject);
router.put("/workspaces/:workspaceId/content/projects/:itemId", authenticateToken, requireWriteAccess, wsUpdateProject);
router.delete("/workspaces/:workspaceId/content/projects/:itemId", authenticateToken, requireWriteAccess, wsDeleteProject);
// Objectives
router.post("/workspaces/:workspaceId/content/objectives", authenticateToken, requireWriteAccess, wsCreateObjective);
router.put("/workspaces/:workspaceId/content/objectives/:itemId", authenticateToken, requireWriteAccess, wsUpdateObjective);
router.delete("/workspaces/:workspaceId/content/objectives/:itemId", authenticateToken, requireWriteAccess, wsDeleteObjective);
// OKRs
router.post("/workspaces/:workspaceId/content/okrs", authenticateToken, requireWriteAccess, wsCreateOkr);
router.put("/workspaces/:workspaceId/content/okrs/:itemId", authenticateToken, requireWriteAccess, wsUpdateOkr);
router.delete("/workspaces/:workspaceId/content/okrs/:itemId", authenticateToken, requireWriteAccess, wsDeleteOkr);
// Tasks
router.post("/workspaces/:workspaceId/content/tasks", authenticateToken, requireWriteAccess, wsCreateTask);
router.put("/workspaces/:workspaceId/content/tasks/:itemId", authenticateToken, requireWriteAccess, wsUpdateTask);
router.put("/workspaces/:workspaceId/content/tasks/:itemId/toggle", authenticateToken, requireWriteAccess, wsToggleTask);
router.delete("/workspaces/:workspaceId/content/tasks/:itemId", authenticateToken, requireWriteAccess, wsDeleteTask);
router.get("/workspaces/:workspaceId/content/tasks/:itemId/detail", authenticateToken, wsGetTaskWithRec);

export default router;


