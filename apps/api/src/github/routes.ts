import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  githubStatusSchema,
  repositoryBranchesSchema,
  repositoryRequestSchema,
} from '../../../../packages/shared/src/wizard.js';
import type { Env } from '../../../../packages/shared/src/env.js';
import type { GithubService } from './service.js';
export function registerGithubRoutes(
  server: FastifyInstance,
  service: GithubService,
  env: Env,
  auth: (r: FastifyRequest) => Promise<void>,
  csrf: (r: FastifyRequest) => Promise<void>,
) {
  const app = server.withTypeProvider<ZodTypeProvider>();
  app.get(
    '/api/v1/github/status',
    { preHandler: auth, schema: { response: { 200: githubStatusSchema } } },
    (r) => service.status(r.auth!.user.id),
  );
  app.post(
    '/api/v1/github/connect',
    {
      preHandler: csrf,
      schema: {
        body: z.strictObject({
          returnTo: z
            .string()
            .regex(/^\/workspace\/assistant(?:\?conversation=[a-f0-9-]{36})?$/)
            .optional(),
        }),
        response: { 200: z.object({ url: z.url() }) },
      },
    },
    async (r, reply) => {
      const result = await service.begin(r.auth!.user.id);
      reply.setCookie('lp_github_binding', result.binding, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/v1/github/callback',
        maxAge: 600,
      });
      if (r.body.returnTo)
        reply.setCookie('lp_github_return', r.body.returnTo, {
          httpOnly: true,
          secure: env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/api/v1/github/callback',
          maxAge: 600,
        });
      return { url: result.url };
    },
  );
  app.get(
    '/api/v1/github/callback',
    {
      logLevel: 'silent',
      schema: {
        querystring: z.object({
          state: z.string().max(200),
          code: z.string().max(300).optional(),
          error: z.string().max(100).optional(),
        }),
      },
    },
    async (r, reply) => {
      try {
        if (!r.query.code || r.query.error) throw new Error('denied');
        await service.callback(r.query.state, r.query.code, r.cookies.lp_github_binding ?? '');
        reply.clearCookie('lp_github_binding', { path: '/api/v1/github/callback' });
        const back = r.cookies.lp_github_return ?? '';
        reply.clearCookie('lp_github_return', { path: '/api/v1/github/callback' });
        const target = /^\/workspace\/assistant(?:\?conversation=[a-f0-9-]{36})?$/.test(back)
          ? back
          : '/workspace/deployments';
        return reply.redirect(
          env.APP_ORIGIN + target + (target.includes('?') ? '&' : '?') + 'github=connected',
        );
      } catch {
        return reply.redirect(env.APP_ORIGIN + '/workspace/deployments?github=failed');
      }
    },
  );
  app.post(
    '/api/v1/github/disconnect',
    { preHandler: csrf, schema: { body: z.strictObject({}) } },
    (r) => service.disconnect(r.auth!.user.id),
  );
  app.post(
    '/api/v1/repositories/branches',
    {
      preHandler: csrf,
      schema: { body: repositoryRequestSchema, response: { 200: repositoryBranchesSchema } },
    },
    async (r) => (await service.client(r.auth!.user.id)).branches(r.body.repositoryUrl),
  );
}
