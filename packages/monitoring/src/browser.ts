import { pinnedLookup } from '../../deployment/src/pinned-lookup.js';
import { gunzipSync } from 'node:zlib';
import { existsSync } from 'node:fs';
import ChromiumBundle from '@sparticuz/chromium';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { chromium } from 'playwright';
import { z } from 'zod';
import { publicAddress } from '../../deployment/src/health.js';
import { crawlPath, xmlLocations, scriptRoutes, nestedScriptRoutes } from './crawl.js';
import { scanProgress, scanResult, scanPathSchema } from '../../shared/src/reliability.js';
import { redactSecrets } from '../../security/src/redact.js';
// All browser network traffic is fulfilled via pinned public DNS; no browser DNS or redirects.
export async function publicGet(url: URL) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true }),
    new Promise<never>((_r, reject) => {
      timer = setTimeout(() => reject(new Error('DNS_TIMEOUT')), 8000);
    }),
  ]).finally(() => clearTimeout(timer));
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error('ADDRESS_REJECTED');
  const a = addresses[0]!;
  return new Promise<{ status: number; headers: Record<string, string>; body: Buffer }>(
    (resolve, reject) => {
      const req = request(
        {
          hostname: url.hostname,
          servername: url.hostname,
          port: 443,
          path: url.pathname + url.search,
          method: 'GET',
          lookup: pinnedLookup(a),
          headers: { 'user-agent': 'LiaraPilot-authorized-audit', 'accept-encoding': 'identity' },
          timeout: 8000,
        },
        (res) => {
          let size = 0;
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > 4 * 1024 * 1024) req.destroy(new Error('RESPONSE_LIMIT'));
            else chunks.push(chunk);
          });
          res.on('end', () => {
            const headers: Record<string, string> = {};
            for (const key of [
              'content-type',
              'content-encoding',
              'cache-control',
              'access-control-allow-origin',
              'location',
            ]) {
              const v = res.headers[key];
              if (typeof v === 'string') headers[key] = v;
            }
            resolve({ status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks) });
          });
          res.on('error', reject);
        },
      );
      req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
      req.on('error', reject);
      req.end();
    },
  );
}
export async function scanSite(
  name: string,
  paths: string[],
  discover: boolean,
  get = publicGet,
  progress?: (p: z.infer<typeof scanProgress>) => Promise<void>,
  options: {
    maxPages?: number;
    maxDurationSeconds?: number;
    externalAssets?: boolean;
    interactions?: boolean;
  } = {},
) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(name)) throw new Error('TARGET_REJECTED');
  let origin = `https://${name}.liara.run`;
  const started = Date.now(),
    maxPages = options.maxPages ?? 200,
    deadline = started + (options.maxDurationSeconds ?? 600) * 1000;
  const pages: z.infer<typeof scanResult>['pages'] = [],
    pending: string[] = [],
    known = new Set<string>(),
    sourceFor = new Map<string, string>();
  const discovery: { source: string; url: string; count: number }[] = [],
    warnings: string[] = [];
  const resources = new Map<
    string,
    { url: string; type: string; status: number; bytes: number; requests: number; pages: string[] }
  >();
  let blocked = 0,
    truncated = false,
    totalBytes = 0,
    totalRequests = 0;
  const enqueue = (href: string, source: string, base = origin) => {
    const path = crawlPath(href, base, origin);
    if (!path || known.has(path)) return false;
    if (known.size >= 10000) {
      truncated = true;
      return false;
    }
    known.add(path);
    pending.push(path);
    sourceFor.set(path, source);
    return true;
  };
  for (const path of [...(discover ? ['/'] : []), ...paths]) {
    scanPathSchema.parse(path);
    enqueue(path, 'SEED');
  }
  const emit = async (
    phase: z.infer<typeof scanProgress>['phase'],
    message: string,
    currentPath: string | null = null,
  ) =>
    progress?.({
      phase,
      completed: pages.length,
      total: known.size,
      currentPath,
      message,
      updatedAt: new Date().toISOString(),
    });
  const limitedGet = async (u: URL) => {
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443'))
      throw new Error('URL_REJECTED');
    if (totalRequests++ >= 5000 || totalBytes > 200 * 1024 * 1024 || Date.now() > deadline) {
      truncated = true;
      throw new Error('SCAN_BUDGET_REACHED');
    }
    const r = await get(u);
    totalBytes += r.body.length;
    return r;
  };
  await emit('BROWSER', 'در حال راه‌اندازی مرورگر امن تست…');
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
    (existsSync(chromium.executablePath()) ? undefined : await ChromiumBundle.executablePath());
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    args: [
      '--disable-background-networking',
      '--disable-quic',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    ],
    ...(executablePath ? { executablePath } : {}),
  });
  try {
    if (discover) {
      let root = new URL(origin + '/');
      for (let i = 0; i < 4; i++) {
        try {
          const response = await limitedGet(root);
          if (response.status < 300 || response.status >= 400 || !response.headers.location) break;
          const next = new URL(response.headers.location, root);
          if (
            next.protocol !== 'https:' ||
            next.username ||
            next.password ||
            (next.port && next.port !== '443')
          ) {
            warnings.push('تغییر مسیر صفحه اصلی به مقصد غیرمجاز بود.');
            break;
          }
          // The next request validates and pins public DNS before accepting a canonical host.
          await limitedGet(next);
          origin = next.origin;
          enqueue(next.href, 'REDIRECT');
          discovery.push({ source: 'REDIRECT', url: next.origin + next.pathname, count: 1 });
          root = next;
        } catch {
          warnings.push('بررسی مقصد تغییر مسیر صفحه اصلی کامل نشد.');
          break;
        }
      }
    }
    if (discover) {
      await emit('DISCOVERY', 'در حال خواندن robots و نقشه‌های سایت…');
      const maps = [
          new URL('/sitemap.xml', origin).href,
          new URL('/sitemap_index.xml', origin).href,
        ],
        readMaps = new Set<string>();
      try {
        const r = await limitedGet(new URL('/robots.txt', origin));
        if (r.status === 200) {
          for (const m of r.body.toString().matchAll(/^sitemap:\s*(\S+)/gim)) {
            try {
              const u = new URL(m[1]!, origin);
              if (u.origin === origin) maps.push(u.href);
            } catch {}
          }
          discovery.push({ source: 'ROBOTS', url: '/robots.txt', count: maps.length - 2 });
        }
      } catch {
        warnings.push('خواندن robots.txt کامل نشد؛ کشف لینک‌ها ادامه دارد.');
      }
      while (maps.length && readMaps.size < 20 && Date.now() < deadline) {
        const address = maps.shift()!;
        if (readMaps.has(address)) continue;
        readMaps.add(address);
        try {
          const u = new URL(address);
          if (u.origin !== origin) continue;
          const r = await limitedGet(u);
          if (r.status !== 200) continue;
          const xml = (
            /\.gz$/i.test(u.pathname) || r.headers['content-encoding'] === 'gzip'
              ? gunzipSync(r.body, { maxOutputLength: 4 * 1024 * 1024 })
              : r.body
          ).toString();
          if (!/<(?:urlset|sitemapindex)\b/i.test(xml)) continue;
          let count = 0;
          for (const loc of xmlLocations(xml)) {
            try {
              const candidate = new URL(loc, origin);
              if (candidate.origin !== origin) continue;
              if (/\.xml(?:\.gz)?$/i.test(candidate.pathname) && /<sitemapindex\b/i.test(xml)) {
                if (maps.length < 100) maps.push(candidate.href);
              } else if (enqueue(candidate.href, 'SITEMAP')) count++;
            } catch {}
          }
          discovery.push({ source: 'SITEMAP', url: u.pathname, count });
          await emit(
            'DISCOVERY',
            `نقشه سایت بررسی شد؛ ${known.size} مسیر کشف شده است.`,
            u.pathname,
          );
        } catch {
          warnings.push(`نقشه سایت قابل خواندن نبود: ${new URL(address).pathname}`);
        }
      }
      if (maps.length) warnings.push('بخشی از نقشه‌های سایت به سقف زمان یا تعداد نقشه‌ها رسید.');
    }
    const networkErrors = new Map<string, string>();
    const context = await browser.newContext({
      serviceWorkers: 'block',
      acceptDownloads: false,
      viewport: { width: 1440, height: 1000 },
    });
    await context.route('**/*', async (route) => {
      const req = route.request(),
        u = new URL(req.url());
      if (
        u.protocol !== 'https:' ||
        req.method() !== 'GET' ||
        u.username ||
        u.password ||
        (u.origin !== origin && (req.isNavigationRequest() || !options.externalAssets))
      ) {
        blocked++;
        await route.abort();
        return;
      }
      try {
        const r = await limitedGet(u);
        if (
          discover &&
          u.origin === origin &&
          r.status === 200 &&
          (req.resourceType() === 'script' || /javascript/.test(r.headers['content-type'] ?? '')) &&
          r.body.length < 2 * 1024 * 1024
        ) {
          let count = 0;
          for (const hint of [
            ...nestedScriptRoutes(r.body.toString()),
            ...scriptRoutes(r.body.toString()),
          ])
            if (
              !/^\/(?:api\/|_next\/|_error|_app|_document)/.test(hint) &&
              enqueue(hint, 'JAVASCRIPT')
            )
              count++;
          if (count) discovery.push({ source: 'JAVASCRIPT', url: u.pathname, count });
        }
        await route.fulfill({ status: r.status, headers: r.headers, body: r.body });
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error
            ? String(error.code)
            : 'NETWORK_ERROR';
        networkErrors.set(
          req.url(),
          `${code}: ${redactSecrets(error instanceof Error ? error.message : String(error)).slice(0, 350)}`,
        );
        blocked++;
        await route.abort();
      }
    });
    await context.routeWebSocket('**/*', (ws) => ws.close());
    while (
      pending.length &&
      pages.length < maxPages &&
      Date.now() < deadline &&
      totalRequests < 5000 &&
      totalBytes <= 200 * 1024 * 1024
    ) {
      const path = pending.shift()!;
      await emit('SCANNING', 'در حال بررسی صفحه، اجرای جاوااسکریپت و استخراج فایل‌ها…', path);
      const interactions: {
        label: string;
        url: string;
        newPaths: number;
        requests: number;
        outcome: string;
      }[] = [];
      const page = await context.newPage(),
        errors: string[] = [],
        assets: z.infer<typeof scanResult>['pages'][number]['assets'] = [];
      let requests = 0,
        bytes = 0,
        status: number | null = null,
        domMs: number | null = null,
        loadMs: number | null = null,
        ttfbMs: number | null = null;
      let title = '',
        description = '',
        domNodes = 0,
        imageCount = 0,
        imagesMissingAlt = 0,
        h1Count = 0,
        linkCount = 0;
      const responseJobs: Promise<void>[] = [];
      const pageStarted = Date.now();
      page.on('request', () => requests++);
      page.on('pageerror', (e) => {
        if (errors.length < 100) errors.push(e.message.slice(0, 700));
      });
      page.on('console', (m) => {
        if (m.type() === 'error' && errors.length < 100) errors.push(m.text().slice(0, 700));
      });
      page.on('requestfailed', (r) => {
        if (errors.length < 100)
          errors.push(
            `REQUEST_FAILED ${new URL(r.url()).origin}${new URL(r.url()).pathname} · ${networkErrors.get(r.url()) ?? r.failure()?.errorText ?? 'NETWORK_ERROR'}`,
          );
      });
      page.on('response', (r) => {
        responseJobs.push(
          (async () => {
            const size = await r
              .body()
              .then((b) => b.length)
              .catch(() => 0);
            bytes += size;
            const u = new URL(r.url()),
              url = (u.origin === origin ? '' : u.origin) + u.pathname;
            const type = r.request().resourceType();
            if (assets.length < 1000) assets.push({ url, type, status: r.status(), bytes: size });
            const key = `${type}:${url}`;
            const entry = resources.get(key) ?? {
              url,
              type,
              status: r.status(),
              bytes: 0,
              requests: 0,
              pages: [],
            };
            entry.bytes += size;
            entry.requests++;
            if (!entry.pages.includes(path)) entry.pages.push(path);
            resources.set(key, entry);
            if (r.status() >= 400 && errors.length < 100) errors.push(`HTTP ${r.status()} ${url}`);
          })(),
        );
      });
      try {
        const r = await page.goto(origin + path, { waitUntil: 'domcontentloaded', timeout: 20000 });
        status = r?.status() ?? null;
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        // Read-only scrolling triggers lazy assets and client-rendered navigation without submitting forms.
        if (discover) {
          for (let i = 0; i < 3; i++) {
            await page.evaluate(
              'window.scrollBy(0,Math.max(window.innerHeight,document.body.scrollHeight/3))',
            );
            await page.waitForTimeout(180);
          }
          await page.evaluate('window.scrollTo(0,0)');
        }
        await page.waitForTimeout(250);
        const detail = z
          .object({
            domMs: z.number(),
            loadMs: z.number(),
            ttfbMs: z.number(),
            title: z.string(),
            description: z.string(),
            domNodes: z.number(),
            imageCount: z.number(),
            imagesMissingAlt: z.number(),
            h1Count: z.number(),
            links: z.array(z.string()),
            hints: z.array(z.string()),
          })
          .parse(
            await page.evaluate(
              `(() => {const n=performance.getEntriesByType('navigation')[0],images=[...document.images];return {domMs:n?.domContentLoadedEventEnd??0,loadMs:n?.loadEventEnd??0,ttfbMs:n?Math.max(0,n.responseStart-n.requestStart):0,title:document.title.slice(0,300),description:(document.querySelector('meta[name="description"]')?.content??'').slice(0,500),domNodes:document.querySelectorAll('*').length,imageCount:images.length,imagesMissingAlt:images.filter(i=>!i.hasAttribute('alt')).length,h1Count:document.querySelectorAll('h1').length,links:[...document.querySelectorAll('a[href],area[href]')].slice(0,3000).map(a=>a.href),hints:[...document.querySelectorAll('[data-href],[data-url],link[rel="alternate"],link[rel="canonical"]')].slice(0,1000).map(e=>e.getAttribute('data-href')||e.getAttribute('data-url')||e.href||'')};})()`,
            ),
          );
        ({ title, description, domNodes, imageCount, imagesMissingAlt, h1Count } = detail);
        domMs = detail.domMs;
        loadMs = detail.loadMs;
        ttfbMs = detail.ttfbMs;
        linkCount = detail.links.length;
        if (discover) {
          let count = 0;
          for (const href of [...detail.links, ...detail.hints])
            if (enqueue(href, 'DOM', page.url())) count++;
          if (count) discovery.push({ source: 'DOM', url: path, count });
        }
      } catch (e) {
        errors.push(
          `PAGE_LOAD_FAILED ${redactSecrets(e instanceof Error ? e.message : String(e)).slice(0, 500)}`,
        );
      }
      if (discover && options.interactions && status !== null && status < 400) {
        const controls = z
          .array(z.object({ label: z.string(), role: z.string() }))
          .parse(
            await page
              .evaluate(
                `(() => [...document.querySelectorAll('button,[role="tab"]')].filter(e => e.matches('nav button,header button,footer button,[role="navigation"] button,[role="tab"],button[aria-expanded="false"],button[aria-haspopup="menu"]')||/^(خانه|دسته‌بندی|دسته‌بندی‌ها|فروشگاه‌ها|محصولات|جستجو|نقشه|درباره ما|تماس با ما)$/.test(e.innerText?.trim()??'')).map(e=>({label:(e.getAttribute('aria-label')||e.innerText||'').replace(/\s+/g,' ').trim().slice(0,100),role:e.getAttribute('role')==='tab'?'tab':'button'})).filter(e=>e.label&&!/حذف|خروج|پرداخت|خرید|ثبت|ارسال|افزودن|delete|logout|remove|save|submit|checkout|sign.?out/i.test(e.label)).slice(0,8))()`,
              )
              .catch(() => []),
          );
        const used = new Set<string>();
        for (const control of controls) {
          if (used.has(control.label) || Date.now() > deadline) continue;
          used.add(control.label);
          const initial = requests;
          let count = 0;
          try {
            const button = page
              .getByRole(control.role as 'button' | 'tab', { name: control.label, exact: true })
              .first();
            if (!(await button.isVisible())) continue;
            await emit('SCANNING', `در حال بررسی ناوبری خواندنی: ${control.label}`, path);
            await button.click({ timeout: 2000 });
            await page.waitForLoadState('networkidle', { timeout: 1500 }).catch(() => {});
            await page.waitForTimeout(150);
            const links = z
              .array(z.string())
              .parse(
                await page.evaluate(
                  'Array.from(document.querySelectorAll("a[href]")).slice(0,1000).map(a=>a.href)',
                ),
              );
            for (const href of [...links, page.url()])
              if (enqueue(href, 'NAVIGATION', page.url())) count++;
            interactions.push({
              label: control.label,
              url: page.url(),
              newPaths: count,
              requests: requests - initial,
              outcome: 'READ_ONLY_UI_CHECKED',
            });
            if (count) discovery.push({ source: 'NAVIGATION', url: path, count });
          } catch {
            interactions.push({
              label: control.label,
              url: page.url(),
              newPaths: count,
              requests: requests - initial,
              outcome: 'CONTROL_NOT_AVAILABLE_OR_TIMEOUT',
            });
          }
        }
      }
      const finalUrl = page.url();
      await page.close();
      await Promise.allSettled(responseJobs);
      if (status !== null && status >= 300 && status < 400)
        warnings.push(`مسیر ${path} پاسخ redirect دارد؛ دامنه نهایی را بررسی کنید.`);
      pages.push({
        path,
        status,
        durationMs: Date.now() - pageStarted,
        requests,
        bytes,
        domMs,
        loadMs,
        ttfbMs,
        title,
        description,
        domNodes,
        imageCount,
        imagesMissingAlt,
        h1Count,
        linkCount,
        finalUrl,
        interactions,
        source: sourceFor.get(path) ?? 'UNKNOWN',
        errors: errors.map((e) => redactSecrets(e)),
        assets,
      });
      await emit('SCANNING', 'صفحه بررسی شد؛ لینک‌ها و فایل‌ها به گزارش اضافه شدند.', path);
    }
    await emit('SAVING', 'در حال ثبت فهرست صفحات، فایل‌ها و شواهد…');
    if (pages.length === 1 && discover)
      warnings.push(
        'فقط یک مسیر عمومی کشف شد. سایت ممکن است تک‌صفحه‌ای باشد، لینک‌ها پشت ورود یا رویداد کلیک باشند، یا sitemap عمومی نداشته باشد. این گزارش ادعای پوشش تمام مسیرهای پنهان را ندارد.',
      );
    if (pending.length)
      warnings.push(`${pending.length} مسیر کشف‌شده به سقف صفحه، زمان یا ترافیک رسید و بررسی نشد.`);
    return scanResult.parse({
      pages,
      discovered: known.size,
      truncated: truncated || pending.length > 0,
      blocked,
      discovery,
      warnings,
      pendingPaths: pending.slice(0, 1000),
      resources: [...resources.values()],
      maxPages,
      durationMs: Date.now() - started,
      scope: `واکشی صفحات عمومی: صفحه اصلی، sitemap، لینک‌های DOM و مسیرهای قابل شناسایی جاوااسکریپت؛ سقف ${maxPages} صفحه و ${options.maxDurationSeconds ?? 600} ثانیه. ${options.externalAssets ? 'منابع خارجی HTTPS نیز اندازه‌گیری می‌شوند.' : 'منابع خارجی در این تأیید مسدودند.'} ناوبری خواندنی تا ۸ کنترل در هر صفحه بررسی می‌شود؛ صفحات پشت ورود و رویدادهای نوشتنی بررسی نمی‌شوند.`,
    });
  } finally {
    await browser.close();
  }
}
