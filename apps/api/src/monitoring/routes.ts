import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idParamsSchema } from '../../../../packages/shared/src/index.js';
import {
  correctiveInputSchema,
  operationHistorySchema,
  monitorInputSchema,
  monitorSettingsSchema,
  healthMonitorSchema,
  monitoringOverviewSchema,
  incidentDetailSchema,
  healthActionSchema,
} from '../../../../packages/shared/src/monitoring.js';
import { resourceAdviceInputSchema } from '../../../../packages/shared/src/deployment-live.js';
import type { MonitoringService } from './service.js';
export function registerMonitoringRoutes(
  server: FastifyInstance,
  s: MonitoringService,
  auth: (r: FastifyRequest) => Promise<void>,
  csrf: (r: FastifyRequest) => Promise<void>,
) {
  const app = server.withTypeProvider<ZodTypeProvider>();
  app.get(
    '/api/v1/history',
    {
      preHandler: auth,
      schema: {
        querystring: z.object({
          page: z.coerce.number().int().min(1).max(10000).default(1),
          filter: z
            .enum(['all', 'deployment.', 'incident.', 'health.', 'monitor.', 'connection.'])
            .default('all'),
        }),
        response: { 200: operationHistorySchema },
      },
    },
    (r) => s.history(r.auth!.user.id, r.query.page, r.query.filter),
  );
  app.get(
    '/api/v1/monitoring',
    { preHandler: auth, schema: { response: { 200: monitoringOverviewSchema } } },
    (r) => s.overview(r.auth!.user.id),
  );
  app.post(
    '/api/v1/monitoring',
    {
      preHandler: csrf,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { body: monitorInputSchema, response: { 201: healthMonitorSchema } },
    },
    async (r, reply) => reply.code(201).send(await s.create(r.auth!.user.id, r.body, r.id)),
  );
  app.patch(
    '/api/v1/monitoring/:id',
    {
      preHandler: csrf,
      schema: {
        params: idParamsSchema,
        body: monitorSettingsSchema,
        response: { 200: healthMonitorSchema },
      },
    },
    (r) => s.settings(r.auth!.user.id, r.params.id, r.body),
  );
  app.post(
    '/api/v1/monitoring/:id/check',
    {
      preHandler: csrf,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        params: idParamsSchema,
        body: z.strictObject({}),
        response: { 200: healthMonitorSchema },
      },
    },
    (r) => s.check(r.auth!.user.id, r.params.id),
  );
  app.get(
    '/api/v1/incidents/:id',
    {
      preHandler: auth,
      schema: { params: idParamsSchema, response: { 200: incidentDetailSchema } },
    },
    (r) => s.detail(r.auth!.user.id, r.params.id),
  );
  app.post(
    '/api/v1/incidents/:id/diagnose',
    {
      preHandler: csrf,
      config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
      schema: {
        params: idParamsSchema,
        body: resourceAdviceInputSchema.omit({ connectionId: true }),
        response: { 200: incidentDetailSchema },
      },
    },
    (r) => s.diagnose(r.auth!.user.id, r.params.id, r.body, r.id),
  );
  app.post(
    '/api/v1/incidents/:id/actions',
    {
      preHandler: csrf,
      config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
      schema: {
        params: idParamsSchema,
        body: correctiveInputSchema,
        response: { 201: healthActionSchema },
      },
    },
    async (r, reply) =>
      reply.code(201).send(await s.prepare(r.auth!.user.id, r.params.id, r.id, r.body)),
  );
  app.post(
    '/api/v1/health-actions/:id/decision',
    {
      preHandler: csrf,
      schema: {
        params: idParamsSchema,
        body: z.strictObject({ hash: z.string().regex(/^[a-f0-9]{64}$/), approve: z.boolean() }),
        response: { 200: healthActionSchema },
      },
    },
    (r) => s.decide(r.auth!.user.id, r.params.id, r.body.hash, r.body.approve, r.id),
  );
}
