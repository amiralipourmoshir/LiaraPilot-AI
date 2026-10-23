import { ExecutionAdvisor } from './execution-advisor';
import { DeploymentTerminal } from './deployment-terminal';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, AlertTriangle, LoaderCircle, ShieldCheck, ExternalLink } from 'lucide-react';
import {
  deploymentSchema,
  deploymentFailureMessage,
} from '../../../../packages/shared/src/deployment';
import { deploymentSnapshotSchema } from '../../../../packages/deployment/src/contracts';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { useWorkspace, formatDate } from '../lib/workspace';
import { ErrorNotice, Loading } from './common';
import { DeploymentRecovery } from './deployment-recovery';
import { PlatformMark } from './platform-mark';
import { AgentForm } from './agent-form';
const labels: Record<string, string> = {
  PLANNED: 'طرح آماده تأیید شماست',
  QUEUED: 'در صف اجرای طرح',
  RUNNING: 'پایلوت مشغول اجرای طرح است',
  VERIFYING: 'در حال بررسی دسترسی وب',
  SUCCEEDED: 'انتشار و بررسی دسترسی وب کامل شد',
  NEEDS_ATTENTION: 'ادامه مسیر به بررسی نیاز دارد',
  FAILED: 'انتشار متوقف شد',
  CANCELLED: 'طرح لغو شد',
  EXPIRED: 'مهلت طرح تمام شده است',
};
export function AgentDeploymentRun({ id: initialId, model }: { id: string; model?: string }) {
  const [id, setId] = useState(initialId);
  useEffect(() => setId(initialId), [initialId]);
  const { user } = useWorkspace(),
    session = useSession(),
    client = useQueryClient();
  const [error, setError] = useState<Error | null>(null);
  const key = ['deployment', user.id, id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api(`/deployments/${id}`, deploymentSchema),
    refetchInterval: (q) =>
      ['QUEUED', 'RUNNING', 'VERIFYING'].includes(q.state.data?.state ?? '') ? 3000 : false,
  });
  useEffect(() => {
    if (
      !query.data ||
      !['QUEUED', 'RUNNING', 'VERIFYING'].includes(query.data.state) ||
      typeof EventSource === 'undefined'
    )
      return;
    const stream = new EventSource(`/api/v1/deployments/${id}/events`, { withCredentials: true });
    stream.onmessage = () => {
      void client.invalidateQueries({ queryKey: key });
    };
    stream.addEventListener('complete', () => {
      stream.close();
      void client.invalidateQueries({ queryKey: key });
    });
    return () => stream.close();
  }, [id, query.data?.state]);
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} retry={() => void query.refetch()} />;
  const data = query.data,
    s = deploymentSnapshotSchema.parse(data.snapshot),
    active = ['QUEUED', 'RUNNING', 'VERIFYING'].includes(data.state);
  const decide = async (decision: 'approve' | 'cancel') => {
    setError(null);
    try {
      const result = await api(`/deployments/${id}/decision`, deploymentSchema, {
        method: 'POST',
        body: { decision, hash: data.hash },
        csrfToken: session.data?.csrfToken,
      });
      client.setQueryData(key, result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('ثبت تصمیم انجام نشد.'));
    }
  };
  return (
    <section className="agent-execution">
      <div className="agent-execution-heading">
        {active ? (
          <LoaderCircle size={22} className="spin" />
        ) : data.state === 'SUCCEEDED' ? (
          <Check size={22} />
        ) : (
          <ShieldCheck size={22} />
        )}
        <div>
          <h2>{labels[data.state]}</h2>
          <p>
            <bdi>{s.applicationName}</bdi> ·{' '}
            <PlatformMark platform={s.repository.framework} size={26} label />
          </p>
        </div>
      </div>
      {data.state !== 'PLANNED' && data.state !== 'CANCELLED' && (
        <DeploymentTerminal id={id} active={active || data.recovery?.status === 'IN_PROGRESS'} />
      )}
      {data.state !== 'PLANNED' && data.state !== 'CANCELLED' && (
        <ExecutionAdvisor key={id} id={id} state={data.state} model={model} />
      )}
      <div className="agent-approval-summary">
        <p>
          {s.createApplication
            ? 'ساخت سرویس جدید و انتشار پروژه'
            : 'انتشار نسخه جدید روی سرویس انتخاب‌شده'}
        </p>
        <strong>{s.resourceSummary ?? 'هزینه طبق پلن فعلی حساب لیارا'}</strong>
        {s.createNetwork && <p>یک شبکه خصوصی هم ساخته می‌شود.</p>}
        <p>
          نسخهٔ انتخاب‌شده: <code>{s.repository.commit.slice(0, 12)}</code>
        </p>
        {!!s.secretNames?.length && <p>تنظیمات امن: {s.secretNames.join('، ')}</p>}
        <p>
          اگر پس از ساخت سرویس، ساخت پروژه شکست بخورد، سرویس خودکار حذف نمی‌شود و ممکن است هزینه
          داشته باشد.
        </p>
      </div>
      {error && <ErrorNotice error={error} />}
      {data.state === 'PLANNED' && (
        <AgentForm
          fields={[
            {
              name: 'approve',
              type: 'checkbox',
              label:
                'طرح، مقصد و هزینه را بررسی کردم و ساخت سرویس و انتشار این نسخه را تأیید می‌کنم.',
              required: true,
            },
          ]}
          submitLabel="تأیید و شروع عملیات"
          onSubmit={async () => decide('approve')}
        />
      )}
      {data.state === 'PLANNED' && (
        <button className="text-link" onClick={() => void decide('cancel')}>
          لغو این طرح
        </button>
      )}
      <ol className="agent-live-timeline" aria-label="روند زنده انتشار" aria-live="polite">
        {data.events.map((event, i) => (
          <li
            key={event.sequence}
            className={i === data.events.length - 1 && active ? 'is-current' : 'is-complete'}
          >
            <span>
              {i === data.events.length - 1 && active ? (
                <LoaderCircle size={16} className="spin" />
              ) : i === data.events.length - 1 &&
                ['FAILED', 'NEEDS_ATTENTION'].includes(data.state) ? (
                <AlertTriangle size={16} />
              ) : (
                <Check size={16} />
              )}
            </span>
            <div>
              <p>{event.message}</p>
              <time>{formatDate(event.createdAt)}</time>
            </div>
          </li>
        ))}
      </ol>
      {['NEEDS_ATTENTION', 'FAILED', 'VERIFYING', 'EXPIRED'].includes(data.state) && (
        <DeploymentRecovery deployment={data} onPrepared={setId} />
      )}
      {data.errorCode && (
        <div className="deployment-blocker">
          <p>{deploymentFailureMessage(data.errorCode)}</p>
          <details>
            <summary>جزئیات فنی</summary>
            <code>{data.errorCode}</code> · <bdi>{data.phase}</bdi>
          </details>
        </div>
      )}
      {data.state === 'SUCCEEDED' && (
        <a
          className="message-action"
          href={`https://${s.applicationName}.liara.run`}
          target="_blank"
          rel="noopener noreferrer"
        >
          باز کردن پروژه
          <ExternalLink size={16} />
        </a>
      )}
    </section>
  );
}
