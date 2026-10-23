// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { DeploymentTerminal } from '../components/deployment-terminal';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('appends real build lines without duplicates, treats output as text and supports expansion', async () => {
  let calls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      calls++;
      return Response.json(
        calls === 1
          ? {
              state: 'DEPLOYING',
              cursor: '2',
              lines: [{ at: '1', text: 'Installing symfony/mime' }],
            }
          : calls === 2
            ? {
                state: 'READY',
                cursor: '3',
                lines: [
                  { at: '1', text: 'Installing symfony/mime' },
                  { at: '2', text: '<img src=x onerror=alert(1)>' },
                ],
              }
            : { state: 'READY', cursor: '3', lines: [] },
      );
    }),
  );
  const { container } = render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DeploymentTerminal id="fixture" active={false} />
    </QueryClientProvider>,
  );
  await screen.findByText('<img src=x onerror=alert(1)>');
  expect(screen.getAllByText('Installing symfony/mime')).toHaveLength(1);
  expect(container.querySelector('img')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'بزرگ‌کردن ترمینال' }));
  expect(screen.getByRole('region', { name: 'ترمینال زنده ساخت' })).toHaveClass(
    'terminal-expanded',
  );
  await waitFor(() => expect(calls).toBe(3));
});
