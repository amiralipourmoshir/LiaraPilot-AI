import { describe, it, expect } from 'vitest';
import { digest, hashPassword, matchesDigest, randomToken, verifyPassword } from '../packages/security/src/auth.js';
import { registerSchema, projectInputSchema } from '../packages/shared/src/index.js';
import { envSchema } from '../packages/shared/src/env.js';
describe('security primitives', () => {
  it('uses salted Argon2id and verifies valid/invalid passwords', async () => { const password = 'correct-horse-123!'; const hash = await hashPassword(password); expect(hash).toMatch(/^\$argon2id\$/); expect(await verifyPassword(hash, password)).toBe(true); expect(await verifyPassword(hash, 'wrong')).toBe(false); expect(await hashPassword(password)).not.toBe(hash); });
  it('uses unpredictable tokens and fixed digest comparison', () => { const a = randomToken(); expect(a).not.toBe(randomToken()); expect(matchesDigest(a, digest(a))).toBe(true); expect(matchesDigest('changed', digest(a))).toBe(false); expect(matchesDigest(a, '')).toBe(false); });
  it('normalizes email while rejecting unknown fields and short passwords', () => { expect(registerSchema.parse({ name: 'تست', email: ' TEST@EXAMPLE.COM ', password: 'secure-password-123' }).email).toBe('test@example.com'); expect(registerSchema.safeParse({ name: 'تست', email: 'x@y.com', password: 'short' }).success).toBe(false); expect(projectInputSchema.safeParse({ name: 'پروژه', userId: randomToken() }).success).toBe(false); });
  it('rejects an insecure production origin', () => { expect(envSchema.safeParse({ NODE_ENV: 'production', APP_ORIGIN: 'http://example.com', DATABASE_URL: 'postgresql://local/db', REDIS_URL: 'redis://local' }).success).toBe(false); });
});
