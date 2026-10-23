import { scanError } from './scan-errors.js';
import type { Database, Prisma } from '../../database/src/index.js';
import { scanSite } from './browser.js';
import { z } from 'zod';
import { scanInput, scanProgress } from '../../shared/src/reliability.js';
export async function reliabilityTick(db: Database, scan = scanSite) {
  // Crash ambiguity is explicit; never silently repeat an authorized scan.
  await db.reliabilityTask.updateMany({
    where: { kind: 'SCAN', state: 'RUNNING', updatedAt: { lt: new Date(Date.now() - 180000) } },
    data: {
      state: 'NEEDS_ATTENTION',
      result: {
        error: {
          code: 'WORKER_INTERRUPTED',
          message: 'اجرای worker متوقف شد یا از مهلت اجرا گذشت.',
          hint: 'برای جلوگیری از تکرار ناخواسته، تست خودکار دوباره اجرا نشد. یک برنامه تست جدید بسازید.',
        },
      },
    },
  });
  const row = await db.reliabilityTask.findFirst({
    where: { kind: 'SCAN', state: 'QUEUED' },
    orderBy: { createdAt: 'asc' },
  });
  if (!row) return;
  const claimed = await db.reliabilityTask.updateMany({
    where: { id: row.id, state: 'QUEUED' },
    data: { state: 'RUNNING' },
  });
  if (!claimed.count) return;
  let progress: z.infer<typeof scanProgress> = {
    phase: 'PREPARING',
    completed: 0,
    total: 0,
    currentPath: null,
    message: 'در حال بررسی اتصال و آماده‌سازی تست…',
    updatedAt: new Date().toISOString(),
  };
  const saveProgress = async (p: z.infer<typeof scanProgress>) => {
    progress = p;
    await db.reliabilityTask.updateMany({
      where: { id: row.id, state: 'RUNNING' },
      data: { result: { progress: p } },
    });
  };
  try {
    await saveProgress(progress);
    const s = scanInput.extend({ name: z.string(), providerId: z.string() }).parse(row.snapshot);
    const app = await db.application.findFirst({
      where: {
        id: row.applicationId,
        userId: row.userId,
        mode: 'LIVE',
        providerMissing: false,
        connection: { status: 'CONNECTED' },
      },
    });
    if (!app || app.name !== s.name || app.providerId !== s.providerId)
      throw new Error('TARGET_CHANGED');
    const result = await scan(s.name, s.paths, s.discover, undefined, saveProgress, {
      maxPages: 'maxPages' in (row.snapshot as object) ? s.maxPages : 30,
      maxDurationSeconds:
        'maxDurationSeconds' in (row.snapshot as object) ? s.maxDurationSeconds : 120,
      interactions: 'interactions' in (row.snapshot as object) ? s.interactions : false,
      externalAssets: 'externalAssets' in (row.snapshot as object) ? s.externalAssets : false,
    });
    await db.reliabilityTask.update({
      where: { id: row.id },
      data: {
        state: 'SUCCEEDED',
        result: JSON.parse(
          JSON.stringify({
            ...result,
            progress: {
              ...progress,
              phase: 'DONE',
              completed: result.pages.length,
              total: result.discovered,
              currentPath: null,
              message: 'گزارش اسکن ثبت شد.',
              updatedAt: new Date().toISOString(),
            },
          }),
        ) as Prisma.InputJsonValue,
      },
    });
    await db.auditLog.create({
      data: {
        userId: row.userId,
        action: 'monitor.scan.completed',
        resourceId: row.id,
        requestId: row.id,
      },
    });
    const failed = result.pages.filter(
      (p) => p.status === null || p.status >= 400 || p.errors.length > 0,
    );
    let monitor = await db.healthMonitor.findUnique({
      where: { userId_applicationId: { userId: row.userId, applicationId: row.applicationId } },
    });
    if (failed.length && !monitor)
      monitor = await db.healthMonitor.upsert({
        where: { userId_applicationId: { userId: row.userId, applicationId: row.applicationId } },
        create: {
          userId: row.userId,
          applicationId: row.applicationId,
          path: '/',
          expectedText: '',
          enabled: false,
        },
        update: {},
      });
    if (!failed.length && monitor && !result.truncated && !result.blocked) {
      const open = await db.healthIncident.findMany({
        where: { monitorId: monitor.id, state: 'OPEN', source: 'SCAN' },
      });
      for (const i of open) {
        const required = z.array(z.string()).safeParse(i.scanPaths);
        if (
          !required.success ||
          !required.data.every((path) => result.pages.some((p) => p.path === path))
        )
          continue;
        await db.healthIncident.update({
          where: { id: i.id },
          data: {
            state: 'RESOLVED',
            resolvedAt: new Date(),
            events: { create: { message: `اسکن مجدد ${row.id} در محدوده تأییدشده بدون خطا بود.` } },
          },
        });
      }
    }
    if (failed.length && monitor) {
      let incident = await db.healthIncident.findFirst({
        where: { monitorId: monitor.id, state: 'OPEN', source: 'SCAN' },
      });
      if (!incident)
        incident = await db.healthIncident.create({
          data: {
            monitorId: monitor.id,
            userId: row.userId,
            source: 'SCAN',
            scanPaths: failed.map((p) => p.path),
            title: `خطا در اسکن صفحات ${s.name}`,
          },
        });
      const existing = z.array(z.string()).safeParse(incident.scanPaths).data ?? [];
      await db.healthIncident.update({
        where: { id: incident.id },
        data: { scanPaths: [...new Set([...existing, ...failed.map((p) => p.path)])] },
      });
      await db.healthIncidentEvent.create({
        data: {
          incidentId: incident.id,
          message: `اسکن ${row.id}: ${failed.length} صفحه دارای خطای HTTP، بارگذاری یا مرورگر است. جزئیات و فایل‌ها در گزارش پایش ثبت شده‌اند؛ خطای مرورگر به‌تنهایی خرابی کل سرویس را ثابت نمی‌کند.`,
        },
      });
    }
  } catch (error) {
    await db.reliabilityTask.update({
      where: { id: row.id },
      data: {
        state: 'FAILED',
        result: { error: scanError(error), progress },
      },
    });
  }
}
