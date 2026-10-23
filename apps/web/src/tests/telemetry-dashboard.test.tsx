// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { TelemetryDashboard } from '../components/telemetry-dashboard';
import { demoTelemetryTasks, demoTelemetryMetrics } from '../demo/telemetry';
afterEach(cleanup);
it('filters measured pages, exposes file shares, and sends findings for review only', async () => {
  const analyze = vi.fn(),
    fix = vi.fn();
  render(
    <TelemetryDashboard
      tasks={demoTelemetryTasks('11111111-1111-4111-8111-111111111111')}
      metrics={demoTelemetryMetrics}
      onAnalyze={analyze}
      onFix={fix}
    />,
  );
  const table = screen.getByRole('table');
  expect(within(table).getAllByRole('row')).toHaveLength(7);
  await userEvent.click(screen.getByRole('button', { name: 'دارای خطا' }));
  expect(within(table).getAllByRole('row')).toHaveLength(2);
  expect(within(table).getByText('/products/details')).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText('تفکیک سهم فایل‌ها'), 'files');
  expect(screen.getByText('hero.webp')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'تحلیل دوباره با هوش مصنوعی' }));
  expect(analyze).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000005');
  await userEvent.click(screen.getAllByRole('button', { name: 'بررسی اصلاح با پچ' })[0]!);
  expect(fix).toHaveBeenCalledWith(expect.stringContaining('/products/details'));
});
it('keeps missing measurements and scores empty rather than synthesizing metrics', () => {
  render(<TelemetryDashboard tasks={[]} />);
  expect(screen.getByText('هنوز تحلیل نشده')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'همه صفحات' })).toBeInTheDocument();
  expect(screen.queryByText('۷۸')).not.toBeInTheDocument();
});
