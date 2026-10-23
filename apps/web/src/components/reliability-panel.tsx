import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  taskList,
  taskSchema,
  scanResult,
  aiRunSchema,
  aiRunList,
} from '../../../../packages/shared/src/reliability';
import { cloudMetricsSchema } from '../../../../packages/shared/src/cloud';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { formatDate } from '../lib/workspace';
import { Button } from './ui/button';
import { ErrorNotice } from './common';
import { AiRunTimeline } from './ai-run-timeline';
import { PatchDiff } from './patch-diff';
import { ScanProgress } from './scan-progress';
import { Modal } from './primitives';
import { TelemetryDashboard } from './telemetry-dashboard';
import { Activity, Code2, Download, ScanLine, ShieldCheck } from 'lucide-react';
import './reliability.css';
const labels: Record<string, string> = {
  PLANNED: 'منتظر تأیید',
  QUEUED: 'در صف',
  RUNNING: 'در حال بررسی',
  SUCCEEDED: 'بررسی تکمیل شد',
  FAILED: 'بررسی ناموفق',
  APPLYING: 'در حال اعمال',
  APPLIED: 'پچ اعمال شد',
  UNDOING: 'در حال آندو',
  UNDONE: 'آندو شد',
  REJECTED: 'رد شد',
  NEEDS_ATTENTION: 'نیازمند بررسی دستی',
};
function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ReliabilityPanel({
  applicationId,
  initialRunId,
  compact = false,
}: {
  applicationId: string;
  initialRunId?: string;
  compact?: boolean;
}) {
  const session = useSession(),
    client = useQueryClient();
  const q = useQuery({
    queryKey: ['reliability', applicationId],
    queryFn: () => api(`/reliability?applicationId=${applicationId}`, taskList),
    refetchInterval: (query) =>
      query.state.data?.items.some(
        (t) => t.kind === 'SCAN' && ['QUEUED', 'RUNNING'].includes(t.state),
      )
        ? 1000
        : 4000,
  });
  const metrics = useQuery({
    queryKey: ['reliability-metrics', applicationId],
    queryFn: () => api(`/applications/${applicationId}/metrics`, cloudMetricsSchema),
    refetchInterval: 30000,
    retry: false,
  });
  const [review, setReview] = useState<{ task: z.infer<typeof taskSchema>; undo: boolean } | null>(
      null,
    ),
    [monitorId, setMonitorId] = useState<string | null>(null);
  const [appliedTask, setAppliedTask] = useState<z.infer<typeof taskSchema> | null>(null);
  const [showScan, setShowScan] = useState(false),
    [showPatch, setShowPatch] = useState(false);
  const [paths, setPaths] = useState('/'),
    [discover, setDiscover] = useState(true),
    [maxPages, setMaxPages] = useState(200),
    [root, setRoot] = useState<'/app' | '/usr/src/app' | '/usr/share/nginx/html'>('/app'),
    [serverFiles, setServerFiles] = useState<string[]>([]),
    [path, setPath] = useState(''),
    [instruction, setInstruction] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<Error | null>(null),
    [consents, setConsents] = useState<Record<string, boolean>>({});
  const [activeRun, setActiveRun] = useState<string | null>(initialRunId ?? null),
    [runPopup, setRunPopup] = useState(!!initialRunId);
  const openedRuns = useRef(new Set<string>());
  const runs = useQuery({
    queryKey: ['reliability-runs', applicationId],
    queryFn: () => api(`/reliability/runs?applicationId=${applicationId}`, aiRunList),
    refetchInterval: 1000,
    retry: false,
  });
  const currentRun =
    runs.data?.items.find((r) => r.id === activeRun) ??
    runs.data?.items.find((r) => ['QUEUED', 'RUNNING'].includes(r.state));
  useEffect(() => {
    if (!currentRun || currentRun.state !== 'SUCCEEDED' || openedRuns.current.has(currentRun.id))
      return;
    const taskId = z.object({ taskId: z.string() }).safeParse(currentRun.result).data?.taskId;
    if (currentRun.kind === 'PATCH') {
      const task = q.data?.items.find((t) => t.id === taskId);
      if (!task) {
        void client.invalidateQueries({ queryKey: ['reliability', applicationId] });
        return;
      }
      setConsents({});
      setRunPopup(false);
      setReview({ task, undo: false });
    } else void client.invalidateQueries({ queryKey: ['reliability', applicationId] });
    openedRuns.current.add(currentRun.id);
  }, [currentRun, q.data, client, applicationId]);
  async function startRun(kind: 'patch' | 'score', body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const run = await api(`/reliability/runs/${kind}`, aiRunSchema, {
        method: 'POST',
        body,
        csrfToken: session.data?.csrfToken,
      });
      setActiveRun(run.id);
      setRunPopup(true);
      setShowPatch(false);
      await client.invalidateQueries({ queryKey: ['reliability-runs', applicationId] });
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  async function loadServerFiles() {
    setBusy(true);
    setError(null);
    try {
      const result = await api(
        `/reliability/server-files?applicationId=${applicationId}&root=${encodeURIComponent(root)}`,
        z.object({ files: z.array(z.string()) }),
      );
      setServerFiles(result.files);
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  async function send(route: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await api(route, taskSchema, {
        method: 'POST',
        body,
        csrfToken: session.data?.csrfToken,
      });
      await client.invalidateQueries({ queryKey: ['reliability', applicationId] });
      if (route.endsWith('/scans') || route.endsWith('/patches')) {
        setReview({ task: response, undo: false });
        setConsents({});
      }
      if (route.endsWith('/decision') || route.endsWith('/undo')) {
        setReview(null);
        if (response.kind === 'PATCH' && response.state === 'APPLIED') setAppliedTask(response);
        if (response.kind === 'SCAN' && response.state === 'QUEUED') setMonitorId(response.id);
      }
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  const latest = q.data?.items.find(
    (t) => t.kind === 'SCAN' && scanResult.safeParse(t.result).success,
  );
  const report = latest ? scanResult.parse(latest.result) : null;
  return (
    <section className="reliability-panel">
      {!compact && (
        <header className="reliability-heading surface-card">
          <div className="reliability-heading-copy">
            <span className="reliability-heading-icon">
              <Activity size={24} />
            </span>
            <div>
              <span className="reliability-eyebrow">OBSERVABILITY / پایش عمیق</span>
              <h2>دید کامل به سلامت و عملکرد سایت</h2>
              <p>
                از زمان بارگذاری هر صفحه تا سهم فایل‌ها؛ شواهد را ببینید، تصمیم بگیرید و اصلاح کنید.
              </p>
            </div>
          </div>
          <div className="reliability-actions">
            <Button
              variant="secondary"
              aria-expanded={showPatch}
              onClick={() => {
                setShowPatch((v) => !v);
                setShowScan(false);
              }}
            >
              <Code2 size={16} /> درخواست اصلاح کد
            </Button>
            <Button
              aria-expanded={showScan}
              onClick={() => {
                setShowScan((v) => !v);
                setShowPatch(false);
              }}
            >
              <ScanLine size={17} /> اسکن جدید
            </Button>
            {report && (
              <Button
                variant="ghost"
                onClick={() => download(JSON.stringify(report, null, 2), 'site-audit.json')}
                aria-label="دانلود گزارش کامل"
              >
                <Download size={17} />
              </Button>
            )}
          </div>
        </header>
      )}
      {currentRun &&
        (compact ? (
          <AiRunTimeline run={currentRun} />
        ) : (
          <Button variant="secondary" onClick={() => setRunPopup(true)}>
            مشاهده روند زنده {currentRun.kind === 'PATCH' ? 'تولید پچ' : 'امتیازدهی'}
          </Button>
        ))}
      <Modal
        open={!compact && runPopup && !!currentRun}
        onOpenChange={setRunPopup}
        title={
          currentRun?.kind === 'PATCH' ? 'روند زنده تولید پچ سرور' : 'روند زنده امتیازدهی سایت'
        }
        description="این مراحل از رویدادهای واقعی worker و دریافت پاسخ مدل می‌آیند."
        className="reliability-dialog"
      >
        {currentRun && <AiRunTimeline run={currentRun} />}
        <div className="reliability-dialog-actions" style={{ padding: '0 24px 24px' }}>
          <Button variant="secondary" onClick={() => setRunPopup(false)}>
            بستن پنجره
          </Button>
        </div>
      </Modal>
      <div className="reliability-forms" hidden={compact || (!showScan && !showPatch)}>
        <form
          hidden={!showScan}
          onSubmit={(e) => {
            e.preventDefault();
            void send('/reliability/scans', {
              applicationId,
              paths: paths
                .split('\n')
                .map((p) => p.trim())
                .filter(Boolean),
              discover,
              maxPages,
              maxDurationSeconds: 600,
              externalAssets: true,
              interactions: true,
            });
          }}
        >
          <h3>بررسی صفحات سایت</h3>
          <label>
            مسیر شروع اضافی (اختیاری؛ کشف از صفحه اصلی خودکار است)
            <textarea dir="ltr" value={paths} onChange={(e) => setPaths(e.target.value)} />
          </label>
          <label className="consent">
            <input
              type="checkbox"
              checked={discover}
              onChange={(e) => setDiscover(e.target.checked)}
            />
            کشف خودکار از صفحه اصلی، نقشه سایت و لینک‌های داخلی
          </label>
          <p>
            واکشی تا سقف انتخابی صفحه و ۱۰ دقیقه؛ فایل‌های خارجی HTTPS نیز ثبت می‌شوند. مسیرهای
            فارسی، پارامترهای URL و صفحات جاوااسکریپتی قابل شناسایی‌اند. صفحات پشت ورود و اقدامات
            نوشتنی اجرا نمی‌شوند.
          </p>
          <label>
            سقف صفحات در هر اسکن
            <select
              className="plain-select"
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value))}
            >
              <option value={100}>۱۰۰ صفحه</option>
              <option value={200}>۲۰۰ صفحه</option>
              <option value={500}>۵۰۰ صفحه</option>
            </select>
          </label>
          <Button disabled={busy}>آماده‌سازی برنامه تست</Button>
        </form>
        <form
          hidden={!showPatch}
          onSubmit={(e) => {
            e.preventDefault();
            void startRun('patch', {
              applicationId,
              root,
              path,
              instruction,
            });
          }}
        >
          <h3>درخواست صریح اصلاح کد</h3>
          <label>
            ریشه فایل‌ها در سرور
            <select
              className="plain-select"
              value={root}
              onChange={(e) => {
                setRoot(e.target.value as typeof root);
                setServerFiles([]);
              }}
            >
              <option value="/app">/app — برنامه</option>
              <option value="/usr/src/app">/usr/src/app — برنامه Node</option>
              <option value="/usr/share/nginx/html">
                /usr/share/nginx/html — فایل‌های استاتیک
              </option>
            </select>
          </label>
          <div className="reliability-fields">
            <label>
              فایل روی سرور
              <input
                dir="ltr"
                list={`server-files-${applicationId}`}
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="index.html"
                required
              />
              <datalist id={`server-files-${applicationId}`}>
                {serverFiles.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </label>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void loadServerFiles()}
            >
              خواندن فهرست فایل‌های سرور
            </Button>
          </div>
          <label>
            دستور اصلاح
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              minLength={10}
              maxLength={2000}
              required
              placeholder="مشکل و تغییر موردنظر را دقیق بنویسید"
            />
          </label>
          <p>
            فایل از کانتینر واقعی خوانده و برای مدل تنظیم‌شده ارسال می‌شود. پچ فقط پس از تأیید شما
            روی همان نمونه و همان هش فایل اعمال می‌شود. تغییر مستقیم ممکن است با restart/deploy از
            بین برود؛ پچ روی همه replicaها اعمال نمی‌شود.
          </p>
          <Button disabled={busy}>تولید پچ برای بازبینی</Button>
        </form>
      </div>
      {error && <ErrorNotice error={error} />} {q.error && <ErrorNotice error={q.error} />}
      {!compact && (
        <TelemetryDashboard
          tasks={q.data?.items ?? []}
          metrics={metrics.data}
          metricsError={metrics.error?.message}
          analyzing={busy}
          onAnalyze={(id) => void startRun('score', { applicationId, scanId: id })}
          onFix={(text) => {
            setInstruction(text);
            setShowPatch(true);
            setShowScan(false);
          }}
        />
      )}
      <div className="reliability-operations surface-card">
        <div className="section-heading">
          <div>
            <h2>مرکز تست‌ها و اصلاحات</h2>
            <p>هر اقدام، یک تصمیم روشن؛ با امکان بازبینی و بازگردانی کد.</p>
          </div>
          <ShieldCheck size={22} />
        </div>

        {q.isLoading && <p>در حال دریافت عملیات…</p>}
        {q.data?.items.length === 0 && <p>هنوز تست یا پچی برای این سرویس ثبت نشده است.</p>}
        {q.data?.items
          .filter(
            (task) =>
              !compact ||
              z.object({ taskId: z.string() }).safeParse(currentRun?.result).data?.taskId ===
                task.id,
          )
          .map((task) => {
            const s = z
              .object({
                mode: z.string().optional(),
                root: z.string().optional(),
                host: z.string().optional(),
                patch: z.string().optional(),
                instruction: z.string().optional(),
                path: z.string().optional(),
                branch: z.string().optional(),
                repositoryUrl: z.string().optional(),
                paths: z.array(z.string()).optional(),
              })
              .passthrough()
              .parse(task.snapshot);
            const eligible =
              task.state === 'PLANNED' &&
              new Date(task.expiresAt) > new Date() &&
              (task.kind === 'SCAN' || s.mode === 'SERVER');
            const undo = task.state === 'APPLIED' && s.mode === 'SERVER';
            return (
              <article className="reliability-task" key={task.id}>
                <header>
                  <strong>
                    {task.kind === 'SCAN' ? 'اسکن مرورگری' : 'اصلاح کد'} ·{' '}
                    {labels[task.state] ?? task.state}
                  </strong>
                  <small>{formatDate(task.createdAt)}</small>
                </header>
                {s.instruction && <p>{s.instruction}</p>}
                {s.mode === 'SERVER' && (
                  <p dir="ltr">
                    {s.root}/{s.path} · {s.host}
                  </p>
                )}
                {s.repositoryUrl && (
                  <p dir="ltr">
                    {s.repositoryUrl} · {s.branch} · {s.path}
                  </p>
                )}
                {s.paths && <pre dir="ltr">{s.paths.join('\n')}</pre>}
                {s.patch && (
                  <>
                    <details open={eligible || task.state === 'APPLIED'}>
                      <summary>
                        {task.state === 'APPLIED'
                          ? 'مشاهده پچ اعمال‌شده'
                          : task.state === 'UNDONE'
                            ? 'مشاهده پچ بازگردانده‌شده'
                            : 'مشاهده پچ و تفاوت کد'}
                      </summary>
                      <PatchDiff patch={s.patch} path={s.path} applied={task.state === 'APPLIED'} />
                    </details>
                    <Button
                      variant="secondary"
                      onClick={() => download(s.patch!, `liarapilot-${task.id}.patch`)}
                    >
                      دانلود فایل پچ
                    </Button>
                  </>
                )}
                {task.kind === 'PATCH' && s.mode !== 'SERVER' && (
                  <p>
                    این پچ قدیمی مربوط به مخزن است؛ اعمال آن غیرفعال شده است. پچ تازه‌ای از فایل
                    سرور بسازید.
                  </p>
                )}
                {(eligible || undo) && (
                  <Button
                    variant={undo ? 'secondary' : 'primary'}
                    disabled={busy}
                    onClick={() => {
                      setConsents({});
                      setReview({ task, undo });
                    }}
                  >
                    {undo
                      ? 'برگرداندن تغییرات'
                      : task.kind === 'SCAN'
                        ? 'تأیید و اجرای تست'
                        : 'تأیید و اعمال پچ'}
                  </Button>
                )}
                {task.kind === 'SCAN' && task.state !== 'PLANNED' && task.state !== 'REJECTED' && (
                  <>
                    <ScanProgress task={task} />
                    <Button variant="secondary" onClick={() => setMonitorId(task.id)}>
                      مشاهده روند و جزئیات تست
                    </Button>
                  </>
                )}
                {task.state === 'PLANNED' && !eligible && (
                  <p>اعتبار تأیید پایان یافته؛ درخواست جدید بسازید.</p>
                )}
                {task.state === 'APPLIED' && (
                  <p>
                    هش فایل روی همین نمونه سرور پس از نوشتن بررسی شد. برای ارزیابی رفتار سایت، اسکن
                    تازه‌ای را تأیید کنید. تغییر فایل سورس ممکن است به build/restart جداگانه نیاز
                    داشته باشد.
                  </p>
                )}
                {task.state === 'NEEDS_ATTENTION' && (
                  <p>
                    نتیجه قطعی نیست یا تعارض رخ داده است؛ قبل از درخواست تازه، وضعیت فایل را روی
                    سرور بررسی کنید.
                  </p>
                )}
              </article>
            );
          })}
      </div>
      <Modal
        open={!!appliedTask}
        onOpenChange={(open) => {
          if (!open) setAppliedTask(null);
        }}
        title="پچ با موفقیت اعمال شد"
        description="تغییرات ثبت‌شده روی فایل سرور"
        className="reliability-dialog"
      >
        {appliedTask &&
          (() => {
            const snapshot = z
              .object({ patch: z.string(), path: z.string(), root: z.string(), host: z.string() })
              .parse(appliedTask.snapshot);
            return (
              <div className="reliability-review">
                <div className="patch-applied-notice" role="status">
                  <ShieldCheck size={22} />
                  <div>
                    <strong>تغییرات روی فایل سرور اعمال شد</strong>
                    <p dir="ltr">
                      {snapshot.root}/{snapshot.path} · {snapshot.host}
                    </p>
                  </div>
                </div>
                <PatchDiff patch={snapshot.patch} path={snapshot.path} applied />
                <p>
                  این پچ در تاریخچه باقی می‌ماند؛ از همان‌جا هم می‌توانید تغییرات را مشاهده و
                  بازگردانی کنید.
                </p>
                <div className="reliability-dialog-actions">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setConsents({});
                      setReview({ task: appliedTask, undo: true });
                      setAppliedTask(null);
                    }}
                  >
                    برگرداندن تغییرات
                  </Button>
                  <Button onClick={() => setAppliedTask(null)}>بستن</Button>
                </div>
              </div>
            );
          })()}
      </Modal>
      <Modal
        open={!!review}
        onOpenChange={(open) => {
          if (!open && !busy) setReview(null);
        }}
        title={
          review?.undo
            ? 'تأیید بازگردانی پچ'
            : review?.task.kind === 'SCAN'
              ? 'تأیید اجرای تست سایت'
              : 'بازبینی و تأیید پچ'
        }
        description="پیش از اجرا، مقصد و اثر این اقدام را بررسی کنید."
        className="reliability-dialog"
      >
        {review &&
          (() => {
            const task = review.task;
            const s = z
              .object({
                name: z.string().optional(),
                maxPages: z.number().optional(),
                maxDurationSeconds: z.number().optional(),
                externalAssets: z.boolean().optional(),
                interactions: z.boolean().optional(),
                paths: z.array(z.string()).optional(),
                mode: z.string().optional(),
                root: z.string().optional(),
                host: z.string().optional(),
                repositoryUrl: z.string().optional(),
                branch: z.string().optional(),
                path: z.string().optional(),
                patch: z.string().optional(),
                instruction: z.string().optional(),
              })
              .passthrough()
              .parse(task.snapshot);
            const key = task.id + task.state;
            return (
              <div className="reliability-review">
                <div className="reliability-review-target">
                  <ShieldCheck size={20} />
                  <div>
                    <strong>
                      {task.kind === 'SCAN'
                        ? 'بررسی خواندنی صفحات سرویس'
                        : review.undo
                          ? 'بازگردانی محتوای فایل در همان کانتینر'
                          : 'اعمال پچ روی فایل سرور'}
                    </strong>
                    <p dir="ltr">
                      {task.kind === 'SCAN'
                        ? `${s.name ?? 'service'}.liara.run`
                        : `${s.root}/${s.path} · ${s.host}`}
                    </p>
                  </div>
                </div>
                {task.kind === 'SCAN' ? (
                  <>
                    <p>
                      کشف و تست خودکار تا سقف {s.maxPages ?? 30} صفحه و{' '}
                      {s.maxDurationSeconds ?? 120} ثانیه؛ خواندن sitemap و لینک‌ها و جمع‌آوری
                      فایل‌ها. تست روی سرویس ترافیک ایجاد می‌کند.{' '}
                      {s.interactions
                        ? 'ناوبری و تب‌های خواندنی تا ۸ کنترل در هر صفحه بررسی می‌شوند.'
                        : 'در این طرح، تعامل با کنترل‌های ناوبری فعال نیست.'}{' '}
                      درخواست‌های نوشتنی مسدودند؛ هیچ کدی تغییر نمی‌کند.
                    </p>
                    <pre dir="ltr">{s.paths?.join('\n')}</pre>
                  </>
                ) : (
                  <>
                    <p>{s.instruction}</p>
                    <p>
                      {review.undo
                        ? 'فقط همین فایل در همین نمونه سرور به محتوای پیش از پچ برمی‌گردد؛ تغییر فایل یا نمونه باعث توقف آندو می‌شود.'
                        : 'پچ مستقیماً روی فایل همین کانتینر اعمال می‌شود. با restart/deploy ممکن است از بین برود. روی همه replicaها اعمال نمی‌شود و فایل سورس نیازمند build/restart لزوماً فوراً اجرا نمی‌شود. پچ را کامل بازبینی کنید.'}
                    </p>
                    {s.patch && <PatchDiff patch={s.patch} path={s.path} applied={review.undo} />}
                  </>
                )}
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={!!consents[key]}
                    onChange={(e) => setConsents({ ...consents, [key]: e.target.checked })}
                  />
                  {review.undo
                    ? 'بازگردانی همین فایل به نسخه قبل را تأیید می‌کنم.'
                    : task.kind === 'SCAN'
                      ? 'اجرای تست و ایجاد ترافیک خواندنی روی سرویس را تأیید می‌کنم.'
                      : 'پچ و نمونه سرور را بررسی کردم؛ اعمال مستقیم همین تغییر را تأیید می‌کنم.'}
                </label>
                {error && <ErrorNotice error={error} />}
                <div className="reliability-dialog-actions">
                  <Button
                    disabled={busy || !consents[key]}
                    onClick={() =>
                      void send(`/reliability/${task.id}/${review.undo ? 'undo' : 'decision'}`, {
                        hash: task.hash,
                        approve: true,
                      })
                    }
                  >
                    {busy
                      ? 'در حال ثبت تأیید…'
                      : review.undo
                        ? 'برگرداندن تغییرات'
                        : task.kind === 'SCAN'
                          ? 'تأیید و اجرای تست'
                          : 'تأیید و اعمال پچ'}
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => setReview(null)}>
                    بازگشت
                  </Button>
                  {!review.undo && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void send(`/reliability/${task.id}/decision`, {
                          hash: task.hash,
                          approve: false,
                        })
                      }
                    >
                      رد درخواست
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}
      </Modal>
      <Modal
        open={!!monitorId}
        onOpenChange={(open) => {
          if (!open) setMonitorId(null);
        }}
        title="روند اجرای تست سایت"
        description="پیشرفت واقعی worker؛ این پنجره وضعیت ذخیره‌شده تست را نمایش می‌دهد."
        className="reliability-dialog"
      >
        {(() => {
          const t = q.data?.items.find((t) => t.id === monitorId);
          if (!t) return <p>در حال دریافت وضعیت تست…</p>;
          return (
            <div className="reliability-review">
              <ScanProgress task={t} />
              {['FAILED', 'NEEDS_ATTENTION'].includes(t.state) && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    const s = z
                      .object({
                        paths: z.array(z.string()),
                        discover: z.boolean(),
                        maxPages: z.number().optional(),
                        maxDurationSeconds: z.number().optional(),
                        externalAssets: z.boolean().optional(),
                        interactions: z.boolean().optional(),
                      })
                      .parse(t.snapshot);
                    setMonitorId(null);
                    void send('/reliability/scans', { applicationId, ...s });
                  }}
                >
                  آماده‌سازی تست مجدد با تأیید تازه
                </Button>
              )}
              <Button variant="secondary" onClick={() => setMonitorId(null)}>
                بستن پنجره
              </Button>
            </div>
          );
        })()}
      </Modal>
    </section>
  );
}
