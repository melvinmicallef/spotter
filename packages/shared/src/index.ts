import { z } from 'zod';

export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const uuidSchema = z.string().uuid();

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  database: z.literal('ready'),
  timestamp: isoDateTimeSchema,
});

export const versionResponseSchema = z.object({
  name: z.literal('spotter'),
  version: z.string().min(1),
  commit: z.string().min(1),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type VersionResponse = z.infer<typeof versionResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
