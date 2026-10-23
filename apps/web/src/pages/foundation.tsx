import { useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowUpLeft,
  Check,
  CheckCircle2,
  CircleDot,
  Database,
  FolderPlus,
  Layers,
  LoaderCircle,
  Plus,
  Radio,
  Server,
  ShieldCheck,
  Terminal,
  Workflow,
} from 'lucide-react';
import { operationSchema, projectSchema } from '../../../../packages/shared/src/index';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { ErrorNotice, Loading } from '../components/common';
import { Button } from '../components/ui/button';
const operationLabels = {
  QUEUED: 'در انتظار پردازشگر',
  RUNNING: 'در حال بررسی',
  SUCCEEDED: 'بررسی کامل شد',
  FAILED: 'بررسی ناموفق بود',
};
const date = (value: string) =>
  new Intl.DateTimeFormat('fa-IR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tehran',
  }).format(new Date(value));
export function FoundationPage() {
  const session = useSession();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [chosen, setChosen] = useState('');
  const pendingKey = useRef<{ projectId: string; key: string } | null>(null);
  const projects = useQuery({
    queryKey: ['projects', session.data?.user.id],
    enabled: !!session.data,
    queryFn: () => api('/projects', z.object({ projects: z.array(projectSchema) })),
    retry: false,
  });
  const selected =
    projects.data?.projects.find((project) => project.id === chosen) ?? projects.data?.projects[0];
  const operationId = params.get('operation');
  const operation = useQuery({
    queryKey: ['operation', session.data?.user.id, operationId],
    enabled: !!session.data && !!operationId,
    queryFn: () => api(`/operations/${operationId}`, operationSchema),
    retry: false,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === 'SUCCEEDED' || state === 'FAILED' || query.state.error ? false : 1000;
    },
  });
  const createProject = useMutation({
    mutationFn: () =>
      api('/projects', projectSchema, {
        method: 'POST',
        body: { name: name.trim() },
        csrfToken: session.data?.csrfToken,
      }),
    onSuccess: (project) => {
      setName('');
      setChosen(project.id);
      void client.invalidateQueries({ queryKey: ['projects'] });
      toast.success('پروژه در فضای شخصی شما ساخته شد.');
    },
  });
  const check = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('ابتدا یک پروژه بسازید.');
      if (pendingKey.current?.projectId !== selected.id)
        pendingKey.current = { projectId: selected.id, key: crypto.randomUUID() };
      return api('/foundation/checks', z.object({ operationId: z.uuid() }), {
        method: 'POST',
        body: { projectId: selected.id },
        csrfToken: session.data?.csrfToken,
        idempotencyKey: pendingKey.current.key,
      });
    },
    onSuccess: (result) => {
      pendingKey.current = null;
      setParams({ operation: result.operationId });
    },
  });
  if (session.isPending) return <Loading label="در حال باز کردن فضای کاری…" />;
  if (session.error)
    return (
      <div className="center-page">
        <ErrorNotice
          error={session.error}
          retry={() => {
            void session.refetch();
          }}
        />
      </div>
    );
  if (!session.data) return <Navigate to="/login" replace />;
  const busy =
    check.isPending || (operation.data && ['QUEUED', 'RUNNING'].includes(operation.data.state));
  return (
    <div className="foundation-page">
      <div className="welcome">
        <div className="eyebrow">
          <span className="tiny-dot" /> ابزار واقعی بخش زیرساخت
        </div>
        <h1>
          {session.data.user.name}، خوش آمدید<span>.</span>
        </h1>
        <p>
          این صفحه اطلاعات واقعی حساب شخصی و بررسی محلی صف را نمایش می‌دهد؛ داده‌های دمو در این بخش
          استفاده نمی‌شوند.
        </p>
      </div>
      <div className="foundation-banner">
        <span className="banner-icon">
          <Workflow size={23} />
        </span>
        <div>
          <b>پایه‌های مسیر، همین‌جا ساخته می‌شوند.</b>
          <p>
            این بررسی فقط دیتابیس، صف و پردازشگر محلی را آزمایش می‌کند. هنوز به لیارا متصل نیستید.
          </p>
        </div>
        <span className="outline-tag">مرحله ۰۲ از ۰۹</span>
      </div>
      <section className="workspace-grid">
        <div className="panel project-panel">
          <div className="panel-heading">
            <span className="mini-icon">
              <FolderPlus size={19} />
            </span>
            <div>
              <h2>پروژه‌های شما</h2>
              <p>هر پروژه فقط برای حساب خودتان قابل مشاهده است.</p>
            </div>
            <span className="count-badge">
              {(projects.data?.projects.length ?? 0).toLocaleString('fa-IR')}
            </span>
          </div>
          <form
            className="project-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim().length < 2) {
                setNameError('نام پروژه باید دست‌کم ۲ نویسه باشد.');
                return;
              }
              setNameError('');
              createProject.mutate();
            }}
          >
            <label htmlFor="project-name">نام پروژه جدید</label>
            <div className="input-action">
              <input
                id="project-name"
                maxLength={80}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError('');
                }}
                placeholder="مثلاً: وب‌سایت شخصی"
                aria-invalid={!!nameError}
                aria-describedby={nameError ? 'project-error' : undefined}
              />
              <Button type="submit" size="small" disabled={createProject.isPending}>
                {createProject.isPending ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Plus size={17} />
                )}{' '}
                ساخت پروژه
              </Button>
            </div>
            {nameError && (
              <small className="field-error" id="project-error">
                {nameError}
              </small>
            )}
          </form>
          <ErrorNotice error={createProject.error} />
          <ErrorNotice
            error={projects.error}
            retry={() => {
              void projects.refetch();
            }}
          />
          {projects.isPending ? (
            <Loading />
          ) : projects.data?.projects.length ? (
            <div className="project-list" role="group" aria-label="انتخاب پروژه">
              {projects.data.projects.map((project) => (
                <button
                  className={`project-row ${selected?.id === project.id ? 'selected' : ''}`}
                  key={project.id}
                  aria-pressed={selected?.id === project.id}
                  onClick={() => setChosen(project.id)}
                >
                  <span className="project-icon">
                    <Layers size={19} />
                  </span>
                  <span className="project-info">
                    <b>{project.name}</b>
                    <small>{date(project.createdAt)}</small>
                  </span>
                  <span className="mode-tag">محلی</span>
                  {selected?.id === project.id && <Check size={16} />}
                </button>
              ))}
            </div>
          ) : (
            !projects.error && (
              <div className="empty-projects">
                <span className="empty-icon">
                  <Layers size={28} />
                </span>
                <h3>اینجا جای اولین پروژه شماست.</h3>
                <p>
                  یک نام انتخاب کنید؛ پروژه در دیتابیس ذخیره می‌شود و بعد از ورود دوباره در دسترس
                  است.
                </p>
              </div>
            )
          )}
          <div className="panel-foot">
            <ShieldCheck size={15} /> دسترسی بر اساس حساب کاربری کنترل می‌شود.
          </div>
        </div>
        <div className="panel check-panel">
          <div className="panel-heading">
            <span className="mini-icon">
              <Terminal size={19} />
            </span>
            <div>
              <h2>بررسی زیرساخت</h2>
              <p>یک کار واقعی در صف پردازش پس‌زمینه</p>
            </div>
          </div>
          <div className="check-path">
            <span>
              <Database size={19} />
              <b>دیتابیس</b>
              <small>ثبت درخواست</small>
            </span>
            <ArrowLeft size={16} />
            <span>
              <Radio size={19} />
              <b>صف پردازش</b>
              <small>تحویل کار</small>
            </span>
            <ArrowLeft size={16} />
            <span>
              <Server size={19} />
              <b>پردازشگر</b>
              <small>ذخیره نتیجه</small>
            </span>
          </div>
          <p className="check-explanation">
            درخواست برای <b>{selected?.name ?? 'پروژه انتخاب‌شده'}</b> ثبت می‌شود. پردازشگر آن را
            دریافت و دسترسی به دیتابیس را بررسی می‌کند.
          </p>
          <Button
            className="check-button"
            disabled={!selected || !!busy}
            onClick={() => check.mutate()}
          >
            {busy ? (
              <>
                <LoaderCircle className="spin" size={17} /> در انتظار نتیجه…
              </>
            ) : (
              <>
                شروع بررسی زیرساخت
                <ArrowLeft size={17} />
              </>
            )}
          </Button>
          {!selected && <p className="field-hint">برای شروع، اولین پروژه‌تان را بسازید.</p>}
          <ErrorNotice error={check.error} />
          <div className="check-note">
            <CircleDot size={15} />
            <span>این عملیات هیچ سرویس ابری ایجاد نمی‌کند و هزینه زیرساختی ندارد.</span>
          </div>
        </div>
      </section>
      {operationId && (
        <section className="panel operation-panel" aria-labelledby="operation-title">
          <div className="panel-heading">
            <span className="mini-icon">
              {operation.data?.state === 'SUCCEEDED' ? (
                <CheckCircle2 size={20} />
              ) : (
                <Workflow size={20} />
              )}
            </span>
            <div>
              <h2 id="operation-title">نتیجه بررسی زیرساخت</h2>
              <p>نتیجه و رویدادها در دیتابیس ذخیره می‌شوند.</p>
            </div>
            {operation.data && (
              <span
                className={`status-pill status-${operation.data.state.toLowerCase()}`}
                role="status"
              >
                {operationLabels[operation.data.state]}
              </span>
            )}
          </div>
          <ErrorNotice
            error={operation.error}
            retry={() => {
              void operation.refetch();
            }}
          />
          {operation.isPending && <Loading />}
          {operation.data && (
            <>
              <ol className="operation-timeline">
                {operation.data.events.map((event) => (
                  <li key={event.sequence}>
                    <span className="timeline-dot">
                      {event.type === 'operation.succeeded' ? <Check size={13} /> : <span />}
                    </span>
                    <div>
                      <p>{event.message}</p>
                      <time dateTime={event.createdAt}>{date(event.createdAt)}</time>
                    </div>
                  </li>
                ))}
              </ol>
              {operation.data.state === 'QUEUED' && (
                <div className="queued-note">
                  اگر انتظار ادامه دارد، اجرای پردازشگر و اتصال Redis را بررسی کنید. درخواست در
                  دیتابیس محفوظ است.
                </div>
              )}
              <div className="operation-meta">
                <span>
                  شناسه عملیات <bdi>{operation.data.id}</bdi>
                </span>
                <span>
                  <Check size={14} /> این صفحه را می‌توانید تازه کنید.
                </span>
              </div>
            </>
          )}
        </section>
      )}
      <footer className="workspace-footer">
        <span>از یک پایه مطمئن، تا یک انتشار آسوده.</span>
        <span>
          لیاراپایلوت <ArrowUpLeft size={14} />
        </span>
      </footer>
    </div>
  );
}
