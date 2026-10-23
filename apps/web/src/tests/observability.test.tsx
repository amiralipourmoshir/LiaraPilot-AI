// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkspaceContext, useWorkspaceUi } from '../lib/workspace';
import {
  LiveMonitoringPage,
  LiveIncidentsPage,
  LiveIncidentDetailPage,
  LiveLogsPage,
  LiveOperationsPage,
} from '../pages/live-observability';
vi.mock('../lib/session', () => ({ useSession: () => ({ data: { csrfToken: 'test-csrf' } }) }));
const app = '22222222-2222-4222-8222-222222222222',
  monitorId = '33333333-3333-4333-8333-333333333333',
  incidentId = '44444444-4444-4444-8444-444444444444',
  actionId = '55555555-5555-4555-8555-555555555555',
  now = new Date().toISOString();
let enabled = true,
  approved = false;
const monitor = () => ({
  id: monitorId,
  applicationId: app,
  name: 'real-api',
  platform: 'node',
  enabled,
  intervalSeconds: 60,
  failureThreshold: 2,
  path: '/',
  lastStatus: 500,
  lastError: 'HTTP_MISMATCH',
  latencyMs: 100,
  lastCheckedAt: now,
  lastSuccessAt: null,
  failureCount: 2,
  samples: [],
});
const incident = () => ({
  id: incidentId,
  monitorId,
  title: 'اختلال real-api',
  state: approved ? 'RESOLVED' : 'OPEN',
  openedAt: now,
  resolvedAt: approved ? now : null,
  diagnosis: null,
});
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  enabled = true;
  approved = false;
  useWorkspaceUi.setState({ selectedProject: 'all' });
  fetchMock = vi.fn(async (input, init) => {
    const url = String(input);
    if (url.includes(`/monitoring/${monitorId}`)) {
      if (init?.method === 'PATCH') enabled = JSON.parse(String(init.body)).enabled;
      return Response.json(monitor());
    }
    if (url.includes('/monitoring'))
      return Response.json({
        monitors: [monitor()],
        incidents: [incident()],
        candidates: [{ applicationId: app, name: 'real-api', platform: 'node' }],
      });
    if (url.includes(`/health-actions/${actionId}/decision`)) {
      expect(JSON.parse(String(init?.body))).toEqual({ hash: 'a'.repeat(64), approve: true });
      approved = true;
      return Response.json({
        id: actionId,
        state: 'COMPLETED',
        hash: 'a'.repeat(64),
        snapshot: {},
        result: { outcome: 'RESOLVED' },
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      });
    }
    if (url.includes(`/incidents/${incidentId}`))
      return Response.json({
        ...incident(),
        monitor: monitor(),
        events: [],
        actions: approved
          ? []
          : [
              {
                id: actionId,
                state: 'PLANNED',
                hash: 'a'.repeat(64),
                snapshot: { kind: 'RECHECK_HEALTH', path: '/' },
                result: null,
                expiresAt: new Date(Date.now() + 600000).toISOString(),
              },
            ],
      });
    if (url.includes('/applications') && !url.includes('/logs'))
      return Response.json({
        applications: [
          {
            id: app,
            connectionId: monitorId,
            mode: 'LIVE',
            providerId: 'provider',
            name: 'real-api',
            platform: 'node',
            status: 'Running',
            scale: 1,
            isDeployed: true,
            planId: 'plan',
            lastSeenAt: now,
            providerMissing: false,
            connectionLabel: 'حساب من',
          },
        ],
      });
    if (url.includes('/logs'))
      return Response.json({
        source: 'LIARA',
        contract: 'CLI_V2',
        fetchedAt: now,
        since: now,
        truncated: false,
        logs: [
          { datetime: now, type: 'stderr', message: 'database connection refused' },
          { datetime: now, type: 'stdout', message: '<img src=x onerror=alert(1)>' },
        ],
      });
    if (url.includes('/history'))
      return Response.json({
        total: 1,
        page: 1,
        items: [
          {
            id: actionId,
            action: 'incident.diagnosed',
            resourceId: incidentId,
            createdAt: now,
            target: `/incidents/${incidentId}`,
          },
        ],
      });
    throw new Error('Unexpected ' + url);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(path: string) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <WorkspaceContext.Provider
          value={{
            base: '/workspace',
            mode: 'LIVE',
            preview: false,
            user: { id: app, name: 'تست', email: 'test@example.test' },
          }}
        >
          <Routes>
            <Route path="/monitoring" element={<LiveMonitoringPage />} />
            <Route path="/incidents" element={<LiveIncidentsPage />} />
            <Route path="/incidents/:id" element={<LiveIncidentDetailPage />} />
            <Route path="/logs" element={<LiveLogsPage />} />
            <Route path="/history" element={<LiveOperationsPage />} />
          </Routes>
        </WorkspaceContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('pauses a real monitor through the API and keeps the incident link', async () => {
  mount('/monitoring');
  await screen.findByText('real-api');
  await userEvent.click(screen.getByRole('button', { name: 'توقف پایش' }));
  await screen.findByRole('button', { name: 'ادامه پایش' });
  expect(screen.getByRole('link', { name: 'مشاهده اختلال و تشخیص پایلوت' })).toHaveAttribute(
    'href',
    `/workspace/incidents/${incidentId}`,
  );
});
it('filters real incidents without substituting demo content', async () => {
  mount('/incidents');
  await screen.findByText('اختلال real-api');
  await userEvent.click(screen.getByRole('button', { name: 'بازیابی‌شده' }));
  expect(screen.queryByText('اختلال real-api')).not.toBeInTheDocument();
  await screen.findByText('رخدادی با این فیلتر ثبت نشده است.');
});
it('requires consent before sending the approved action hash and shows recovery', async () => {
  mount(`/incidents/${incidentId}`);
  const button = await screen.findByRole('button', { name: 'تأیید و بررسی بازیابی' });
  expect(button).toBeDisabled();
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(button);
  await waitFor(() => expect(approved).toBe(true));
  await screen.findByText(/بازیابی تأیید شده/);
});
it('renders actual logs safely and filters by search', async () => {
  mount('/logs');
  await screen.findByText('database connection refused');
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  expect(document.querySelector('img[src="x"]')).toBeNull();
  await userEvent.type(screen.getByLabelText('جستجو در لاگ‌ها'), 'database');
  expect(screen.queryByText('<img src=x onerror=alert(1)>')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'توقف نمایش زنده' }));
  expect(screen.getByRole('button', { name: 'ادامه نمایش زنده' })).toBeInTheDocument();
});
it('shows durable history with a real detail destination', async () => {
  mount('/history');
  await screen.findByText('تشخیص هوش مصنوعی ثبت شد');
  expect(screen.getByRole('link', { name: 'مشاهده جزئیات' })).toHaveAttribute(
    'href',
    `/workspace/incidents/${incidentId}`,
  );
});
