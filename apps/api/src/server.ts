import 'dotenv/config';
import { createDatabase } from '../../../packages/database/src/index.js';
import { readEnv } from '../../../packages/shared/src/env.js';
import { Redis } from 'ioredis';
import { buildApp } from './app.js';
const env = readEnv();
const db = createDatabase(env.DATABASE_URL);
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 3000, commandTimeout: 3000 });
redis.on('error', () => {});
const app = await buildApp(db, env, () => redis.ping());
app.addHook('onClose', async () => { redis.disconnect(); await db.$disconnect(); });
let stopping = false;
async function shutdown() { if (stopping) return; stopping = true; await app.close(); }
process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
try { await app.listen({ host: env.HOST, port: env.PORT }); } catch { app.log.error('API startup failed'); await shutdown(); process.exitCode = 1; }
