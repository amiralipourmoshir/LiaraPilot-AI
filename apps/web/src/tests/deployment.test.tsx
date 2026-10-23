// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, cleanup, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkspaceContext } from '../lib/workspace';
import { LiveDeploymentsPage, LiveDeploymentDetailPage } from '../pages/live-deployments';
const user = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'تست',
  email: 'deploy-ui@example.test',
};
const appId = '22222222-2222-4222-8222-222222222222',
  id = '33333333-3333-4333-8333-333333333333',
  connectionId = '44444444-4444-4444-8444-444444444444';
const now = new Date().toISOString();
const snapshot = {
  policyVersion: 'existing-node-v1',
  mode: 'LIVE',
  applicationId: appId,
  applicationName: 'my-node-app',
  connectionId,
  credentialVersion: 1,
  providerId: 'p1',
  planId: 'current-plan',
  repository: {
    owner: 'owner',
    repo: 'repo',
    commit: 'a'.repeat(40),
    files: [{ path: 'package.json', sha: 'b'.repeat(40), size: 100 }],
    excluded: [],
    framework: 'express',
    start: 'node server.js',
    blockers: [] as string[],
    evidence: [{ path: 'package.json', finding: 'وابستگی Express شناسایی شد.' }],
  },
  port: 3000,
  healthPath: '/health',
  expectedText: 'healthy',
  expiresAt: new Date(Date.now() + 600000).toISOString(),
};
let state = 'PLANNED';
let decisions = 0;
const record = () => ({
  id,
  state,
  hash: 'c'.repeat(64),
  snapshot,
  errorCode: null,
  sourceId: null,
  releaseId: null,
  createdAt: now,
  expiresAt: snapshot.expiresAt,
  events: [{ sequence: 1, message: 'طرح commit ثابت آماده است.', createdAt: now }],
});
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('PointerEvent', MouseEvent);
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  state = 'PLANNED';
  decisions = 0;
  snapshot.repository.blockers = [];
  sessionStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).split('/api/v1')[1];
      if (path === '/auth/session') return Response.json({ user, csrfToken: 'test-csrf' });
      if (path === '/github/status')
        return Response.json({
          configured: false,
          connected: false,
          login: null,
          setupUrl: 'https://github.com/settings/applications/new',
        });
      if (path === '/repositories/branches')
        return Response.json({
          repositoryUrl: 'https://github.com/owner/repo',
          defaultBranch: 'main',
          private: false,
          branches: ['main', 'develop'],
          hasMore: false,
        });
      if (path === '/repositories/inspections')
        return Response.json({
          id,
          state: 'SUCCEEDED',
          events: [{ message: 'بررسی فایل‌ها تکمیل شد', createdAt: now }],
          error: null,
          result: {
            id,
            repositoryUrl: 'https://github.com/owner/repo',
            branch: 'develop',
            manifest: {
              ...snapshot.repository,
              analysis: {
                platform: 'node',
                install: 'npm ci',
                build: null,
                port: 3000,
                healthPath: '/health',
                expectedText: 'healthy',
                outputDir: null,
                root: '',
                environmentNames: [],
                databases: [],
                minRamGb: 0.5,
                confidence: 'high',
              },
            },
            expiresAt: snapshot.expiresAt,
          },
        });
      if (path === '/connections/liara')
        return Response.json({
          configured: true,
          connections: [
            {
              id: connectionId,
              label: 'حساب من',
              provider: 'LIARA',
              mode: 'LIVE',
              status: 'CONNECTED',
              teamId: null,
              validatedAt: now,
              syncedAt: now,
              lastErrorCode: null,
              createdAt: now,
              applicationCount: 1,
            },
          ],
        });
      if (path === `/repositories/${id}/resource-advice`) {
        const body = JSON.parse(init?.body as string);
        return Response.json(
          body.answers.length
            ? {
                question: '',
                options: [],
                planKey: 'g2-test|free',
                explanation: 'این پلن برای پروژه شخصی شما نقطه شروع مناسبی است.',
              }
            : {
                question: 'پروژه چه کاربردی دارد؟',
                options: ['شخصی', 'کاری'],
                planKey: '',
                explanation: 'با توجه به کاربرد، منابع را پیشنهاد می‌دهم.',
              },
        );
      }
      if (path?.startsWith('/repositories/' + id + '/options'))
        return Response.json({
          connectionId,
          connectionLabel: 'حساب من',
          plans: [
            {
              id: 'g2-test',
              bundleId: 'free',
              name: 'پلن آزمایشی',
              ramGb: 1,
              cpu: 1,
              diskGb: 10,
              estimatedMonthlyToman: 72000,
              recommended: true,
            },
          ],
          networks: [{ id: 'network1', name: 'شبکه حساب' }],
          applications: [{ id: appId, name: 'my-node-app', platform: 'node' }],
          fetchedAt: now,
        });
      if (path === '/deployments/guided') {
        const body = JSON.parse(init?.body as string);
        expect(body).toMatchObject({
          analysisId: id,
          connectionId,
          target: 'new',
          planId: 'g2-test',
          bundleId: 'free',
          networkId: 'network1',
        });
        expect(body).not.toHaveProperty('port');
        expect(body).not.toHaveProperty('healthPath');
        return Response.json(record(), { status: 201 });
      }

      if (path === '/applications')
        return Response.json({
          applications: [
            {
              id: appId,
              connectionId,
              mode: 'LIVE',
              providerId: 'p1',
              name: 'my-node-app',
              platform: 'node',
              status: 'Running',
              scale: 1,
              isDeployed: true,
              planId: 'current-plan',
              lastSeenAt: now,
              providerMissing: false,
              connectionLabel: 'حساب من',
            },
          ],
        });
      if (path === '/deployments' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        expect(body.repositoryUrl).toBe('https://github.com/owner/repo');
        return Response.json(record(), { status: 201 });
      }
      if (path === '/deployments') return Response.json({ deployments: [] });
      if (path === `/deployments/${id}/decision`) {
        expect(JSON.parse(init?.body as string)).toEqual({
          hash: 'c'.repeat(64),
          decision: 'approve',
        });
        decisions++;
        state = 'QUEUED';
        return Response.json(record());
      }
      if (path === `/deployments/${id}`) return Response.json(record());
      throw new Error('Unexpected request');
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(path = '/workspace/deployments') {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <WorkspaceContext.Provider
          value={{ base: '/workspace', mode: 'LIVE', preview: false, user }}
        >
          <Routes>
            <Route path="/workspace/deployments" element={<LiveDeploymentsPage />} />
            <Route path="/workspace/deployments/:id" element={<LiveDeploymentDetailPage />} />
          </Routes>
        </WorkspaceContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('builds a plan from the form and requires consent before queueing the exact snapshot', async () => {
  const u = userEvent.setup();
  mount();
  await u.click(screen.getByRole('button', { name: 'پروژه جدید' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).queryByLabelText('پورت برنامه')).not.toBeInTheDocument();
  expect(within(dialog).getAllByRole('textbox')).toHaveLength(1);
  await u.type(within(dialog).getByLabelText('لینک مخزن GitHub'), 'https://github.com/owner/repo');
  await u.click(within(dialog).getByRole('button', { name: 'ادامه' }));
  await u.click(await screen.findByRole('combobox', { name: 'شاخه پروژه' }));
  await u.click(screen.getByRole('option', { name: 'develop' }));
  await u.click(screen.getByRole('button', { name: 'بررسی پروژه' }));
  await screen.findByText('پروژه‌ات را بررسی کردم.');
  await u.click(await screen.findByLabelText('شخصی'));
  await u.click(screen.getByRole('button', { name: 'ثبت پاسخ و ادامه' }));
  await u.click(await screen.findByRole('button', { name: 'این پیشنهاد را در جدول انتخاب کن' }));

  await u.click(await screen.findByRole('button', { name: 'دیدن طرح نهایی و تأیید' }));
  await u.click(await screen.findByRole('button', { name: 'بازبینی و تأیید انتشار' }));
  const approve = screen.getByRole('button', { name: 'تأیید و شروع انتشار' });
  expect(approve).toBeDisabled();
  await u.click(screen.getByRole('checkbox'));
  await u.click(approve);
  expect(await screen.findByText('در صف')).toBeVisible();
  expect(decisions).toBe(1);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
it('shows repository blockers and prevents approval', async () => {
  snapshot.repository.blockers = ['scripts.start در package.json وجود ندارد.'];
  mount(`/workspace/deployments/${id}`);
  expect(await screen.findByText('scripts.start در package.json وجود ندارد.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'بازبینی و تأیید انتشار' })).toBeDisabled();
  expect(decisions).toBe(0);
});
