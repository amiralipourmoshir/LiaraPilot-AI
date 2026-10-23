import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  cloudApplicationSchema,
  cloudApplicationsSchema,
  cloudCapabilitiesSchema,
  cloudConnectionSchema,
  cloudConnectionsSchema,
  cloudLogsSchema,
  cloudMetricsSchema,
  cloudReleasesSchema,
  liaraConnectSchema,
} from '../../../../packages/shared/src/cloud.js';
import { idParamsSchema } from '../../../../packages/shared/src/index.js';
import { capabilities } from '../../../../packages/liara-adapter/src/client.js';
import type { LiaraService } from './liara-service.js';
export function registerLiaraRoutes(
  server: FastifyInstance,
  service: LiaraService,
  auth: (request: FastifyRequest) => Promise<void>,
  csrf: (request: FastifyRequest) => Promise<void>,
) {
  const app = server.withTypeProvider<ZodTypeProvider>();
  app.get(
    '/api/v1/connections/liara',
    { preHandler: auth, schema: { response: { 200: cloudConnectionsSchema } } },
    (request) => service.list(request.auth!.user.id),
  );
  app.post(
    '/api/v1/connections/liara',
    {
      preHandler: csrf,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { body: liaraConnectSchema, response: { 201: cloudConnectionSchema } },
    },
    async (request, reply) =>
      reply.code(201).send(await service.connect(request.auth!.user.id, request.body, request.id)),
  );
  app.post(
    '/api/v1/connections/liara/:id/sync',
    {
      preHandler: csrf,
      schema: { params: idParamsSchema, response: { 200: cloudConnectionSchema } },
    },
    (request) => service.sync(request.auth!.user.id, request.params.id, request.id),
  );
  app.post(
    '/api/v1/connections/liara/:id/disconnect',
    {
      preHandler: csrf,
      schema: {
        params: idParamsSchema,
        response: { 200: z.object({ disconnected: z.literal(true) }) },
      },
    },
    (request) => service.disconnect(request.auth!.user.id, request.params.id, request.id),
  );
  app.get(
    '/api/v1/applications',
    {
      preHandler: auth,
      schema: {
        querystring: z.strictObject({ connectionId: z.uuid().optional() }),
        response: { 200: cloudApplicationsSchema },
      },
    },
    (request) => service.applications(request.auth!.user.id, request.query.connectionId),
  );
  app.get(
    '/api/v1/applications/:id',
    {
      preHandler: auth,
      schema: { params: idParamsSchema, response: { 200: cloudApplicationSchema } },
    },
    (request) => service.application(request.auth!.user.id, request.params.id),
  );
  app.get(
    '/api/v1/applications/:id/logs',
    {
      preHandler: auth,
      schema: {
        params: idParamsSchema,
        querystring: z.strictObject({ since: z.iso.datetime() }),
        response: { 200: cloudLogsSchema },
      },
    },
    (request) => service.logs(request.auth!.user.id, request.params.id, request.query.since),
  );
  app.get(
    '/api/v1/applications/:id/releases',
    {
      preHandler: auth,
      schema: {
        params: idParamsSchema,
        querystring: z.strictObject({
          page: z.coerce.number().int().min(1).max(1000).default(1),
          count: z.coerce.number().int().min(1).max(50).default(10),
        }),
        response: { 200: cloudReleasesSchema },
      },
    },
    (request) =>
      service.releases(
        request.auth!.user.id,
        request.params.id,
        request.query.page,
        request.query.count,
      ),
  );
  app.get(
    '/api/v1/applications/:id/metrics',
    { preHandler: auth, schema: { params: idParamsSchema, response: { 200: cloudMetricsSchema } } },
    (request) => service.metrics(request.auth!.user.id, request.params.id),
  );
  app.get(
    '/api/v1/providers/liara/capabilities',
    { preHandler: auth, schema: { response: { 200: cloudCapabilitiesSchema } } },
    async () => capabilities(),
  );
}
