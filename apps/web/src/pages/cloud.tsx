import { PlatformMark } from '../components/platform-mark';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpLeft, Database, FileText, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  cloudApplicationSchema,
  cloudApplicationsSchema,
  cloudCapabilitiesSchema,
  cloudLogsSchema,
  cloudMetricsSchema,
  cloudReleasesSchema,
} from '../../../../packages/shared/src/cloud';
import { api } from '../lib/api';
import { formatDate, persianNumber, useWorkspace } from '../lib/workspace';
import { Button } from '../components/ui/button';
import {
  CopyButton,
  EmptyState,
  PageTitle,
  SectionHeading,
  TextLink,
} from '../components/primitives';
import { ErrorNotice, Loading } from '../components/common';
export function CloudApplicationsPage() {
  const { base, preview, user, mode } = useWorkspace();
  const applications = useQuery({
    queryKey: ['cloud-applications', user.id],
    enabled: !preview && mode === 'LIVE',
    queryFn: () => api('/applications', cloudApplicationsSchema),
    retry: false,
  });
  if (preview || mode !== 'LIVE')
    return (
      <EmptyState
        title="اطلاعات واقعی در فضای لیارا قرار دارد."
        description="برای دریافت اطلاعات سرویس‌های خود، از صفحه اتصال‌ها وارد اتصال واقعی شوید."
        action={
          <Button asChild>
            <Link to={`${base}/connections`}>
              اتصال‌ها
              <ArrowLeft size={16} />
            </Link>
          </Button>
        }
      />
    );
  return (
    <>
      <PageTitle
        eyebrow="اتصال واقعی، اطلاعات قابل ردیابی"
        title="سرویس‌های لیارا"
        description="آخرین اطلاعات دریافت‌شده از حساب متصل؛ این فهرست داده دمو ندارد."
      >
        <span className="live-label">منبع: Liara API</span>
        <Button asChild variant="secondary">
          <Link to={`${base}/connections`}>مدیریت و همگام‌سازی اتصال‌ها</Link>
        </Button>
      </PageTitle>
      {applications.isPending ? (
        <Loading label="در حال دریافت فهرست سرویس‌ها…" />
      ) : applications.error ? (
        <ErrorNotice
          error={applications.error}
          retry={() => {
            void applications.refetch();
          }}
        />
      ) : !applications.data.applications.length ? (
        <EmptyState
          title="سرویسی از اتصال فعال دریافت نشده است."
          description="حساب خود را متصل کنید یا فهرست اتصال را همگام‌سازی کنید. نبود سرویس می‌تواند به دسترسی توکن یا خالی بودن حساب مربوط باشد."
          action={
            <Button asChild>
              <Link to={`${base}/connections`}>
                اتصال حساب لیارا
                <ArrowLeft size={16} />
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="cloud-app-grid">
          {applications.data.applications.map((application) => (
            <Link
              className={`surface-card cloud-app-card ${application.providerMissing ? 'provider-missing' : ''}`}
              key={application.id}
              to={
                application.providerMissing
                  ? `${base}/connections`
                  : `${base}/applications/${application.id}`
              }
            >
              <div className="cloud-app-card-heading">
                <PlatformMark platform={application.platform} size={52} />
                <div>
                  <h2>
                    <bdi>{application.name}</bdi>
                  </h2>
                  <p>{application.connectionLabel}</p>
                </div>
                <ArrowUpLeft size={16} />
              </div>
              <dl>
                <div>
                  <dt>پلتفرم</dt>
                  <dd>
                    <PlatformMark platform={application.platform} size={28} label />
                  </dd>
                </div>
                <div>
                  <dt>وضعیت ارائه‌دهنده</dt>
                  <dd>
                    <bdi>{application.status ?? 'گزارش نشده'}</bdi>
                  </dd>
                </div>
                <div>
                  <dt>آخرین دریافت موفق</dt>
                  <dd>{formatDate(application.lastSeenAt)}</dd>
                </div>
              </dl>
              <div className="cloud-card-foot">
                <span className="live-label">داده واقعی</span>
                {application.providerMissing ? (
                  <span className="warning-text">در همگام‌سازی اخیر پیدا نشد</span>
                ) : (
                  <span>
                    {application.isDeployed ? 'نسخه منتشرشده دارد' : 'وضعیت انتشار تأیید نشده'}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
      <div className="information-note">
        <ShieldCheck size={17} />
        وضعیت ارائه‌دهنده به‌تنهایی سلامت کامل برنامه را اثبات نمی‌کند. بررسی HTTP و تشخیص خودکار در
        فاز پایش اضافه می‌شوند.
      </div>
    </>
  );
}
export function CloudApplicationDetailPage() {
  const { id } = useParams();
  const { base, user, preview, mode } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'overview';
  const [range, setRange] = useState('60');
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState(1);
  const enabled = !preview && mode === 'LIVE' && !!id;
  const application = useQuery({
    queryKey: ['cloud-application', user.id, id],
    enabled,
    queryFn: () => api(`/applications/${id}`, cloudApplicationSchema),
    retry: false,
  });
  const since = useMemo(
    () => new Date(Date.now() - Number(range) * 60000).toISOString(),
    [range, refresh],
  );
  const logs = useQuery({
    queryKey: ['cloud-logs', user.id, id, since],
    enabled: enabled && tab === 'logs' && !!application.data,
    queryFn: () =>
      api(`/applications/${id}/logs?since=${encodeURIComponent(since)}`, cloudLogsSchema),
    retry: false,
  });
  const releases = useQuery({
    queryKey: ['cloud-releases', user.id, id, page],
    enabled: enabled && tab === 'releases' && !!application.data,
    queryFn: () => api(`/applications/${id}/releases?page=${page}&count=10`, cloudReleasesSchema),
    retry: false,
  });
  const metrics = useQuery({
    queryKey: ['cloud-metrics', user.id, id],
    enabled: enabled && tab === 'metrics' && !!application.data,
    queryFn: () => api(`/applications/${id}/metrics`, cloudMetricsSchema),
    retry: false,
  });
  const capabilities = useQuery({
    queryKey: ['liara-capabilities', user.id],
    enabled: enabled && tab === 'overview',
    queryFn: () => api('/providers/liara/capabilities', cloudCapabilitiesSchema),
    retry: false,
  });
  if (!enabled)
    return (
      <EmptyState
        title="این صفحه فقط برای سرویس واقعی است."
        description="برای ادامه، فضای لیارا را انتخاب کنید."
      />
    );
  if (application.isPending) return <Loading label="در حال خواندن جزئیات از لیارا…" />;
  if (application.error)
    return (
      <ErrorNotice
        error={application.error}
        retry={() => {
          void application.refetch();
        }}
      />
    );
  const app = application.data;
  return (
    <>
      <TextLink to={`${base}/applications`}>همه سرویس‌های لیارا</TextLink>
      <PageTitle
        title={app.name}
        description={`اتصال ${app.connectionLabel} · آخرین دریافت موفق: ${formatDate(app.lastSeenAt)}`}
      >
        <span className="live-label">داده واقعی لیارا</span>
        <Button asChild>
          <Link to={`${base}/assistant?application=${app.id}`}>بررسی با پایلوت</Link>
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            void application.refetch();
          }}
          disabled={application.isFetching}
        >
          <RefreshCw size={16} className={application.isFetching ? 'spin' : ''} />
          تازه‌سازی جزئیات
        </Button>
      </PageTitle>
      <div className="detail-tabs" role="group" aria-label="بخش‌های سرویس واقعی">
        {[
          { id: 'overview', label: 'اطلاعات سرویس' },
          { id: 'logs', label: 'لاگ‌ها' },
          { id: 'releases', label: 'نسخه‌ها' },
          { id: 'metrics', label: 'منابع' },
        ].map((item) => (
          <button
            key={item.id}
            aria-pressed={tab === item.id}
            onClick={() => setParams({ tab: item.id })}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'logs' ? (
        <section className="surface-card">
          <SectionHeading
            title="لاگ‌های دریافتی از لیارا"
            description="نمایش ثابت هر پاسخ؛ جریان زنده SSE هنوز فعال نیست."
            action={
              <Button
                size="small"
                variant="secondary"
                onClick={() => setRefresh((value) => value + 1)}
                disabled={logs.isFetching}
              >
                <RefreshCw size={14} />
                دریافت دوباره
              </Button>
            }
          />
          <div className="live-logs-filters">
            <label>
              بازه درخواست
              <select
                className="plain-select"
                aria-label="بازه لاگ‌های واقعی"
                value={range}
                onChange={(event) => setRange(event.target.value)}
              >
                <option value="15">۱۵ دقیقه اخیر</option>
                <option value="60">یک ساعت اخیر</option>
                <option value="1440">۲۴ ساعت اخیر</option>
              </select>
            </label>
            <span>از {formatDate(since)}</span>
          </div>
          {logs.isPending ? (
            <Loading />
          ) : logs.error ? (
            <ErrorNotice
              error={logs.error}
              retry={() => {
                void logs.refetch();
              }}
            />
          ) : logs.data.logs.length ? (
            <>
              <div className="log-console main-log-console" dir="ltr">
                {logs.data.logs.map((log, index) => (
                  <div key={index} className="live-log-entry">
                    <span>{log.datetime}</span>
                    <b>{log.type}</b>
                    <code>{log.message}</code>
                  </div>
                ))}
              </div>
              <p className="card-footnote">
                دریافت: {formatDate(logs.data.fetchedAt)} · قرارداد {logs.data.contract} ·{' '}
                {persianNumber(logs.data.logs.length)} خط
                {logs.data.truncated ? ' · پاسخ به سقف نمایش محدود شده است' : ''}
              </p>
            </>
          ) : (
            <EmptyState
              title="در این پاسخ لاگی دریافت نشد."
              description="بازه را تغییر دهید یا دسترسی اتصال را بررسی کنید."
            />
          )}
          <div className="credential-note">
            <ShieldCheck size={16} />
            <p>
              توکن اتصال و الگوهای رایج اطلاعات حساس پیش از نمایش پاکسازی می‌شوند. از چاپ اسرار در
              لاگ برنامه جلوگیری کنید.
            </p>
          </div>
        </section>
      ) : tab === 'releases' ? (
        <section className="surface-card">
          <SectionHeading
            title="نسخه‌های دریافت‌شده"
            description="تاریخچه خوانده‌شده از API لیارا؛ انتشار تازه‌ای اجرا نمی‌شود."
          />
          {releases.isPending ? (
            <Loading />
          ) : releases.error ? (
            <ErrorNotice
              error={releases.error}
              retry={() => {
                void releases.refetch();
              }}
            />
          ) : releases.data.releases.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>شناسه نسخه</th>
                    <th>وضعیت ارائه‌دهنده</th>
                    <th>Commit / Branch</th>
                    <th>زمان گزارش‌شده</th>
                  </tr>
                </thead>
                <tbody>
                  {releases.data.releases.map((release) => (
                    <tr key={release.id}>
                      <td>
                        <code>{release.id}</code>
                        <CopyButton value={release.id} />
                      </td>
                      <td>
                        <bdi>{release.state ?? 'گزارش نشده'}</bdi>
                      </td>
                      <td>
                        <code>{release.commit ?? '—'}</code>
                        <br />
                        <bdi>{release.branch ?? '—'}</bdi>
                      </td>
                      <td>
                        <bdi>{release.createdAt ?? 'گزارش نشده'}</bdi>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="نسخه‌ای در این صفحه دریافت نشد."
              description="ممکن است هنوز انتشاری ثبت نشده باشد یا صفحه دیگری لازم باشد."
            />
          )}
          <div className="release-pagination">
            <Button
              size="small"
              variant="secondary"
              disabled={page <= 1 || releases.isFetching}
              onClick={() => setPage((value) => value - 1)}
            >
              صفحه قبل
            </Button>
            <span>صفحه {persianNumber(page)}</span>
            <Button
              size="small"
              variant="secondary"
              disabled={releases.isFetching || !releases.data || releases.data.releases.length < 10}
              onClick={() => setPage((value) => value + 1)}
            >
              صفحه بعد
            </Button>
          </div>
        </section>
      ) : tab === 'metrics' ? (
        <section className="surface-card">
          <SectionHeading
            title="داده خام مصرف منابع"
            description="واحد و مقیاس هنوز با حساب واقعی تأیید نشده‌اند؛ مقدارها به درصد یا مگابایت تبدیل نمی‌شوند."
            action={
              <Button
                variant="secondary"
                size="small"
                onClick={() => {
                  void metrics.refetch();
                }}
                disabled={metrics.isFetching}
              >
                <RefreshCw size={14} />
                دریافت دوباره
              </Button>
            }
          />
          {metrics.isPending ? (
            <Loading />
          ) : metrics.error ? (
            <ErrorNotice
              error={metrics.error}
              retry={() => {
                void metrics.refetch();
              }}
            />
          ) : (
            <div className="raw-metric-grid">
              {[
                { title: 'پردازنده / CPU', data: metrics.data.cpuUsage },
                { title: 'حافظه / Memory', data: metrics.data.memoryUsage },
              ].map((group) => (
                <article key={group.title}>
                  <Database size={21} />
                  <h3>{group.title}</h3>
                  {group.data.length ? (
                    group.data.map((entry, index) => (
                      <div key={index}>
                        <small>
                          نمونه ارائه‌دهنده: <bdi>{entry.applet}</bdi>
                        </small>
                        <pre dir="ltr">{JSON.stringify(entry.value)}</pre>
                      </div>
                    ))
                  ) : (
                    <p>داده‌ای دریافت نشد.</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className="two-column-grid">
          <section className="surface-card">
            <SectionHeading title="اطلاعات سرویس" />
            <dl className="detail-list">
              <div>
                <dt>نام</dt>
                <dd>
                  <bdi>{app.name}</bdi>
                </dd>
              </div>
              <div>
                <dt>پلتفرم</dt>
                <dd>
                  <PlatformMark platform={app.platform} size={36} label />
                </dd>
              </div>
              <div>
                <dt>وضعیت ارائه‌دهنده</dt>
                <dd>
                  <bdi>{app.status ?? 'گزارش نشده'}</bdi>
                </dd>
              </div>
              <div>
                <dt>Scale</dt>
                <dd>{app.scale ?? 'گزارش نشده'}</dd>
              </div>
              <div>
                <dt>شناسه پلن گزارش‌شده</dt>
                <dd>
                  <bdi>{app.planId ?? 'گزارش نشده'}</bdi>
                </dd>
              </div>
              <div>
                <dt>شناسه سرویس</dt>
                <dd>
                  <bdi>{app.providerId}</bdi>
                  <CopyButton value={app.providerId} />
                </dd>
              </div>
            </dl>
            <p className="card-footnote">
              مقادیر متغیرهای محیطی از پاسخ عمومی حذف می‌شوند. شناسه پلن، قیمت یا پیشنهاد خرید محسوب
              نمی‌شود.
            </p>
          </section>
          <section className="surface-card">
            <SectionHeading
              title="قابلیت‌های این اتصال"
              description="خواندن اطلاعات فعال است؛ عملیات تغییردهنده تا فاز تأیید/انتشار غیرفعال‌اند."
            />
            {capabilities.isPending ? (
              <Loading />
            ) : capabilities.error ? (
              <ErrorNotice error={capabilities.error} />
            ) : (
              <div className="capability-list">
                {capabilities.data.operations.map((operation) => (
                  <div key={operation.name}>
                    <FileText size={15} />
                    <code>{operation.name}</code>
                    <span className={operation.available ? 'success-text' : 'muted-cell'}>
                      {operation.available ? 'پیاده‌شده' : 'غیرفعال'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
