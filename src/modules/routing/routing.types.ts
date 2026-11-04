import { z } from "zod";

export const createRouteSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["PRIMARY", "FAILOVER", "PRIORITY"]).default("PRIMARY"),
  status: z.enum(["ACTIVE", "INACTIVE", "DISABLED"]).default("ACTIVE"),
  priority: z.number().int().min(1).max(100).default(1),
  protocol: z.string().max(20).default("ISO8583"),
  endpoint: z.string().min(1).max(255),
  hostConnectionId: z.string().uuid().optional(),
  merchantId: z.string().optional(),
  binPattern: z.string().optional(),
  countryCode: z.string().max(3).optional(),
  currency: z.string().max(3).optional(),
  cardType: z.string().max(50).optional(),
  config: z.record(z.unknown()).optional(),
  failoverOf: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateRouteSchema = createRouteSchema.partial();

export type CreateRouteInput = z.infer<typeof createRouteSchema>;
export type UpdateRouteInput = z.infer<typeof updateRouteSchema>;
