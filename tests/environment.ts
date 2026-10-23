import 'dotenv/config';
import { envSchema } from '../packages/shared/src/env.js';
const base = new URL(process.env.DATABASE_URL ?? '');
if (!['127.0.0.1', 'localhost'].includes(base.hostname))
  throw new Error('Integration tests require a local database.');
base.pathname = `${base.pathname}_test`;
export const testEnv = envSchema.parse({
  ...process.env,
  GITHUB_CLIENT_ID:undefined,
  GITHUB_CLIENT_SECRET:undefined,
  AI_API_KEY: undefined,
  AI_MODEL: undefined,
  AI_MODELS: '',
  DATABASE_URL: base.toString(),
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
});
