// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ChatMarkdown } from '../components/chat-markdown';
afterEach(() => cleanup());
it('renders Persian headings, emphasis, lists, quotes, GFM tables and highlighted code as semantic HTML', () => {
  const { container } = render(
    <ChatMarkdown
      content={
        '# بررسی سرویس\n\nوضعیت **مهم** و `PORT` را ببینید.\n\n- مورد اول\n- مورد دوم\n\n> نتیجه اولیه است.\n\n| مورد | مقدار |\n| --- | --- |\n| پورت | 3000 |\n\n```javascript\nconst port = 3000;\n```'
      }
    />,
  );
  expect(screen.getByRole('heading', { level: 2, name: 'بررسی سرویس' })).toBeVisible();
  expect(screen.getByText('مهم').tagName).toBe('STRONG');
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(container.querySelector('blockquote')).toHaveTextContent('نتیجه اولیه است.');
  expect(screen.getByRole('table')).toHaveTextContent('3000');
  expect(screen.getByRole('region', { name: 'جدول پاسخ' })).toHaveAttribute('tabindex', '0');
  expect(screen.getByLabelText('قطعه کد')).toHaveAttribute('dir', 'ltr');
  expect(container.querySelector('.hljs-keyword')).toHaveTextContent('const');
});
it('copies original source text without syntax markup', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(<ChatMarkdown content={'```js\nconst label = "سلام";\n```'} />);
  fireEvent.click(screen.getByRole('button', { name: 'کپی کد' }));
  expect(await screen.findByText('کپی شد')).toBeVisible();
  expect(writeText).toHaveBeenCalledWith('const label = "سلام";');
});
it('rejects executable HTML and unsafe links and never loads remote tracking images', () => {
  const { container } = render(
    <ChatMarkdown
      content={
        '<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n[bad](javascript:alert%281%29)\n\n![تصویر](https://tracker.example/pixel)\n\n[راهنما](https://docs.liara.ir)'
      }
    />,
  );
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  expect(screen.getByText('bad').tagName).toBe('SPAN');
  expect(screen.getByRole('link', { name: 'راهنما' })).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  );
});
it('keeps unknown-language code readable and reports clipboard failure', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) },
  });
  render(<ChatMarkdown content={'```unknown-language\n<example>literal</example>\n```'} />);
  expect(screen.getByLabelText('قطعه کد')).toHaveTextContent('<example>literal</example>');
  fireEvent.click(screen.getByRole('button', { name: 'کپی کد' }));
  expect(await screen.findByRole('status')).toHaveTextContent('کپی ممکن نشد');
});
