// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { ResourcePicker } from '../components/resource-picker';
import { planOptionSchema } from '../../../../packages/shared/src/wizard';
afterEach(cleanup);
it('preserves the chosen planet across official bundle tabs and displays account prices', async () => {
  const plans = ['basic', 'standard', 'pro'].flatMap((bundleId, index) => [
    planOptionSchema.parse({
      id: 'small-g2',
      bundleId,
      bundleName: ['پایه', 'نقره‌ای', 'طلایی'][index],
      name: 'زمین',
      planet: 'earth',
      ramGb: 0.5,
      cpu: 0.5,
      diskGb: 5,
      estimatedMonthlyToman: 475000 * (index + 1),
      estimatedHourlyToman: 659 * (index + 1),
      recommended: false,
    }),
    planOptionSchema.parse({
      id: 'standard-base-g2',
      bundleId,
      bundleName: ['پایه', 'نقره‌ای', 'طلایی'][index],
      name: 'مشتری',
      planet: 'jupiter',
      ramGb: 2,
      cpu: 1,
      diskGb: 20,
      estimatedMonthlyToman: 1475000 * (index + 1),
      estimatedHourlyToman: 2048 * (index + 1),
      recommended: true,
    }),
  ]);
  function Harness() {
    const [value, setValue] = useState('standard-base-g2|standard');
    return <ResourcePicker plans={plans} value={value} onChange={setValue} />;
  }
  const { container } = render(<Harness />);
  expect(screen.getByRole('tab', { name: 'نقره‌ای' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('button', { name: /مشتری/ })).toHaveAttribute('aria-pressed', 'true');
  expect(container.querySelector('img[src="/plans/jupiter.png"]')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('tab', { name: 'طلایی' }));
  expect(screen.getByRole('tab', { name: 'طلایی' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('button', { name: /مشتری/ })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'زمین' }));
  expect(screen.getByRole('button', { name: 'زمین' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('512 MB')).toBeInTheDocument();
});
