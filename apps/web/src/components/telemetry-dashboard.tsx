import { useState } from 'react';
import { z } from 'zod';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowUpLeft,
  Boxes,
  ChartNoAxesCombined,
  CircleCheck,
  Clock3,
  Cpu,
  FileCode2,
  HardDrive,
  Layers3,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import {
  scanResult,
  storedAnalysis,
  taskSchema,
} from '../../../../packages/shared/src/reliability';
import { metricObservation, summarizeReport } from '../../../../packages/shared/src/telemetry';
import { cloudMetricsSchema } from '../../../../packages/shared/src/cloud';
import { Button } from './ui/button';
import { SectionHeading } from './primitives';
import { formatDate, persianNumber as n } from '../lib/workspace';
import './reliability.css';
type Task = z.infer<typeof taskSchema>;
const palette = ['#69d9c2', '#839cff', '#e9b774', '#be9df2', '#65bbdf', '#e28cab'];
const tip = {
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  color: 'var(--text)',
  fontFamily: 'Kalameh',
  fontSize: 12,
};
const tick = { fill: 'var(--subtle)', fontSize: 11, fontFamily: 'Kalameh' };
function bytes(value: number) {
  return value >= 1048576 ? `${n(value / 1048576, 1)} MB` : `${n(value / 1024, 1)} KB`;
}
function EmptyChart({
  text = 'پس از اولین اسکن تأییدشده، داده‌های این بخش نمایش داده می‌شوند.',
}: {
  text?: string;
}) {
  return (
    <div className="telemetry-empty">
      <ChartNoAxesCombined size={30} />
      <strong>منتظر داده‌های واقعی</strong>
      <p>{text}</p>
    </div>
  );
}
function Donut({
  data,
  total,
  label,
}: {
  data: { name: string; value: number; color: string }[];
  total: string;
  label: string;
}) {
  return (
    <div className="telemetry-donut">
      <ResponsiveContainer width="100%" height={220} minWidth={0}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={72}
            outerRadius={91}
            paddingAngle={data.length > 1 ? 4 : 0}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={tip} formatter={(value) => n(Number(value), 1)} />
        </PieChart>
      </ResponsiveContainer>
      <div className="telemetry-donut-label">
        <strong dir="ltr">{total}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}
export function TelemetryDashboard({
  tasks,
  metrics,
  metricsError,
  onAnalyze,
  analyzing,
  onFix,
  demo = false,
}: {
  tasks: Task[];
  metrics?: z.infer<typeof cloudMetricsSchema>;
  metricsError?: string;
  onAnalyze?: (id: string) => void;
  analyzing?: boolean;
  onFix?: (text: string) => void;
  demo?: boolean;
}) {
  const scans = tasks.filter((t) => t.kind === 'SCAN' && scanResult.safeParse(t.result).success);
  const [selected, setSelected] = useState(''),
    [chartMetric, setChartMetric] = useState<'load' | 'bytes' | 'requests'>('load'),
    [pageFilter, setPageFilter] = useState('all'),
    [search, setSearch] = useState(''),
    [assetPage, setAssetPage] = useState('all'),
    [assetMode, setAssetMode] = useState('types'),
    [inventorySearch, setInventorySearch] = useState(''),
    [resource, setResource] = useState<'cpuUsage' | 'memoryUsage'>('cpuUsage');
  const latest = scans.find((t) => t.id === selected) ?? scans[0];
  const report = latest ? scanResult.parse(latest.result) : null;
  const stats = report ? summarizeReport(report) : null;
  const analysis = latest
    ? z.object({ analysis: storedAnalysis.optional() }).safeParse(latest.result).data?.analysis
    : undefined;
  const previous = scans[scans.findIndex((t) => t.id === latest?.id) + 1];
  const before = previous ? summarizeReport(scanResult.parse(previous.result)) : null;
  const history = [...scans].reverse().map((t) => {
    const s = summarizeReport(scanResult.parse(t.result));
    return {
      time: formatDate(t.createdAt),
      timestamp: new Date(t.createdAt).getTime(),
      load: s.median,
      bytes: s.totalBytes / 1024,
      requests: s.requests,
    };
  });
  const pages =
    report?.pages.filter(
      (p) =>
        (!search || p.path.toLowerCase().includes(search.toLowerCase())) &&
        (pageFilter === 'all' ||
          (pageFilter === 'error'
            ? p.status === null || p.status >= 400 || p.errors.length > 0
            : (p.loadMs || p.durationMs) > 2500)),
    ) ?? [];
  const selectedAssets =
    report?.pages
      .filter((p) => assetPage === 'all' || p.path === assetPage)
      .flatMap((p) => p.assets.map((a) => ({ ...a, page: p.path }))) ?? [];
  const heavy = [...selectedAssets].sort((a, b) => b.bytes - a.bytes).slice(0, 8);
  const http = [
    {
      name: 'موفق',
      value:
        report?.pages.filter((p) => p.status !== null && p.status >= 200 && p.status < 400)
          .length ?? 0,
      color: palette[0]!,
    },
    { name: 'خطای HTTP', value: stats?.failed ?? 0, color: '#ef8b99' },
  ].filter((v) => v.value > 0);
  const observations = (metrics?.[resource] ?? []).map((s, i) => ({
    name: `نمونه ${n(i + 1)}`,
    id: s.applet,
    observation: metricObservation(s.value),
  }));
  const available = observations.filter((v) => v.observation !== null);
  const sum = available.reduce((a, v) => a + Math.max(0, v.observation!.value), 0);
  const byFile = new Map<string, number>();
  for (const p of report?.pages ?? [])
    for (const a of p.assets) byFile.set(a.url, (byFile.get(a.url) ?? 0) + a.bytes);
  const rankedFiles = [...byFile.entries()].sort((a, b) => b[1] - a[1]);
  const fileSlices = rankedFiles.slice(0, 5).map(([url, size], i) => ({
    type: url,
    label: url.split('/').pop() || url,
    bytes: size,
    color: palette[i % palette.length]!,
  }));
  if (rankedFiles.length > 5)
    fileSlices.push({
      type: 'other-files',
      label: 'سایر فایل‌ها',
      bytes: rankedFiles.slice(5).reduce((a, v) => a + v[1], 0),
      color: '#748697',
    });
  const slices = assetMode === 'types' ? (stats?.assets ?? []) : fileSlices;
  const assetTotal = stats?.assets.reduce((a, g) => a + g.bytes, 0) ?? 0;
  return (
    <div className="telemetry-dashboard">
      <div className="telemetry-toolbar">
        <div>
          <span className="telemetry-live">
            <i />
            {demo ? 'داده نمایشی' : 'پایش مبتنی بر شواهد'}
          </span>
          <span className="telemetry-updated">
            {latest ? `آخرین اسکن · ${formatDate(latest.createdAt)}` : 'هنوز اسکن صفحات انجام نشده'}
          </span>
        </div>
        {scans.length > 0 && (
          <select
            className="plain-select"
            aria-label="گزارش اسکن"
            value={latest?.id ?? ''}
            onChange={(e) => setSelected(e.target.value)}
          >
            {scans.map((t) => (
              <option key={t.id} value={t.id}>
                {formatDate(t.createdAt)}
              </option>
            ))}
          </select>
        )}
      </div>
      {report && (
        <section className="surface-card crawl-coverage">
          <div>
            <span className="telemetry-live">
              <i />
              پوشش واکشی سایت
            </span>
            <h3>
              {n(report.pages.length)} صفحه بررسی‌شده از {n(report.discovered)} مسیر کشف‌شده
            </h3>
            <p>
              {n(report.resources?.length ?? stats?.uniqueFiles ?? 0)} فایل و درخواست یکتا ·{' '}
              {report.truncated
                ? 'برخی مسیرها به محدودیت اجرا رسیده‌اند'
                : 'صف کشف‌شده این اجرا بررسی شد'}
            </p>
          </div>
          <div className="crawl-sources">
            {Object.entries({
              SITEMAP: 'نقشه سایت',
              DOM: 'لینک‌های صفحات',
              JAVASCRIPT: 'مسیرهای جاوااسکریپت',
              REDIRECT: 'دامنه نهایی',
              NAVIGATION: 'ناوبری خواندنی',
            }).map(([key, label]) => {
              const count =
                report.discovery
                  ?.filter((d) => d.source === key)
                  .reduce((a, d) => a + d.count, 0) ?? 0;
              return (
                <span key={key}>
                  {label}
                  <b>{n(count)}</b>
                </span>
              );
            })}
          </div>
          {report.warnings?.map((w, i) => (
            <p className="crawl-warning" key={i}>
              <TriangleAlert size={14} />
              {w}
            </p>
          ))}
          {report.pendingPaths?.length ? (
            <details>
              <summary>مسیرهای کشف‌شده اما بررسی‌نشده ({n(report.pendingPaths.length)})</summary>
              <pre dir="ltr">{report.pendingPaths.join('\n')}</pre>
            </details>
          ) : null}
        </section>
      )}
      <div className="monitoring-stats telemetry-kpis">
        {[
          {
            Icon: Clock3,
            label: 'میانه زمان بارگذاری',
            value: stats?.median === null || !stats ? '—' : `${n(stats.median)} ms`,
            caption:
              before?.median && stats?.median
                ? `${stats.median < before.median ? 'کاهش' : 'افزایش'} ${n(Math.abs(stats.median - before.median))} ms نسبت به اسکن قبلی`
                : 'اندازه‌گیری از محل worker',
          },
          {
            Icon: Layers3,
            label: 'حجم پاسخ‌ها',
            value: stats ? bytes(stats.totalBytes) : '—',
            caption: stats
              ? `${n(stats.uniqueFiles)} مسیر فایل یکتا در گزارش`
              : 'بدنه پاسخ‌ها، بدون سربار شبکه',
          },
          {
            Icon: Boxes,
            label: 'درخواست‌های بارگذاری',
            value: stats ? n(stats.requests) : '—',
            caption: report
              ? `مجموع ${n(report.pages.length)} صفحه بررسی‌شده`
              : 'HTML، فایل‌ها و درخواست‌های API',
          },
          {
            Icon: ShieldCheck,
            label: 'صفحات بدون خطای HTTP',
            value: report?.pages.length
              ? `${n(((report.pages.length - (stats?.failed ?? 0)) / report.pages.length) * 100, 1)}٪`
              : '—',
            caption: stats
              ? `${n(stats.errors)} پیام خطای مرورگر و شبکه`
              : 'پس از اسکن محاسبه می‌شود',
          },
        ].map((item) => (
          <div className="surface-card monitoring-stat" key={item.label}>
            <span>
              <item.Icon size={18} />
              {item.label}
            </span>
            <strong>
              <bdi>{item.value}</bdi>
            </strong>
            <small>{item.caption}</small>
          </div>
        ))}
      </div>
      <div className="telemetry-main-grid">
        <section className="surface-card telemetry-trend">
          <SectionHeading
            title="نبض عملکرد سایت"
            description="مقایسه اسکن‌های ثبت‌شده، با فاصله زمانی واقعی"
            action={
              <span className="telemetry-chip">
                <Activity size={13} />
                {n(scans.length)} گزارش
              </span>
            }
          />
          <div className="chart-metric-tabs" role="group" aria-label="نمودار عملکرد">
            {[
              { id: 'load', name: 'زمان بارگذاری' },
              { id: 'bytes', name: 'حجم پاسخ‌ها' },
              { id: 'requests', name: 'تعداد درخواست' },
            ].map((i) => (
              <button
                key={i.id}
                aria-pressed={chartMetric === i.id}
                onClick={() => setChartMetric(i.id as typeof chartMetric)}
              >
                {i.name}
              </button>
            ))}
          </div>
          {history.length ? (
            <div className="telemetry-area" dir="ltr">
              <ResponsiveContainer width="100%" height={240} minWidth={0}>
                <AreaChart data={history} margin={{ left: 0, right: 20, top: 15, bottom: 0 }}>
                  <defs>
                    <linearGradient
                      id={`telemetry-${demo ? 'demo' : 'live'}-${chartMetric}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#69d9c2" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#69d9c2" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="3 6" />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(v) =>
                      new Date(Number(v)).toLocaleTimeString('fa-IR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    }
                    tick={tick}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={55}
                  />
                  <YAxis tick={tick} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={tip}
                    labelFormatter={(v) => formatDate(new Date(Number(v)).toISOString())}
                    formatter={(v) => [
                      `${n(Number(v), 1)} ${chartMetric === 'load' ? 'ms' : chartMetric === 'bytes' ? 'KB' : 'درخواست'}`,
                      'مقدار',
                    ]}
                  />
                  <Area
                    dataKey={chartMetric}
                    type="monotone"
                    stroke="#69d9c2"
                    strokeWidth={2.5}
                    dot={{ r: 4, strokeWidth: 2, fill: 'var(--panel)' }}
                    fill={`url(#telemetry-${demo ? 'demo' : 'live'}-${chartMetric})`}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart />
          )}
          <footer className="telemetry-card-footer">
            <span>
              میانه بارگذاری: {stats?.median !== null && stats ? `${n(stats.median)} ms` : '—'}
            </span>
            <span>صدک ۹۵: {stats?.p95 !== null && stats ? `${n(stats.p95)} ms` : '—'}</span>
          </footer>
        </section>
        <section className="surface-card telemetry-ai">
          <div className="telemetry-ai-top">
            <span className="telemetry-ai-icon">
              <Sparkles size={22} />
            </span>
            <span className="telemetry-chip">بینش پایلوت</span>
          </div>
          <h2>یک نگاه هوشمند، به تمام جزئیات</h2>
          <p>ارزیابی سرعت، خطاها و بار فایل‌ها بر اساس شواهد همین اسکن.</p>
          <div className="telemetry-score">
            <svg viewBox="0 0 140 140" aria-hidden="true">
              <circle cx="70" cy="70" r="57" className="score-track" />
              <circle
                cx="70"
                cy="70"
                r="57"
                className="score-value"
                style={{ strokeDasharray: `${((analysis?.score ?? 0) / 100) * 358} 358` }}
              />
            </svg>
            <div>
              <strong>{analysis ? n(analysis.score) : '—'}</strong>
              <small>از ۱۰۰</small>
            </div>
          </div>
          <span className="telemetry-score-caption">
            {analysis ? 'امتیاز تخمینی هوش مصنوعی' : 'هنوز تحلیل نشده'}
          </span>
          <p className="telemetry-ai-summary">
            {analysis?.summary ??
              'پس از ثبت اسکن، پایلوت نقاط قوت و گلوگاه‌های محتمل را بررسی و پیشنهادهای اصلاح را اولویت‌بندی می‌کند.'}
          </p>
          {onAnalyze && (
            <Button disabled={!latest || analyzing} onClick={() => latest && onAnalyze(latest.id)}>
              <Sparkles size={16} />
              {analyzing
                ? 'در حال موشکافی گزارش…'
                : analysis
                  ? 'تحلیل دوباره با هوش مصنوعی'
                  : 'تحلیل هوشمند عملکرد'}
            </Button>
          )}
          {demo && <span className="telemetry-chip">تحلیل نمونه · بدون تماس با مدل</span>}
          <small>این امتیاز معادل Lighthouse یا Core Web Vitals نیست.</small>
        </section>
      </div>
      <div className="telemetry-three-grid">
        <section className="surface-card">
          <SectionHeading
            title="سهم فایل‌ها در بارگذاری"
            description="توزیع حجم assetهای ثبت‌شده"
            action={
              <select
                className="plain-select"
                aria-label="تفکیک سهم فایل‌ها"
                value={assetMode}
                onChange={(e) => setAssetMode(e.target.value)}
              >
                <option value="types">نوع فایل</option>
                <option value="files">هر فایل</option>
              </select>
            }
          />
          {stats && assetTotal > 0 ? (
            <>
              <Donut
                data={slices
                  .filter((a) => a.bytes > 0)
                  .map((a) => ({ name: a.label, value: a.bytes, color: a.color }))}
                total={bytes(assetTotal)}
                label="فایل‌های اندازه‌گیری‌شده"
              />
              <div className="telemetry-legend">
                {slices.map((a) => (
                  <div key={a.type}>
                    <span title={a.type}>
                      <i style={{ background: a.color }} />
                      {a.label}
                    </span>
                    <b>{n((a.bytes / assetTotal) * 100, 1)}٪</b>
                    <small dir="ltr">{bytes(a.bytes)}</small>
                  </div>
                ))}
              </div>
              <p className="telemetry-footnote">
                {stats.measuredBytes < stats.totalBytes
                  ? 'فهرست فایل‌ها محدود است؛ این نمودار تمام حجم پاسخ‌ها را پوشش نمی‌دهد.'
                  : 'درخواست تکراری هر فایل نیز در سهم آن محاسبه شده است.'}
              </p>
            </>
          ) : (
            <EmptyChart text="برای محاسبه سهم فایل‌ها، جزئیات assetهای اسکن لازم است." />
          )}
        </section>
        <section className="surface-card">
          <SectionHeading
            title="وضعیت پاسخ صفحات"
            description="تفکیک دسترسی HTTP؛ مستقل از خطای جاوااسکریپت"
          />
          {report?.pages.length ? (
            <>
              <Donut data={http} total={n(report.pages.length)} label="صفحه بررسی‌شده" />
              <div className="telemetry-legend">
                {http.map((d) => (
                  <div key={d.name}>
                    <span>
                      <i style={{ background: d.color }} />
                      {d.name}
                    </span>
                    <b>{n(d.value)}</b>
                  </div>
                ))}
                <div>
                  <span>
                    <i style={{ background: palette[2] }} />
                    بارگذاری بیش از ۲٫۵ ثانیه
                  </span>
                  <b>{n(stats?.slow ?? 0)}</b>
                </div>
              </div>
              <p className="telemetry-footnote">
                آستانه ۲٫۵ ثانیه، بودجه داخلی زمان load است؛ معیار LCP نیست.
              </p>
            </>
          ) : (
            <EmptyChart />
          )}
        </section>
        <section className="surface-card">
          <SectionHeading
            title="سهم نمونه‌های منابع"
            description="توزیع مقدار جاری بین نمونه‌های همان سرویس"
          />
          <div className="chart-metric-tabs">
            {[
              { key: 'cpuUsage', text: 'پردازنده', Icon: Cpu },
              { key: 'memoryUsage', text: 'حافظه', Icon: HardDrive },
            ].map((r) => (
              <button
                key={r.key}
                aria-pressed={resource === r.key}
                onClick={() => setResource(r.key as typeof resource)}
              >
                <r.Icon size={13} />
                {r.text}
              </button>
            ))}
          </div>
          {sum > 0 ? (
            <>
              <Donut
                data={available.map((v, i) => ({
                  name: v.name,
                  value: Math.max(0, v.observation!.value),
                  color: palette[i % palette.length]!,
                }))}
                total={n(sum, 3)}
                label="جمع مقادیر خام"
              />
              <div className="telemetry-legend">
                {available.map((v, i) => (
                  <div key={v.id}>
                    <span title={v.id}>
                      <i style={{ background: palette[i % palette.length] }} />
                      {v.name}
                    </span>
                    <b>{n((v.observation!.value / sum) * 100, 1)}٪</b>
                    <small>{n(v.observation!.value, 4)}</small>
                  </div>
                ))}
              </div>
            </>
          ) : available.length ? (
            <div className="telemetry-zero">
              <Cpu size={32} />
              <strong>مقدار جاری صفر</strong>
              <p>سهم نسبی برای مجموع صفر تعریف نمی‌شود.</p>
            </div>
          ) : (
            <EmptyChart
              text={
                metricsError
                  ? 'دریافت منابع از لیارا انجام نشد؛ دوباره تازه‌سازی کنید.'
                  : 'نمونه معتبر زمان/مقدار برای این منبع موجود نیست.'
              }
            />
          )}
          <p className="telemetry-footnote">
            سهم نسبی نمونه‌ها، درصد ظرفیت پلن نیست. واحد مصرف در قرارداد موجود تأیید نشده است.
          </p>
          {available[0] && (
            <small className="telemetry-footnote">
              اندازه‌گیری: {formatDate(available[0].observation!.time)}
            </small>
          )}
        </section>
      </div>
      {analysis && (
        <section className="surface-card telemetry-findings">
          <SectionHeading
            title="موشکافی پایلوت"
            description={`اطمینان ${analysis.confidence === 'HIGH' ? 'بالا' : analysis.confidence === 'MEDIUM' ? 'متوسط' : 'محدود'} · ${formatDate(analysis.analyzedAt)}`}
          />
          <div className="telemetry-findings-grid">
            {analysis.findings.map((f, i) => (
              <article key={i}>
                <header>
                  <span className={`telemetry-severity severity-${f.severity}`}>
                    {f.severity === 'HIGH'
                      ? 'اولویت بالا'
                      : f.severity === 'MEDIUM'
                        ? 'اولویت متوسط'
                        : 'پیشنهاد بهبود'}
                  </span>
                  <code>{f.path}</code>
                </header>
                <h3>{f.title}</h3>
                <p>{f.evidence}</p>
                <div className="telemetry-recommendation">
                  <Sparkles size={15} />
                  <p>{f.recommendation}</p>
                </div>
                {onFix && (
                  <Button variant="ghost" onClick={() => onFix(`${f.path}: ${f.recommendation}`)}>
                    بررسی اصلاح با پچ <ArrowUpLeft size={15} />
                  </Button>
                )}
              </article>
            ))}
          </div>
          <div className="telemetry-analysis-notes">
            {analysis.strengths.map((s, i) => (
              <p key={i}>
                <CircleCheck size={15} />
                {s}
              </p>
            ))}
            {analysis.limitations.map((s, i) => (
              <p key={i}>
                <TriangleAlert size={15} />
                {s}
              </p>
            ))}
          </div>
        </section>
      )}
      <div className="telemetry-bottom-grid">
        <section className="surface-card">
          <SectionHeading
            title="کدام صفحه کندتر است؟"
            description="۸ مسیر با بیشترین زمان بارگذاری"
          />
          {report?.pages.length ? (
            <div className="telemetry-bars" dir="ltr">
              <ResponsiveContainer width="100%" height={280} minWidth={0}>
                <BarChart
                  layout="vertical"
                  data={[...report.pages]
                    .sort((a, b) => (b.loadMs || b.durationMs) - (a.loadMs || a.durationMs))
                    .slice(0, 8)
                    .map((p) => ({ path: p.path, load: p.loadMs || p.durationMs }))}
                  margin={{ left: 10, right: 28 }}
                >
                  <CartesianGrid stroke="var(--line)" horizontal={false} strokeDasharray="3 6" />
                  <XAxis type="number" tick={tick} axisLine={false} />
                  <YAxis
                    dataKey="path"
                    type="category"
                    width={105}
                    tick={tick}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tip}
                    formatter={(v) => [`${n(Number(v))} ms`, 'زمان load']}
                  />
                  <Bar
                    dataKey="load"
                    fill="#839cff"
                    radius={[0, 5, 5, 0]}
                    barSize={14}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart />
          )}
        </section>
        <section className="surface-card">
          <SectionHeading
            title="سنگین‌ترین فایل‌ها"
            description="اولویت بررسی برای کاهش حجم بارگذاری"
            action={
              report && (
                <select
                  className="plain-select"
                  aria-label="صفحه فایل‌ها"
                  value={assetPage}
                  onChange={(e) => setAssetPage(e.target.value)}
                >
                  <option value="all">همه صفحات</option>
                  {report.pages.map((p) => (
                    <option key={p.path} value={p.path}>
                      {p.path}
                    </option>
                  ))}
                </select>
              )
            }
          />
          {heavy.length ? (
            <div className="telemetry-assets">
              {heavy.map((a, i) => (
                <div key={i}>
                  <span className="telemetry-file-icon">
                    <FileCode2 size={16} />
                  </span>
                  <div>
                    <span dir="ltr" title={a.url}>
                      {a.url}
                    </span>
                    <small dir="ltr">
                      {a.type} · {a.page}
                    </small>
                    <i>
                      <b
                        style={{
                          width: `${Math.max(2, (a.bytes / (heavy[0]?.bytes || 1)) * 100)}%`,
                        }}
                      />
                    </i>
                  </div>
                  <strong dir="ltr">{bytes(a.bytes)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <EmptyChart text="فایل‌های اسکن پس از ثبت جزئیات شبکه در این بخش نمایش داده می‌شوند." />
          )}
        </section>
      </div>
      <section className="surface-card telemetry-pages">
        <SectionHeading
          title="کالبدشکافی صفحات"
          description="وضعیت، سرعت و خطاها را صفحه‌به‌صفحه بررسی کنید."
        />
        <div className="telemetry-page-controls">
          <div className="filter-pills">
            {[
              { key: 'all', label: 'همه صفحات' },
              { key: 'error', label: 'دارای خطا' },
              { key: 'slow', label: 'کندتر از بودجه' },
            ].map((f) => (
              <button
                key={f.key}
                aria-pressed={pageFilter === f.key}
                onClick={() => setPageFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label className="telemetry-search">
            <Search size={16} />
            <input
              aria-label="جستجوی مسیر صفحات"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی مسیر…"
            />
          </label>
        </div>
        {report ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>مسیر صفحه</th>
                  <th>HTTP</th>
                  <th>زمان load</th>
                  <th>زمان DOM</th>
                  <th>درخواست</th>
                  <th>حجم پاسخ</th>
                  <th>موشکافی</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.path}>
                    <td>
                      <code dir="ltr">{p.path}</code>
                      {p.title && <small className="crawl-page-title">{p.title}</small>}
                    </td>
                    <td>
                      <span
                        className={`telemetry-http ${p.status !== null && p.status < 400 ? 'is-ok' : 'is-bad'}`}
                      >
                        {p.status ?? 'ناموفق'}
                      </span>
                    </td>
                    <td>
                      <bdi className={(p.loadMs || p.durationMs) > 2500 ? 'warning-text' : ''}>
                        {n(p.loadMs || p.durationMs)} ms
                      </bdi>
                    </td>
                    <td>
                      <bdi>{p.domMs === null ? '—' : `${n(p.domMs)} ms`}</bdi>
                    </td>
                    <td>{n(p.requests)}</td>
                    <td>
                      <bdi>{bytes(p.bytes)}</bdi>
                    </td>
                    <td>
                      <details>
                        <summary>{n(p.errors.length)} خطا · جزئیات</summary>
                        <div className="telemetry-page-detail">
                          {p.interactions?.map((step, i) => (
                            <p key={`step-${i}`}>
                              ناوبری: {step.label} · {n(step.requests)} درخواست · {n(step.newPaths)}{' '}
                              مسیر تازه ·{' '}
                              {step.outcome === 'READ_ONLY_UI_CHECKED'
                                ? 'بررسی شد'
                                : 'کنترل در دسترس نبود'}
                            </p>
                          ))}
                          {p.description && <p>{p.description}</p>}
                          <p>
                            منبع کشف: {p.source ?? 'ثبت قبلی'} · لینک: {n(p.linkCount ?? 0)} · المان
                            DOM: {n(p.domNodes ?? 0)} · تصویر: {n(p.imageCount ?? 0)} · تصویر بدون
                            alt: {n(p.imagesMissingAlt ?? 0)} · H1: {n(p.h1Count ?? 0)} · TTFB:{' '}
                            {p.ttfbMs === null || p.ttfbMs === undefined
                              ? '—'
                              : `${n(p.ttfbMs)} ms`}
                          </p>

                          {p.errors.length ? (
                            p.errors.map((e, i) => (
                              <pre dir="ltr" key={i}>
                                {e}
                              </pre>
                            ))
                          ) : (
                            <p>خطایی در این اجرا ثبت نشده است.</p>
                          )}
                          {p.assets.map((a, i) => (
                            <p dir="ltr" key={i}>
                              {a.status} · {a.type} · {a.url} · {bytes(a.bytes)}
                            </p>
                          ))}
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!pages.length && (
              <p className="telemetry-footnote">صفحه‌ای با این فیلتر وجود ندارد.</p>
            )}
          </div>
        ) : (
          <EmptyChart />
        )}
        <footer className="telemetry-card-footer">
          <span>
            {report
              ? `${n(report.pages.length)} از ${n(report.discovered)} صفحه کشف‌شده`
              : 'بدون داده ثبت‌شده'}
          </span>
          <span>
            {report?.truncated
              ? 'پوشش اسکن ناقص است'
              : report
                ? `${n(report.blocked)} درخواست مسدودشده`
                : 'اسکن با تأیید شما آغاز می‌شود'}
          </span>
        </footer>
        {report && (
          <details className="telemetry-scope">
            <summary>محدوده و محدودیت اندازه‌گیری</summary>
            <p>{report.scope}</p>
            <p>
              زمان‌ها از محل worker و حجم‌ها برای بدنه پاسخ‌اند. مرورگر کاربر، حجم فشرده شبکه و Core
              Web Vitals در این گزارش اندازه‌گیری نشده‌اند.
            </p>
          </details>
        )}
      </section>
      {!!report?.resources?.length && (
        <section className="surface-card crawl-inventory">
          <SectionHeading
            title="فهرست کامل فایل‌ها و درخواست‌های ثبت‌شده"
            description="هر منبع در کدام صفحه بارگذاری شده و چه حجمی داشته است؟"
            action={
              <label className="telemetry-search">
                <Search size={15} />
                <input
                  aria-label="جستجوی فایل‌های سایت"
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  placeholder="نام فایل یا مسیر…"
                />
              </label>
            }
          />
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>فایل / درخواست</th>
                  <th>نوع</th>
                  <th>HTTP</th>
                  <th>تعداد بارگذاری</th>
                  <th>حجم مجموع</th>
                  <th>صفحات مرتبط</th>
                </tr>
              </thead>
              <tbody>
                {report.resources
                  .filter((r) => r.url.toLowerCase().includes(inventorySearch.toLowerCase()))
                  .map((r, i) => (
                    <tr key={i}>
                      <td>
                        <code dir="ltr" title={r.url}>
                          {r.url}
                        </code>
                      </td>
                      <td>{r.type}</td>
                      <td>{r.status}</td>
                      <td>{n(r.requests)}</td>
                      <td>
                        <bdi>{bytes(r.bytes)}</bdi>
                      </td>
                      <td>
                        <details>
                          <summary>{n(r.pages.length)} صفحه</summary>
                          {r.pages.map((p) => (
                            <p key={p} dir="ltr">
                              {p}
                            </p>
                          ))}
                        </details>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
