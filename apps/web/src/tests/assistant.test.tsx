// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkspaceContext } from '../lib/workspace';
import { LiveAssistantPage } from '../pages/live-assistant';
const user = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'کاربر',
  email: 'assistant-ui@example.test',
};
const id = '22222222-2222-4222-8222-222222222222';
const planId = '33333333-3333-4333-8333-333333333333';
const applicationId = '44444444-4444-4444-8444-444444444444';
const evidenceId = '55555555-5555-4555-8555-555555555555';
const now = new Date().toISOString();
let configured = true;
let decisionCalls = 0;
const snapshot = {
  policyVersion: 'read-inspection-v1',
  tool: 'inspect_application',
  applicationId,
  applicationName: 'my-service',
  connectionId: '66666666-6666-4666-8666-666666666666',
  credentialVersion: 1,
  includeLogs: true,
  since: now,
  expiresAt: new Date(Date.now() + 600000).toISOString(),
  mode: 'LIVE',
  sharesWithModel: true,
  model: 'openai/gpt-6.1-sol',
  modelHost: 'model.example',
  modelConfigHash: 'b'.repeat(64),
};
const plan = {
  id: planId,
  hash: 'a'.repeat(64),
  state: 'PENDING',
  snapshot,
  createdAt: now,
  errorCode: null,
  evidence: [] as unknown[],
};
let conversation: {
  id: string;
  title: string;
  updatedAt: string;
  busy: boolean;
  model?: string;
  messages: unknown[];
  plans: unknown[];
};
beforeEach(() => {
  configured = true;
  decisionCalls = 0;
  conversation = {
    id,
    title: 'گفتگوی آزمایشی',
    updatedAt: now,
    busy: false,
    messages: [],
    plans: [],
  };
  vi.stubGlobal(
    'matchMedia',
    vi
      .fn()
      .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('PointerEvent', MouseEvent);
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).split('/api/v1')[1];
      if (path === '/auth/session') return Response.json({ user, csrfToken: 'test-csrf' });
      if (path === '/assistant/config')
        return Response.json({
          configured,
          model: configured ? 'openai/gpt-6.1-sol' : null,
          models: [
            { id: 'openai/gpt-6.1-sol', label: 'GPT-6.1 Sol', description: 'متعادل' },
            { id: 'openai/gpt-6-luna', label: 'GPT-6 Luna', description: 'روزمره' },
            { id: 'openai/gpt-6-astra', label: 'GPT-6 Astra', description: 'عمیق' },
          ],
          providerHost: 'model.example',
          apiStyle: 'responses',
          tools: ['inspect_application'],
        });
      if (path === '/applications') return Response.json({ applications: [] });
      if (path === '/conversations' && init?.method === 'POST')
        return Response.json(conversation, { status: 201 });
      if (path === '/conversations')
        return Response.json({
          conversations: conversation.messages.length
            ? [{ id, title: conversation.title, updatedAt: now }]
            : [],
        });
      if (path === `/conversations/${id}/messages`) {
        const body = JSON.parse(init?.body as string);
        conversation.model = body.model;
        expect(init?.headers).toHaveProperty('idempotency-key');
        conversation.messages = [
          {
            id: '77777777-7777-4777-8777-777777777777',
            role: 'USER',
            content: body.content,
            createdAt: now,
            diagnosis: null,
          },
          {
            id: '88888888-8888-4888-8888-888888888888',
            role: 'ASSISTANT',
            content: 'طرح آماده است.',
            createdAt: now,
            diagnosis: null,
          },
        ];
        conversation.plans = [plan];
        return Response.json(conversation);
      }
      if (path === `/conversations/${id}/plans/${planId}/decision`) {
        decisionCalls++;
        expect(JSON.parse(init?.body as string)).toEqual({ hash: plan.hash, decision: 'approve' });
        conversation.plans = [
          {
            ...plan,
            state: 'SUCCEEDED',
            evidence: [
              {
                id: evidenceId,
                source: 'LIARA',
                tool: 'get_application',
                collectedAt: now,
                data: { name: 'my-service' },
              },
            ],
          },
        ];
        conversation.messages.push({
          id: '99999999-9999-4999-8999-999999999999',
          role: 'ASSISTANT',
          content: 'علت قطعی هنوز مشخص نیست.',
          createdAt: now,
          diagnosis: {
            summary: 'علت قطعی هنوز مشخص نیست.',
            facts: [{ text: 'اطلاعات سرویس دریافت شد.', evidenceIds: [evidenceId] }],
            hypotheses: [],
            missingEvidence: ['پاسخ HTTP موجود نیست.'],
            recommendations: ['شواهد بیشتر جمع کنید.'],
          },
        });
        return Response.json(conversation);
      }
      if (path === `/conversations/${id}`) return Response.json(conversation);
      throw new Error(`Unexpected path ${path}`);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(path = '/workspace/assistant') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <WorkspaceContext.Provider
            value={{ base: '/workspace', preview: false, mode: 'LIVE', user }}
          >
            <LiveAssistantPage />
          </WorkspaceContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}
it('shows an honest missing-model state and disables the composer', async () => {
  configured = false;
  mount();
  expect(await screen.findByText('پایلوت آماده اتصال به مدل است')).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'پیام به پایلوت' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'ارسال پیام' })).toBeDisabled();
});
it('persists a conversation, requires explicit consent, submits the exact plan hash and restores evidence after remount', async () => {
  const user = userEvent.setup();
  const view = mount();
  const field = screen.getByRole('textbox', { name: 'پیام به پایلوت' });
  await waitFor(() => expect(field).toBeEnabled());
  await user.type(field, 'این سرویس را بررسی کن');
  await user.click(screen.getByRole('button', { name: 'ارسال پیام' }));
  await user.click(await screen.findByRole('button', { name: 'بازبینی و تصمیم' }));
  const dialog = screen.getByRole('dialog');
  const approve = within(dialog).getByRole('button', { name: 'تأیید و شروع بررسی' });
  expect(approve).toBeDisabled();
  expect(within(dialog).getByText(/حداکثر ۳۰ خط لاگ/)).toBeVisible();
  await user.click(within(dialog).getByRole('checkbox'));
  await user.click(approve);
  expect(await screen.findByText('مشاهدات مستند')).toBeVisible();
  expect(decisionCalls).toBe(1);
  expect(screen.getByText('بررسی ثبت شد')).toBeVisible();
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  view.unmount();
  mount(`/workspace/assistant?conversation=${id}`);
  expect(await screen.findByText('اطلاعات سرویس دریافت شد.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'بازبینی و تصمیم' })).not.toBeInTheDocument();
  expect(decisionCalls).toBe(1);
});

it('offers the three requested models and sends the user selection', async () => {
  const user = userEvent.setup();
  mount();
  const picker = await screen.findByRole('combobox', { name: 'انتخاب مدل گفتگو' });
  await waitFor(() => expect(picker).toHaveTextContent('GPT-6.1 Sol'));
  await user.click(picker);
  const options = await screen.findAllByRole('option');
  expect(options).toHaveLength(3);
  options.forEach((option) => expect(option.querySelector('.chatgpt-mark')).toBeInTheDocument());
  await user.click(screen.getByRole('option', { name: /GPT-6 Luna/ }));
  expect(picker).toHaveTextContent('GPT-6 Luna');
  const field = screen.getByRole('textbox', { name: 'پیام به پایلوت' });
  await user.type(field, 'سلام');
  await user.click(screen.getByRole('button', { name: 'ارسال پیام' }));
  await screen.findByText('طرح آماده است.');
  expect(conversation.model).toBe('openai/gpt-6-luna');
});

it('updates only the chat scroll position when messages arrive', async () => {
  const user = userEvent.setup();
  mount();
  const field = screen.getByRole('textbox', { name: 'پیام به پایلوت' });
  await waitFor(() => expect(field).toBeEnabled());
  const log = screen.getByRole('log', { name: 'گفتگوی شخصی' });
  Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 1200 });
  await user.type(field, 'سلام');
  await user.click(screen.getByRole('button', { name: 'ارسال پیام' }));
  await screen.findByText('طرح آماده است.');
  expect(log.scrollTop).toBe(1200);
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
});

it('opens deployment inside chat without routing to a deployment page', async () => {
  const u = userEvent.setup();
  mount();
  const field = screen.getByRole('textbox', { name: 'پیام به پایلوت' });
  await waitFor(() => expect(field).toBeEnabled());
  await u.type(field, 'این پروژه رو دیپلوی کن https://github.com/owner/repo');
  await u.click(screen.getByRole('button', { name: 'ارسال پیام' }));
  const dialog = await screen.findByRole('dialog', { name: 'با پایلوت، پروژه‌ات را آنلاین کن' });
  expect(within(dialog).getByRole('textbox', { name: 'لینک مخزن GitHub' })).toHaveValue(
    'https://github.com/owner/repo',
  );
  expect(
    within(dialog).queryByRole('link', { name: 'بازبینی طرح انتشار' }),
  ).not.toBeInTheDocument();
});
