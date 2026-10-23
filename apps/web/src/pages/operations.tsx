import { LiveOperationsPage } from './live-observability';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  ArrowLeft,
  ArrowUpLeft,
  Check,
  Clock3,
  GitBranch,
  Rocket,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react';
import { demoActivity, demoDeployments, demoProjects, scopedItems } from '../demo/data';
import { formatDate, persianNumber, useWorkspace, useWorkspaceUi } from '../lib/workspace';
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
import { Button } from '../components/ui/button';
import { LiveDeploymentsPage, LiveDeploymentDetailPage } from './live-deployments';
export function DeploymentsPage() {
  const { mode, preview } = useWorkspace();
  return !preview && mode !== 'DEMO' ? <LiveDeploymentsPage /> : <DemoDeploymentsPage />;
}
export function DeploymentDetailPage() {
  const { mode, preview } = useWorkspace();
  return !preview && mode !== 'DEMO' ? <LiveDeploymentDetailPage /> : <DemoDeploymentDetailPage />;
}
function DemoDeploymentsPage() {
  const { base, mode } = useWorkspace();
  const { selectedProject } = useWorkspaceUi();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  if (mode !== 'DEMO')
    return (
      <DemoRequired
        title={
          mode === 'LIVE'
            ? 'نسخه‌های واقعی در جزئیات هر سرویس قرار دارند.'
            : 'انتشارهای نمونه را در محیط دمو ببینید.'
        }
      />
    );
  const rows = scopedItems(demoDeployments, selectedProject).filter(
    (item) =>
      (filter === 'all' || item.status === filter) &&
      `${item.message} ${item.commit} ${demoProjects.find((p) => p.id === item.projectId)?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        eyebrow="هر نسخه، یک قدم جلوتر"
        title="دیپلوی‌ها"
        description="تاریخچه انتشارهای نمونه را مرور کنید و جزئیات هر مرحله را ببینید."
      >
        <DemoLabel />
      </PageTitle>
      <div className="content-toolbar">
        <div className="inline-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="جستجوی انتشار"
            placeholder="پروژه، نسخه یا توضیحات…"
          />
        </div>
        <div className="filter-pills" role="group" aria-label="فیلتر انتشار">
          {[
            { id: 'all', label: 'همه' },
            { id: 'succeeded', label: 'موفق' },
            { id: 'failed', label: 'ناموفق' },
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
      </div>
      {rows.length ? (
        <div className="surface-card table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>پروژه / تغییرات</th>
                <th>نسخه</th>
                <th>وضعیت</th>
                <th>مدت نمونه</th>
                <th>زمان ثبت</th>
                <th>
                  <span className="sr-only">جزئیات</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link to={`${base}/deployments/${item.id}`} className="deployment-table-title">
                      <bdi>{demoProjects.find((p) => p.id === item.projectId)?.name}</bdi>
                      <small>{item.message}</small>
                    </Link>
                  </td>
                  <td>
                    <span className="commit-label">
                      <GitBranch size={13} />
                      <code>{item.commit}</code>
                    </span>
                  </td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td>{persianNumber(item.duration)} ثانیه</td>
                  <td className="muted-cell">{formatDate(item.at)}</td>
                  <td>
                    <Link
                      to={`${base}/deployments/${item.id}`}
                      className="icon-button"
                      aria-label={`جزئیات نسخه ${item.commit}`}
                    >
                      <ArrowUpLeft size={17} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="انتشاری با این فیلتر وجود ندارد."
          description="فیلتر وضعیت یا عبارت جستجو را تغییر دهید."
        />
      )}
      <div className="information-note">
        <Rocket size={16} />
        این نسخه‌ها سناریوی ثابت‌اند. هیچ دکمه‌ای در این صفحه انتشار واقعی را آغاز نمی‌کند.
      </div>
    </>
  );
}
function DemoDeploymentDetailPage() {
  const { id } = useParams();
  const { base, mode } = useWorkspace();
  const deployment = demoDeployments.find((item) => item.id === id);
  if (mode !== 'DEMO') return <DemoRequired />;
  if (!deployment)
    return (
      <EmptyState
        title="انتشار نمونه پیدا نشد."
        description="به فهرست دیپلوی‌ها بازگردید."
        action={
          <Button asChild>
            <Link to={`${base}/deployments`}>دیپلوی‌ها</Link>
          </Button>
        }
      />
    );
  const project = demoProjects.find((item) => item.id === deployment.projectId)!;
  return (
    <>
      <TextLink to={`${base}/deployments`}>همه دیپلوی‌ها</TextLink>
      <PageTitle title={`انتشار ${project.title}`} description={deployment.message}>
        <StatusBadge status={deployment.status} />
        <DemoLabel />
      </PageTitle>
      <div className="two-column-grid deployment-detail-grid">
        <section className="surface-card">
          <SectionHeading
            title="مراحل این انتشار نمونه"
            description="نتیجه ثبت‌شده در داده ثابت؛ اجرای زنده نیست."
          />
          <ol className="execution-steps">
            {deployment.steps.map((step, index) => (
              <li key={step.title} className={`step-${step.state}`}>
                <span>
                  {step.state === 'done' ? (
                    <Check size={16} />
                  ) : step.state === 'failed' ? (
                    <X size={16} />
                  ) : (
                    persianNumber(index + 1)
                  )}
                </span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                </div>
                <StatusBadge status={step.state} />
              </li>
            ))}
          </ol>
        </section>
        <section className="surface-card">
          <SectionHeading title="مشخصات نسخه" />
          <dl className="detail-list">
            <div>
              <dt>پروژه</dt>
              <dd>
                <Link to={`${base}/projects/${project.id}`}>
                  <bdi>{project.name}</bdi>
                </Link>
              </dd>
            </div>
            <div>
              <dt>نسخه</dt>
              <dd>
                <code>{deployment.commit}</code>
                <CopyButton value={deployment.commit} />
              </dd>
            </div>
            <div>
              <dt>شاخه</dt>
              <dd>
                <bdi>{deployment.branch}</bdi>
              </dd>
            </div>
            <div>
              <dt>زمان نمونه</dt>
              <dd>{formatDate(deployment.at)}</dd>
            </div>
            <div>
              <dt>مدت نمونه</dt>
              <dd>{persianNumber(deployment.duration)} ثانیه</dd>
            </div>
          </dl>
          <div className="detail-panel-action">
            <Button asChild variant="secondary">
              <Link to={`${base}/projects/${project.id}?tab=logs`}>
                مشاهده لاگ‌های پروژه
                <ArrowLeft size={16} />
              </Link>
            </Button>
          </div>
        </section>
      </div>
      <div className="information-note">
        <Clock3 size={16} />
        پذیرش درخواست، انتشار نسخه و بررسی سلامت سه مرحله مستقل‌اند. اطلاعات این صفحه فقط سناریوی
        رابط را نمایش می‌دهند.
      </div>
    </>
  );
}
export function OperationsPage() {
  const { base, mode } = useWorkspace();
  const { selectedProject } = useWorkspaceUi();
  const [filter, setFilter] = useState('all');
  if (mode === 'LIVE') return <LiveOperationsPage />;
  if (mode !== 'DEMO')
    return (
      <>
        <PageTitle
          title="تاریخچه عملیات"
          description="رویدادهای حساب شخصی در صفحه بررسی زیرساخت قابل پیگیری‌اند."
        />
        <EmptyState
          title="مسیر واقعی بررسی زیرساخت در دسترس است."
          description="از صفحه زیرساخت محلی، پروژه را انتخاب و نتیجه ذخیره‌شده عملیات را بررسی کنید."
          action={
            <Button asChild>
              <Link to={`${base}/foundation`}>
                باز کردن بررسی زیرساخت
                <ArrowLeft size={16} />
              </Link>
            </Button>
          }
        />
      </>
    );
  const rows = scopedItems(demoActivity, selectedProject).filter(
    (item) => filter === 'all' || item.type === filter,
  );
  return (
    <>
      <PageTitle
        eyebrow="هیچ قدمی گم نمی‌شود"
        title="تاریخچه عملیات"
        description="مرور خط زمانی فعالیت‌ها در سناریوی نمایشی"
      >
        <DemoLabel />
      </PageTitle>
      <div className="filter-pills history-filter" role="group" aria-label="نوع فعالیت">
        {[
          { id: 'all', label: 'همه فعالیت‌ها' },
          { id: 'deployment', label: 'انتشارها' },
          { id: 'incident', label: 'رخدادها' },
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
      <section className="surface-card history-panel">
        {rows.length ? (
          rows.map((item) => (
            <Link key={item.id} to={`${base}${item.target}`} className="history-row">
              <span className={`history-icon ${item.type === 'incident' ? 'is-warning' : ''}`}>
                {item.type === 'incident' ? <TriangleAlert size={20} /> : <Rocket size={20} />}
              </span>
              <div>
                <h2>{item.title}</h2>
                <p>{item.detail}</p>
                <span>
                  <bdi>{demoProjects.find((project) => project.id === item.projectId)?.name}</bdi> ·{' '}
                  {formatDate(item.at)}
                </span>
              </div>
              <StatusBadge status={item.status} />
              <ArrowUpLeft size={17} />
            </Link>
          ))
        ) : (
          <EmptyState
            title="فعالیتی با این فیلتر وجود ندارد."
            description="نوع دیگری از فعالیت‌ها را انتخاب کنید."
          />
        )}
      </section>
    </>
  );
}
