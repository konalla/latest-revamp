import prisma from "../config/prisma.js";
import type { CreateTemplateInput, CreateRoomFromTemplateInput } from "../types/focus-room.types.js";
import { focusRoomService } from "./focus-room.service.js";

export class FocusRoomTemplateService {
  /**
   * Get all system templates
   */
  async getSystemTemplates() {
    return prisma.focusRoomTemplate.findMany({
      where: {
        isSystem: true,
      },
      orderBy: [
        { category: "asc" },
        { name: "asc" },
      ],
    });
  }

  /**
   * Get all templates available to user (system + user's templates)
   */
  async getAllAvailableTemplates(userId: number) {
    const [systemTemplates, userTemplates] = await Promise.all([
      this.getSystemTemplates(),
      this.getUserTemplates(userId),
    ]);

    return {
      system: systemTemplates,
      user: userTemplates,
    };
  }

  /**
   * Get user's templates
   */
  async getUserTemplates(userId: number) {
    return prisma.focusRoomTemplate.findMany({
      where: {
        creatorId: userId,
        isSystem: false,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  /**
   * Get template by ID
   */
  async getTemplateById(templateId: number) {
    return prisma.focusRoomTemplate.findUnique({
      where: { id: templateId },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    });
  }

  /**
   * Create a new template
   */
  async createTemplate(userId: number, data: CreateTemplateInput) {
    return prisma.focusRoomTemplate.create({
      data: {
        name: data.name,
        ...(data.description !== undefined && { description: data.description }),
        creatorId: userId,
        category: data.category,
        focusDuration: data.focusDuration,
        breakDuration: data.breakDuration,
        allowObservers: data.allowObservers,
        visibility: data.visibility,
        settings: {},
        isSystem: false,
      },
    });
  }

  /**
   * Update template (creator only)
   */
  async updateTemplate(templateId: number, userId: number, data: Partial<CreateTemplateInput>) {
    const template = await prisma.focusRoomTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new Error("Template not found");
    }

    if (template.creatorId !== userId) {
      throw new Error("Only template creator can update the template");
    }

    if (template.isSystem) {
      throw new Error("Cannot update system templates");
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.focusDuration !== undefined) updateData.focusDuration = data.focusDuration;
    if (data.breakDuration !== undefined) updateData.breakDuration = data.breakDuration;
    if (data.allowObservers !== undefined) updateData.allowObservers = data.allowObservers;
    if (data.visibility !== undefined) updateData.visibility = data.visibility;

    return prisma.focusRoomTemplate.update({
      where: { id: templateId },
      data: updateData,
    });
  }

  /**
   * Delete template (creator only)
   */
  async deleteTemplate(templateId: number, userId: number) {
    const template = await prisma.focusRoomTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new Error("Template not found");
    }

    if (template.creatorId !== userId) {
      throw new Error("Only template creator can delete the template");
    }

    if (template.isSystem) {
      throw new Error("Cannot delete system templates");
    }

    await prisma.focusRoomTemplate.delete({
      where: { id: templateId },
    });

    return true;
  }

  /**
   * Create a room from a template
   */
  async createRoomFromTemplate(
    templateId: number,
    userId: number,
    data: CreateRoomFromTemplateInput
  ) {
    const template = await prisma.focusRoomTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new Error("Template not found");
    }

    // Create room using template settings
    const room = await focusRoomService.createRoom(userId, {
      name: data.name,
      description: data.description,
      visibility: data.visibility,
      focusDuration: template.focusDuration,
      breakDuration: template.breakDuration,
      allowObservers: template.allowObservers,
      password: data.password,
    });

    // Increment template usage count
    await prisma.focusRoomTemplate.update({
      where: { id: templateId },
      data: {
        usageCount: {
          increment: 1,
        },
      },
    });

    return room;
  }
}

export const focusRoomTemplateService = new FocusRoomTemplateService();


