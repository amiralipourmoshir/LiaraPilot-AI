import { MemoryRouter } from 'react-router';
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReliabilityPanel } from '../components/reliability-panel';
vi.mock('../lib/session', () => ({ useSession: () => ({ data: { csrfToken: 'csrf-test' } }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('shows patch diff and requires explicit consent before applying or undoing', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  let state = 'PLANNED';
  const sent: unknown[] = [];
  const task = () => ({
    id,
    applicationId: id,
    kind: 'PATCH',
    state,
    hash: 'a'.repeat(64),
    snapshot: {
      patch: '--- old\n+++ new\n@@ -1 +1 @@\n-old\n+new',
      instruction: 'اصلاح مورد درخواست',
      mode: 'SERVER',
      root: '/app',
      host: 'applet-1',
      path: 'src/app.ts',
    },
    result: null,
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    createdAt: new Date().toISOString(),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input, init) => {
      const url = String(input);
      if (url.includes('/runs')) return Response.json({ items: [] });
      if (url.includes('/metrics'))
        return Response.json({
          source: 'LIARA',
          fetchedAt: 'now',
          unitsVerified: false,
          cpuUsage: [],
          memoryUsage: [],
        });
      if (init?.method === 'POST') {
        sent.push(JSON.parse(String(init.body)));
        state = url.endsWith('/undo') ? 'UNDONE' : 'APPLIED';
        return Response.json(task());
      }
      return Response.json({ items: [task()] });
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ReliabilityPanel applicationId={id} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const apply = await screen.findByRole('button', { name: 'تأیید و اعمال پچ' });
  await userEvent.click(apply);
  const confirm = screen.getByRole('button', { name: 'تأیید و اعمال پچ' });
  expect(confirm).toBeDisabled();
  expect(sent).toHaveLength(0);
  expect(within(screen.getByRole('dialog')).getByText('+new')).toBeInTheDocument();
  expect(within(screen.getByRole('dialog')).getByText('+new').closest('tr')).toHaveClass(
    'diff-add',
  );
  expect(within(screen.getByRole('dialog')).getByText('-old').closest('tr')).toHaveClass(
    'diff-remove',
  );
  await userEvent.click(
    screen.getByLabelText(
      'پچ و نمونه سرور را بررسی کردم؛ اعمال مستقیم همین تغییر را تأیید می‌کنم.',
    ),
  );
  await userEvent.click(confirm);
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]).toEqual({ hash: 'a'.repeat(64), approve: true });
  const success = await screen.findByRole('dialog', { name: 'پچ با موفقیت اعمال شد' });
  expect(within(success).getByText('+new')).toBeInTheDocument();
  expect(within(success).getByRole('button', { name: 'برگرداندن تغییرات' })).toBeEnabled();
  await userEvent.click(within(success).getAllByRole('button', { name: 'بستن' }).at(-1)!);
  expect(screen.getByText('مشاهده پچ اعمال‌شده').closest('details')).toHaveAttribute('open');
  expect(screen.getByText('+new')).toBeInTheDocument();
  const undo = await screen.findByRole('button', { name: 'برگرداندن تغییرات' });
  await userEvent.click(undo);
  const confirmUndo = screen.getByRole('button', { name: 'برگرداندن تغییرات' });
  expect(confirmUndo).toBeDisabled();
  await userEvent.click(screen.getByLabelText('بازگردانی همین فایل به نسخه قبل را تأیید می‌کنم.'));
  await userEvent.click(confirmUndo);
  await screen.findByText('اصلاح کد · آندو شد');
});

it('confirms scans in a popup, shows measured progress, and explains failures', async () => {
  const id = '22222222-2222-4222-8222-222222222222';
  let state = 'PLANNED';
  let result: unknown = null;
  const task = () => ({
    id,
    applicationId: id,
    kind: 'SCAN',
    state,
    hash: 'b'.repeat(64),
    snapshot: { name: 'fixture', paths: ['/', '/about'], discover: true },
    result,
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    createdAt: new Date().toISOString(),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input, init) => {
      if (String(input).includes('/runs')) return Response.json({ items: [] });
      if (String(input).includes('/metrics'))
        return Response.json({
          source: 'LIARA',
          fetchedAt: 'now',
          unitsVerified: false,
          cpuUsage: [],
          memoryUsage: [],
        });
      if (init?.method === 'POST') {
        state = 'QUEUED';
        return Response.json(task());
      }
      return Response.json({ items: [task()] });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReliabilityPanel applicationId={id} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'تأیید و اجرای تست' }));
  await screen.findByRole('dialog', { name: 'تأیید اجرای تست سایت' });
  const approve = screen.getByRole('button', { name: 'تأیید و اجرای تست' });
  expect(approve).toBeDisabled();
  await userEvent.click(
    screen.getByRole('checkbox', {
      name: 'اجرای تست و ایجاد ترافیک خواندنی روی سرویس را تأیید می‌کنم.',
    }),
  );
  await userEvent.click(approve);
  await screen.findByRole('dialog', { name: 'روند اجرای تست سایت' });
  state = 'RUNNING';
  result = {
    progress: {
      phase: 'SCANNING',
      completed: 1,
      total: 2,
      currentPath: '/about',
      message: 'در حال بررسی صفحه',
      updatedAt: new Date().toISOString(),
    },
  };
  client.setQueryData(['reliability', id], { items: [task()] });
  const dialog = screen.getByRole('dialog', { name: 'روند اجرای تست سایت' });
  const { within } = await import('@testing-library/react');
  await waitFor(() =>
    expect(within(dialog).getByRole('progressbar')).toHaveAttribute('value', '1'),
  );
  expect(within(dialog).getByRole('progressbar')).toHaveAttribute('max', '2');
  state = 'FAILED';
  result = {
    error: {
      code: 'BROWSER_MISSING',
      message: 'مرورگر لازم برای اجرای تست روی worker نصب نیست.',
      hint: 'مرورگر را روی worker نصب کنید.',
    },
  };
  client.setQueryData(['reliability', id], { items: [task()] });
  await within(dialog).findByText('مرورگر لازم برای اجرای تست روی worker نصب نیست.');
  expect(within(dialog).getByText('BROWSER_MISSING')).toBeInTheDocument();
  expect(
    within(dialog).getByRole('button', { name: 'آماده‌سازی تست مجدد با تأیید تازه' }),
  ).toBeInTheDocument();
});

it('opens live AI progress in a popup when a run is started from chat', async () => {
  const id = '33333333-3333-4333-8333-333333333333',
    runId = '44444444-4444-4444-8444-444444444444';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input) =>
      String(input).includes('/runs')
        ? Response.json({
            items: [
              {
                id: runId,
                applicationId: id,
                kind: 'PATCH',
                state: 'RUNNING',
                events: [
                  {
                    sequence: 1,
                    at: new Date().toISOString(),
                    phase: 'SOURCE',
                    message: 'در حال خواندن فایل واقعی سرور',
                  },
                ],
                result: null,
                error: null,
                createdAt: new Date().toISOString(),
              },
            ],
          })
        : String(input).includes('/metrics')
          ? Response.json({
              source: 'LIARA',
              fetchedAt: 'now',
              unitsVerified: false,
              cpuUsage: [],
              memoryUsage: [],
            })
          : Response.json({ items: [] }),
    ),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ReliabilityPanel applicationId={id} initialRunId={runId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const dialog = await screen.findByRole('dialog', { name: 'روند زنده تولید پچ سرور' });
  const { within } = await import('@testing-library/react');
  expect(within(dialog).getByText('در حال خواندن فایل واقعی سرور')).toBeInTheDocument();
});
