// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { EnvironmentUpload } from '../components/environment-upload';
afterEach(cleanup);
it('uploads a dotenv file and displays names without revealing values', async () => {
  const change = vi.fn(),
    file = new File(['APP_KEY=private-123\nDB_PASSWORD=secret-456'], '.env', {
      type: 'text/plain',
    });
  Object.defineProperty(file, 'text', {
    value: async () => 'APP_KEY=private-123\nDB_PASSWORD=secret-456',
  });
  const { rerender } = render(
    <EnvironmentUpload value={{}} onChange={change} required={['APP_KEY']} />,
  );
  await userEvent.upload(screen.getByLabelText('آپلود فایل تنظیمات'), file);
  expect(change).toHaveBeenCalledWith({ APP_KEY: 'private-123', DB_PASSWORD: 'secret-456' });
  rerender(
    <EnvironmentUpload value={change.mock.calls[0]![0]} onChange={change} required={['APP_KEY']} />,
  );
  expect(screen.getByText('DB_PASSWORD')).toBeInTheDocument();
  expect(screen.queryByText('secret-456')).not.toBeInTheDocument();
  expect(document.querySelector('input[type="password"]')).toBeNull();
});
