import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(1).max(100),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "OPERATOR", "REVIEWER", "READONLY"]),
  preferredLang: z.string().min(2).max(5).default("en"),
});

export const updateUserSchema = z.object({
  fullName: z.string().min(1).max(100).optional(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "OPERATOR", "REVIEWER", "READONLY"]).optional(),
  preferredLang: z.string().min(2).max(5).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export const updateKycSchema = z.object({
  status: z.enum(["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED"]),
  reviewNotes: z.string().max(1000).optional(),
  level: z.string().max(20).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateKycInput = z.infer<typeof updateKycSchema>;
