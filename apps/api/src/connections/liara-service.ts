import { randomUUID } from 'node:crypto';
import type { Database } from '../../../../packages/database/src/index.js';
import type { Prisma } from '../../../../packages/database/src/generated/client.js';
import type { Env } from '../../../../packages/shared/src/env.js';
import {
  credentialKey,
  openCredential,
  sealCredential,
} from '../../../../packages/security/src/credentials.js';
import { redactSecrets } from '../../../../packages/security/src/redact.js';
import {
  LiaraClient,
  type CloudProvider,
  type ProviderApplication,
} from '../../../../packages/liara-adapter/src/client.js';
import type { CloudApplication, CloudConnection } from '../../../../packages/shared/src/cloud.js';
import { AppError } from '../errors.js';
import { LiaraError } from '../../../../packages/liara-adapter/src/errors.js';
import { liaraCatalog } from '../../../../packages/deployment/src/catalog.js';
type Factory = (token: string, teamId: string) => CloudProvider;
type ConnectionRecord = Prisma.ProviderConnectionGetPayload<{
  include: { _count: { select: { applications: true } } };
}>;
type ApplicationRecord = Prisma.ApplicationGetPayload<{ include: { connection: true } }>;
export class LiaraService {
  private key: Buffer | null;
  constructor(
    private db: Database,
    private env: Env,
    private factory: Factory = (token, teamId) =>
      new LiaraClient(token, teamId, { timeoutMs: env.LIARA_TIMEOUT_MS }),
  ) {
    this.key = env.CREDENTIAL_KEY ? credentialKey(env.CREDENTIAL_KEY) : null;
  }
  private requireKey() {
    if (!this.key)
      throw new AppError(
        503,
        'CREDENTIAL_KEY_MISSING',
        'کلید رمزگذاری سرور تنظیم نشده است. مدیر برنامه باید ابتدا آن را پیکربندی کند.',
      );
    return this.key;
  }
  private connectionDto(record: ConnectionRecord): CloudConnection {
    return {
      id: record.id,
      label: record.label,
      provider: 'LIARA',
      mode: 'LIVE',
      status: record.status === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED',
      teamId: record.teamRef || null,
      validatedAt: record.validatedAt?.toISOString() ?? null,
      syncedAt: record.syncedAt?.toISOString() ?? null,
      lastErrorCode: record.lastErrorCode,
      createdAt: record.createdAt.toISOString(),
      applicationCount: record.status === 'CONNECTED' ? record._count.applications : 0,
    };
  }
  private appDto(record: ApplicationRecord): CloudApplication {
    return {
      id: record.id,
      connectionId: record.connectionId,
      mode: 'LIVE',
      providerId: record.providerId,
      name: record.name,
      platform: record.platform,
      status: record.status,
      scale: record.scale,
      isDeployed: record.isDeployed,
      planId: record.planId,
      lastSeenAt: record.lastSeenAt.toISOString(),
      providerMissing: record.providerMissing,
      connectionLabel: record.connection.label,
    };
  }
  async list(userId: string) {
    const connections = await this.db.providerConnection.findMany({
      where: { userId, provider: 'LIARA' },
      include: { _count: { select: { applications: { where: { providerMissing: false } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      configured: !!this.key,
      connections: connections.map((record) => this.connectionDto(record)),
    };
  }
  private async persistApps(
    tx: Prisma.TransactionClient,
    connectionId: string,
    userId: string,
    applications: ProviderApplication[],
    now: Date,
  ) {
    await tx.application.updateMany({
      where: { connectionId, userId },
      data: { providerMissing: true },
    });
    for (const application of applications) {
      const data = {
        name: application.name,
        platform: application.platform,
        status: application.status,
        scale: application.scale,
        isDeployed: application.isDeployed,
        planId: application.planId,
        lastSeenAt: now,
        providerMissing: false,
      };
      await tx.application.upsert({
        where: { connectionId_providerId: { connectionId, providerId: application.providerId } },
        create: { ...data, userId, connectionId, mode: 'LIVE', providerId: application.providerId },
        update: data,
      });
    }
  }
  async connect(
    userId: string,
    input: { label: string; token: string; teamId?: string },
    requestId: string,
  ) {
    const key = this.requireKey();
    const teamRef = input.teamId ?? '';
    const apps = await this.factory(input.token, teamRef).listApplications();
    const now = new Date();
    const connectionId = await this.db.$transaction(
      async (tx) => {
        const existing = await tx.providerConnection.findUnique({
          where: { userId_provider_teamRef: { userId, provider: 'LIARA', teamRef } },
        });
        const id = existing?.id ?? randomUUID();
        const values = {
          label: redactSecrets(input.label, [input.token]),
          status: 'CONNECTED',
          validatedAt: now,
          syncedAt: now,
          disconnectedAt: null,
          lastErrorCode: null,
        };
        if (existing)
          await tx.providerConnection.update({
            where: { id },
            data: { ...values, credentialVersion: { increment: 1 } },
          });
        else
          await tx.providerConnection.create({
            data: { ...values, id, userId, teamRef, provider: 'LIARA', mode: 'LIVE' },
          });
        const sealed = sealCredential(
          input.token,
          key,
          this.env.CREDENTIAL_KEY_VERSION,
          userId,
          id,
        );
        await tx.credential.upsert({
          where: { connectionId: id },
          create: { connectionId: id, ...sealed },
          update: sealed,
        });
        await this.persistApps(tx, id, userId, apps, now);
        await tx.auditLog.create({
          data: { userId, action: 'liara.connection.validated', resourceId: id, requestId },
        });
        return id;
      },
      { timeout: 20000 },
    );
    return (await this.list(userId)).connections.find(
      (connection) => connection.id === connectionId,
    )!;
  }
  private async access(userId: string, connectionId: string) {
    const connection = await this.db.providerConnection.findFirst({
      where: { id: connectionId, userId, provider: 'LIARA', mode: 'LIVE', status: 'CONNECTED' },
      include: { credential: true },
    });
    if (!connection || !connection.credential)
      throw new AppError(404, 'CONNECTION_NOT_FOUND', 'اتصال فعال پیدا نشد.');
    const token = openCredential(
      connection.credential,
      this.requireKey(),
      this.env.CREDENTIAL_KEY_VERSION,
      userId,
      connection.id,
    );
    return { connection, client: this.factory(token, connection.teamRef) };
  }
  async deploymentReader(userId: string, connectionId: string) {
    return this.access(userId, connectionId);
  }
  async catalog(
    userId: string,
    connectionId: string,
    minimumRam: number,
  ): Promise<
    Omit<Awaited<ReturnType<typeof liaraCatalog>>, 'billing'> & {
      billing: {
        hasCredit: boolean | null;
        paymentUrl: 'https://console.liara.ir/credit';
        balanceToman?: number | null;
        currentMonthlyToman?: number | null;
      };
    }
  > {
    const { connection } = await this.access(userId, connectionId);
    const credential = await this.db.credential.findUniqueOrThrow({ where: { connectionId } });
    const token = openCredential(
      credential,
      this.requireKey(),
      this.env.CREDENTIAL_KEY_VERSION,
      userId,
      connectionId,
    );
    return liaraCatalog(token, connection.teamRef, minimumRam);
  }
  private async lockCurrent(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
    version: number,
  ) {
    const current = await tx.providerConnection.updateMany({
      where: { id, userId, status: 'CONNECTED', credentialVersion: version },
      data: { updatedAt: new Date() },
    });
    if (!current.count)
      throw new AppError(
        409,
        'CONNECTION_CHANGED',
        'اتصال هنگام بررسی تغییر کرده است. اطلاعات را تازه کنید.',
      );
  }
  async sync(userId: string, connectionId: string, requestId: string) {
    const { connection, client } = await this.access(userId, connectionId);
    let apps: ProviderApplication[];
    try {
      apps = await client.listApplications();
    } catch (error) {
      await this.db.providerConnection.updateMany({
        where: {
          id: connectionId,
          userId,
          status: 'CONNECTED',
          credentialVersion: connection.credentialVersion,
        },
        data: { lastErrorCode: error instanceof LiaraError ? error.code : 'LIARA_UNAVAILABLE' },
      });
      throw error;
    }
    const now = new Date();
    await this.db.$transaction(
      async (tx) => {
        await this.lockCurrent(tx, userId, connectionId, connection.credentialVersion);
        await this.persistApps(tx, connectionId, userId, apps, now);
        await tx.providerConnection.update({
          where: { id: connectionId },
          data: { syncedAt: now, validatedAt: now, lastErrorCode: null },
        });
        await tx.auditLog.create({
          data: {
            userId,
            action: 'liara.applications.synced',
            resourceId: connectionId,
            requestId,
          },
        });
      },
      { timeout: 20000 },
    );
    return (await this.list(userId)).connections.find((item) => item.id === connectionId)!;
  }
  async disconnect(userId: string, connectionId: string, requestId: string) {
    await this.db.$transaction(async (tx) => {
      const found = await tx.providerConnection.findFirst({
        where: { id: connectionId, userId, provider: 'LIARA' },
      });
      if (!found) throw new AppError(404, 'CONNECTION_NOT_FOUND', 'اتصال پیدا نشد.');
      await tx.providerConnection.update({
        where: { id: connectionId },
        data: {
          status: 'DISCONNECTED',
          disconnectedAt: new Date(),
          credentialVersion: { increment: 1 },
        },
      });
      await tx.credential.deleteMany({ where: { connectionId } });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'liara.connection.disconnected',
          resourceId: connectionId,
          requestId,
        },
      });
    });
    return { disconnected: true as const };
  }
  async applications(userId: string, connectionId?: string) {
    return {
      applications: (
        await this.db.application.findMany({
          where: {
            userId,
            mode: 'LIVE',
            ...(connectionId ? { connectionId } : {}),
            connection: { userId, status: 'CONNECTED', provider: 'LIARA' },
          },
          include: { connection: true },
          orderBy: { name: 'asc' },
          take: 500,
        })
      ).map((record) => this.appDto(record)),
    };
  }
  private async ownedApplication(userId: string, id: string) {
    const application = await this.db.application.findFirst({
      where: {
        id,
        userId,
        mode: 'LIVE',
        providerMissing: false,
        connection: { userId, status: 'CONNECTED' },
      },
    });
    if (!application)
      throw new AppError(
        404,
        'APPLICATION_NOT_FOUND',
        'سرویس متعلق به حساب شما پیدا نشد یا دیگر در اتصال فعال موجود نیست.',
      );
    const access = await this.access(userId, application.connectionId);
    return { application, ...access };
  }
  async application(userId: string, id: string) {
    const { application, client, connection } = await this.ownedApplication(userId, id);
    const fresh = await client.getApplication(application.name);
    if (fresh.providerId !== application.providerId || fresh.name !== application.name)
      throw new AppError(
        409,
        'APPLICATION_CHANGED',
        'شناسه سرویس تغییر کرده است. ابتدا اتصال را همگام‌سازی کنید.',
      );
    const result = await this.db.$transaction(async (tx) => {
      await this.lockCurrent(tx, userId, connection.id, connection.credentialVersion);
      return tx.application.update({
        where: { id },
        data: {
          platform: fresh.platform,
          status: fresh.status,
          scale: fresh.scale,
          isDeployed: fresh.isDeployed,
          planId: fresh.planId,
          lastSeenAt: new Date(),
        },
        include: { connection: true },
      });
    });
    return this.appDto(result);
  }
  private async checkedRead<T>(
    userId: string,
    id: string,
    read: (client: CloudProvider, name: string) => Promise<T>,
  ) {
    const { application, client, connection } = await this.ownedApplication(userId, id);
    const result = await read(client, application.name);
    const current = await this.db.providerConnection.count({
      where: {
        id: connection.id,
        userId,
        status: 'CONNECTED',
        credentialVersion: connection.credentialVersion,
      },
    });
    if (!current)
      throw new AppError(
        409,
        'CONNECTION_CHANGED',
        'اتصال هنگام دریافت اطلاعات تغییر کرد. اطلاعات را تازه کنید.',
      );
    return result;
  }
  logs(userId: string, id: string, since: string) {
    return this.checkedRead(userId, id, (client, name) => client.getLogs(name, since));
  }
  releases(userId: string, id: string, page: number, count: number) {
    return this.checkedRead(userId, id, (client, name) => client.getDeployments(name, page, count));
  }
  metrics(userId: string, id: string) {
    return this.checkedRead(userId, id, (client, name) => client.getMetrics(name));
  }
}
export type LiaraProviderFactory = Factory;
