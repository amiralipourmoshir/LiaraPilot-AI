import { TelemetryDashboard } from '../components/telemetry-dashboard';
import { demoTelemetryTasks, demoTelemetryMetrics } from '../demo/telemetry';
import {
  LiveMonitoringPage,
  LiveIncidentsPage,
  LiveIncidentDetailPage,
  LiveLogsPage,
} from './live-observability';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  ArrowLeft,
  ArrowUpLeft,
  Clock3,
  Database,
  Download,
  Search,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { demoIncident, demoLogs, demoProjects, scopedItems, selectProjects } from '../demo/data';
import { formatDate, persianNumber, useWorkspace, useWorkspaceUi } from '../lib/workspace';
import { Mascot } from '../components/mascot';
import { Button } from '../components/ui/button';
import {
  CopyButton,
  DemoLabel,
  DemoRequired,
  EmptyState,
  PageTitle,
  SectionHeading,
  StatusBadge,
  TextLink,
} from '../components/primitives';
export function MonitoringPage() {
  const { mode } = useWorkspace();
  const { selectedProject } = useWorkspaceUi();
  if (mode === 'LIVE') return <LiveMonitoringPage />;
  if (mode !== 'DEMO') return <DemoRequired title={'هنوز داده پایش واقعی نداریم.'} />;
  const projects = selectProjects(selectedProject);
  const chartProject =
    projects[0] ?? demoProjects[0]!;
  return (
    <>
      <PageTitle
        eyebrow="پایداری، در جزئیات دیده می‌شود"
        title="پایش سرویس‌ها"
        description="سلامت، سهم فایل‌ها و گلوگاه‌های عملکرد را یک‌جا بررسی کنید."
      >
        <DemoLabel />
      </PageTitle>
      <TelemetryDashboard
        key={chartProject.id}
        tasks={demoTelemetryTasks(chartProject.id)}
        metrics={demoTelemetryMetrics}
        demo
      />
    </>
  );
}

export function IncidentsPage() {
  const { base, mode } = useWorkspace();
  const { selectedProject } = useWorkspaceUi();
  const [filter, setFilter] = useState('all');
  if (mode === 'LIVE') return <LiveIncidentsPage />;
  if (mode !== 'DEMO') return <DemoRequired title="رخداد واقعی ثبت نشده است." />;
  const show =
    (selectedProject === 'all' || selectedProject === demoIncident.projectId) &&
    filter !== 'resolved';
  return (
    <>
      <PageTitle
        eyebrow="از نشانه‌ها تا علت احتمالی"
        title="رخدادها و خطاها"
        description="شواهد را کنار هم ببینید و پیش از هر اقدام، دلیل را بررسی کنید."
      >
        <DemoLabel />
      </PageTitle>
      <div className="filter-pills history-filter" role="group" aria-label="وضعیت رخداد">
        {[
          { id: 'all', label: 'همه رخدادها' },
          { id: 'open', label: 'نیازمند بررسی' },
          { id: 'resolved', label: 'بسته‌شده' },
        ].map((item) => (
          <button
            key={item.id}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {show ? (
        <Link className="surface-card incident-card" to={`${base}/incidents/${demoIncident.id}`}>
          <span className="incident-severity">
            <TriangleAlert size={22} />
          </span>
          <div>
            <span className="incident-subtitle">
              <bdi>atlas-api</bdi> · شدت متوسط · سناریوی دمو
            </span>
            <h2>{demoIncident.title}</h2>
            <p>خطای اتصال دیتابیس با پاسخ ۵۰۰ در لاگ‌های نمونه همراه شده است.</p>
            <span className="incident-time">
              شروع در سناریو: {formatDate(demoIncident.openedAt)}
            </span>
          </div>
          <StatusBadge status="attention" />
          <ArrowUpLeft size={18} />
        </Link>
      ) : (
        <EmptyState
          title="رخدادی با این فیلتر وجود ندارد."
          description="در این سناریو، فقط سرویس اطلس یک رخداد باز دارد."
        />
      )}
      <div className="information-note">
        <ShieldCheck size={17} />
        رخداد دمو روی هیچ سرویس واقعی اختلال ایجاد نمی‌کند.
      </div>
    </>
  );
}
export function IncidentDetailPage() {
  const { id } = useParams();
  const { base, mode } = useWorkspace();
  if (mode === 'LIVE') return <LiveIncidentDetailPage />;
  if (mode !== 'DEMO') return <DemoRequired />;
  if (id !== demoIncident.id)
    return (
      <EmptyState
        title="رخداد نمونه پیدا نشد."
        description="به فهرست رخدادها برگردید."
        action={
          <Button asChild>
            <Link to={`${base}/incidents`}>همه رخدادها</Link>
          </Button>
        }
      />
    );
  return (
    <>
      <TextLink to={`${base}/incidents`}>همه رخدادها</TextLink>
      <PageTitle
        title={demoIncident.title}
        description="سرویس اطلس · رخداد نمونه · هیچ تشخیص زنده‌ای اجرا نشده است"
      >
        <StatusBadge status="attention" />
        <DemoLabel />
      </PageTitle>
      <div className="incident-summary">
        <span>
          <TriangleAlert size={17} />
          شدت: متوسط
        </span>
        <span>
          <Clock3 size={17} />
          شروع نمونه: {formatDate(demoIncident.openedAt)}
        </span>
        <span>
          <Database size={17} />
          دسته: اتصال دیتابیس
        </span>
      </div>
      <div className="incident-detail-grid">
        <div>
          <section className="surface-card diagnosis-card">
            <SectionHeading
              title="علت احتمالی در سناریو"
              action={<span className="hypothesis-tag">فرضیه، نه نتیجه قطعی</span>}
            />
            <p className="diagnosis-hypothesis">{demoIncident.hypothesis}</p>
            <p className="diagnosis-description">
              خطای ECONNREFUSED با شکست اتصال سازگار است؛ این شواهد به‌تنهایی خرابی دیتابیس یا
              اشتباه بودن تنظیمات را ثابت نمی‌کنند.
            </p>
            <div className="evidence-links">
              <span>بر پایه شواهد:</span>
              {demoIncident.evidenceIds.map((id) => (
                <a key={id} href={`#${id}`}>
                  <code>{id}</code>
                </a>
              ))}
            </div>
            <div className="diagnosis-missing">
              <h3>چه چیزی هنوز نمی‌دانیم؟</h3>
              {demoIncident.missingEvidence.map((item) => (
                <span key={item}>
                  <span className="hollow-dot" />
                  {item}
                </span>
              ))}
            </div>
          </section>
          <section className="surface-card evidence-panel">
            <SectionHeading
              title="شواهد ثبت‌شده"
              description="زمان‌ها و متن‌ها بخشی از داده ثابت دمو هستند."
            />
            {demoLogs
              .filter((log) => demoIncident.evidenceIds.includes(log.id))
              .map((log) => (
                <article key={log.id} id={log.id} className="evidence-item">
                  <header>
                    <code>{log.id}</code>
                    <span>{formatDate(log.at)}</span>
                    <CopyButton value={log.message} />
                  </header>
                  <pre dir="ltr">{log.message}</pre>
                  <small>
                    منبع نمونه: <bdi>{log.source}</bdi>
                  </small>
                </article>
              ))}
          </section>
        </div>
        <aside>
          <section className="surface-card remediation-card">
            <div className="remediation-heading">
              <Mascot size={43} />
              <h2>پیشنهاد پایلوت</h2>
            </div>
            <p>{demoIncident.recommendation}</p>
            <Link
              to={`${base}/assistant`}
              state={{ prompt: 'خطای ۵۰۰ اطلس را با شواهد بررسی کن' }}
              className="button button-primary"
            >
              بررسی در فضای دستیار
              <ArrowLeft size={16} />
            </Link>
            <div className="remediation-safety">
              <ShieldCheck size={17} />
              اجرای اصلاح واقعی و تأیید عملیات در فازهای بعد اضافه می‌شوند.
            </div>
          </section>
          <section className="surface-card incident-timeline">
            <SectionHeading title="خط زمانی سناریو" />
            <ol>
              <li>
                <i />
                <div>
                  <b>نسخه جدید ثبت شد</b>
                  <small>۱۲:۰۵ · تنظیمات اتصال تغییر کرد</small>
                </div>
              </li>
              <li>
                <i />
                <div>
                  <b>اولین خطا دیده شد</b>
                  <small>۱۲:۰۸ · پاسخ نمونه HTTP 500</small>
                </div>
              </li>
              <li>
                <i />
                <div>
                  <b>شواهد کنار هم قرار گرفتند</b>
                  <small>لاگ‌ها و پاسخ ناموفق نمونه</small>
                </div>
              </li>
              <li className="pending-timeline">
                <i />
                <div>
                  <b>نیازمند بررسی بیشتر</b>
                  <small>اقدام اصلاحی اجرا نشده است</small>
                </div>
              </li>
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
export function LogsPage() {
  const { mode } = useWorkspace();
  const { selectedProject } = useWorkspaceUi();
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('all');
  if (mode === 'LIVE') return <LiveLogsPage />;
  if (mode !== 'DEMO') return <DemoRequired title={'لاگ سرویس ابری در دسترس نیست.'} />;
  const rows = scopedItems(demoLogs, selectedProject).filter(
    (log) =>
      (level === 'all' || level === log.level) &&
      `${log.message} ${log.source}`.toLowerCase().includes(search.toLowerCase()),
  );
  const download = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          '# LiaraPilot demo logs — static fixtures\n' +
            rows.map((log) => `${log.at} [${log.level.toUpperCase()}] ${log.message}`).join('\n'),
        ],
        { type: 'text/plain;charset=utf-8' },
      ),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'liarapilot-demo-logs.txt';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <PageTitle
        eyebrow="رد هر اتفاق را پیدا کنید"
        title="لاگ‌ها"
        description="متن لاگ‌های سناریوی نمونه را جستجو و بر اساس سطح فیلتر کنید."
      >
        <Button variant="secondary" onClick={download} disabled={!rows.length}>
          <Download size={16} />
          دریافت لاگ‌های دمو
        </Button>
      </PageTitle>
      <div className="surface-card logs-workspace">
        <div className="logs-toolbar">
          <div className="inline-search">
            <Search size={17} />
            <input
              aria-label="جستجو در لاگ‌ها"
              placeholder="جستجو در متن لاگ…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select
            className="plain-select"
            aria-label="سطح لاگ"
            value={level}
            onChange={(event) => setLevel(event.target.value)}
          >
            <option value="all">همه سطح‌ها</option>
            <option value="error">خطا / ERROR</option>
            <option value="warn">هشدار / WARN</option>
            <option value="info">اطلاعات / INFO</option>
          </select>
          <span className="static-log-badge">
            <i />
            نمایش ثابت
            <DemoLabel compact />
          </span>
        </div>
        <div className="logs-column-header" dir="ltr">
          <span>TIME (UTC)</span>
          <span>LEVEL</span>
          <span>MESSAGE</span>
        </div>
        {rows.length ? (
          <div className="log-console main-log-console" dir="ltr">
            {rows.map((log) => (
              <div key={log.id} className={`log-entry log-${log.level}`}>
                <time>{log.at.slice(11, 19)}</time>
                <span>{log.level.toUpperCase()}</span>
                <code>{log.message}</code>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="لاگی با این فیلتر پیدا نشد."
            description="عبارت جستجو یا سطح لاگ را تغییر دهید."
          />
        )}
        <footer className="logs-footer">
          <span>{persianNumber(rows.length)} خط نمونه</span>
          <span>منبع: fixture محلی · تاریخ نمونه ۲۳ اکتبر ۲۰۲۶ · ساعت لاگ‌ها UTC</span>
        </footer>
      </div>
    </>
  );
}
