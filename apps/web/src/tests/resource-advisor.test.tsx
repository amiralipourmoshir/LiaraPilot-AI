import { MemoryRouter } from 'react-router';
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { ResourceAdvisor } from '../components/resource-advisor';
import { api } from '../lib/api';
vi.mock('../lib/session', () => ({ useSession: () => ({ data: { csrfToken: 'test' } }) }));
vi.mock('../lib/api', () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('retries the final recommendation with all three answers and applies the returned plan', async () => {
  let failed = false;
  vi.mocked(api).mockImplementation(async (_path, _schema, options) => {
    const answers = (options?.body as { answers: { question: string; answer: string }[] }).answers;
    if (answers.length === 3) {
      if (!failed) {
        failed = true;
        throw new Error('ارتباط موقتاً قطع شد');
      }
      return {
        question: '',
        options: [],
        planKey: 'small-g2|standard',
        explanation: 'پیشنهاد نهایی آماده است.',
      } as never;
    }
    return {
      question: `پرسش ${answers.length + 1}`,
      options: ['شخصی', 'کاری'],
      planKey: '',
      explanation: 'نیاز شما را بررسی می‌کنیم.',
    } as never;
  });
  const choose = vi.fn(),
    u = userEvent.setup();
  render(
    <MemoryRouter>
      <ResourceAdvisor analysisId="analysis" connectionId="connection" onChoose={choose} />
    </MemoryRouter>,
  );
  for (let i = 0; i < 3; i++) {
    await u.click(await screen.findByLabelText('شخصی'));
    await u.click(screen.getByRole('button', { name: 'ثبت پاسخ و ادامه' }));
  }
  await screen.findByText('ارتباط موقتاً قطع شد');
  await u.click(screen.getByRole('button', { name: 'دوباره بررسی کن' }));
  await u.click(await screen.findByRole('button', { name: 'این پیشنهاد را در جدول انتخاب کن' }));
  expect(choose).toHaveBeenCalledWith('small-g2|standard');
  expect(
    (vi.mocked(api).mock.calls.at(-1)?.[2]?.body as { answers: unknown[] }).answers,
  ).toHaveLength(3);
});
