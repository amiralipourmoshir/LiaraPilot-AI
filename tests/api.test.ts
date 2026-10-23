import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { createDatabase } from '../packages/database/src/index.js';
import { digest } from '../packages/security/src/auth.js';
import { testEnv } from './environment.js';
const db = createDatabase(testEnv.DATABASE_URL);
const app = await buildApp(db, testEnv, async () => 'PONG');
const origin = testEnv.APP_ORIGIN;
const suffix = randomUUID();
const userIds: string[] = [];
type Account = { cookie: string; csrf: string; id: string; email: string };
async function register(label: string): Promise<Account> {
  const email = `${label}-${suffix}@example.test`;
  const reply = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { origin }, payload: { name: 'کاربر آزمایش', email, password: 'strong-test-password-123!' } });
  expect(reply.statusCode).toBe(201);
  const body = reply.json<{ user: { id: string }; csrfToken: string }>(); userIds.push(body.user.id);
  return { cookie: reply.cookies.map(c => `${c.name}=${c.value}`).join('; '), csrf: body.csrfToken, id: body.user.id, email };
}
let alice: Account; let bob: Account; let projectId: string;
beforeAll(async () => { await app.ready(); alice = await register('alice'); bob = await register('bob'); });
afterAll(async () => {
  await db.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  await db.operation.deleteMany({ where: { userId: { in: userIds } } });
  await db.project.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await app.close(); await db.$disconnect();
});
const headers = (account: Account) => ({ cookie: account.cookie, origin, 'x-csrf-token': account.csrf });
describe('authenticated API against PostgreSQL', () => {
  it('sets HttpOnly SameSite cookies and persists only hashed credentials', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { email: alice.email, password: 'strong-test-password-123!' } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']?.toString()).toContain('HttpOnly');
    expect(response.headers['set-cookie']?.toString()).toContain('SameSite=Strict');
    expect(response.body).not.toContain('passwordHash'); expect(response.body).not.toContain('idHash');
    const token = response.cookies.find(c => c.name === 'lp_session')!.value;
    expect(await db.session.findUnique({ where: { idHash: token } })).toBeNull();
    expect(await db.session.findUnique({ where: { idHash: digest(token) } })).not.toBeNull();
  });
  it('rejects unauthenticated reads', async () => { expect((await app.inject('/api/v1/projects')).statusCode).toBe(401); });
  it('rejects cross-origin login and missing/incorrect CSRF', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'https://evil.example' }, payload: { email: alice.email, password: 'wrong' } })).statusCode).toBe(403);
    for (const csrf of [undefined, 'wrong']) { const response = await app.inject({ method: 'POST', url: '/api/v1/projects', headers: { cookie: alice.cookie, origin, ...(csrf ? { 'x-csrf-token': csrf } : {}) }, payload: { name: 'نباید ساخته شود' } }); expect(response.statusCode).toBe(403); }
  });
  it('returns the same login error for unknown account and wrong password', async () => {
    for (const email of [alice.email, `missing-${suffix}@example.test`]) { const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { email, password: 'incorrect-password' } }); expect(response.statusCode).toBe(401); expect(response.json().error.code).toBe('INVALID_CREDENTIALS'); }
  });
  it('rejects invalid input and untrusted ownership fields', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/projects', headers: headers(alice), payload: { name: 'مخرب', userId: bob.id } });
    expect(response.statusCode).toBe(400); expect(response.json().error.requestId).toBeTruthy();
  });
  it('creates a project and enforces ownership in list and detail routes', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/v1/projects', headers: headers(alice), payload: { name: 'پروژه خصوصی' } });
    expect(created.statusCode).toBe(201); projectId = created.json().id;
    const aliceList = await app.inject({ url: '/api/v1/projects', headers: { cookie: alice.cookie } });
    expect(aliceList.json().projects.map((p: { id: string }) => p.id)).toContain(projectId);
    const bobList = await app.inject({ url: '/api/v1/projects', headers: { cookie: bob.cookie } });
    expect(bobList.json().projects).toEqual([]);
    expect((await app.inject({ url: `/api/v1/projects/${projectId}`, headers: { cookie: bob.cookie } })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/v1/projects/${projectId}`, headers: { cookie: alice.cookie } })).statusCode).toBe(200);
  });
  it('persists operation plus outbox atomically and deduplicates concurrent submissions', async () => {
    const key = randomUUID();
    const submit = () => app.inject({ method: 'POST', url: '/api/v1/foundation/checks', headers: { ...headers(alice), 'idempotency-key': key }, payload: { projectId } });
    const replies = await Promise.all([submit(), submit(), submit()]);
    expect(replies.map(r => r.statusCode)).toEqual([202, 202, 202]);
    const id = replies[0]!.json().operationId;
    expect(replies.every(r => r.json().operationId === id)).toBe(true);
    const operation = await db.operation.findUniqueOrThrow({ where: { id }, include: { outbox: true, events: true } });
    expect(operation.state).toBe('QUEUED'); expect(operation.outbox).not.toBeNull(); expect(operation.events).toHaveLength(1);
    expect((await app.inject({ url: `/api/v1/operations/${id}`, headers: { cookie: bob.cookie } })).statusCode).toBe(404);
    const other = await app.inject({ method: 'POST', url: '/api/v1/projects', headers: headers(alice), payload: { name: 'پروژه دوم' } });
    const conflict = await app.inject({ method: 'POST', url: '/api/v1/foundation/checks', headers: { ...headers(alice), 'idempotency-key': key }, payload: { projectId: other.json().id } });
    expect(conflict.statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: '/api/v1/foundation/checks', headers: { ...headers(bob), 'idempotency-key': randomUUID() }, payload: { projectId } })).statusCode).toBe(404);
  });
  it('survives API recreation with the same session and project', async () => {
    const restarted = await buildApp(db, testEnv, async () => 'PONG');
    try { expect((await restarted.inject({ url: '/api/v1/auth/session', headers: { cookie: alice.cookie } })).statusCode).toBe(200); expect((await restarted.inject({ url: `/api/v1/projects/${projectId}`, headers: { cookie: alice.cookie } })).statusCode).toBe(200); } finally { await restarted.close(); }
  });
  it('exposes authenticated OpenAPI and sanitized readiness failure', async () => {
    const spec = await app.inject({ url: '/api/v1/openapi.json', headers: { cookie: alice.cookie } }); expect(spec.statusCode).toBe(200); expect(spec.json().paths['/api/v1/projects']).toBeTruthy();
    const degraded = await buildApp(db, testEnv, async () => { throw new Error('secret connection string'); });
    try { const response = await degraded.inject('/api/v1/health/ready'); expect(response.statusCode).toBe(503); expect(response.body).not.toContain('secret'); } finally { await degraded.close(); }
  });
  it('sets Secure cookies when configured for production HTTPS', async () => {
    const secureOrigin = 'https://pilot.example.test';
    const secure = await buildApp(db, { ...testEnv, NODE_ENV: 'production', APP_ORIGIN: secureOrigin }, async () => 'PONG');
    try {
      const response = await secure.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: secureOrigin }, payload: { email: alice.email, password: 'strong-test-password-123!' } });
      expect(response.statusCode).toBe(200); expect(response.headers['set-cookie']?.toString()).toContain('Secure'); expect(response.headers['cache-control']).toBe('no-store'); expect(response.headers['x-content-type-options']).toBe('nosniff');
    } finally { await secure.close(); }
  });
  it('rate-limits repeated password attempts', async () => {
    const limited = await buildApp(db, testEnv, async () => 'PONG');
    try {
      let last = 0;
      for (let index = 0; index < 11; index++) last = (await limited.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { email: 'limit@example.test', password: 'wrong-password' } })).statusCode;
      expect(last).toBe(429);
    } finally { await limited.close(); }
  });
  it('rejects an expired session', async () => {
    const token = alice.cookie.match(/lp_session=([^;]+)/)![1]!;
    await db.session.update({ where: { idHash: digest(token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await app.inject({ url: '/api/v1/auth/session', headers: { cookie: alice.cookie } })).statusCode).toBe(401);
  });
  it('revokes the session on logout', async () => {
    const reply = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: headers(bob) }); expect(reply.statusCode).toBe(204);
    expect((await app.inject({ url: '/api/v1/auth/session', headers: { cookie: bob.cookie } })).statusCode).toBe(401);
  });
});
