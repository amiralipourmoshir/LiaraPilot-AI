import { MonitoringService } from '../apps/api/src/monitoring/service.js';
import { monitoringTick } from '../packages/monitoring/src/check.js';
import { AssistantService } from '../apps/api/src/assistant/service.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pino from 'pino';
import { buildApp } from '../apps/api/src/app.js';
import { createDatabase } from '../packages/database/src/index.js';
import { LiaraClient } from '../packages/liara-adapter/src/client.js';
import { createDeploymentRuntime } from '../packages/deployment/src/queue.js';
import { runDeployment, type RunnerDependencies } from '../packages/deployment/src/runner.js';
import { DeploymentService } from '../apps/api/src/deployments/service.js';
import { LiaraService } from '../apps/api/src/connections/liara-service.js';
import { testEnv } from './environment.js';
import { githubFixture } from './repository-fixture.js';
const db = createDatabase(testEnv.DATABASE_URL);
const env = { ...testEnv, CREDENTIAL_KEY: Buffer.alloc(32, 9).toString('base64') };
const github = githubFixture();
const users: string[] = [];
let ip = 1;
let posts = 0;
let probes = 0;
let releaseReady = true;
let healthMatches = true;
let chatReply: import('../packages/ai-agent/src/provider.js').ModelReply = {
  text: 'سلام',
  calls: [],
};
const app = await buildApp(db, env, async () => 'PONG', {
  github: github.client,
  modelProvider: { complete: async () => chatReply },
  providerFactory: (token, team) =>
    new LiaraClient(token, team, {
      fetch: async (input) =>
        Response.json(
          String(input).endsWith('/v1/projects')
            ? {
                projects: [
                  {
                    _id: 'provider-test',
                    project_id: 'deployment-app',
                    type: 'node',
                    planID: 'existing-plan',
                  },
                ],
              }
            : {
                project: {
                  _id: 'provider-test',
                  project_id: 'deployment-app',
                  type: 'node',
                  planID: 'existing-plan',
                },
              },
        ),
    }),
});
type Account = { id: string; cookie: string; csrf: string };
let alice: Account, bob: Account;
let applicationId: string, connectionId: string;
const headers = (a: Account) => ({
  cookie: a.cookie,
  origin: env.APP_ORIGIN,
  'x-csrf-token': a.csrf,
});
const inject = (o: import('fastify').InjectOptions) =>
  app.inject({ ...o, remoteAddress: `127.0.0.${ip}` });
const deps: RunnerDependencies = {
  github: github.client,
  wait: async () => {},
  health: async () => {
    probes++;
    return { status: 200, matched: healthMatches };
  },
  provider: () => ({
    application: async () => ({ providerId: 'provider-test', planId: 'existing-plan' }),
    upload: async () => {
      posts++;
      return 'source-id';
    },
    release: async () => {
      posts++;
      return 'release-id';
    },
    releases: async () => [{ id: 'release-id', state: releaseReady ? 'READY' : 'BUILDING' }],
  }),
};
async function account(): Promise<Account> {
  const r = await inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: { origin: env.APP_ORIGIN },
    payload: {
      name: 'آزمون انتشار',
      email: `deploy-${randomUUID()}@example.test`,
      password: 'fixture-secure-password-123',
    },
  });
  expect(r.statusCode).toBe(201);
  const b = r.json();
  users.push(b.user.id);
  return {
    id: b.user.id,
    cookie: r.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
    csrf: b.csrfToken,
  };
}
const plan = async () => {
  const r = await inject({
    method: 'POST',
    url: '/api/v1/deployments',
    headers: headers(alice),
    payload: {
      repositoryUrl: 'https://github.com/owner/repo',
      applicationId,
      port: 3000,
      healthPath: '/health',
      expectedText: 'healthy',
    },
  });
  expect(r.statusCode).toBe(201);
  return r.json() as { id: string; hash: string; snapshot: unknown };
};
const decide = (p: { id: string; hash: string }, decision = 'approve', owner = alice) =>
  inject({
    method: 'POST',
    url: `/api/v1/deployments/${p.id}/decision`,
    headers: headers(owner),
    payload: { hash: p.hash, decision },
  });
beforeAll(async () => {
  alice = await account();
  bob = await account();
  const r = await inject({
    method: 'POST',
    url: '/api/v1/connections/liara',
    headers: headers(alice),
    payload: { label: 'حساب تست انتشار', token: 'fixture-token-not-real-1234' },
  });
  expect(r.statusCode).toBe(201);
  connectionId = r.json().id;
  applicationId = (await db.application.findFirstOrThrow({ where: { userId: alice.id } })).id;
});
beforeEach(() => {
  ip++;
  posts = 0;
  probes = 0;
  releaseReady = true;
  healthMatches = true;
});
afterAll(async () => {
  await db.conversation.deleteMany({ where: { userId: { in: users } } });
  await db.deployment.deleteMany({ where: { userId: { in: users } } });
  await db.auditLog.deleteMany({ where: { userId: { in: users } } });
  await db.application.deleteMany({ where: { userId: { in: users } } });
  await db.providerConnection.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await app.close();
  await db.$disconnect();
});
describe('operational monitoring, incidents and recovery history', () => {
  it('registers an existing service, opens one incident, diagnoses evidence and verifies an approved path correction', async () => {
    let checks = 0;
    const liara = new LiaraService(
      db,
      env,
      (token, team) =>
        new LiaraClient(token, team, {
          fetch: async (input) =>
            Response.json(
              String(input).includes('/logs')
                ? { data: [] }
                : {
                    project: {
                      _id: 'provider-test',
                      project_id: 'deployment-app',
                      type: 'node',
                      planID: 'existing-plan',
                    },
                  },
            ),
        }),
    );
    const service = new MonitoringService(
      db,
      env,
      liara,
      {
        complete: async (messages) => {
          const context = JSON.parse(messages[1]!.content);
          return {
            text: null,
            calls: [
              {
                name: 'diagnose_incident',
                arguments: JSON.stringify({
                  summary: 'مسیر بررسی پاسخ ۴۰۴ دارد.',
                  hypotheses: [
                    {
                      text: 'مسیر سلامت ممکن است اشتباه باشد.',
                      evidenceIds: [context.evidence[0].id],
                    },
                  ],
                  question: 'مسیر اصلی برنامه باز می‌شود؟',
                  options: ['بله', 'خیر'],
                }),
              },
            ],
          };
        },
      },
      async (_name, path) => {
        checks++;
        return { status: path === '/' ? 200 : 404, matched: path === '/' };
      },
    );
    const monitor = await service.create(
      alice.id,
      { applicationId, path: '/missing', intervalSeconds: 60, failureThreshold: 2 },
      'monitor-test',
    );
    expect(monitor.lastCheckedAt).toBeNull();
    await service.check(alice.id, monitor.id);
    await service.check(alice.id, monitor.id);
    await service.check(alice.id, monitor.id);
    const overview = await service.overview(alice.id),
      incident = overview.incidents.find((i) => i.monitorId === monitor.id)!;
    expect(overview.incidents.filter((i) => i.monitorId === monitor.id)).toHaveLength(1);
    expect(incident.state).toBe('OPEN');
    const diagnosed = await service.diagnose(
      alice.id,
      incident.id,
      { answers: [] },
      'diagnose-test',
    );
    expect(diagnosed.diagnosis).toMatchObject({
      summary: 'مسیر بررسی پاسخ ۴۰۴ دارد.',
      logsAvailable: true,
    });
    await expect(service.detail(bob.id, incident.id)).rejects.toHaveProperty(
      'code',
      'INCIDENT_NOT_FOUND',
    );
    const action = await service.prepare(alice.id, incident.id, 'prepare-test', {
      path: '/',
      expectedText: '',
    });
    expect((await db.healthMonitor.findUniqueOrThrow({ where: { id: monitor.id } })).path).toBe(
      '/missing',
    );
    await expect(
      service.decide(alice.id, action.id, 'f'.repeat(64), true, 'bad-hash'),
    ).rejects.toHaveProperty('code', 'PLAN_CHANGED');
    const done = await service.decide(alice.id, action.id, action.hash, true, 'approve-test');
    expect(done.result).toMatchObject({ outcome: 'RESOLVED' });
    expect((await service.detail(alice.id, incident.id)).state).toBe('RESOLVED');
    const count = checks;
    await service.decide(alice.id, action.id, action.hash, true, 'repeat-test');
    expect(checks).toBe(count);
    const history = await service.history(alice.id, 1, 'health.');
    expect(history.items.some((i) => i.target === `/incidents/${incident.id}`)).toBe(true);
    expect(
      (await service.history(bob.id, 1, 'health.')).items.some((i) => i.resourceId === action.id),
    ).toBe(false);
    await service.settings(alice.id, monitor.id, {
      enabled: false,
      intervalSeconds: 60,
      failureThreshold: 2,
    });
    await db.healthMonitor.update({
      where: { id: monitor.id },
      data: { nextCheckAt: new Date(0) },
    });
    await monitoringTick(db, async () => {
      throw new Error('Paused monitor must not run');
    });
    expect((await db.healthMonitor.findUniqueOrThrow({ where: { id: monitor.id } })).enabled).toBe(
      false,
    );
    const denied = await inject({
      method: 'POST',
      url: `/api/v1/monitoring/${monitor.id}/check`,
      headers: headers(bob),
      payload: {},
    });
    expect(denied.statusCode).toBe(404);
    expect(posts).toBe(0);
  });
});

describe('agent resource consultation', () => {
  it('blocks a new-service draft before cloud mutations when positive balance is below the weekly requirement', async () => {
    const liara = new LiaraService(db, env);
    liara.catalog = async () => ({
      plans: [
        {
          id: 'g2-test',
          bundleId: 'basic',
          name: 'زمین',
          planet: 'earth',
          bundleName: 'پایه',
          estimatedHourlyToman: 100,
          ramGb: 1,
          cpu: 1,
          diskGb: 10,
          estimatedMonthlyToman: 300000,
          recommended: true,
        },
      ],
      networks: [{ id: 'network1', name: 'شبکه' }],
      billing: {
        hasCredit: true,
        balanceToman: 100000,
        currentMonthlyToman: 600000,
        paymentUrl: 'https://console.liara.ir/credit',
      },
      fetchedAt: new Date().toISOString(),
    });
    const service = new DeploymentService(db, liara, github.client, undefined, env);
    const a = await service.analyze(alice.id, {
      repositoryUrl: 'https://github.com/owner/repo',
      branch: 'main',
    });
    await expect(
      service.guidedPlan(
        alice.id,
        {
          analysisId: a.id,
          connectionId,
          target: 'new',
          name: 'credit-check',
          planId: 'g2-test',
          bundleId: 'basic',
          networkId: 'network1',
        },
        'test-credit',
      ),
    ).rejects.toHaveProperty('code', 'CREATION_CREDIT_REQUIRED');
    expect(posts).toBe(0);
  });

  it('grounds execution advice in the owned attempt and does not let the model declare unverified success', async () => {
    const p = await plan();
    const deployments = new DeploymentService(
      db,
      new LiaraService(db, env),
      github.client,
      undefined,
      env,
    );
    const service = new AssistantService(
      db,
      env,
      new LiaraService(db, env),
      {
        complete: async (messages) => {
          expect(JSON.parse(messages[1]!.content).state).toBe('PLANNED');
          return {
            text: null,
            calls: [
              {
                name: 'explain_execution',
                arguments: JSON.stringify({
                  summary: 'وضعیت باید بررسی شود.',
                  question: '',
                  options: [],
                  nextStep: 'COMPLETE',
                }),
              },
            ],
          };
        },
      },
      deployments,
    );
    expect((await service.explainExecution(alice.id, p.id, { answers: [] })).nextStep).toBe(
      'RECHECK',
    );
    await expect(service.explainExecution(bob.id, p.id, { answers: [] })).rejects.toHaveProperty(
      'code',
      'DEPLOYMENT_NOT_FOUND',
    );
    expect(posts).toBe(0);
  });

  it('asks a model-generated question, uses the answer, and validates its recommendation against live options', async () => {
    const liara = new LiaraService(db, env);
    liara.catalog = async () => ({
      plans: [
        {
          id: 'standard-base-g2',
          bundleId: 'standard',
          name: 'مشتری',
          planet: 'jupiter',
          bundleName: 'نقره‌ای',
          estimatedHourlyToman: 4096,
          ramGb: 2,
          cpu: 1,
          diskGb: 20,
          estimatedMonthlyToman: 2950000,
          recommended: true,
        },
      ],
      networks: [],
      billing: { hasCredit: true, paymentUrl: 'https://console.liara.ir/credit' },
      fetchedAt: new Date().toISOString(),
    });
    const deployments = new DeploymentService(db, liara, github.client, undefined, env);
    const analysis = await deployments.analyze(alice.id, {
      repositoryUrl: 'https://github.com/owner/repo',
      branch: 'main',
    });
    let recommendation = false,
      invalid = false,
      finalCalls = 0;
    const service = new AssistantService(
      db,
      env,
      liara,
      {
        complete: async (messages, tools, force) => {
          expect(force).toBe('resource_advice');
          expect(tools[0]?.name).toBe('resource_advice');
          const context = JSON.parse(messages[1]!.content);
          expect(context.project.platform).toBe('node');
          expect(context.catalog[0].monthlyToman).toBe(2950000);
          if (context.answers.length >= 3) {
            expect(tools[0]?.parameters).toMatchObject({
              properties: {
                question: { enum: [''] },
                planKey: { enum: ['standard-base-g2|standard'] },
              },
            });
            finalCalls++;
            return {
              text: null,
              calls: [
                {
                  name: 'resource_advice',
                  arguments: JSON.stringify(
                    finalCalls === 1
                      ? {
                          question: 'یک سؤال اضافی؟',
                          options: [],
                          planKey: '',
                          explanation: 'پرسش اضافی مدل',
                        }
                      : {
                          question: '',
                          options: [],
                          planKey: 'standard-base-g2|standard',
                          explanation: 'پیشنهاد نهایی بر اساس هر سه پاسخ شما.',
                        },
                  ),
                },
              ],
            };
          }

          if (recommendation) expect(context.answers[0].answer).toBe('یک محصول برای مشتریان');
          return {
            text: null,
            calls: [
              {
                name: 'resource_advice',
                arguments: JSON.stringify(
                  recommendation
                    ? {
                        question: '',
                        options: [],
                        planKey: invalid ? 'invented|pro' : 'standard-base-g2|standard',
                        explanation:
                          'برای شروع محصول، مشتری نقره‌ای را با ۲ گیگابایت حافظه پیشنهاد می‌کنم.',
                      }
                    : {
                        question: 'چه استفاده‌ای از پروژه دارید؟',
                        options: ['تمرین شخصی', 'یک محصول برای مشتریان'],
                        planKey: '',
                        explanation: 'پیشنهاد منابع را با کاربرد شما هماهنگ می‌کنم.',
                      },
                ),
              },
            ],
          };
        },
      },
      deployments,
    );
    const first = await service.adviseResources(alice.id, analysis.id, {
      connectionId,
      answers: [],
    });
    expect(first.question).toContain('استفاده');
    expect(first.planKey).toBe('');
    recommendation = true;
    const input = {
      connectionId,
      answers: [{ question: first.question, answer: 'یک محصول برای مشتریان' }],
    };
    expect((await service.adviseResources(alice.id, analysis.id, input)).planKey).toBe(
      'standard-base-g2|standard',
    );
    const final = await service.adviseResources(alice.id, analysis.id, {
      connectionId,
      answers: [...input.answers, ...input.answers, ...input.answers],
    });
    expect(final.planKey).toBe('standard-base-g2|standard');
    expect(final.question).toBe('');
    expect(finalCalls).toBe(2);
    invalid = true;
    await expect(service.adviseResources(alice.id, analysis.id, input)).rejects.toHaveProperty(
      'code',
      'RESOURCE_ADVICE_UNAVAILABLE',
    );
    await expect(service.adviseResources(bob.id, analysis.id, input)).rejects.toHaveProperty(
      'code',
      'ANALYSIS_NOT_FOUND',
    );
    expect(posts).toBe(0);
  });
});

describe('read-only deployment recovery and renewed approval', () => {
  function recoveryService(releaseState = 'READY', currentRelease = 'release-id') {
    const reads: string[] = [];
    const service = new DeploymentService(
      db,
      new LiaraService(
        db,
        env,
        (token, team) =>
          new LiaraClient(token, team, {
            fetch: async (input, init) => {
              expect(init?.method ?? 'GET').toBe('GET');
              reads.push(String(input));
              return Response.json(
                String(input).includes('/releases')
                  ? { currentRelease, releases: [{ _id: 'release-id', state: releaseState }] }
                  : {
                      project: {
                        _id: 'provider-test',
                        project_id: 'deployment-app',
                        type: 'node',
                        planID: 'existing-plan',
                      },
                    },
              );
            },
          }),
      ),
      github.client,
      undefined,
      env,
      async () => {
        probes++;
        return { status: 200, matched: true };
      },
    );
    return { service, reads };
  }
  it('reconciles a ready release using two real health probes without another deployment', async () => {
    const p = await plan();
    await db.deployment.update({
      where: { id: p.id },
      data: {
        state: 'NEEDS_ATTENTION',
        phase: 'RELEASE_POLL',
        releaseId: 'release-id',
        sourceId: 'source-id',
        errorCode: 'DEPLOYMENT_INCOMPLETE',
      },
    });
    const { service, reads } = recoveryService();
    const result = await service.recheck(alice.id, p.id, 'test-recheck');
    expect(result.state).toBe('SUCCEEDED');
    expect(result.recovery).toMatchObject({ status: 'VERIFIED', canRetry: false });
    expect(probes).toBe(2);
    expect(reads.length).toBe(2);
    expect(posts).toBe(0);
  });
  it('blocks a duplicate attempt while the previous release is still building', async () => {
    const p = await plan();
    await db.deployment.update({
      where: { id: p.id },
      data: {
        state: 'NEEDS_ATTENTION',
        phase: 'RELEASE_POLL',
        releaseId: 'release-id',
        sourceId: 'source-id',
      },
    });
    const { service } = recoveryService('BUILDING');
    expect((await service.recheck(alice.id, p.id, 'test-check')).recovery).toMatchObject({
      status: 'IN_PROGRESS',
      canRetry: false,
    });
    await expect(service.retryPlan(alice.id, p.id, p.hash, 'test-retry')).rejects.toHaveProperty(
      'code',
      'RECHECK_REQUIRED',
    );
    expect(posts).toBe(0);
  });
  it('keeps an ambiguous release request blocked and rejects cross-owner rechecks', async () => {
    const p = await plan();
    await db.deployment.update({
      where: { id: p.id },
      data: {
        state: 'NEEDS_ATTENTION',
        phase: 'RELEASE_REQUEST',
        sourceId: 'source-id',
        errorCode: 'DEPLOYMENT_INCOMPLETE',
      },
    });
    const { service } = recoveryService();
    expect((await service.recheck(alice.id, p.id, 'test-check')).recovery).toMatchObject({
      status: 'UNKNOWN',
      canRetry: false,
    });
    expect(
      (
        await inject({
          method: 'POST',
          url: `/api/v1/deployments/${p.id}/recheck`,
          headers: headers(bob),
          payload: {},
        })
      ).statusCode,
    ).toBe(404);
    expect(posts).toBe(0);
  });
  it('prepares one fresh draft after a source failure and still requires a new approval', async () => {
    const p = await plan();
    await db.deployment.update({
      where: { id: p.id },
      data: { state: 'NEEDS_ATTENTION', phase: 'SOURCE_FETCH', errorCode: 'GITHUB_RATE_LIMITED' },
    });
    const { service } = recoveryService();
    const next = await service.retryPlan(alice.id, p.id, p.hash, 'test-retry');
    expect(next.state).toBe('PLANNED');
    expect(next.retryOf).toBe(p.id);
    expect(next.id).not.toBe(p.id);
    expect((await service.retryPlan(alice.id, p.id, p.hash, 'test-retry-repeat')).id).toBe(next.id);
    expect((await service.detail(alice.id, p.id)).retryId).toBe(next.id);
    expect(await db.deploymentOutbox.count({ where: { deploymentId: next.id } })).toBe(0);
    expect(posts).toBe(0);
  });
});

describe('approved deployment, durable queue and verification', () => {
  it('persists repository progress and rejects cross-owner inspection access', async () => {
    const started = await inject({
      method: 'POST',
      url: '/api/v1/repositories/inspections',
      headers: headers(alice),
      payload: { repositoryUrl: 'https://github.com/owner/repo', branch: 'main' },
    });
    expect(started.statusCode).toBe(202);
    const id = started.json().id;
    expect(
      (await inject({ url: `/api/v1/repositories/inspections/${id}`, headers: headers(bob) }))
        .statusCode,
    ).toBe(404);
    let result = started.json();
    for (let i = 0; i < 60 && result.state !== 'SUCCEEDED'; i++) {
      await new Promise((r) => setTimeout(r, 20));
      result = (
        await inject({ url: `/api/v1/repositories/inspections/${id}`, headers: headers(alice) })
      ).json();
    }
    expect(result.state).toBe('SUCCEEDED');
    expect(result.events.length).toBeGreaterThan(3);
    expect(result.result.manifest.framework).toBe('express');
    const stream = await inject({
      url: `/api/v1/repositories/inspections/${id}/events`,
      headers: headers(alice),
    });
    expect(stream.headers['content-type']).toContain('text/event-stream');
    expect(stream.body).toContain('SUCCEEDED');
    expect(posts).toBe(0);
  });
  it('resolves only commands evidenced in the selected project', async () => {
    const service = new DeploymentService(
      db,
      new LiaraService(db, env),
      github.client,
      undefined,
      env,
    );
    const a = await service.analyze(alice.id, {
      repositoryUrl: 'https://github.com/owner/repo',
      branch: 'main',
    });
    a.manifest.start = null;
    a.manifest.blockers = ['فرمان اجرای برنامه از فایل‌ها مشخص نشد؛ تنظیم اجرا لازم است.'];
    a.manifest.analysis!.scripts = { serve: 'node server.js' };
    await db.repositoryAnalysis.update({
      where: { id: a.id },
      data: { manifest: JSON.parse(JSON.stringify(a.manifest)) },
    });
    await expect(
      service.resolve(alice.id, a.id, { startScript: 'injected-command' }),
    ).rejects.toHaveProperty('code', 'INVALID_PROJECT_SCRIPT');
    await expect(service.resolve(bob.id, a.id, { startScript: 'serve' })).rejects.toHaveProperty(
      'code',
      'ANALYSIS_EXPIRED',
    );
    const resolved = await service.resolve(alice.id, a.id, { startScript: 'serve' });
    expect(resolved.manifest.start).toBe('node server.js');
    expect(resolved.manifest.blockers).toEqual([]);
  });
  it('creates a deployment plan from a structured chat call without executing it', async () => {
    const c = await inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: headers(alice),
      payload: {},
    });
    const conversationId = c.json().id;
    chatReply = {
      text: null,
      calls: [
        {
          name: 'plan_deployment',
          arguments: JSON.stringify({
            repositoryUrl: 'https://github.com/owner/repo',
          }),
        },
      ],
    };
    const r = await inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/messages`,
      headers: { ...headers(alice), 'idempotency-key': randomUUID() },
      payload: { content: 'طرح انتشار را آماده کن', applicationId },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().messages.at(-1).actionPath).toMatch(/^\/deployments\?repository=/);
    expect(posts).toBe(0);
  });
  it('recommends and provisions a first service and network only after credit and explicit approval', async () => {
    const liara = new LiaraService(
      db,
      env,
      (token, team) =>
        new LiaraClient(token, team, { fetch: async () => Response.json({ projects: [] }) }),
    );
    const connection = await liara.connect(
      bob.id,
      { label: 'حساب بدون سرویس', token: 'fixture-empty-account-token' },
      'zero-services',
    );
    let hasCredit = false;
    liara.catalog = async () => ({
      plans: [
        {
          id: 'g2-first',
          bundleId: 'free',
          name: 'first',
          planet: null,
          bundleName: 'پایه',
          estimatedHourlyToman: 100,
          ramGb: 1,
          cpu: 1,
          diskGb: 10,
          estimatedMonthlyToman: 72000,
          recommended: true,
        },
      ],
      networks: [],
      billing: { hasCredit, paymentUrl: 'https://console.liara.ir/credit' },
      fetchedAt: new Date().toISOString(),
    });
    const service = new DeploymentService(db, liara, github.client, undefined, env);
    const analysis = await service.analyze(bob.id, {
      repositoryUrl: 'https://github.com/owner/repo',
      branch: 'main',
    });
    const options = await service.options(bob.id, analysis.id, connection.id);
    expect(options.applications).toEqual([]);
    expect(options.plans[0]!.recommended).toBe(true);
    const input = {
      analysisId: analysis.id,
      connectionId: connection.id,
      target: 'new' as const,
      name: 'first-service',
      planId: 'g2-first',
      bundleId: 'free',
    };
    await expect(service.guidedPlan(bob.id, input, 'no-credit')).rejects.toHaveProperty(
      'code',
      'PAYMENT_REQUIRED',
    );
    expect(posts).toBe(0);
    hasCredit = true;
    const plan = await service.guidedPlan(bob.id, input, 'credit-refreshed');
    expect(posts).toBe(0);
    await service.decide(
      bob.id,
      plan.id,
      { hash: plan.hash, decision: 'approve' },
      'first-approval',
    );
    const actions: string[] = [];
    await runDeployment(db, env, plan.id, {
      ...deps,
      provider: () => ({
        network: async () => {
          actions.push('network');
          return 'first-network';
        },
        create: async (values) => {
          expect(values.networkId).toBe('first-network');
          actions.push('create');
        },
        application: async () => ({ providerId: 'first-provider-id', planId: 'g2-first' }),
        upload: async () => {
          actions.push('upload');
          return 'first-source';
        },
        release: async () => {
          actions.push('release');
          return 'first-release';
        },
        releases: async () => [{ id: 'first-release', state: 'READY' }],
      }),
    });
    expect(actions).toEqual(['network', 'create', 'upload', 'release']);
    expect((await service.detail(bob.id, plan.id)).state).toBe('SUCCEEDED');
    expect(
      await db.application.count({
        where: { userId: bob.id, connectionId: connection.id, name: 'first-service' },
      }),
    ).toBe(1);
  });
  it('uses inferred settings for the guided flow and creates an approved new application with encrypted settings', async () => {
    const liara = new LiaraService(db, env);
    const catalog = {
      billing: { hasCredit: true, paymentUrl: 'https://console.liara.ir/credit' as const },
      plans: [
        {
          id: 'g2-test',
          bundleId: 'free',
          name: 'g2-test',
          planet: null,
          bundleName: 'پایه',
          estimatedHourlyToman: 100,
          ramGb: 1,
          cpu: 1,
          diskGb: 10,
          estimatedMonthlyToman: 72000,
          recommended: true,
        },
      ],
      networks: [{ id: 'network1', name: 'network' }],
      fetchedAt: new Date().toISOString(),
    };
    liara.catalog = async () => catalog;
    const service = new DeploymentService(db, liara, github.client, undefined, env);
    const analysis = await service.analyze(alice.id, {
      repositoryUrl: 'https://github.com/owner/repo',
      branch: 'main',
    });
    const manifest = {
      ...analysis.manifest,
      analysis: { ...analysis.manifest.analysis!, environmentNames: ['API_TOKEN'] },
    };
    await db.repositoryAnalysis.update({
      where: { id: analysis.id },
      data: { manifest: JSON.parse(JSON.stringify(manifest)) },
    });
    const input = {
      analysisId: analysis.id,
      connectionId,
      target: 'new' as const,
      name: 'guided-app',
      planId: 'g2-test',
      bundleId: 'free',
      networkId: 'network1',
      environment: { API_TOKEN: 'private-setting-value' },
    };
    const p = await service.guidedPlan(alice.id, input, 'test-guided');
    expect(JSON.stringify(p)).not.toContain('private-setting-value');
    const stored = await db.deploymentSecret.findUniqueOrThrow({ where: { deploymentId: p.id } });
    expect(JSON.stringify(stored)).not.toContain('private-setting-value');
    expect(posts).toBe(0);
    await service.decide(alice.id, p.id, { hash: p.hash, decision: 'approve' }, 'test-approval');
    let creation = false,
      settings = false;
    await runDeployment(db, env, p.id, {
      ...deps,
      provider: () => ({
        create: async (values) => {
          expect(values.platform).toBe('node');
          expect(values.planId).toBe('g2-test');
          creation = true;
        },
        environment: async (_name, variables) => {
          expect(creation).toBe(true);
          expect(variables).toEqual([{ key: 'API_TOKEN', value: 'private-setting-value' }]);
          settings = true;
        },
        application: async () => ({ providerId: 'new-provider-id', planId: 'g2-test' }),
        upload: async () => {
          expect(settings).toBe(true);
          return 'source1';
        },
        release: async (_name, _source, port, platform) => {
          expect(port).toBe(3000);
          expect(platform).toBe('node');
          return 'release-id';
        },
        releases: async () => [{ id: 'release-id', state: 'READY' }],
      }),
    });
    expect((await db.deployment.findUniqueOrThrow({ where: { id: p.id } })).state).toBe(
      'SUCCEEDED',
    );
    expect(await db.deploymentSecret.count({ where: { deploymentId: p.id } })).toBe(0);
    expect(
      (await db.application.findFirstOrThrow({ where: { userId: alice.id, name: 'guided-app' } }))
        .providerId,
    ).toBe('new-provider-id');
  });
  it('creates a fixed plan without mutations, rejects IDOR, CSRF and tampered hash', async () => {
    const p = await plan();
    expect(posts).toBe(0);
    expect(
      (await inject({ url: `/api/v1/deployments/${p.id}`, headers: headers(bob) })).statusCode,
    ).toBe(404);
    expect((await decide({ ...p, hash: '0'.repeat(64) })).statusCode).toBe(409);
    expect((await decide(p, 'approve', bob)).statusCode).toBe(404);
    expect(
      (
        await inject({
          method: 'POST',
          url: `/api/v1/deployments/${p.id}/decision`,
          headers: { origin: env.APP_ORIGIN, cookie: alice.cookie },
          payload: { hash: p.hash, decision: 'approve' },
        })
      ).statusCode,
    ).toBe(403);
    expect(await db.deploymentOutbox.count({ where: { deploymentId: p.id } })).toBe(0);
  });
  it('consumes approval atomically, dispatches from PostgreSQL through Redis and verifies before success', async () => {
    const p = await plan();
    const approved = await decide(p);
    expect(approved.json().state).toBe('QUEUED');
    expect((await decide(p)).statusCode).toBe(409);
    const runtime = createDeploymentRuntime(
      db,
      env,
      pino({ level: 'silent' }),
      deps,
      `deployment-test-${randomUUID()}`,
    );
    try {
      await runtime.dispatch();
      await expect
        .poll(async () => (await db.deployment.findUniqueOrThrow({ where: { id: p.id } })).state, {
          timeout: 10000,
        })
        .toBe('SUCCEEDED');
      expect(posts).toBe(2);
      expect(probes).toBe(2);
      await runDeployment(db, env, p.id, deps);
      expect(posts).toBe(2);
      const detail = await inject({ url: `/api/v1/deployments/${p.id}`, headers: headers(alice) });
      expect(detail.json().releaseId).toBe('release-id');
      expect(detail.json().events.length).toBeGreaterThan(4);
      const sse = await inject({
        url: `/api/v1/deployments/${p.id}/events`,
        headers: { ...headers(alice), 'last-event-id': '3' },
      });
      expect(sse.headers['content-type']).toContain('text/event-stream');
      expect(sse.body).not.toContain('id: 1\n');
      expect(sse.body).toContain('event: complete');
    } finally {
      await runtime.close();
    }
  });
  it('cancels without queue or provider side effects and rejects expired approvals', async () => {
    const p = await plan();
    expect((await decide(p, 'cancel')).json().state).toBe('CANCELLED');
    await runDeployment(db, env, p.id, deps);
    expect(posts).toBe(0);
    const expired = await plan();
    await db.deployment.update({ where: { id: expired.id }, data: { expiresAt: new Date(0) } });
    expect((await decide(expired)).statusCode).toBe(409);
  });
  it('rejects changed connection versions and serializes conflicting application deployments', async () => {
    const p = await plan();
    await db.providerConnection.update({
      where: { id: connectionId },
      data: { credentialVersion: { increment: 1 } },
    });
    expect((await decide(p)).statusCode).toBe(409);
    const first = await plan(),
      second = await plan();
    expect((await decide(first)).statusCode).toBe(200);
    expect((await decide(second)).statusCode).toBe(409);
    await runDeployment(db, env, first.id, deps);
  });
  it('does not call a ready release a success when HTTP verification fails', async () => {
    const p = await plan();
    await decide(p);
    healthMatches = false;
    await runDeployment(db, env, p.id, deps);
    const d = await db.deployment.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.state).toBe('NEEDS_ATTENTION');
    expect(d.errorCode).toBe('HEALTH_CHECK_FAILED');
    expect(d.releaseId).toBe('release-id');
    expect((await decide(p)).statusCode).toBe(409);
  });
  it('treats a nonterminal release as incomplete without a second release request', async () => {
    const p = await plan();
    await decide(p);
    releaseReady = false;
    await runDeployment(db, env, p.id, deps);
    const d = await db.deployment.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.state).toBe('NEEDS_ATTENTION');
    expect(d.errorCode).toBe('RELEASE_VERIFICATION_INCOMPLETE');
    expect(posts).toBe(2);
    expect(probes).toBe(0);
  });
});
