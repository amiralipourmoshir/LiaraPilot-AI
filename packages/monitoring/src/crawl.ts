import { parse } from 'acorn';
export function crawlPath(input: string, base: string, origin: string) {
  try {
    const u = new URL(input, base);
    if (
      u.origin !== origin ||
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      input.includes('\\') ||
      /[\u0000-\u001f]/.test(input)
    )
      return null;
    if (
      /\.(?:js|mjs|cjs|css|map|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|pdf|zip|xml|txt|mp4|mp3)(?:$)/i.test(
        u.pathname,
      )
    )
      return null;
    if (/\[[^\]]+\]|\{|\}|\/:[A-Za-z_]/.test(decodeURIComponent(u.pathname))) return null;
    for (const key of [...u.searchParams.keys()])
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) u.searchParams.delete(key);
    u.searchParams.sort();
    const hash = /^#!?\//.test(u.hash) ? u.hash : '';
    const result = u.pathname + u.search + hash;
    return result.length <= 2048 ? result : null;
  } catch {
    return null;
  }
}
export function xmlLocations(xml: string) {
  return [...xml.matchAll(/<loc(?:\s[^>]*)?>([\s\S]*?)<\/loc\s*>/gi)].slice(0, 10000).map((m) =>
    m[1]!
      .trim()
      .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'"),
  );
}
export function scriptRoutes(text: string) {
  return [
    ...text.matchAll(
      /(?:\bpath\s*:\s*|["'])(["']?)(\/[A-Za-z0-9_%\u0600-\u06ff][^\s"'<>`]{0,180})\1/g,
    ),
  ]
    .slice(0, 400)
    .map((m) => m[2]!);
}

// Static AST inspection only: route configuration is data and is never evaluated.
export function nestedScriptRoutes(text: string) {
  if (!/(?:path|children)\s*:/.test(text)) return [];
  const routes = new Set<string>();
  try {
    const root = parse(text, { ecmaVersion: 'latest', sourceType: 'module' }) as unknown as Ast;
    const seen = new WeakSet<object>();
    const props = (node: Ast) =>
      new Map(
        (Array.isArray(node.properties) ? node.properties : [])
          .filter(isAst)
          .filter((p) => p.type === 'Property')
          .map((p) => {
            const key = isAst(p.key) ? p.key : null;
            return [key?.name ?? key?.value, isAst(p.value) ? p.value : null] as const;
          }),
      );
    const routeObject = (node: Ast) => {
      if (node.type !== 'ObjectExpression') return false;
      const p = props(node);
      return (
        (p.has('path') || p.has('index') || p.has('children')) &&
        ['element', 'Component', 'children', 'loader', 'index', 'errorElement'].some((k) =>
          p.has(k),
        )
      );
    };
    const child = (node: unknown, parent: string) => {
      if (Array.isArray(node)) {
        for (const n of node) child(n, parent);
        return;
      }
      if (!isAst(node)) return;
      if (routeObject(node)) {
        extract(node, parent);
        return;
      }
      for (const value of Object.values(node))
        if (value && typeof value === 'object') child(value, parent);
    };
    const extract = (node: Ast, parent: string) => {
      if (seen.has(node)) return;
      seen.add(node);
      const p = props(node),
        value = p.get('path')?.value;
      const path =
        typeof value === 'string'
          ? value.startsWith('/')
            ? value
            : `${parent.replace(/\/$/, '')}/${value}`
          : parent;
      if (path && !/[\[*:]/.test(path)) routes.add(path);
      const children = p.get('children');
      if (children) child(children, path);
    };
    const walk = (node: unknown) => {
      if (Array.isArray(node)) {
        for (const n of node) walk(n);
        return;
      }
      if (!isAst(node)) return;
      if (routeObject(node)) {
        extract(node, '');
        return;
      }
      for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value);
    };
    walk(root);
  } catch {}
  return [...routes].slice(0, 1000);
}
type Ast = { type: string; [key: string]: unknown };
function isAst(value: unknown): value is Ast {
  return !!value && typeof value === 'object' && 'type' in value && typeof value.type === 'string';
}
