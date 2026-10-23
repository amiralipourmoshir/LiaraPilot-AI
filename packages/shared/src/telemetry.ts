import type { z } from 'zod';
import type { scanResult } from './reliability.js';
export type SiteReport = z.infer<typeof scanResult>;
export const assetTypes: Record<string, { label: string; color: string }> = {
  script: { label: 'جاوااسکریپت', color: '#69d9c2' },
  stylesheet: { label: 'استایل‌ها', color: '#839cff' },
  image: { label: 'تصاویر', color: '#e9b774' },
  font: { label: 'فونت‌ها', color: '#be9df2' },
  document: { label: 'HTML', color: '#65bbdf' },
  fetch: { label: 'داده و API', color: '#e28cab' },
  other: { label: 'سایر', color: '#748697' },
};
export function summarizeReport(report: SiteReport) {
  const pages = report.pages,
    loads = pages
      .map((p) => (p.loadMs && p.loadMs > 0 ? p.loadMs : p.durationMs))
      .sort((a, b) => a - b);
  const totalBytes = pages.reduce((a, p) => a + p.bytes, 0),
    requests = pages.reduce((a, p) => a + p.requests, 0);
  const groups = new Map<string, { type: string; bytes: number; count: number }>();
  for (const p of pages)
    for (const a of p.assets) {
      const type = assetTypes[a.type] ? a.type : a.type === 'xhr' ? 'fetch' : 'other';
      const group = groups.get(type) ?? { type, bytes: 0, count: 0 };
      group.bytes += a.bytes;
      group.count++;
      groups.set(type, group);
    }
  return {
    totalBytes,
    requests,
    errors: pages.reduce((a, p) => a + p.errors.length, 0),
    failed: pages.filter((p) => p.status === null || p.status >= 400).length,
    slow: loads.filter((v) => v > 2500).length,
    median: loads.length
      ? (loads[Math.floor((loads.length - 1) / 2)]! + loads[Math.floor(loads.length / 2)]!) / 2
      : null,
    p95: loads.length ? loads[Math.max(0, Math.ceil(loads.length * 0.95) - 1)]! : null,
    assets: [...groups.values()].map((g) => ({
      ...g,
      ...assetTypes[g.type]!,
      share: totalBytes ? (g.bytes / totalBytes) * 100 : 0,
    })),
    measuredBytes: [...groups.values()].reduce((a, g) => a + g.bytes, 0),
    uniqueFiles: new Set(pages.flatMap((p) => p.assets.map((a) => a.url))).size,
  };
}
// Summary samples are timestamp/value pairs, never a time series of two utilization values.
export function metricObservation(value: (string | number)[]) {
  if (value.length !== 2 || value.some((v) => String(v).trim() === '')) return null;
  const timestamp = Number(value[0]),
    amount = Number(value[1]);
  if (
    !Number.isFinite(timestamp) ||
    !Number.isFinite(amount) ||
    timestamp < 946684800 ||
    timestamp > 4102444800000
  )
    return null;
  return {
    time: new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp).toISOString(),
    value: amount,
  };
}
