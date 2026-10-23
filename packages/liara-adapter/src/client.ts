import { z } from 'zod';
import { redactSecrets } from '../../security/src/redact.js';
import type { CloudLogs, CloudReleases, CloudMetrics } from '../../shared/src/cloud.js';
import { LiaraError } from './errors.js';
import type { paths } from './generated.js';
const endpoints = {
  list: '/v1/projects',
  detail: '/v1/projects/{name}',
  logs: '/v1/projects/{name}/logs',
  releases: '/v1/projects/{name}/releases',
  metrics: '/v1/projects/{name}/metrics/summary',
} satisfies Record<string, keyof paths>;
const name = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const projectSchema = z.object({
  _id: name,
  project_id: name,
  type: z.string().max(128).nullish(),
  status: z.string().max(256).nullish(),
  scale: z.number().finite().nullish(),
  planID: z.string().max(128).nullish(),
  isDeployed: z.boolean().nullish(),
});
const listSchema = z.object({ projects: z.array(projectSchema).max(500) });
const logsSchema = z
  .array(
    z.object({
      type: z.string().max(128),
      datetime: z.string().max(128),
      message: z.string().max(65536),
    }),
  )
  .max(10000);
// Current official CLI: src/commands/app/logs.ts uses v2, Unix seconds and JSON log lines.
const modernLogsSchema = z.object({
  data: z
    .array(
      z.object({
        metaData: z.object({ releaseId: z.string().max(256) }).passthrough(),
        values: z
          .array(z.tuple([z.string().regex(/^\d{16,22}$/), z.string().max(65536)]))
          .max(1000),
      }),
    )
    .max(500),
});
const modernLogLineSchema = z.object({ _entry: z.string().max(65536), type: z.string().max(128) });
const releasesSchema = z.object({
  total: z.number().finite().nullish(),
  currentRelease: z.string().max(256).nullish(),
  releases: z
    .array(
      z.object({
        _id: z.string().max(256),
        state: z.string().max(256).nullish(),
        type: z.string().max(128).nullish(),
        port: z.number().nullish(),
        createdAt: z.string().max(128).nullish(),
        finishedAt: z.string().max(128).nullish(),
        tag: z.string().max(256).nullish(),
        gitInfo: z
          .object({ commit: z.string().max(256).nullish(), branch: z.string().max(256).nullish() })
          .nullish(),
      }),
    )
    .max(100),
});
const sample = z.object({
  applet: z.string().max(256),
  value: z.array(z.union([z.number().finite(), z.string().max(256)])).max(100),
});
const summarySchema = z.object({
  cpuUsage: z.array(sample).max(100),
  memoryUsage: z.array(sample).max(100),
});
export type ProviderApplication = {
  providerId: string;
  name: string;
  platform: string | null;
  status: string | null;
  scale: number | null;
  planId: string | null;
  isDeployed: boolean | null;
};
export interface CloudProvider {
  listApplications(): Promise<ProviderApplication[]>;
  getApplication(name: string): Promise<ProviderApplication>;
  getBuildLogs?(
    releaseId: string,
    since: string,
  ): Promise<{ state: string | null; cursor: string; lines: { at: string; text: string }[] }>;
  getLogs(name: string, since: string): Promise<CloudLogs>;
  getDeployments(name: string, page?: number, count?: number): Promise<CloudReleases>;
  getMetrics(name: string): Promise<CloudMetrics>;
  getCapabilities(): ReturnType<typeof capabilities>;
}
export const capabilities = () => ({
  provider: 'LIARA' as const,
  mode: 'LIVE' as const,
  operations: ['listApplications', 'getApplication', 'getLogs', 'getDeployments', 'getMetrics']
    .map((name) => ({
      name,
      available: true,
      requiresApproval: false,
      reason: null as string | null,
    }))
    .concat(
      [
        {
          name: 'deploy',
          available: true,
          requiresApproval: true,
          reason:
            'انتشار چندپلتفرمی از مخزن عمومی یا خصوصی؛ ساخت سرویس جدید یا انتخاب سرویس موجود، با طرح و تأیید صریح.',
        },
      ],
      ['restart', 'deleteApplication', 'resize'].map((name) => ({
        name,
        available: false,
        requiresApproval: true,
        reason: 'اجرای این عملیات تا تکمیل سیستم تأیید و مسیر انتشار فعال نیست.',
      })),
    ),
});
export class LiaraClient implements CloudProvider {
  constructor(
    private token: string,
    private teamId = '',
    private options: { fetch?: typeof fetch; timeoutMs?: number; maxBytes?: number } = {},
  ) {}
  private text(value: string | null | undefined) {
    return value == null ? null : redactSecrets(value, [this.token]);
  }
  private project(input: z.infer<typeof projectSchema>): ProviderApplication {
    if (this.text(input._id) !== input._id || this.text(input.project_id) !== input.project_id)
      throw new LiaraError(
        'LIARA_MALFORMED_RESPONSE',
        502,
        'شناسه سرویس در پاسخ لیارا معتبر نیست.',
      );
    return {
      providerId: input._id,
      name: input.project_id,
      platform: this.text(input.type),
      status: this.text(input.status),
      scale: input.scale ?? null,
      planId: this.text(input.planID),
      isDeployed: input.isDeployed ?? null,
    };
  }
  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    query: Record<string, string> = {},
  ): Promise<T> {
    const url = new URL(path, 'https://api.liara.ir');
    if (url.origin !== 'https://api.liara.ir') throw new Error('Unexpected provider origin');
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    if (this.teamId) url.searchParams.set('teamID', this.teamId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10000);
    timer.unref();
    try {
      const response = await (this.options.fetch ?? fetch)(url, {
        method: 'GET',
        headers: { authorization: `Bearer ${this.token}`, accept: 'application/json' },
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        if (response.status === 401)
          throw new LiaraError(
            'LIARA_AUTH_FAILED',
            422,
            'اتصال برقرار نشد. اعتبار توکن لیارا را بررسی کنید.',
          );
        if (response.status === 403)
          throw new LiaraError(
            'LIARA_FORBIDDEN',
            422,
            'این توکن به سرویس یا تیم انتخاب‌شده دسترسی ندارد.',
          );
        if (response.status === 404)
          throw new LiaraError('LIARA_NOT_FOUND', 404, 'سرویس در حساب متصل لیارا پیدا نشد.');
        if (response.status === 429) {
          const retry = Number(response.headers.get('retry-after'));
          throw new LiaraError(
            'LIARA_RATE_LIMITED',
            429,
            'محدودیت درخواست لیارا فعال شده است. کمی بعد دوباره تلاش کنید.',
            Number.isFinite(retry) && retry > 0 && retry <= 86400 ? retry : undefined,
          );
        }
        throw new LiaraError(
          'LIARA_UNAVAILABLE',
          502,
          'لیارا در حال حاضر پاسخ قابل استفاده‌ای نمی‌دهد. دوباره تلاش کنید.',
        );
      }
      const limit = this.options.maxBytes ?? 2 * 1024 * 1024;
      if (Number(response.headers.get('content-length')) > limit)
        throw new LiaraError('LIARA_MALFORMED_RESPONSE', 502, 'حجم پاسخ لیارا بیش از حد مجاز است.');
      const reader = response.body?.getReader();
      if (!reader) throw new LiaraError('LIARA_MALFORMED_RESPONSE', 502, 'پاسخ لیارا خالی است.');
      const parts: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > limit) {
            controller.abort();
            throw new LiaraError(
              'LIARA_MALFORMED_RESPONSE',
              502,
              'حجم پاسخ لیارا بیش از حد مجاز است.',
            );
          }
          parts.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      let raw: unknown;
      try {
        raw = JSON.parse(Buffer.concat(parts).toString('utf8'));
      } catch {
        throw new LiaraError('LIARA_MALFORMED_RESPONSE', 502, 'ساختار پاسخ لیارا معتبر نیست.');
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success)
        throw new LiaraError(
          'LIARA_MALFORMED_RESPONSE',
          502,
          'پاسخ لیارا با قرارداد مورد انتظار سازگار نیست.',
        );
      return parsed.data;
    } catch (error) {
      if (error instanceof LiaraError) throw error;
      if (controller.signal.aborted)
        throw new LiaraError(
          'LIARA_TIMEOUT',
          504,
          'زمان انتظار پاسخ لیارا پایان یافت. دوباره تلاش کنید.',
        );
      throw new LiaraError(
        'LIARA_UNAVAILABLE',
        502,
        'ارتباط با لیارا برقرار نشد. دوباره تلاش کنید.',
      );
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  async listApplications() {
    return (await this.request(endpoints.list, listSchema)).projects.map((project) =>
      this.project(project),
    );
  }
  async getApplication(applicationName: string) {
    const result = await this.request(
      endpoints.detail.replace('{name}', encodeURIComponent(name.parse(applicationName))),
      z.object({ project: projectSchema }),
    );
    return this.project(result.project);
  }
  async getBuildLogs(releaseId: string, since: string) {
    name.parse(releaseId);
    if (!/^[0-9A-Za-z: .+_-]{1,128}$/.test(since)) throw new Error('Invalid log cursor');
    const result = await this.request(
      `/v2/releases/${encodeURIComponent(releaseId)}/build-logs`,
      z.object({
        release: z.object({ state: z.string().max(128).nullish() }),
        buildOutput: z
          .array(
            z.object({
              createdAt: z.union([z.string().max(128), z.number().finite()]),
              line: z.string().max(65536),
            }),
          )
          .max(2000),
      }),
      { since },
    );
    return {
      state: result.release.state ?? null,
      cursor: String(result.buildOutput.at(-1)?.createdAt ?? since),
      lines: result.buildOutput.map((l) => ({
        at: String(l.createdAt),
        text: redactSecrets(l.line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, ''), [this.token]).slice(
          0,
          16384,
        ),
      })),
    };
  }
  async getLogs(applicationName: string, since: string): Promise<CloudLogs> {
    z.iso.datetime().parse(since);
    const application = encodeURIComponent(name.parse(applicationName));
    let logs: Array<{ type: string; datetime: string; message: string }>;
    let contract: CloudLogs['contract'] = 'CLI_V2';
    let limited = false;
    try {
      const result = await this.request(`/v2/projects/${application}/logs`, modernLogsSchema, {
        start: String(Math.floor(Date.parse(since) / 1000)),
        direction: 'forward',
        last_lines: 'false',
      });
      const entries = result.data.flatMap((group) => group.values);
      if (entries.length > 10000)
        throw new LiaraError(
          'LIARA_MALFORMED_RESPONSE',
          502,
          'تعداد خطوط پاسخ لیارا بیش از حد مجاز است.',
        );
      entries.sort((left, right) =>
        BigInt(left[0]) < BigInt(right[0]) ? -1 : BigInt(left[0]) > BigInt(right[0]) ? 1 : 0,
      );
      limited = entries.length > 500;
      logs = entries.slice(-500).map(([stamp, raw]) => {
        let value: unknown;
        try {
          value = JSON.parse(raw);
        } catch {
          throw new LiaraError('LIARA_MALFORMED_RESPONSE', 502, 'ساختار خط لاگ لیارا معتبر نیست.');
        }
        const parsed = modernLogLineSchema.safeParse(value);
        const at = new Date(Number(BigInt(stamp) / 1000000n));
        if (!parsed.success || !Number.isFinite(at.getTime()))
          throw new LiaraError(
            'LIARA_MALFORMED_RESPONSE',
            502,
            'قالب یا زمان خط لاگ لیارا معتبر نیست.',
          );
        return { type: parsed.data.type, datetime: at.toISOString(), message: parsed.data._entry };
      });
    } catch (error) {
      // Never retry auth, rate-limit, timeout or malformed responses through another contract.
      if (!(error instanceof LiaraError) || error.code !== 'LIARA_NOT_FOUND') throw error;
      contract = 'OPENAPI_V1';
      logs = await this.request(endpoints.logs.replace('{name}', application), logsSchema, {
        since,
      });
    }
    return {
      source: 'LIARA',
      contract,
      fetchedAt: new Date().toISOString(),
      since,
      truncated: limited || logs.length > 500 || logs.some((log) => log.message.length > 8192),
      logs: logs.slice(-500).map((log) => ({
        type: this.text(log.type)!,
        datetime: this.text(log.datetime)!,
        message: redactSecrets(log.message, [this.token]).slice(0, 8192),
      })),
    };
  }
  async getDeployments(applicationName: string, page = 1, count = 10): Promise<CloudReleases> {
    z.number().int().min(1).max(1000).parse(page);
    z.number().int().min(1).max(50).parse(count);
    const result = await this.request(
      endpoints.releases.replace('{name}', encodeURIComponent(name.parse(applicationName))),
      releasesSchema,
      { page: String(page), count: String(count) },
    );
    return {
      source: 'LIARA',
      fetchedAt: new Date().toISOString(),
      total: result.total ?? null,
      currentRelease: this.text(result.currentRelease),
      releases: result.releases.map((release) => ({
        id: this.text(release._id)!,
        state: this.text(release.state),
        type: this.text(release.type),
        port: release.port ?? null,
        createdAt: this.text(release.createdAt),
        finishedAt: this.text(release.finishedAt),
        tag: this.text(release.tag),
        commit: this.text(release.gitInfo?.commit),
        branch: this.text(release.gitInfo?.branch),
      })),
    };
  }
  async getMetrics(applicationName: string): Promise<CloudMetrics> {
    const result = await this.request(
      endpoints.metrics.replace('{name}', encodeURIComponent(name.parse(applicationName))),
      summarySchema,
    );
    const clean = (entries: z.infer<typeof sample>[]) =>
      entries.map((entry) => ({
        applet: this.text(entry.applet)!,
        value: entry.value.map((value) => (typeof value === 'string' ? this.text(value)! : value)),
      }));
    return {
      source: 'LIARA',
      fetchedAt: new Date().toISOString(),
      unitsVerified: false,
      cpuUsage: clean(result.cpuUsage),
      memoryUsage: clean(result.memoryUsage),
    };
  }
  getCapabilities() {
    return capabilities();
  }
  unsupported(): never {
    throw new LiaraError(
      'LIARA_CAPABILITY_UNAVAILABLE',
      501,
      'این عملیات از طریق اتصال فعلی در دسترس نیست.',
    );
  }
}
