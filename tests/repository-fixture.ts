import { createHash } from 'node:crypto';
import { GithubRepository } from '../packages/github-adapter/src/index.js';
const blobHash = (value: string) =>
  createHash('sha1')
    .update(`blob ${Buffer.byteLength(value)}\0${value}`)
    .digest('hex');
export const contents: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'fixture-app',
    scripts: { start: 'node server.js' },
    dependencies: { express: '5.1.0' },
  }),
  'package-lock.json': '{"lockfileVersion":3}',
  'server.js':
    'const http = require("http"); http.createServer((req,res)=>res.end("healthy")).listen(process.env.PORT || 3000);',
  '.env': 'PASSWORD=not-real-private',
};
export const commit = 'a'.repeat(40);
export const tree = 'b'.repeat(40);
export function githubFixture(
  options: { unsafe?: boolean; truncated?: boolean; missingStart?: boolean } = {},
) {
  let calls = 0;
  const files = { ...contents };
  if (options.missingStart) files['package.json'] = '{"name":"no-start"}';
  const entries = Object.entries(files).map(([path, content]) => ({
    path,
    mode: '100644',
    type: 'blob',
    sha: blobHash(content),
    size: Buffer.byteLength(content),
  }));
  return {
    get calls() {
      return calls;
    },
    client: new GithubRepository(
      async (input, init) => {
        calls++;
        if (init?.redirect !== 'error') throw new Error('redirect policy');
        const url = new URL(String(input));
        if (url.origin !== 'https://api.github.com') throw new Error('unsafe upstream');
        if (url.pathname.endsWith('/git/trees/' + tree))
          return Response.json({
            truncated: !!options.truncated,
            tree: options.unsafe
              ? [
                  ...entries,
                  { path: '../escape', mode: '100644', type: 'blob', sha: commit, size: 1 },
                ]
              : entries,
          });
        if (url.pathname.includes('/git/blobs/')) {
          const entry = entries.find((f) => url.pathname.endsWith(f.sha));
          if (!entry) return Response.json({}, { status: 404 });
          return Response.json({
            sha: entry.sha,
            size: entry.size,
            encoding: 'base64',
            content: Buffer.from(files[entry.path]!).toString('base64'),
          });
        }
        if (url.pathname.includes('/commits/'))
          return Response.json({ sha: commit, commit: { tree: { sha: tree } } });
        return Response.json({ private: false, default_branch: 'main' });
      },
      undefined,
      { archive: false },
    ),
  };
}
