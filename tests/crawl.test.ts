import { expect, it } from 'vitest';
import { crawlPath, xmlLocations, scriptRoutes } from '../packages/monitoring/src/crawl.js';
import { scanPathSchema } from '../packages/shared/src/reliability.js';
const origin = 'https://site.liara.run';
it('normalizes routes without dropping Persian, query, or hash-router paths', () => {
  expect(crawlPath('/محصول?sort=new&page=2&utm_source=test', origin, origin)).toContain(
    '?page=2&sort=new',
  );
  expect(crawlPath('/#/products', origin, origin)).toBe('/#/products');
  expect(crawlPath('/#section', origin, origin)).toBe('/');
  for (const path of [
    'https://evil.test/path',
    '/app.js',
    '/products/[slug]',
    '/products/:id',
    'javascript:alert(1)',
  ])
    expect(crawlPath(path, origin, origin)).toBeNull();
  expect(scanPathSchema.safeParse('/محصول?page=2').success).toBe(true);
  for (const path of ['//evil.test', '/\\evil', '/a\nHost:x'])
    expect(scanPathSchema.safeParse(path).success).toBe(false);
});
it('reads sitemap locations and route hints as data without executing scripts or XML entities', () => {
  expect(
    xmlLocations(
      '<urlset><loc>https://site.liara.run/a?p=1&amp;q=2</loc><loc><![CDATA[https://site.liara.run/b]]></loc></urlset>',
    ),
  ).toEqual(['https://site.liara.run/a?p=1&q=2', 'https://site.liara.run/b']);
  expect(scriptRoutes('const routes=[{path:"/products"},{path:"/about"}]')).toEqual([
    '/products',
    '/about',
  ]);
});

it('extracts nested router paths statically without treating relative children as root routes', async () => {
  const { nestedScriptRoutes } = await import('../packages/monitoring/src/crawl.js');
  const routes = nestedScriptRoutes(
    'const r=[{path:"/panel",element:page,children:[{index:true,element:home},{path:"users",element:users},{path:"settings",element:settings},{path:"orders/:id",element:detail}]}]',
  );
  expect(routes).toContain('/panel/users');
  expect(routes).toContain('/panel/settings');
  expect(routes).not.toContain('/users');
  expect(routes.some((p) => p.includes(':id'))).toBe(false);
});
