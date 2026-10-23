import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  ArrowLeft,
  ArrowUpLeft,
  Clock3,
  Code2,
  GitBranch,
  Globe,
  Plus,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { projectInputSchema, projectSchema } from '../../../../packages/shared/src/index';
import { useSession } from '../lib/session';
import { api } from '../lib/api';
import { formatDate, persianNumber, useWorkspace, useWorkspaceUi } from '../lib/workspace';
import { demoDeployments, demoLogs, demoProjects, selectProjects } from '../demo/data';
import { Button } from '../components/ui/button';
import { ErrorNotice, Loading } from '../components/common';
import {
  CopyButton,
  DemoLabel,
  EmptyState,
  Modal,
  PageTitle,
  SectionHeading,
  StatusBadge,
  TextLink,
} from '../components/primitives';
import { ProjectCard, ProjectGlyph, HealthBars } from '../components/project-card';
import { MetricChart } from '../components/metric-chart';
export function ProjectsPage() {
  const { base, mode, preview } = useWorkspace();
  const { selectedProject } = useWorkspaceUi();
  const session = useSession(!preview && mode === 'LOCAL');
  const client = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const personal = useQuery({
    queryKey: ['projects', session.data?.user.id],
    enabled: mode === 'LOCAL' && !!session.data,
    queryFn: () => api('/projects', z.object({ projects: z.array(projectSchema) })),
  });
  const create = useMutation({
    mutationFn: (name: string) =>
      api('/projects', projectSchema, {
        method: 'POST',
        body: { name },
        csrfToken: session.data?.csrfToken,
      }),
    onSuccess: (project) => {
      void client.invalidateQueries({ queryKey: ['projects'] });
      setCreateOpen(false);
      setName('');
      void navigate(`${base}/projects/${project.id}`);
    },
  });
  const projects = selectProjects(selectedProject).filter(
    (project) =>
      `${project.name} ${project.title} ${project.framework}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === 'all' || project.status === filter),
  );
  if (mode === 'LIVE') return <Navigate to={`${base}/applications`} replace />;
  return (
    <>
      <PageTitle
        eyebrow="از یک ایده تا یک سرویس"
        title="پروژه‌ها"
        description={
          mode === 'DEMO'
            ? 'پروژه‌های نمونه را باز کنید و مسیر مدیریت هر سرویس را ببینید.'
            : 'پروژه‌هایی که در فضای شخصی شما ذخیره شده‌اند.'
        }
      >
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={17} />
          پروژه جدید
        </Button>
      </PageTitle>
      {mode === 'DEMO' ? (
        <>
          <div className="content-toolbar">
            <div className="inline-search">
              <Search size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="جستجوی پروژه"
                placeholder="جستجوی نام یا فریم‌ورک…"
              />
            </div>
            <div className="filter-pills" role="group" aria-label="فیلتر وضعیت پروژه">
              {[
                { id: 'all', title: 'همه پروژه‌ها' },
                { id: 'healthy', title: 'سالم' },
                { id: 'attention', title: 'نیازمند بررسی' },
              ].map((item) => (
                <button
                  key={item.id}
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </div>
          {projects.length ? (
            <div className="service-grid project-page-grid">
              {projects.map((project) => (
                <ProjectCard project={project} key={project.id} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="پروژه‌ای با این فیلتر پیدا نشد."
              description="نام یا وضعیت دیگری انتخاب کنید."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setFilter('all');
                  }}
                >
                  پاک کردن فیلترها
                </Button>
              }
            />
          )}
          <div className="information-note">
            <ShieldCheck size={16} />
            این پروژه‌ها ثابت و نمایشی هستند. ساخت و انتشار روی لیارا در این فاز اجرا نمی‌شود.
          </div>
        </>
      ) : personal.isPending ? (
        <Loading />
      ) : personal.error ? (
        <ErrorNotice
          error={personal.error}
          retry={() => {
            void personal.refetch();
          }}
        />
      ) : personal.data.projects.length ? (
        <div className="personal-project-grid">
          {personal.data.projects.map((project) => (
            <Link
              key={project.id}
              to={`${base}/projects/${project.id}`}
              className="surface-card personal-project"
            >
              <span className="project-glyph glyph-mint">
                <Code2 size={22} />
              </span>
              <h2>{project.name}</h2>
              <p>پروژه شخصی · بدون اتصال ابری</p>
              <small>{formatDate(project.createdAt)}</small>
              <span className="text-link">
                مشاهده پروژه
                <ArrowLeft size={15} />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="اولین پروژه شما از اینجا شروع می‌شود."
          description="یک نام برای پروژه انتخاب کنید؛ اطلاعات در حساب شخصی‌تان ذخیره می‌شود."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              ساخت پروژه
            </Button>
          }
        />
      )}
      <Modal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={mode === 'DEMO' ? 'برای شروع یک پروژه واقعی آماده‌اید؟' : 'یک پروژه تازه بسازید'}
        description={
          mode === 'DEMO'
            ? 'پروژه‌های دمو برای بررسی تجربه محصول‌اند؛ پروژه شخصی در حساب خودتان ساخته می‌شود.'
            : 'فعلاً نام پروژه ذخیره می‌شود. اتصال مخزن و انتشار در مراحل بعد اضافه می‌شوند.'
        }
      >
        {mode === 'DEMO' ? (
          <div className="modal-body">
            <div className="information-note">
              <Code2 size={18} />
              هیچ سرویس ابری یا منبع هزینه‌زایی ایجاد نمی‌شود.
            </div>
            <Button asChild>
              <Link to={preview ? '/register' : `${base}/foundation`}>
                {preview ? 'ساخت حساب شخصی' : 'باز کردن پروژه‌های شخصی'}
                <ArrowLeft size={16} />
              </Link>
            </Button>
          </div>
        ) : (
          <form
            className="modal-body"
            onSubmit={(event) => {
              event.preventDefault();
              const input = projectInputSchema.safeParse({ name });
              if (!input.success) {
                setError(input.error.issues[0]?.message ?? 'نام معتبر وارد کنید.');
                return;
              }
              setError('');
              create.mutate(input.data.name);
            }}
          >
            <div className="field">
              <label htmlFor="new-project">نام پروژه</label>
              <input
                id="new-project"
                autoFocus
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={!!error}
                aria-describedby={error ? 'new-project-error' : undefined}
                placeholder="مثلاً وب‌سایت شخصی"
              />
              {error && (
                <small id="new-project-error" className="field-error">
                  {error}
                </small>
              )}
            </div>
            <ErrorNotice error={create.error} />
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'در حال ساخت…' : 'ساخت پروژه'}
              <Plus size={16} />
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}
export function ProjectDetailPage() {
  const { id } = useParams();
  const { base, mode, preview } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const session = useSession(!preview && mode === 'LOCAL');
  const tab = searchParams.get('tab') ?? 'overview';
  const local = useQuery({
    queryKey: ['project', session.data?.user.id, id],
    enabled: mode === 'LOCAL' && !!session.data && !!id && !id.startsWith('demo-'),
    queryFn: () => api(`/projects/${id}`, projectSchema),
    retry: false,
  });
  const project = demoProjects.find((project) => project.id === id);
  if (mode === 'LIVE') return <Navigate to={`${base}/applications`} replace />;
  if (mode === 'LOCAL') {
    if (id?.startsWith('demo-'))
      return (
        <EmptyState
          title="این پروژه متعلق به محیط دمو است."
          description="برای دیدن داده نمونه، از نوار بالای صفحه وارد حالت نمایشی شوید."
          action={
            <Button asChild variant="secondary">
              <Link to={`${base}/projects`}>بازگشت به پروژه‌ها</Link>
            </Button>
          }
        />
      );
    if (local.isPending) return <Loading />;
    if (local.error)
      return (
        <ErrorNotice
          error={local.error}
          retry={() => {
            void local.refetch();
          }}
        />
      );
    if (!local.data)
      return <EmptyState title="پروژه پیدا نشد." description="به فهرست پروژه‌ها برگردید." />;
    return (
      <>
        <TextLink to={`${base}/projects`}>بازگشت به پروژه‌ها</TextLink>
        <PageTitle
          title={local.data.name}
          description="پروژه ذخیره‌شده در حساب شخصی؛ بدون اتصال به سرویس ابری"
        />
        <section className="surface-card local-project-detail">
          <SectionHeading title="اطلاعات پروژه" />
          <dl className="detail-list">
            <div>
              <dt>نام</dt>
              <dd>{local.data.name}</dd>
            </div>
            <div>
              <dt>تاریخ ساخت</dt>
              <dd>{formatDate(local.data.createdAt)}</dd>
            </div>
            <div>
              <dt>شناسه</dt>
              <dd>
                <bdi>{local.data.id}</bdi>
                <CopyButton value={local.data.id} />
              </dd>
            </div>
          </dl>
          <Button asChild>
            <Link to={`${base}/foundation`}>
              بررسی زیرساخت محلی
              <ArrowLeft size={16} />
            </Link>
          </Button>
        </section>
      </>
    );
  }
  if (!project)
    return (
      <EmptyState
        title="پروژه نمونه پیدا نشد."
        description="از فهرست پروژه‌های دمو، یک پروژه معتبر انتخاب کنید."
        action={
          <Button asChild>
            <Link to={`${base}/projects`}>همه پروژه‌ها</Link>
          </Button>
        }
      />
    );
  const deployments = demoDeployments.filter((item) => item.projectId === id);
  const logs = demoLogs.filter((item) => item.projectId === id);
  return (
    <>
      <TextLink to={`${base}/projects`}>همه پروژه‌ها</TextLink>
      <div className="project-detail-heading">
        <ProjectGlyph project={project} />
        <div>
          <h1>
            <bdi>{project.name}</bdi>
          </h1>
          <p>
            {project.title} · {project.description}
          </p>
        </div>
        <StatusBadge status={project.status} />
        <DemoLabel />
      </div>
      <div className="detail-tabs" role="group" aria-label="بخش‌های پروژه">
        {[
          { id: 'overview', label: 'نمای کلی' },
          { id: 'deployments', label: 'دیپلوی‌ها' },
          { id: 'metrics', label: 'پایش' },
          { id: 'logs', label: 'لاگ‌ها' },
        ].map((item) => (
          <button
            key={item.id}
            aria-pressed={tab === item.id}
            onClick={() => setSearchParams({ tab: item.id })}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'overview' || !['deployments', 'metrics', 'logs'].includes(tab) ? (
        <>
          <div className="detail-summary-grid">
            {[
              { label: 'فریم‌ورک', value: project.framework, Icon: Code2 },
              { label: 'شاخه انتشار', value: project.branch, Icon: GitBranch },
              { label: 'منطقه', value: project.region, Icon: Globe },
              { label: 'آخرین انتشار نمونه', value: formatDate(project.updatedAt), Icon: Clock3 },
            ].map((item) => (
              <div key={item.label} className="surface-card detail-summary">
                <item.Icon size={18} />
                <span>{item.label}</span>
                <b>
                  <bdi>{item.value}</bdi>
                </b>
              </div>
            ))}
          </div>
          <div className="two-column-grid">
            <section className="surface-card">
              <SectionHeading
                title="سلامت در سناریوی دمو"
                action={<StatusBadge status={project.status} />}
              />
              <div className="project-health-summary">
                <strong>
                  {persianNumber(project.health, 2)}
                  <small>٪</small>
                </strong>
                <p>نرخ موفقیت نمونه؛ داده واقعی نیست</p>
                <HealthBars attention={project.status === 'attention'} />
                <span>زمان پاسخ نمونه: {persianNumber(project.latency)} میلی‌ثانیه</span>
              </div>
              {project.status === 'attention' && (
                <Link className="incident-inline" to={`${base}/incidents/demo-incident-01`}>
                  بررسی خطای اتصال دیتابیس
                  <ArrowLeft size={15} />
                </Link>
              )}
            </section>
            <section className="surface-card">
              <SectionHeading title="پیکربندی نمونه" />
              <dl className="detail-list">
                <div>
                  <dt>محیط</dt>
                  <dd>
                    <bdi>{project.environment}</bdi>
                  </dd>
                </div>
                <div>
                  <dt>زمان اجرا</dt>
                  <dd>
                    <bdi>{project.runtime}</bdi>
                  </dd>
                </div>
                <div>
                  <dt>پورت</dt>
                  <dd>
                    <bdi>{project.port}</bdi>
                  </dd>
                </div>
                <div>
                  <dt>نسخه</dt>
                  <dd>
                    <code>{project.commit}</code>
                    <CopyButton value={project.commit} />
                  </dd>
                </div>
              </dl>
              <p className="card-footnote">
                مقادیر بالا بخشی از سناریوی رابط هستند و تنظیمات لیارا را تغییر نمی‌دهند.
              </p>
            </section>
          </div>
        </>
      ) : tab === 'deployments' ? (
        <section className="surface-card">
          <SectionHeading title="انتشارهای این پروژه" action={<DemoLabel />} />
          {deployments.map((item) => (
            <Link
              key={item.id}
              className="deployment-list-row"
              to={`${base}/deployments/${item.id}`}
            >
              <StatusBadge status={item.status} />
              <div>
                <b>{item.message}</b>
                <small>{formatDate(item.at)}</small>
              </div>
              <code>{item.commit}</code>
              <ArrowUpLeft size={17} />
            </Link>
          ))}
        </section>
      ) : tab === 'metrics' ? (
        <section className="surface-card">
          <SectionHeading
            title="مصرف پردازنده نمونه"
            description={`${project.title} · درصد مصرف`}
            action={<DemoLabel />}
          />
          <MetricChart project={project} />
          <p className="card-footnote">
            آخرین مقدار: {persianNumber(project.cpu)}٪؛ مجموعه داده ثابت دمو.
          </p>
        </section>
      ) : (
        <section className="surface-card">
          <SectionHeading
            title="لاگ‌های نمونه این پروژه"
            action={<TextLink to={`${base}/logs`}>فضای لاگ‌ها</TextLink>}
          />
          <div className="log-console" dir="ltr">
            {logs.map((log) => (
              <div key={log.id} className={`log-entry log-${log.level}`}>
                <time>{log.at.slice(11, 19)}</time>
                <span>{log.level.toUpperCase()}</span>
                <code>{log.message}</code>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="information-note">
        <ShieldCheck size={16} />
        اطلاعات این صفحه نمایشی است. آدرس وب‌سایت یا دامنه واقعی برای این پروژه ثبت نشده است.
      </div>
    </>
  );
}
