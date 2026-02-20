import type { Request, Response } from "express";
import { adminService } from "../services/admin.service.js";
import type {
  AdminUserFilters,
  AdminProjectFilters,
  AdminTaskFilters,
  AdminOkrFilters,
  AdminObjectiveFilters,
  AdminWorkspaceFilters,
  AdminTeamFilters,
  AdminSubscriptionFilters,
  AdminRedemptionFilters,
} from "../services/admin.service.js";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { statusAssignmentService } from "../services/status-assignment.service.js";

export class AdminController {
  /**
   * Get all users
   * GET /api/admin/users
   */
  async getAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const filters: AdminUserFilters = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: (req.query.sortBy as string) || "created_at",
        sortOrder: (req.query.sortOrder as "asc" | "desc") || "desc",
        ...(req.query.search && { search: req.query.search as string }),
        ...(req.query.email && { email: req.query.email as string }),
        ...(req.query.username && { username: req.query.username as string }),
        ...(req.query.name && { name: req.query.name as string }),
        ...(req.query.role && { role: req.query.role as string }),
        ...(req.query.subscriptionStatus && { subscriptionStatus: req.query.subscriptionStatus as string }),
        ...(req.query.hasSubscription !== undefined && { hasSubscription: req.query.hasSubscription === "true" }),
        ...(req.query.createdAtFrom && { createdAtFrom: req.query.createdAtFrom as string }),
        ...(req.query.createdAtTo && { createdAtTo: req.query.createdAtTo as string }),
      };

      const result = await adminService.getAllUsers(filters);

      res.status(200).json({
        message: "Users retrieved successfully",
        data: result.users,
        pagination: {
          page: filters.page!,
          limit: filters.limit!,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.limit!),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to get users" });
    }
  }

  /**
   * Get user details
   * GET /api/admin/users/:id
   */
  async getUserDetails(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.id || '');
      if (isNaN(userId)) {
        res.status(400).json({ message: "Invalid user ID" });
        return;
      }

      const user = await adminService.getUserDetails(userId);
      res.status(200).json({ message: "User retrieved successfully", data: user });
    } catch (error: any) {
      if (error.message === "User not found") {
        res.status(404).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Failed to get user" });
      }
    }
  }

  /**
   * Get all projects
   * GET /api/admin/projects
   */
  async getAllProjects(req: Request, res: Response): Promise<void> {
    try {
      const filters: AdminProjectFilters = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: (req.query.sortBy as string) || "createdAt",
        sortOrder: (req.query.sortOrder as "asc" | "desc") || "desc",
        ...(req.query.search && { search: req.query.search as string }),
        ...(req.query.name && { name: req.query.name as string }),
        ...(req.query.status && { status: req.query.status as string }),
        ...(req.query.visibility && { visibility: req.query.visibility as string }),
        ...(req.query.userId && { userId: parseInt(req.query.userId as string) }),
        ...(req.query.workspaceId && { workspaceId: parseInt(req.query.workspaceId as string) }),
        ...(req.query.teamId && { teamId: parseInt(req.query.teamId as string) }),
        ...(req.query.createdAtFrom && { createdAtFrom: req.query.createdAtFrom as string }),
        ...(req.query.createdAtTo && { createdAtTo: req.query.createdAtTo as string }),
      };

      const result = await adminService.getAllProjects(filters);

      res.status(200).json({
        message: "Projects retrieved successfully",
        data: result.projects,
        pagination: {
          page: filters.page!,
          limit: filters.limit!,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.limit!),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to get projects" });
    }
  }

  /**
   * Get project details
   * GET /api/admin/projects/:id
   */
  async getProjectDetails(req: Request, res: Response): Promise<void> {
    try {
      const projectId = parseInt(req.params.id || '');
      if (isNaN(projectId)) {
        res.status(400).json({ message: "Invalid project ID" });
        return;
      }

      const project = await adminService.getProjectDetails(projectId);
      res.status(200).json({ message: "Project retrieved successfully", data: project });
    } catch (error: any) {
      if (error.message === "Project not found") {
        res.status(404).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Failed to get project" });
      }
    }
  }

  /**
   * Get all tasks
   * GET /api/admin/tasks
   */
  async getAllTasks(req: Request, res: Response): Promise<void> {
    try {
      const filters: AdminTaskFilters = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: (req.query.sortBy as string) || "createdAt",
        sortOrder: (req.query.sortOrder as "asc" | "desc") || "desc",
        ...(req.query.search && { search: req.query.search as string }),
        ...(req.query.title && { title: req.query.title as string }),
        ...(req.query.category && { category: req.query.category as string }),
        ...(req.query.priority && { priority: req.query.priority as string }),
        ...(req.query.completed !== undefined && { completed: req.query.completed === "true" }),
        ...(req.query.userId && { userId: parseInt(req.query.userId as string) }),
        ...(req.query.projectId && { projectId: parseInt(req.query.projectId as string) }),
        ...(req.query.objectiveId && { objectiveId: parseInt(req.query.objectiveId as string) }),
        ...(req.query.okrId && { okrId: parseInt(req.query.okrId as string) }),
        ...(req.query.workspaceId && { workspaceId: parseInt(req.query.workspaceId as string) }),
        ...(req.query.teamId && { teamId: parseInt(req.query.teamId as string) }),
        ...(req.query.importance !== undefined && { importance: req.query.importance === "true" }),
        ...(req.query.urgency !== undefined && { urgency: req.query.urgency === "true" }),
        ...(req.query.createdAtFrom && { createdAtFrom: req.query.createdAtFrom as string }),
        ...(req.query.createdAtTo && { createdAtTo: req.query.createdAtTo as string }),
      };

      const result = await adminService.getAllTasks(filters);

      res.status(200).json({
        message: "Tasks retrieved successfully",
        data: result.tasks,
        pagination: {
          page: filters.page!,
          limit: filters.limit!,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.limit!),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to get tasks" });
    }
  }

  /**
   * Get task details
   * GET /api/admin/tasks/:id
   */
  async getTaskDetails(req: Request, res: Response): Promise<void> {
    try {
      const taskId = parseInt(req.params.id || '');
      if (isNaN(taskId)) {
        res.status(400).json({ message: "Invalid task ID" });
        return;
      }

      const task = await adminService.getTaskDetails(taskId);
      res.status(200).json({ message: "Task retrieved successfully", data: task });
    } catch (error: any) {
      if (error.message === "Task not found") {
        res.status(404).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Failed to get task" });
      }
    }
  }

  /**
   * Get all OKRs
   * GET /api/admin/okrs
   */
  async getAllOkrs(req: Request, res: Response): Promise<void> {
    try {
      const filters: AdminOkrFilters = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: (req.query.sortBy as string) || "createdAt",
        sortOrder: (req.query.sortOrder as "asc" | "desc") || "desc",
        ...(req.query.search && { search: req.query.search as string }),
        ...(req.query.title && { title: req.query.title as string }),
        ...(req.query.status && { status: req.query.status as string }),
        ...(req.query.userId && { userId: parseInt(req.query.userId as string) }),
        ...(req.query.objectiveId && { objectiveId: parseInt(req.query.objectiveId as string) }),
        ...(req.query.planId && { planId: parseInt(req.query.planId as string) }),
        ...(req.query.workspaceId && { workspaceId: parseInt(req.query.workspaceId as string) }),
        ...(req.query.teamId && { teamId: parseInt(req.query.teamId as string) }),
        ...(req.query.createdAtFrom && { createdAtFrom: req.query.createdAtFrom as string }),
        ...(req.query.createdAtTo && { createdAtTo: req.query.createdAtTo as string }),
      };

      const result = await adminService.getAllOkrs(filters);

      res.status(200).json({
        message: "OKRs retrieved successfully",
        data: result.okrs,
        pagination: {
          page: filters.page!,
          limit: filters.limit!,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.limit!),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to get OKRs" });
    }
  }

  /**
   * Get OKR details
   * GET /api/admin/okrs/:id
   */
  async getOkrDetails(req: Request, res: Response): Promise<void> {
    try {
      const okrId = parseInt(req.params.id || '');
      if (isNaN(okrId)) {
        res.status(400).json({ message: "Invalid OKR ID" });
        return;
      }

      const okr = await adminService.getOkrDetails(okrId);
      res.status(200).json({ message: "OKR retrieved successfully", data: okr });
    } catch (error: any) {
      if (error.message === "OKR not found") {
        res.status(404).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Failed to get OKR" });
      }
    }
  }

  /**
   * Get all objectives
   * GET /api/admin/objectives
   */
  async getAllObjectives(req: Request, res: Response): Promise<void> {
    try {
      const filters: AdminObjectiveFilters = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: (req.query.sortBy as string) || "created_at",
        sortOrder: (req.query.sortOrder as "asc" | "desc") || "desc",
        ...(req.query.search && { search: req.query.search as string }),
        ...(req.query.name && { name: req.query.name as string }),
        ...(req.query.status && { status: req.query.status as string }),
        ...(req.query.userId && { userId: parseInt(req.query.userId as string) }),
        ...(req.query.projectId && { projectId: parseInt(req.query.projectId as string) }),
        ...(req.query.workspaceId && { workspaceId: parseInt(req.query.workspaceId as string) }),
        ...(req.query.teamId && { teamId: parseInt(req.query.teamId as string) }),
        ...(req.query.createdAtFrom && { createdAtFrom: req.query.createdAtFrom as string }),
        ...(req.query.createdAtTo && { createdAtTo: req.query.createdAtTo as string }),
      };

      const result = await adminService.getAllObjectives(filters);

      res.status(200).json({
        message: "Objectives retrieved successfully",
        data: result.objectives,
        pagination: {
          page: filters.page!,
          limit: filters.limit!,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.limit!),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to get objectives" });
    }
  }

  /**
   * Get objective details
   * GET /api/admin/objectives/:id
   */
  async getObjectiveDetails(req: Request, res: Response): Promise<void> {
    try {
      const objectiveId = parseInt(req.params.id || '');
      if (isNaN(objectiveId)) {
        res.status(400).json({ message: "Invalid objective ID" });
        return;
      }

      const objective = await adminService.getObjectiveDetails(objectiveId);
      res.status(200).json({ message: "Objective retrieved successfully", data: objective });
    } catch (error: any) {
      if (error.message === "Objective not found") {
        res.status(404).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Failed to get objective" });
      }
    }
  }

  /**
   * Get all workspaces
   * GET /api/admin/workspaces
   */
  async getAllWorkspaces(req: Request, res: Response): Promise<void> {
    try {
      const filters: AdminWorkspaceFilters = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: (req.query.sortBy as string) || "createdAt",
        sortOrder: (req.query.sortOrder as "asc" | "desc") || "desc",
        ...(req.query.search && { search: req.query.search as string }),
        ...(req.query.name && { name: req.query.name as string }),
        ...(req.query.ownerId && { ownerId: parseInt(req.query.ownerId as string) }),
        ...(req.query.createdAtFrom && { createdAtFrom: req.query.createdAtFrom as string }),
        ...(req.query.createdAtTo && { createdAtTo: req.query.createdAtTo as string }),
      };

      const result = await adminService.getAllWorkspaces(filters);

      res.status(200).json({
        message: "Workspaces retrieved successfully",
        data: result.workspaces,
        pagination: {
          page: filters.page!,
          limit: filters.limit!,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.limit!),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to get workspaces" });
    }
  }

  /**
   * Get workspace details
   * GET /api/admin/workspaces/:id
   */
  async getWorkspaceDetails(req: Request, res: Response): Promise<void> {
    try {
      const workspaceId = parseInt(req.params.id || '');
      if (isNaN(workspaceId)) {
        res.status(400).json({ message: "Invalid workspace ID" });
        return;
      }

      const workspace = await adminService.getWorkspaceDetails(workspaceId);
      res.status(200).json({ message: "Workspace retrieved successfully", data: workspace });
    } catch (error: any) {
      if (error.message === "Workspace not found") {
        res.status(404).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Failed to get workspace" });
      }
    }
  }

  /**
   * Get all teams
   * GET /api/admin/teams
   */
  async getAllTeams(req: Request, res: Response): Promise<void> {
    try {
      const filters: AdminTeamFilters = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: (req.query.sortBy as string) || "createdAt",
        sortOrder: (req.query.sortOrder as "asc" | "desc") || "desc",
        ...(req.query.search && { search: req.query.search as string }),
        ...(req.query.name && { name: req.query.name as string }),
        ...(req.query.workspaceId && { workspaceId: parseInt(req.query.workspaceId as string) }),
        ...(req.query.createdAtFrom && { createdAtFrom: req.query.createdAtFrom as string }),
        ...(req.query.createdAtTo && { createdAtTo: req.query.createdAtTo as string }),
      };

      const result = await adminService.getAllTeams(filters);

      res.status(200).json({
        message: "Teams retrieved successfully",
        data: result.teams,
        pagination: {
          page: filters.page!,
          limit: filters.limit!,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.limit!),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to get teams" });
    }
  }

  /**
   * Get team details
   * GET /api/admin/teams/:id
   */
  async getTeamDetails(req: Request, res: Response): Promise<void> {
    try {
      const teamId = parseInt(req.params.id || '');
      if (isNaN(teamId)) {
        res.status(400).json({ message: "Invalid team ID" });
        return;
      }

      const team = await adminService.getTeamDetails(teamId);
      res.status(200).json({ message: "Team retrieved successfully", data: team });
    } catch (error: any) {
      if (error.message === "Team not found") {
        res.status(404).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Failed to get team" });
      }
    }
  }

  /**
   * Get all subscriptions
   * GET /api/admin/subscriptions
   */
  async getAllSubscriptions(req: Request, res: Response): Promise<void> {
    try {
      const filters: AdminSubscriptionFilters = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: (req.query.sortBy as string) || "createdAt",
        sortOrder: (req.query.sortOrder as "asc" | "desc") || "desc",
        ...(req.query.status && { status: req.query.status as string }),
        ...(req.query.subscriptionPlanId && { subscriptionPlanId: parseInt(req.query.subscriptionPlanId as string) }),
        ...(req.query.userId && { userId: parseInt(req.query.userId as string) }),
        ...(req.query.createdAtFrom && { createdAtFrom: req.query.createdAtFrom as string }),
        ...(req.query.createdAtTo && { createdAtTo: req.query.createdAtTo as string }),
      };

      const result = await adminService.getAllSubscriptions(filters);

      res.status(200).json({
        message: "Subscriptions retrieved successfully",
        data: result.subscriptions,
        pagination: {
          page: filters.page!,
          limit: filters.limit!,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.limit!),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to get subscriptions" });
    }
  }

  /**
   * Get subscription details
   * GET /api/admin/subscriptions/:id
   */
  async getSubscriptionDetails(req: Request, res: Response): Promise<void> {
    try {
      const subscriptionId = parseInt(req.params.id || '');
      if (isNaN(subscriptionId)) {
        res.status(400).json({ message: "Invalid subscription ID" });
        return;
      }

      const subscription = await adminService.getSubscriptionDetails(subscriptionId);
      res.status(200).json({
        message: "Subscription retrieved successfully",
        data: subscription,
      });
    } catch (error: any) {
      if (error.message === "Subscription not found") {
        res.status(404).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Failed to get subscription" });
      }
    }
  }

  /**
   * Get dashboard statistics
   * GET /api/admin/dashboard/stats
   */
  async getDashboardStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await adminService.getDashboardStats();
      res.status(200).json({ message: "Dashboard stats retrieved successfully", data: stats });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to get dashboard stats" });
    }
  }

  // ============================================
  // Redeemable Items Management
  // ============================================

  /**
   * Get all redeemable items
   * GET /api/admin/redeemable-items
   */
  async getAllRedeemableItems(req: Request, res: Response): Promise<void> {
    try {
      const filters = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: (req.query.sortBy as string) || "sortOrder",
        sortOrder: (req.query.sortOrder as "asc" | "desc") || "asc",
        ...(req.query.search && { search: req.query.search as string }),
      };

      const result = await adminService.getAllRedeemableItems(filters);

      res.status(200).json({
        message: "Redeemable items retrieved successfully",
        data: result.items,
        pagination: {
          page: filters.page!,
          limit: filters.limit!,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.limit!),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to get redeemable items" });
    }
  }

  /**
   * Get redeemable item by ID
   * GET /api/admin/redeemable-items/:id
   */
  async getRedeemableItemById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        res.status(400).json({ message: "Invalid item ID" });
        return;
      }

      const item = await adminService.getRedeemableItemById(id);
      res.status(200).json({ message: "Redeemable item retrieved successfully", data: item });
    } catch (error: any) {
      if (error.message === "Redeemable item not found") {
        res.status(404).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Failed to get redeemable item" });
      }
    }
  }

  /**
   * Create a new redeemable item
   * POST /api/admin/redeemable-items
   * Supports multipart/form-data with image upload
   */
  async createRedeemableItem(req: Request, res: Response): Promise<void> {
    try {
      const { name, description, requiredCredits, isActive, sortOrder, variantOptions } = req.body;

      if (!name || !requiredCredits) {
        res.status(400).json({
          message: "Name and requiredCredits are required",
        });
        return;
      }

      if (requiredCredits <= 0) {
        res.status(400).json({
          message: "Required credits must be greater than 0",
        });
        return;
      }

      let imageUrl: string | undefined = undefined;

      // Handle image upload if provided
      if (req.file) {
        // Ensure uploads directory exists
        const uploadsDir = path.join(process.cwd(), "uploads", "redeemable-items");
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // Generate unique filename
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const filename = `item_${timestamp}_${randomSuffix}.jpg`;
        const filePath = path.join(uploadsDir, filename);

        // Process image: resize, compress, and convert to JPEG
        await sharp(req.file.buffer)
          .resize(1200, 1200, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({
            quality: 85,
            mozjpeg: true,
          })
          .toFile(filePath);

        // Generate the image URL path
        imageUrl = `/uploads/redeemable-items/${filename}`;
      }

      // Parse variantOptions if it's a string (from form data)
      let parsedVariantOptions: Record<string, any> | undefined = undefined;
      if (variantOptions) {
        try {
          parsedVariantOptions =
            typeof variantOptions === "string" ? JSON.parse(variantOptions) : variantOptions;
        } catch (e) {
          // If parsing fails, treat as empty object
          parsedVariantOptions = {};
        }
      }

      const item = await adminService.createRedeemableItem({
        name,
        description,
        ...(imageUrl !== undefined && { imageUrl }),
        requiredCredits: parseInt(requiredCredits),
        isActive: isActive === "true" || isActive === true,
        ...(sortOrder && { sortOrder: parseInt(sortOrder) }),
        ...(parsedVariantOptions !== undefined && { variantOptions: parsedVariantOptions }),
      });

      res.status(201).json({
        message: "Redeemable item created successfully",
        data: item,
      });
    } catch (error: any) {
      if (error.message.includes("already exists")) {
        res.status(409).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Failed to create redeemable item" });
      }
    }
  }

  /**
   * Update a redeemable item
   * PUT /api/admin/redeemable-items/:id
   * Supports multipart/form-data with image upload
   */
  async updateRedeemableItem(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        res.status(400).json({ message: "Invalid item ID" });
        return;
      }

      const { name, description, requiredCredits, isActive, sortOrder, variantOptions } = req.body;

      if (requiredCredits !== undefined && requiredCredits <= 0) {
        res.status(400).json({
          message: "Required credits must be greater than 0",
        });
        return;
      }

      let imageUrl: string | undefined = undefined;

      // Handle image upload if provided
      if (req.file) {
        // Ensure uploads directory exists
        const uploadsDir = path.join(process.cwd(), "uploads", "redeemable-items");
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // Generate unique filename
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const filename = `item_${timestamp}_${randomSuffix}.jpg`;
        const filePath = path.join(uploadsDir, filename);

        // Process image: resize, compress, and convert to JPEG
        await sharp(req.file.buffer)
          .resize(1200, 1200, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({
            quality: 85,
            mozjpeg: true,
          })
          .toFile(filePath);

        // Generate the image URL path
        imageUrl = `/uploads/redeemable-items/${filename}`;
      }

      // Parse variantOptions if it's a string (from form data)
      let parsedVariantOptions: Record<string, any> | undefined = undefined;
      if (variantOptions !== undefined) {
        try {
          parsedVariantOptions =
            typeof variantOptions === "string" ? JSON.parse(variantOptions) : variantOptions;
        } catch (e) {
          // If parsing fails, treat as empty object
          parsedVariantOptions = {};
        }
      }

      const item = await adminService.updateRedeemableItem(id, {
        name,
        description,
        ...(imageUrl !== undefined && { imageUrl }),
        ...(requiredCredits !== undefined && { requiredCredits: parseInt(requiredCredits) }),
        ...(isActive !== undefined && { isActive: isActive === "true" || isActive === true }),
        ...(sortOrder !== undefined && { sortOrder: parseInt(sortOrder) }),
        ...(parsedVariantOptions !== undefined && { variantOptions: parsedVariantOptions }),
      });

      res.status(200).json({
        message: "Redeemable item updated successfully",
        data: item,
      });
    } catch (error: any) {
      if (error.message === "Redeemable item not found") {
        res.status(404).json({ message: error.message });
      } else if (error.message.includes("already exists")) {
        res.status(409).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Failed to update redeemable item" });
      }
    }
  }

  /**
   * Delete a redeemable item
   * DELETE /api/admin/redeemable-items/:id
   */
  async deleteRedeemableItem(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        res.status(400).json({ message: "Invalid item ID" });
        return;
      }

      await adminService.deleteRedeemableItem(id);
      res.status(200).json({ message: "Redeemable item deleted successfully" });
    } catch (error: any) {
      if (error.message === "Redeemable item not found") {
        res.status(404).json({ message: error.message });
      } else if (error.message.includes("Cannot delete")) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Failed to delete redeemable item" });
      }
    }
  }

  // ============================================
  // Redemptions Management
  // ============================================

  /**
   * Get all redemptions
   * GET /api/admin/redemptions
   */
  async getAllRedemptions(req: Request, res: Response): Promise<void> {
    try {
      const filters: AdminRedemptionFilters = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: (req.query.sortBy as string) || "createdAt",
        sortOrder: (req.query.sortOrder as "asc" | "desc") || "desc",
        ...(req.query.search && { search: req.query.search as string }),
        ...(req.query.status && { status: req.query.status as string }),
        ...(req.query.userId && { userId: parseInt(req.query.userId as string) }),
        ...(req.query.redeemableItemId && {
          redeemableItemId: parseInt(req.query.redeemableItemId as string),
        }),
        ...(req.query.createdAtFrom && { createdAtFrom: req.query.createdAtFrom as string }),
        ...(req.query.createdAtTo && { createdAtTo: req.query.createdAtTo as string }),
      };

      const result = await adminService.getAllRedemptions(filters);

      res.status(200).json({
        message: "Redemptions retrieved successfully",
        data: result.redemptions,
        pagination: {
          page: filters.page!,
          limit: filters.limit!,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.limit!),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to get redemptions" });
    }
  }

  /**
   * Get redemption by ID
   * GET /api/admin/redemptions/:id
   */
  async getRedemptionById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        res.status(400).json({ message: "Invalid redemption ID" });
        return;
      }

      const redemption = await adminService.getRedemptionById(id);
      res.status(200).json({ message: "Redemption retrieved successfully", data: redemption });
    } catch (error: any) {
      if (error.message === "Redemption not found") {
        res.status(404).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Failed to get redemption" });
      }
    }
  }

  /**
   * Update redemption status
   * PATCH /api/admin/redemptions/:id/status
   */
  async updateRedemptionStatus(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        res.status(400).json({ message: "Invalid redemption ID" });
        return;
      }

      const { status, fulfillmentNotes } = req.body;

      if (status && !["PENDING", "FULFILLED", "CANCELLED"].includes(status)) {
        res.status(400).json({
          message: "Invalid status. Must be one of: PENDING, FULFILLED, CANCELLED",
        });
        return;
      }

      const redemption = await adminService.updateRedemptionStatus(id, {
        status,
        fulfillmentNotes,
      });

      res.status(200).json({
        message: "Redemption status updated successfully",
        data: redemption,
      });
    } catch (error: any) {
      if (error.message === "Redemption not found") {
        res.status(404).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Failed to update redemption status" });
      }
    }
  }

  /**
   * Assign Origin badge to a user
   * POST /api/admin/users/:id/assign-origin-badge
   */
  async assignOriginBadge(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.id || '');
      if (isNaN(userId)) {
        res.status(400).json({ message: "Invalid user ID" });
        return;
      }

      const result = await statusAssignmentService.assignOriginStatus(userId);

      if (!result.success) {
        res.status(400).json({ message: result.message });
        return;
      }

      res.status(200).json({
        message: result.message,
        data: { userId, badge: "ORIGIN" },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to assign Origin badge" });
    }
  }
}

export const adminController = new AdminController();



