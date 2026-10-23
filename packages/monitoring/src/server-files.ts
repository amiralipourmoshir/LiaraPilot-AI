import { randomUUID, createHash } from 'node:crypto';
import WebSocket from 'ws';
import { z } from 'zod';
import type { Database } from '../../database/src/index.js';
import type { Env } from '../../shared/src/env.js';
import { credentialKey, openCredential } from '../../security/src/credentials.js';
import { safeRepositoryPath, excludedRepositoryPath } from '../../github-adapter/src/paths.js';
export const serverRoots = ['/app', '/usr/src/app', '/usr/share/nginx/html'] as const;
export const rootSchema = z.enum(serverRoots);
export type ServerFile = {
  root: (typeof serverRoots)[number];
  path: string;
  content: string;
  sha: string;
  host: string;
  connectionId: string;
  version: number;
  providerId: string;
  name: string;
};
export interface ServerFiles {
  read(
    userId: string,
    applicationId: string,
    root: (typeof serverRoots)[number],
    path: string,
  ): Promise<ServerFile>;
  write(
    userId: string,
    applicationId: string,
    file: ServerFile,
    expected: string,
    content: string,
  ): Promise<{ sha: string; host: string }>;
  list(
    userId: string,
    applicationId: string,
    root: (typeof serverRoots)[number],
  ): Promise<string[]>;
}
export class ServerFileError extends Error {
  constructor(public code: string) {
    super(
      (
        {
          SERVER_SOURCE_UNAVAILABLE: 'فایل یا مسیر انتخاب‌شده در کانتینر وجود ندارد.',
          SERVER_CONFLICT: 'فایل پس از تهیه پچ تغییر کرده است؛ پچ تازه بسازید.',
          SERVER_INSTANCE_CHANGED: 'نمونه کانتینر تغییر کرده است؛ برای همین نمونه پچ تازه بسازید.',
          SERVER_EXEC_UNAVAILABLE: 'دسترسی کنسول لیارا برای این سرویس برقرار نشد.',
          SERVER_BUSY: 'اصلاح دیگری روی فایل‌های این نمونه در جریان است.',
          SERVER_RUNTIME_UNSUPPORTED:
            'ابزارهای لازم برای خواندن و اصلاح امن فایل در کانتینر موجود نیست.',
          SERVER_PATH_REJECTED: 'مسیر فایل مجاز نیست.',
          SERVER_SOURCE_TOO_LARGE: 'حجم انتقال فایل از ظرفیت این اتصال کنسول فراتر رفت.',
        } as Record<string, string>
      )[code] ?? 'عملیات فایل روی کانتینر کامل نشد.',
    );
  }
}
export function checkServerPath(path: string) {
  if (
    !safeRepositoryPath(path) ||
    excludedRepositoryPath(path) ||
    !/\.(?:tsx?|jsx?|css|html|json|mjs|cjs|py|php|vue|svelte)$/.test(path) ||
    path.length > 200
  )
    throw new ServerFileError('SERVER_PATH_REJECTED');
}
const b64 = (s: string) => Buffer.from(s).toString('base64');
const quote = (s: string) => "'" + s.replace(/'/g, "'\\''") + "'";
export function fileScript(
  nonce: string,
  operation: 'read' | 'write' | 'list',
  root: string,
  path = '',
  expected = '',
  content = '',
  host = '',
) {
  rootSchema.parse(root);
  if (operation !== 'list') checkServerPath(path);
  if (!/^[a-f0-9-]{36}$/.test(nonce)) throw new ServerFileError('SERVER_PATH_REJECTED');
  const start = `\nset -f\nresult(){ printf '\\n__LP_${nonce}__:%s\\n' "$1"; }\nfail(){ result "ERR:$1"; exit 1; }\nfor tool in base64 readlink sha256sum hostname wc tr; do command -v "$tool" >/dev/null 2>&1 || fail SERVER_RUNTIME_UNSUPPORTED; done\nroot=${quote(root)}\n[ -d "$root" ] || fail SERVER_SOURCE_UNAVAILABLE\nroot=$(readlink -f "$root") || fail SERVER_PATH_REJECTED\nhost=$(hostname); host=$(printf '%s' "$host" | base64 | tr -d '\\n')\n`;
  if (operation === 'list')
    return (
      start +
      `cd "$root" || fail SERVER_SOURCE_UNAVAILABLE
files=$(find . -maxdepth 6 -type f \\( -name '*.js' -o -name '*.ts' -o -name '*.tsx' -o -name '*.jsx' -o -name '*.css' -o -name '*.html' -o -name '*.json' -o -name '*.py' -o -name '*.php' -o -name '*.vue' -o -name '*.svelte' \\) ! -path '*/node_modules/*' ! -path '*/.git/*' ! -name '.env*' 2>/dev/null | head -300 | base64 | tr -d '\\n')\nresult "OK:$host:$files"\nexit\n`
    );
  const target = `rel=$(printf '%s' '${b64(path)}' | base64 -d)\n[ ! -L "$root/$rel" ] || fail SERVER_PATH_REJECTED\ntarget=$(readlink -f "$root/$rel") || fail SERVER_SOURCE_UNAVAILABLE\ncase "$target" in "$root"/*) ;; *) fail SERVER_PATH_REJECTED;; esac\n[ -f "$target" ] || fail SERVER_SOURCE_UNAVAILABLE\nsha=$(sha256sum "$target"); sha=\${sha%% *}\n`;
  if (operation === 'read')
    return (
      start +
      target +
      `value=$(base64 < "$target" | tr -d '\\n')\nresult "OK:$host:$sha:$value"\nexit\n`
    );
  if (!/^[a-f0-9]{64}$/.test(expected) || !host) throw new ServerFileError('SERVER_CONFLICT');
  const next = createHash('sha256').update(content).digest('hex');
  const encoded = b64(content);
  const append = (encoded.match(/.{1,4096}/g) ?? [''])
    .map((chunk) => `printf '%s' '${chunk}' >> "$encoded" || fail SERVER_RUNTIME_UNSUPPORTED`)
    .join('\n');
  return (
    start +
    target +
    `[ "$host" = '${b64(host)}' ] || fail SERVER_INSTANCE_CHANGED\n[ "$sha" = '${expected}' ] || fail SERVER_CONFLICT\nlock="$root/.liarapilot-patch-lock"\nmkdir "$lock" 2>/dev/null || fail SERVER_BUSY\ntmp="$root/.liarapilot-${nonce}.tmp"\nencoded="$tmp.base64"\ntrap 'rm -f "$tmp" "$encoded"; rmdir "$lock" 2>/dev/null' EXIT\ncp -p "$target" "$tmp" || fail SERVER_RUNTIME_UNSUPPORTED\n: > "$encoded" || fail SERVER_RUNTIME_UNSUPPORTED\n${append}\nbase64 -d < "$encoded" > "$tmp" || fail SERVER_RUNTIME_UNSUPPORTED\ncheck=$(sha256sum "$target"); check=\${check%% *}\n[ "$check" = '${expected}' ] || fail SERVER_CONFLICT\nmv "$tmp" "$target" || fail SERVER_RUNTIME_UNSUPPORTED\nsha=$(sha256sum "$target"); sha=\${sha%% *}\n[ "$sha" = '${next}' ] || fail SERVER_CONFLICT\nresult "OK:$host:$sha"\nexit\n`
  );
}
export function parseShellResult(buffer: string, nonce: string) {
  const clean = buffer.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  const match = new RegExp(`(?:^|[\\r\\n])__LP_${nonce}__:(OK|ERR):([^\\r\\n]*)\\r?\\n`).exec(
    clean,
  );
  return match ? { kind: match[1]!, value: match[2]! } : null;
}
export async function liaraShell(
  token: string,
  team: string,
  name: string,
  nonce: string,
  script: string,
) {
  const url = new URL('wss://api.iran.liara.ir/v1/exec');
  url.search = new URLSearchParams({
    token,
    cmd: '/bin/sh',
    project_id: name,
    teamID: team,
  }).toString();
  return new Promise<string>((resolve, reject) => {
    let buffer = '',
      settled = false,
      sent = false;
    const socket = new WebSocket(url, { handshakeTimeout: 10000, maxPayload: 64 * 1024 * 1024 });
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = (error?: Error, value?: string) => {
      if (settled) return;
      settled = true;
      for (const timer of timers) clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolve(value!);
    };
    timers.push(setTimeout(() => finish(new ServerFileError('SERVER_EXEC_UNAVAILABLE')), 120000));
    socket.on('open', () => {
      timers.push(
        setTimeout(
          () => socket.send(JSON.stringify({ action: 'start', cols: 120, rows: 40 })),
          1000,
        ),
      );
      timers.push(
        setTimeout(
          () =>
            socket.send(
              JSON.stringify({
                type: 'input',
                data:
                  `stty -echo -icanon min 1 time 0 2>/dev/null; printf '\\n__LP_READY_${nonce}__\\n'` +
                  String.fromCharCode(10),
              }),
            ),
          1400,
        ),
      );
    });
    socket.on('message', (data) => {
      buffer += data.toString();
      if (buffer.length > 64 * 1024 * 1024) {
        finish(new ServerFileError('SERVER_SOURCE_TOO_LARGE'));
        return;
      }
      if (!sent && new RegExp(`(?:^|[\\r\\n])__LP_READY_${nonce}__\\r?\\n`).test(buffer)) {
        sent = true;
        const input = script + String.fromCharCode(10);
        let offset = 0;
        const sendChunk = () => {
          if (settled || offset >= input.length) return;
          const chunk = input.slice(offset, offset + 8192);
          offset += chunk.length;
          socket.send(JSON.stringify({ type: 'input', data: chunk }), (error) => {
            if (error) finish(new ServerFileError('SERVER_EXEC_UNAVAILABLE'));
            else sendChunk();
          });
        };
        sendChunk();
      }
      const result = parseShellResult(buffer, nonce);
      if (result) {
        if (result.kind === 'ERR') finish(new ServerFileError(result.value));
        else finish(undefined, result.value);
      }
    });
    socket.on('error', (error) => {
      const code = 'code' in error ? String(error.code) : 'NETWORK';
      finish(new ServerFileError('SERVER_EXEC_' + code));
    });
    socket.on('unexpected-response', (_request, response) => {
      response.resume();
      finish(new ServerFileError('SERVER_EXEC_HTTP_' + response.statusCode));
    });
    socket.on('close', () => {
      if (!settled) finish(new ServerFileError('SERVER_EXEC_UNAVAILABLE'));
    });
  });
}
export class LiaraServerFiles implements ServerFiles {
  constructor(
    private db: Database,
    private env: Env,
    private shell = liaraShell,
  ) {}
  private async access(userId: string, applicationId: string) {
    const app = await this.db.application.findFirst({
      where: {
        id: applicationId,
        userId,
        mode: 'LIVE',
        providerMissing: false,
        connection: { status: 'CONNECTED' },
      },
      include: { connection: { include: { credential: true } } },
    });
    if (!app?.connection.credential || !this.env.CREDENTIAL_KEY)
      throw new ServerFileError('SERVER_EXEC_UNAVAILABLE');
    const c = app.connection,
      token = openCredential(
        c.credential!,
        credentialKey(this.env.CREDENTIAL_KEY),
        this.env.CREDENTIAL_KEY_VERSION,
        userId,
        c.id,
      );
    return { app, c, token };
  }
  async read(
    userId: string,
    applicationId: string,
    root: (typeof serverRoots)[number],
    path: string,
  ) {
    const { app, c, token } = await this.access(userId, applicationId);
    const nonce = randomUUID();
    const raw = await this.shell(
      token,
      c.teamRef,
      app.name,
      nonce,
      fileScript(nonce, 'read', root, path),
    );
    const [host, sha, value] = raw.split(':');
    if (!host || !sha || value === undefined || !/^[a-f0-9]{64}$/.test(sha))
      throw new ServerFileError('SERVER_EXEC_UNAVAILABLE');
    if (createHash('sha256').update(Buffer.from(value, 'base64')).digest('hex') !== sha)
      throw new ServerFileError('SERVER_READ_INCOMPLETE');
    return {
      root,
      path,
      content: Buffer.from(value, 'base64').toString('utf8'),
      sha,
      host: Buffer.from(host, 'base64').toString(),
      connectionId: c.id,
      version: c.credentialVersion,
      providerId: app.providerId,
      name: app.name,
    };
  }
  async write(
    userId: string,
    applicationId: string,
    file: ServerFile,
    expected: string,
    content: string,
  ) {
    const { app, c, token } = await this.access(userId, applicationId);
    if (
      c.id !== file.connectionId ||
      c.credentialVersion !== file.version ||
      app.providerId !== file.providerId ||
      app.name !== file.name
    )
      throw new ServerFileError('SERVER_INSTANCE_CHANGED');
    const nonce = randomUUID();
    const raw = await this.shell(
      token,
      c.teamRef,
      app.name,
      nonce,
      fileScript(nonce, 'write', file.root, file.path, expected, content, file.host),
    );
    const [host, sha] = raw.split(':');
    if (!host || sha !== createHash('sha256').update(content).digest('hex'))
      throw new ServerFileError('SERVER_CONFLICT');
    return { host: Buffer.from(host, 'base64').toString(), sha };
  }
  async list(userId: string, applicationId: string, root: (typeof serverRoots)[number]) {
    const { app, c, token } = await this.access(userId, applicationId);
    const nonce = randomUUID();
    const raw = await this.shell(
      token,
      c.teamRef,
      app.name,
      nonce,
      fileScript(nonce, 'list', root),
    );
    const content = raw.split(':')[1] ?? '';
    return Buffer.from(content, 'base64')
      .toString()
      .split('\n')
      .map((p) => (p.startsWith('./') ? p.slice(2) : ''))
      .filter((p) => {
        try {
          checkServerPath(p);
          return true;
        } catch {
          return false;
        }
      });
  }
}
