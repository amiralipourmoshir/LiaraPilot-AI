import {
  executionInsightSchema,
  resourceAdviceInputSchema,
  resourceAdviceSchema,
} from '../../../../packages/shared/src/deployment-live.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  assistantConfigSchema,
  conversationsSchema,
  conversationDetailSchema,
  sendMessageSchema,
  approvalSchema,
  agentAnswerSchema,
} from '../../../../packages/shared/src/assistant.js';
import { idParamsSchema } from '../../../../packages/shared/src/index.js';
import type { AssistantService } from './service.js';
export function registerAssistantRoutes(
  server: FastifyInstance,
  service: AssistantService,
  auth: (r: FastifyRequest) => Promise<void>,
  csrf: (r: FastifyRequest) => Promise<void>,
) {
  const app = server.withTypeProvider<ZodTypeProvider>();
  app.post(
    '/api/v1/deployments/:id/insight',
    {
      preHandler: csrf,
      config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
      schema: {
        params: idParamsSchema,
        body: resourceAdviceInputSchema.omit({ connectionId: true }),
        response: { 200: executionInsightSchema },
      },
    },
    (r) => service.explainExecution(r.auth!.user.id, r.params.id, r.body),
  );
  app.post(
    '/api/v1/repositories/:id/resource-advice',
    {
      preHandler: csrf,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        params: idParamsSchema,
        body: resourceAdviceInputSchema,
        response: { 200: resourceAdviceSchema },
      },
    },
    (r) => service.adviseResources(r.auth!.user.id, r.params.id, r.body),
  );
  app.post(
    '/api/v1/conversations/:id/deployment',
    {
      preHandler: csrf,
      schema: {
        params: idParamsSchema,
        body: z.strictObject({ deploymentId: z.uuid() }),
        response: { 200: conversationDetailSchema },
      },
    },
    (r) => service.attachDeployment(r.auth!.user.id, r.params.id, r.body.deploymentId),
  );
  app.get(
    '/api/v1/assistant/config',
    { preHandler: auth, schema: { response: { 200: assistantConfigSchema } } },
    async () => service.config(),
  );
  app.get(
    '/api/v1/conversations',
    { preHandler: auth, schema: { response: { 200: conversationsSchema } } },
    (r) => service.list(r.auth!.user.id),
  );
  app.post(
    '/api/v1/conversations',
    {
      preHandler: csrf,
      schema: { body: z.strictObject({}), response: { 201: conversationDetailSchema } },
    },
    async (r, reply) => reply.code(201).send(await service.create(r.auth!.user.id)),
  );
  app.get(
    '/api/v1/conversations/:id',
    {
      preHandler: auth,
      schema: { params: idParamsSchema, response: { 200: conversationDetailSchema } },
    },
    (r) => service.detail(r.auth!.user.id, r.params.id),
  );
  app.post(
    '/api/v1/conversations/:id/messages/:messageId/answer',
    {
      preHandler: csrf,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        params: z.object({ id: z.uuid(), messageId: z.uuid() }),
        body: agentAnswerSchema,
        response: { 200: conversationDetailSchema },
      },
    },
    (r) => service.answer(r.auth!.user.id, r.params.id, r.params.messageId, r.body.values, r.id),
  );
  app.post(
    '/api/v1/conversations/:id/messages',
    {
      preHandler: csrf,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        params: idParamsSchema,
        body: sendMessageSchema,
        headers: z.object({ 'idempotency-key': z.uuid() }),
        response: { 200: conversationDetailSchema },
      },
    },
    (r) => service.send(r.auth!.user.id, r.params.id, r.body, r.headers['idempotency-key'], r.id),
  );
  app.post(
    '/api/v1/conversations/:id/plans/:planId/decision',
    {
      preHandler: csrf,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        params: z.object({ id: z.uuid(), planId: z.uuid() }),
        body: approvalSchema,
        response: { 200: conversationDetailSchema },
      },
    },
    (r) => service.decide(r.auth!.user.id, r.params.id, r.params.planId, r.body, r.id),
  );
}
