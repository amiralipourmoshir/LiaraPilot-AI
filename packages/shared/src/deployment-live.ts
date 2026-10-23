import { z } from 'zod';
export const buildLogsSchema = z.object({
  state: z.string().nullable(),
  cursor: z.string().max(128),
  lines: z.array(z.object({ at: z.string().max(128), text: z.string().max(16384) })).max(2000),
});
export const resourceAdviceInputSchema = z.strictObject({
  connectionId: z.uuid(),
  model: z.string().max(100).optional(),
  answers: z
    .array(
      z.strictObject({ question: z.string().min(1).max(600), answer: z.string().min(1).max(2000) }),
    )
    .max(6),
});
export const resourceAdviceSchema = z.strictObject({
  question: z.string().max(600),
  options: z.array(z.string().min(1).max(160)).max(5),
  planKey: z.string().max(180),
  explanation: z.string().min(1).max(2200),
});
export const executionInsightSchema = z.strictObject({
  summary: z.string().min(1).max(2500),
  question: z.string().max(600),
  options: z.array(z.string().min(1).max(160)).max(5),
  nextStep: z.enum(['WAIT', 'REVIEW_SETTINGS', 'RECHECK', 'COMPLETE', 'ASK_USER']),
});
