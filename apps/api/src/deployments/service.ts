import { creationCredit } from '../../../../packages/deployment/src/billing.js';
import type { Database, Prisma } from '../../../../packages/database/src/index.js';
import { Prisma as PrismaRuntime } from '../../../../packages/database/src/index.js';
import { z } from 'zod';
import {
  GithubRepository,
  RepositoryError,
} from '../../../../packages/github-adapter/src/index.js';
import {
  deploymentInputSchema,
  deploymentSchema,
  deploymentRecoverySchema,
} from '../../../../packages/shared/src/deployment.js';
import { deploymentSnapshotSchema } from '../../../../packages/deployment/src/contracts.js';
import { verifyHttp } from '../../../../packages/deployment/src/health.js';
import { LiaraError } from '../../../../packages/liara-adapter/src/errors.js';
import { deploymentEvent } from '../../../../packages/deployment/src/runner.js';
import { manifestSchema } from '../../../../packages/shared/src/repository.js';
import { deploymentHash } from '../../../../packages/deployment/src/runner.js';
import { randomUUID } from 'node:crypto';
import { credentialKey, sealCredential } from '../../../../packages/security/src/credentials.js';
import { digest } from '../../../../packages/security/src/auth.js';
import type { Env } from '../../../../packages/shared/src/env.js';
import type { GithubService } from '../github/service.js';
import { wizardPlanInputSchema, inspectionSchema } from '../../../../packages/shared/src/wizard.js';
import { AppError } from '../errors.js';
import type { LiaraService } from '../connections/liara-service.js';
const json = (v: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export class DeploymentService {
  constructor(
    private db: Database,
    private liara: LiaraService,
    private github = new GithubRepository(),
    private githubService?: GithubService,
    private env?: Env,
    private recoveryHealth: typeof verifyHttp = verifyHttp,
  ) {}
  private async repositoryClient(userId: string) {
    return this.githubService ? this.githubService.client(userId) : this.github;
  }
  async analyze(
    userId: string,
    input: { repositoryUrl: string; branch: string; root?: string; runtime?: string },
    progress?: (message: string) => Promise<void>,
  ) {
    const repository = await (
      await this.repositoryClient(userId)
    ).analyze(input.repositoryUrl, input.branch, progress, input.root, input.runtime);
    const auth = await this.githubService?.token(userId);
    const row = await this.db.repositoryAnalysis.create({
      data: {
        userId,
        repositoryUrl: input.repositoryUrl,
        branch: input.branch,
        manifest: json(repository),
        githubVersion: repository.private ? (auth?.version ?? null) : null,
        githubConnectionId: repository.private ? (auth?.connectionId ?? null) : null,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    return {
      id: row.id,
      repositoryUrl: row.repositoryUrl,
      branch: row.branch,
      manifest: repository,
      expiresAt: row.expiresAt.toISOString(),
    };
  }
  private inspectionRuns = new Set<string>();
  async startInspection(
    userId: string,
    input: { repositoryUrl: string; branch: string; root?: string; runtime?: string },
  ) {
    if (
      (await this.db.repositoryInspection.count({
        where: { userId, state: { in: ['PENDING', 'RUNNING'] } },
      })) >= 2
    )
      throw new AppError(
        409,
        'INSPECTION_BUSY',
        'دو بررسی در حال اجرا دارید؛ منتظر تکمیل آن‌ها بمانید.',
      );
    const row = await this.db.repositoryInspection.create({ data: { userId, input: json(input) } });
    return this.inspection(userId, row.id);
  }
  async inspection(userId: string, id: string) {
    const row = await this.db.repositoryInspection.findFirst({ where: { id, userId } });
    if (!row) throw new AppError(404, 'INSPECTION_NOT_FOUND', 'بررسی پیدا نشد.');
    if (
      row.state === 'PENDING' ||
      (row.state === 'RUNNING' && (!row.leaseUntil || row.leaseUntil < new Date()))
    )
      void this.performInspection(userId, id).catch(() => {});
    return inspectionSchema.parse({
      id: row.id,
      state: row.state,
      events: row.events,
      result: row.result,
      error: row.error,
    });
  }
  private async performInspection(userId: string, id: string) {
    if (this.inspectionRuns.has(id)) return;
    this.inspectionRuns.add(id);
    try {
      const claim = await this.db.repositoryInspection.updateMany({
        where: {
          id,
          userId,
          OR: [{ state: 'PENDING' }, { state: 'RUNNING', leaseUntil: { lt: new Date() } }],
        },
        data: { state: 'RUNNING', leaseUntil: new Date(Date.now() + 120000) },
      });
      if (!claim.count) return;
      const row = await this.db.repositoryInspection.findUniqueOrThrow({ where: { id } });
      const { analysisInputSchema } = await import('../../../../packages/shared/src/wizard.js');
      const events = Array.isArray(row.events) ? row.events : [];
      const progress = async (message: string) => {
        events.push({ message, createdAt: new Date().toISOString() });
        await this.db.repositoryInspection.update({
          where: { id },
          data: { events: json(events.slice(-200)), leaseUntil: new Date(Date.now() + 120000) },
        });
      };
      try {
        const result = await this.analyze(userId, analysisInputSchema.parse(row.input), progress);
        await this.db.repositoryInspection.update({
          where: { id },
          data: { state: 'SUCCEEDED', result: json(result), leaseUntil: null },
        });
      } catch (error) {
        const safe =
          error instanceof RepositoryError || error instanceof AppError
            ? { code: error.code, message: error.message }
            : {
                code: 'INSPECTION_FAILED',
                message: 'بررسی متوقف شد؛ دوباره تلاش کنید. هیچ تغییری در پروژه انجام نشده است.',
              };
        await this.db.repositoryInspection.update({
          where: { id },
          data: { state: 'FAILED', error: json(safe), leaseUntil: null },
        });
      }
    } finally {
      this.inspectionRuns.delete(id);
    }
  }
  private async analysis(userId: string, id: string) {
    const row = await this.db.repositoryAnalysis.findFirst({
      where: { id, userId, expiresAt: { gt: new Date() } },
    });
    if (!row)
      throw new AppError(404, 'ANALYSIS_EXPIRED', 'بررسی پروژه منقضی شده است؛ دوباره بررسی کنید.');
    return row;
  }
  async resolve(
    userId: string,
    id: string,
    answers: {
      root?: string;
      runtime?: string;
      startScript?: string;
      buildScript?: string;
      customStart?: string;
      customBuild?: string;
      confirmCustom?: boolean;
    },
  ) {
    const row = await this.analysis(userId, id);
    const { manifestSchema } = await import('../../../../packages/shared/src/repository.js');
    let manifest = manifestSchema.parse(row.manifest);
    if (answers.root !== undefined) {
      if (!manifest.analysis?.roots.includes(answers.root))
        throw new AppError(
          422,
          'INVALID_PROJECT_ROOT',
          'یکی از پوشه‌های شناسایی‌شده را انتخاب کنید.',
        );
      return this.analyze(userId, {
        repositoryUrl: row.repositoryUrl,
        branch: row.branch,
        root: answers.root,
      });
    }
    if (answers.runtime) {
      if (!manifest.analysis?.runtimes.includes(answers.runtime))
        throw new AppError(422, 'INVALID_RUNTIME', 'یکی از محیط‌های شناسایی‌شده را انتخاب کنید.');
      return this.analyze(userId, {
        repositoryUrl: row.repositoryUrl,
        branch: row.branch,
        root: manifest.analysis.root,
        runtime: answers.runtime,
      });
    }
    const config = manifest.analysis;
    if (!config)
      throw new AppError(422, 'PROJECT_NEEDS_REVIEW', 'پروژه به بررسی بیشتری نیاز دارد.');
    for (const [key, script] of [
      ['startScript', answers.startScript],
      ['buildScript', answers.buildScript],
    ] as const) {
      if (!script) continue;
      const command = config.scripts[script];
      if (!command)
        throw new AppError(
          422,
          'INVALID_PROJECT_SCRIPT',
          'فرمان انتخاب‌شده در فایل پروژه وجود ندارد.',
        );
      if (key === 'startScript') {
        manifest.start = command;
        manifest.blockers = manifest.blockers.filter((b) => !b.includes('فرمان اجرای برنامه'));
      } else config.build = command;
      manifest.evidence.push({
        path: config.root + 'package.json',
        finding: `با انتخاب شما، ${key === 'startScript' ? 'اجرا' : 'ساخت'} از اسکریپت ${script} انجام می‌شود.`,
      });
    }
    if (answers.customStart || answers.customBuild) {
      if (!answers.confirmCustom)
        throw new AppError(
          422,
          'CUSTOM_COMMAND_CONFIRMATION_REQUIRED',
          'اجرای فرمان دلخواه را تأیید کنید.',
        );
      if (
        answers.customStart &&
        !['node', 'next', 'python', 'django', 'flask'].includes(config.platform)
      )
        throw new AppError(
          422,
          'CUSTOM_START_UNSUPPORTED',
          'این سرویس از وب‌سرور یا Dockerfile پروژه استفاده می‌کند؛ دستور اجرای سفارشی باید در تنظیمات همان پروژه تعریف شود.',
        );
      if (
        answers.customBuild &&
        !['node', 'next', 'react', 'angular', 'vue', 'laravel'].includes(config.platform)
      )
        throw new AppError(
          422,
          'CUSTOM_BUILD_UNSUPPORTED',
          'برای این نوع پروژه، روش ساخت از فایل‌های پروژه یا Dockerfile تعیین می‌شود.',
        );
      if (answers.customStart) {
        manifest.start = answers.customStart;
        manifest.blockers = manifest.blockers.filter(
          (b) => !b.includes('فرمان اجرای برنامه') && !b.includes('فایل ورودی Python'),
        );
      }
      if (answers.customBuild) config.build = answers.customBuild;
      manifest.evidence.push({
        path: 'تنظیمات انتخابی کاربر',
        finding:
          'فرمان سفارشی با تأیید شما ثبت شد؛ فقط پس از تأیید طرح نهایی در محیط ساخت لیارا اجرا می‌شود.',
      });
    }
    await this.db.repositoryAnalysis.update({ where: { id }, data: { manifest: json(manifest) } });
    return {
      id: row.id,
      repositoryUrl: row.repositoryUrl,
      branch: row.branch,
      manifest,
      expiresAt: row.expiresAt.toISOString(),
    };
  }
  async options(userId: string, analysisId: string, connectionId: string) {
    const row = await this.analysis(userId, analysisId);
    const { manifestSchema } = await import('../../../../packages/shared/src/repository.js');
    const manifest = manifestSchema.parse(row.manifest);
    const catalog = await this.liara.catalog(
      userId,
      connectionId,
      manifest.analysis?.minRamGb ?? 0.5,
    );
    const connection = (await this.liara.list(userId)).connections.find(
      (c) => c.id === connectionId,
    );
    if (!connection) throw new AppError(404, 'CONNECTION_NOT_FOUND', 'اتصال پیدا نشد.');
    const apps = (await this.liara.applications(userId, connectionId)).applications.filter(
      (a) => !a.providerMissing && a.platform === (manifest.analysis?.platform ?? 'node'),
    );
    return {
      ...catalog,
      connectionId,
      connectionLabel: connection.label,
      applications: apps.map((a) => ({ id: a.id, name: a.name, platform: a.platform })),
    };
  }
  async guidedPlan(
    userId: string,
    input: z.infer<typeof wizardPlanInputSchema>,
    requestId: string,
  ) {
    const row = await this.analysis(userId, input.analysisId);
    const { manifestSchema } = await import('../../../../packages/shared/src/repository.js');
    const repository = manifestSchema.parse(row.manifest);
    if (repository.blockers.length)
      throw new AppError(
        422,
        'PROJECT_NEEDS_REVIEW',
        'موارد مشخص‌شده در بررسی پروژه باید پیش از انتشار رفع شوند.',
      );
    const config = repository.analysis;
    if (!config) throw new AppError(422, 'ANALYSIS_INCOMPLETE', 'تنظیمات تشخیص پروژه کامل نیست.');
    if (input.target === 'existing' && Object.keys(input.environment ?? {}).length)
      throw new AppError(
        400,
        'ENV_UPDATE_UNSUPPORTED',
        'در این مسیر تنظیمات سرویس موجود تغییر نمی‌کند؛ از تنظیمات لیارا استفاده کنید.',
      );
    const deploymentId = randomUUID();
    const secretNames = Object.keys(input.environment ?? {}).sort();
    if (secretNames.length && !this.env?.CREDENTIAL_KEY)
      throw new AppError(503, 'CREDENTIAL_KEY_MISSING', 'کلید رمزگذاری سرور آماده نیست.');
    const sealed = secretNames.length
      ? sealCredential(
          JSON.stringify(input.environment),
          credentialKey(this.env!.CREDENTIAL_KEY!),
          this.env!.CREDENTIAL_KEY_VERSION,
          userId,
          deploymentId,
        )
      : null;
    const connection = await this.db.providerConnection.findFirst({
      where: { id: input.connectionId, userId, status: 'CONNECTED' },
    });
    if (!connection) throw new AppError(404, 'CONNECTION_NOT_FOUND', 'اتصال لیارا فعال نیست.');
    const auth = await this.githubService?.token(userId);
    if (
      repository.private &&
      (!auth || auth.version !== row.githubVersion || auth.connectionId !== row.githubConnectionId)
    )
      throw new AppError(
        409,
        'GITHUB_CONNECTION_CHANGED',
        'اتصال GitHub تغییر کرده؛ پروژه را دوباره بررسی کنید.',
      );
    const platform = config.platform;
    let applicationId: string;
    let applicationName: string;
    let providerId: string;
    let planId: string | null;
    let bundleId: string | undefined;
    let networkId: string | undefined;
    let createNetwork = false;
    let resourceSummary: string;
    let approvedResources:
      | { ramGb: number; cpu: number; diskGb: number; estimatedMonthlyToman: number | null }
      | undefined;
    if (input.target === 'existing') {
      if (!input.applicationId)
        throw new AppError(400, 'TARGET_REQUIRED', 'سرویس مقصد را انتخاب کنید.');
      await this.liara.application(userId, input.applicationId);
      const app = await this.db.application.findFirst({
        where: {
          id: input.applicationId,
          userId,
          connectionId: connection.id,
          platform,
          providerMissing: false,
        },
      });
      if (!app)
        throw new AppError(422, 'TARGET_INCOMPATIBLE', 'این سرویس با نوع پروژه سازگار نیست.');
      applicationId = app.id;
      applicationName = app.name;
      providerId = app.providerId;
      planId = app.planId;
      resourceSummary = 'استفاده از منابع و پلن فعلی سرویس؛ بدون تغییر پلن';
    } else {
      if (!input.name) throw new AppError(400, 'NAME_REQUIRED', 'نام برنامه را انتخاب کنید.');
      const options = await this.options(userId, input.analysisId, input.connectionId);
      const selected = options.plans.find(
        (p) => p.id === input.planId && p.bundleId === input.bundleId,
      );
      if (creationCredit(options.billing, selected?.estimatedMonthlyToman)?.shortfallToman)
        throw new AppError(
          402,
          'CREATION_CREDIT_REQUIRED',
          'برای ساخت سرویس، اعتبار یک هفته همه سرویس‌ها لازم است؛ حساب را شارژ و اطلاعات را تازه کنید.',
        );
      if (options.billing?.hasCredit === false && (selected?.estimatedMonthlyToman ?? 1) > 0)
        throw new AppError(
          402,
          'PAYMENT_REQUIRED',
          'اعتبار حساب لیارا کافی نیست؛ ابتدا حساب را در کنسول رسمی شارژ و اطلاعات را دوباره دریافت کنید.',
        );
      if (!selected)
        throw new AppError(
          409,
          'PLAN_CATALOG_CHANGED',
          'پلن انتخابی در فهرست فعلی حساب موجود نیست.',
        );
      if (options.networks.length && !options.networks.some((n) => n.id === input.networkId))
        throw new AppError(
          400,
          'NETWORK_REQUIRED',
          'شبکه حساب را انتخاب کنید؛ اگر شبکه‌ای ندارید، ابتدا از کنسول لیارا بسازید.',
        );
      applicationId = (await import('node:crypto')).randomUUID();
      applicationName = input.name;
      providerId = 'pending-create';
      approvedResources = {
        ramGb: selected.ramGb,
        cpu: selected.cpu,
        diskGb: selected.diskGb,
        estimatedMonthlyToman: selected.estimatedMonthlyToman,
      };
      planId = selected.id;
      bundleId = selected.bundleId;
      networkId = input.networkId;
      createNetwork = options.networks.length === 0;
      resourceSummary = `${selected.name} · ${selected.bundleName ?? selected.bundleId} · ${selected.ramGb} GB RAM · ${selected.cpu} CPU · ${selected.diskGb} GB disk · ${selected.estimatedMonthlyToman === null ? 'قیمت نامشخص' : selected.estimatedMonthlyToman + ' تومان برآورد ماهانه ۷۲۰ ساعت؛ بدون مالیات و مصرف اضافی'}`;
    }
    const snapshot = deploymentSnapshotSchema.parse({
      policyVersion: 'guided-project-v2',
      ...(sealed ? { secretNames, secretDigest: digest(sealed.ciphertext) } : {}),
      mode: 'LIVE',
      applicationId,
      applicationName,
      connectionId: connection.id,
      credentialVersion: connection.credentialVersion,
      providerId,
      planId,
      repository,
      port: config.port,
      healthPath: config.healthPath,
      expectedText: config.expectedText,
      platform,
      createApplication: input.target === 'new',
      bundleId,
      networkId,
      githubVersion: row.githubVersion,
      githubConnectionId: row.githubConnectionId,
      createNetwork,
      resourceSummary,
      approvedResources,
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });
    const deployment = await this.db.deployment.create({
      data: {
        id: deploymentId,
        ...(sealed ? { secret: { create: sealed } } : {}),
        userId,
        applicationId,
        snapshot: json(snapshot),
        hash: deploymentHash(snapshot),
        expiresAt: new Date(snapshot.expiresAt),
        events: {
          create: {
            sequence: 1,
            message: 'پروژه و نیازهای ساخت تشخیص داده شد؛ طرح برای تأیید شما آماده است.',
          },
        },
      },
    });
    await this.db.auditLog.create({
      data: { userId, resourceId: deployment.id, action: 'deployment.guided.planned', requestId },
    });
    return this.detail(userId, deployment.id);
  }
  private async owned(userId: string, id: string) {
    const record = await this.db.deployment.findFirst({
      where: { id, userId },
      include: { events: { orderBy: { sequence: 'asc' } } },
    });
    if (!record) throw new AppError(404, 'DEPLOYMENT_NOT_FOUND', 'انتشار پیدا نشد.');
    return record;
  }
  private dto(r: Awaited<ReturnType<DeploymentService['owned']>>) {
    return deploymentSchema.parse({
      ...r,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      events: r.events
        .filter((e, i, events) => i === 0 || e.message !== events[i - 1]?.message)
        .map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    });
  }
  async detail(userId: string, id: string) {
    let row = await this.owned(userId, id);
    if (row.state === 'PLANNED' && row.expiresAt <= new Date()) {
      await this.db.deployment.updateMany({
        where: { id, state: 'PLANNED' },
        data: { state: 'EXPIRED' },
      });
      await this.db.deploymentSecret.deleteMany({ where: { deploymentId: id } });
      row = await this.owned(userId, id);
    }
    if (
      ['RUNNING', 'VERIFYING'].includes(row.state) &&
      (row.heartbeatAt ?? row.startedAt) &&
      (row.heartbeatAt ?? row.startedAt)!.getTime() < Date.now() - 120000
    ) {
      await this.db.$transaction([
        this.db.deployment.updateMany({
          where: { id, state: { in: ['RUNNING', 'VERIFYING'] } },
          data: { state: 'NEEDS_ATTENTION', errorCode: 'WORKER_INTERRUPTED' },
        }),
        this.db.deploymentLease.deleteMany({ where: { deploymentId: id } }),
      ]);
      row = await this.owned(userId, id);
    }
    if (
      row.state === 'NEEDS_ATTENTION' &&
      (!row.startedAt || row.startedAt.getTime() < Date.now() - 600000)
    )
      await this.db.deploymentLease.deleteMany({ where: { deploymentId: id } });
    const retry = await this.db.deployment.findUnique({
      where: { retryOf: id },
      select: { id: true },
    });
    return { ...this.dto(row), retryId: retry?.id ?? null };
  }
  async buildLogs(userId: string, id: string, since: string) {
    const row = await this.owned(userId, id);
    if (!row.releaseId) return { state: null, cursor: since, lines: [] };
    const snapshot = deploymentSnapshotSchema.parse(row.snapshot);
    const { client } = await this.liara.deploymentReader(userId, snapshot.connectionId);
    if (!client.getBuildLogs)
      throw new AppError(
        503,
        'BUILD_LOGS_UNAVAILABLE',
        'دریافت لاگ ساخت در این اتصال در دسترس نیست.',
      );
    return client.getBuildLogs(row.releaseId, since);
  }
  async recheck(userId: string, id: string, requestId: string) {
    const row = await this.owned(userId, id),
      s = deploymentSnapshotSchema.parse(row.snapshot);
    const claimed = await this.db.deployment.updateMany({
      where: {
        id,
        userId,
        OR: [{ recheckLeaseUntil: null }, { recheckLeaseUntil: { lt: new Date() } }],
      },
      data: { recheckLeaseUntil: new Date(Date.now() + 90000) },
    });
    if (!claimed.count)
      throw new AppError(409, 'RECHECK_BUSY', 'بررسی همین انتشار در حال انجام است.');
    const result = {
      checkedAt: new Date().toISOString(),
      status: 'UNKNOWN' as z.infer<typeof deploymentRecoverySchema>['status'],
      message: '',
      canRetry: false,
      applicationExists: null as boolean | null,
      releaseState: null as string | null,
    };
    try {
      const { client } = await this.liara.deploymentReader(userId, s.connectionId);
      let app;
      try {
        app = await client.getApplication(s.applicationName);
        result.applicationExists = true;
      } catch (error) {
        if (error instanceof LiaraError && error.code === 'LIARA_NOT_FOUND')
          result.applicationExists = false;
        else throw error;
      }
      if (!app) {
        result.status = 'NOT_STARTED';
        result.canRetry =
          s.createApplication === true &&
          (['DEPLOYMENT_RATE_LIMITED', 'CREATION_CREDIT_REQUIRED'].includes(row.errorCode ?? '') ||
            ![
              'APPLICATION_REQUEST',
              'NETWORK_REQUEST',
              'SOURCE_UPLOAD',
              'RELEASE_REQUEST',
            ].includes(row.phase));
        result.message =
          'در حساب لیارا سرویسی با این نام پیدا نشد. ' +
          (result.canRetry
            ? 'می‌توان طرح تازه‌ای برای ساخت و انتشار آماده کرد.'
            : 'قبل از ایجاد دوباره، مقصد و نتیجه درخواست قبلی را بررسی کنید.');
        if (
          s.createApplication &&
          ['CREATION_CREDIT_REQUIRED', 'DEPLOYMENT_RATE_LIMITED'].includes(row.errorCode ?? '')
        ) {
          const catalog = await this.liara.catalog(
            userId,
            s.connectionId,
            s.repository.analysis?.minRamGb ?? 0.5,
          );
          const selected = catalog.plans.find(
            (p) => p.id === s.planId && p.bundleId === s.bundleId,
          );
          const credit = creationCredit(catalog.billing, selected?.estimatedMonthlyToman);
          if (credit?.shortfallToman) {
            result.canRetry = false;
            result.message = `سرویس هنوز ساخته نشده است. کسری برآوردی اعتبار برای شرط یک هفته لیارا ${credit.shortfallToman.toLocaleString('fa-IR')} تومان است؛ حساب را شارژ و وضعیت را دوباره بررسی کنید. مبلغ نهایی در کنسول لیارا مشخص می‌شود.`;
            await this.db.deployment.update({
              where: { id },
              data: { errorCode: 'CREATION_CREDIT_REQUIRED' },
            });
          }
        }
      } else if (!s.createApplication && app.providerId !== s.providerId) {
        result.message = 'هویت سرویس مقصد تغییر کرده است؛ انتخاب مقصد باید دوباره تأیید شود.';
      } else if (!row.releaseId) {
        const uncertain =
          (row.sourceId !== null && ['RELEASE_REQUEST', 'PLANNED'].includes(row.phase)) ||
          (['APPLICATION_REQUEST', 'SOURCE_UPLOAD', 'RELEASE_REQUEST'].includes(row.phase) &&
            [
              'DEPLOYMENT_OUTCOME_UNKNOWN',
              'DEPLOYMENT_INCOMPLETE',
              'DEPLOYMENT_INTERNAL_ERROR',
            ].includes(row.errorCode ?? ''));
        result.status = uncertain ? 'UNKNOWN' : 'NOT_STARTED';
        result.canRetry = !uncertain;
        result.message = uncertain
          ? 'نتیجه درخواست قبلی مشخص نیست؛ تکرار انتشار تا روشن‌شدن آن مسدود است. وضعیت سرویس را در کنسول لیارا بررسی کنید.'
          : 'سرویس وجود دارد اما این تلاش انتشار ثبت‌شده‌ای ندارد. طرح تلاش مجدد با بازبینی مقصد آماده می‌شود و سرویس تکراری ساخته نمی‌شود.';
      } else {
        let history = await client.getDeployments(s.applicationName, 1, 50);
        let release = history.releases.find((r) => r.id === row.releaseId);
        for (let page = 2; !release && page <= 5 && history.releases.length === 50; page++) {
          const next = await client.getDeployments(s.applicationName, page, 50);
          release = next.releases.find((r) => r.id === row.releaseId);
          if (next.releases.length < 50) break;
        }
        if (!release) {
          result.message =
            'انتشار قبلی در تاریخچه دریافت‌شده پیدا نشد؛ برای جلوگیری از تکرار نامطمئن، وضعیت باید روشن شود.';
        } else if (
          history.currentRelease &&
          history.currentRelease !== row.releaseId &&
          release.state === 'READY'
        ) {
          result.status = 'SUPERSEDED';
          result.canRetry = true;
          result.releaseState = release.state;
          result.message =
            'نسخه جدیدتری روی سرویس فعال است؛ تکرار این طرح به معنی جایگزینی آن نسخه است و تأیید تازه لازم دارد.';
        } else if (release.state === 'READY') {
          result.releaseState = release.state;
          let healthy = true;
          for (let probe = 0; probe < 2; probe++) {
            const h = await this.recoveryHealth(s.applicationName, s.healthPath, s.expectedText);
            if (!h.matched) {
              healthy = false;
              break;
            }
            if (!probe) await new Promise((resolve) => setTimeout(resolve, 1000));
          }
          result.status = healthy ? 'VERIFIED' : 'HEALTH_FAILED';
          result.canRetry = !healthy;
          result.message = healthy
            ? 'همان انتشار آماده است و دو بررسی دسترسی وب موفق بودند؛ انتشار تازه لازم نیست.'
            : 'نسخه آماده شده، اما پاسخ وب هنوز مطابق انتظار نیست. تنظیم اجرا یا خطای برنامه باید بررسی شود.';
          if (healthy && ['NEEDS_ATTENTION', 'FAILED'].includes(row.state))
            await this.db.deployment.updateMany({
              where: { id, userId, state: { in: ['NEEDS_ATTENTION', 'FAILED'] } },
              data: {
                state: 'SUCCEEDED',
                phase: 'COMPLETE',
                errorCode: null,
                completedAt: new Date(),
              },
            });
        } else if (['FAILED', 'ERROR', 'CANCELED', 'CANCELLED'].includes(release.state ?? '')) {
          result.status = 'RELEASE_FAILED';
          result.canRetry = true;
          result.releaseState = release.state;
          result.message =
            'لیارا شکست یا لغو همین انتشار را تأیید کرد. می‌توان تنظیمات را اصلاح و طرح تلاش تازه آماده کرد.';
        } else {
          result.status = 'IN_PROGRESS';
          result.releaseState = release.state;
          result.message =
            'این نسخه هنوز در حال ساخت یا اجراست؛ انتشار تکراری شروع نمی‌کنیم. بررسی مجدد را کمی بعد انجام دهید.';
        }
      }
    } catch (error) {
      result.status = 'UNKNOWN';
      result.canRetry = false;
      result.message =
        error instanceof LiaraError
          ? error.message
          : 'دریافت نتیجه واقعی یا بررسی وب فعلاً ممکن نشد؛ بدون اعلام موفقیت می‌توانید بررسی را دوباره انجام دهید.';
    }
    try {
      await this.db.deployment.update({ where: { id }, data: { recovery: json(result) } });
      const previous = row.recovery as { status?: string; releaseState?: string | null } | null;
      if (previous?.status !== result.status || previous?.releaseState !== result.releaseState)
        await deploymentEvent(this.db, id, result.message);
      await this.db.auditLog.create({
        data: { userId, action: 'deployment.rechecked', resourceId: id, requestId },
      });
      return await this.detail(userId, id);
    } finally {
      await this.db.deployment.update({ where: { id }, data: { recheckLeaseUntil: null } });
    }
  }
  async retryPlan(userId: string, id: string, hash: string, requestId: string) {
    const row = await this.owned(userId, id);
    if (row.hash !== hash) throw new AppError(409, 'PLAN_CHANGED', 'طرح تغییر کرده است.');
    const existing = await this.db.deployment.findUnique({ where: { retryOf: id } });
    if (existing) return this.detail(userId, existing.id);
    if (!['NEEDS_ATTENTION', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(row.state))
      throw new AppError(
        409,
        'RETRY_NOT_AVAILABLE',
        'این انتشار قابل تکرار نیست؛ ابتدا نتیجه واقعی را بررسی کنید.',
      );
    const checked = await this.recheck(userId, id, requestId);
    if (!checked.recovery?.canRetry)
      throw new AppError(
        409,
        'RECHECK_REQUIRED',
        checked.recovery?.message ?? 'ابتدا وضعیت واقعی را بررسی کنید.',
      );
    const old = deploymentSnapshotSchema.parse(row.snapshot);
    const client = await this.repositoryClient(userId);
    const repository = await client.refreshManifest(manifestSchema.parse(old.repository));
    if (repository.blockers.length)
      throw new AppError(
        422,
        'RETRY_SETTINGS_REQUIRED',
        'نوع یا تنظیمات پروژه به بازبینی نیاز دارد؛ مسیر اصلاح تنظیمات را باز کنید.',
      );
    const access = await this.liara.deploymentReader(userId, old.connectionId);
    let target;
    try {
      target = await access.client.getApplication(old.applicationName);
    } catch (error) {
      if (!(error instanceof LiaraError && error.code === 'LIARA_NOT_FOUND')) throw error;
    }
    if (target && target.platform !== repository.analysis?.platform)
      throw new AppError(
        409,
        'RETRY_SETTINGS_REQUIRED',
        'پلتفرم تشخیص‌داده‌شده با سرویس موجود سازگار نیست؛ مقصد تازه انتخاب کنید.',
      );
    if (!target && repository.analysis.environmentNames.length)
      throw new AppError(
        422,
        'RETRY_SETTINGS_REQUIRED',
        'تنظیمات امن پروژه باید دوباره در فرم اختصاصی وارد شوند.',
      );
    const auth = await this.githubService?.token(userId);
    const analysis = await this.db.repositoryAnalysis.create({
      data: {
        userId,
        repositoryUrl: `https://github.com/${repository.owner}/${repository.repo}`,
        branch: repository.commit,
        manifest: json(repository),
        githubVersion: repository.private ? auth?.version : null,
        githubConnectionId: repository.private ? auth?.connectionId : null,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    let applicationId: string | undefined;
    if (target) {
      const synced = await this.db.application.upsert({
        where: {
          connectionId_providerId: {
            connectionId: old.connectionId,
            providerId: target.providerId,
          },
        },
        create: {
          userId,
          connectionId: old.connectionId,
          providerId: target.providerId,
          name: target.name,
          platform: target.platform,
          planId: target.planId,
          mode: 'LIVE',
        },
        update: { providerMissing: false, platform: target.platform, planId: target.planId },
      });
      applicationId = synced.id;
    }
    const options = target ? null : await this.options(userId, analysis.id, old.connectionId);
    const retryResource =
      options?.plans.find((p) => p.id === old.planId && p.bundleId === old.bundleId) ??
      options?.plans.find((p) => p.id === old.planId && p.bundleId === 'standard') ??
      options?.plans.find((p) => p.recommended && p.bundleId === 'standard') ??
      options?.plans.find((p) => p.recommended) ??
      options?.plans[0];
    const plan = await this.guidedPlan(
      userId,
      {
        analysisId: analysis.id,
        connectionId: old.connectionId,
        target: target ? 'existing' : 'new',
        ...(target
          ? { applicationId }
          : {
              name: old.applicationName,
              planId: retryResource?.id,
              bundleId: retryResource?.bundleId,
              networkId:
                options?.networks.find((n) => n.id === old.networkId)?.id ??
                options?.networks[0]?.id,
            }),
      },
      requestId,
    );
    try {
      await this.db.deployment.update({ where: { id: plan.id }, data: { retryOf: id } });
    } catch (error) {
      await this.db.deployment.update({ where: { id: plan.id }, data: { state: 'CANCELLED' } });
      const winner = await this.db.deployment.findUnique({ where: { retryOf: id } });
      if (winner) return this.detail(userId, winner.id);
      throw error;
    }
    await deploymentEvent(
      this.db,
      plan.id,
      'طرح تلاش دوباره پس از بررسی وضعیت واقعی و تحلیل مجدد همان commit آماده شد؛ تأیید تازه شما لازم است.',
    );
    return this.detail(userId, plan.id);
  }
  async list(userId: string) {
    const rows = await this.db.deployment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { events: { orderBy: { sequence: 'asc' } } },
    });
    return { deployments: rows.map((r) => this.dto(r)) };
  }
  async create(userId: string, input: z.infer<typeof deploymentInputSchema>, requestId: string) {
    await this.liara.application(userId, input.applicationId);
    const app = await this.db.application.findFirstOrThrow({
      where: { id: input.applicationId, userId },
      include: { connection: true },
    });
    if (app.platform !== 'node')
      throw new AppError(
        422,
        'PLATFORM_UNSUPPORTED',
        'مقصد این مسیر باید سرویس Node.js موجود باشد.',
      );
    const repository = await (
      await this.repositoryClient(userId)
    ).analyze(input.repositoryUrl, input.ref);
    const snapshot = deploymentSnapshotSchema.parse({
      policyVersion: 'existing-node-v1',
      mode: 'LIVE',
      applicationId: app.id,
      applicationName: app.name,
      connectionId: app.connectionId,
      credentialVersion: app.connection.credentialVersion,
      providerId: app.providerId,
      planId: app.planId,
      repository,
      port: input.port,
      healthPath: input.healthPath,
      expectedText: input.expectedText,
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });
    const record = await this.db.$transaction(async (tx) => {
      const row = await tx.deployment.create({
        data: {
          userId,
          applicationId: app.id,
          snapshot: json(snapshot),
          hash: deploymentHash(snapshot),
          expiresAt: new Date(snapshot.expiresAt),
          events: {
            create: {
              sequence: 1,
              message: repository.blockers.length
                ? 'تحلیل مخزن ثبت شد؛ پیش از انتشار باید موارد ناقص برطرف شوند.'
                : 'طرح commit ثابت آماده است؛ هنوز هیچ انتشار یا بارگذاری انجام نشده است.',
            },
          },
        },
      });
      await tx.auditLog.create({
        data: { userId, resourceId: row.id, action: 'deployment.planned', requestId },
      });
      return row;
    });
    return this.detail(userId, record.id);
  }
  private async optionsForApproval(userId: string, s: z.infer<typeof deploymentSnapshotSchema>) {
    const catalog = await this.liara.catalog(
      userId,
      s.connectionId,
      s.repository.analysis?.minRamGb ?? 0.5,
    );
    const selected = catalog.plans.find((p) => p.id === s.planId && p.bundleId === s.bundleId);
    if (creationCredit(catalog.billing, selected?.estimatedMonthlyToman)?.shortfallToman)
      throw new AppError(
        402,
        'CREATION_CREDIT_REQUIRED',
        'اعتبار لازم برای ساخت سرویس کافی نیست؛ حساب را شارژ و دوباره بررسی کنید.',
      );
    if (catalog.billing?.hasCredit === false && (selected?.estimatedMonthlyToman ?? 1) > 0)
      throw new AppError(
        402,
        'PAYMENT_REQUIRED',
        'اعتبار حساب کافی نیست؛ حساب را در لیارا شارژ و دوباره بررسی کنید.',
      );
    if (
      s.approvedResources &&
      selected &&
      Object.entries(s.approvedResources).some(
        ([key, value]) => selected[key as keyof typeof s.approvedResources] !== value,
      )
    )
      throw new AppError(
        409,
        'CATALOG_CHANGED',
        'مشخصات یا قیمت پلن تغییر کرده است؛ طرح تازه لازم است.',
      );
    if (
      !catalog.plans.some((p) => p.id === s.planId && p.bundleId === s.bundleId) ||
      !(s.createNetwork
        ? catalog.networks.length === 0
        : catalog.networks.some((n) => n.id === s.networkId))
    )
      throw new AppError(409, 'CATALOG_CHANGED', 'پلن یا شبکه تغییر کرده است؛ طرح تازه لازم است.');
  }
  async decide(
    userId: string,
    id: string,
    input: { hash: string; decision: 'approve' | 'cancel' },
    requestId: string,
  ) {
    const row = await this.owned(userId, id);
    const s = deploymentSnapshotSchema.parse(row.snapshot);
    if (row.hash !== input.hash || deploymentHash(s) !== row.hash)
      throw new AppError(409, 'PLAN_CHANGED', 'طرح تغییر کرده است؛ طرح تازه بسازید.');
    if (row.state !== 'PLANNED' || row.expiresAt <= new Date())
      throw new AppError(409, 'APPROVAL_INVALID', 'این طرح دیگر قابل تأیید یا تکرار نیست.');
    if (input.decision === 'approve') {
      if (s.repository.private) {
        const github = await this.githubService?.token(userId);
        if (
          !github ||
          github.version !== s.githubVersion ||
          github.connectionId !== s.githubConnectionId
        )
          throw new AppError(
            409,
            'GITHUB_CONNECTION_CHANGED',
            'اتصال GitHub تغییر کرده است؛ دوباره پروژه را بررسی کنید.',
          );
      }
      if (s.repository.blockers.length)
        throw new AppError(
          422,
          'REPOSITORY_BLOCKED',
          'موارد ناقص تحلیل باید پیش از انتشار برطرف شوند.',
        );
      if (s.createApplication) {
        const connection = await this.db.providerConnection.findFirst({
          where: {
            id: s.connectionId,
            userId,
            status: 'CONNECTED',
            credentialVersion: s.credentialVersion,
          },
        });
        if (!connection) throw new AppError(409, 'CONNECTION_CHANGED', 'اتصال تغییر کرده است.');
        await this.optionsForApproval(userId, s);
      } else {
        const app = await this.db.application.findFirst({
          where: {
            id: s.applicationId,
            userId,
            providerMissing: false,
            connection: {
              id: s.connectionId,
              status: 'CONNECTED',
              credentialVersion: s.credentialVersion,
            },
          },
        });
        if (
          !app ||
          app.name !== s.applicationName ||
          app.providerId !== s.providerId ||
          app.planId !== s.planId
        )
          throw new AppError(
            409,
            'CONNECTION_CHANGED',
            'مقصد یا اتصال تغییر کرده است. طرح تازه بسازید.',
          );
      }
    }
    try {
      await this.db.$transaction(async (tx) => {
        const changed = await tx.deployment.updateMany({
          where: { id, userId, state: 'PLANNED', hash: input.hash, expiresAt: { gt: new Date() } },
          data: { state: input.decision === 'approve' ? 'QUEUED' : 'CANCELLED' },
        });
        if (!changed.count)
          throw new AppError(409, 'APPROVAL_ALREADY_USED', 'طرح قبلاً مصرف شده است.');
        if (input.decision === 'cancel')
          await tx.deploymentSecret.deleteMany({ where: { deploymentId: id } });
        if (input.decision === 'approve') {
          await tx.deploymentLease.create({
            data: { applicationId: s.applicationId, deploymentId: id },
          });
          await tx.deploymentOutbox.create({ data: { deploymentId: id } });
        }
        await tx.auditLog.create({
          data: { userId, resourceId: id, action: `deployment.${input.decision}`, requestId },
        });
      });
    } catch (e) {
      if (e instanceof PrismaRuntime.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new AppError(409, 'APPLICATION_BUSY', 'یک انتشار دیگر برای این سرویس ثبت شده است.');
      throw e;
    }
    return this.detail(userId, id);
  }
}
