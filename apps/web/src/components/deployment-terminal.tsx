import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Terminal, Maximize2, Minimize2, ArrowDown, Download } from 'lucide-react';
import { buildLogsSchema } from '../../../../packages/shared/src/deployment-live';
import { api } from '../lib/api';
export function DeploymentTerminal({ id, active }: { id: string; active: boolean }) {
  const [cursor, setCursor] = useState('1'),
    [lines, setLines] = useState<{ at: string; text: string }[]>([]),
    [expanded, setExpanded] = useState(false),
    [follow, setFollow] = useState(true);
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setCursor('1');
    setLines([]);
  }, [id]);
  const query = useQuery({
    queryKey: ['deployment-build-logs', id, cursor],
    queryFn: () =>
      api(`/deployments/${id}/build-logs?since=${encodeURIComponent(cursor)}`, buildLogsSchema),
    refetchInterval: (q) =>
      active ||
      (q.state.data?.state &&
        !['READY', 'FAILED', 'CANCELED', 'CANCELLED', 'TIMEDOUT'].includes(q.state.data.state))
        ? 3000
        : false,
    retry: false,
  });
  useEffect(() => {
    if (!query.data) return;
    const data = query.data;
    setLines((old) => {
      const map = new Map(old.map((l) => [`${l.at}\0${l.text}`, l]));
      for (const l of data.lines) map.set(`${l.at}\0${l.text}`, l);
      return [...map.values()].slice(-4000);
    });
    if (data.cursor !== cursor) setCursor(data.cursor);
  }, [query.data]);
  useEffect(() => {
    if (follow && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [lines, follow]);
  const clean = (text: string) =>
    text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  return (
    <section
      className={`deployment-terminal ${expanded ? 'terminal-expanded' : ''}`}
      aria-label="ترمینال زنده ساخت"
    >
      <header>
        <span>
          <Terminal size={18} /> لاگ‌های زنده ساخت <i className={active ? 'terminal-live' : ''} />
        </span>
        <div>
          <button
            type="button"
            onClick={() => setFollow(!follow)}
            aria-pressed={follow}
            title="دنبال‌کردن آخرین خط"
          >
            <ArrowDown size={16} />
          </button>
          <button
            type="button"
            title="دریافت لاگ"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([lines.map((l) => `${l.at} | ${clean(l.text)}`).join('\n')], {
                  type: 'text/plain',
                }),
              );
              const a = document.createElement('a');
              a.href = url;
              a.download = 'build.log';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? 'کوچک‌کردن ترمینال' : 'بزرگ‌کردن ترمینال'}
          >
            {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        </div>
      </header>
      <div className="terminal-viewport" ref={viewport} dir="ltr" tabIndex={0}>
        {!lines.length && (
          <p className="terminal-placeholder">
            {query.isError
              ? 'دریافت لاگ فعلاً ممکن نشد.'
              : active
                ? 'منتظر خروجی واقعی ساخت از لیارا…'
                : 'خروجی ساختی برای این تلاش دریافت نشده است.'}
          </p>
        )}
        {lines.map((l, i) => (
          <div className="terminal-line" key={`${l.at}-${i}`}>
            <time>{l.at}</time>
            <code
              className={
                /error|failed|exception/i.test(l.text)
                  ? 'terminal-error'
                  : /install|download|success|ready/i.test(l.text)
                    ? 'terminal-success'
                    : ''
              }
            >
              {clean(l.text)}
            </code>
          </div>
        ))}
      </div>
      <footer>
        <span>{lines.length} خط · خروجی واقعی لیارا</span>
        {query.isError && (
          <button type="button" onClick={() => void query.refetch()}>
            دریافت دوباره لاگ
          </button>
        )}
        <span>{follow ? 'دنبال‌کردن خودکار روشن' : 'دنبال‌کردن خودکار خاموش'}</span>
      </footer>
    </section>
  );
}
