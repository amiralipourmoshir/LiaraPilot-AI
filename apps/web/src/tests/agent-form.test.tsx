// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { AgentForm } from '../components/agent-form';
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('PointerEvent', MouseEvent);
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});
afterEach(cleanup);
it('collects different question types and sends only user-selected values', async () => {
  const submit = vi.fn(async () => {}),
    u = userEvent.setup();
  render(
    <AgentForm
      fields={[
        { name: 'name', type: 'text', label: 'نام', required: true },
        {
          name: 'plan',
          type: 'select',
          label: 'کاربرد',
          required: true,
          options: [
            { value: 'work', label: 'کاری' },
            { value: 'personal', label: 'شخصی' },
          ],
        },
        { name: 'consent', type: 'checkbox', label: 'تأیید انتخاب', required: true },
        { name: 'notes', type: 'textarea', label: 'توضیح' },
        {
          name: 'features',
          type: 'multiselect',
          label: 'قابلیت‌ها',
          options: [
            { value: 'web', label: 'وب' },
            { value: 'mobile', label: 'موبایل' },
          ],
        },
      ]}
      onSubmit={submit}
    />,
  );
  await u.type(screen.getByLabelText('نام *'), 'پروژه من');
  await u.click(screen.getByRole('combobox', { name: 'کاربرد' }));
  await u.click(screen.getByRole('option', { name: 'کاری' }));
  await u.click(screen.getByLabelText('تأیید انتخاب'));
  await u.type(screen.getByLabelText('توضیح'), 'نسخه آزمایشی');
  await u.click(screen.getByLabelText('وب'));
  await u.click(screen.getByRole('button', { name: 'ثبت پاسخ و ادامه' }));
  expect(submit).toHaveBeenCalledWith({
    name: 'پروژه من',
    plan: 'work',
    consent: true,
    notes: 'نسخه آزمایشی',
    features: ['web'],
  });
});
