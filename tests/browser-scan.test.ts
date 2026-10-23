import { expect, it } from 'vitest';
import { scanSite } from '../packages/monitoring/src/browser.js';
import { scanError } from '../packages/monitoring/src/scan-errors.js';
it('runs a real sandboxed Chromium audit, discovers pages, reports errors and emits progress', async () => {
  const progress: string[] = [];
  const read: string[] = [];
  const result = await scanSite(
    'browser-fixture',
    ['/'],
    true,
    async (url) => {
      read.push(url.pathname);
      return {
        status: url.pathname === '/about' ? 500 : 200,
        headers: { 'content-type': 'text/html' },
        body: Buffer.from(
          url.pathname === '/'
            ? '<html><body><a href="/about">About</a><img src="http://127.0.0.1/private"><script>console.error("fixture console error");fetch("/write",{method:"POST"}).catch(()=>{});</script></body></html>'
            : '<html><body>failure</body></html>',
        ),
      };
    },
    async (p) => {
      progress.push(p.phase);
    },
  );
  expect(result.pages.map((p) => p.path)).toEqual(['/', '/about']);
  expect(result.pages[1]?.status).toBe(500);
  expect(result.pages[0]?.errors.some((e) => e.includes('fixture console error'))).toBe(true);
  expect(result.blocked).toBeGreaterThan(0);
  expect(read).not.toContain('/write');
  expect(progress).toContain('BROWSER');
  expect(progress).toContain('SCANNING');
  expect(progress.at(-1)).toBe('SAVING');
}, 30000);
it('distinguishes missing browser, dependency, sandbox and target failures', () => {
  expect(scanError(new Error("Executable doesn't exist at /tmp/chrome")).code).toBe(
    'BROWSER_MISSING',
  );
  expect(scanError(new Error('No usable sandbox')).code).toBe('BROWSER_SANDBOX_UNAVAILABLE');
  expect(scanError(new Error('error while loading shared libraries: libX.so')).code).toBe(
    'BROWSER_DEPENDENCIES_MISSING',
  );
  expect(scanError(new Error('TARGET_CHANGED')).code).toBe('TARGET_CHANGED');
});

it('discovers sitemap indexes, Persian/query/hash links, bundle routes and external assets automatically', async () => {
  const result = await scanSite(
    'deep-fixture',
    [],
    true,
    async (url) => {
      const path = url.pathname;
      const bodies: Record<string, string> = {
        '/robots.txt': 'Sitemap: https://deep-fixture.liara.run/maps/index.xml',
        '/maps/index.xml':
          '<sitemapindex><sitemap><loc>https://deep-fixture.liara.run/maps/pages.xml</loc></sitemap></sitemapindex>',
        '/maps/pages.xml':
          '<urlset><url><loc>https://deep-fixture.liara.run/hidden</loc></url><url><loc>https://deep-fixture.liara.run/محصول?page=2&amp;sort=new</loc></url></urlset>',
        '/app.js': 'window.routeHints=[{path:"/from-bundle"}];',
        '/': '<html><head><title>Deep fixture</title><meta name="description" content="Fixture description"></head><body><h1>Site</h1><a href="/?tab=two">Tab</a><a href="/#/spa">SPA</a><img src="https://cdn.fixture.test/a.png"><script src="/app.js"></script></body></html>',
      };
      return {
        status:
          bodies[path] ||
          path === '/hidden' ||
          path === '/from-bundle' ||
          path.startsWith('/%') ||
          url.hostname === 'cdn.fixture.test'
            ? 200
            : 404,
        headers: {
          'content-type':
            path === '/app.js'
              ? 'application/javascript'
              : path.endsWith('.xml')
                ? 'application/xml'
                : 'text/html',
        },
        body: Buffer.from(bodies[path] ?? '<html><title>Other</title><body>Page</body></html>'),
      };
    },
    undefined,
    { maxPages: 20, maxDurationSeconds: 60, externalAssets: true },
  );
  expect(result.pages.some((p) => p.path === '/hidden')).toBe(true);
  expect(result.pages.some((p) => p.path.includes('%D9') && p.path.includes('page=2'))).toBe(true);
  expect(result.pages.some((p) => p.path === '/?tab=two')).toBe(true);
  expect(result.pages.some((p) => p.path === '/#/spa')).toBe(true);
  expect(result.pages.some((p) => p.path === '/from-bundle')).toBe(true);
  expect(result.discovery?.some((d) => d.source === 'SITEMAP')).toBe(true);
  expect(result.discovery?.some((d) => d.source === 'JAVASCRIPT')).toBe(true);
  expect(result.resources?.some((r) => r.url === 'https://cdn.fixture.test/a.png')).toBe(true);
  expect(result.pages[0]?.title).toBe('Deep fixture');
  expect(result.truncated).toBe(false);
}, 60000);

it('checks safe navigation tabs and discovers their links while never submitting write actions', async () => {
  const result = await scanSite(
    'tabs-fixture',
    [],
    true,
    async (url) => ({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: Buffer.from(
        url.pathname === '/'
          ? '<html><body><button role="tab" onclick="document.getElementById(\'content\').innerHTML=\'<a href=/inside-tab>Inside</a>\'">Catalog</button><div id="content"></div></body></html>'
          : '<html><body>Inside</body></html>',
      ),
    }),
    undefined,
    { maxPages: 5, maxDurationSeconds: 30, interactions: true },
  );
  expect(result.pages.some((p) => p.path === '/inside-tab')).toBe(true);
  expect(
    result.pages[0]?.interactions?.some(
      (s) => s.label === 'Catalog' && s.outcome === 'READ_ONLY_UI_CHECKED',
    ),
  ).toBe(true);
  expect(result.discovery?.some((d) => d.source === 'NAVIGATION')).toBe(true);
}, 30000);
