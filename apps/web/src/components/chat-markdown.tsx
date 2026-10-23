import { memo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';

type TextNode = { type: string; value?: unknown; children?: readonly TextNode[] };
function sourceText(node: TextNode): string {
  return typeof node.value === 'string'
    ? node.value
    : (node.children?.map(sourceText).join('') ?? '');
}
function CodeBlock({
  children,
  source,
  language,
}: {
  children: ReactNode;
  source: string;
  language: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(source.replace(/\n$/, ''));
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }
  return (
    <figure className="chat-code-block">
      <figcaption>
        <span dir="ltr">{language || 'code'}</span>
        <button type="button" onClick={() => void copy()} aria-label="کپی کد">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'کپی شد' : 'کپی کد'}
        </button>
      </figcaption>
      <pre dir="ltr" tabIndex={0} aria-label="قطعه کد">
        {children}
      </pre>
      {failed && (
        <span role="status" className="chat-copy-error">
          کپی ممکن نشد؛ کد را انتخاب و کپی کنید.
        </span>
      )}
    </figure>
  );
}
export const ChatMarkdown = memo(function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className="chat-markdown" dir="auto">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        skipHtml
        components={{
          h1: ({ children }) => <h2>{children}</h2>,
          h2: ({ children }) => <h3>{children}</h3>,
          h3: ({ children }) => <h4>{children}</h4>,
          pre: ({ node, children }) => {
            const code = node?.children.find(
              (child) => child.type === 'element' && child.tagName === 'code',
            );
            const classes = code?.type === 'element' ? code.properties.className : [];
            const language = Array.isArray(classes)
              ? (classes
                  .find((name) => typeof name === 'string' && name.startsWith('language-'))
                  ?.toString()
                  .slice(9) ?? '')
              : '';
            return (
              <CodeBlock source={node ? sourceText(node) : ''} language={language}>
                {children}
              </CodeBlock>
            );
          },
          table: ({ children }) => (
            <div className="chat-markdown-table" role="region" aria-label="جدول پاسخ" tabIndex={0}>
              <table>{children}</table>
            </div>
          ),
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => (
            <span className="chat-image-caption">{alt ? `[تصویر: ${alt}]` : '[تصویر]'}</span>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
});
