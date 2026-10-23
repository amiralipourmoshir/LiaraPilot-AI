import { Queue, Worker } from 'bullmq';
import type { Logger } from 'pino';
import { redisConnection } from '../../jobs/src/index.js';
import type { Database } from '../../database/src/index.js';
import type { Env } from '../../shared/src/env.js';
import { runDeployment, type RunnerDependencies } from './runner.js';
const QUEUE = 'liarapilot-deployment-v1';
export function createDeploymentRuntime(
  db: Database,
  env: Env,
  logger: Logger,
  deps: RunnerDependencies = {},
  queueName = QUEUE,
) {
  const queueConnection = redisConnection(env.REDIS_URL);
  const connection = redisConnection(env.REDIS_URL);
  const queue = new Queue(queueName, {
    connection: queueConnection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    },
  });
  const worker = new Worker(
    queueName,
    async (job) => {
      if (typeof job.data.id !== 'string') return;
      await runDeployment(db, env, job.data.id, deps);
    },
    { connection, concurrency: 1, maxStalledCount: 0 },
  );
  worker.on('error', () => logger.warn('Deployment worker unavailable'));
  worker.on('failed', (job) => {
    if (job)
      void db.deployment
        .updateMany({
          where: { id: job.data.id, state: { in: ['QUEUED', 'RUNNING', 'VERIFYING'] } },
          data: { state: 'NEEDS_ATTENTION', errorCode: 'WORKER_INTERRUPTED' },
        })
        .catch(() => {});
  });
  queueConnection.on('error', () => {});
  connection.on('error', () => {});
  return {
    async dispatch() {
      const rows = await db.deploymentOutbox.findMany({ where: { publishedAt: null }, take: 20 });
      for (const row of rows) {
        await queue.add('deploy', { id: row.deploymentId }, { jobId: row.deploymentId });
        await db.deploymentOutbox.update({
          where: { deploymentId: row.deploymentId },
          data: { publishedAt: new Date() },
        });
      }
    },
    async close() {
      await worker.close();
      await queue.close();
      connection.disconnect();
      queueConnection.disconnect();
    },
  };
}
