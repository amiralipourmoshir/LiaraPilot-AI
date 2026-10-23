import type { Database, Prisma } from '../../database/src/index.js';
import type { Env } from '../../shared/src/env.js';
import { aiRunEvent, patchInput } from '../../shared/src/reliability.js';
import { z } from 'zod';
import { ReliabilityService } from '../../../apps/api/src/monitoring/reliability.js';
import { redactSecrets } from '../../security/src/redact.js';
import type { ModelProvider } from '../../ai-agent/src/provider.js';
import type { ServerFiles } from './server-files.js';
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function aiTick(db: Database, env: Env, model?: ModelProvider, files?: ServerFiles) {
  await db.reliabilityRun.updateMany({
    where: { state: 'RUNNING', updatedAt: { lt: new Date(Date.now() - 180000) } },
    data: {
      state: 'FAILED',
      error: 'worker در جریان اجرا متوقف شد؛ هیچ اعمال کدی خودکار تکرار نمی‌شود.',
    },
  });
  const row = await db.reliabilityRun.findFirst({
    where: { state: 'QUEUED' },
    orderBy: { createdAt: 'asc' },
  });
  if (!row) return;
  const claimed = await db.reliabilityRun.updateMany({
    where: { id: row.id, state: 'QUEUED' },
    data: { state: 'RUNNING' },
  });
  if (!claimed.count) return;
  const events = z.array(aiRunEvent).parse(row.events);
  const emit = async (phase: string, message: string, receivedBytes?: number) => {
    events.push({
      sequence: events.length + 1,
      at: new Date().toISOString(),
      phase,
      message,
      ...(receivedBytes === undefined ? {} : { receivedBytes }),
    });
    await db.reliabilityRun.update({ where: { id: row.id }, data: { events: json(events) } });
  };
  try {
    await emit('STARTED', 'worker شروع شد؛ در حال بررسی دسترسی و مقصد درخواست…');
    const s = new ReliabilityService(db, env, model, files);
    const result =
      row.kind === 'PATCH'
        ? await s.patch(row.userId, patchInput.parse(row.input), emit)
        : await s.analyze(row.userId, z.object({ scanId: z.uuid() }).parse(row.input).scanId, emit);
    await emit(
      'COMPLETE',
      row.kind === 'PATCH'
        ? 'پچ آماده بازبینی است؛ اعمال فقط با تأیید مستقل شما انجام می‌شود.'
        : 'امتیاز و یافته‌های مبتنی بر شواهد در داشبورد ثبت شدند.',
    );
    await db.reliabilityRun.update({
      where: { id: row.id },
      data: { state: 'SUCCEEDED', result: { taskId: result.id } },
    });
  } catch (error) {
    const message = redactSecrets(error instanceof Error ? error.message : 'درخواست کامل نشد.');
    await emit('FAILED', message);
    await db.reliabilityRun.update({
      where: { id: row.id },
      data: { state: 'FAILED', error: message },
    });
  }
}
