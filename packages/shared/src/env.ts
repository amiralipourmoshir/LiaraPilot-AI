import { z } from 'zod';
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    APP_ORIGIN: z
      .url()
      .refine((v) => new URL(v).origin === v, 'APP_ORIGIN must be an origin without a path'),
    DATABASE_URL: z.string().startsWith('postgresql://'),
    REDIS_URL: z.string().regex(/^rediss?:\/\//),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
    CREDENTIAL_KEY: z
      .string()
      .regex(/^[A-Za-z0-9+/]{43}=$/)
      .optional(),
    CREDENTIAL_KEY_VERSION: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,32}$/)
      .default('v1'),
    LIARA_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(10000),
    GITHUB_CLIENT_ID: z
      .string()
      .regex(/^[A-Za-z0-9_.-]{1,150}$/)
      .optional(),
    GITHUB_CLIENT_SECRET: z.string().min(16).max(512).optional(),
    AI_BASE_URL: z
      .url()
      .refine((v) => {
        const u = new URL(v);
        return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash;
      }, 'AI endpoint requires HTTPS without credentials/query')
      .default('https://api.openai.com/v1'),
    AI_API_KEY: z
      .string()
      .min(16)
      .max(4096)
      .regex(/^[!-~]+$/)
      .optional(),
    AI_MODELS: z.string().max(2000).default(''),
    AI_MODEL: z
      .string()
      .regex(/^[A-Za-z0-9._:/-]{1,120}$/)
      .optional(),
    AI_API_STYLE: z.enum(['responses', 'chat']).default('responses'),
    AI_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(20000),
    LOG_LEVEL: z
      .enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.APP_ORIGIN.startsWith('https://'))
      ctx.addIssue({ code: 'custom', message: 'Production requires HTTPS', path: ['APP_ORIGIN'] });
  });
export type Env = z.infer<typeof envSchema>;
export const readEnv = () => envSchema.parse(process.env);
