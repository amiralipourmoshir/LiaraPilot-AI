import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { createDatabase } from '../packages/database/src/index.js';
const base = new URL(process.env.DATABASE_URL ?? '');
if (!['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('Test preparation is restricted to a local database.');
const databaseName = `${base.pathname.slice(1)}_test`;
if (!/^[a-z][a-z0-9_]*_test$/.test(databaseName)) throw new Error('Unsafe test database name');
const db = createDatabase(base.toString());
try {
  const exists = await db.$queryRaw<Array<{ datname: string }>>`SELECT datname FROM pg_database WHERE datname = ${databaseName}`;
  if (!exists.length) await db.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
} finally { await db.$disconnect(); }
base.pathname = `/${databaseName}`;
const migrated = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: base.toString() } });
if (migrated.status !== 0) process.exitCode = 1;
