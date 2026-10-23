import { creationCredit } from '../../../../packages/deployment/src/billing';
import { ResourceAdvisor } from './resource-advisor';
import { EnvironmentUpload } from './environment-upload';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  Github,
  GitBranch,
  ArrowLeft,
  Check,
  ShieldCheck,
  Layers3,
  LoaderCircle,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import {
  analysisSchema,
  repositoryBranchesSchema,
  githubStatusSchema,
  deploymentOptionsSchema,
} from '../../../../packages/shared/src/wizard';
import { deploymentSchema } from '../../../../packages/shared/src/deployment';
import { cloudConnectionsSchema } from '../../../../packages/shared/src/cloud';
import { api, ApiError } from '../lib/api';
import { useSession } from '../lib/session';
import { useWorkspace, persianNumber } from '../lib/workspace';
import { Button } from './ui/button';
import { ErrorNotice } from './common';
import { ResourcePicker } from './resource-picker';
import { PlatformMark, PlatformGallery } from './platform-mark';
import { ChoicePicker } from './choice-picker';
import { inspectRepository } from '../lib/inspection';
import { AgentForm, type AgentField } from './agent-form';
import { Modal } from './primitives';
import { cloudConnectionSchema } from '../../../../packages/shared/src/cloud';
import { Mascot } from './mascot';
type Analysis = z.infer<typeof analysisSchema>;
type Branches = z.infer<typeof repositoryBranchesSchema>;
type Options = z.infer<typeof deploymentOptionsSchema>;
export function DeploymentWizard({
  initialUrl,
  onPrepared,
  model,
}: {
  initialUrl?: string;
  model?: string;
  onPrepared?: (id: string) => void;
}) {
  const { user, base } = useWorkspace();
  const session = useSession();
  const navigate = useNavigate();
  const [url, setUrl] = useState(
    () => initialUrl ?? sessionStorage.getItem('pilot-repository-url') ?? '',
  );
  const [progress, setProgress] = useState<{ message: string; createdAt: string }[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [connectingLiara, setConnectingLiara] = useState(false);
  const [branches, setBranches] = useState<Branches | null>(null);
  const [branch, setBranch] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [loginNeeded, setLoginNeeded] = useState(false);
  const [setup, setSetup] = useState(false);
  const [connectionId, setConnectionId] = useState('');
  const [target, setTarget] = useState<'new' | 'existing'>('new');
  const [applicationId, setApplicationId] = useState('');
  const [name, setName] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('');
  const [networkId, setNetworkId] = useState('');
  const [environment, setEnvironment] = useState<Record<string, string>>({});
  const connections = useQuery({
    queryKey: ['liara-connections', user.id],
    enabled: !!analysis,
    queryFn: () => api('/connections/liara', cloudConnectionsSchema),
    retry: false,
  });
  const github = useQuery({
    queryKey: ['github-status', user.id],
    queryFn: () => api('/github/status', githubStatusSchema),
    retry: false,
  });
  const activeConnection =
    connectionId || connections.data?.connections.find((c) => c.status === 'CONNECTED')?.id || '';
  const options = useQuery({
    queryKey: [
      'deployment-options',
      user.id,
      analysis?.id,
      analysis?.manifest.analysis?.platform,
      activeConnection,
    ],
    enabled: !!analysis && !!activeConnection,
    queryFn: () =>
      api(
        `/repositories/${analysis!.id}/options?connectionId=${activeConnection}`,
        deploymentOptionsSchema,
      ),
    retry: false,
  });
  const planKey = (p: Options['plans'][number]) => `${p.id}|${p.bundleId}`;
  const recommended =
    options.data?.plans.find((p) => p.recommended && p.bundleId === 'standard') ??
    options.data?.plans.find((p) => p.recommended) ??
    options.data?.plans[0];
  const currentPlan = options.data?.plans.find(
    (p) => planKey(p) === (selectedPlan || (recommended ? planKey(recommended) : '')),
  );
  const credit = creationCredit(options.data?.billing, currentPlan?.estimatedMonthlyToman);
  const chosenNetwork = networkId || options.data?.networks[0]?.id || '';
  async function run(label: string, work: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e : new Error('ادامه مسیر ممکن نشد.'));
    } finally {
      setBusy('');
    }
  }
  async function connect() {
    await run('در حال اتصال به GitHub', async () => {
      sessionStorage.setItem('pilot-repository-url', url);
      if (!github.data?.configured) {
        setSetup(true);
        return;
      }
      const result = await api('/github/connect', z.object({ url: z.url() }), {
        method: 'POST',
        body:
          window.location.pathname === '/workspace/assistant'
            ? {
                returnTo:
                  window.location.pathname +
                  (new URLSearchParams(window.location.search).get('conversation')
                    ? '?conversation=' +
                      new URLSearchParams(window.location.search).get('conversation')
                    : ''),
              }
            : {},
        csrfToken: session.data?.csrfToken,
      });
      window.location.assign(result.url);
    });
  }
  async function load() {
    await run('در حال پیدا کردن شاخه‌های پروژه…', async () => {
      setLoginNeeded(false);
      try {
        const data = await api('/repositories/branches', repositoryBranchesSchema, {
          method: 'POST',
          body: { repositoryUrl: url.trim() },
          csrfToken: session.data?.csrfToken,
        });
        setBranches(data);
        setBranch(data.defaultBranch);
        sessionStorage.setItem('pilot-repository-url', url.trim());
      } catch (e) {
        if (
          e instanceof ApiError &&
          ['GITHUB_AUTH_REQUIRED', 'GITHUB_AUTH_EXPIRED'].includes(e.code)
        ) {
          setLoginNeeded(true);
          return;
        }
        throw e;
      }
    });
  }
  async function analyze() {
    await run('دارم ساختار پروژه و نیازهایش را بررسی می‌کنم…', async () => {
      setProgress([]);
      const data = await inspectRepository(
        { repositoryUrl: url.trim(), branch },
        session.data?.csrfToken,
        setProgress,
      );
      setAnalysis(data);
      setName(
        data.manifest.repo
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .slice(0, 35)
          .replace(/^-+|-+$/g, ''),
      );
    });
  }
  async function prepare() {
    if (!analysis) return;
    await run('در حال آماده کردن طرح پیشنهادی شما…', async () => {
      const data = await api('/deployments/guided', deploymentSchema, {
        method: 'POST',
        body: {
          analysisId: analysis.id,
          connectionId: activeConnection,
          target,
          ...(target === 'new'
            ? {
                name,
                ...(Object.keys(environment).length ? { environment } : {}),
                planId: currentPlan?.id,
                bundleId: currentPlan?.bundleId,
                networkId: chosenNetwork,
              }
            : { applicationId }),
        },
        csrfToken: session.data?.csrfToken,
      });
      setEnvironment({});
      sessionStorage.removeItem('pilot-repository-url');
      if (onPrepared) onPrepared(data.id);
      else void navigate(`${base}/deployments/${data.id}`);
    });
  }
  useEffect(() => {
    if (options.data?.applications.length && !options.data.plans.length) setTarget('existing');
  }, [options.data]);
  const stage = analysis ? 2 : branches ? 1 : 0;
  const config = analysis?.manifest.analysis;
  const questionFields: AgentField[] = [];
  if (config && analysis?.manifest.blockers.some((b) => b.includes('چند برنامه')))
    questionFields.push({
      name: 'root',
      type: 'select',
      label: 'کدام بخش پروژه را آنلاین کنیم؟',
      hint: 'پوشه‌های زیر از فایل‌های خود پروژه شناسایی شده‌اند.',
      required: true,
      options: config.roots.map((value) => ({
        value: value || '__root__',
        label: value || 'پوشه اصلی',
      })),
    });
  else if (
    config &&
    analysis?.manifest.blockers.some((b) => b.includes('فرمان اجرای برنامه')) &&
    Object.keys(config.scripts).length
  )
    questionFields.push({
      name: 'startScript',
      type: 'select',
      label: 'کدام فرمان پروژه، برنامه را اجرا می‌کند؟',
      hint: 'اگر مطمئن نیستید، نام گزینه‌ها را با سازنده پروژه بررسی کنید؛ فرمان تازه‌ای حدس نمی‌زنیم.',
      required: true,
      options: Object.entries(config.scripts)
        .filter(([name]) => !/^test|lint|check|format/.test(name))
        .map(([value, command]) => ({ value, label: value + ' — ' + command })),
    });
  if (config && analysis?.manifest.blockers.some((b) => b.includes('چند محیط'))) {
    questionFields.length = 0;
    questionFields.push({
      name: 'runtime',
      type: 'radio',
      label: 'کدام بخش اصلی را منتشر کنیم؟',
      hint: 'بیش از یک محیط اجرای مستقل پیدا شد؛ ابزار ساخت فرانت‌اند با بک‌اند یکی نیست.',
      required: true,
      options: config.runtimes.map((value) => ({
        value,
        label:
          (
            {
              php: 'بک‌اند PHP / Laravel',
              python: 'بک‌اند Python / Django',
              node: 'سرور JavaScript / Node.js',
              go: 'سرور Go',
              dotnet: 'برنامه .NET',
            } as Record<string, string>
          )[value] ?? value,
      })),
    });
  }
  useEffect(() => {
    if (questionFields.length) setQuestionOpen(true);
  }, [analysis?.id, analysis?.manifest.blockers.join('|')]);
  return (
    <section className="repository-wizard">
      <div className="wizard-steps">
        {['پروژه شما', 'انتخاب شاخه', 'پیشنهاد پایلوت'].map((s, i) => (
          <div key={s} aria-current={stage === i ? 'step' : undefined}>
            <span>{i < stage ? <Check size={15} /> : persianNumber(i + 1)}</span>
            {s}
          </div>
        ))}
      </div>
      {busy && (
        <div className="wizard-working" role="status">
          <LoaderCircle size={18} className="spin" />
          {busy}
        </div>
      )}
      {!!progress.length && (
        <ol className="agent-live-timeline" aria-label="روند زنده بررسی" aria-live="polite">
          {progress.map((event, i) => (
            <li
              key={i}
              className={i === progress.length - 1 && busy ? 'is-current' : 'is-complete'}
            >
              <span>
                {i === progress.length - 1 && busy ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <Check size={15} />
                )}
              </span>
              <p>{event.message}</p>
            </li>
          ))}
        </ol>
      )}
      {error && <ErrorNotice error={error} />}
      <Modal
        open={questionOpen && !!questionFields.length}
        onOpenChange={setQuestionOpen}
        className="agent-question-dialog"
        title="مسیر اجرای پروژه را با هم مشخص کنیم"
        description="پایلوت موارد نامشخص را به‌جای حدس‌زدن با شما مشخص می‌کند."
      >
        <AgentForm
          key={analysis?.id}
          fields={questionFields}
          busy={!!busy}
          onSubmit={async (values) => {
            if (!analysis) return;
            await run('در حال بررسی پاسخ شما…', async () => {
              const result = await api(`/repositories/${analysis.id}/resolve`, analysisSchema, {
                method: 'POST',
                body: { ...values, ...(values.root === '__root__' ? { root: '' } : {}) },
                csrfToken: session.data?.csrfToken,
              });
              setAnalysis(result);
              setQuestionOpen(false);
              void options.refetch();
            });
          }}
        />
        {error && <ErrorNotice error={error} />}
      </Modal>
      <Modal
        open={connectingLiara}
        onOpenChange={setConnectingLiara}
        title="اتصال امن حساب لیارا"
        description="توکن فقط به سرور ارسال و رمزگذاری می‌شود؛ وارد گفتگو یا مدل نمی‌شود."
      >
        <AgentForm
          fields={[
            {
              name: 'label',
              type: 'text',
              label: 'نام دلخواه حساب',
              required: true,
              defaultValue: 'حساب لیارای من',
            },
            {
              name: 'token',
              type: 'password',
              label: 'کلید دسترسی لیارا',
              required: true,
              hint: 'از بخش کلیدهای دسترسی در کنسول لیارا دریافت کنید؛ کلید سرویس هوش مصنوعی متفاوت است.',
            },
            { name: 'teamId', type: 'text', label: 'شناسه تیم (اختیاری)' },
          ]}
          onSubmit={async (values) => {
            await run('در حال اتصال امن به لیارا…', async () => {
              await api('/connections/liara', cloudConnectionSchema, {
                method: 'POST',
                body: values,
                csrfToken: session.data?.csrfToken,
              });
              await connections.refetch();
              setConnectingLiara(false);
            });
          }}
        />
        {error && <ErrorNotice error={error} />}
      </Modal>
      {stage === 0 && (
        <div className="wizard-entry">
          <Mascot size={82} />
          <h2>لینک پروژه‌ات را بده، باقی مسیر با پایلوت.</h2>
          <p>
            نوع پروژه، روش ساخت و نیازهای اجرا را بررسی می‌کنیم؛ لازم نیست تنظیمات فنی را بدانید.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void load();
            }}
          >
            <label htmlFor="repository-url">لینک مخزن GitHub</label>
            <div>
              <Github size={22} />
              <input
                id="repository-url"
                dir="ltr"
                type="url"
                required
                placeholder="https://github.com/you/your-project"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setLoginNeeded(false);
                }}
              />
              <Button disabled={!!busy} type="submit">
                ادامه
                <ArrowLeft size={17} />
              </Button>
            </div>
          </form>
          <PlatformGallery />
          <span className="wizard-private-note">
            <ShieldCheck size={15} />
            برای مخزن عمومی، ورود به GitHub لازم نیست.
          </span>
          {loginNeeded && (
            <div className="wizard-github-connect">
              <Github size={30} />
              <div>
                <h3>برای دیدن این مخزن، به GitHub متصل شوید.</h3>
                <p>
                  ممکن است مخزن خصوصی باشد یا نشانی آن درست نباشد. پس از ورود، فقط مخازن مجاز حساب
                  شما خوانده می‌شوند.
                </p>
              </div>
              <Button onClick={() => void connect()} disabled={!!busy}>
                ورود و اتصال GitHub
              </Button>
            </div>
          )}
          {setup && (
            <div className="wizard-setup" role="status">
              <h3>فعال‌سازی ورود GitHub برای این نصب</h3>
              <p>
                برنامه اتصال باید یک بار توسط مدیر در GitHub ثبت شود. فرم آماده ثبت و راهنمای
                گام‌به‌گام در دسترس است؛ پس از تنظیم کلیدهای سرور، همین دکمه ورود فعال می‌شود.
              </p>
              <a
                href="https://github.com/settings/applications/new?oauth_application%5Bname%5D=LiaraPilot&oauth_application%5Burl%5D=http%3A%2F%2F127.0.0.1%3A5173&oauth_application%5Bcallback_url%5D=http%3A%2F%2F127.0.0.1%3A5173%2Fapi%2Fv1%2Fgithub%2Fcallback"
                target="_blank"
                rel="noopener noreferrer"
              >
                ثبت برنامه اتصال در GitHub
                <ExternalLink size={14} />
              </a>
              <p>
                نشانی بازگشت: <code dir="ltr">{window.location.origin}/api/v1/github/callback</code>
              </p>
            </div>
          )}
          {github.data?.connected && (
            <p className="wizard-connected">
              <Check size={15} />
              GitHub متصل است: <bdi>{github.data.login}</bdi>
            </p>
          )}
        </div>
      )}
      {stage === 1 && (
        <div className="wizard-branch">
          <div className="wizard-title">
            <GitBranch size={30} />
            <div>
              <h2>از کدام شاخه شروع کنیم؟</h2>
              <p>
                <bdi>{branches?.repositoryUrl}</bdi>
                {branches?.private ? ' · مخزن خصوصی' : ''}
              </p>
            </div>
          </div>
          <ChoicePicker
            label="شاخه پروژه"
            value={branch}
            onChange={setBranch}
            options={
              branches?.branches.map((value) => ({
                value,
                label: value,
                description: value === branches.defaultBranch ? 'شاخه پیش‌فرض مخزن' : undefined,
              })) ?? []
            }
            allowCustom
          />
          <p>
            پایلوت نسخه همین شاخه را ثبت می‌کند؛ تغییرات بعدی مخزن، نسخه تأییدشده را عوض نمی‌کنند.
          </p>
          {branches?.hasMore && (
            <p>این مخزن بیش از ۵۰۰ شاخه دارد؛ فقط ۵۰۰ شاخه اول نمایش داده شده‌اند.</p>
          )}
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setBranches(null)} disabled={!!busy}>
              تغییر مخزن
            </Button>
            <Button onClick={() => void analyze()} disabled={!branch || !!busy}>
              بررسی پروژه
              <ArrowLeft size={16} />
            </Button>
          </div>
        </div>
      )}
      {analysis && (
        <div className="wizard-analysis">
          <div className="wizard-title">
            <Mascot size={52} />
            <div>
              <h2>پروژه‌ات را بررسی کردم.</h2>
              <p>پیشنهادها بر اساس فایل‌های همین نسخه‌اند؛ تصمیم نهایی با شماست.</p>
            </div>
          </div>
          <div className="wizard-findings">
            <div>
              <span>نوع پروژه</span>
              <PlatformMark platform={analysis.manifest.framework} size={48} label />
            </div>
            <div>
              <span>اطمینان تشخیص</span>
              <b>
                {config?.confidence === 'high'
                  ? 'شواهد روشن'
                  : config?.confidence === 'medium'
                    ? 'نیازمند بازبینی تنظیمات'
                    : 'نیازمند انتخاب شما'}
              </b>
            </div>
            <div>
              <span>شاخه</span>
              <b dir="ltr">{analysis.branch}</b>
            </div>
            <div>
              <span>آماده‌سازی</span>
              <b>{config?.build ? 'نصب وابستگی و ساخت خودکار' : 'اجرای خودکار پس از آماده‌سازی'}</b>
            </div>
          </div>
          <div className="wizard-runtime-banner">
            <PlatformMark platform={config?.platform} size={48} />
            <div>
              <strong>محیط انتشار انتخاب‌شده</strong>
              <PlatformMark platform={config?.platform} size={0} label />
            </div>
            <span>نوع پروژه و محیط اجرای آن جداگانه بررسی می‌شوند</span>
          </div>
          <details className="wizard-evidence">
            <summary>چطور به این نتیجه رسیدم؟</summary>
            {analysis.manifest.evidence.map((e, i) => (
              <p key={i}>
                <code>{e.path}</code> — {e.finding}
              </p>
            ))}
            <p>
              نسخه: <code>{analysis.manifest.commit}</code>
            </p>
            <p>
              نصب: <bdi>{config?.install ?? 'نیازی ندارد'}</bdi>
            </p>
            <p>
              ساخت: <bdi>{config?.build ?? 'مرحله جداگانه ندارد'}</bdi>
            </p>
            <p>
              اجرا: <bdi>{analysis.manifest.start}</bdi>
            </p>
          </details>
          {!!questionFields.length && (
            <Button onClick={() => setQuestionOpen(true)}>پاسخ به سؤال پایلوت</Button>
          )}
          {analysis.manifest.blockers.map((b) => (
            <div key={b} className="deployment-blocker">
              {b}
            </div>
          ))}
          {config?.databases.length !== 0 && (
            <div className="wizard-info">
              <Layers3 size={18} />
              <p>
                در پروژه نشانه‌ای از {config?.databases.join('، ')} پیدا شد. سرویس یا تنظیمات
                دیتابیس باید پیش از انتشار آماده باشد؛ این تشخیص به معنی ساخت خودکار دیتابیس نیست.
              </p>
            </div>
          )}
          {!!config?.environmentNames.length && (
            <div className="wizard-info">
              <ShieldCheck size={18} />
              <div>
                <p>
                  پروژه به این تنظیمات محرمانه نیاز دارد؛ مقدارشان را در گفتگو ننویسید. مقدارها را
                  در فرم امن همین مسیر وارد کنید؛ برای سرویس موجود، تنظیمات فعلی آن حفظ می‌شود.
                </p>
                <div>
                  {config.environmentNames.map((n) => (
                    <code key={n}>{n} </code>
                  ))}
                </div>
              </div>
            </div>
          )}
          <section className="wizard-control-card">
            <div>
              <Sparkles size={20} />
              <h3>انتخاب و تنظیمات دست شماست</h3>
            </div>
            <p>
              نتیجه تشخیص و فرمان‌ها را بررسی کنید. می‌توانید بخش دیگری از مخزن را انتخاب کنید یا
              تنظیمات اجرای دلخواهتان را ثبت کنید.
            </p>
            <Button variant="secondary" onClick={() => setAdvanced((v) => !v)}>
              {advanced ? 'بستن تنظیمات انتخابی' : 'باز کردن انتخاب‌های بیشتر'}
            </Button>
            {advanced && (
              <div className="wizard-advanced-grid">
                {!!config?.roots.length && (
                  <ChoicePicker
                    label="بخش پروژه"
                    value={config.root || '__root__'}
                    options={config.roots.map((value) => ({
                      value: value || '__root__',
                      label: value || 'پوشه اصلی مخزن',
                    }))}
                    onChange={(value) =>
                      void run('در حال بررسی بخش انتخاب‌شده…', async () => {
                        const result = await api(
                          `/repositories/${analysis.id}/resolve`,
                          analysisSchema,
                          {
                            method: 'POST',
                            body: { root: value === '__root__' ? '' : value },
                            csrfToken: session.data?.csrfToken,
                          },
                        );
                        setAnalysis(result);
                      })
                    }
                  />
                )}
                <AgentForm
                  fields={[
                    {
                      name: 'customStart',
                      type: 'text',
                      label: 'فرمان اجرای دلخواه (اختیاری)',
                      hint: 'برای کاربران فنی؛ رمز یا کلید را داخل فرمان ننویسید.',
                    },
                    { name: 'customBuild', type: 'text', label: 'فرمان ساخت دلخواه (اختیاری)' },
                    {
                      name: 'confirmCustom',
                      type: 'checkbox',
                      label:
                        'می‌دانم فرمان‌های دلخواه پس از تأیید طرح، داخل محیط لیارا اجرا می‌شوند.',
                      required: true,
                    },
                  ]}
                  onSubmit={async (values) => {
                    const body = Object.fromEntries(
                      Object.entries(values).filter(([, v]) => v !== ''),
                    );
                    await run('در حال ثبت تنظیمات انتخابی…', async () => {
                      setAnalysis(
                        await api(`/repositories/${analysis.id}/resolve`, analysisSchema, {
                          method: 'POST',
                          body,
                          csrfToken: session.data?.csrfToken,
                        }),
                      );
                      setAdvanced(false);
                    });
                  }}
                />
              </div>
            )}
          </section>
          <section className="wizard-hosting">
            <h3>پروژه کجا آنلاین شود؟</h3>
            {connections.data?.connections.some((c) => c.status === 'CONNECTED') ? (
              <ChoicePicker
                label="حساب لیارا"
                value={activeConnection}
                onChange={(value) => {
                  setConnectionId(value);
                  setSelectedPlan('');
                  setNetworkId('');
                }}
                options={connections.data.connections
                  .filter((c) => c.status === 'CONNECTED')
                  .map((c) => ({
                    value: c.id,
                    label: c.label,
                    description: c.applicationCount + ' سرویس متصل',
                  }))}
              />
            ) : (
              <div className="wizard-info">
                <p>برای دیدن پلن‌های واقعی حساب، ابتدا لیارا را متصل کنید.</p>
                <Button variant="secondary" onClick={() => setConnectingLiara(true)}>
                  اتصال حساب لیارا همین‌جا
                </Button>
              </div>
            )}
            {options.isFetching && <p role="status">در حال دریافت پلن‌های واقعی حساب…</p>}
            {options.error && (
              <ErrorNotice error={options.error} retry={() => void options.refetch()} />
            )}
            {options.data && (
              <>
                <div className="wizard-target-choice">
                  <button
                    type="button"
                    aria-pressed={target === 'new'}
                    onClick={() => setTarget('new')}
                  >
                    یک سرویس جدید بسازیم<span>پیشنهاد پایلوت برای شروع تازه</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={target === 'existing'}
                    onClick={() => setTarget('existing')}
                  >
                    روی سرویس خودم منتشر کن<span>نسخه فعلی این سرویس جایگزین می‌شود</span>
                  </button>
                </div>
                {target === 'new' ? (
                  <>
                    <EnvironmentUpload
                      value={environment}
                      onChange={setEnvironment}
                      required={config?.environmentNames ?? []}
                    />

                    <label>
                      نام برنامه
                      <input
                        value={name}
                        maxLength={41}
                        dir="ltr"
                        onChange={(e) => setName(e.target.value)}
                        placeholder="my-project"
                      />
                    </label>
                    <p className="wizard-helper">
                      این نام در نشانی برنامه دیده می‌شود؛ می‌توانید پیشنهاد را تغییر دهید.
                    </p>
                    {!options.data.plans.length && (
                      <div className="deployment-blocker">
                        در حساب شما پلن قابل ساخت دریافت نشد. دسترسی حساب و تیم را بررسی و دوباره
                        دریافت کنید.
                      </div>
                    )}
                    <ResourceAdvisor
                      key={`${analysis.id}-${activeConnection}`}
                      model={model}
                      analysisId={analysis.id}
                      connectionId={activeConnection}
                      onChoose={setSelectedPlan}
                    />
                    <ResourcePicker
                      plans={options.data.plans}
                      value={currentPlan ? planKey(currentPlan) : undefined}
                      onChange={setSelectedPlan}
                    />
                    <p className="wizard-helper">
                      پیشنهاد اولیه بر اساس نوع پروژه است؛ مصرف واقعی پس از اجرا سنجیده می‌شود.
                      پلن‌ها از حساب لیارا خوانده شده‌اند.
                    </p>
                    {!!credit?.shortfallToman && (
                      <p className="deployment-blocker">
                        برای ایجاد سرویس، حداقل {persianNumber(credit.requiredToman)} تومان اعتبار{' '}
                        {credit.includesExisting
                          ? 'برای یک هفته همه سرویس‌ها'
                          : 'فقط برای یک هفته این سرویس'}{' '}
                        نیاز است. کسری برآوردی: {persianNumber(credit.shortfallToman)} تومان. مبلغ
                        نهایی را لیارا تعیین می‌کند.
                      </p>
                    )}
                    <div className="wizard-payment-card">
                      <ShieldCheck size={20} />
                      <div>
                        <h4>
                          {options.data.billing?.hasCredit === false
                            ? 'حساب لیارا نیاز به شارژ دارد'
                            : 'پرداخت در حساب خودتان'}
                        </h4>
                        <p>
                          اگر اعتبار کافی ندارید، حساب لیارا را در کنسول رسمی شارژ کنید. پس از
                          بازگشت، اطلاعات پلن را دوباره دریافت کنید و طرح را تأیید کنید. ایجاد واقعی
                          سرویس پس از تأیید انجام می‌شود؛ موفقیت پرداخت از روی کلیک شما فرض نمی‌شود.
                        </p>
                        <a
                          href="https://console.liara.ir/credit"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          شارژ حساب در لیارا <ExternalLink size={13} />
                        </a>
                        <Button variant="ghost" onClick={() => void options.refetch()}>
                          برگشتم؛ اطلاعات حساب را تازه کن
                        </Button>
                      </div>
                    </div>
                    {options.data.networks.length > 1 ? (
                      <ChoicePicker
                        label="فضای شبکه"
                        value={chosenNetwork}
                        onChange={setNetworkId}
                        options={options.data.networks.map((n) => ({ value: n.id, label: n.name }))}
                      />
                    ) : options.data.networks.length === 0 ? (
                      <p className="deployment-blocker">
                        برای این پروژه، شبکه خصوصی همراه سرویس و پس از تأیید شما ساخته می‌شود.
                      </p>
                    ) : (
                      <p className="wizard-helper">
                        شبکه حساب «{options.data.networks[0]!.name}» انتخاب شد.
                      </p>
                    )}
                  </>
                ) : (
                  <ChoicePicker
                    label="سرویس سازگار"
                    value={applicationId}
                    onChange={setApplicationId}
                    options={options.data.applications.map((a) => ({
                      value: a.id,
                      label: a.name,
                      description: a.platform ?? undefined,
                    }))}
                    placeholder="سرویس مقصد را انتخاب کنید"
                  />
                )}
                <div className="wizard-info">
                  <ShieldCheck size={18} />
                  <p>
                    تا طرح نهایی را تأیید نکنید، سرویس ساخته نمی‌شود و کد منتشر نمی‌شود. نصب و ساخت
                    پروژه بعد از تأیید در محیط لیارا اجرا می‌شود.
                  </p>
                </div>
                <Button
                  onClick={() => void prepare()}
                  disabled={
                    !!busy ||
                    !!analysis.manifest.blockers.length ||
                    (target === 'new' ? !currentPlan || !!credit?.shortfallToman : !applicationId)
                  }
                >
                  دیدن طرح نهایی و تأیید
                  <ArrowLeft size={16} />
                </Button>
              </>
            )}
          </section>
          <Button
            variant="ghost"
            disabled={!!busy}
            onClick={() => {
              setAnalysis(null);
              setSelectedPlan('');
            }}
          >
            بازگشت به انتخاب شاخه
          </Button>
        </div>
      )}
    </section>
  );
}
