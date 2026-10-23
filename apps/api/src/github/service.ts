import { randomUUID, createHash } from 'node:crypto';
import type { Database } from '../../../../packages/database/src/index.js';
import type { Env } from '../../../../packages/shared/src/env.js';
import {
  credentialKey,
  sealCredential,
  openCredential,
} from '../../../../packages/security/src/credentials.js';
import { randomToken, digest } from '../../../../packages/security/src/auth.js';
import { GithubRepository } from '../../../../packages/github-adapter/src/index.js';
import { AppError } from '../errors.js';
export class GithubService {
  constructor(
    private db: Database,
    private env: Env,
    private transport: typeof fetch = fetch,
  ) {}
  status = async (userId: string) => {
    const c = await this.db.githubConnection.findUnique({
      where: { userId },
      select: { login: true },
    });
    return {
      configured: !!(
        this.env.GITHUB_CLIENT_ID &&
        this.env.GITHUB_CLIENT_SECRET &&
        this.env.CREDENTIAL_KEY
      ),
      connected: !!c,
      login: c?.login ?? null,
      setupUrl: this.env.GITHUB_CLIENT_ID ? null : 'https://github.com/settings/applications/new',
    };
  };
  private key() {
    if (!this.env.CREDENTIAL_KEY)
      throw new AppError(503, 'GITHUB_KEY_MISSING', 'کلید رمزگذاری سرور تنظیم نشده است.');
    return credentialKey(this.env.CREDENTIAL_KEY);
  }
  async token(userId: string) {
    const row = await this.db.githubConnection.findUnique({ where: { userId } });
    return row
      ? {
          token: openCredential(row, this.key(), this.env.CREDENTIAL_KEY_VERSION, userId, row.id),
          version: row.version,
          connectionId: row.id,
        }
      : null;
  }
  async client(userId: string) {
    const auth = await this.token(userId);
    return new GithubRepository(this.transport, auth?.token);
  }
  async begin(userId: string) {
    if (!(await this.status(userId)).configured)
      throw new AppError(
        503,
        'GITHUB_SETUP_REQUIRED',
        'ثبت برنامه اتصال GitHub توسط مدیر لازم است؛ راهنمای اتصال در دسترس است.',
      );
    const state = randomToken();
    const binding = randomToken();
    const verifier = randomToken();
    await this.db.githubOAuthAttempt.deleteMany({ where: { userId } });
    await this.db.githubOAuthAttempt.create({
      data: {
        stateHash: digest(state),
        userId,
        bindingHash: digest(binding),
        verifier,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    const u = new URL('https://github.com/login/oauth/authorize');
    u.search = new URLSearchParams({
      client_id: this.env.GITHUB_CLIENT_ID!,
      redirect_uri: this.env.APP_ORIGIN + '/api/v1/github/callback',
      scope: 'repo',
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      allow_signup: 'false',
    }).toString();
    return { url: u.toString(), binding };
  }
  async callback(state: string, code: string, binding: string) {
    const attempt = await this.db.githubOAuthAttempt.findUnique({
      where: { stateHash: digest(state) },
    });
    if (!attempt || attempt.expiresAt <= new Date() || attempt.bindingHash !== digest(binding))
      throw new AppError(
        400,
        'GITHUB_STATE_INVALID',
        'اعتبار ورود گیت‌هاب پایان یافته است؛ دوباره متصل شوید.',
      );
    const consumed = await this.db.githubOAuthAttempt.deleteMany({
      where: { stateHash: digest(state), bindingHash: digest(binding) },
    });
    if (!consumed.count)
      throw new AppError(409, 'GITHUB_STATE_USED', 'این درخواست قبلاً استفاده شده است.');
    const r = await this.transport('https://github.com/login/oauth/access_token', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: this.env.GITHUB_CLIENT_ID,
        client_secret: this.env.GITHUB_CLIENT_SECRET,
        code,
        code_verifier: attempt.verifier,
        redirect_uri: this.env.APP_ORIGIN + '/api/v1/github/callback',
      }),
    });
    if (!r.ok) throw new AppError(502, 'GITHUB_OAUTH_FAILED', 'اتصال GitHub کامل نشد.');
    const { z } = await import('zod');
    const raw = await r.text();
    if (raw.length > 10000)
      throw new AppError(502, 'GITHUB_OAUTH_FAILED', 'پاسخ GitHub معتبر نیست.');
    const auth = z
      .object({
        access_token: z.string().min(10).max(512),
        token_type: z.string(),
        scope: z.string(),
      })
      .parse(JSON.parse(raw));
    if (!auth.scope.split(/[ ,]/).includes('repo'))
      throw new AppError(403, 'GITHUB_SCOPE_REQUIRED', 'مجوز مخزن خصوصی تأیید نشده است.');
    const me = await this.transport('https://api.github.com/user', {
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        authorization: `Bearer ${auth.access_token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'LiaraPilot',
      },
    });
    if (!me.ok) throw new AppError(502, 'GITHUB_IDENTITY_FAILED', 'هویت GitHub تأیید نشد.');
    const identity = z
      .object({ login: z.string().regex(/^[A-Za-z0-9-]{1,39}$/) })
      .parse(await me.json());
    const previous = await this.db.githubConnection.findUnique({
      where: { userId: attempt.userId },
    });
    const id = previous?.id ?? randomUUID();
    const sealed = sealCredential(
      auth.access_token,
      this.key(),
      this.env.CREDENTIAL_KEY_VERSION,
      attempt.userId,
      id,
    );
    await this.db.githubConnection.upsert({
      where: { userId: attempt.userId },
      create: { id, userId: attempt.userId, login: identity.login, ...sealed },
      update: { login: identity.login, ...sealed, version: { increment: 1 } },
    });
  }
  async disconnect(userId: string) {
    await this.db.githubConnection.deleteMany({ where: { userId } });
    await this.db.githubOAuthAttempt.deleteMany({ where: { userId } });
    return { disconnected: true };
  }
}
