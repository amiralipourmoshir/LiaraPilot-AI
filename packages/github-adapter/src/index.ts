import { detectProject } from './detect.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { RepositoryError } from './errors.js';
export { RepositoryError } from './errors.js';
import { archiveFiles } from './archive.js';
import { safeRepositoryPath, excludedRepositoryPath as excluded } from './paths.js';
export { safeRepositoryPath } from './paths.js';
import { manifestSchema, type RepositoryManifest } from '../../shared/src/repository.js';
export { manifestSchema, type RepositoryManifest } from '../../shared/src/repository.js';
const sha = z.string().regex(/^[a-f0-9]{40}$/);
export function repositoryAddress(input: string) {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new RepositoryError('REPOSITORY_URL_REJECTED');
  }
  const match = /^\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})\/?$/.exec(u.pathname);
  if (
    u.protocol !== 'https:' ||
    u.hostname !== 'github.com' ||
    u.port ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    !match ||
    ['.', '..'].includes(match[2]!)
  )
    throw new RepositoryError('REPOSITORY_URL_REJECTED');
  return { owner: match[1]!, repo: match[2]!.replace(/\.git$/, '') };
}
export class GithubRepository {
  constructor(
    private transport: typeof fetch = fetch,
    private token?: string,
    private options: { archive?: boolean } = {},
  ) {}
  private async get(path: string, maxBytes = 32 * 1024 * 1024) {
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), 10000);
    try {
      const r = await this.transport(`https://api.github.com${path}`, {
        signal: c.signal,
        redirect: 'error',
        headers: {
          accept: 'application/vnd.github+json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
          'x-github-api-version': '2026-03-10',
          'user-agent': 'LiaraPilot',
        },
      });
      if (!r.ok)
        throw new RepositoryError(
          r.status === 404
            ? 'GITHUB_AUTH_REQUIRED'
            : r.status === 401
              ? 'GITHUB_AUTH_EXPIRED'
              : r.status === 403 || r.status === 429
                ? 'GITHUB_RATE_LIMITED'
                : 'GITHUB_UNAVAILABLE',
        );
      if (!r.body) throw new RepositoryError('GITHUB_INVALID_RESPONSE');
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of r.body) {
        size += chunk.length;
        if (size > maxBytes) throw new RepositoryError('GITHUB_RESPONSE_TOO_LARGE');
        chunks.push(chunk);
      }
      return JSON.parse(Buffer.concat(chunks).toString()) as unknown;
    } catch (e) {
      if (e instanceof RepositoryError) throw e;
      throw new RepositoryError('GITHUB_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
  }
  async blob(owner: string, repo: string, id: string) {
    sha.parse(id);
    const b = z
      .object({
        sha,
        encoding: z.literal('base64'),
        size: z
          .number()
          .int()
          .max(128 * 1024 * 1024),
        content: z.string().max(180000000),
      })
      .parse(
        await this.get(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${id}`,
          180 * 1024 * 1024,
        ),
      );
    const data = Buffer.from(b.content.replace(/\s/g, ''), 'base64');
    if (
      data.length !== b.size ||
      createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex') !== id
    )
      throw new RepositoryError('GITHUB_BLOB_CHANGED');
    return data;
  }
  async branches(url: string) {
    const { owner, repo } = repositoryAddress(url);
    const base = `/repos/${owner}/${repo}`;
    const meta = z
      .object({ private: z.boolean(), default_branch: z.string() })
      .parse(await this.get(base));
    if (meta.private && !this.token) throw new RepositoryError('GITHUB_AUTH_REQUIRED');
    const names: string[] = [];
    let hasMore = false;
    for (let page = 1; page <= 5; page++) {
      const batch = z
        .array(z.object({ name: z.string().max(255) }))
        .max(100)
        .parse(await this.get(`${base}/branches?per_page=100&page=${page}`));
      names.push(...batch.map((b) => b.name));
      if (batch.length < 100) break;
      if (page === 5) hasMore = true;
    }
    return {
      repositoryUrl: url,
      defaultBranch: meta.default_branch,
      private: meta.private,
      branches: names,
      hasMore,
    };
  }
  async analyze(
    url: string,
    ref?: string,
    progress: (message: string) => Promise<void> = async () => {},
    root?: string,
    runtime?: string,
  ): Promise<RepositoryManifest> {
    await progress('در حال اتصال به مخزن و ثبت نسخه شاخه');
    const { owner, repo } = repositoryAddress(url);
    const base = `/repos/${owner}/${repo}`;
    const metadata = z
      .object({ private: z.boolean(), default_branch: z.string().min(1).max(255) })
      .parse(await this.get(base));
    if (metadata.private && !this.token) throw new RepositoryError('GITHUB_AUTH_REQUIRED');
    const commit = z
      .object({ sha, commit: z.object({ tree: z.object({ sha }) }) })
      .parse(
        await this.get(`${base}/commits/${encodeURIComponent(ref ?? metadata.default_branch)}`),
      );
    await progress('نسخه شاخه ثبت شد؛ در حال خواندن ساختار مخزن');
    const entrySchema = z.object({
      path: z.string(),
      mode: z.string(),
      type: z.string(),
      sha,
      size: z.number().int().nonnegative().optional(),
    });
    const treeSchema = z.object({ truncated: z.boolean(), tree: z.array(entrySchema) });
    let tree = treeSchema.parse(
      await this.get(`${base}/git/trees/${commit.commit.tree.sha}?recursive=1`),
    );
    if (tree.truncated) {
      // GitHub truncates recursive trees; traverse each directory instead of rejecting the repository.
      const all: z.infer<typeof entrySchema>[] = [];
      const pending = [{ sha: commit.commit.tree.sha, prefix: '' }];
      while (pending.length) {
        const directory = pending.shift()!;
        const part = treeSchema.parse(await this.get(`${base}/git/trees/${directory.sha}`));
        if (part.truncated) throw new RepositoryError('GITHUB_DIRECTORY_TRUNCATED');
        for (const entry of part.tree) {
          const path = directory.prefix + entry.path;
          if (!safeRepositoryPath(path)) throw new RepositoryError('UNSAFE_REPOSITORY_PATH');
          all.push({ ...entry, path });
          if (entry.type === 'tree' && !excluded(path))
            pending.push({ sha: entry.sha, prefix: path + '/' });
        }
        await progress(`در حال بررسی پوشه‌ها؛ ${all.length} ورودی شناسایی شد`);
      }
      tree = { truncated: false, tree: all };
    }
    const files: RepositoryManifest['files'] = [];
    const excludedFiles: string[] = [];
    const blockers: string[] = [];
    for (const f of tree.tree) {
      if (!safeRepositoryPath(f.path)) throw new RepositoryError('UNSAFE_REPOSITORY_PATH');
      if (excluded(f.path)) {
        excludedFiles.push(f.path);
        continue;
      }
      if (f.type === 'tree') continue;
      if (!['100644', '100755'].includes(f.mode) || f.type !== 'blob') {
        blockers.push(`فایل پیوندی یا submodule پشتیبانی نمی‌شود: ${f.path}`);
        continue;
      }
      if (f.size === undefined) throw new RepositoryError('GITHUB_INVALID_RESPONSE');
      files.push({ path: f.path, sha: f.sha, size: f.size! });
    }
    await progress(
      `ساختار مخزن خوانده شد؛ ${files.length} فایل. در حال شناسایی وابستگی‌ها و فرمان‌ها`,
    );
    const texts: Record<string, string> = {};
    const selected = files
      .filter((f) =>
        /(?:package\.json|requirements\.txt|pyproject\.toml|composer\.json|Dockerfile|go\.mod|Procfile|liara\.json|manage\.py|settings\.py|artisan|Pipfile|requirements[^/]*\.txt|app\.json|app\.config\.[jt]s|config\/(?:app|database)\.php|routes\/web\.php|Program\.cs|main\.go|\.csproj|server\.[jt]s|app\.[jt]s|index\.[jt]s|main\.py|app\.py|wsgi\.py|routes\.[jt]s)$/.test(
          f.path,
        ),
      )
      .filter((f) => f.size <= 2 * 1024 * 1024);
    for (let i = 0; i < selected.length; i += 6) {
      await Promise.all(
        selected.slice(i, i + 6).map(async (f) => {
          texts[f.path] = (await this.blob(owner, repo, f.sha)).toString('utf8');
        }),
      );
      await progress(
        `بررسی فایل‌های تنظیمات: ${Math.min(i + 6, selected.length)} از ${selected.length}`,
      );
    }
    const detected = detectProject(
      texts,
      files.map((f) => f.path),
      root,
      runtime,
    );
    await progress('تشخیص نوع پروژه و نیازمندی‌ها تکمیل شد');
    return {
      owner,
      repo,
      commit: commit.sha,
      private: metadata.private,
      files,
      excluded: excludedFiles,
      framework: detected.framework,
      start: detected.start,
      blockers: [...blockers, ...detected.blockers],
      evidence: detected.evidence,
      analysis: {
        platform: detected.platform,
        platformConfig: detected.platformConfig,
        roots: detected.roots,
        runtimes: detected.runtimes,
        scripts: detected.scripts,
        install: detected.install,
        build: detected.build,
        port: detected.port,
        healthPath: detected.healthPath,
        expectedText: detected.expectedText,
        outputDir: detected.outputDir,
        root: detected.root,
        environmentNames: detected.environmentNames,
        databases: detected.databases,
        minRamGb: detected.minRamGb,
        confidence: detected.confidence,
      },
    };
  }
  async refreshManifest(manifest: RepositoryManifest) {
    const source = {
      ...manifest,
      files: manifest.files.filter(
        (f) => !manifest.analysis?.root || f.path.startsWith(manifest.analysis.root),
      ),
    };
    const files = await this.files(source);
    const texts = Object.fromEntries(
      files
        .filter((f) =>
          /(?:package\.json|requirements[^/]*\.txt|pyproject\.toml|composer\.json|Dockerfile|go\.mod|Procfile|liara\.json|manage\.py|settings\.py|artisan|Pipfile|config\/(?:app|database)\.php|\.csproj|server\.[jt]s|app\.[jt]s|index\.[jt]s|main\.py|app\.py|wsgi\.py|routes\.[jt]s)$/.test(
            f.path,
          ),
        )
        .map((f) => [f.path, f.data.toString('utf8')]),
    );
    const d = detectProject(
      texts,
      manifest.files.map((f) => f.path),
      manifest.analysis?.root || undefined,
    );
    return {
      ...manifest,
      framework: d.framework,
      start: d.start,
      blockers: [...manifest.blockers.filter((b) => b.startsWith('فایل پیوندی')), ...d.blockers],
      evidence: d.evidence,
      analysis: {
        platform: d.platform,
        platformConfig: d.platformConfig,
        roots: d.roots,
        runtimes: d.runtimes,
        scripts: d.scripts,
        install: d.install,
        build: d.build,
        port: d.port,
        healthPath: d.healthPath,
        expectedText: d.expectedText,
        outputDir: d.outputDir,
        root: d.root,
        environmentNames: d.environmentNames,
        databases: d.databases,
        minRamGb: d.minRamGb,
        confidence: d.confidence,
      },
    };
  }
  async files(
    manifest: RepositoryManifest,
    progress: (message: string) => Promise<void> = async () => {},
  ) {
    if (this.options.archive !== false)
      return archiveFiles(manifest, this.transport, this.token, progress, (sha) =>
        this.blob(manifest.owner, manifest.repo, sha),
      );
    const entries: { path: string; data: Buffer }[] = [];
    for (let offset = 0; offset < manifest.files.length; offset += 6) {
      const batch = await Promise.all(
        manifest.files.slice(offset, offset + 6).map(async (file) => {
          if (!safeRepositoryPath(file.path) || excluded(file.path))
            throw new RepositoryError('UNSAFE_REPOSITORY_PATH');
          const data = await this.blob(manifest.owner, manifest.repo, file.sha);
          if (data.length !== file.size) throw new RepositoryError('GITHUB_BLOB_CHANGED');
          return { path: file.path, data };
        }),
      );
      entries.push(...batch);
      if (offset % 30 === 0 || entries.length === manifest.files.length)
        await progress(
          `دریافت فایل‌های نسخه تأییدشده: ${entries.length} از ${manifest.files.length}`,
        );
    }
    return entries;
  }
}
