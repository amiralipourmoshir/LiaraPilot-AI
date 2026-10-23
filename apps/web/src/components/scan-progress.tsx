import { z } from 'zod';
import { scanProgress, scanFailure, taskSchema } from '../../../../packages/shared/src/reliability';
import { CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-react';
import { persianNumber as n } from '../lib/workspace';
export function ScanProgress({ task }: { task: z.infer<typeof taskSchema> }) {
  const result = z
    .object({
      progress: scanProgress.optional(),
      error: z.union([scanFailure, z.string()]).optional(),
    })
    .safeParse(task.result).data;
  const p = result?.progress,
    error = result?.error,
    failed = ['FAILED', 'NEEDS_ATTENTION'].includes(task.state),
    done = task.state === 'SUCCEEDED';
  const stages = ['PREPARING', 'BROWSER', 'DISCOVERY', 'SCANNING', 'SAVING', 'DONE'];
  const phase = done ? 5 : stages.indexOf(p?.phase ?? 'PREPARING');
  return (
    <div className={`scan-progress ${failed ? 'scan-progress-failed' : ''}`} aria-live="polite">
      <div className="scan-progress-title">
        {failed ? (
          <TriangleAlert size={21} />
        ) : done ? (
          <CircleCheck size={21} />
        ) : (
          <LoaderCircle size={21} className="scan-spinning" />
        )}
        <strong>
          {failed
            ? 'اجرای تست متوقف شد'
            : done
              ? 'گزارش تست آماده است'
              : task.state === 'QUEUED'
                ? 'تست در صف اجرای worker است'
                : (p?.message ?? 'در حال آماده‌سازی تست…')}
        </strong>
      </div>
      <ol className="scan-stage-list">
        {['آماده‌سازی', 'مرورگر', 'کشف مسیرها', 'بررسی صفحات', 'ثبت گزارش'].map((s, i) => (
          <li key={s} className={phase > i ? 'is-complete' : phase === i ? 'is-current' : ''}>
            <span>{phase > i ? '✓' : n(i + 1)}</span>
            {s}
          </li>
        ))}
      </ol>
      {task.state === 'QUEUED' || (phase < 3 && !done && !failed) ? (
        <progress aria-label="پیشرفت تست" />
      ) : (
        <progress
          aria-label="پیشرفت تست"
          value={p?.completed ?? (done ? 1 : 0)}
          max={Math.max(p?.total ?? 1, 1)}
        />
      )}
      <div className="scan-progress-count">
        <span>
          {p
            ? `${n(p.completed)} از ${n(p.total)} صفحه کشف‌شده بررسی شد`
            : done
              ? 'گزارش نهایی ثبت شده است.'
              : 'پس از شروع worker، پیشرفت اینجا نمایش داده می‌شود.'}
        </span>
        {p?.currentPath && <code dir="ltr">{p.currentPath}</code>}
      </div>
      {task.state === 'QUEUED' && Date.now() - new Date(task.createdAt).getTime() > 30000 && (
        <p role="status">
          worker هنوز این تست را شروع نکرده است؛ اتصال worker و صف اجرا را بررسی کنید.
        </p>
      )}
      {!done && !failed && (
        <p>
          با کشف لینک‌های جدید، تعداد کل صفحات می‌تواند افزایش یابد. بستن این پنجره اجرای تست را
          متوقف نمی‌کند.
        </p>
      )}
      {failed && (
        <div className="scan-error" role="alert">
          <h3>
            {typeof error === 'object' ? error.message : 'علت دقیق این اجرای قدیمی ثبت نشده است.'}
          </h3>
          <p>
            {typeof error === 'object'
              ? error.hint
              : typeof error === 'string'
                ? error
                : 'نسخه قبلی worker فقط وضعیت ناموفق را ثبت می‌کرد. با اجرای مجددِ تأییدشده، علت و مرحله دقیق ثبت خواهد شد.'}
          </p>
          {typeof error === 'object' && (
            <>
              <code>{error.code}</code>
              {error.detail && (
                <details>
                  <summary>جزئیات فنی خطا</summary>
                  <pre dir="ltr">{error.detail}</pre>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
