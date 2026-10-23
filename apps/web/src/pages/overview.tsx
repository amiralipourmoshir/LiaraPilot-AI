import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import {
  Activity,
  ArrowLeft,
  ArrowUpLeft,
  CheckCircle2,
  ChevronLeft,
  CircleHelp,
  GitBranch,
  Plus,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import {
  demoActivity,
  demoDeployments,
  demoProjects,
  scopedItems,
  selectProjects,
} from '../demo/data';
import { formatDate, persianNumber, useWorkspace, useWorkspaceUi } from '../lib/workspace';
import { Mascot } from '../components/mascot';
import { Button } from '../components/ui/button';
import { DemoLabel, SectionHeading, StatusBadge, TextLink } from '../components/primitives';
import { ProjectCard } from '../components/project-card';
import { MetricChart } from '../components/metric-chart';
import { CloudApplicationsPage } from './cloud';
export function OverviewPage() {
  const { base, mode, user, preview } = useWorkspace();
  const location = useLocation();
  const { selectedProject, setMode } = useWorkspaceUi();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const projects = selectProjects(selectedProject);
  const deployments = scopedItems(demoDeployments, selectedProject);
  const activity = scopedItems(demoActivity, selectedProject);
  const chartProject = projects[0] ?? demoProjects[0]!;
  const submit = (text: string) => {
    if (text.trim())
      void navigate(`${base}/assistant`, { state: { prompt: text.trim().slice(0, 1500) } });
  };
  if (!preview && new URLSearchParams(location.search).has('operation')) {
    return <Navigate to={`${base}/foundation${location.search}`} replace />;
  }
  if (mode === 'LIVE') return <CloudApplicationsPage />;
  return (
    <div className="overview-page">
      <div className="overview-heading">
        <div>
          <span className="page-eyebrow">فضای کاری شما، یک نگاه کامل</span>
          <h1>
            سلام {user.name}، خوش آمدید<span className="heading-dot">.</span>
          </h1>
          <p>از ایده تا انتشار، پایلوت در مسیر کنار شماست.</p>
        </div>
        <Button asChild>
          <Link to={`${base}/projects`}>
            <Plus size={16} />
            پروژه‌ها و شروع کار
          </Link>
        </Button>
      </div>
      {mode === 'LOCAL' ? (
        <>
          <section className="welcome-hero local-welcome">
            <div className="hero-grid" />
            <div className="hero-copy">
              <span className="hero-kicker">
                <Mascot size={25} />
                هم‌تیمی ابری شما
              </span>
              <h2>
                یک جای روشن،
                <br />
                برای شروع‌های بزرگ.
              </h2>
              <p>
                فضای شخصی شما آماده است. پروژه‌هایتان را بسازید یا بدون اتصال به حساب ابری، تجربه
                کامل رابط را در دمو ببینید.
              </p>
              <div className="hero-actions">
                <Button onClick={() => setMode('DEMO')}>
                  ورود به محیط دمو
                  <ArrowLeft size={17} />
                </Button>
                <Button asChild variant="secondary">
                  <Link to={`${base}/foundation`}>پروژه‌های شخصی</Link>
                </Button>
              </div>
            </div>
            <div className="hero-mascot">
              <div className="hero-orbit" />
              <Mascot size={245} full animate />
            </div>
          </section>
          <div className="onboarding-grid">
            {[
              {
                n: '۰۱',
                title: 'حساب شما آماده است',
                text: 'ورود امن و ذخیره پروژه‌های شخصی فعال‌اند.',
                Icon: CheckCircle2,
                to: '/foundation',
                action: 'ساخت اولین پروژه',
              },
              {
                n: '۰۲',
                title: 'با پایلوت آشنا شوید',
                text: 'پروژه‌ها، پایش و مسیر بررسی خطا را با داده نمونه ببینید.',
                Icon: Sparkles,
                to: '/assistant',
                action: 'دیدن فضای دستیار',
              },
              {
                n: '۰۳',
                title: 'اتصال به کلاد',
                text: 'اتصال امن را بسازید و اطلاعات واقعی سرویس‌ها را دریافت کنید.',
                Icon: ShieldCheck,
                to: '/connections',
                action: 'مشاهده وضعیت اتصال‌ها',
              },
            ].map((item) => (
              <Link to={`${base}${item.to}`} key={item.n} className="onboarding-card">
                <span className="onboarding-number">{item.n}</span>
                <item.Icon size={22} />
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <span className="text-link">
                  {item.action}
                  <ArrowLeft size={14} />
                </span>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <>
          <section className="pilot-intro">
            <div className="pilot-intro-copy">
              <span className="hero-kicker">
                <span className="mint-dot" />
                دستیار ابری شما
              </span>
              <h2>
                شما بسازید.
                <br />
                مسیر کلاد را با هم می‌رویم.
              </h2>
              <p>
                انتشار پروژه، بررسی سلامت یا پیدا کردن علت خطا؛
                <br className="desktop-break" /> کافی‌ست بگویید از کجا شروع کنیم.
              </p>
              <Button asChild variant="secondary">
                <Link to={`${base}/assistant`}>
                  گفتگو با پایلوت
                  <ArrowLeft size={16} />
                </Link>
              </Button>
            </div>
            <div className="intro-pet">
              <span className="pet-orbit orbit-one" />
              <span className="pet-orbit orbit-two" />
              <span className="floating-pet-label">
                <ShieldCheck size={13} />
                کنترل در دست شما
              </span>
              <Mascot size={216} full animate />
            </div>
            <div className="intro-guide">
              <span className="section-number">یک قدم تا شروع</span>
              <h3>امروز چه کاری داریم؟</h3>
              {[
                {
                  Icon: Rocket,
                  title: 'پروژه‌ام را منتشر کنم',
                  text: 'مسیر انتشار پروژه را نشان بده',
                },
                {
                  Icon: Activity,
                  title: 'سلامت سرویس‌ها را ببینم',
                  text: 'وضعیت سرویس‌ها چطور است؟',
                },
                {
                  Icon: TriangleAlert,
                  title: 'علت یک خطا را پیدا کنم',
                  text: 'خطای ۵۰۰ اطلس را بررسی کن',
                },
              ].map((item) => (
                <button key={item.title} onClick={() => submit(item.text)}>
                  <span className="quick-action-icon">
                    <item.Icon size={16} />
                  </span>
                  {item.title}
                  <ChevronLeft size={15} />
                </button>
              ))}
            </div>
          </section>
          <div className="overview-stats">
            {[
              {
                title: 'پروژه‌های نمونه',
                value: projects.length,
                caption: 'در این فضای نمایشی',
                Icon: GitBranch,
                color: 'mint',
              },
              {
                title: 'سرویس‌های سالم',
                value: projects.filter((p) => p.status === 'healthy').length,
                caption: 'بر اساس سناریوی ثابت',
                Icon: CheckCircle2,
                color: 'green',
              },
              {
                title: 'انتشارهای ثبت‌شده',
                value: deployments.length,
                caption: 'تاریخچه نمونه انتشار',
                Icon: Rocket,
                color: 'blue',
              },
              {
                title: 'نیازمند توجه',
                value: projects.filter((p) => p.status === 'attention').length,
                caption: 'رخداد قابل بررسی',
                Icon: TriangleAlert,
                color: 'amber',
              },
            ].map((item) => (
              <div className="stat-tile" key={item.title}>
                <div>
                  <span>{item.title}</span>
                  <span className={`stat-icon stat-${item.color}`}>
                    <item.Icon size={17} />
                  </span>
                </div>
                <strong>{persianNumber(item.value)}</strong>
                <p>
                  <DemoLabel compact />
                  {item.caption}
                </p>
              </div>
            ))}
          </div>
          <section>
            <SectionHeading
              title="پروژه‌های شما"
              description="وضعیت سرویس‌ها در سناریوی نمایشی"
              action={<TextLink to={`${base}/projects`}>همه پروژه‌ها</TextLink>}
            />
            <div className="service-grid">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          </section>
          <div className="overview-lower-grid">
            <section className="surface-card">
              <SectionHeading
                title="نبض زیرساخت"
                description={`مصرف پردازنده · ${chartProject.title}`}
                action={
                  <span className="timeframe-label">
                    ۶ ساعت نمونه
                    <DemoLabel compact />
                  </span>
                }
              />
              <div className="chart-summary">
                <strong>
                  {persianNumber(chartProject.cpu)}
                  <small>٪</small>
                </strong>
                <span>
                  <i />
                  پردازنده · داده ثابت
                </span>
                <TextLink to={`${base}/monitoring`}>جزئیات پایش</TextLink>
              </div>
              <MetricChart project={chartProject} />
              <div className="chart-caption">
                نمودار نمونه است؛ اتصال به داده زنده در مراحل بعد اضافه می‌شود.
              </div>
            </section>
            <section className="surface-card recent-activity">
              <SectionHeading
                title="آخرین رویدادها"
                action={<TextLink to={`${base}/operations`}>تاریخچه</TextLink>}
              />
              <div className="activity-feed">
                {activity.slice(0, 3).map((item) => (
                  <Link key={item.id} to={`${base}${item.target}`}>
                    <span
                      className={`activity-icon ${item.type === 'incident' ? 'activity-warning' : ''}`}
                    >
                      {item.type === 'incident' ? (
                        <TriangleAlert size={16} />
                      ) : (
                        <Rocket size={16} />
                      )}
                    </span>
                    <div>
                      <b>{item.title}</b>
                      <p>{item.detail}</p>
                      <time>{formatDate(item.at)}</time>
                    </div>
                    <ArrowUpLeft size={14} />
                  </Link>
                ))}
              </div>
            </section>
          </div>
          <section className="surface-card recent-deployments">
            <SectionHeading
              title="آخرین دیپلوی‌ها"
              description="تاریخچه انتشارهای نمایشی؛ بدون اجرای واقعی"
              action={<TextLink to={`${base}/deployments`}>مشاهده همه</TextLink>}
            />
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>پروژه</th>
                    <th>نسخه و شاخه</th>
                    <th>وضعیت</th>
                    <th>زمان ثبت</th>
                    <th>
                      <span className="sr-only">جزئیات</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {deployments.slice(0, 3).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link
                          to={`${base}/projects/${item.projectId}`}
                          className="table-project-name"
                        >
                          <span className="table-project-dot" />
                          <bdi>{demoProjects.find((p) => p.id === item.projectId)?.name}</bdi>
                        </Link>
                      </td>
                      <td>
                        <span className="commit-label">
                          <GitBranch size={13} />
                          <bdi>{item.branch}</bdi>
                          <code>{item.commit}</code>
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="muted-cell">{formatDate(item.at)}</td>
                      <td>
                        <Link
                          className="icon-button"
                          to={`${base}/deployments/${item.id}`}
                          aria-label={`جزئیات انتشار ${item.commit}`}
                        >
                          <ArrowUpLeft size={17} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="dashboard-prompt">
            <Mascot size={46} />
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submit(prompt);
              }}
            >
              <label htmlFor="dashboard-prompt" className="sr-only">
                پیام به پایلوت
              </label>
              <input
                id="dashboard-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="پایلوت، از کجا شروع کنیم؟"
                maxLength={1000}
              />
              <button
                className="icon-button"
                type="submit"
                disabled={!prompt.trim()}
                aria-label="فرستادن به فضای دستیار"
              >
                <Send size={18} />
              </button>
            </form>
            <span>
              گفتگوی نمایشی
              <CircleHelp size={13} />
            </span>
          </div>
        </>
      )}
    </div>
  );
}
