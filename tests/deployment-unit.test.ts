import { describe, it, expect } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { repositoryAddress, safeRepositoryPath } from '../packages/github-adapter/src/index.js';
import { publicAddress } from '../packages/deployment/src/health.js';
import { sourceArchive } from '../packages/deployment/src/runner.js';
import { LiaraDeploymentProvider } from '../packages/deployment/src/provider.js';
import { githubFixture, commit } from './repository-fixture.js';
describe('immutable repository and deployment transport', () => {
  it('pins analysis to a commit, cites files and excludes credentials from the source bundle', async () => {
    const f = githubFixture();
    const manifest = await f.client.analyze('https://github.com/owner/repo');
    expect(manifest.commit).toBe(commit);
    expect(manifest.framework).toBe('express');
    expect(manifest.blockers).toEqual([]);
    expect(manifest.excluded).toContain('.env');
    const archive = await sourceArchive(await f.client.files(manifest));
    const tar = gunzipSync(archive).toString();
    expect(tar).toContain('server.js');
    expect(tar).not.toContain('not-real-private');
    expect(manifest.evidence[0]?.path).toBe('package.json');
  });
  it.each([
    'https://github.com.evil.test/a/b',
    'http://github.com/a/b',
    'https://u:p@github.com/a/b',
    'https://github.com/a/b?token=x',
    'https://127.0.0.1/a/b',
    'https://github.com/a/b/tree/main',
  ])('rejects untrusted repository address %s', (input) => {
    expect(() => repositoryAddress(input)).toThrow();
  });
  it('rejects path traversal, partial trees and reports an unsupported start contract', async () => {
    expect(safeRepositoryPath('../x')).toBe(false);
    await expect(
      githubFixture({ unsafe: true }).client.analyze('https://github.com/a/b'),
    ).rejects.toThrow();
    await expect(
      githubFixture({ truncated: true }).client.analyze('https://github.com/a/b'),
    ).rejects.toThrow();
    expect(
      (await githubFixture({ missingStart: true }).client.analyze('https://github.com/a/b')).start,
    ).toBe('node server.js');
    await expect(sourceArchive([{ path: '../x', data: Buffer.from('x') }])).rejects.toThrow();
  });
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '0.0.0.0',
    '224.0.0.1',
  ])('blocks nonpublic health address %s', (address) => expect(publicAddress(address)).toBe(false));
  it('accepts public unicast only', () => expect(publicAddress('8.8.8.8')).toBe(true));
  it('uploads multipart gzip and creates a release with only the verified fields', async () => {
    let step = 0;
    const provider = new LiaraDeploymentProvider(
      'fixture-private-token',
      'team-id',
      async (input, init) => {
        expect(new URL(String(input)).searchParams.get('teamID')).toBe('team-id');
        expect(new Headers(init?.headers).get('authorization')).toBe(
          'Bearer fixture-private-token',
        );
        expect(init?.method).toBe('POST');
        expect(init?.redirect).toBe('error');
        if (step++ === 0) {
          expect(init?.body).toBeInstanceOf(FormData);
          expect((init?.body as FormData).get('file')).toBeInstanceOf(Blob);
          return Response.json({ sourceID: 's1' });
        }
        expect(JSON.parse(init?.body as string)).toEqual({
          sourceID: 's1',
          type: 'node',
          port: 3000,
        });
        return Response.json({ releaseID: 'r1' });
      },
    );
    expect(await provider.upload('app', Buffer.from('archive'))).toBe('s1');
    expect(await provider.release('app', 's1', 3000)).toBe('r1');
  });
  it('treats a network failure during a cloud POST as unknown and never retries automatically', async () => {
    let calls = 0;
    const p = new LiaraDeploymentProvider('private', '', async () => {
      calls++;
      throw new Error('secret upstream');
    });
    await expect(p.release('app', 's1', 3000)).rejects.toHaveProperty(
      'code',
      'DEPLOYMENT_OUTCOME_UNKNOWN',
    );
    expect(calls).toBe(1);
  });
});
