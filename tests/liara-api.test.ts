import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { createDatabase } from '../packages/database/src/index.js';
import { LiaraClient } from '../packages/liara-adapter/src/client.js';
import { testEnv } from './environment.js';
const db = createDatabase(testEnv.DATABASE_URL);
const token = 'test-liara-token-NOT-REAL-123456';
const env = {
  ...testEnv,
  CREDENTIAL_KEY: Buffer.alloc(32, 5).toString('base64'),
  CREDENTIAL_KEY_VERSION: 'test-v1',
};
const providerProject = {
  _id: 'provider-one',
  project_id: 'actual-app',
  type: 'node',
  status: 'Running',
  scale: 1,
  isDeployed: true,
  envs: [{ key: 'PASSWORD', value: 'provider-private' }],
};
let projects = [providerProject];
let fail = false;
let requests = 0;
let releaseList: (() => void) | null = null;
let listStarted: (() => void) | null = null;
const providerFetch: typeof fetch = async (input, init) => {
  requests++;
  const url = new URL(String(input));
  if (url.pathname === '/v1/projects' && releaseList) {
    listStarted?.();
    await new Promise<void>((resolve) => {
      releaseList = resolve;
    });
  }
  const respond = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  if (new Headers(init?.headers).get('authorization') !== `Bearer ${token}`)
    return respond({ secret: 'must-not-expose' }, 401);
  if (fail) return respond({ secret: token }, 503);
  if (url.pathname === '/v1/projects') return respond({ projects });
  if (url.pathname.endsWith('/logs'))
    return respond({
      data: [
        {
          metaData: { releaseId: 'r1' },
          values: [
            [
              '1792742460000000000',
              JSON.stringify({
                type: 'stderr',
                _entry: `PASSWORD=secret-value API_TOKEN=${token}`,
              }),
            ],
          ],
        },
      ],
    });
  if (url.pathname.endsWith('/releases'))
    return respond({
      releases: [{ _id: 'release-1', state: 'READY', gitInfo: { commit: 'abc123' } }],
      total: 1,
    });
  if (url.pathname.endsWith('/metrics/summary')) return respond({ cpuUsage: [], memoryUsage: [] });
  return respond({ project: providerProject });
};
const app = await buildApp(db, env, async () => 'PONG', {
  providerFactory: (credential, team) =>
    new LiaraClient(credential, team, { fetch: providerFetch }),
});
const users: string[] = [];
type Account = { id: string; cookie: string; csrf: string };
async function createAccount(): Promise<Account> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: { origin: env.APP_ORIGIN },
    payload: {
      name: 'کاربر لیارا',
      email: `liara-${randomUUID()}@example.test`,
      password: 'strong-test-password-123',
    },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json();
  users.push(body.user.id);
  return {
    id: body.user.id,
    cookie: response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
    csrf: body.csrfToken,
  };
}
const headers = (user: Account) => ({
  cookie: user.cookie,
  origin: env.APP_ORIGIN,
  'x-csrf-token': user.csrf,
});
let alice: Account;
let bob: Account;
let connectionId: string;
let applicationId: string;
beforeAll(async () => {
  alice = await createAccount();
  bob = await createAccount();
});
afterAll(async () => {
  await db.auditLog.deleteMany({ where: { userId: { in: users } } });
  await db.application.deleteMany({ where: { userId: { in: users } } });
  await db.providerConnection.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await app.close();
  await db.$disconnect();
});
describe('secure persisted Liara connection workflow', () => {
  it('validates before saving and encrypts the token with ownership-bound authenticated encryption', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/connections/liara',
      headers: headers(alice),
      payload: { label: 'حساب اصلی', token, teamId: 'team-one' },
    });
    expect(response.statusCode).toBe(201);
    connectionId = response.json().id;
    expect(response.json().applicationCount).toBe(1);
    expect(response.body).not.toContain(token);
    const stored = await db.credential.findUniqueOrThrow({ where: { connectionId } });
    expect(JSON.stringify(stored)).not.toContain(token);
    const listed = await app.inject({ url: '/api/v1/applications', headers: headers(alice) });
    applicationId = listed.json().applications[0].id;
    expect(listed.body).not.toMatch(/provider-private|envs|ciphertext|nonce/);
    const detail = await app.inject({
      url: `/api/v1/applications/${applicationId}`,
      headers: headers(alice),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.body).not.toContain('provider-private');
  });
  it('blocks CSRF and cross-user access before contacting the provider', async () => {
    const before = requests;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/connections/liara/${connectionId}/sync`,
          headers: { cookie: alice.cookie, origin: env.APP_ORIGIN },
        })
      ).statusCode,
    ).toBe(403);
    for (const path of [
      `/applications/${applicationId}`,
      `/applications/${applicationId}/logs?since=2026-10-23T08:00:00Z`,
      `/applications/${applicationId}/releases`,
      `/applications/${applicationId}/metrics`,
    ])
      expect((await app.inject({ url: `/api/v1${path}`, headers: headers(bob) })).statusCode).toBe(
        404,
      );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/connections/liara/${connectionId}/disconnect`,
          headers: headers(bob),
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ url: '/api/v1/applications', headers: headers(bob) })).json()
        .applications,
    ).toEqual([]);
    expect(requests).toBe(before);
  });
  it('returns redacted real-provider logs and typed release/metric payloads', async () => {
    const logs = await app.inject({
      url: `/api/v1/applications/${applicationId}/logs?since=2026-10-23T08:00:00Z`,
      headers: headers(alice),
    });
    expect(logs.statusCode).toBe(200);
    expect(logs.body).not.toMatch(/secret-value|test-liara-token/);
    expect(logs.json().source).toBe('LIARA');
    expect(
      (
        await app.inject({
          url: `/api/v1/applications/${applicationId}/releases`,
          headers: headers(alice),
        })
      ).json().releases[0].commit,
    ).toBe('abc123');
    expect(
      (
        await app.inject({
          url: `/api/v1/applications/${applicationId}/metrics`,
          headers: headers(alice),
        })
      ).json().unitsVerified,
    ).toBe(false);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/applications/${applicationId}/restart`,
          headers: headers(alice),
        })
      ).statusCode,
    ).toBe(404);
  });
  it('does not overwrite a working credential when replacement validation fails', async () => {
    const before = await db.credential.findUniqueOrThrow({ where: { connectionId } });
    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/connections/liara',
      headers: headers(alice),
      payload: { label: 'جایگزین', token: 'invalid-token-123456789', teamId: 'team-one' },
    });
    expect(bad.statusCode).toBe(422);
    expect((await db.credential.findUniqueOrThrow({ where: { connectionId } })).ciphertext).toBe(
      before.ciphertext,
    );
  });
  it('keeps the previous successful sync timestamp on provider failure and marks missing services on a successful sync', async () => {
    const before = await db.providerConnection.findUniqueOrThrow({ where: { id: connectionId } });
    fail = true;
    const failed = await app.inject({
      method: 'POST',
      url: `/api/v1/connections/liara/${connectionId}/sync`,
      headers: headers(alice),
    });
    fail = false;
    expect(failed.statusCode).toBe(502);
    expect(
      (
        await db.providerConnection.findUniqueOrThrow({ where: { id: connectionId } })
      ).syncedAt?.toISOString(),
    ).toBe(before.syncedAt?.toISOString());
    projects = [];
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/connections/liara/${connectionId}/sync`,
          headers: headers(alice),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await db.application.findUniqueOrThrow({ where: { id: applicationId } })).providerMissing,
    ).toBe(true);
    expect(
      (await app.inject({ url: `/api/v1/applications/${applicationId}`, headers: headers(alice) }))
        .statusCode,
    ).toBe(404);
    projects = [providerProject];
    await app.inject({
      method: 'POST',
      url: `/api/v1/connections/liara/${connectionId}/sync`,
      headers: headers(alice),
    });
  });
  it('prevents a late sync from resurrecting a disconnected connection and purges the stored token', async () => {
    let started!: () => void;
    const start = new Promise<void>((resolve) => {
      started = resolve;
    });
    listStarted = started;
    releaseList = () => {};
    const pending = app
      .inject({
        method: 'POST',
        url: `/api/v1/connections/liara/${connectionId}/sync`,
        headers: headers(alice),
      })
      .then((response) => response);
    await start;
    const disconnected = await app.inject({
      method: 'POST',
      url: `/api/v1/connections/liara/${connectionId}/disconnect`,
      headers: headers(alice),
    });
    expect(disconnected.statusCode).toBe(200);
    releaseList!();
    releaseList = null;
    expect((await pending).statusCode).toBe(409);
    expect(await db.credential.count({ where: { connectionId } })).toBe(0);
    expect(
      (await db.providerConnection.findUniqueOrThrow({ where: { id: connectionId } })).status,
    ).toBe('DISCONNECTED');
    expect(
      (await app.inject({ url: '/api/v1/applications', headers: headers(alice) })).json()
        .applications,
    ).toEqual([]);
    expect(
      (await app.inject({ url: `/api/v1/applications/${applicationId}`, headers: headers(alice) }))
        .statusCode,
    ).toBe(404);
  });
  it('reconnects explicitly without duplicating the connection or retaining the previous credential', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/connections/liara',
      headers: headers(alice),
      payload: { label: 'اتصال دوباره', token, teamId: 'team-one' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().id).toBe(connectionId);
    expect(await db.providerConnection.count({ where: { userId: alice.id } })).toBe(1);
    expect(await db.credential.count({ where: { connectionId } })).toBe(1);
    expect(
      (await app.inject({ url: '/api/v1/applications', headers: headers(alice) })).json()
        .applications,
    ).toHaveLength(1);
  });
  it('fails closed when the server encryption key is unavailable', async () => {
    const before = requests;
    const unconfigured = await buildApp(
      db,
      { ...env, CREDENTIAL_KEY: undefined },
      async () => 'PONG',
      {
        providerFactory: (credential, team) =>
          new LiaraClient(credential, team, { fetch: providerFetch }),
      },
    );
    try {
      const response = await unconfigured.inject({
        method: 'POST',
        url: '/api/v1/connections/liara',
        headers: headers(alice),
        payload: { label: 'بدون کلید', token },
      });
      expect(response.statusCode).toBe(503);
      expect(response.body).not.toContain(token);
      expect(requests).toBe(before);
    } finally {
      await unconfigured.close();
    }
  });
});
