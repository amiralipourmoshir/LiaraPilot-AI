import { ReliabilityPanel } from '../components/reliability-panel';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  Activity,
  RefreshCw,
  Pause,
  Play,
  Sparkles,
  ShieldCheck,
  TriangleAlert,
  Download,
  Search,
  Clock3,
} from 'lucide-react';
import {
  monitoringOverviewSchema,
  healthMonitorSchema,
  incidentDetailSchema,
  healthActionSchema,
  monitoringDiagnosisSchema,
  operationHistorySchema,
} from '../../../../packages/shared/src/monitoring';
import { cloudApplicationsSchema, cloudLogsSchema } from '../../../../packages/shared/src/cloud';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { useWorkspace, useWorkspaceUi, formatDate, persianNumber } from '../lib/workspace';
import { PageTitle, EmptyState, Modal } from '../components/primitives';
import { ErrorNotice, Loading } from '../components/common';
import { Button } from '../components/ui/button';
import { ChoicePicker } from '../components/choice-picker';
import { PlatformMark } from '../components/platform-mark';
import { AgentForm } from '../components/agent-form';
function useOverview() {
  const { user } = useWorkspace();
  return useQuery({
    queryKey: ['monitoring', user.id],
    queryFn: () => api('/monitoring', monitoringOverviewSchema),
    refetchInterval: 10000,
    retry: false,
  });
}
function HealthTrend({ samples }: { samples: z.infer<typeof healthMonitorSchema>['samples'] }) {
  return (
    <div className="health-trend" aria-label="نتایج بررسی‌های اخیر">
      {[...samples].reverse().map((s) => (
        <span
          key={s.id}
          className={s.healthy ? 'healthy' : 'failed'}
          title={`${formatDate(s.createdAt)} · ${s.status ?? s.errorCode} · ${s.latencyMs}ms`}
        />
      ))}
      {!samples.length && <small>منتظر اولین بررسی واقعی</small>}
    </div>
  );
}
export function LiveMonitoringPage() {
  const overview = useOverview(),
    session = useSession(),
    client = useQueryClient(),
    { user, base } = useWorkspace(),
    { selectedProject } = useWorkspaceUi();
  const [searchParams] = useSearchParams();
  const [target, setTarget] = useState(
      () => searchParams.get('applicationId') ?? (selectedProject === 'all' ? '' : selectedProject),
    ),
    [path, setPath] = useState('/'),
    [busy, setBusy] = useState(''),
    [error, setError] = useState<Error | null>(null);
  const mutate = async (key: string, route: string, body: unknown, method = 'POST') => {
    setBusy(key);
    setError(null);
    try {
      await api(route, healthMonitorSchema, { method, body, csrfToken: session.data?.csrfToken });
      await client.invalidateQueries({ queryKey: ['monitoring', user.id] });
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy('');
    }
  };
  if (overview.isLoading) return <Loading />;
  if (overview.error) return <ErrorNotice error={overview.error} />;
  const data = overview.data!,
    rows = data.monitors.filter(
      (m) => selectedProject === 'all' || m.applicationId === selectedProject,
    ),
    active = data.monitors.filter((m) => m.enabled).length;
  return (
    <>
      <PageTitle
        eyebrow="پایلوت مراقب سرویس‌های شماست"
        title="پایش سرویس‌ها"
        description="بررسی واقعی دسترسی وب، روند پاسخ و تشخیص اختلال پس از خطاهای متوالی"
      >
        <Button variant="secondary" onClick={() => void overview.refetch()}>
          <RefreshCw size={16} /> تازه‌سازی
        </Button>
      </PageTitle>
      <div className="observability-stats">
        {[
          { label: 'پایش فعال', value: active },
          { label: 'رخداد باز', value: data.incidents.filter((i) => i.state === 'OPEN').length },
          { label: 'سرویس متصل', value: data.candidates.length },
        ].map((i) => (
          <div className="surface-card" key={i.label}>
            <span>{i.label}</span>
            <strong>{persianNumber(i.value)}</strong>
          </div>
        ))}
      </div>
      <section className="surface-card monitor-enroll">
        <div>
          <h2>سرویس را به پایلوت بسپارید</h2>
          <p>
            پس از فعال‌سازی، worker حتی با بسته‌شدن این صفحه بررسی را ادامه می‌دهد. سلامت وب با
            سلامت همه اجزای برنامه یکسان نیست.
          </p>
        </div>
        <ChoicePicker
          label="سرویس برای پایش"
          value={target}
          onChange={setTarget}
          options={data.candidates.map((c) => ({
            value: c.applicationId ?? c.deploymentId!,
            label: c.name,
          }))}
        />
        <label>
          مسیر بررسی
          <input dir="ltr" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/" />
        </label>
        <Button
          disabled={!target || !!busy}
          onClick={() => {
            const c = data.candidates.find((c) => (c.applicationId ?? c.deploymentId) === target)!;
            void mutate('create', '/monitoring', {
              ...(c.applicationId
                ? { applicationId: c.applicationId }
                : { deploymentId: c.deploymentId }),
              path,
              intervalSeconds: 60,
              failureThreshold: 3,
            });
          }}
        >
          <Activity size={16} /> فعال‌کردن پایش
        </Button>
        {!data.candidates.length && (
          <p>
            ابتدا حساب لیارا را متصل و سرویس‌ها را همگام‌سازی کنید.{' '}
            <Link to={`${base}/connections`}>اتصال حساب</Link>
          </p>
        )}
      </section>
      {target && data.candidates.some((c) => c.applicationId === target) && (
        <ReliabilityPanel key={target} applicationId={target} />
      )}
      {error && <ErrorNotice error={error} />}
      <div className="monitor-grid">
        {rows.map((m) => (
          <section className="surface-card monitor-live-card" key={m.id}>
            <header>
              <PlatformMark platform={m.platform ?? 'unknown'} size={38} />
              <div>
                <h2>
                  <bdi>{m.name}</bdi>
                </h2>
                <small>
                  {m.enabled ? 'پایش فعال' : 'پایش متوقف'} · هر {persianNumber(m.intervalSeconds)}{' '}
                  ثانیه
                </small>
              </div>
              <span
                className={`health-chip ${!m.lastCheckedAt ? 'waiting' : m.lastError ? 'failed' : 'healthy'}`}
              >
                {!m.lastCheckedAt ? 'در انتظار بررسی' : m.lastError ? 'نیازمند بررسی' : 'پاسخ سالم'}
              </span>
            </header>
            <HealthTrend samples={m.samples} />
            <div className="monitor-facts">
              <span>
                HTTP <bdi>{m.lastStatus ?? '—'}</bdi>
              </span>
              <span>
                <Clock3 size={14} /> {m.latencyMs ?? '—'} ms
              </span>
              <span dir="ltr">{m.path}</span>
            </div>
            <small>
              آخرین بررسی: {m.lastCheckedAt ? formatDate(m.lastCheckedAt) : 'هنوز انجام نشده'}
            </small>
            <footer>
              <Button
                variant="secondary"
                disabled={!!busy}
                onClick={() => void mutate(m.id, `/monitoring/${m.id}/check`, {})}
              >
                <RefreshCw size={14} /> بررسی اکنون
              </Button>
              <Button
                variant="ghost"
                disabled={!!busy}
                onClick={() =>
                  void mutate(
                    m.id,
                    `/monitoring/${m.id}`,
                    {
                      enabled: !m.enabled,
                      intervalSeconds: m.intervalSeconds,
                      failureThreshold: m.failureThreshold,
                    },
                    'PATCH',
                  )
                }
              >
                {m.enabled ? <Pause size={14} /> : <Play size={14} />}{' '}
                {m.enabled ? 'توقف پایش' : 'ادامه پایش'}
              </Button>
              <Link to={`${base}/projects/${m.applicationId}?tab=metrics`}>منابع سرویس</Link>
            </footer>
            {data.incidents
              .filter((i) => i.monitorId === m.id && i.state === 'OPEN')
              .map((i) => (
                <Link className="monitor-incident-link" key={i.id} to={`${base}/incidents/${i.id}`}>
                  <TriangleAlert size={16} /> مشاهده اختلال و تشخیص پایلوت
                </Link>
              ))}
          </section>
        ))}
      </div>
      {!rows.length && (
        <EmptyState
          title="هنوز پایشی فعال نشده است."
          description="یک سرویس را از فهرست بالا انتخاب کنید؛ اولین بررسی در worker انجام می‌شود."
        />
      )}
    </>
  );
}
export function LiveIncidentsPage() {
  const q = useOverview(),
    { base } = useWorkspace(),
    { selectedProject } = useWorkspaceUi(),
    [filter, setFilter] = useState('OPEN');
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNotice error={q.error} />;
  const rows = q.data!.incidents.filter(
    (i) =>
      (filter === 'all' || i.state === filter) &&
      (selectedProject === 'all' ||
        q.data!.monitors.some((m) => m.id === i.monitorId && m.applicationId === selectedProject)),
  );
  return (
    <>
      <PageTitle
        title="رخدادها و خطاها"
        description="اختلال‌های واقعی پس از خطاهای متوالی ثبت می‌شوند؛ بازیابی به دو بررسی سالم نیاز دارد."
      />
      <div className="filter-pills history-filter">
        {[
          ['OPEN', 'نیازمند بررسی'],
          ['RESOLVED', 'بازیابی‌شده'],
          ['all', 'همه رخدادها'],
        ].map(([value, label]) => (
          <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value!)}>
            {label}
          </button>
        ))}
      </div>
      {rows.map((i) => (
        <Link key={i.id} className="surface-card incident-card" to={`${base}/incidents/${i.id}`}>
          <TriangleAlert size={25} />
          <div>
            <h2>{i.title}</h2>
            <p>{formatDate(i.openedAt)}</p>
          </div>
          <span className={`health-chip ${i.state === 'OPEN' ? 'failed' : 'healthy'}`}>
            {i.state === 'OPEN' ? 'باز' : 'بازیابی‌شده'}
          </span>
        </Link>
      ))}
      {!rows.length && (
        <EmptyState
          title="رخدادی با این فیلتر ثبت نشده است."
          description="پس از فعال‌کردن پایش، اختلال‌های شناسایی‌شده در این بخش ظاهر می‌شوند."
        />
      )}
    </>
  );
}
export function LiveIncidentDetailPage() {
  const { id } = useParams(),
    { base, user } = useWorkspace(),
    session = useSession(),
    client = useQueryClient();
  const [busy, setBusy] = useState(''),
    [error, setError] = useState<Error | null>(null),
    [question, setQuestion] = useState(false),
    [settings, setSettings] = useState(false),
    [consent, setConsent] = useState(false),
    [answers, setAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [showReliability, setShowReliability] = useState(false),
    [healthReview, setHealthReview] = useState(true);
  const q = useQuery({
    queryKey: ['incident', user.id, id],
    queryFn: () => api(`/incidents/${id}`, incidentDetailSchema),
    refetchInterval: 10000,
    retry: false,
  });
  const refresh = async () => {
    await q.refetch();
    await client.invalidateQueries({ queryKey: ['monitoring', user.id] });
  };
  const work = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy('');
    }
  };
  const diagnose = async (next = answers) => {
    await work('diagnose', async () => {
      const d = await api(`/incidents/${id}/diagnose`, incidentDetailSchema, {
        method: 'POST',
        body: { answers: next },
        csrfToken: session.data?.csrfToken,
      });
      client.setQueryData(['incident', user.id, id], d);
      setQuestion(!!monitoringDiagnosisSchema.safeParse(d.diagnosis).data?.question);
    });
  };
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNotice error={q.error} />;
  const d = q.data!,
    diagnosis = monitoringDiagnosisSchema.safeParse(d.diagnosis).data,
    stored = d.diagnosis as {
      evidence?: { id: string; text: string }[];
      rules?: string[];
      logsAvailable?: boolean;
    } | null,
    action = d.actions.find(
      (a) => a.state === 'PLANNED' && new Date(a.expiresAt).getTime() > Date.now(),
    );
  const prepare = async (body: unknown = {}) => {
    await work('prepare', async () => {
      await api(`/incidents/${id}/actions`, healthActionSchema, {
        method: 'POST',
        body,
        csrfToken: session.data?.csrfToken,
      });
      setConsent(false);
      setHealthReview(true);
      setSettings(false);
      await refresh();
    });
  };
  return (
    <>
      <Link className="text-link" to={`${base}/incidents`}>
        همه رخدادها
      </Link>
      <PageTitle
        title={d.title}
        description={`${d.monitor.name} · ${d.state === 'OPEN' ? 'اختلال باز' : 'بازیابی تأیید شده'}`}
      >
        <Button disabled={!!busy} onClick={() => void diagnose()}>
          <Sparkles size={17} />
          {busy === 'diagnose' ? 'پایلوت در حال بررسی شواهد…' : 'تحلیل با پایلوت'}
        </Button>
      </PageTitle>
      {error && <ErrorNotice error={error} />}
      <div className="incident-detail-grid">
        <div>
          <section className="surface-card diagnosis-card">
            <h2>تشخیص و شواهد</h2>
            {diagnosis ? (
              <>
                <p className="diagnosis-hypothesis">{diagnosis.summary}</p>
                {diagnosis.hypotheses.map((h, i) => (
                  <article key={i}>
                    <p>{h.text}</p>
                    <div className="evidence-links">
                      {h.evidenceIds.map((e) => (
                        <a key={e} href={`#evidence-${e}`}>
                          {e.slice(0, 12)}
                        </a>
                      ))}
                    </div>
                  </article>
                ))}
                {diagnosis.question && (
                  <Button variant="secondary" onClick={() => setQuestion(true)}>
                    پاسخ به سؤال پایلوت
                  </Button>
                )}
              </>
            ) : (
              <p>
                هنوز تحلیل مدل ثبت نشده است. پایلوت پاسخ‌های سلامت و لاگ‌های در دسترس را بررسی
                می‌کند.
              </p>
            )}
            {stored?.rules?.map((r, i) => (
              <p key={i} className="wizard-helper">
                {r}
              </p>
            ))}
            {stored?.logsAvailable === false && (
              <p className="warning-text">
                لاگ در زمان تحلیل در دسترس نبود؛ علت قطعی از روی پاسخ وب مشخص نیست.
              </p>
            )}
          </section>
          <section className="surface-card evidence-panel">
            <h2>شواهد ثبت‌شده</h2>
            {stored?.evidence?.map((e) => (
              <article className="evidence-item" id={`evidence-${e.id}`} key={e.id}>
                <code>{e.id}</code>
                <pre dir="ltr">{e.text}</pre>
              </article>
            ))}
            <HealthTrend samples={d.monitor.samples} />
            {!stored?.evidence?.length && (
              <p>برای جمع‌آوری و پیوند شواهد، تحلیل پایلوت را اجرا کنید.</p>
            )}
          </section>
        </div>
        <aside>
          <section className="surface-card remediation-card">
            <h2>
              <ShieldCheck size={20} /> مسیر بازیابی
            </h2>
            <p>
              می‌توان مسیر بررسی سلامت را اصلاح کرد یا دو بررسی تأییدی انجام داد. تغییر کد و تنظیمات
              برنامه پس از بازبینی پچ در مخزن ثبت و سپس از مسیر انتشار نسخه اصلاحی منتشر می‌شود.
            </p>
            <Button
              disabled={!!busy || d.state !== 'OPEN' || !!action || d.source === 'SCAN'}
              onClick={() => void prepare()}
            >
              آماده‌سازی بررسی تأییدی
            </Button>
            <Button
              variant="secondary"
              disabled={!!busy || d.state !== 'OPEN' || !!action || d.source === 'SCAN'}
              onClick={() => setSettings(true)}
            >
              اصلاح مسیر بررسی سلامت
            </Button>
            {d.source === 'SCAN' && (
              <p>بازیابی این رخداد با اسکن مجدد همان مسیرهای خطادار بررسی می‌شود.</p>
            )}
            <Button variant="secondary" onClick={() => setShowReliability((v) => !v)}>
              اسکن صفحات و اصلاح با پچ
            </Button>
            <Link className="text-link" to={`${base}/deployments`}>
              انتشار نسخه اصلاحی پروژه
            </Link>
            {action && (
              <Button variant="secondary" onClick={() => setHealthReview(true)}>
                بازبینی و تأیید طرح بازیابی
              </Button>
            )}
            {action && (
              <Modal
                open={healthReview}
                onOpenChange={setHealthReview}
                title="تأیید طرح بازیابی"
                description="جزئیات اقدام را پیش از اجرای بررسی واقعی مرور کنید."
              >
                <div className="health-action-review">
                  <h3>طرح آماده تأیید</h3>
                  <p>
                    {(action.snapshot as { kind?: string }).kind === 'UPDATE_HEALTH_CHECK'
                      ? 'اصلاح مسیر پایش و دو بررسی برای تأیید نتیجه'
                      : 'دو بررسی واقعی برای تأیید بازیابی'}
                  </p>
                  <p>
                    مسیر بررسی:{' '}
                    <bdi>
                      {(action.snapshot as { nextPath?: string; path?: string }).nextPath ??
                        (action.snapshot as { path?: string }).path}
                    </bdi>
                  </p>
                  <p>این طرح سرویس جدیدی نمی‌سازد و هزینه پلن را تغییر نمی‌دهد.</p>
                  <label>
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />{' '}
                    جزئیات طرح را بررسی و اجرای آن را تأیید می‌کنم.
                  </label>
                  {[true, false].map((approve) => (
                    <Button
                      key={String(approve)}
                      variant={approve ? 'primary' : 'ghost'}
                      disabled={!!busy || (approve && !consent)}
                      onClick={() =>
                        void work('decision', async () => {
                          await api(`/health-actions/${action.id}/decision`, healthActionSchema, {
                            method: 'POST',
                            body: { hash: action.hash, approve },
                            csrfToken: session.data?.csrfToken,
                          });
                          await refresh();
                        })
                      }
                    >
                      {approve ? 'تأیید و بررسی بازیابی' : 'لغو طرح'}
                    </Button>
                  ))}
                </div>
              </Modal>
            )}
            {d.actions
              .filter((a) => a.state !== 'PLANNED')
              .map((a) => (
                <div key={a.id} className="health-action-review">
                  <strong>
                    {a.state === 'COMPLETED'
                      ? 'بررسی انجام شد'
                      : a.state === 'CANCELLED'
                        ? 'طرح لغو شد'
                        : a.state}
                  </strong>
                  <p>
                    {(
                      {
                        RESOLVED: 'دو پاسخ سالم دریافت شد؛ بازیابی تأیید شد.',
                        UNRESOLVED: 'پاسخ هنوز سالم نیست؛ بررسی بیشتری لازم است.',
                        PARTIALLY_RESOLVED: 'پاسخ سالم دیده شد؛ تأیید نهایی کامل نیست.',
                        VERIFICATION_UNAVAILABLE:
                          'بررسی تأییدی کامل نشد؛ دوباره شواهد را بررسی کنید.',
                      } as Record<string, string>
                    )[(a.result as { outcome?: string } | null)?.outcome ?? ''] ??
                      'نتیجه هنوز ثبت نشده است.'}
                  </p>
                </div>
              ))}
          </section>
          <section className="surface-card incident-timeline">
            <h2>خط زمانی اختلال</h2>
            <ol>
              {d.events.map((e) => (
                <li key={e.id}>
                  <i />
                  <div>
                    <b>{e.message}</b>
                    <small>{formatDate(e.createdAt)}</small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
      {showReliability && <ReliabilityPanel applicationId={d.monitor.applicationId} />}
      <Modal
        open={question}
        onOpenChange={setQuestion}
        title="پایلوت برای ادامه یک سؤال دارد"
        description="اطلاعات محرمانه را در پاسخ ننویسید."
        className="agent-question-dialog"
      >
        {diagnosis?.question && (
          <AgentForm
            key={diagnosis.question}
            fields={[
              {
                name: 'answer',
                label: diagnosis.question,
                type: diagnosis.options.length ? 'radio' : 'textarea',
                options: diagnosis.options.map((o) => ({ value: o, label: o })),
                allowCustom: true,
                required: true,
              },
            ]}
            onSubmit={async (v) => {
              const next = [...answers, { question: diagnosis.question, answer: String(v.answer) }];
              setAnswers(next);
              setQuestion(false);
              await diagnose(next);
            }}
          />
        )}
      </Modal>
      <Modal
        open={settings}
        onOpenChange={setSettings}
        title="اصلاح بررسی سلامت"
        description="این تغییر فقط مسیر و نشانگر پایش را تغییر می‌دهد؛ کد برنامه تغییر نمی‌کند."
        className="agent-question-dialog"
      >
        <AgentForm
          fields={[
            { name: 'path', label: 'مسیر سالم برنامه؛ برای نمونه /', type: 'text', required: true },
            { name: 'expectedText', label: 'متن مورد انتظار پاسخ، اختیاری', type: 'text' },
          ]}
          onSubmit={async (v) =>
            await prepare({ path: String(v.path), expectedText: String(v.expectedText ?? '') })
          }
        />
      </Modal>
    </>
  );
}
export function LiveLogsPage() {
  const { user } = useWorkspace(),
    { selectedProject } = useWorkspaceUi();
  const [chosen, setChosen] = useState(''),
    [range, setRange] = useState('15'),
    [search, setSearch] = useState(''),
    [level, setLevel] = useState('all'),
    [live, setLive] = useState(true);
  const apps = useQuery({
    queryKey: ['log-applications', user.id],
    queryFn: () => api('/applications', cloudApplicationsSchema),
    retry: false,
  });
  const appId =
    chosen ||
    (selectedProject !== 'all'
      ? selectedProject
      : apps.data?.applications.find((a) => !a.providerMissing)?.id) ||
    '';
  const since = useMemo(
    () => new Date(Date.now() - Number(range) * 60000).toISOString(),
    [range, appId],
  );
  const q = useQuery({
    queryKey: ['runtime-logs', user.id, appId, since],
    enabled: !!appId,
    queryFn: () =>
      api(`/applications/${appId}/logs?since=${encodeURIComponent(since)}`, cloudLogsSchema),
    refetchInterval: live ? 5000 : false,
    retry: false,
  });
  const rows = (q.data?.logs ?? []).filter(
    (l) =>
      (level === 'all' ||
        (level === 'error'
          ? /error|stderr|exception|fatal/i.test(l.type + ' ' + l.message)
          : !/error|stderr|exception|fatal/i.test(l.type + ' ' + l.message))) &&
      l.message.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        title="لاگ‌ها"
        description="خروجی واقعی برنامه در لیارا؛ ساعت هر خط UTC است. نمایش زنده هر پنج ثانیه تازه می‌شود."
      >
        <Button variant="secondary" onClick={() => setLive(!live)}>
          {live ? <Pause size={16} /> : <Play size={16} />}{' '}
          {live ? 'توقف نمایش زنده' : 'ادامه نمایش زنده'}
        </Button>
        <Button
          variant="secondary"
          disabled={!rows.length}
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([rows.map((l) => `${l.datetime} [${l.type}] ${l.message}`).join('\n')], {
                type: 'text/plain;charset=utf-8',
              }),
            );
            const a = document.createElement('a');
            a.href = url;
            a.download = 'liarapilot-logs.txt';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download size={16} /> دریافت لاگ
        </Button>
      </PageTitle>
      <section className="surface-card logs-workspace">
        <div className="live-log-controls">
          <ChoicePicker
            label="سرویس"
            value={appId}
            onChange={setChosen}
            options={(apps.data?.applications ?? [])
              .filter((a) => !a.providerMissing)
              .map((a) => ({ value: a.id, label: a.name }))}
          />
          <ChoicePicker
            label="بازه زمانی"
            value={range}
            onChange={setRange}
            options={[
              { value: '15', label: '۱۵ دقیقه اخیر' },
              { value: '60', label: 'یک ساعت اخیر' },
              { value: '1440', label: '۲۴ ساعت اخیر' },
            ]}
          />
          <ChoicePicker
            label="سطح لاگ"
            value={level}
            onChange={setLevel}
            options={[
              { value: 'all', label: 'همه خطوط' },
              { value: 'error', label: 'خطاها' },
              { value: 'info', label: 'سایر خطوط' },
            ]}
          />
          <label className="inline-search">
            <Search size={17} />
            <input
              aria-label="جستجو در لاگ‌ها"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجو در خروجی…"
            />
          </label>
          <Button variant="ghost" disabled={!appId} onClick={() => void q.refetch()}>
            <RefreshCw size={17} />
          </Button>
        </div>
        {apps.error && <ErrorNotice error={apps.error} />}{' '}
        {q.error && <ErrorNotice error={q.error} />}{' '}
        {q.isLoading && appId ? (
          <Loading />
        ) : !rows.length ? (
          <EmptyState
            title={
              appId ? 'لاگی با این فیلتر دریافت نشده است.' : 'ابتدا یک سرویس متصل انتخاب کنید.'
            }
            description="بازه زمانی یا فیلتر را تغییر دهید؛ نبود لاگ به‌تنهایی نشانه سالم‌بودن برنامه نیست."
          />
        ) : (
          <div className="terminal-viewport runtime-terminal" dir="ltr">
            {rows.map((l, i) => (
              <div key={`${l.datetime}-${i}`} className="terminal-line">
                <time>{l.datetime}</time>
                <code className={/stderr|error/i.test(l.type) ? 'terminal-error' : ''}>
                  {l.message}
                </code>
              </div>
            ))}
          </div>
        )}
        <footer className="logs-footer">
          <span>
            {persianNumber(rows.length)} خط · {live ? 'نمایش زنده فعال' : 'نمایش متوقف'}
          </span>
          <span>{q.data ? `آخرین دریافت: ${formatDate(q.data.fetchedAt)}` : ''}</span>
          {q.data?.truncated && <span>پاسخ لیارا محدود شده است؛ بازه کوتاه‌تری انتخاب کنید.</span>}
        </footer>
      </section>
    </>
  );
}
export function LiveOperationsPage() {
  const { user, base } = useWorkspace(),
    [filter, setFilter] = useState('all'),
    [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['history', user.id, page, filter],
    queryFn: () =>
      api(`/history?page=${page}&filter=${encodeURIComponent(filter)}`, operationHistorySchema),
    refetchInterval: 10000,
    retry: false,
  });
  const labels: Record<string, string> = {
    'monitor.enabled': 'پایش فعال شد',
    'monitor.scan.planned': 'برنامه اسکن آماده شد',
    'monitor.scan.completed': 'اسکن صفحات تکمیل شد',
    'monitor.analysis.completed': 'تحلیل هوشمند عملکرد ثبت شد',
    'monitor.patch.planned': 'پچ برای بازبینی آماده شد',
    'monitor.patch.applied': 'پچ در مخزن اعمال شد',
    'monitor.patch.undone': 'پچ بازگردانی شد',
    'monitor.queued': 'تست تأیید و وارد صف شد',
    'monitor.rejected': 'درخواست رد شد',
    'monitor.settings.updated': 'تنظیمات پایش تغییر کرد',
    'monitor.checked': 'سلامت سرویس بررسی شد',
    'incident.opened': 'اختلال شناسایی شد',
    'incident.resolved': 'بازیابی سرویس تأیید شد',
    'liara.connection.validated': 'اتصال حساب لیارا تأیید شد',
    'liara.connection.disconnected': 'اتصال حساب لیارا قطع شد',
    'liara.applications.synced': 'سرویس‌های لیارا همگام شدند',
    'auth.session.started': 'ورود به حساب',
    'auth.session.ended': 'خروج از حساب',
    'project.created': 'پروژه ثبت شد',
    'foundation.check.requested': 'بررسی زیرساخت درخواست شد',
    'assistant.applications.read': 'دستیار سرویس‌ها را بررسی کرد',
    'deployment.guided.planned': 'طرح انتشار با راهنمای پایلوت آماده شد',
    'incident.diagnosed': 'تشخیص هوش مصنوعی ثبت شد',
    'health.action.planned': 'طرح بازیابی آماده شد',
    'health.action.approved': 'طرح بازیابی تأیید شد',
    'health.action.cancelled': 'طرح بازیابی لغو شد',
    'deployment.rechecked': 'وضعیت واقعی انتشار بررسی شد',
    'deployment.approved': 'انتشار تأیید شد',
    'deployment.planned': 'طرح انتشار ساخته شد',
    'deployment.cancelled': 'انتشار لغو شد',
  };
  return (
    <>
      <PageTitle
        title="تاریخچه عملیات"
        description="ردپای واقعی و ذخیره‌شده تصمیم‌ها، تأییدها و عملیات حساب شما"
      >
        <Button variant="secondary" onClick={() => void q.refetch()}>
          <RefreshCw size={16} /> تازه‌سازی
        </Button>
      </PageTitle>
      <div className="filter-pills history-filter">
        {[
          ['all', 'همه'],
          ['deployment.', 'انتشار'],
          ['monitor.', 'پایش'],
          ['incident.', 'تشخیص اختلال'],
          ['health.', 'بازیابی'],
          ['connection.', 'اتصال‌ها'],
        ].map(([v, l]) => (
          <button
            key={v}
            aria-pressed={filter === v}
            onClick={() => {
              setFilter(v!);
              setPage(1);
            }}
          >
            {l}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNotice error={q.error} />
      ) : (
        <section className="surface-card history-panel">
          {q.data?.items.map((i) => (
            <article className="history-row" key={i.id}>
              <Activity size={19} />
              <div>
                <strong>{labels[i.action] ?? i.action}</strong>
                <small>{formatDate(i.createdAt)}</small>
              </div>
              {i.target && <Link to={`${base}${i.target}`}>مشاهده جزئیات</Link>}
            </article>
          ))}
          {!q.data?.items.length && (
            <EmptyState
              title="عملیاتی با این فیلتر ثبت نشده است."
              description="عملیات بعدی به صورت خودکار به این تاریخچه اضافه می‌شوند."
            />
          )}
          <div className="history-pagination">
            <Button variant="ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>
              قبلی
            </Button>
            <span>
              صفحه {persianNumber(page)} · {persianNumber(q.data?.total ?? 0)} رویداد
            </span>
            <Button
              variant="ghost"
              disabled={page * 20 >= (q.data?.total ?? 0)}
              onClick={() => setPage(page + 1)}
            >
              بعدی
            </Button>
          </div>
        </section>
      )}
    </>
  );
}
