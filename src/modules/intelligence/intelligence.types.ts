import { z } from "zod";

export const createIntelligenceEventSchema = z.object({
  eventType: z.string().trim().min(2).max(100).regex(/^[A-Z][A-Z0-9_]*$/),
  sourceSystem: z.string().trim().min(2).max(100).regex(/^[A-Z0-9][A-Z0-9_.-]*$/i),
  confidenceScore: z.number().min(0).max(100),
  summary: z.string().trim().min(1).max(1000),
});

export const intelligenceDashboardQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).default(30),
});

export type CreateIntelligenceEventInput = z.infer<
  typeof createIntelligenceEventSchema
>;
