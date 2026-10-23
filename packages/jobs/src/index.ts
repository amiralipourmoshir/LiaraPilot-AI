import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Database } from '../../database/src/index.js';
import { jobPayloadSchema } from '../../shared/src/index.js';
export const QUEUE_NAME = 'liarapilot-foundation-v1';
export const redisConnection = (url: string) => new Redis(url, { maxRetriesPerRequest: null, connectTimeout: 5000 });
export function createQueue(url: string, queueName = QUEUE_NAME) {
  const connection = redisConnection(url);
  return { connection, queue: new Queue(queueName, { connection, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: { age: 86400 }, removeOnFail: { age: 604800 } } }) };
}
export async function dispatchPending(db: Database, queue: Queue) {
  const pending = await db.outboxEvent.findMany({ where: { publishedAt: null }, orderBy: { createdAt: 'asc' }, take: 50 });
  for (const entry of pending) {
    await queue.add('foundation-check', { operationId: entry.operationId }, { jobId: entry.operationId });
    await db.outboxEvent.update({ where: { id: entry.id }, data: { publishedAt: new Date() } });
  }
}
export function createFoundationWorker(db: Database, url: string, logger: Logger, queueName = QUEUE_NAME) {
  const connection = redisConnection(url);
  const worker = new Worker(queueName, async job => {
    const { operationId } = jobPayloadSchema.parse(job.data);
    // This transaction-only diagnostic has no external effects and is safe to repeat after a crash.
    await db.$transaction(async tx => {
      const claimed = await tx.operation.updateMany({ where: { id: operationId, type: 'FOUNDATION_CHECK', mode: 'DEMO', state: { in: ['QUEUED', 'RUNNING'] } }, data: { state: 'RUNNING' } });
      if (claimed.count === 0) return;
      const operation = await tx.operation.findUniqueOrThrow({ where: { id: operationId } });
      const project = await tx.project.findUniqueOrThrow({ where: { id: operation.projectId } });
      if (project.userId !== operation.userId || project.mode !== operation.mode) throw new Error('OWNERSHIP_MISMATCH');
      await tx.$queryRaw`SELECT 1`;
      await tx.operationEvent.createMany({ data: [
        { operationId, sequence: 2, type: 'operation.started', message: 'پردازشگر، کار را از صف دریافت کرد.' },
        { operationId, sequence: 3, type: 'operation.succeeded', message: 'ارتباط صف، پردازشگر و دیتابیس بررسی شد؛ نتیجه ذخیره شد.' },
      ], skipDuplicates: true });
      await tx.operation.update({ where: { id: operationId }, data: { state: 'SUCCEEDED', completedAt: new Date(), result: { database: 'reachable', queue: 'consumed', ownership: 'verified', scope: 'local-foundation-only' } } });
      await tx.auditLog.create({ data: { userId: operation.userId, action: 'foundation.check.completed', resourceId: operationId, requestId: job.id ?? operationId } });
    }, { timeout: 10000 });
  }, { connection, concurrency: 2 });
  worker.on('error', error => logger.error({ error: error.name }, 'Worker error'));
  worker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, error: error.name }, 'Job attempt failed');
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      void db.operation.updateMany({ where: { id: job.id, state: { in: ['QUEUED', 'RUNNING'] } }, data: { state: 'FAILED', errorCode: 'FOUNDATION_CHECK_FAILED', completedAt: new Date() } }).catch(() => logger.error('Unable to persist failure'));
    }
  });
  return { worker, connection };
}
