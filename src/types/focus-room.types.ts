import { z } from "zod";

// Room Creation/Update Schemas
export const createRoomSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(500).optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  focusDuration: z.number().int().min(5).max(180), // 5 minutes to 3 hours
  breakDuration: z.number().int().min(1).max(30), // 1 to 30 minutes
  allowObservers: z.boolean().default(true),
  password: z.string().min(4).max(100).optional(),
  scheduledStartTime: z.string().datetime().optional(),
});

export const updateRoomSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().max(500).optional(),
  focusDuration: z.number().int().min(5).max(180).optional(),
  breakDuration: z.number().int().min(1).max(30).optional(),
  allowObservers: z.boolean().optional(),
  password: z.string().min(4).max(100).optional().nullable(),
  scheduledStartTime: z.string().datetime().optional().nullable(),
  status: z.enum(["draft", "active", "scheduled", "completed", "archived"]).optional(),
});

// Session Schemas
export const startSessionSchema = z.object({
  duration: z.number().int().min(5).max(180).optional(), // Optional, uses room default if not provided
});

// Participant Schemas
export const joinRoomSchema = z.object({
  password: z.string().optional(),
  role: z.enum(["PARTICIPANT"]).default("PARTICIPANT"),
  intention: z.string().optional(),
});

export const updateParticipantIntentionSchema = z.object({
  intention: z.string().max(1000),
});

export const updateParticipantCompletionSchema = z.object({
  completion: z.string().max(2000),
  shareCompletion: z.boolean().default(false),
});

export const updateParticipantStatusSchema = z.object({
  status: z.enum(["JOINED", "FOCUSING", "BREAK", "IDLE", "LEFT"]),
});

// Invitation Schemas
export const createInvitationSchema = z.object({
  email: z.string().email(),
  expireHours: z.number().int().min(1).max(168).default(24), // 1 hour to 7 days, default 24 hours
});

export const acceptInvitationSchema = z.object({
  token: z.string(),
});

// Template Schemas
export const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  category: z.enum(["DEEP_WORK", "CREATIVE", "PLANNING", "LEARNING", "CUSTOM"]),
  focusDuration: z.number().int().min(5).max(180),
  breakDuration: z.number().int().min(1).max(30),
  allowObservers: z.boolean().default(true),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
});

export const createRoomFromTemplateSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(500).optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  password: z.string().min(4).max(100).optional(),
});

// Recurring Schedule Schemas
export const recurringScheduleSchema = z.object({
  type: z.enum(["DAILY", "WEEKLY", "CUSTOM"]),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .optional()
    .refine(
      (days) => !days || days.length > 0,
      { message: "daysOfWeek array cannot be empty if provided" }
    ),
  time: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "Time must be in HH:mm format (24-hour)",
  }),
  timezone: z.string().optional().default("UTC"),
  startDate: z.string().datetime(),
});

export const scheduleSessionSchema = z
  .object({
    scheduledStartTime: z.string().datetime().optional(),
    recurring: recurringScheduleSchema.optional(),
  })
  .refine(
    (data) => data.scheduledStartTime || data.recurring,
    { message: "Either scheduledStartTime or recurring must be provided" }
  )
  .refine(
    (data) => !(data.scheduledStartTime && data.recurring),
    { message: "Cannot provide both scheduledStartTime and recurring" }
  )
  .refine(
    (data) => {
      if (data.recurring) {
        if (data.recurring.type === "WEEKLY" || data.recurring.type === "CUSTOM") {
          return (
            data.recurring.daysOfWeek !== undefined &&
            data.recurring.daysOfWeek.length > 0
          );
        }
      }
      return true;
    },
    { message: "daysOfWeek is required for WEEKLY and CUSTOM recurrence types" }
  );

export const updateRecurringScheduleSchema = z.object({
  type: z.enum(["DAILY", "WEEKLY", "CUSTOM"]).optional(),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .optional()
    .refine(
      (days) => !days || days.length > 0,
      { message: "daysOfWeek array cannot be empty if provided" }
    ),
  time: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  timezone: z.string().optional(),
  startDate: z.string().datetime().optional(),
});

export const cancelRecurringScheduleSchema = z.object({
  cancelOccurrence: z.string().datetime().optional(),
});

// Type exports
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
export type UpdateParticipantIntentionInput = z.infer<typeof updateParticipantIntentionSchema>;
export type UpdateParticipantCompletionInput = z.infer<typeof updateParticipantCompletionSchema>;
export type UpdateParticipantStatusInput = z.infer<typeof updateParticipantStatusSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type CreateRoomFromTemplateInput = z.infer<typeof createRoomFromTemplateSchema>;
export type ScheduleSessionInput = z.infer<typeof scheduleSessionSchema>;
export type CreateRecurringScheduleInput = z.infer<typeof recurringScheduleSchema>;
export type UpdateRecurringScheduleInput = z.infer<typeof updateRecurringScheduleSchema>;
export type CancelRecurringScheduleInput = z.infer<typeof cancelRecurringScheduleSchema>;


