// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkspaceShell } from '../components/workspace-shell';
import { OverviewPage } from '../pages/overview';
import { FoundationPage } from '../pages/foundation';
import { ProjectsPage, ProjectDetailPage } from '../pages/projects';
import { DeploymentsPage, DeploymentDetailPage, OperationsPage } from '../pages/operations';
import { AssistantPage } from '../pages/assistant';
import { IncidentDetailPage, IncidentsPage, LogsPage, MonitoringPage } from '../pages/monitoring';
import { SettingsPage, ConnectionsPage } from '../pages/settings';
import { CloudApplicationsPage, CloudApplicationDetailPage } from '../pages/cloud';
import { useWorkspaceUi } from '../lib/workspace';
import { useTheme } from '../lib/theme';
vi.mock('../components/metric-chart', () => ({
  MetricChart: () => <div aria-label="نمودار در تست واحد رسم نمی‌شود" />,
}));
const account = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'آزمایش',
  email: 'ui@example.test',
};
const project = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'پروژه خصوصی',
  mode: 'DEMO',
  createdAt: '2026-10-23T08:00:00Z',
};
const connectedRecord = {
  id: '44444444-4444-4444-8444-444444444444',
  label: 'حساب لیارای من',
  provider: 'LIARA',
  mode: 'LIVE',
  status: 'CONNECTED',
  teamId: null,
  validatedAt: '2026-10-23T08:00:00Z',
  syncedAt: '2026-10-23T08:00:00Z',
  lastErrorCode: null,
  createdAt: '2026-10-23T08:00:00Z',
  applicationCount: 1,
};
const cloudApp = {
  id: '55555555-5555-4555-8555-555555555555',
  connectionId: connectedRecord.id,
  mode: 'LIVE',
  providerId: 'provider-one',
  name: 'actual-app',
  platform: 'node',
  status: 'Running',
  scale: 1,
  isDeployed: true,
  planId: 'provider-plan',
  lastSeenAt: '2026-10-23T08:00:00Z',
  providerMissing: false,
  connectionLabel: connectedRecord.label,
};
let connected = false;
let connectionFails = false;
let privateMode = false;
let projectsFail = false;
const clients: QueryClient[] = [];
const requests: Array<{ path: string; method: string; body?: string }> = [];
beforeEach(() => {
  privateMode = false;
  connected = false;
  connectionFails = false;
  projectsFail = false;
  requests.length = 0;
  localStorage.clear();
  useWorkspaceUi.setState({ mode: 'LOCAL', selectedProject: 'all' });
  useTheme.getState().setTheme('dark');
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const path = String(input);
      const method = options?.method ?? 'GET';
      requests.push({ path, method, body: options?.body?.toString() });
      const respond = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      if (path.endsWith('/connections/liara') && method === 'POST') {
        if (connectionFails)
          return respond(
            {
              error: {
                code: 'LIARA_AUTH_FAILED',
                message: 'اعتبار توکن لیارا را بررسی کنید.',
                requestId: 'test-connect',
              },
            },
            422,
          );
        connected = true;
        return respond(connectedRecord, 201);
      }
      if (path.endsWith('/connections/liara'))
        return respond({ configured: true, connections: connected ? [connectedRecord] : [] });
      if (path.endsWith('/disconnect')) {
        connected = false;
        return respond({ disconnected: true });
      }
      if (path.endsWith('/applications'))
        return respond({ applications: connected ? [cloudApp] : [] });
      if (path.includes('/applications/') && path.includes('/logs?'))
        return respond({
          source: 'LIARA',
          contract: 'CLI_V2',
          fetchedAt: '2026-10-23T08:00:00Z',
          since: '2026-10-23T07:00:00Z',
          truncated: false,
          logs: [
            {
              type: 'stdout',
              datetime: '2026-10-23T08:00:00Z',
              message: 'provider log: [REDACTED]',
            },
          ],
        });
      if (path.includes('/applications/')) return respond(cloudApp);
      if (path.endsWith('/providers/liara/capabilities'))
        return respond({ provider: 'LIARA', mode: 'LIVE', operations: [] });
      if (path.endsWith('/auth/session'))
        return privateMode
          ? respond({ user: account, csrfToken: 'test-csrf' })
          : respond(
              { error: { code: 'UNAUTHENTICATED', message: 'ورود لازم است.', requestId: 'test' } },
              401,
            );
      if (path.endsWith('/projects') && method === 'POST')
        return respond({ ...project, name: JSON.parse(String(options?.body)).name }, 201);
      if (path.endsWith('/projects'))
        return projectsFail
          ? respond(
              {
                error: {
                  code: 'UNAVAILABLE',
                  message: 'دریافت پروژه‌ها ناموفق بود.',
                  requestId: 'test-ui',
                },
              },
              503,
            )
          : respond({ projects: [] });
      if (path.includes('/projects/')) return respond({ ...project, name: 'پروژه تازه من' });
      return respond(
        { error: { code: 'NOT_FOUND', message: 'پیدا نشد.', requestId: 'test' } },
        404,
      );
    }),
  );
});
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  vi.unstubAllGlobals();
});
function renderWorkspace(path = '/demo', preview = true, prompt?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  clients.push(client);
  const url = new URL(path, 'http://test.local');
  const root = preview ? '/demo' : '/workspace';
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={[
            { pathname: url.pathname, search: url.search, state: prompt ? { prompt } : null },
          ]}
        >
          <Routes>
            <Route path={root} element={<WorkspaceShell preview={preview} />}>
              <Route index element={<OverviewPage />} />
              <Route path="applications" element={<CloudApplicationsPage />} />
              <Route path="applications/:id" element={<CloudApplicationDetailPage />} />
              <Route path="foundation" element={<FoundationPage />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="projects/:id" element={<ProjectDetailPage />} />
              <Route path="deployments" element={<DeploymentsPage />} />
              <Route path="deployments/:id" element={<DeploymentDetailPage />} />
              <Route path="operations" element={<OperationsPage />} />
              <Route path="assistant" element={<AssistantPage />} />
              <Route path="incidents" element={<IncidentsPage />} />
              <Route path="incidents/:id" element={<IncidentDetailPage />} />
              <Route path="monitoring" element={<MonitoringPage />} />
              <Route path="logs" element={<LogsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="connections" element={<ConnectionsPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}
describe('phase 3 workspace interactions (DOM, no browser rendering)', () => {
  it('completes overview → project → deployment → history → overview without external operations', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(screen.getByRole('link', { name: /nova-store فروشگاه نُوا/ }));
    expect(await screen.findByRole('heading', { name: 'nova-store' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'دیپلوی‌ها' }));
    await user.click(screen.getByText('بهبود صفحه محصول و سبد خرید').closest('a')!);
    expect(await screen.findByRole('heading', { name: 'انتشار فروشگاه نُوا' })).toBeInTheDocument();
    expect(screen.getByText('نتیجه ثبت‌شده در داده ثابت؛ اجرای زنده نیست.')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'تاریخچه عملیات' }));
    expect(await screen.findByRole('heading', { name: 'تاریخچه عملیات' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'نمای کلی' }));
    expect(await screen.findByRole('heading', { name: /سلام دوست من/ })).toBeInTheDocument();
    expect(requests.filter((request) => request.method !== 'GET')).toEqual([]);
    expect(requests.some((request) => /liara|github|chat/.test(request.path))).toBe(false);
  });
  it('filters all project views through the global project selector and shows an honest empty state', async () => {
    const user = userEvent.setup();
    renderWorkspace('/demo/projects');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'انتخاب پروژه سراسری' }),
      'demo-api',
    );
    expect(screen.getByRole('link', { name: /atlas-api سرویس اطلس/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /nova-store فروشگاه/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'سالم' }));
    expect(
      screen.getByRole('heading', { name: 'پروژه‌ای با این فیلتر پیدا نشد.' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'پاک کردن فیلترها' }));
    expect(screen.getByRole('link', { name: /atlas-api سرویس اطلس/ })).toBeInTheDocument();
  });
  it('answers a scenario, links only to available evidence, and opens the incident detail', async () => {
    const user = userEvent.setup();
    renderWorkspace('/demo/assistant');
    expect(screen.getByText(/پاسخ‌ها از سناریوی ثابت می‌آیند/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'خطای اطلس را بررسی کنیم' }));
    const action = await screen.findByRole(
      'link',
      { name: 'باز کردن رخداد و شواهد' },
      { timeout: 3000 },
    );
    await user.click(action);
    expect(
      await screen.findByRole('heading', { name: 'اختلال در ارتباط با دیتابیس' }),
    ).toBeInTheDocument();
    expect(screen.getByText('چه چیزی هنوز نمی‌دانیم؟')).toBeInTheDocument();
    const evidence = document.getElementById('evidence-log-1');
    expect(evidence).not.toBeNull();
    expect(
      within(evidence!).getByText('Error: connect ECONNREFUSED database:5432'),
    ).toBeInTheDocument();
    expect(requests.filter((request) => request.method !== 'GET')).toHaveLength(0);
  });
  it('opens accessible command search and restores focus after the mobile dialog closes', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(screen.getByRole('button', { name: 'جستجو در فضای کار' }));
    const search = screen.getByRole('dialog', { name: 'کجا می‌خواهید بروید؟' });
    await user.type(within(search).getByRole('textbox', { name: 'عبارت جستجو' }), 'اطلس');
    await user.click(within(search).getByRole('link', { name: /سرویس اطلس/ }));
    expect(await screen.findByRole('heading', { name: 'atlas-api' })).toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'باز کردن منو' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'منوی اصلی' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'منوی اصلی' })).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });
  it('switches and persists light, dark and system themes using the settings controls', async () => {
    const user = userEvent.setup();
    renderWorkspace('/demo/settings');
    const group = screen.getByRole('group', { name: 'تنظیم تم' });
    await user.click(within(group).getByRole('button', { name: 'روشن' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('liarapilot-theme')).toBe('light');
    await user.click(within(group).getByRole('button', { name: 'تاریک' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(within(group).getByRole('button', { name: 'هماهنگ با سیستم' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('liarapilot-theme')).toBe('system');
  });
  it('keeps personal and demo data separate when changing environments', async () => {
    privateMode = true;
    const user = userEvent.setup();
    renderWorkspace('/workspace', false);
    await user.click(await screen.findByRole('button', { name: 'ورود به محیط دمو' }));
    expect(screen.getByRole('link', { name: /nova-store فروشگاه نُوا/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تغییر محیط' }));
    const dialog = screen.getByRole('dialog', { name: 'فضای کاری خود را انتخاب کنید' });
    await user.click(within(dialog).getByText('حساب شخصی', { exact: true }).closest('button')!);
    expect(await screen.findByRole('button', { name: 'ورود به محیط دمو' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /nova-store فروشگاه نُوا/ })).not.toBeInTheDocument();
    expect(requests.filter((request) => request.method !== 'GET')).toEqual([]);
  });
  it('creates a personal project with only validated name, then navigates to its details', async () => {
    privateMode = true;
    const user = userEvent.setup();
    renderWorkspace('/workspace/projects', false);
    await user.click(await screen.findByRole('button', { name: 'پروژه جدید' }));
    const dialog = screen.getByRole('dialog', { name: 'یک پروژه تازه بسازید' });
    const submit = within(dialog).getByRole('button', { name: 'ساخت پروژه' });
    await user.click(submit);
    expect(within(dialog).getByText('نام پروژه باید دست‌کم ۲ نویسه باشد.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('نام پروژه'), 'پروژه تازه من');
    await user.click(submit);
    expect(await screen.findByRole('heading', { name: 'پروژه تازه من' })).toBeInTheDocument();
    expect(
      requests
        .filter((request) => request.method === 'POST')
        .map((request) => JSON.parse(request.body!)),
    ).toEqual([{ name: 'پروژه تازه من' }]);
  });
  it('displays a retriable personal API error and rejects unknown demo detail ids', async () => {
    privateMode = true;
    projectsFail = true;
    const user = userEvent.setup();
    renderWorkspace('/workspace/projects', false);
    expect(await screen.findByRole('alert')).toHaveTextContent('دریافت پروژه‌ها ناموفق بود.');
    projectsFail = false;
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }));
    expect(
      await screen.findByRole('heading', { name: 'اولین پروژه شما از اینجا شروع می‌شود.' }),
    ).toBeInTheDocument();
    cleanup();
    renderWorkspace('/demo/incidents/missing');
    expect(
      await screen.findByRole('heading', { name: 'رخداد نمونه پیدا نشد.' }),
    ).toBeInTheDocument();
  });
  it('preserves existing phase 2 operation links by redirecting them to the personal foundation page', async () => {
    privateMode = true;
    renderWorkspace('/workspace?operation=33333333-3333-4333-8333-333333333333', false);
    expect(await screen.findByText('ابزار واقعی بخش زیرساخت')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'نتیجه بررسی زیرساخت' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /nova-store فروشگاه/ })).not.toBeInTheDocument();
  });
  it('starts a navigation prompt once under StrictMode and supports cancelling a later reply', async () => {
    const user = userEvent.setup();
    renderWorkspace('/demo/assistant', true, 'پروژه را منتشر کن');
    expect(
      await screen.findByRole('link', { name: 'مشاهده انتشار نمونه' }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('پروژه را منتشر کن')).toHaveLength(1);
    await user.type(screen.getByRole('textbox', { name: 'پیام به پایلوت' }), 'خطای اطلس');
    await user.click(screen.getByRole('button', { name: 'ارسال پیام' }));
    await user.click(screen.getByRole('button', { name: 'توقف پاسخ نمایشی' }));
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(screen.queryByRole('link', { name: 'باز کردن رخداد و شواهد' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ارسال پیام' })).toBeInTheDocument();
  });
  it('connects through a dedicated sensitive form, clears failed tokens and reads real-source pages without demo data', async () => {
    privateMode = true;
    connectionFails = true;
    const user = userEvent.setup();
    renderWorkspace('/workspace/connections', false);
    await user.click(await screen.findByRole('button', { name: 'اتصال امن حساب لیارا' }));
    const dialog = screen.getByRole('dialog', { name: 'اتصال امن به حساب لیارا' });
    const input = within(dialog).getByLabelText('توکن دسترسی لیارا');
    await user.type(input, 'test-token-not-real-12345');
    await user.click(within(dialog).getByRole('button', { name: 'اعتبارسنجی و اتصال' }));
    expect(await within(dialog).findByText('اعتبار توکن لیارا را بررسی کنید.')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(
      JSON.stringify(
        clients
          .at(-1)!
          .getMutationCache()
          .getAll()
          .map((mutation) => mutation.state.variables),
      ),
    ).not.toContain('test-token-not-real-12345');
    expect(JSON.stringify(localStorage)).not.toContain('test-token-not-real-12345');
    connectionFails = false;
    await user.type(input, 'test-token-not-real-12345');
    await user.click(within(dialog).getByRole('button', { name: 'اعتبارسنجی و اتصال' }));
    const open = await screen.findByRole('button', { name: 'دیدن سرویس‌ها' });
    await user.click(open);
    expect(await screen.findByRole('heading', { name: 'سرویس‌های لیارا' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /actual-app/ }));
    expect(await screen.findByRole('heading', { name: 'actual-app' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'لاگ‌ها' }));
    expect(await screen.findByText('provider log: [REDACTED]')).toBeInTheDocument();
    expect(screen.queryByText('nova-store')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'اتصال‌ها' }));
    await user.click(await screen.findByRole('button', { name: 'قطع اتصال حساب لیارای من' }));
    const confirm = screen.getByRole('dialog', { name: 'اتصال این حساب قطع شود؟' });
    await user.click(within(confirm).getByRole('button', { name: 'قطع اتصال و حذف توکن' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'دیدن سرویس‌ها' })).not.toBeInTheDocument(),
    );
    expect(
      requests.some((request) => request.path.endsWith('/disconnect') && request.method === 'POST'),
    ).toBe(true);
  });
  it('filters logs without pretending to stream or permitting an empty export', async () => {
    const user = userEvent.setup();
    renderWorkspace('/demo/logs');
    await user.selectOptions(screen.getByRole('combobox', { name: 'سطح لاگ' }), 'error');
    expect(screen.getByText('Error: connect ECONNREFUSED database:5432')).toBeInTheDocument();
    expect(screen.queryByText('Ready on port 3000 — release a7f2c91')).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'جستجو در لاگ‌ها' }), 'no-matching-log');
    expect(
      screen.getByRole('heading', { name: 'لاگی با این فیلتر پیدا نشد.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'دریافت لاگ‌های دمو' })).toBeDisabled();
  });
});

it('locks the outer viewport only while the personal assistant route is mounted', async () => {
  privateMode = true;
  const view = renderWorkspace('/workspace/assistant', false);
  await waitFor(() => expect(document.querySelector('.assistant-focus-shell')).toBeInTheDocument());
  expect(document.documentElement).toHaveClass('chat-viewport');
  view.unmount();
  expect(document.documentElement).not.toHaveClass('chat-viewport');
});
