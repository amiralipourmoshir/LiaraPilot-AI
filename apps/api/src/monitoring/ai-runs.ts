import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../../../../packages/database/src/index.js';
import { aiRunList, aiRunSchema, patchInput } from '../../../../packages/shared/src/reliability.js';
import { AppError } from '../errors.js';
export function runDto(row: { createdAt: Date; [key: string]: unknown }) {
  return aiRunSchema.parse({ ...row, createdAt: row.createdAt.toISOString() });
}
export function registerAiRuns(
  server: FastifyInstance,
  db: Database,
  auth: (r: FastifyRequest) => Promise<void>,
  csrf: (r: FastifyRequest) => Promise<void>,
) {
  const app = server.withTypeProvider<ZodTypeProvider>();
  async function owned(userId: string, applicationId: string) {
    if (
      !(await db.application.findFirst({
        where: {
          id: applicationId,
          userId,
          mode: 'LIVE',
          providerMissing: false,
          connection: { status: 'CONNECTED' },
        },
      }))
    )
      throw new AppError(404, 'APPLICATION_NOT_FOUND', 'سرویس متصل پیدا نشد.');
  }
  app.get(
    '/api/v1/reliability/runs',
    {
      preHandler: auth,
      schema: { querystring: z.object({ applicationId: z.uuid() }), response: { 200: aiRunList } },
    },
    async (r) => {
      await owned(r.auth!.user.id, r.query.applicationId);
      return {
        items: (
          await db.reliabilityRun.findMany({
            where: { userId: r.auth!.user.id, applicationId: r.query.applicationId },
            orderBy: { createdAt: 'desc' },
            take: 20,
          })
        ).map(runDto),
      };
    },
  );
  for (const kind of ['PATCH', 'ANALYSIS'] as const) {
    const body =
      kind === 'PATCH' ? patchInput : z.strictObject({ applicationId: z.uuid(), scanId: z.uuid() });
    app.post(
      `/api/v1/reliability/runs/${kind === 'PATCH' ? 'patch' : 'score'}`,
      {
        preHandler: csrf,
        config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
        schema: { body, response: { 202: aiRunSchema } },
      },
      async (r, reply) => {
        const input = r.body,
          userId = r.auth!.user.id;
        await owned(userId, input.applicationId);
        if (
          'scanId' in input &&
          !(await db.reliabilityTask.findFirst({
            where: {
              id: input.scanId,
              userId,
              applicationId: input.applicationId,
              kind: 'SCAN',
              state: 'SUCCEEDED',
            },
          }))
        )
          throw new AppError(404, 'SCAN_NOT_FOUND', 'اسکن موفق متعلق به همین سرویس پیدا نشد.');
        const run = await db.reliabilityRun.create({
          data: {
            userId,
            applicationId: input.applicationId,
            kind,
            input,
            events: [
              {
                sequence: 1,
                at: new Date().toISOString(),
                phase: 'QUEUED',
                message: 'درخواست ثبت شد؛ منتظر نوبت worker هستیم.',
              },
            ],
          },
        });
        return reply.code(202).send(runDto(run));
      },
    );
  }
}
