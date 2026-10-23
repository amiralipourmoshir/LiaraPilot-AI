import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import tar from 'tar-stream';
import { describe, expect, it } from 'vitest';
import { archiveFiles } from '../packages/github-adapter/src/archive.js';
import { manifestSchema } from '../packages/shared/src/repository.js';
const contents = Buffer.from('hello deployment');
const file = {
  path: 'app.txt',
  size: contents.length,
  sha: createHash('sha1').update(`blob ${contents.length}\0`).update(contents).digest('hex'),
};
const manifest = manifestSchema.parse({
  owner: 'owner',
  repo: 'repo',
  commit: 'a'.repeat(40),
  files: [file],
  excluded: [],
  framework: 'static',
  start: null,
  blockers: [],
  evidence: [],
});
async function archive(entries: { name: string; data: Buffer }[]) {
  const pack = tar.pack();
  for (const entry of entries) pack.entry({ name: entry.name }, entry.data);
  pack.finalize();
  const chunks: Buffer[] = [];
  for await (const chunk of pack) chunks.push(Buffer.from(chunk as Uint8Array));
  return gzipSync(Buffer.concat(chunks));
}
describe('verified archive source retrieval', () => {
  it('downloads public source without spending one REST request per file', async () => {
    const body = await archive([{ name: 'repo-sha/app.txt', data: contents }]);
    const urls: string[] = [];
    const result = await archiveFiles(
      manifest,
      async (url) => {
        urls.push(String(url));
        return new Response(body);
      },
      undefined,
      async () => {},
    );
    expect(result[0]?.data).toEqual(contents);
    expect(urls).toEqual([`https://codeload.github.com/owner/repo/tar.gz/${manifest.commit}`]);
  });
  it('retrieves export-ignored files by pinned raw URL and verifies their Git SHA', async () => {
    const body = await archive([]);
    const urls: string[] = [];
    const result = await archiveFiles(
      manifest,
      async (url) => {
        urls.push(String(url));
        return new Response(urls.length === 1 ? body : contents);
      },
      undefined,
      async () => {},
    );
    expect(result[0]?.data).toEqual(contents);
    expect(urls[1]).toBe(`https://raw.githubusercontent.com/owner/repo/${manifest.commit}/app.txt`);
    await expect(
      archiveFiles(
        manifest,
        async (url) =>
          new Response(String(url).includes('codeload') ? body : Buffer.from('tampered')),
        undefined,
        async () => {},
      ),
    ).rejects.toHaveProperty('code', 'GITHUB_BLOB_CHANGED');
  });
  it('never forwards private credentials to the archive redirect', async () => {
    const body = await archive([{ name: 'repo-sha/app.txt', data: contents }]);
    const auth: (string | null)[] = [];
    await archiveFiles(
      { ...manifest, private: true },
      async (_url, init) => {
        auth.push(new Headers(init?.headers).get('authorization'));
        return auth.length === 1
          ? new Response(null, {
              status: 302,
              headers: { location: 'https://codeload.github.com/owner/repo/legacy.tar.gz/sha' },
            })
          : new Response(body);
      },
      'private-fixture',
      async () => {},
    );
    expect(auth).toEqual(['Bearer private-fixture', null]);
  });
  it('rejects traversal before accepting archive contents', async () => {
    const body = await archive([{ name: 'repo-sha/../escape', data: contents }]);
    await expect(
      archiveFiles(
        manifest,
        async () => new Response(body),
        undefined,
        async () => {},
      ),
    ).rejects.toHaveProperty('code', 'UNSAFE_REPOSITORY_PATH');
  });
});
