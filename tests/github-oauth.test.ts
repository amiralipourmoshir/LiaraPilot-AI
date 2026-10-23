import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GithubService } from '../apps/api/src/github/service.js';
import { createDatabase } from '../packages/database/src/index.js';
import { testEnv } from './environment.js';
const db = createDatabase(testEnv.DATABASE_URL);
const userId = randomUUID();
const token = 'gho_fixture-private-token-not-real';
let requests = 0;
const env = {
  ...testEnv,
  CREDENTIAL_KEY: Buffer.alloc(32, 4).toString('base64'),
  GITHUB_CLIENT_ID: 'fixture-client',
  GITHUB_CLIENT_SECRET: 'fixture-secret-no-real',
};
const service = new GithubService(db, env, async (input, init) => {
  requests++;
  if (String(input).includes('/login/oauth/access_token')) {
    const body = JSON.parse(init?.body as string);
    expect(body.code_verifier).toBeTruthy();
    expect(body.client_secret).toBe(env.GITHUB_CLIENT_SECRET);
    expect(init?.redirect).toBe('error');
    return Response.json({ access_token: token, token_type: 'bearer', scope: 'repo' });
  }
  if (String(input).endsWith('/user')) return Response.json({ login: 'fixture-user' });
  if (String(input).includes('/branches?'))
    return Response.json([{ name: 'main' }, { name: 'feature/new' }]);
  expect(new Headers(init?.headers).get('authorization')).toBe('Bearer ' + token);
  return Response.json({ private: true, default_branch: 'main' });
});
beforeAll(async () => {
  await db.user.create({
    data: {
      id: userId,
      name: 'OAuth fixture',
      email: `oauth-${userId}@example.test`,
      passwordHash: 'test-only',
    },
  });
});
afterAll(async () => {
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});
describe('GitHub login with PKCE and encrypted owner-bound access', () => {
  it('reports missing registration rather than pretending login is available', async () => {
    const missing = new GithubService(db, { ...env, GITHUB_CLIENT_ID: undefined });
    expect((await missing.status(userId)).configured).toBe(false);
    await expect(missing.begin(userId)).rejects.toHaveProperty('code', 'GITHUB_SETUP_REQUIRED');
  });
  it('uses exact callback, state and S256, rejects a different browser, consumes once and encrypts access', async () => {
    const start = await service.begin(userId);
    const url = new URL(start.url);
    expect(url.origin).toBe('https://github.com');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe(env.APP_ORIGIN + '/api/v1/github/callback');
    const state = url.searchParams.get('state')!;
    await expect(service.callback(state, 'fixture-code', 'wrong-browser')).rejects.toHaveProperty(
      'code',
      'GITHUB_STATE_INVALID',
    );
    expect(requests).toBe(0);
    await service.callback(state, 'fixture-code', start.binding);
    const row = await db.githubConnection.findUniqueOrThrow({ where: { userId } });
    expect(JSON.stringify(row)).not.toContain(token);
    expect((await service.token(userId))?.token).toBe(token);
    await expect(service.callback(state, 'fixture-code', start.binding)).rejects.toThrow();
    expect((await service.status(userId)).login).toBe('fixture-user');
  });
  it('reads authorized private branches and disconnect purges credentials', async () => {
    expect(
      (await (await service.client(userId)).branches('https://github.com/owner/private')).branches,
    ).toEqual(['main', 'feature/new']);
    await service.disconnect(userId);
    expect(await service.token(userId)).toBeNull();
    expect((await service.status(userId)).connected).toBe(false);
  });
  it('rejects an expired authorization before making an exchange', async () => {
    const start = await service.begin(userId);
    const state = new URL(start.url).searchParams.get('state')!;
    await db.githubOAuthAttempt.updateMany({ where: { userId }, data: { expiresAt: new Date(0) } });
    const before = requests;
    await expect(service.callback(state, 'code', start.binding)).rejects.toThrow();
    expect(requests).toBe(before);
  });
});
