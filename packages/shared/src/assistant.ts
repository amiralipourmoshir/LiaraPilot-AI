import { z } from 'zod';
export const inspectionArgsSchema = z.strictObject({
  applicationId: z.uuid(),
  includeLogs: z.boolean(),
  windowMinutes: z.union([z.literal(15), z.literal(60), z.literal(1440)]),
});
export const diagnosisSchema = z.strictObject({
  summary: z.string().min(1).max(2000),
  facts: z
    .array(
      z.strictObject({
        text: z.string().min(1).max(1000),
        evidenceIds: z.array(z.uuid()).min(1).max(4),
      }),
    )
    .max(8),
  hypotheses: z
    .array(
      z.strictObject({
        text: z.string().min(1).max(1000),
        evidenceIds: z.array(z.uuid()).min(1).max(4),
        confidence: z.enum(['low', 'medium']),
      }),
    )
    .max(6),
  missingEvidence: z.array(z.string().min(1).max(500)).max(8),
  recommendations: z.array(z.string().min(1).max(1000)).max(8),
});
export const planSnapshotSchema = z.strictObject({
  policyVersion: z.literal('read-inspection-v1'),
  tool: z.literal('inspect_application'),
  applicationId: z.uuid(),
  applicationName: z.string(),
  connectionId: z.uuid(),
  credentialVersion: z.number().int(),
  includeLogs: z.boolean(),
  since: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  mode: z.literal('LIVE'),
  sharesWithModel: z.literal(true),
  model: z.string(),
  modelHost: z.string(),
  modelConfigHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export const evidenceSchema = z.object({
  id: z.uuid(),
  tool: z.string(),
  source: z.literal('LIARA'),
  collectedAt: z.iso.datetime(),
  data: z.unknown(),
});
export const agentQuestionSchema = z.strictObject({
  title: z.string().min(1).max(120),
  description: z.string().max(500),
  fields: z
    .array(
      z.strictObject({
        name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/),
        label: z.string().min(1).max(200),
        hint: z.string().max(500),
        type: z.enum([
          'text',
          'url',
          'email',
          'number',
          'date',
          'textarea',
          'select',
          'radio',
          'checkbox',
          'multiselect',
        ]),
        required: z.boolean(),
        allowCustom: z.boolean(),
        options: z
          .array(
            z.strictObject({
              value: z.string().min(1).max(100),
              label: z.string().min(1).max(200),
            }),
          )
          .max(20),
      }),
    )
    .min(1)
    .max(8)
    .refine((fields) => new Set(fields.map((f) => f.name)).size === fields.length),
});
export const agentInteractionSchema = agentQuestionSchema.extend({ answered: z.boolean() });
export const agentAnswerSchema = z.strictObject({
  values: z
    .record(
      z.string(),
      z.union([z.string().max(1000), z.boolean(), z.array(z.string().max(100)).max(20)]),
    )
    .refine((v) => Object.keys(v).length <= 8),
});
export const assistantMessageSchema = z.object({
  id: z.uuid(),
  role: z.enum(['USER', 'ASSISTANT']),
  content: z.string(),
  createdAt: z.iso.datetime(),
  diagnosis: diagnosisSchema.nullable(),
  interaction: agentInteractionSchema.nullable().default(null),
  actionPath: z
    .string()
    .refine(
      (v) =>
        /^\/deployments(?:\/[a-f0-9-]{36}|\?repository=https%3A%2F%2Fgithub\.com%2F[A-Za-z0-9%_.-]+)$/.test(
          v,
        ) || /^\/monitoring\?applicationId=[a-f0-9-]{36}&run=[a-f0-9-]{36}$/.test(v),
    )
    .nullable()
    .default(null),
});
export const assistantPlanSchema = z.object({
  id: z.uuid(),
  hash: z.string(),
  state: z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'CANCELLED', 'EXPIRED', 'NEEDS_ATTENTION']),
  snapshot: planSnapshotSchema,
  createdAt: z.iso.datetime(),
  errorCode: z.string().nullable(),
  evidence: z.array(evidenceSchema),
});
export const conversationSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  updatedAt: z.iso.datetime(),
  model: z.string().nullable().default(null),
});
export const conversationDetailSchema = conversationSchema.extend({
  messages: z.array(assistantMessageSchema),
  plans: z.array(assistantPlanSchema),
  busy: z.boolean(),
});
export const conversationsSchema = z.object({ conversations: z.array(conversationSchema) });
export const assistantConfigSchema = z.object({
  configured: z.boolean(),
  model: z.string().nullable(),
  providerHost: z.string(),
  models: z
    .array(z.object({ id: z.string(), label: z.string(), description: z.string() }))
    .default([]),
  apiStyle: z.enum(['responses', 'chat']),
  tools: z.array(z.string()),
});
export const sendMessageSchema = z.strictObject({
  content: z.string().trim().min(1).max(4000),
  applicationId: z.uuid().optional(),
  model: z.string().max(120).optional(),
});
export const approvalSchema = z.strictObject({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  decision: z.enum(['approve', 'cancel']),
});
export type Diagnosis = z.infer<typeof diagnosisSchema>;
export type InspectionArgs = z.infer<typeof inspectionArgsSchema>;
export type PlanSnapshot = z.infer<typeof planSnapshotSchema>;
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;
