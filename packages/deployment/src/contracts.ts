import { z } from 'zod';
import { manifestSchema } from '../../shared/src/repository.js';
export const deploymentSnapshotSchema = z.strictObject({
  policyVersion: z.enum(['existing-node-v1', 'guided-project-v2']),
  mode: z.literal('LIVE'),
  applicationId: z.uuid(),
  applicationName: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  connectionId: z.uuid(),
  credentialVersion: z.number().int(),
  providerId: z.string(),
  planId: z.string().nullable(),
  repository: manifestSchema,
  port: z.number().int().min(1).max(65535),
  healthPath: z.string().regex(/^\/[A-Za-z0-9_./-]{0,150}$/),
  expectedText: z.string().max(100),
  platform: z.string().optional(),
  createApplication: z.boolean().optional(),
  bundleId: z.string().optional(),
  networkId: z.string().optional(),
  createNetwork: z.boolean().optional(),
  githubConnectionId: z.string().nullable().optional(),
  githubVersion: z.number().int().nullable().optional(),
  resourceSummary: z.string().optional(),
  approvedResources: z
    .object({
      ramGb: z.number(),
      cpu: z.number(),
      diskGb: z.number(),
      estimatedMonthlyToman: z.number().nullable(),
    })
    .optional(),
  secretDigest: z.string().optional(),
  secretNames: z.array(z.string()).optional(),
  expiresAt: z.iso.datetime(),
});
export type DeploymentSnapshot = z.infer<typeof deploymentSnapshotSchema>;
