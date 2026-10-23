import { z } from 'zod';
export const scanPathSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((p) => {
    try {
      const u = new URL(p, 'https://scan.invalid');
      return (
        p.startsWith('/') &&
        !p.startsWith('//') &&
        !p.includes('\\') &&
        !/[\u0000-\u001f]/.test(p) &&
        u.origin === 'https://scan.invalid' &&
        !decodeURIComponent(u.pathname).split('/').includes('..')
      );
    } catch {
      return false;
    }
  });
export const scanInput = z.strictObject({
  applicationId: z.uuid(),
  paths: z.array(scanPathSchema).max(100).default(['/']),
  maxPages: z.number().int().min(1).max(500).default(200),
  maxDurationSeconds: z.number().int().min(30).max(900).default(600),
  externalAssets: z.boolean().default(true),
  interactions: z.boolean().default(true),
  discover: z.boolean().default(true),
});
export const patchInput = z.strictObject({
  applicationId: z.uuid(),
  root: z.enum(['/app', '/usr/src/app', '/usr/share/nginx/html']),
  path: z.string().min(1).max(200),
  instruction: z.string().min(10).max(2000),
});
export const decisionInput = z.strictObject({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  approve: z.boolean(),
});
export const scanPage = z.object({
  interactions: z
    .array(
      z.object({
        label: z.string(),
        url: z.string(),
        newPaths: z.number(),
        requests: z.number(),
        outcome: z.string(),
      }),
    )
    .optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  finalUrl: z.string().optional(),
  ttfbMs: z.number().nullable().optional(),
  domNodes: z.number().optional(),
  imageCount: z.number().optional(),
  imagesMissingAlt: z.number().optional(),
  h1Count: z.number().optional(),
  linkCount: z.number().optional(),
  source: z.string().optional(),

  path: z.string(),
  status: z.number().nullable(),
  durationMs: z.number(),
  requests: z.number(),
  bytes: z.number(),
  domMs: z.number().nullable(),
  loadMs: z.number().nullable(),
  errors: z.array(z.string()),
  assets: z.array(
    z.object({ url: z.string(), type: z.string(), status: z.number(), bytes: z.number() }),
  ),
});
export const scanResult = z.object({
  discovery: z
    .array(z.object({ source: z.string(), url: z.string(), count: z.number() }))
    .optional(),
  warnings: z.array(z.string()).optional(),
  pendingPaths: z.array(z.string()).optional(),
  resources: z
    .array(
      z.object({
        url: z.string(),
        type: z.string(),
        status: z.number(),
        bytes: z.number(),
        requests: z.number(),
        pages: z.array(z.string()),
      }),
    )
    .optional(),
  maxPages: z.number().optional(),
  durationMs: z.number().optional(),

  pages: z.array(scanPage),
  discovered: z.number(),
  truncated: z.boolean(),
  blocked: z.number(),
  scope: z.string(),
});
export const taskSchema = z.object({
  id: z.uuid(),
  applicationId: z.uuid(),
  kind: z.enum(['SCAN', 'PATCH']),
  state: z.string(),
  hash: z.string(),
  snapshot: z.unknown(),
  result: z.unknown().nullable(),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export const taskList = z.object({ items: z.array(taskSchema) });

export const performanceAnalysis = z.strictObject({
  score: z.number().int().min(0).max(100),
  confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  summary: z.string().min(1).max(1800),
  strengths: z.array(z.string().max(300)).max(4),
  findings: z
    .array(
      z.strictObject({
        path: z.string().max(2048),
        severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
        title: z.string().max(160),
        evidence: z.string().max(700),
        recommendation: z.string().max(700),
      }),
    )
    .max(8),
  limitations: z.array(z.string().max(400)).min(1).max(5),
});
export const storedAnalysis = performanceAnalysis.extend({
  analyzedAt: z.string(),
  model: z.string(),
});

export const scanProgress = z.object({
  phase: z.enum(['PREPARING', 'BROWSER', 'DISCOVERY', 'SCANNING', 'SAVING', 'DONE']),
  completed: z.number(),
  total: z.number(),
  currentPath: z.string().nullable(),
  message: z.string(),
  updatedAt: z.string(),
});
export const scanFailure = z.object({
  code: z.string(),
  message: z.string(),
  hint: z.string(),
  detail: z.string().optional(),
  progress: scanProgress.optional(),
});

export const aiRunEvent = z.object({
  sequence: z.number(),
  at: z.string(),
  phase: z.string(),
  message: z.string(),
  receivedBytes: z.number().optional(),
});
export const aiRunSchema = z.object({
  id: z.uuid(),
  applicationId: z.uuid(),
  kind: z.enum(['PATCH', 'ANALYSIS']),
  state: z.string(),
  events: z.array(aiRunEvent),
  result: z.unknown().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});
export const aiRunList = z.object({ items: z.array(aiRunSchema) });
