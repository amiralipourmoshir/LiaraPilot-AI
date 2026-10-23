import { z } from 'zod';
import { platforms } from '../../shared/src/platforms.js';
import { LiaraClient } from '../../liara-adapter/src/client.js';
import type { paths } from '../../liara-adapter/src/generated.js';
export class DeploymentError extends Error {
  constructor(
    public code: string,
    public retryAfterMs = 10000,
  ) {
    super(
      (
        {
          CATALOG_UNAVAILABLE:
            'دریافت اطلاعات پلن‌های لیارا ممکن نشد؛ اتصال حساب و دسترسی تیم را بررسی کنید.',
          CATALOG_AUTH_FAILED:
            'دسترسی حساب یا تیم لیارا معتبر نیست؛ اتصال حساب را دوباره بررسی کنید.',
          CATALOG_INVALID: 'ساختار اطلاعات پلن‌های لیارا قابل پردازش نیست؛ دوباره تلاش کنید.',
          DEPLOYMENT_RATE_LIMITED:
            'لیارا درخواست ساخت را به‌دلیل محدودیت موقت تعداد درخواست‌ها نپذیرفت؛ پس از زمان انتظار و بررسی مقصد، دوباره تلاش کنید.',
          CREATION_CREDIT_REQUIRED:
            'برای ساخت سرویس جدید، لیارا اعتبار معادل یک هفته هزینه همه سرویس‌ها را لازم دارد. حساب را شارژ و موجودی را دوباره بررسی کنید.',
          PAYMENT_REQUIRED: 'اعتبار حساب لیارا کافی نیست؛ حساب را در کنسول رسمی شارژ کنید.',
        } as Record<string, string>
      )[code] ?? 'انتشار کامل نشد؛ جزئیات مرحله و شواهد را بررسی کنید.',
    );
  }
}
export interface DeploymentProvider {
  upload(name: string, archive: Buffer): Promise<string>;
  release(
    name: string,
    sourceId: string,
    port: number,
    platform?: string,
    outputDir?: string | null,
    args?: string[],
    platformConfig?: Record<string, string | boolean | number>,
  ): Promise<string>;
  create?(input: {
    name: string;
    platform: string;
    planId: string;
    bundleId: string;
    networkId: string;
  }): Promise<void>;
  network?(name: string): Promise<string>;
  environment?(name: string, variables: { key: string; value: string }[]): Promise<void>;
  releases(name: string): Promise<{ id: string; state: string | null }[]>;
  application(name: string): Promise<{ providerId: string; planId: string | null }>;
}
const endpoints = {
  sources: '/v2/projects/{name}/sources',
  releases: '/v2/projects/{name}/releases',
} satisfies Record<string, keyof paths>;
export class LiaraDeploymentProvider implements DeploymentProvider {
  private reader: LiaraClient;
  constructor(
    private token: string,
    private team: string,
    private transport: typeof fetch = fetch,
    private wait: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    this.reader = new LiaraClient(token, team, { fetch: transport });
  }
  private async post(name: string, path: string, body: BodyInit, contentType?: string) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.postOnce(name, path, body, contentType);
      } catch (error) {
        // Only a received HTTP 429 is retried, never a timeout or ambiguous mutation.
        if (
          !(error instanceof DeploymentError) ||
          error.code !== 'DEPLOYMENT_RATE_LIMITED' ||
          attempt >= 2 ||
          error.retryAfterMs > 60000
        )
          throw error;
        await this.wait(Math.max(1000, error.retryAfterMs) * (attempt + 1));
      }
    }
  }
  private async postOnce(name: string, path: string, body: BodyInit, contentType?: string) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(name)) throw new DeploymentError('INVALID_TARGET');
    const u = new URL(path.replace('{name}', encodeURIComponent(name)), 'https://api.liara.ir');
    if (this.team) u.searchParams.set('teamID', this.team);
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), 30000);
    try {
      const r = await this.transport(u, {
        method: 'POST',
        body,
        redirect: 'error',
        signal: c.signal,
        headers: {
          authorization: `Bearer ${this.token}`,
          ...(contentType ? { 'content-type': contentType } : {}),
        },
      });
      if (r.status === 429) {
        const hint = r.headers.get('retry-after');
        // The official console maps project-creation 429 without Retry-After to week_cost_required.
        if (path === '/v1/projects' && !hint) throw new DeploymentError('CREATION_CREDIT_REQUIRED');
        const ms = hint
          ? /^\d+$/.test(hint)
            ? Number(hint) * 1000
            : Date.parse(hint) - Date.now()
          : 10000;
        throw new DeploymentError(
          'DEPLOYMENT_RATE_LIMITED',
          Number.isFinite(ms) ? Math.max(1000, ms) : 10000,
        );
      }
      if (!r.ok)
        throw new DeploymentError(
          r.status === 402
            ? 'PAYMENT_REQUIRED'
            : r.status === 409
              ? 'APPLICATION_NAME_TAKEN'
              : r.status === 401 || r.status === 403
                ? 'DEPLOYMENT_AUTH_FAILED'
                : r.status === 429
                  ? 'DEPLOYMENT_RATE_LIMITED'
                  : 'DEPLOYMENT_PROVIDER_REJECTED',
        );
      if (path === '/v1/projects' || path === '/v1/projects/update-envs' || path === '/v1/networks')
        return {};
      if (!r.body) throw new DeploymentError('DEPLOYMENT_INVALID_RESPONSE');
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for await (const v of r.body) {
        bytes += v.length;
        if (bytes > 65536) throw new DeploymentError('DEPLOYMENT_INVALID_RESPONSE');
        chunks.push(v);
      }
      return JSON.parse(Buffer.concat(chunks).toString()) as unknown;
    } catch (e) {
      if (e instanceof DeploymentError) throw e;
      throw new DeploymentError('DEPLOYMENT_OUTCOME_UNKNOWN');
    } finally {
      clearTimeout(timer);
    }
  }
  async upload(name: string, archive: Buffer) {
    if (archive.length > 128 * 1024 * 1024) throw new DeploymentError('ARCHIVE_TOO_LARGE');
    const form = new FormData();
    form.set(
      'file',
      new Blob([new Uint8Array(archive)], { type: 'application/gzip' }),
      'source.tar.gz',
    );
    return z
      .object({ sourceID: z.string().min(1).max(256) })
      .parse(await this.post(name, endpoints.sources, form)).sourceID;
  }
  async create(input: {
    name: string;
    platform: string;
    planId: string;
    bundleId: string;
    networkId: string;
  }) {
    if (!platforms.some((p) => p.id === input.platform))
      throw new DeploymentError('UNSUPPORTED_PLATFORM');
    await this.post(
      input.name,
      '/v1/projects',
      JSON.stringify({
        name: input.name,
        platform: input.platform,
        planID: input.planId,
        bundlePlanID: input.bundleId,
        network: input.networkId,
      }),
      'application/json',
    );
  }
  async release(
    name: string,
    sourceId: string,
    port: number,
    platform = 'node',
    outputDir?: string | null,
    args?: string[],
    platformConfig?: Record<string, string | boolean | number>,
  ) {
    if (!platforms.some((p) => p.id === platform))
      throw new DeploymentError('UNSUPPORTED_PLATFORM');
    return z.object({ releaseID: z.string().min(1).max(256) }).parse(
      await this.post(
        name,
        endpoints.releases,
        JSON.stringify({
          sourceID: sourceId,
          type: platform,
          port,
          ...(args?.length ? { args } : {}),
          ...(platformConfig ? { platformConfig } : {}),
        }),
        'application/json',
      ),
    ).releaseID;
  }
  async network(name: string) {
    await this.post(
      name,
      '/v1/networks',
      JSON.stringify({ networkName: name + '-network' }),
      'application/json',
    );
    const u = new URL('https://api.liara.ir/v1/networks');
    if (this.team) u.searchParams.set('teamID', this.team);
    const response = await this.transport(u, {
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: { authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) throw new DeploymentError('NETWORK_CREATE_UNVERIFIED');
    const rows = z
      .object({ networks: z.array(z.object({ _id: z.string(), name: z.string() })).max(100) })
      .parse(await response.json());
    const network = rows.networks.find((n) => n.name === name + '-network');
    if (!network) throw new DeploymentError('NETWORK_CREATE_UNVERIFIED');
    return network._id;
  }
  async environment(name: string, variables: { key: string; value: string }[]) {
    await this.post(
      name,
      '/v1/projects/update-envs',
      JSON.stringify({ project: name, variables }),
      'application/json',
    );
  }
  async releases(name: string) {
    return (await this.reader.getDeployments(name, 1, 30)).releases;
  }
  async application(name: string) {
    return this.reader.getApplication(name);
  }
}
