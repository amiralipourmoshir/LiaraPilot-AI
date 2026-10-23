import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { createDatabase } from '../packages/database/src/index.js';
import { testEnv } from './environment.js';
import { ReliabilityService, validatePatchPath } from '../apps/api/src/monitoring/reliability.js';
import { ServerFileError, type ServerFiles } from '../packages/monitoring/src/server-files.js';
import { reliabilityTick } from '../packages/monitoring/src/reliability-worker.js';
import { publicAddress } from '../packages/deployment/src/health.js';
const db = createDatabase(testEnv.DATABASE_URL);
const env = { ...testEnv, CREDENTIAL_KEY: Buffer.alloc(32, 8).toString('base64') };
let userId: string, applicationId: string, connectionId: string;
let source = 'export const value = 1;\n',
  writes = 0;
const sha = () => createHash('sha256').update(source).digest('hex');
const files: ServerFiles = {
  read: async (_user, _app, root, path) => ({
    root,
    path,
    content: source,
    sha: sha(),
    host: 'applet-1',
    connectionId,
    version: 1,
    providerId: 'test',
    name: 'reliability-test',
  }),
  write: async (_u, _a, file, expected, content) => {
    if (file.host !== 'applet-1') throw new ServerFileError('SERVER_INSTANCE_CHANGED');
    if (expected !== sha()) throw new ServerFileError('SERVER_CONFLICT');
    source = content;
    writes++;
    return { sha: sha(), host: 'applet-1' };
  },
  list: async () => ['src/index.ts'],
};
const probe = async () => ({ status: 200, matched: true });
const s = new ReliabilityService(
  db,
  env,
  {
    complete: async () => ({
      text: null,
      calls: [
        {
          name: 'propose_patch',
          arguments: JSON.stringify({
            changes: [{ find: 'export const value = 1;\n', replace: 'export const value = 2;\n' }],
          }),
        },
      ],
    }),
  },
  files,
  probe,
);
beforeAll(async () => {
  const user = await db.user.create({
    data: {
      email: `reliability-${randomUUID()}@example.test`,
      name: 'تست',
      passwordHash: 'unused',
    },
  });
  userId = user.id;
  const c = await db.providerConnection.create({ data: { userId, label: 'test' } });
  connectionId = c.id;
  const a = await db.application.create({
    data: { userId, connectionId, providerId: 'test', name: 'reliability-test' },
  });
  applicationId = a.id;
});
afterAll(async () => {
  await db.reliabilityRun.deleteMany({ where: { userId } });
  await db.reliabilityTask.deleteMany({ where: { userId } });
  await db.healthMonitor.deleteMany({ where: { userId } });
  await db.application.deleteMany({ where: { userId } });
  await db.providerConnection.deleteMany({ where: { userId } });
  await db.auditLog.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});
it('requires ownership, matching approval hash, consent, and rejects replay', async () => {
  const task = await s.scan(userId, { applicationId, paths: ['/'], discover: true });
  expect(task.state).toBe('PLANNED');
  await expect(s.decide(randomUUID(), task.id, task.hash, true)).rejects.toMatchObject({
    statusCode: 404,
  });
  await expect(s.decide(userId, task.id, '0'.repeat(64), true)).rejects.toMatchObject({
    code: 'APPROVAL_INVALID',
  });
  await s.decide(userId, task.id, task.hash, false);
  await expect(s.decide(userId, task.id, task.hash, true)).rejects.toMatchObject({
    code: 'TASK_STATE',
  });
});
it('runs approved scan in worker and persists results and incident evidence', async () => {
  await db.healthMonitor.create({ data: { userId, applicationId, path: '/', expectedText: '' } });
  const task = await s.scan(userId, { applicationId, paths: ['/', '/broken'], discover: false });
  await s.decide(userId, task.id, task.hash, true);
  await reliabilityTick(db, async () => ({
    pages: [
      {
        path: '/broken',
        status: 500,
        durationMs: 20,
        requests: 1,
        bytes: 100,
        domMs: 10,
        loadMs: 20,
        errors: ['HTTP 500'],
        assets: [],
      },
    ],
    discovered: 1,
    truncated: false,
    blocked: 0,
    scope: 'test',
  }));
  expect((await db.reliabilityTask.findUniqueOrThrow({ where: { id: task.id } })).state).toBe(
    'SUCCEEDED',
  );
  expect(await db.healthIncident.count({ where: { userId, source: 'SCAN', state: 'OPEN' } })).toBe(
    1,
  );
});
it('generates reviewable patch without writes, applies once and undoes by SHA', async () => {
  const t = await s.patch(userId, {
    applicationId,
    root: '/app',
    path: 'src/index.ts',
    instruction: 'مقدار ثابت را به دو تغییر بده',
  });
  expect(writes).toBe(0);
  expect(JSON.stringify(t.snapshot)).toContain('@@');
  await s.decide(userId, t.id, t.hash, true);
  expect(source).toContain('= 2');
  expect(writes).toBe(1);
  await expect(s.decide(userId, t.id, t.hash, true)).rejects.toMatchObject({ code: 'TASK_STATE' });
  await s.decide(userId, t.id, t.hash, true, true);
  expect(source).toContain('= 1');
  expect(writes).toBe(2);
});
it('refuses stale source and expired approval without writing', async () => {
  const t = await s.patch(userId, {
    applicationId,
    root: '/app',
    path: 'src/index.ts',
    instruction: 'مقدار ثابت را به دو تغییر بده',
  });
  source = 'export const value = 3;\n';
  await expect(s.decide(userId, t.id, t.hash, true)).rejects.toMatchObject({
    code: 'SERVER_CONFLICT',
  });
  expect(writes).toBe(2);
  const scan = await s.scan(userId, { applicationId, paths: ['/'], discover: false });
  await db.reliabilityTask.update({ where: { id: scan.id }, data: { expiresAt: new Date(0) } });
  await expect(s.decide(userId, scan.id, scan.hash, true)).rejects.toMatchObject({
    code: 'APPROVAL_INVALID',
  });
});
it('rejects secret paths and internal addresses', () => {
  for (const path of ['.env', '../src/app.ts', '.github/workflows/ci.json', 'private.key'])
    expect(() => validatePatchPath(path)).toThrow();
  for (const address of ['127.0.0.1', '169.254.169.254', '10.0.0.1', '::1'])
    expect(publicAddress(address)).toBe(false);
});

it('persists evidence-backed AI analysis without changing code or approval state', async () => {
  const scan = await db.reliabilityTask.findFirstOrThrow({
    where: { userId, kind: 'SCAN', state: 'SUCCEEDED' },
  });
  const analysis = {
    score: 41,
    confidence: 'LOW',
    summary: 'یک صفحه با خطای ۵۰۰ ثبت شده است.',
    strengths: [],
    findings: [
      {
        path: '/broken',
        severity: 'HIGH',
        title: 'خطای HTTP',
        evidence: 'HTTP 500 در گزارش',
        recommendation: 'لاگ این درخواست را بررسی کنید.',
      },
    ],
    limitations: ['اندازه‌گیری fixture است؛ علت قطعی مشخص نیست.'],
  };
  const analyst = new ReliabilityService(
    db,
    env,
    {
      complete: async () => ({
        text: null,
        calls: [{ name: 'performance_review', arguments: JSON.stringify(analysis) }],
      }),
    },
    files,
    probe,
  );
  const result = await analyst.analyze(userId, scan.id);
  expect(result.state).toBe('SUCCEEDED');
  expect(result.result).toMatchObject({ analysis: { score: 41 }, pages: [{ path: '/broken' }] });
  expect(writes).toBe(2);
  const bad = new ReliabilityService(
    db,
    env,
    {
      complete: async () => ({
        text: null,
        calls: [
          {
            name: 'performance_review',
            arguments: JSON.stringify({
              ...analysis,
              findings: [{ ...analysis.findings[0], path: '/invented' }],
            }),
          },
        ],
      }),
    },
    files,
    probe,
  );
  await expect(bad.analyze(userId, scan.id)).rejects.toMatchObject({
    code: 'ANALYSIS_EVIDENCE_INVALID',
  });
});

it('persists a durable AI timeline and only proposes a server patch without writes', async () => {
  const { aiTick } = await import('../packages/monitoring/src/ai-worker.js');
  const run = await db.reliabilityRun.create({
    data: {
      userId,
      applicationId,
      kind: 'PATCH',
      input: {
        applicationId,
        root: '/app',
        path: 'src/index.ts',
        instruction: 'مقدار ثابت را با پچ سرور به دو تغییر بده',
      },
      events: [],
    },
  });
  const beforeWrites = writes;
  await aiTick(
    db,
    env,
    {
      complete: async () => ({
        text: null,
        calls: [
          {
            name: 'propose_patch',
            arguments: JSON.stringify({
              changes: [{ find: source, replace: 'export const value = 2;\n' }],
            }),
          },
        ],
      }),
    },
    files,
  );
  const saved = await db.reliabilityRun.findUniqueOrThrow({ where: { id: run.id } });
  expect(saved.state).toBe('SUCCEEDED');
  expect(saved.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ phase: 'SOURCE' }),
      expect.objectContaining({ phase: 'MODEL' }),
      expect.objectContaining({ phase: 'VALIDATION' }),
      expect.objectContaining({ phase: 'COMPLETE' }),
    ]),
  );
  expect(writes).toBe(beforeWrites);
});

it('searches and patches a large file outside the initial excerpt and restores exact content', async () => {
  const original = '// unrelated content\n'.repeat(18000) + 'export const target = 1;\n';
  source = original;
  let turn = 0;
  const service = new ReliabilityService(
    db,
    env,
    {
      complete: async (messages) => {
        turn++;
        if (turn === 1) {
          expect(messages[1]!.content.length).toBeLessThan(14000);
          return {
            text: null,
            calls: [
              {
                name: 'search_source',
                arguments: JSON.stringify({ query: 'export const target' }),
              },
            ],
          };
        }
        expect(messages.at(-1)!.content).toContain('export const target = 1;');
        return {
          text: null,
          calls: [
            {
              name: 'propose_patch',
              arguments: JSON.stringify({
                changes: [
                  { find: 'export const target = 1;', replace: 'export const target = 2;' },
                ],
              }),
            },
          ],
        };
      },
    },
    files,
    probe,
  );
  const task = await service.patch(userId, {
    applicationId,
    root: '/app',
    path: 'src/index.ts',
    instruction: 'Change target to 2',
  });
  expect(source).toBe(original);
  await service.decide(userId, task.id, task.hash, true);
  expect(source).toBe(original.replace('target = 1', 'target = 2'));
  await service.decide(userId, task.id, task.hash, true, true);
  expect(source).toBe(original);
});
