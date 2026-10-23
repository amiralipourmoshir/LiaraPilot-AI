import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Redis } from 'ioredis';
import { readEnv } from '../packages/shared/src/env.js';
import { createDatabase } from '../packages/database/src/index.js';
const env = readEnv();
if (env.NODE_ENV === 'production') throw new Error('This helper is for local development only.');
const url = new URL(env.DATABASE_URL); const redisUrl = new URL(env.REDIS_URL);
if (url.hostname !== '127.0.0.1' || redisUrl.hostname !== '127.0.0.1') throw new Error('Local infrastructure requires explicit loopback URLs.');
const dbName = url.pathname.slice(1);
if (!/^[a-z][a-z0-9_]*$/.test(dbName)) throw new Error('Unsupported local database name.');
const postgresPort = Number(url.port || '5432'); const redisPort = Number(redisUrl.port || '6379');
const state = resolve('.local'); const pgData = resolve(state, 'postgres'); const redisData = resolve(state, 'redis');
mkdirSync(state, { recursive: true }); mkdirSync(redisData, { recursive: true });
const pgBin = process.env.PG_BIN_DIR ?? '/usr/lib/postgresql/16/bin';
const redisBin = existsSync('/usr/bin/redis-server') ? '/usr/bin/redis-server' : resolve(state, 'redis-bin/usr/bin/redis-server');
function run(command: string, args: string[], overrides: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: { ...process.env, ...overrides } });
  if (result.error || result.status !== 0) throw new Error(`Local command failed: ${command}`);
}
if (!existsSync(`${pgBin}/initdb`) || !existsSync(redisBin)) throw new Error('Install PostgreSQL 16 and Redis 7, or use pnpm infra:up with Docker. See docs/DEPLOYMENT.md.');
if (!existsSync(resolve(pgData, 'PG_VERSION'))) {
  const passwordFile = resolve(state, 'init-password');
  writeFileSync(passwordFile, decodeURIComponent(url.password), { mode: 0o600 });
  try { run(`${pgBin}/initdb`, ['-D', pgData, '-U', decodeURIComponent(url.username), '--auth-local=trust', '--auth-host=scram-sha-256', `--pwfile=${passwordFile}`]); } finally { unlinkSync(passwordFile); }
}
const running = spawnSync(`${pgBin}/pg_ctl`, ['-D', pgData, 'status'], { stdio: 'ignore' }).status === 0;
if (!running) run(`${pgBin}/pg_ctl`, ['-D', pgData, '-l', resolve(state, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${postgresPort} -k /tmp`, 'start']);
const adminUrl = new URL(url); adminUrl.pathname = '/postgres';
const admin = createDatabase(adminUrl.toString());
try { const found = await admin.$queryRaw<Array<{ datname: string }>>`SELECT datname FROM pg_database WHERE datname = ${dbName}`; if (!found.length) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`); } finally { await admin.$disconnect(); }
const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null, connectTimeout: 1000 });
redis.on('error', () => {});
let redisRunning = false;
try { await redis.connect(); await redis.ping(); const dir = await redis.config('GET', 'dir'); if (!Array.isArray(dir) || dir[1] !== redisData) throw new Error('Another Redis instance occupies the configured port.'); redisRunning = true; } catch (error) { if (redis.status === 'ready') throw error; } finally { redis.disconnect(); }
if (!redisRunning) run(redisBin, ['--bind', '127.0.0.1', '--port', String(redisPort), '--dir', redisData, '--appendonly', 'yes', '--daemonize', 'yes', '--pidfile', resolve(state, 'redis.pid'), '--logfile', resolve(state, 'redis.log')], { LD_LIBRARY_PATH: `${resolve(state, 'redis-bin/usr/lib/x86_64-linux-gnu')}:${process.env.LD_LIBRARY_PATH ?? ''}` });
console.log('Local PostgreSQL and Redis are ready. No system service was changed.');
