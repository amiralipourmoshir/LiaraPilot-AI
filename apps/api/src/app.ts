import { ServerFileError } from '../../../packages/monitoring/src/server-files.js';
import { registerAiRuns } from './monitoring/ai-runs.js';
import { ReliabilityService, registerReliabilityRoutes } from './monitoring/reliability.js';
import { MonitoringService } from './monitoring/service.js';
import { registerMonitoringRoutes } from './monitoring/routes.js';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../../../packages/database/src/index.js';
import { Prisma } from '../../../packages/database/src/index.js';
import type { Env } from '../../../packages/shared/src/env.js';
import {
  registerSchema,
  loginSchema,
  projectInputSchema,
  idParamsSchema,
  checkInputSchema,
  sessionSchema,
  projectSchema,
  operationSchema,
} from '../../../packages/shared/src/index.js';
import {
  digest,
  hashPassword,
  matchesDigest,
  randomToken,
  verifyPassword,
} from '../../../packages/security/src/auth.js';
import { AppError } from './errors.js';
import { LiaraService, type LiaraProviderFactory } from './connections/liara-service.js';
import { registerLiaraRoutes } from './connections/routes.js';
import { LiaraError } from '../../../packages/liara-adapter/src/errors.js';
import { CredentialError } from '../../../packages/security/src/credentials.js';

import { AssistantService } from './assistant/service.js';
import { registerAssistantRoutes } from './assistant/routes.js';
import { ModelError, type ModelProvider } from '../../../packages/ai-agent/src/provider.js';

import { DeploymentService } from './deployments/service.js';
import { registerDeploymentRoutes } from './deployments/routes.js';
import { DeploymentError } from '../../../packages/deployment/src/provider.js';
import { GithubRepository, RepositoryError } from '../../../packages/github-adapter/src/index.js';

import { GithubService } from './github/service.js';
import { registerGithubRoutes } from './github/routes.js';
const SESSION_COOKIE = 'lp_session';
const CSRF_COOKIE = 'lp_csrf';
type AuthContext = {
  user: { id: string; name: string; email: string };
  sessionHash: string;
  csrfHash: string;
};
declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}
const iso = (date: Date) => date.toISOString();
export async function buildApp(
  db: Database,
  env: Env,
  redisPing: () => Promise<string>,
  integration: {
    providerFactory?: LiaraProviderFactory;
    modelProvider?: ModelProvider;
    github?: GithubRepository;
  } = {},
) {
  const app = Fastify({
    bodyLimit: 16384,
    requestTimeout: 15000,
    logger: {
      level: env.LOG_LEVEL,
      redact: [
        'req.headers.cookie',
        'req.headers.authorization',
        'req.headers["x-csrf-token"]',
        'password',
        'passwordHash',
        'csrfToken',
        'token',
        'ciphertext',
        'authTag',
        'req.query.code',
        'req.query.state',
      ],
    },
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorateRequest('auth', null);
  await app.register(cookie);
  await app.register(helmet);
  await app.register(rateLimit, { global: true, max: 120, timeWindow: '1 minute' });
  await app.register(swagger, {
    openapi: {
      info: { title: 'LiaraPilot Foundation API', version: '0.2.0' },
      components: {
        securitySchemes: {
          session: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE },
          csrf: { type: 'apiKey', in: 'header', name: 'x-csrf-token' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  // Browser mutations require the exact app origin, including registration and login.
  app.addHook('onRequest', async (request) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      request.headers.origin !== env.APP_ORIGIN
    )
      throw new AppError(
        403,
        'ORIGIN_REJECTED',
        'مبدأ درخواست معتبر نیست. صفحه برنامه را دوباره باز کنید.',
      );
  });
  app.addHook('onSend', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ServerFileError)
      return reply
        .code(422)
        .send({ error: { code: error.code, message: error.message, requestId: request.id } });
    if (error instanceof DeploymentError)
      return reply
        .code(error.code === 'PAYMENT_REQUIRED' ? 402 : 502)
        .send({ error: { code: error.code, message: error.message, requestId: request.id } });
    if (error instanceof RepositoryError)
      return reply
        .code(422)
        .send({ error: { code: error.code, message: error.message, requestId: request.id } });
    if (error instanceof ModelError)
      return reply
        .code(error.code === 'MODEL_RATE_LIMITED' ? 429 : 502)
        .send({ error: { code: error.code, message: error.message, requestId: request.id } });
    if (error instanceof LiaraError) {
      if (error.retryAfter) reply.header('retry-after', error.retryAfter);
      return reply
        .code(error.statusCode)
        .send({ error: { code: error.code, message: error.message, requestId: request.id } });
    }
    if (error instanceof CredentialError)
      return reply.code(503).send({
        error: {
          code: 'CREDENTIAL_UNAVAILABLE',
          message: 'کلید رمزگذاری با این اتصال سازگار نیست. تنظیمات سرور را بررسی کنید.',
          requestId: request.id,
        },
      });
    const validation = typeof error === 'object' && error !== null && 'validation' in error;
    const rawStatus =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    const status = validation ? 400 : rawStatus;
    const code =
      error instanceof AppError
        ? error.code
        : validation
          ? 'VALIDATION_ERROR'
          : status === 429
            ? 'RATE_LIMITED'
            : status === 400
              ? 'BAD_REQUEST'
              : 'INTERNAL_ERROR';
    const message =
      error instanceof AppError
        ? error.message
        : validation
          ? 'اطلاعات واردشده معتبر نیست. فیلدها را بررسی کنید.'
          : status === 429
            ? 'تعداد درخواست‌ها زیاد است. کمی صبر کنید و دوباره تلاش کنید.'
            : status < 500
              ? 'درخواست قابل پردازش نیست.'
              : 'در پردازش درخواست مشکلی رخ داد. دوباره تلاش کنید.';
    if (status >= 500)
      request.log.error(
        { errorName: error instanceof Error ? error.name : 'UnknownError' },
        'Request failed',
      );
    return reply.code(status).send({ error: { code, message, requestId: request.id } });
  });
  app.setNotFoundHandler((request, reply) =>
    reply
      .code(404)
      .send({ error: { code: 'NOT_FOUND', message: 'مسیر پیدا نشد.', requestId: request.id } }),
  );
  const requireAuth = async (request: FastifyRequest) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'برای ادامه وارد حساب خود شوید.');
    const session = await db.session.findUnique({
      where: { idHash: digest(token) },
      select: {
        idHash: true,
        csrfHash: true,
        expiresAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!session || session.expiresAt <= new Date())
      throw new AppError(401, 'UNAUTHENTICATED', 'نشست شما پایان یافته است. دوباره وارد شوید.');
    request.auth = { user: session.user, sessionHash: session.idHash, csrfHash: session.csrfHash };
  };
  const requireCsrf = async (request: FastifyRequest) => {
    await requireAuth(request);
    const token = request.headers['x-csrf-token'];
    if (!request.auth || typeof token !== 'string' || !matchesDigest(token, request.auth.csrfHash))
      throw new AppError(403, 'CSRF_REJECTED', 'اعتبار درخواست منقضی شده است. صفحه را تازه کنید.');
  };
  const cookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: env.SESSION_TTL_HOURS * 3600,
  };
  async function startSession(
    user: AuthContext['user'],
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const sessionToken = randomToken();
    const csrfToken = randomToken();
    await db.$transaction(async (tx) => {
      const old = request.cookies[SESSION_COOKIE];
      if (old) await tx.session.deleteMany({ where: { idHash: digest(old) } });
      await tx.session.create({
        data: {
          idHash: digest(sessionToken),
          csrfHash: digest(csrfToken),
          userId: user.id,
          expiresAt: new Date(Date.now() + env.SESSION_TTL_HOURS * 3600000),
        },
      });
      await tx.auditLog.create({
        data: { userId: user.id, action: 'auth.session.started', requestId: request.id },
      });
    });
    reply
      .setCookie(SESSION_COOKIE, sessionToken, cookieOptions)
      .setCookie(CSRF_COOKIE, csrfToken, cookieOptions);
    return { user, csrfToken };
  }
  app.get(
    '/api/v1/health/live',
    { schema: { response: { 200: z.object({ status: z.literal('ok') }) } } },
    async () => ({ status: 'ok' as const }),
  );
  app.get('/api/v1/health/ready', async (_request, reply) => {
    const results = await Promise.allSettled([db.$queryRaw`SELECT 1`, redisPing()]);
    const ready = results.every((result) => result.status === 'fulfilled');
    return reply.code(ready ? 200 : 503).send({
      status: ready ? 'ready' : 'unavailable',
      database: results[0]?.status === 'fulfilled',
      redis: results[1]?.status === 'fulfilled',
    });
  });
  app.get('/api/v1/openapi.json', { preHandler: requireAuth }, async () => app.swagger());
  app.post(
    '/api/v1/auth/register',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: { body: registerSchema, response: { 201: sessionSchema } },
    },
    async (request, reply) => {
      const { name, email, password } = request.body;
      const passwordHash = await hashPassword(password);
      try {
        const user = await db.user.create({
          data: { name, email, passwordHash },
          select: { id: true, name: true, email: true },
        });
        const session = await startSession(user, request, reply);
        return reply.code(201).send(session);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw new AppError(409, 'EMAIL_EXISTS', 'این ایمیل قبلاً ثبت شده است. وارد حساب شوید.');
        throw error;
      }
    },
  );
  // A fixed-cost dummy hash prevents a missing account from skipping password verification.
  const dummyHash = await hashPassword(randomToken());
  app.post(
    '/api/v1/auth/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { body: loginSchema, response: { 200: sessionSchema } },
    },
    async (request, reply) => {
      const user = await db.user.findUnique({ where: { email: request.body.email } });
      const valid = await verifyPassword(user?.passwordHash ?? dummyHash, request.body.password);
      if (!user || !valid)
        throw new AppError(401, 'INVALID_CREDENTIALS', 'ایمیل یا رمز عبور درست نیست.');
      return startSession({ id: user.id, name: user.name, email: user.email }, request, reply);
    },
  );
  app.get(
    '/api/v1/auth/session',
    { preHandler: requireAuth, schema: { response: { 200: sessionSchema } } },
    async (request) => {
      const csrfToken = request.cookies[CSRF_COOKIE];
      if (!request.auth || !csrfToken || !matchesDigest(csrfToken, request.auth.csrfHash))
        throw new AppError(401, 'UNAUTHENTICATED', 'دوباره وارد حساب خود شوید.');
      return { user: request.auth.user, csrfToken };
    },
  );
  app.post('/api/v1/auth/logout', { preHandler: requireCsrf }, async (request, reply) => {
    const auth = request.auth!;
    await db.$transaction([
      db.session.deleteMany({ where: { idHash: auth.sessionHash } }),
      db.auditLog.create({
        data: { userId: auth.user.id, action: 'auth.session.ended', requestId: request.id },
      }),
    ]);
    return reply
      .clearCookie(SESSION_COOKIE, { path: '/' })
      .clearCookie(CSRF_COOKIE, { path: '/' })
      .code(204)
      .send();
  });
  const projectDto = (project: {
    id: string;
    name: string;
    mode: 'DEMO' | 'LIVE';
    createdAt: Date;
  }) => ({
    id: project.id,
    name: project.name,
    mode: project.mode,
    createdAt: iso(project.createdAt),
  });
  app.get(
    '/api/v1/projects',
    {
      preHandler: requireAuth,
      schema: { response: { 200: z.object({ projects: z.array(projectSchema) }) } },
    },
    async (request) => ({
      projects: (
        await db.project.findMany({
          where: { userId: request.auth!.user.id },
          orderBy: { createdAt: 'desc' },
          take: 100,
        })
      ).map(projectDto),
    }),
  );
  app.post(
    '/api/v1/projects',
    {
      preHandler: requireCsrf,
      schema: { body: projectInputSchema, response: { 201: projectSchema } },
    },
    async (request, reply) => {
      const project = await db.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: { userId: request.auth!.user.id, name: request.body.name, mode: 'DEMO' },
        });
        await tx.auditLog.create({
          data: {
            userId: project.userId,
            action: 'project.created',
            resourceId: project.id,
            requestId: request.id,
          },
        });
        return project;
      });
      return reply.code(201).send(projectDto(project));
    },
  );
  app.get(
    '/api/v1/projects/:id',
    {
      preHandler: requireAuth,
      schema: { params: idParamsSchema, response: { 200: projectSchema } },
    },
    async (request) => {
      const project = await db.project.findFirst({
        where: { id: request.params.id, userId: request.auth!.user.id },
      });
      if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', 'پروژه پیدا نشد.');
      return projectDto(project);
    },
  );
  app.post(
    '/api/v1/foundation/checks',
    {
      preHandler: requireCsrf,
      schema: { body: checkInputSchema, headers: z.object({ 'idempotency-key': z.uuid() }) },
    },
    async (request, reply) => {
      const userId = request.auth!.user.id;
      const project = await db.project.findFirst({
        where: { id: request.body.projectId, userId, mode: 'DEMO' },
      });
      if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', 'پروژه پیدا نشد.');
      const key = request.headers['idempotency-key'];
      const requestHash = digest(
        JSON.stringify({ projectId: project.id, type: 'FOUNDATION_CHECK', mode: 'DEMO' }),
      );
      const getExisting = () =>
        db.operation.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
        });
      let operation = await getExisting();
      if (!operation) {
        try {
          operation = await db.$transaction(async (tx) => {
            const record = await tx.operation.create({
              data: {
                userId,
                projectId: project.id,
                mode: 'DEMO',
                idempotencyKey: key,
                requestHash,
                outbox: { create: {} },
                events: {
                  create: {
                    sequence: 1,
                    type: 'operation.queued',
                    message: 'درخواست بررسی زیرساخت ثبت شد و منتظر پردازشگر است.',
                  },
                },
              },
            });
            await tx.auditLog.create({
              data: {
                userId,
                action: 'foundation.check.requested',
                resourceId: record.id,
                requestId: request.id,
              },
            });
            return record;
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
            operation = await getExisting();
          else throw error;
        }
      }
      if (!operation || operation.requestHash !== requestHash)
        throw new AppError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'این شناسه قبلاً برای درخواست دیگری استفاده شده است.',
        );
      return reply.code(202).send({ operationId: operation.id });
    },
  );
  app.get(
    '/api/v1/operations/:id',
    {
      preHandler: requireAuth,
      schema: { params: idParamsSchema, response: { 200: operationSchema } },
    },
    async (request) => {
      const operation = await db.operation.findFirst({
        where: { id: request.params.id, userId: request.auth!.user.id },
        include: { events: { orderBy: { sequence: 'asc' } } },
      });
      if (!operation) throw new AppError(404, 'OPERATION_NOT_FOUND', 'عملیات پیدا نشد.');
      return {
        id: operation.id,
        projectId: operation.projectId,
        mode: operation.mode,
        type: 'FOUNDATION_CHECK' as const,
        state: operation.state,
        createdAt: iso(operation.createdAt),
        completedAt: operation.completedAt ? iso(operation.completedAt) : null,
        errorCode: operation.errorCode,
        events: operation.events.map((event) => ({
          sequence: event.sequence,
          type: event.type,
          message: event.message,
          createdAt: iso(event.createdAt),
        })),
      };
    },
  );
  const liara = new LiaraService(db, env, integration.providerFactory);
  registerLiaraRoutes(app, liara, requireAuth, requireCsrf);
  registerAiRuns(app, db, requireAuth, requireCsrf);
  const github = new GithubService(db, env);
  registerGithubRoutes(app, github, env, requireAuth, requireCsrf);
  registerReliabilityRoutes(
    app,
    new ReliabilityService(db, env, integration.modelProvider),
    requireAuth,
    requireCsrf,
  );
  const deployments = new DeploymentService(
    db,
    liara,
    integration.github,
    integration.github ? undefined : github,
    env,
  );
  registerAssistantRoutes(
    app,
    new AssistantService(db, env, liara, integration.modelProvider, deployments),
    requireAuth,
    requireCsrf,
  );
  registerDeploymentRoutes(app, deployments, requireAuth, requireCsrf);
  registerMonitoringRoutes(
    app,
    new MonitoringService(db, env, liara, integration.modelProvider),
    requireAuth,
    requireCsrf,
  );
  return app;
}
