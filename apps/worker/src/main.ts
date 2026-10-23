import { aiTick } from '../../../packages/monitoring/src/ai-worker.js';
import { reliabilityTick } from '../../../packages/monitoring/src/reliability-worker.js';
import { monitoringTick } from '../../../packages/monitoring/src/check.js';
import pino from 'pino';
import { createDatabase } from '../../../packages/database/src/index.js';
import { readEnv } from '../../../packages/shared/src/env.js';
import {
  createQueue,
  createFoundationWorker,
  dispatchPending,
} from '../../../packages/jobs/src/index.js';
import { createDeploymentRuntime } from '../../../packages/deployment/src/queue.js';
const env = readEnv();
const logger = pino({ level: env.LOG_LEVEL });
const db = createDatabase(env.DATABASE_URL);
const { queue, connection: queueConnection } = createQueue(env.REDIS_URL);
queueConnection.on('error', () => logger.warn('Queue connection unavailable'));
const { worker, connection: workerConnection } = createFoundationWorker(db, env.REDIS_URL, logger);
workerConnection.on('error', () => {});
const deployments = createDeploymentRuntime(db, env, logger);
let monitoring: Promise<void> | null = null;
let aiRun: Promise<void> | null = null;
let stopping = false;
let inFlight: Promise<void> = Promise.resolve();
async function loop() {
  while (!stopping) {
    try {
      await dispatchPending(db, queue);
      await deployments.dispatch();
      if (!aiRun)
        aiRun = aiTick(db, env)
          .catch(() => logger.warn('AI run failed'))
          .finally(() => {
            aiRun = null;
          });
      if (!monitoring)
        monitoring = Promise.all([monitoringTick(db), reliabilityTick(db)])
          .then(() => {})
          .catch(() => logger.warn('Monitoring cycle unavailable'))
          .finally(() => {
            monitoring = null;
          });
    } catch {
      logger.warn('Outbox dispatch unavailable; will retry');
    }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
inFlight = loop();
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await inFlight;
  await monitoring;
  await aiRun;
  await deployments.close();
  await worker.close();
  await queue.close();
  workerConnection.disconnect();
  queueConnection.disconnect();
  await db.$disconnect();
}
process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
logger.info('Workers started; cloud deployment requires an approved persisted plan');
