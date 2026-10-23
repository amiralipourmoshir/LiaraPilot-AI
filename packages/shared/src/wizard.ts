import { z } from 'zod';
import { manifestSchema } from './repository.js';
export const repositoryRequestSchema = z.strictObject({
  repositoryUrl: z.string().trim().min(1).max(300),
});
export const repositoryBranchesSchema = z.object({
  repositoryUrl: z.string(),
  defaultBranch: z.string(),
  private: z.boolean(),
  branches: z.array(z.string()),
  hasMore: z.boolean(),
});
export const githubStatusSchema = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
  login: z.string().nullable(),
  setupUrl: z.string().nullable(),
});
export const analysisInputSchema = repositoryRequestSchema.extend({
  branch: z.string().min(1).max(255),
  root: z.string().max(240).optional(),
  runtime: z.enum(['php', 'python', 'node', 'go', 'dotnet', 'docker']).optional(),
});
export const analysisSchema = z.object({
  id: z.uuid(),
  repositoryUrl: z.string(),
  branch: z.string(),
  manifest: manifestSchema,
  expiresAt: z.string(),
});
export const planOptionSchema = z.object({
  planet: z.string().nullable().default(null),
  bundleName: z.string().default('پایه'),
  estimatedHourlyToman: z.number().nullable().default(null),
  id: z.string(),
  bundleId: z.string(),
  name: z.string(),
  ramGb: z.number(),
  cpu: z.number(),
  diskGb: z.number(),
  estimatedMonthlyToman: z.number().nullable(),
  recommended: z.boolean(),
});
export const deploymentOptionsSchema = z.object({
  connectionId: z.uuid(),
  connectionLabel: z.string(),
  plans: z.array(planOptionSchema),
  networks: z.array(z.object({ id: z.string(), name: z.string() })),
  applications: z.array(
    z.object({ id: z.uuid(), name: z.string(), platform: z.string().nullable() }),
  ),
  fetchedAt: z.string(),
  billing: z
    .object({
      hasCredit: z.boolean().nullable(),
      balanceToman: z.number().finite().nullable().optional(),
      currentMonthlyToman: z.number().nonnegative().nullable().optional(),
      paymentUrl: z.literal('https://console.liara.ir/credit'),
    })
    .optional(),
});
export const wizardPlanInputSchema = z.strictObject({
  environment: z
    .record(z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/), z.string().min(1).max(4096))
    .refine((v) => Object.keys(v).length <= 100)
    .optional(),
  analysisId: z.uuid(),
  connectionId: z.uuid(),
  target: z.enum(['new', 'existing']),
  applicationId: z.uuid().optional(),
  name: z
    .string()
    .regex(/^[a-z][a-z0-9-]{2,40}$/)
    .optional(),
  planId: z.string().max(128).optional(),
  bundleId: z.string().max(128).optional(),
  networkId: z.string().max(128).optional(),
});

export const inspectionSchema = z.object({
  id: z.uuid(),
  state: z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED']),
  events: z.array(z.object({ message: z.string(), createdAt: z.string() })),
  result: analysisSchema.nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
});

export const projectAnswersSchema = z.strictObject({
  customStart: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .regex(/^[^\x00-\x1f\x7f]+$/)
    .optional(),
  customBuild: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .regex(/^[^\x00-\x1f\x7f]+$/)
    .optional(),
  confirmCustom: z.boolean().optional(),
  root: z.string().max(240).optional(),
  runtime: z.enum(['php', 'python', 'node', 'go', 'dotnet', 'docker']).optional(),
  startScript: z
    .string()
    .regex(/^[A-Za-z0-9_:-]{1,80}$/)
    .optional(),
  buildScript: z
    .string()
    .regex(/^[A-Za-z0-9_:-]{1,80}$/)
    .optional(),
});
