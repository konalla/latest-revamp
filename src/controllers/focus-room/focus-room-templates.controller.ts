import type { Request, Response } from "express";
import { focusRoomTemplateService } from "../../services/focus-room-template.service.js";
import { createTemplateSchema, createRoomFromTemplateSchema, updateTemplateSchema } from "../../types/focus-room.types.js";
import type {
  GetTemplatesResponse,
  GetAllTemplatesResponse,
  GetTemplateResponse,
  CreateTemplateResponse,
  CreateRoomFromTemplateResponse,
} from "../../types/focus-room-response.types.js";
import { parseTemplateId } from "../../utils/focus-room.utils.js";

/**
 * Focus Room Templates Controller
 * Handles template management: system templates, user templates, and room creation from templates
 */

export const getSystemTemplates = async (req: Request, res: Response): Promise<void> => {
  try {
    const templates = await focusRoomTemplateService.getSystemTemplates();

    const response: GetTemplatesResponse = {
      success: true,
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        focusDuration: t.focusDuration,
        breakDuration: t.breakDuration,
        allowObservers: t.allowObservers,
        usageCount: t.usageCount,
      })),
    };

    res.json(response);
  } catch (error: unknown) {
    console.error("Error fetching templates:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch templates",
    });
  }
};

export const getAllTemplates = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const templates = await focusRoomTemplateService.getAllAvailableTemplates(userId);

    const response: GetAllTemplatesResponse = {
      success: true,
      templates: {
        system: templates.system.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          focusDuration: t.focusDuration,
          breakDuration: t.breakDuration,
          allowObservers: t.allowObservers,
          usageCount: t.usageCount,
        })),
        user: templates.user.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          focusDuration: t.focusDuration,
          breakDuration: t.breakDuration,
          allowObservers: t.allowObservers,
          usageCount: t.usageCount,
          createdAt: t.createdAt,
          visibility: t.visibility,
        })),
        public: templates.public.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          focusDuration: t.focusDuration,
          breakDuration: t.breakDuration,
          allowObservers: t.allowObservers,
          usageCount: t.usageCount,
          createdAt: t.createdAt,
        })),
      },
    };

    res.json(response);
  } catch (error: unknown) {
    console.error("Error fetching templates:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch templates",
    });
  }
};

export const getTemplateById = async (req: Request, res: Response): Promise<void> => {
  try {
    const templateId = parseTemplateId(req.params.templateId);
    if (templateId === null) {
      res.status(400).json({ success: false, error: "Invalid template ID" });
      return;
    }

    const template = await focusRoomTemplateService.getTemplateById(templateId);

    if (!template) {
      res.status(404).json({ success: false, error: "Template not found" });
      return;
    }

    const response: GetTemplateResponse = {
      success: true,
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        focusDuration: template.focusDuration,
        breakDuration: template.breakDuration,
        allowObservers: template.allowObservers,
        visibility: template.visibility,
        usageCount: template.usageCount,
        creator: template.creator ? (() => {
          const creatorObj: { id: number; name: string; email?: string } = {
            id: template.creator.id,
            name: template.creator.name,
          };
          const email = (template.creator as { email?: string; username?: string }).email;
          if (email) {
            creatorObj.email = email;
          }
          return creatorObj;
        })() : undefined,
      },
    };

    res.json(response);
  } catch (error: unknown) {
    console.error("Error fetching template:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch template",
    });
  }
};

export const createTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const validatedData = createTemplateSchema.parse(req.body);
    const template = await focusRoomTemplateService.createTemplate(userId, validatedData);

    const response: CreateTemplateResponse = {
      success: true,
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        focusDuration: template.focusDuration,
        breakDuration: template.breakDuration,
        allowObservers: template.allowObservers,
        createdAt: template.createdAt,
      },
    };

    res.status(201).json(response);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid template data",
        details: (error as unknown as { errors: unknown }).errors,
      });
      return;
    }

    console.error("Error creating template:", error);
    const message = error instanceof Error ? error.message : "Failed to create template";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const createRoomFromTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const templateId = parseTemplateId(req.params.templateId);
    if (templateId === null) {
      res.status(400).json({ success: false, error: "Invalid template ID" });
      return;
    }

    const validatedData = createRoomFromTemplateSchema.parse(req.body);
    const room = await focusRoomTemplateService.createRoomFromTemplate(templateId, userId, validatedData);

    const response: CreateRoomFromTemplateResponse = {
      success: true,
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        visibility: room.visibility,
        focusDuration: room.focusDuration,
        breakDuration: room.breakDuration,
        allowObservers: room.allowObservers,
        requiresPassword: room.requiresPassword,
        status: room.status,
        createdAt: room.createdAt,
      },
      roomId: room.id,
    };

    res.status(201).json(response);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid room data",
        details: (error as unknown as { errors: unknown }).errors,
      });
      return;
    }

    console.error("Error creating room from template:", error);
    const message = error instanceof Error ? error.message : "Failed to create room from template";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const updateTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const templateId = parseTemplateId(req.params.templateId);
    if (templateId === null) {
      res.status(400).json({ success: false, error: "Invalid template ID" });
      return;
    }

    const validatedData = updateTemplateSchema.parse(req.body) as Parameters<typeof focusRoomTemplateService.updateTemplate>[2];
    const template = await focusRoomTemplateService.updateTemplate(templateId, userId, validatedData);

    const response: CreateTemplateResponse = {
      success: true,
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        focusDuration: template.focusDuration,
        breakDuration: template.breakDuration,
        allowObservers: template.allowObservers,
        createdAt: template.createdAt,
      },
    };

    res.json(response);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      res.status(400).json({
        success: false,
        error: "Invalid template data",
        details: (error as unknown as { errors: unknown }).errors,
      });
      return;
    }

    console.error("Error updating template:", error);
    const message = error instanceof Error ? error.message : "Failed to update template";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};

export const deleteTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const templateId = parseTemplateId(req.params.templateId);
    if (templateId === null) {
      res.status(400).json({ success: false, error: "Invalid template ID" });
      return;
    }

    await focusRoomTemplateService.deleteTemplate(templateId, userId);

    res.json({ success: true, message: "Template deleted successfully" });
  } catch (error: unknown) {
    console.error("Error deleting template:", error);
    const message = error instanceof Error ? error.message : "Failed to delete template";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
};