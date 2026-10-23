import { createHash } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import tar from 'tar-stream';
import type { RepositoryManifest } from '../../shared/src/repository.js';
import { RepositoryError } from './errors.js';
import { safeRepositoryPath, excludedRepositoryPath } from './paths.js';
const MAX_SOURCE = 128 * 1024 * 1024;
async function download(
  manifest: RepositoryManifest,
  transport: typeof fetch,
  token: string | undefined,
  signal: AbortSignal,
) {
  const direct = `https://codeload.github.com/${encodeURIComponent(manifest.owner)}/${encodeURIComponent(manifest.repo)}/tar.gz/${manifest.commit}`;
  let response: Response;
  if (manifest.private) {
    if (!token) throw new RepositoryError('GITHUB_AUTH_REQUIRED');
    response = await transport(
      `https://api.github.com/repos/${encodeURIComponent(manifest.owner)}/${encodeURIComponent(manifest.repo)}/tarball/${manifest.commit}`,
      {
        redirect: 'manual',
        signal,
        headers: {
          authorization: `Bearer ${token}`,
          'user-agent': 'LiaraPilot',
          accept: 'application/vnd.github+json',
        },
      },
    );
    if (response.status === 302 || response.status === 301) {
      const target = new URL(response.headers.get('location') ?? '');
      if (
        target.protocol !== 'https:' ||
        target.hostname !== 'codeload.github.com' ||
        target.username ||
        target.password ||
        target.port ||
        !target.pathname
          .toLowerCase()
          .startsWith(`/${manifest.owner}/${manifest.repo}/`.toLowerCase())
      )
        throw new RepositoryError('GITHUB_ARCHIVE_REDIRECT_REJECTED');
      response = await transport(target, {
        redirect: 'error',
        signal,
        headers: { 'user-agent': 'LiaraPilot' },
      });
    }
  } else
    response = await transport(direct, {
      redirect: 'error',
      signal,
      headers: { 'user-agent': 'LiaraPilot' },
    });
  if (!response.ok)
    throw new RepositoryError(
      response.status === 401
        ? 'GITHUB_AUTH_EXPIRED'
        : response.status === 404
          ? 'GITHUB_AUTH_REQUIRED'
          : response.status === 403 || response.status === 429
            ? 'GITHUB_RATE_LIMITED'
            : 'GITHUB_ARCHIVE_UNAVAILABLE',
    );
  if (!response.body) throw new RepositoryError('GITHUB_INVALID_RESPONSE');
  return response;
}
export async function archiveFiles(
  manifest: RepositoryManifest,
  transport: typeof fetch,
  token: string | undefined,
  progress: (message: string) => Promise<void>,
  privateBlob?: (sha: string) => Promise<Buffer>,
) {
  if (
    !/^[a-f0-9]{40}$/.test(manifest.commit) ||
    !/^[A-Za-z0-9-]{1,39}$/.test(manifest.owner) ||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(manifest.repo)
  )
    throw new RepositoryError('REPOSITORY_URL_REJECTED');
  if (manifest.files.reduce((n, f) => n + f.size, 0) > MAX_SOURCE)
    throw new RepositoryError('SOURCE_TRANSFER_CAPACITY');
  const expected = new Map(manifest.files.map((f) => [f.path, f]));
  if (expected.size !== manifest.files.length) throw new RepositoryError('UNSAFE_REPOSITORY_PATH');
  for (const path of expected.keys())
    if (!safeRepositoryPath(path) || excludedRepositoryPath(path))
      throw new RepositoryError('UNSAFE_REPOSITORY_PATH');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await progress(
        attempt
          ? 'در حال تلاش دوباره برای دریافت امن آرشیو سورس'
          : 'در حال دریافت آرشیو همان commit از GitHub',
      );
      const signal = AbortSignal.timeout(120000);
      const response = await download(manifest, transport, token, signal);
      const entries: { path: string; data: Buffer }[] = [];
      const seen = new Set<string>();
      const extract = tar.extract();
      let prefix: string | undefined,
        expanded = 0,
        compressed = 0;
      extract.on('entry', (header, stream, next) => {
        stream.on('error', (error) => extract.destroy(error));
        const raw = header.name.replace(/\/$/, '');
        const slash = raw.indexOf('/');
        const head = slash < 0 ? raw : raw.slice(0, slash);
        const path = slash < 0 ? '' : raw.slice(slash + 1);
        if (!prefix) prefix = head;
        if (prefix !== head || !safeRepositoryPath(head) || (path && !safeRepositoryPath(path))) {
          extract.destroy(new RepositoryError('UNSAFE_REPOSITORY_PATH'));
          stream.resume();
          return;
        }
        const file = expected.get(path);
        if (!file) {
          stream.resume();
          stream.on('end', next);
          return;
        }
        if (header.type !== 'file' || seen.has(path)) {
          extract.destroy(new RepositoryError('GITHUB_ARCHIVE_MISMATCH'));
          stream.resume();
          return;
        }
        seen.add(path);
        if (header.size !== file.size) {
          stream.resume();
          stream.on('end', next);
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        stream.on('data', (value: unknown) => {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
          bytes += chunk.length;
          if (bytes > file.size) {
            extract.destroy(new RepositoryError('GITHUB_ARCHIVE_MISMATCH'));
            return;
          }
          chunks.push(chunk);
        });
        stream.on('end', () => {
          const data = Buffer.concat(chunks);
          if (
            data.length !== file.size ||
            createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex') !==
              file.sha
          ) {
            next();
            return;
          }
          entries.push({ path, data });
          if (entries.length % 30 === 0 || entries.length === expected.size)
            void progress(`فایل‌های بررسی‌شده آرشیو: ${entries.length} از ${expected.size}`).then(
              () => next(),
              (error) => extract.destroy(error),
            );
          else next();
        });
      });
      const input = Readable.from(
        (async function* () {
          for await (const chunk of response.body!) {
            compressed += chunk.length;
            if (compressed > 256 * 1024 * 1024)
              throw new RepositoryError('SOURCE_TRANSFER_CAPACITY');
            yield chunk;
          }
        })(),
      );
      const limit = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          expanded += chunk.length;
          if (expanded > 512 * 1024 * 1024)
            callback(new RepositoryError('SOURCE_TRANSFER_CAPACITY'));
          else callback(null, chunk);
        },
      });
      await pipeline(input, createGunzip(), limit, extract, { signal });
      const received = new Map(entries.map((entry) => [entry.path, entry]));
      const missing = manifest.files.filter((f) => !received.has(f.path));
      if (missing.length)
        await progress('در حال دریافت مستقیم فایل‌هایی که از آرشیو GitHub کنار گذاشته شده‌اند');
      for (let offset = 0; offset < missing.length; offset += 6) {
        const batch = await Promise.all(
          missing.slice(offset, offset + 6).map(async (file) => {
            let data: Buffer;
            if (manifest.private) {
              if (!privateBlob) throw new RepositoryError('GITHUB_AUTH_REQUIRED');
              data = await privateBlob(file.sha);
            } else {
              const url = `https://raw.githubusercontent.com/${manifest.owner}/${manifest.repo}/${manifest.commit}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
              const r = await transport(url, {
                redirect: 'error',
                signal: AbortSignal.timeout(20000),
                headers: { 'user-agent': 'LiaraPilot' },
              });
              if (!r.ok || !r.body) throw new RepositoryError('GITHUB_ARCHIVE_MISSING_FILES');
              const chunks: Buffer[] = [];
              let bytes = 0;
              for await (const chunk of r.body) {
                bytes += chunk.length;
                if (bytes > file.size) throw new RepositoryError('GITHUB_BLOB_CHANGED');
                chunks.push(Buffer.from(chunk));
              }
              data = Buffer.concat(chunks);
            }
            if (
              data.length !== file.size ||
              createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex') !==
                file.sha
            )
              throw new RepositoryError('GITHUB_BLOB_CHANGED');
            return { path: file.path, data };
          }),
        );
        for (const file of batch) received.set(file.path, file);
        await progress(`فایل‌های تأییدشده سورس: ${received.size} از ${expected.size}`);
      }
      return manifest.files.map((f) => received.get(f.path)!);
    } catch (error) {
      if (error instanceof RepositoryError && !['GITHUB_ARCHIVE_UNAVAILABLE'].includes(error.code))
        throw error;
      if (attempt === 2)
        throw error instanceof RepositoryError
          ? error
          : new RepositoryError('GITHUB_ARCHIVE_UNAVAILABLE');
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw new RepositoryError('GITHUB_ARCHIVE_UNAVAILABLE');
}
