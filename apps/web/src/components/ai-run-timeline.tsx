import { useEffect, useState } from 'react';
import type { z } from 'zod';
import type { aiRunSchema } from '../../../../packages/shared/src/reliability';
import { CircleCheck, LoaderCircle, Sparkles, TriangleAlert } from 'lucide-react';
import { persianNumber as n } from '../lib/workspace';
export function AiRunTimeline({ run }: { run: z.infer<typeof aiRunSchema> }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!['QUEUED', 'RUNNING'].includes(run.state)) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [run.state]);
  const active = ['QUEUED', 'RUNNING'].includes(run.state),
    last = run.events.at(-1),
    waiting = last && ['MODEL', 'MODEL_RECEIVING'].includes(last.phase);
  return (
    <section className="surface-card ai-run-timeline" aria-live="polite">
      <header>
        <span className="telemetry-ai-icon">
          <Sparkles size={20} />
        </span>
        <div>
          <h2>
            {run.kind === 'PATCH'
              ? 'پایلوت در حال آماده‌سازی پچ سرور است'
              : 'پایلوت در حال موشکافی عملکرد است'}
          </h2>
          <p>
            {active
              ? 'گزارش زنده مراحل واقعی worker'
              : run.state === 'SUCCEEDED'
                ? 'فرایند تکمیل شد؛ نتیجه آماده بررسی است'
                : 'فرایند کامل نشد؛ علت در ادامه آمده است'}
          </p>
        </div>
        {active ? (
          <LoaderCircle size={20} className="scan-spinning" />
        ) : run.state === 'SUCCEEDED' ? (
          <CircleCheck size={21} />
        ) : (
          <TriangleAlert size={21} />
        )}
      </header>
      <ol>
        {run.events.map((e, i) => (
          <li
            key={e.sequence}
            className={
              i === run.events.length - 1 && active
                ? 'is-active'
                : e.phase === 'FAILED'
                  ? 'is-failed'
                  : 'is-done'
            }
          >
            <span>
              {e.phase === 'FAILED' ? (
                <TriangleAlert size={13} />
              ) : i === run.events.length - 1 && active ? (
                <LoaderCircle size={13} className="scan-spinning" />
              ) : (
                <CircleCheck size={13} />
              )}
            </span>
            <div>
              <strong>{e.message}</strong>
              <small>
                {new Date(e.at).toLocaleTimeString('fa-IR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
                {e.receivedBytes !== undefined
                  ? ` · ${n(e.receivedBytes)} بایت از پاسخ دریافت شد`
                  : ''}
              </small>
            </div>
          </li>
        ))}
      </ol>
      {active && waiting && (
        <div className="ai-run-wait">
          <LoaderCircle size={14} className="scan-spinning" />
          در انتظار ادامه پاسخ مدل ·{' '}
          {n(Math.max(0, Math.floor((now - new Date(last.at).getTime()) / 1000)))} ثانیه
          <p>تا دریافت پاسخ، مرحله داخلی مدل قابل مشاهده نیست؛ هیچ کدی اعمال نمی‌شود.</p>
        </div>
      )}
      {run.error && (
        <p className="ai-run-error" role="alert">
          {run.error}
        </p>
      )}
    </section>
  );
}
