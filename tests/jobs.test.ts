import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../packages/database/src/index.js';
import { createQueue, createFoundationWorker, dispatchPending } from '../packages/jobs/src/index.js';
import { testEnv } from './environment.js';
const db = createDatabase(testEnv.DATABASE_URL);
const queueName = `foundation-test-${randomUUID()}`;
const queue = createQueue(testEnv.REDIS_URL, queueName);
const ids: string[] = [];
const logger = pino({ level: 'silent' });
const waitFor = async (id: string) => { for (let i = 0; i < 100; i++) { const op = await db.operation.findUniqueOrThrow({ where: { id }, include: { events: true } }); if (op.state === 'SUCCEEDED') return op; await new Promise(r => setTimeout(r, 50)); } throw new Error('Worker timed out'); };
afterAll(async () => {
  await queue.queue.obliterate({ force: true }); await queue.queue.close(); queue.connection.disconnect();
  await db.auditLog.deleteMany({ where: { userId: { in: ids } } }); await db.operation.deleteMany({ where: { userId: { in: ids } } }); await db.project.deleteMany({ where: { userId: { in: ids } } }); await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect();
});
describe('durable PostgreSQL outbox and actual Redis/BullMQ worker', () => {
  it('recovers a request made while the worker is offline, survives dispatcher restart, and repeats safely', async () => {
    const user = await db.user.create({ data: { email: `worker-${randomUUID()}@example.test`, name: 'کاربر صف', passwordHash: 'test-not-login' } }); ids.push(user.id);
    const project = await db.project.create({ data: { userId: user.id, name: 'تست دوام' } });
    const operation = await db.operation.create({ data: { userId: user.id, projectId: project.id, idempotencyKey: randomUUID(), requestHash: 'fixture', outbox: { create: {} }, events: { create: { sequence: 1, type: 'operation.queued', message: 'در صف' } } } });
    expect((await db.operation.findUniqueOrThrow({ where: { id: operation.id } })).state).toBe('QUEUED');
    const initialProducer = createQueue(testEnv.REDIS_URL, queueName);
    try { await dispatchPending(db, initialProducer.queue); } finally { await initialProducer.queue.close(); initialProducer.connection.disconnect(); }
    // Disconnect the producer completely; the queued job remains in Redis.
    const restartedProducer = createQueue(testEnv.REDIS_URL, queueName);
    try {
      expect(await restartedProducer.queue.getJob(operation.id)).toBeTruthy();
      const consumer = createFoundationWorker(db, testEnv.REDIS_URL, logger, queueName);
      try {
        const completed = await waitFor(operation.id);
        expect(completed.result).toEqual({ database: 'reachable', queue: 'consumed', ownership: 'verified', scope: 'local-foundation-only' });
        expect(completed.events.map(e => e.sequence).sort()).toEqual([1, 2, 3]);
      } finally { await consumer.worker.close(); consumer.connection.disconnect(); }
      // Replaying the same logical operation after a crash cannot duplicate events or audit entries.
      await restartedProducer.queue.add('foundation-check', { operationId: operation.id }, { jobId: randomUUID() });
      const restartedWorker = createFoundationWorker(db, testEnv.REDIS_URL, logger, queueName);
      try { await new Promise(resolve => setTimeout(resolve, 250)); expect(await db.operationEvent.count({ where: { operationId: operation.id } })).toBe(3); expect(await db.auditLog.count({ where: { userId: user.id, action: 'foundation.check.completed' } })).toBe(1); } finally { await restartedWorker.worker.close(); restartedWorker.connection.disconnect(); }
    } finally { await restartedProducer.queue.close(); restartedProducer.connection.disconnect(); }
  });
  it('rejects cross-owner project relationships at the database boundary', async () => {
    const owner = await db.user.create({ data: { email: `owner-${randomUUID()}@example.test`, name: 'مالک', passwordHash: 'test' } }); ids.push(owner.id);
    const stranger = await db.user.create({ data: { email: `stranger-${randomUUID()}@example.test`, name: 'دیگری', passwordHash: 'test' } }); ids.push(stranger.id);
    const project = await db.project.create({ data: { userId: owner.id, name: 'خصوصی' } });
    await expect(db.operation.create({ data: { userId: stranger.id, projectId: project.id, mode: 'DEMO', idempotencyKey: randomUUID(), requestHash: 'fixture' } })).rejects.toThrow();
  });
});
