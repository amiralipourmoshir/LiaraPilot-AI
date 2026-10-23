import { buildLogsSchema } from '../../../../packages/shared/src/deployment-live.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  deploymentInputSchema,
  deploymentDecisionSchema,
  deploymentSchema,
  deploymentsSchema,
} from '../../../../packages/shared/src/deployment.js';
import {
  analysisInputSchema,
  inspectionSchema,
  projectAnswersSchema,
  analysisSchema,
  wizardPlanInputSchema,
  deploymentOptionsSchema,
} from '../../../../packages/shared/src/wizard.js';
import { z } from 'zod';
import { idParamsSchema } from '../../../../packages/shared/src/index.js';
import type { DeploymentService } from './service.js';
export function registerDeploymentRoutes(
  server: FastifyInstance,
  service: DeploymentService,
  auth: (r: FastifyRequest) => Promise<void>,
  csrf: (r: FastifyRequest) => Promise<void>,
) {
  const app = server.withTypeProvider<ZodTypeProvider>();
  app.post(
    '/api/v1/repositories/inspections',
    {
      preHandler: csrf,
      schema: { body: analysisInputSchema, response: { 202: inspectionSchema } },
    },
    async (r, reply) =>
      reply.code(202).send(await service.startInspection(r.auth!.user.id, r.body)),
  );
  app.get(
    '/api/v1/repositories/inspections/:id',
    { preHandler: auth, schema: { params: idParamsSchema, response: { 200: inspectionSchema } } },
    (r) => service.inspection(r.auth!.user.id, r.params.id),
  );
  app.get(
    '/api/v1/repositories/inspections/:id/events',
    { preHandler: auth, schema: { params: idParamsSchema } },
    async (r, reply) => {
      await service.inspection(r.auth!.user.id, r.params.id);
      reply.hijack();
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      let closed = false;
      reply.raw.on('close', () => {
        closed = true;
      });
      let previous = '';
      for (let i = 0; i < 80 && !closed; i++) {
        try {
          const state = await service.inspection(r.auth!.user.id, r.params.id);
          const value = JSON.stringify(state);
          if (value !== previous) {
            reply.raw.write(`data: ${value}\n\n`);
            previous = value;
          }
          if (['SUCCEEDED', 'FAILED'].includes(state.state)) break;
          reply.raw.write(': heartbeat\n\n');
          await new Promise((resolve) => setTimeout(resolve, 750));
        } catch {
          break;
        }
      }
      reply.raw.end();
    },
  );
  app.post(
    '/api/v1/repositories/analyze',
    {
      preHandler: csrf,
      config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
      schema: { body: analysisInputSchema, response: { 200: analysisSchema } },
    },
    (r) => service.analyze(r.auth!.user.id, r.body),
  );
  app.post(
    '/api/v1/repositories/:id/resolve',
    {
      preHandler: csrf,
      schema: {
        params: idParamsSchema,
        body: projectAnswersSchema,
        response: { 200: analysisSchema },
      },
    },
    (r) => service.resolve(r.auth!.user.id, r.params.id, r.body),
  );
  app.get(
    '/api/v1/repositories/:id/options',
    {
      preHandler: auth,
      schema: {
        params: idParamsSchema,
        querystring: z.object({ connectionId: z.uuid() }),
        response: { 200: deploymentOptionsSchema },
      },
    },
    (r) => service.options(r.auth!.user.id, r.params.id, r.query.connectionId),
  );
  app.post(
    '/api/v1/deployments/guided',
    {
      preHandler: csrf,
      schema: { body: wizardPlanInputSchema, response: { 201: deploymentSchema } },
    },
    async (r, reply) =>
      reply.code(201).send(await service.guidedPlan(r.auth!.user.id, r.body, r.id)),
  );
  app.get(
    '/api/v1/deployments',
    { preHandler: auth, schema: { response: { 200: deploymentsSchema } } },
    (r) => service.list(r.auth!.user.id),
  );
  app.post(
    '/api/v1/deployments',
    {
      preHandler: csrf,
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: { body: deploymentInputSchema, response: { 201: deploymentSchema } },
    },
    async (r, reply) => reply.code(201).send(await service.create(r.auth!.user.id, r.body, r.id)),
  );
  app.get(
    '/api/v1/deployments/:id',
    { preHandler: auth, schema: { params: idParamsSchema, response: { 200: deploymentSchema } } },
    (r) => service.detail(r.auth!.user.id, r.params.id),
  );
  app.get(
    '/api/v1/deployments/:id/build-logs',
    {
      preHandler: auth,
      config: { rateLimit: { max: 40, timeWindow: '1 minute' } },
      schema: {
        params: idParamsSchema,
        querystring: z.object({
          since: z
            .string()
            .regex(/^[0-9A-Za-z: .+_-]{1,128}$/)
            .default('1'),
        }),
        response: { 200: buildLogsSchema },
      },
    },
    (r) => service.buildLogs(r.auth!.user.id, r.params.id, r.query.since),
  );
  app.post(
    '/api/v1/deployments/:id/recheck',
    {
      preHandler: csrf,
      config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
      schema: {
        params: idParamsSchema,
        body: z.strictObject({}),
        response: { 200: deploymentSchema },
      },
    },
    (r) => service.recheck(r.auth!.user.id, r.params.id, r.id),
  );
  app.post(
    '/api/v1/deployments/:id/retry',
    {
      preHandler: csrf,
      config: { rateLimit: { max: 4, timeWindow: '1 minute' } },
      schema: {
        params: idParamsSchema,
        body: z.strictObject({ hash: z.string().regex(/^[a-f0-9]{64}$/) }),
        response: { 201: deploymentSchema },
      },
    },
    async (r, reply) =>
      reply
        .code(201)
        .send(await service.retryPlan(r.auth!.user.id, r.params.id, r.body.hash, r.id)),
  );
  app.post(
    '/api/v1/deployments/:id/decision',
    {
      preHandler: csrf,
      schema: {
        params: idParamsSchema,
        body: deploymentDecisionSchema,
        response: { 200: deploymentSchema },
      },
    },
    (r) => service.decide(r.auth!.user.id, r.params.id, r.body, r.id),
  );
  app.get(
    '/api/v1/deployments/:id/events',
    { preHandler: auth, schema: { params: idParamsSchema } },
    async (r, reply) => {
      await service.detail(r.auth!.user.id, r.params.id);
      const header = r.headers['last-event-id'];
      let cursor = typeof header === 'string' && /^\d{1,9}$/.test(header) ? Number(header) : 0;
      reply.hijack();
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      let closed = false;
      reply.raw.on('close', () => {
        closed = true;
      });
      for (let i = 0; i < 90 && !closed; i++) {
        try {
          const value = await service.detail(r.auth!.user.id, r.params.id);
          for (const e of value.events)
            if (e.sequence > cursor) {
              reply.raw.write(`id: ${e.sequence}\ndata: ${JSON.stringify(e)}\n\n`);
              cursor = e.sequence;
            }
          if (!['QUEUED', 'RUNNING', 'VERIFYING'].includes(value.state)) {
            reply.raw.write('event: complete\ndata: {}\n\n');
            break;
          }
          reply.raw.write(': heartbeat\n\n');
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch {
          break;
        }
      }
      reply.raw.end();
    },
  );
}
