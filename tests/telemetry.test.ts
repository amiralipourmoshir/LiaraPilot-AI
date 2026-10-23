import { expect, it } from 'vitest';
import { metricObservation, summarizeReport } from '../packages/shared/src/telemetry.js';
it('keeps the provider timestamp separate from the resource value', () => {
  const sample = metricObservation([1792751400, '0.125']);
  expect(sample?.value).toBe(0.125);
  expect(sample?.time).toContain('2026-10-23');
  expect(metricObservation([1792751400, '0'])?.value).toBe(0);
  for (const value of [
    [1, 2],
    [1792751400, ''],
    [1792751400, 'no-data'],
    [1792751400, 1, 2],
  ])
    expect(metricObservation(value)).toBeNull();
});
it('calculates asset shares, unique files, median and failures from actual pages', () => {
  const report = {
    pages: [100, 300].map((loadMs, i) => ({
      path: `/${i}`,
      status: i ? 500 : 200,
      durationMs: loadMs + 10,
      loadMs,
      domMs: 50,
      requests: 2,
      bytes: 1000,
      errors: i ? ['HTTP 500'] : [],
      assets: [
        { url: '/shared.js', type: 'script', status: 200, bytes: 750 },
        { url: `/image-${i}.png`, type: 'image', status: 200, bytes: 250 },
      ],
    })),
    discovered: 2,
    truncated: false,
    blocked: 0,
    scope: 'test',
  };
  const s = summarizeReport(report);
  expect(s.median).toBe(200);
  expect(s.totalBytes).toBe(2000);
  expect(s.uniqueFiles).toBe(3);
  expect(s.assets.find((a) => a.type === 'script')?.share).toBe(75);
  expect(s.failed).toBe(1);
  expect(s.p95).toBe(300);
});
