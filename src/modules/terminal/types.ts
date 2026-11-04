import { z } from "zod";

export const registerTerminalSchema = z.object({
  tid: z.string().min(1).max(8),
  mid: z.string().max(15).optional(),
  serialNumber: z.string().min(1).max(50),
  merchantId: z.string().uuid(),
  model: z.string().max(100).optional(),
  osVersion: z.string().max(50).optional(),
  firmwareVersion: z.string().max(50).optional(),
  location: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  country: z.string().min(2).max(3).default("US"),
  timezone: z.string().max(50).default("UTC"),
  config: z.record(z.unknown()).optional(),
});

export const updateTerminalSchema = z.object({
  model: z.string().max(100).optional(),
  osVersion: z.string().max(50).optional(),
  firmwareVersion: z.string().max(50).optional(),
  location: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(3).optional(),
  timezone: z.string().max(50).optional(),
  status: z.enum(["REGISTERED", "ACTIVE", "INACTIVE", "DISABLED", "DECOMMISSIONED"]).optional(),
  config: z.record(z.unknown()).optional(),
});

export const updateHealthSchema = z.object({
  status: z.enum(["ONLINE", "OFFLINE", "DEGRADED", "MAINTENANCE"]),
  cpuUsage: z.number().min(0).max(100).optional(),
  memoryUsage: z.number().min(0).max(100).optional(),
  diskUsage: z.number().min(0).max(100).optional(),
  temperature: z.number().optional(),
  batteryLevel: z.number().min(0).max(100).optional(),
  networkLatencyMs: z.number().int().min(0).optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
});

export const remoteCommandSchema = z.object({
  terminalId: z.string().uuid(),
  command: z.string().min(1).max(50),
  payload: z.record(z.unknown()).optional(),
  expiresInMinutes: z.number().int().min(1).max(1440).default(60),
});

export type RegisterTerminalInput = z.infer<typeof registerTerminalSchema>;
export type UpdateTerminalInput = z.infer<typeof updateTerminalSchema>;
export type UpdateHealthInput = z.infer<typeof updateHealthSchema>;
export type RemoteCommandInput = z.infer<typeof remoteCommandSchema>;
