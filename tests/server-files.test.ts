import { afterEach, expect, it } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, symlink, mkdir } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileScript } from '../packages/monitoring/src/server-files.js';
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
it('reads, atomically patches and restores a server file without executing its content', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lp-patch-'));
  dirs.push(dir);
  const file = join(dir, 'index.js'),
    before = 'export const n = 1;\n',
    after = '// $(touch unsafe) `echo unsafe`\nexport const n = 2;\n';
  await writeFile(file, before);
  const run = (op: 'read' | 'write' | 'list', sha = '', content = '', host = hostname()) => {
    const nonce = randomUUID(),
      script = fileScript(nonce, op, '/app', 'index.js', sha, content, host).replace(
        "root='/app'",
        `root='${dir}'`,
      );
    const r = spawnSync('/bin/sh', ['-c', script], { encoding: 'utf8', timeout: 5000 });
    return { status: r.status, out: r.stdout };
  };
  expect(run('read').out).toContain(hash(before));
  expect(run('write', hash(before), after).out).toContain(hash(after));
  expect(await readFile(file, 'utf8')).toBe(after);
  expect(run('write', hash(before), before).out).toContain('SERVER_CONFLICT');
  expect(run('write', hash(after), before, 'other-instance').out).toContain(
    'SERVER_INSTANCE_CHANGED',
  );
  expect(run('write', hash(after), before).out).toContain(hash(before));
  expect(await readFile(file, 'utf8')).toBe(before);
  await expect(readFile(join(dir, 'unsafe'))).rejects.toThrow();
  const list = run('list');
  expect(list.status).toBe(0);
  expect(list.out).toContain('OK:');
});
it('rejects symlinks escaping the approved directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lp-patch-path-'));
  dirs.push(dir);
  await mkdir(join(dir, 'inside'));
  await writeFile(join(dir, 'outside.js'), 'secret');
  await symlink(join(dir, 'outside.js'), join(dir, 'inside', 'index.js'));
  const nonce = randomUUID(),
    script = fileScript(nonce, 'read', '/app', 'index.js').replace(
      "root='/app'",
      `root='${dir}/inside'`,
    );
  const r = spawnSync('/bin/sh', ['-c', script], { encoding: 'utf8' });
  expect(r.stdout).toContain('SERVER_PATH_REJECTED');
});

it('does not accept a fragmented console response before its terminating newline', async () => {
  const { parseShellResult } = await import('../packages/monitoring/src/server-files.js');
  const nonce = randomUUID(),
    prefix = `\r\n__LP_${nonce}__:OK:aG9zdA==:${'a'.repeat(64)}:`;
  expect(parseShellResult(prefix + 'cGFydGlhbA==', nonce)).toBeNull();
  expect(parseShellResult(prefix + 'Y29tcGxldGU=\r\n', nonce)?.value).toContain('Y29tcGxldGU=');
});

it('transfers and restores a megabyte source file with chunked data without truncation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lp-large-patch-'));
  dirs.push(dir);
  const before = '// keep this content\n'.repeat(50000) + 'export const target=1;\n';
  const after = before.replace('target=1', 'target=2');
  const path = join(dir, 'index.js');
  await writeFile(path, before);
  const run = (op: 'read' | 'write', expected = '', content = '') => {
    const script = fileScript(
      randomUUID(),
      op,
      '/app',
      'index.js',
      expected,
      content,
      hostname(),
    ).replace("root='/app'", `root='${dir}'`);
    return spawnSync('/bin/sh', [], {
      input: script,
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 8 * 1024 * 1024,
    });
  };
  const read = run('read');
  expect(read.status).toBe(0);
  expect(read.stdout).toContain(Buffer.from(before).toString('base64'));
  expect(run('write', hash(before), after).stdout).toContain(hash(after));
  expect(await readFile(path, 'utf8')).toBe(after);
  expect(run('write', hash(after), before).stdout).toContain(hash(before));
  expect(await readFile(path, 'utf8')).toBe(before);
});
