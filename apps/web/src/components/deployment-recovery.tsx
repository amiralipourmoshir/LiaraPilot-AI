import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  CheckCircle2,
  LoaderCircle,
} from 'lucide-react';
import { z } from 'zod';
import { deploymentSchema } from '../../../../packages/shared/src/deployment';
import { deploymentSnapshotSchema } from '../../../../packages/deployment/src/contracts';
import { useWorkspace, formatDate } from '../lib/workspace';
import { useSession } from '../lib/session';
import { api, ApiError } from '../lib/api';
import { Button } from './ui/button';
import { ErrorNotice } from './common';
import { Modal } from './primitives';
import { DeploymentWizard } from './deployment-wizard';
export function DeploymentRecovery({
  deployment,
  onPrepared,
}: {
  deployment: z.infer<typeof deploymentSchema>;
  onPrepared: (id: string) => void;
}) {
  const { user } = useWorkspace(),
    session = useSession(),
    client = useQueryClient();
  const [busy, setBusy] = useState(''),
    [error, setError] = useState<Error | null>(null),
    [configure, setConfigure] = useState(false);
  const checking = useRef(false),
    automaticChecks = useRef(0);
  const snapshot = deploymentSnapshotSchema.parse(deployment.snapshot);
  const save = (data: z.infer<typeof deploymentSchema>) => {
    client.setQueryData(['deployment', user.id, deployment.id], data);
    void client.invalidateQueries({ queryKey: ['deployments', user.id] });
  };
  const check = async () => {
    if (checking.current) return;
    checking.current = true;
    setBusy('check');
    setError(null);
    try {
      save(
        await api(`/deployments/${deployment.id}/recheck`, deploymentSchema, {
          method: 'POST',
          body: {},
          csrfToken: session.data?.csrfToken,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e : new Error('بررسی مجدد فعلاً ممکن نشد.'));
    } finally {
      checking.current = false;
      setBusy('');
    }
  };
  useEffect(() => {
    automaticChecks.current = 0;
  }, [deployment.id]);
  useEffect(() => {
    if (deployment.recovery?.status !== 'IN_PROGRESS') return;
    const timer = setInterval(() => {
      if (automaticChecks.current++ < 60) void check();
      else clearInterval(timer);
    }, 10000);
    return () => clearInterval(timer);
  }, [deployment.id, deployment.recovery?.status]);
  const retry = async () => {
    setBusy('retry');
    setError(null);
    try {
      const result = await api(`/deployments/${deployment.id}/retry`, deploymentSchema, {
        method: 'POST',
        body: { hash: deployment.hash },
        csrfToken: session.data?.csrfToken,
      });
      onPrepared(result.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'RETRY_SETTINGS_REQUIRED') setConfigure(true);
      setError(e instanceof Error ? e : new Error('آماده‌سازی تلاش دوباره انجام نشد.'));
    } finally {
      setBusy('');
    }
  };
  const terminal = ['NEEDS_ATTENTION', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(deployment.state);
  return (
    <section className="deployment-recovery-card">
      <div className="recovery-title">
        {deployment.recovery?.status === 'VERIFIED' ? (
          <CheckCircle2 size={23} />
        ) : (
          <ShieldCheck size={23} />
        )}
        <div>
          <h3>وضعیت واقعی را بررسی کنیم</h3>
          <p>
            بررسی مجدد، سرویس تازه‌ای نمی‌سازد. تلاش دوباره ابتدا یک طرح جدید برای تأیید شما آماده
            می‌کند.
          </p>
        </div>
      </div>
      {deployment.recovery && (
        <div
          className={`recovery-observation recovery-${deployment.recovery.status.toLowerCase()}`}
          aria-live="polite"
        >
          {deployment.recovery.status !== 'IN_PROGRESS' && <p>{deployment.recovery.message}</p>}
          <small>آخرین بررسی: {formatDate(deployment.recovery.checkedAt)}</small>
          {deployment.recovery.status === 'IN_PROGRESS' && (
            <span>
              <LoaderCircle size={13} className="spin" /> ساخت در جریان است؛ خروجی را در ترمینال
              زنده دنبال کنید.
            </span>
          )}
        </div>
      )}
      {(deployment.errorCode === 'CREATION_CREDIT_REQUIRED' ||
        (deployment.errorCode === 'DEPLOYMENT_RATE_LIMITED' &&
          deployment.phase === 'APPLICATION_REQUEST')) && (
        <div className="wizard-payment-card">
          <div>
            <h4>اعتبار لازم برای ساخت سرویس را بررسی کنیم</h4>
            <p>
              پاسخ ۴۲۹ ساخت سرویس در لیارا می‌تواند به شرط اعتبار یک هفته همه سرویس‌ها مربوط باشد.
              شارژ حساب را در کنسول انجام دهید؛ سپس وضعیت را بررسی و طرح تازه آماده کنید.
            </p>
            <a href="https://console.liara.ir/credit" target="_blank" rel="noopener noreferrer">
              افزایش اعتبار حساب لیارا
            </a>
          </div>
        </div>
      )}
      {error && <ErrorNotice error={error} />}
      <div className="recovery-actions">
        <Button variant="secondary" disabled={!!busy} onClick={() => void check()}>
          <RefreshCw size={16} className={busy === 'check' ? 'spin' : ''} />
          {busy === 'check' ? 'در حال بررسی وضعیت…' : 'بررسی مجدد'}
        </Button>
        {deployment.retryId ? (
          <Button onClick={() => onPrepared(deployment.retryId!)}>ادامه طرح تلاش دوباره</Button>
        ) : (
          terminal && (
            <Button
              disabled={!!busy || !deployment.recovery?.canRetry}
              onClick={() => void retry()}
            >
              <RotateCcw size={16} />
              {busy === 'retry' ? 'در حال آماده‌سازی طرح تازه…' : 'تلاش دوباره با بازبینی طرح'}
            </Button>
          )
        )}
        {terminal && (
          <Button variant="ghost" onClick={() => setConfigure(true)}>
            <Settings2 size={16} />
            اصلاح تنظیمات و تلاش دوباره
          </Button>
        )}
      </div>
      {!deployment.recovery && terminal && (
        <small className="recovery-help">
          ابتدا «بررسی مجدد» را بزنید تا مشخص شود انتشار قبلی تمام شده یا هنوز در حال اجراست.
        </small>
      )}
      <Modal
        open={configure}
        onOpenChange={setConfigure}
        title="اصلاح مسیر انتشار"
        description="نوع پروژه، مقصد و تنظیمات را بازبینی می‌کنیم؛ اجرای تازه پس از تأیید طرح انجام می‌شود."
        className="agent-workflow-dialog"
      >
        <DeploymentWizard
          initialUrl={`https://github.com/${snapshot.repository.owner}/${snapshot.repository.repo}`}
          onPrepared={(id) => {
            setConfigure(false);
            onPrepared(id);
          }}
        />
      </Modal>
    </section>
  );
}
