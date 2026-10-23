import { creationCredit } from './billing.js';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import tar from 'tar-stream';
import type { Database } from '../../database/src/index.js';
import type { Env } from '../../shared/src/env.js';
import { credentialKey, openCredential } from '../../security/src/credentials.js';
import { digest } from '../../security/src/auth.js';
import {
  GithubRepository,
  RepositoryError,
  safeRepositoryPath,
} from '../../github-adapter/src/index.js';
import { deploymentSnapshotSchema, type DeploymentSnapshot } from './contracts.js';
import { DeploymentError, LiaraDeploymentProvider, type DeploymentProvider } from './provider.js';
import { liaraCatalog } from './catalog.js';
import { LiaraError } from '../../liara-adapter/src/errors.js';
import { CredentialError } from '../../security/src/credentials.js';
import { z } from 'zod';
import { verifyHttp } from './health.js';
export const deploymentHash = (snapshot: DeploymentSnapshot) =>
  digest(JSON.stringify(deploymentSnapshotSchema.parse(snapshot)));
export async function deploymentEvent(db: Database, id: string, message: string) {
  await db.$transaction(async (tx) => {
    const d = await tx.deployment.update({ where: { id }, data: { sequence: { increment: 1 } } });
    await tx.deploymentEvent.create({ data: { deploymentId: id, sequence: d.sequence, message } });
  });
}
export async function sourceArchive(files: { path: string; data: Buffer }[]) {
  if (
    files.reduce((n, f) => n + f.data.length, 0) > 128 * 1024 * 1024 ||
    files.some((f) => !safeRepositoryPath(f.path))
  )
    throw new DeploymentError('UNSAFE_SOURCE_ARCHIVE');
  const pack = tar.pack();
  const chunks: Buffer[] = [];
  let total = 0;
  const output = new Writable({
    write(chunk: Buffer, _enc, cb) {
      total += chunk.length;
      if (total > 128 * 1024 * 1024) cb(new DeploymentError('ARCHIVE_TOO_LARGE'));
      else {
        chunks.push(chunk);
        cb();
      }
    },
  });
  const finished = pipeline(pack, createGzip(), output);
  for (const f of files)
    pack.entry(
      {
        name: f.path,
        type: 'file',
        mode: 0o644,
        size: f.data.length,
        mtime: new Date(0),
        uid: 0,
        gid: 0,
      },
      f.data,
    );
  pack.finalize();
  await finished;
  return Buffer.concat(chunks);
}
export type RunnerDependencies = {
  github?: GithubRepository;
  provider?: (token: string, team: string) => DeploymentProvider;
  health?: typeof verifyHttp;
  wait?: (ms: number) => Promise<void>;
};
export async function runDeployment(
  db: Database,
  env: Env,
  id: string,
  deps: RunnerDependencies = {},
) {
  const record = await db.deployment.findUnique({ where: { id } });
  if (!record) return;
  const claimed = await db.deployment.updateMany({
    where: { id, state: 'QUEUED' },
    data: { state: 'RUNNING', phase: 'VALIDATION', startedAt: new Date(), heartbeatAt: new Date() },
  });
  if (!claimed.count) return;
  let phase = 'VALIDATION';
  const stage = async (value: string) => {
    phase = value;
    await db.deployment.update({ where: { id }, data: { phase: value, heartbeatAt: new Date() } });
  };
  try {
    const snapshot = deploymentSnapshotSchema.parse(record.snapshot);
    if (deploymentHash(snapshot) !== record.hash || record.expiresAt <= new Date())
      throw new DeploymentError('APPROVAL_INVALID');
    let createdProviderId: string | null = null;
    const current = async () => {
      const active = await db.deployment.count({
        where: { id, state: { in: ['RUNNING', 'VERIFYING'] }, lease: { isNot: null } },
      });
      if (!active) throw new DeploymentError('DEPLOYMENT_INTERRUPTED');
      await db.deployment.update({ where: { id }, data: { heartbeatAt: new Date() } });
      const connection = await db.providerConnection.findFirst({
        where: {
          id: snapshot.connectionId,
          userId: record.userId,
          status: 'CONNECTED',
          credentialVersion: snapshot.credentialVersion,
        },
        include: { credential: true },
      });
      if (!connection?.credential) throw new DeploymentError('CONNECTION_CHANGED');
      if (snapshot.repository.private) {
        const gh = await db.githubConnection.findUnique({ where: { userId: record.userId } });
        if (!gh || gh.version !== snapshot.githubVersion || gh.id !== snapshot.githubConnectionId)
          throw new DeploymentError('GITHUB_CONNECTION_CHANGED');
      }
      if (!snapshot.createApplication) {
        const app = await db.application.findFirst({
          where: { id: snapshot.applicationId, userId: record.userId, providerMissing: false },
        });
        if (!app || app.name !== snapshot.applicationName || app.providerId !== snapshot.providerId)
          throw new DeploymentError('TARGET_CHANGED');
      }
      return connection;
    };
    const connection = await current();
    if (!env.CREDENTIAL_KEY) throw new DeploymentError('CREDENTIAL_KEY_MISSING');
    const token = openCredential(
      connection.credential!,
      credentialKey(env.CREDENTIAL_KEY),
      env.CREDENTIAL_KEY_VERSION,
      record.userId,
      snapshot.connectionId,
    );
    const provider =
      deps.provider?.(token, connection.teamRef) ??
      new LiaraDeploymentProvider(token, connection.teamRef);
    if (!snapshot.createApplication) {
      const fresh = await provider.application(snapshot.applicationName);
      if (fresh.providerId !== snapshot.providerId || fresh.planId !== snapshot.planId)
        throw new DeploymentError('TARGET_CHANGED');
    }
    await stage('SOURCE_FETCH');
    await deploymentEvent(db, id, 'commit تأییدشده و مالکیت مقصد بررسی شدند؛ دریافت سورس آغاز شد.');
    let githubToken: string | undefined;
    if (snapshot.repository.private) {
      const gh = await db.githubConnection.findUniqueOrThrow({ where: { userId: record.userId } });
      githubToken = openCredential(
        gh,
        credentialKey(env.CREDENTIAL_KEY!),
        env.CREDENTIAL_KEY_VERSION,
        record.userId,
        gh.id,
      );
    }
    const github = deps.github ?? new GithubRepository(fetch, githubToken);
    const config = snapshot.repository.analysis;
    const sourceManifest = {
      ...snapshot.repository,
      files: snapshot.repository.files.filter(
        (f) => !config?.root || f.path.startsWith(config.root),
      ),
    };
    if (sourceManifest.files.reduce((sum, f) => sum + f.size, 0) > 128 * 1024 * 1024)
      throw new DeploymentError('SOURCE_TRANSFER_CAPACITY');
    const files = await github.files(sourceManifest, async (message) => {
      await current();
      await deploymentEvent(db, id, message);
    });
    await stage('SOURCE_PREPARE');
    let prepared = files;
    if (config?.root) {
      prepared = prepared
        .filter((f) => f.path.startsWith(config.root))
        .map((f) => ({ ...f, path: f.path.slice(config.root.length) }));
    }
    if (snapshot.policyVersion === 'guided-project-v2' && config) {
      if (['node', 'next'].includes(snapshot.platform ?? 'node')) {
        const pkg = prepared.find((f) => f.path === 'package.json');
        if (pkg && snapshot.repository.start) {
          const parsed = JSON.parse(pkg.data.toString());
          if (
            !parsed.scripts?.start ||
            snapshot.repository.evidence.some(
              (e) =>
                e.finding.includes('با انتخاب شما، اجرا') ||
                e.finding.includes('فرمان اجرای صریح') ||
                e.path === 'تنظیمات انتخابی کاربر',
            )
          ) {
            parsed.scripts = { ...parsed.scripts, start: snapshot.repository.start };
            pkg.data = Buffer.from(JSON.stringify(parsed, null, 2));
          }
        }
      }
      const pkg = prepared.find((f) => f.path === 'package.json');
      if (pkg && config.build) {
        const parsed = JSON.parse(pkg.data.toString());
        parsed.scripts = {
          ...parsed.scripts,
          build: config.build,
          ...(snapshot.repository.framework === 'laravel' ? { production: config.build } : {}),
        };
        pkg.data = Buffer.from(JSON.stringify(parsed, null, 2));
      }
      const liaraConfig = { port: snapshot.port };
      if (!prepared.some((f) => f.path === 'liara.json'))
        prepared.push({ path: 'liara.json', data: Buffer.from(JSON.stringify(liaraConfig)) });
    }
    const archive = await sourceArchive(prepared);
    if (snapshot.createApplication) {
      if (
        !provider.create ||
        !snapshot.planId ||
        !snapshot.bundleId ||
        (!snapshot.networkId && !snapshot.createNetwork)
      )
        throw new DeploymentError('CREATE_CONFIGURATION_MISSING');
      if (!deps.provider) {
        const catalog = await liaraCatalog(token, connection.teamRef, config?.minRamGb ?? 0.5);
        const selected = catalog.plans.find(
          (p) => p.id === snapshot.planId && p.bundleId === snapshot.bundleId,
        );
        if (creationCredit(catalog.billing, selected?.estimatedMonthlyToman)?.shortfallToman)
          throw new DeploymentError('CREATION_CREDIT_REQUIRED');
        if (catalog.billing.hasCredit === false && (selected?.estimatedMonthlyToman ?? 1) > 0)
          throw new DeploymentError('PAYMENT_REQUIRED');
        if (
          snapshot.approvedResources &&
          selected &&
          Object.entries(snapshot.approvedResources).some(
            ([key, value]) => selected[key as keyof typeof snapshot.approvedResources] !== value,
          )
        )
          throw new DeploymentError('CATALOG_CHANGED');
        if (
          !catalog.plans.some(
            (p) => p.id === snapshot.planId && p.bundleId === snapshot.bundleId,
          ) ||
          !(snapshot.createNetwork
            ? catalog.networks.length === 0
            : catalog.networks.some((n) => n.id === snapshot.networkId))
        )
          throw new DeploymentError('CATALOG_CHANGED');
      }
      let networkId = snapshot.networkId;
      if (snapshot.createNetwork) {
        if (!provider.network) throw new DeploymentError('NETWORK_CREATE_UNSUPPORTED');
        await current();
        await stage('NETWORK_REQUEST');
        networkId = await provider.network(snapshot.applicationName);
        await deploymentEvent(db, id, 'شبکه خصوصی تأییدشده ساخته شد.');
      }
      await current();
      await deploymentEvent(db, id, 'ساخت سرویس با پلن و هزینه تأییدشده آغاز شد.');
      await stage('APPLICATION_REQUEST');
      await provider.create({
        name: snapshot.applicationName,
        platform: snapshot.platform ?? 'node',
        planId: snapshot.planId,
        bundleId: snapshot.bundleId,
        networkId: networkId!,
      });
      await stage('APPLICATION_VERIFY');
      const created = await provider.application(snapshot.applicationName);
      createdProviderId = created.providerId;
      await db.application.upsert({
        where: {
          connectionId_providerId: { connectionId: connection.id, providerId: created.providerId },
        },
        create: {
          id: snapshot.applicationId,
          userId: record.userId,
          connectionId: connection.id,
          mode: 'LIVE',
          providerId: created.providerId,
          name: snapshot.applicationName,
          platform: snapshot.platform,
          planId: snapshot.planId,
        },
        update: { providerMissing: false },
      });
      await deploymentEvent(
        db,
        id,
        'سرویس ساخته شد؛ در صورت شکست انتشار، سرویس خودکار حذف نمی‌شود.',
      );
    }
    if (createdProviderId) await current();
    if (snapshot.secretDigest) {
      const secret = await db.deploymentSecret.findUnique({ where: { deploymentId: id } });
      if (
        !secret ||
        digest(secret.ciphertext) !== snapshot.secretDigest ||
        !provider.environment ||
        !snapshot.createApplication
      )
        throw new DeploymentError('SECRET_VERSION_CHANGED');
      const values = JSON.parse(
        openCredential(
          secret,
          credentialKey(env.CREDENTIAL_KEY!),
          env.CREDENTIAL_KEY_VERSION,
          record.userId,
          id,
        ),
      ) as Record<string, string>;
      await current();
      await stage('ENVIRONMENT_REQUEST');
      await provider.environment(
        snapshot.applicationName,
        Object.entries(values).map(([key, value]) => ({ key, value })),
      );
      await deploymentEvent(
        db,
        id,
        'تنظیمات محرمانه تأییدشده روی سرویس جدید اعمال شدند؛ مقادیر در رویدادها نمایش داده نمی‌شوند.',
      );
    }
    await current();
    await deploymentEvent(
      db,
      id,
      'بسته سورس همان commit ساخته شد؛ هیچ کد مخزن روی این سرور اجرا نشد.',
    );
    await stage('SOURCE_UPLOAD');
    const sourceId = await provider.upload(snapshot.applicationName, archive);
    await db.deployment.update({ where: { id }, data: { sourceId } });
    await deploymentEvent(db, id, 'بارگذاری سورس پذیرفته شد؛ هنوز انتشار موفق اعلام نمی‌شود.');
    await current();
    await stage('RELEASE_REQUEST');
    const releaseId = await provider.release(
      snapshot.applicationName,
      sourceId,
      snapshot.port,
      snapshot.platform ?? 'node',
      snapshot.repository.analysis?.outputDir,
      ['python', 'fastapi', 'flask', 'django'].includes(snapshot.repository.framework) &&
        snapshot.repository.start
        ? [snapshot.repository.start]
        : undefined,
      config?.platformConfig,
    );
    await db.deployment.update({ where: { id }, data: { releaseId, state: 'VERIFYING' } });
    await deploymentEvent(db, id, 'شناسه انتشار دریافت شد؛ وضعیت همان انتشار بررسی می‌شود.');
    await stage('RELEASE_POLL');
    let ready = false;
    let previousReleaseState: string | null = null;
    for (let attempt = 0; attempt < 400; attempt++) {
      await current();
      const release = (await provider.releases(snapshot.applicationName)).find(
        (r) => r.id === releaseId,
      );
      if (release?.state && release.state !== previousReleaseState) {
        previousReleaseState = release.state;
        await deploymentEvent(db, id, 'وضعیت ساخت در لیارا: ' + release.state);
      }
      if (release?.state === 'READY') {
        ready = true;
        break;
      }
      if (release && ['FAILED', 'CANCELED', 'CANCELLED', 'ERROR'].includes(release.state ?? ''))
        throw new DeploymentError('RELEASE_FAILED');
      await (deps.wait ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(3000);
    }
    if (!ready) throw new DeploymentError('RELEASE_VERIFICATION_INCOMPLETE');
    await deploymentEvent(db, id, 'انتشار READY شد؛ پاسخ HTTP و نشانگر مورد انتظار بررسی می‌شوند.');
    await stage('HTTP_CHECK');
    let consecutive = 0;
    for (let probe = 0; probe < 8 && consecutive < 2; probe++) {
      await current();
      try {
        const health = await (deps.health ?? verifyHttp)(
          snapshot.applicationName,
          snapshot.healthPath,
          snapshot.expectedText,
        );
        consecutive = health.matched ? consecutive + 1 : 0;
      } catch (error) {
        if (
          error instanceof DeploymentError &&
          ['HEALTH_TARGET_REJECTED', 'HEALTH_ADDRESS_REJECTED'].includes(error.code)
        )
          throw error;
        consecutive = 0;
      }
      if (consecutive < 2) {
        if (!consecutive)
          await deploymentEvent(
            db,
            id,
            'سرویس هنوز پاسخ مورد انتظار را نداده است؛ بررسی دسترسی وب دوباره انجام می‌شود.',
          );
        await (deps.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(
          Math.min(1000 * (probe + 1), 5000),
        );
      }
    }
    if (consecutive < 2) throw new DeploymentError('HEALTH_CHECK_FAILED');
    await db.deployment.update({
      where: { id },
      data: {
        state: 'SUCCEEDED',
        phase: 'COMPLETE',
        heartbeatAt: new Date(),
        errorCode: null,
        completedAt: new Date(),
      },
    });
    await deploymentEvent(
      db,
      id,
      snapshot.expectedText
        ? 'انتشار و دو بررسی HTTP با نشانگر مورد انتظار موفق بودند.'
        : 'نسخه آماده شد و دو پاسخ HTTP موفق و غیرخالی دریافت شد؛ صحت همه قابلیت‌های برنامه هنوز نیازمند بررسی شماست.',
    );
  } catch (error) {
    const code =
      error instanceof DeploymentError ||
      error instanceof RepositoryError ||
      error instanceof LiaraError
        ? error.code
        : error instanceof CredentialError
          ? 'CREDENTIAL_UNAVAILABLE'
          : error instanceof z.ZodError
            ? 'UPSTREAM_RESPONSE_INVALID'
            : phase === 'HTTP_CHECK'
              ? 'HEALTH_UNAVAILABLE'
              : 'DEPLOYMENT_INTERNAL_ERROR';
    await db.deployment.update({
      where: { id },
      data: { state: 'NEEDS_ATTENTION', errorCode: code, completedAt: new Date() },
    });
    await deploymentEvent(
      db,
      id,
      `عملیات در مرحله ${phase} متوقف شد (${code}). بررسی مجدد، وضعیت واقعی سرویس را بدون ساخت مجدد می‌خواند.`,
    );
  } finally {
    await db.deploymentLease.deleteMany({ where: { deploymentId: id } });
    await db.deploymentSecret.deleteMany({ where: { deploymentId: id } });
  }
}
