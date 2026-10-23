import type { Database } from '../../database/src/index.js';
import { verifyHttp } from '../../deployment/src/health.js';
export async function checkMonitor(db: Database, id: string, probe = verifyHttp, force = false) {
  const lease = new Date(Date.now() + 60000);
  const claimed = await db.healthMonitor.updateMany({
    where: {
      id,
      ...(!force ? { enabled: true } : {}),
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
    },
    data: { leaseUntil: lease },
  });
  if (!claimed.count) return null;
  try {
    const monitor = await db.healthMonitor.findUniqueOrThrow({
      where: { id },
      include: { application: { include: { connection: true } } },
    });
    if (
      monitor.application.providerMissing ||
      monitor.application.connection.status !== 'CONNECTED'
    )
      return null;
    const started = Date.now();
    let status: number | null = null,
      healthy = false,
      errorCode: string | null = null;
    try {
      const result = await probe(monitor.application.name, monitor.path, monitor.expectedText);
      status = result.status;
      healthy = result.matched;
      if (!healthy) errorCode = 'HTTP_MISMATCH';
    } catch (e) {
      errorCode = (e as { code?: string }).code ?? 'HEALTH_UNAVAILABLE';
    }
    const at = new Date(),
      latencyMs = Date.now() - started;
    return await db.$transaction(async (tx) => {
      const updated = await tx.healthMonitor.updateMany({
        where: { id, leaseUntil: lease, ...(!force ? { enabled: true } : {}) },
        data: {
          lastStatus: status,
          lastError: errorCode,
          latencyMs,
          lastCheckedAt: at,
          ...(healthy ? { lastSuccessAt: at } : {}),
          failureCount: healthy ? 0 : monitor.failureCount + 1,
          successCount: healthy ? monitor.successCount + 1 : 0,
          nextCheckAt: new Date(Date.now() + monitor.intervalSeconds * 1000),
        },
      });
      if (!updated.count) return null;
      const sample = await tx.healthSample.create({
        data: { monitorId: id, healthy, status, errorCode, latencyMs, createdAt: at },
      });
      let incident = await tx.healthIncident.findFirst({
        where: { monitorId: id, state: 'OPEN', source:'HEALTH' },
        orderBy: { openedAt: 'desc' },
      });
      if (!healthy && monitor.failureCount + 1 >= monitor.failureThreshold && !incident) {
        incident = await tx.healthIncident.create({
          data: {
            monitorId: id,
            userId: monitor.userId,
            title: `پاسخ ناموفق ${monitor.application.name}`,
            events: {
              create: {
                message: `پس از ${monitor.failureCount + 1} بررسی ناموفق متوالی، اختلال ثبت شد؛ ${status ?? errorCode}.`,
              },
            },
          },
        });
        await tx.auditLog.create({
          data: {
            userId: monitor.userId,
            action: 'incident.opened',
            resourceId: incident.id,
            requestId: 'health-worker',
          },
        });
      } else if (incident && healthy && monitor.successCount + 1 >= 2) {
        incident = await tx.healthIncident.update({
          where: { id: incident.id },
          data: {
            state: 'RESOLVED',
            resolvedAt: at,
            events: { create: { message: 'دو بررسی متوالی موفق بود؛ دسترسی وب بازیابی شد.' } },
          },
        });
        await tx.auditLog.create({
          data: {
            userId: monitor.userId,
            action: 'incident.resolved',
            resourceId: incident.id,
            requestId: 'health-worker',
          },
        });
      } else if (incident && monitor.lastError !== errorCode)
        await tx.healthIncidentEvent.create({
          data: {
            incidentId: incident.id,
            message: healthy
              ? 'اولین پاسخ سالم دریافت شد؛ بررسی تأییدی باقی است.'
              : `نشانه بررسی تغییر کرد: ${status ?? errorCode}.`,
          },
        });
      return { sample, incident };
    });
  } finally {
    await db.healthMonitor.updateMany({
      where: { id, leaseUntil: lease },
      data: { leaseUntil: null },
    });
  }
}
export async function monitoringTick(db: Database, probe = verifyHttp) {
  const due = await db.healthMonitor.findMany({
    where: {
      enabled: true,
      nextCheckAt: { lte: new Date() },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      application: { providerMissing: false, connection: { status: 'CONNECTED' } },
    },
    orderBy: { nextCheckAt: 'asc' },
    take: 3,
    select: { id: true },
  });
  await Promise.allSettled(due.map((m) => checkMonitor(db, m.id, probe)));
  await db.healthSample.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 7 * 86400000) } },
  });
}
