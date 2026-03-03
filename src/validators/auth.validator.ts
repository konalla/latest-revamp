import { z } from "zod";

export const registerSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must not exceed 100 characters")
    .trim(),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must not exceed 30 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Username can only contain letters, numbers, hyphens and underscores"
    )
    .trim()
    .toLowerCase(),
  email: z
    .string()
    .email("Invalid email address")
    .max(255, "Email must not exceed 255 characters")
    .trim()
    .toLowerCase(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must not exceed 128 characters")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(
      /[^a-zA-Z0-9]/,
      "Password must contain at least one special character"
    ),
  phone_number: z
    .string()
    .max(20, "Phone number must not exceed 20 characters")
    .optional(),
  referralCode: z.string().optional(),
  profile: z
    .object({
      professionalIdentity: z
        .array(
          z.enum([
            "Software Engineer",
            "Engineering Manager",
            "Product Manager",
            "Founder",
            "Business Owner",
            "Consultant",
            "Sales Professional",
            "Marketing Professional",
            "Operations Manager",
            "Student",
            "Freelancer",
            "Other Professional",
          ])
        )
        .optional(),
      primaryRole: z
        .array(
          z.enum([
            "Technical Execution",
            "Team Leadership",
            "Strategy & Planning",
            "Business Development",
            "Operations & Process",
            "Creative & Design",
            "Learning & Skill Development",
          ])
        )
        .optional(),
      country: z.string().max(100).optional(),
      workingHours: z
        .enum([
          "6 AM – 2 PM",
          "8 AM – 4 PM",
          "9 AM – 5 PM",
          "10 AM – 6 PM",
          "12 PM – 8 PM",
          "Flexible Schedule",
          "Night Shift",
          "Irregular Hours",
        ])
        .optional(),
      productivityScore: z.number().int().min(1).max(10).optional(),
      iqnitiGoal: z
        .array(
          z.enum([
            "Improve Focus",
            "Task Prioritization",
            "Time Management",
            "Strategic Thinking",
            "Team Productivity",
            "Automation Assistance",
            "Personal Growth",
            "Career Development",
            "Reduce Burnout",
            "Build Better Habits",
          ])
        )
        .optional(),
    })
    .optional(),
});

export const checkAvailabilitySchema = z.object({
  field: z.enum(["email", "username"]),
  value: z.string().min(1, "Value is required").trim(),
});

export type RegisterDTO = z.infer<typeof registerSchema>;
export type CheckAvailabilityDTO = z.infer<typeof checkAvailabilitySchema>;
