import { ExecutionAdvisor } from '../components/execution-advisor';
import { DeploymentTerminal } from '../components/deployment-terminal';
import { DeploymentRecovery } from '../components/deployment-recovery';
import { PlatformMark } from '../components/platform-mark';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GitBranch,
  Rocket,
  ShieldCheck,
  ArrowLeft,
  Check,
  Clock3,
  TriangleAlert,
} from 'lucide-react';
import {
  deploymentSchema,
  deploymentsSchema,
  deploymentFailureMessage,
} from '../../../../packages/shared/src/deployment';
import { deploymentSnapshotSchema } from '../../../../packages/deployment/src/contracts';
import { useWorkspace, formatDate } from '../lib/workspace';
import { useSession } from '../lib/session';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { EmptyState, Modal, PageTitle, TextLink } from '../components/primitives';
import { ErrorNotice, Loading } from '../components/common';
import { DeploymentWizard } from '../components/deployment-wizard';
import { Mascot } from '../components/mascot';
const stateLabel: Record<string, string> = {
  PLANNED: 'منتظر بازبینی',
  QUEUED: 'در صف',
  RUNNING: 'در حال انتشار',
  VERIFYING: 'بررسی نتیجه',
  SUCCEEDED: 'انتشار تأیید شد',
  NEEDS_ATTENTION: 'نیازمند بررسی',
  FAILED: 'ناموفق',
  CANCELLED: 'لغوشده',
  EXPIRED: 'منقضی',
};
export function LiveDeploymentsPage() {
  const { base, user } = useWorkspace();
  const [search] = useSearchParams();
  const [open, setOpen] = useState(() => search.has('repository') || search.has('github'));
  useEffect(() => {
    if (search.get('repository'))
      sessionStorage.setItem('pilot-repository-url', search.get('repository')!);
  }, [search]);
  const list = useQuery({
    queryKey: ['deployments', user.id],
    queryFn: () => api('/deployments', deploymentsSchema),
    retry: false,
  });
  return (
    <>
      <PageTitle
        eyebrow="از لینک مخزن تا برنامه آنلاین"
        title="پروژه‌ات را آنلاین کن"
        description="لینک پروژه را بدهید؛ پایلوت نوع پروژه، نیازهای ساخت و منابع پیشنهادی را بررسی می‌کند."
      >
        <Button onClick={() => setOpen(true)}>
          <Rocket size={17} />
          پروژه جدید
        </Button>
      </PageTitle>
      {list.isPending && <Loading />}
      {list.error && <ErrorNotice error={list.error} retry={() => void list.refetch()} />}
      {list.data?.deployments.length === 0 && (
        <EmptyState
          title="یک لینک، شروع یک مسیر ساده."
          description="پروژه عمومی یا خصوصی، انتخاب شاخه، پیشنهاد منابع و انتشار با تأیید شما."
          action={
            <Button onClick={() => setOpen(true)}>
              <GitBranch size={17} />
              شروع با لینک پروژه
            </Button>
          }
        />
      )}
      <div className="deployment-live-list">
        {list.data?.deployments.map((d) => {
          const s = deploymentSnapshotSchema.safeParse(d.snapshot);
          return (
            <Link
              className="surface-card deployment-list-card"
              to={`${base}/deployments/${d.id}`}
              key={d.id}
            >
              <PlatformMark platform={s.success ? s.data.repository.framework : null} size={48} />
              <div>
                <h2>
                  <bdi>{s.success ? s.data.applicationName : 'انتشار'}</bdi>
                </h2>
                <p>
                  <bdi>
                    {s.success ? `${s.data.repository.owner}/${s.data.repository.repo}` : ''}
                  </bdi>{' '}
                  · {formatDate(d.createdAt)}
                </p>
              </div>
              <span className="inspection-state">{stateLabel[d.state]}</span>
              <ArrowLeft size={17} />
            </Link>
          );
        })}
      </div>
      <Modal
        open={open}
        onOpenChange={setOpen}
        className="agent-workflow-dialog"
        title="پروژه‌ات را به پایلوت بسپار"
        description="از لینک مخزن شروع می‌کنیم؛ تنظیمات را از پروژه تشخیص می‌دهیم و تصمیم‌ها را با شما مرور می‌کنیم."
      >
        <div className="modal-body">
          <DeploymentWizard initialUrl={search.get('repository') ?? undefined} />
        </div>
      </Modal>
    </>
  );
}
export function LiveDeploymentDetailPage() {
  const navigate = useNavigate();
  const { base, user } = useWorkspace();
  const { id } = useParams();
  const session = useSession();
  const client = useQueryClient();
  const [review, setReview] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const key = ['deployment', user.id, id];
  const detail = useQuery({
    queryKey: key,
    queryFn: () => api(`/deployments/${id}`, deploymentSchema),
    retry: false,
    refetchInterval: (q) =>
      q.state.data && ['QUEUED', 'RUNNING', 'VERIFYING'].includes(q.state.data.state)
        ? 3000
        : false,
  });
  useEffect(() => {
    if (
      !id ||
      !detail.data ||
      !['QUEUED', 'RUNNING', 'VERIFYING'].includes(detail.data.state) ||
      typeof EventSource === 'undefined'
    )
      return;
    const stream = new EventSource(`/api/v1/deployments/${id}/events`, { withCredentials: true });
    stream.onmessage = () => {
      void client.invalidateQueries({ queryKey: ['deployment', user.id, id] });
    };
    stream.addEventListener('complete', () => {
      stream.close();
      void client.invalidateQueries({ queryKey: ['deployment', user.id, id] });
    });
    return () => stream.close();
  }, [id, user.id, detail.data?.state, client]);
  if (detail.isPending) return <Loading />;
  if (detail.error) return <ErrorNotice error={detail.error} retry={() => void detail.refetch()} />;
  const data = detail.data;
  const parsed = deploymentSnapshotSchema.safeParse(data.snapshot);
  if (!parsed.success) return <ErrorNotice error={new Error('ساختار طرح قابل بررسی نیست.')} />;
  const s = parsed.data;
  const decide = async (decision: 'approve' | 'cancel') => {
    setBusy(true);
    setError(null);
    try {
      const result = await api(`/deployments/${id}/decision`, deploymentSchema, {
        method: 'POST',
        body: { hash: data.hash, decision },
        csrfToken: session.data?.csrfToken,
      });
      client.setQueryData(key, result);
      setReview(false);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('ثبت تصمیم کامل نشد.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <TextLink to={`${base}/deployments`}>همه انتشارها</TextLink>
      <PageTitle
        eyebrow="یک طرح مشخص، یک تأیید مشخص"
        title={`انتشار ${s.applicationName}`}
        description={`مخزن ${s.repository.owner}/${s.repository.repo} · ${formatDate(data.createdAt)}`}
      >
        <span className="live-label">{stateLabel[data.state]}</span>
        {data.state === 'PLANNED' && (
          <Button
            disabled={!!s.repository.blockers.length}
            onClick={() => {
              setReview(true);
              setConsent(false);
            }}
          >
            بازبینی و تأیید انتشار
          </Button>
        )}
      </PageTitle>
      {error && <ErrorNotice error={error} />}
      <div className="deployment-detail-live">
        <section className="surface-card deployment-plan-summary">
          <div className="deployment-plan-title">
            <Mascot size={48} />
            <div>
              <h2>طرح انتشار شما</h2>
              <p>سورس دقیق، مقصد مشخص، نتیجه قابل بررسی</p>
            </div>
          </div>
          <dl>
            <dt>commit ثابت</dt>
            <dd>
              <code dir="ltr">{s.repository.commit}</code>
            </dd>
            <dt>فریم‌ورک</dt>
            <dd>
              {s.repository.framework} · {s.repository.files.length} فایل
            </dd>
            <dt>پورت</dt>
            <dd>{s.port}</dd>
            <dt>پلن</dt>
            <dd>{s.resourceSummary ?? 'پلن فعلی سرویس؛ بدون تغییر منابع'}</dd>
            <dt>بررسی سلامت</dt>
            <dd>
              <bdi>
                {s.applicationName}.liara.run{s.healthPath}
              </bdi>
            </dd>
            <dt>نشانگر پاسخ</dt>
            <dd>
              <code>{s.expectedText || 'پاسخ موفق و غیرخالی صفحه'}</code>
            </dd>
            <dt>مهلت تأیید</dt>
            <dd>{formatDate(data.expiresAt)}</dd>
          </dl>
          {s.repository.blockers.map((t) => (
            <div key={t} className="deployment-blocker">
              <TriangleAlert size={16} />
              {t}
            </div>
          ))}
          <h3>شواهد تحلیل مخزن</h3>
          {s.repository.evidence.map((e, i) => (
            <div className="deployment-finding" key={i}>
              <code>{e.path}</code>
              <p>{e.finding}</p>
            </div>
          ))}
          <details>
            <summary>فایل‌های کنارگذاشته‌شده</summary>
            {s.repository.excluded.length ? (
              s.repository.excluded.map((f) => (
                <p key={f}>
                  <bdi>{f}</bdi>
                </p>
              ))
            ) : (
              <p>موردی وجود ندارد.</p>
            )}
          </details>
        </section>
        <section className="surface-card deployment-progress">
          <h2>مسیر اجرا</h2>
          <p>رویدادها در سرور ذخیره می‌شوند و پس از بازگشت باقی می‌مانند.</p>
          <ol>
            {data.events.map((e) => (
              <li key={e.sequence}>
                <span>
                  {['SUCCEEDED'].includes(data.state) ? <Check size={15} /> : <Clock3 size={15} />}
                </span>
                <div>
                  <p>{e.message}</p>
                  <time>{formatDate(e.createdAt)}</time>
                </div>
              </li>
            ))}
          </ol>
          {data.state !== 'PLANNED' && (
            <DeploymentTerminal
              id={id!}
              active={
                ['QUEUED', 'RUNNING', 'VERIFYING'].includes(data.state) ||
                data.recovery?.status === 'IN_PROGRESS'
              }
            />
          )}
          {data.state !== 'PLANNED' && data.state !== 'CANCELLED' && (
            <ExecutionAdvisor key={id} id={id!} state={data.state} />
          )}
          {['NEEDS_ATTENTION', 'FAILED', 'VERIFYING', 'EXPIRED'].includes(data.state) && (
            <DeploymentRecovery
              deployment={data}
              onPrepared={(id) => void navigate(`${base}/deployments/${id}`)}
            />
          )}
          {data.errorCode && (
            <div className="deployment-blocker">
              <TriangleAlert size={17} />
              <div>
                {deploymentFailureMessage(data.errorCode)}
                <p>
                  <code>{data.errorCode}</code>
                </p>
                <small>
                  مرحله ثبت‌شده: <bdi>{data.phase}</bdi>
                </small>
              </div>
            </div>
          )}
          {data.releaseId && (
            <p>
              شناسه انتشار: <bdi>{data.releaseId}</bdi>
            </p>
          )}
          {data.state === 'SUCCEEDED' && (
            <div className="deployment-verification">
              <ShieldCheck size={22} />
              <div>
                <b>انتشار و پاسخ سلامت تأیید شدند.</b>
                <p>
                  دو پاسخ HTTP با نشانگر مورد انتظار دریافت شد؛ پایش مداوم در مرحله بعد اضافه
                  می‌شود.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
      <Modal
        open={review}
        onOpenChange={(v) => {
          if (!busy) setReview(v);
        }}
        title="این نسخه منتشر شود؟"
        description="این تأیید فقط برای commit و تنظیمات همین طرح است؛ تغییر آن به تأیید تازه نیاز دارد."
      >
        <div className="modal-body approval-review">
          {error && <ErrorNotice error={error} />}
          <dl>
            <dt>مقصد</dt>
            <dd>{s.applicationName}</dd>
            <dt>نسخه</dt>
            <dd>
              <code>{s.repository.commit.slice(0, 12)}</code>
            </dd>
            <dt>اثر</dt>
            <dd>
              {s.createApplication
                ? `سرویس جدید با پلن انتخابی${s.createNetwork ? ' و شبکه خصوصی' : ''} ساخته و پروژه در آن منتشر می‌شود.`
                : 'نسخه جاری سرویس جایگزین می‌شود و ممکن است وقفه ایجاد شود.'}
            </dd>
            <dt>منابع و هزینه</dt>
            <dd>{s.resourceSummary ?? 'پلن فعلی حفظ می‌شود؛ هزینه مصرف تابع حساب لیارا است.'}</dd>
          </dl>
          <label className="approval-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            انتشار این نسخه روی سرویس مشخص‌شده و اثر احتمالی آن را تأیید می‌کنم.
          </label>
          <div className="dialog-actions">
            <Button variant="secondary" disabled={busy} onClick={() => void decide('cancel')}>
              لغو طرح
            </Button>
            <Button disabled={!consent || busy} onClick={() => void decide('approve')}>
              {busy ? 'در حال ثبت…' : 'تأیید و شروع انتشار'}
              <Rocket size={16} />
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
