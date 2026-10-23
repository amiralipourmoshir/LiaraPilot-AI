import { z } from 'zod';
export const liaraConnectSchema = z.strictObject({
  label: z
    .string()
    .trim()
    .min(2, 'نام اتصال باید دست‌کم ۲ نویسه باشد.')
    .max(80, 'نام اتصال بیش از حد طولانی است.'),
  token: z
    .string()
    .min(16, 'توکن معتبر وارد کنید.')
    .max(4096, 'توکن بیش از حد طولانی است.')
    .regex(/^[\x21-\x7e]+$/, 'توکن نباید فاصله یا خط تازه داشته باشد.'),
  teamId: z
    .string()
    .trim()
    .max(128)
    .regex(/^[a-zA-Z0-9_-]*$/, 'شناسه تیم معتبر نیست.')
    .optional(),
});
export const cloudConnectionSchema = z.strictObject({
  id: z.uuid(),
  label: z.string(),
  provider: z.literal('LIARA'),
  mode: z.literal('LIVE'),
  status: z.enum(['CONNECTED', 'DISCONNECTED']),
  teamId: z.string().nullable(),
  validatedAt: z.string().nullable(),
  syncedAt: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  createdAt: z.string(),
  applicationCount: z.number(),
});
export const cloudConnectionsSchema = z.strictObject({
  configured: z.boolean(),
  connections: z.array(cloudConnectionSchema),
});
export const cloudApplicationSchema = z.strictObject({
  id: z.uuid(),
  connectionId: z.uuid(),
  mode: z.literal('LIVE'),
  providerId: z.string(),
  name: z.string(),
  platform: z.string().nullable(),
  status: z.string().nullable(),
  scale: z.number().nullable(),
  isDeployed: z.boolean().nullable(),
  planId: z.string().nullable(),
  lastSeenAt: z.string(),
  providerMissing: z.boolean(),
  connectionLabel: z.string(),
});
export const cloudApplicationsSchema = z.strictObject({
  applications: z.array(cloudApplicationSchema),
});
export const cloudLogsSchema = z.strictObject({
  source: z.literal('LIARA'),
  contract: z.enum(['CLI_V2', 'OPENAPI_V1']),
  fetchedAt: z.string(),
  since: z.string(),
  truncated: z.boolean(),
  logs: z.array(z.strictObject({ type: z.string(), datetime: z.string(), message: z.string() })),
});
export const cloudReleaseSchema = z.strictObject({
  id: z.string(),
  state: z.string().nullable(),
  type: z.string().nullable(),
  port: z.number().nullable(),
  createdAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  tag: z.string().nullable(),
  commit: z.string().nullable(),
  branch: z.string().nullable(),
});
export const cloudReleasesSchema = z.strictObject({
  source: z.literal('LIARA'),
  fetchedAt: z.string(),
  total: z.number().nullable(),
  currentRelease: z.string().nullable(),
  releases: z.array(cloudReleaseSchema),
});
const metricSample = z.strictObject({
  applet: z.string(),
  value: z.array(z.union([z.number(), z.string()])),
});
export const cloudMetricsSchema = z.strictObject({
  source: z.literal('LIARA'),
  fetchedAt: z.string(),
  unitsVerified: z.literal(false),
  cpuUsage: z.array(metricSample),
  memoryUsage: z.array(metricSample),
});
export const cloudCapabilitiesSchema = z.strictObject({
  provider: z.literal('LIARA'),
  mode: z.literal('LIVE'),
  operations: z.array(
    z.strictObject({
      name: z.string(),
      available: z.boolean(),
      requiresApproval: z.boolean(),
      reason: z.string().nullable(),
    }),
  ),
});
export type CloudConnection = z.infer<typeof cloudConnectionSchema>;
export type CloudApplication = z.infer<typeof cloudApplicationSchema>;
export type CloudLogs = z.infer<typeof cloudLogsSchema>;
export type CloudReleases = z.infer<typeof cloudReleasesSchema>;
export type CloudMetrics = z.infer<typeof cloudMetricsSchema>;
