import { z } from 'zod';
export const healthPathSchema = z
  .string()
  .regex(/^\/[A-Za-z0-9_./-]{0,150}$/)
  .refine((p) => !p.startsWith('//') && !p.split('/').includes('..'));
export const monitorInputSchema = z
  .strictObject({
    deploymentId: z.uuid().optional(),
    applicationId: z.uuid().optional(),
    path: healthPathSchema.optional(),
    expectedText: z.string().max(200).optional(),
    intervalSeconds: z.number().int().min(30).max(3600).default(60),
    failureThreshold: z.number().int().min(2).max(10).default(3),
  })
  .refine((v) => !!v.deploymentId || !!v.applicationId);
export const monitorSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  intervalSeconds: z.number().int().min(30).max(3600),
  failureThreshold: z.number().int().min(2).max(10),
});
export const correctiveInputSchema = z.strictObject({
  path: healthPathSchema.optional(),
  expectedText: z.string().max(200).optional(),
});
export const operationHistorySchema = z.object({
  total: z.number(),
  page: z.number(),
  items: z.array(
    z.object({
      id: z.uuid(),
      action: z.string(),
      resourceId: z.string().nullable(),
      createdAt: z.iso.datetime(),
      target: z.string().nullable(),
    }),
  ),
});
export const monitoringDiagnosisSchema = z.strictObject({
  summary: z.string().min(1).max(2500),
  hypotheses: z
    .array(
      z.strictObject({
        text: z.string().min(1).max(700),
        evidenceIds: z.array(z.string().max(80)).min(1).max(8),
      }),
    )
    .max(5),
  question: z.string().max(600),
  options: z.array(z.string().max(160)).max(5),
});
export const healthSampleSchema = z.object({
  id: z.uuid(),
  healthy: z.boolean(),
  status: z.number().nullable(),
  latencyMs: z.number(),
  errorCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export const healthMonitorSchema = z.object({
  id: z.uuid(),
  applicationId: z.uuid(),
  name: z.string(),
  platform: z.string().nullable(),
  enabled: z.boolean(),
  intervalSeconds: z.number(),
  failureThreshold: z.number(),
  path: z.string(),
  lastStatus: z.number().nullable(),
  lastError: z.string().nullable(),
  latencyMs: z.number().nullable(),
  lastCheckedAt: z.iso.datetime().nullable(),
  lastSuccessAt: z.iso.datetime().nullable(),
  failureCount: z.number(),
  samples: z.array(healthSampleSchema),
});
export const incidentSchema = z.object({
  source:z.enum(['HEALTH','SCAN']).default('HEALTH'),
  id: z.uuid(),
  monitorId: z.uuid(),
  title: z.string(),
  state: z.enum(['OPEN', 'RESOLVED']),
  openedAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
  diagnosis: z.unknown().nullable(),
});
export const healthActionSchema = z.object({
  id: z.uuid(),
  state: z.string(),
  hash: z.string(),
  snapshot: z.unknown(),
  result: z.unknown().nullable(),
  expiresAt: z.iso.datetime(),
});
export const monitoringOverviewSchema = z.object({
  monitors: z.array(healthMonitorSchema),
  incidents: z.array(incidentSchema),
  candidates: z.array(
    z.object({
      deploymentId: z.uuid().optional(),
      applicationId: z.uuid().optional(),
      name: z.string(),
      platform: z.string(),
    }),
  ),
});
export const incidentDetailSchema = incidentSchema.extend({
  monitor: healthMonitorSchema,
  events: z.array(z.object({ id: z.uuid(), message: z.string(), createdAt: z.iso.datetime() })),
  actions: z.array(healthActionSchema),
});
