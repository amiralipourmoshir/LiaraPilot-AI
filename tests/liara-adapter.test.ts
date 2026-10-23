import { describe, expect, it, vi } from 'vitest';
import { LiaraClient } from '../packages/liara-adapter/src/client.js';
import {
  credentialKey,
  openCredential,
  sealCredential,
} from '../packages/security/src/credentials.js';
import { redactSecrets } from '../packages/security/src/redact.js';
const token = 'test-liara-token-NOT-REAL-123456';
const project = {
  _id: 'provider-id-1',
  project_id: 'real-app',
  type: 'node',
  status: 'Running',
  scale: 1,
  planID: 'provider-plan',
  isDeployed: true,
  envs: [{ key: 'PASSWORD', value: 'must-not-escape' }],
  hourlyPrice: 12345,
};
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
describe('credential encryption and redaction', () => {
  const key = Buffer.alloc(32, 7);
  const version = 'test-v1';
  it('round-trips AES-GCM with distinct nonces, without plaintext at rest', () => {
    const a = sealCredential(token, key, version, 'alice', 'connection');
    const b = sealCredential(token, key, version, 'alice', 'connection');
    expect(a.nonce).not.toBe(b.nonce);
    expect(JSON.stringify(a)).not.toContain(token);
    expect(openCredential(a, key, version, 'alice', 'connection')).toBe(token);
  });
  it('rejects a changed owner, connection, key, key version and authentication tag', () => {
    const value = sealCredential(token, key, version, 'alice', 'connection');
    for (const attempt of [
      () => openCredential(value, key, version, 'bob', 'connection'),
      () => openCredential(value, key, version, 'alice', 'other'),
      () => openCredential(value, Buffer.alloc(32, 9), version, 'alice', 'connection'),
      () => openCredential(value, key, 'wrong', 'alice', 'connection'),
      () =>
        openCredential(
          { ...value, authTag: Buffer.alloc(16).toString('base64') },
          key,
          version,
          'alice',
          'connection',
        ),
    ])
      expect(attempt).toThrow('Credential could not be read securely');
  });
  it('requires a canonical 32-byte base64 master key', () => {
    expect(credentialKey(key.toString('base64'))).toEqual(key);
    expect(() => credentialKey('short')).toThrow();
  });
  it('redacts exact tokens, bearer values, JSON secrets, connection-string passwords and common key formats', () => {
    const text = `${token}\nAuthorization: Bearer abcdef12345\n{"PASSWORD":"super-private","api_key":"abc-secret-123"}\nDATABASE_URL=postgresql://user:db-private@database:5432/db\nghp_abcdefghijk12345`;
    const clean = redactSecrets(text, [token]);
    for (const secret of [
      token,
      'abcdef12345',
      'super-private',
      'abc-secret-123',
      'db-private',
      'ghp_abcdefghijk12345',
    ])
      expect(clean).not.toContain(secret);
    expect(clean).toContain('[REDACTED]');
  });
});
describe('official Liara read adapter', () => {
  it('uses only official GET paths, bearer authentication and teamID query and strips private response fields', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      expect(url.origin).toBe('https://api.liara.ir');
      expect(url.searchParams.get('teamID')).toBe('team-one');
      expect(init?.method).toBe('GET');
      expect(init?.redirect).toBe('error');
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${token}`);
      return json(url.pathname === '/v1/projects' ? { projects: [project] } : { project });
    });
    const client = new LiaraClient(token, 'team-one', { fetch: fetcher });
    const apps = await client.listApplications();
    const detail = await client.getApplication(apps[0]!.name);
    expect(detail.name).toBe('real-app');
    expect(JSON.stringify([apps, detail])).not.toMatch(/must-not-escape|envs|hourlyPrice/);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('sanitizes modern logs and preserves source/time metadata', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/v2/projects/real-app/logs');
      expect(url.searchParams.get('start')).toBe(String(Date.parse('2026-10-23T08:00:00Z') / 1000));
      return json({
        data: [
          {
            metaData: { releaseId: 'r1' },
            values: [
              [
                String(BigInt(Date.parse('2026-10-23T08:01:00Z')) * 1000000n),
                JSON.stringify({ type: 'stderr', _entry: `API_TOKEN=${token} PASSWORD=private` }),
              ],
            ],
          },
        ],
      });
    });
    const logs = await new LiaraClient(token, '', { fetch: fetcher }).getLogs(
      'real-app',
      '2026-10-23T08:00:00Z',
    );
    expect(logs.contract).toBe('CLI_V2');
    expect(Date.parse(logs.logs[0]!.datetime)).toBe(Date.parse('2026-10-23T08:01:00Z'));
    expect(JSON.stringify(logs)).not.toContain(token);
    expect(JSON.stringify(logs)).not.toContain('private');
  });
  it('falls back to the documented v1 log contract only on v2 not-found', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      return url.pathname.startsWith('/v2')
        ? json({}, 404)
        : json([{ type: 'stdout', datetime: '2026-10-23T08:00:00Z', message: 'legacy entry' }]);
    });
    const logs = await new LiaraClient(token, '', { fetch: fetcher }).getLogs(
      'real-app',
      '2026-10-23T08:00:00Z',
    );
    expect(logs.contract).toBe('OPENAPI_V1');
    expect(logs.logs[0]?.message).toBe('legacy entry');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([403, 429])('does not switch log contracts after HTTP %s', async (status) => {
    const fetcher = vi.fn<typeof fetch>(async () => json({}, status));
    await expect(
      new LiaraClient(token, '', { fetch: fetcher }).getLogs('real-app', '2026-10-23T08:00:00Z'),
    ).rejects.toMatchObject({ code: status === 403 ? 'LIARA_FORBIDDEN' : 'LIARA_RATE_LIMITED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed modern log lines without hiding the error with a legacy fallback', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      json({
        data: [{ metaData: { releaseId: 'r1' }, values: [['1792742460000000000', 'not-json']] }],
      }),
    );
    await expect(
      new LiaraClient(token, '', { fetch: fetcher }).getLogs('real-app', '2026-10-23T08:00:00Z'),
    ).rejects.toMatchObject({ code: 'LIARA_MALFORMED_RESPONSE' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('passes documented release pagination and does not infer metric units', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/releases')) {
        expect(url.searchParams.get('page')).toBe('2');
        expect(url.searchParams.get('count')).toBe('10');
        return json({
          total: 11,
          currentRelease: 'release-1',
          releases: [
            {
              _id: 'release-1',
              state: 'READY',
              gitInfo: { commit: 'abc123', branch: 'main' },
              envs: ['must-not-escape'],
            },
          ],
        });
      }
      return json({
        cpuUsage: [{ applet: 'a', value: [1792740000, '0.14'] }],
        memoryUsage: [{ applet: 'a', value: [1792740000, '1024'] }],
      });
    });
    const client = new LiaraClient(token, '', { fetch: fetcher });
    const releases = await client.getDeployments('real-app', 2, 10);
    expect(releases.releases[0]?.commit).toBe('abc123');
    expect(JSON.stringify(releases)).not.toContain('must-not-escape');
    const metrics = await client.getMetrics('real-app');
    expect(metrics.unitsVerified).toBe(false);
    expect(metrics.cpuUsage[0]?.value[1]).toBe('0.14');
  });
  it.each([
    [401, 'LIARA_AUTH_FAILED'],
    [403, 'LIARA_FORBIDDEN'],
    [404, 'LIARA_NOT_FOUND'],
    [429, 'LIARA_RATE_LIMITED'],
    [503, 'LIARA_UNAVAILABLE'],
  ])('handles provider HTTP %s without exposing its response body', async (status, code) => {
    const client = new LiaraClient(token, '', {
      fetch: async () =>
        json({ message: `${token} provider-secret` }, Number(status), { 'retry-after': '12' }),
    });
    try {
      await client.listApplications();
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toMatchObject({ code });
      expect(String(error)).not.toContain(token);
      expect(String(error)).not.toContain('provider-secret');
    }
  });
  it('rejects malformed and oversized responses instead of accepting empty success', async () => {
    for (const response of [
      json({ wrong: [] }),
      new Response('not json'),
      json({ projects: [] }, 200, { 'content-length': '99999999' }),
    ]) {
      const client = new LiaraClient(token, '', { fetch: async () => response });
      await expect(client.listApplications()).rejects.toMatchObject({
        code: 'LIARA_MALFORMED_RESPONSE',
      });
    }
  });
  it('times out a stalled provider and never retries mutations', async () => {
    const fetcher = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    );
    const client = new LiaraClient(token, '', { timeoutMs: 20, fetch: fetcher });
    await expect(client.listApplications()).rejects.toMatchObject({ code: 'LIARA_TIMEOUT' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects unsafe names and exposes deployment only through approval', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json({}));
    const client = new LiaraClient(token, '', { fetch: fetcher });
    await expect(client.getApplication('../../metadata')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      client
        .getCapabilities()
        .operations.filter((operation) => operation.requiresApproval && operation.name !== 'deploy')
        .every((operation) => !operation.available),
    ).toBe(true);
    expect(client.getCapabilities().operations.find((o) => o.name === 'deploy')).toMatchObject({
      available: true,
      requiresApproval: true,
    });
    expect(() => client.unsupported()).toThrow('این عملیات');
  });
});
