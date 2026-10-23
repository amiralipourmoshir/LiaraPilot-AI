import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Plug,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  cloudConnectionSchema,
  cloudConnectionsSchema,
  liaraConnectSchema,
  type CloudConnection,
} from '../../../../packages/shared/src/cloud';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { formatDate, persianNumber, useWorkspace, useWorkspaceUi } from '../lib/workspace';
import { ErrorNotice, Loading } from './common';
import { Modal } from './primitives';
import { Button } from './ui/button';
export function LiaraConnectionCard() {
  const { mode, preview } = useWorkspace();
  const ui = useWorkspaceUi();
  if (mode === 'DEMO' || preview)
    return (
      <section className="surface-card connection-card">
        <div className="connection-brand">
          <img src="/brand/liara-logo.svg" width="112" height="51" alt="لیارا" />
          <span className="connection-unavailable">محیط نمایشی</span>
        </div>
        <h2>حساب ابری لیارا</h2>
        <p>
          برای اتصال واقعی، وارد فضای شخصی شوید. در محیط دمو هیچ توکن یا اطلاعات حساب واقعی دریافت
          نمی‌شود.
        </p>
        <div className="connection-planned">
          <LockKeyhole size={18} />
          <div>
            <b>اتصال امن در فضای حساب شخصی آماده است</b>
            <p>اعتبارسنجی توکن، دریافت سرویس‌ها و ذخیره رمزگذاری‌شده</p>
          </div>
        </div>
        <Button asChild className="connection-main-action">
          <Link
            to={preview ? '/login' : '/workspace/connections'}
            onClick={() => {
              if (!preview) ui.setMode('LOCAL');
            }}
          >
            رفتن به اتصال واقعی
            <ArrowLeft size={16} />
          </Link>
        </Button>
      </section>
    );
  return <PersonalLiaraConnection />;
}
function PersonalLiaraConnection() {
  const session = useSession();
  const { base, user } = useWorkspace();
  const ui = useWorkspaceUi();
  const navigate = useNavigate();
  const client = useQueryClient();
  const connections = useQuery({
    queryKey: ['liara-connections', user.id],
    queryFn: () => api('/connections/liara', cloudConnectionsSchema),
    retry: false,
  });
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [connectError, setConnectError] = useState<Error | null>(null);
  const [disconnect, setDisconnect] = useState<CloudConnection | null>(null);
  const form = useForm<z.infer<typeof liaraConnectSchema>>({
    resolver: zodResolver(liaraConnectSchema),
    defaultValues: { label: 'حساب لیارای من', token: '', teamId: '' },
  });
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['liara-connections'] });
    void client.invalidateQueries({ queryKey: ['cloud-applications'] });
    void client.invalidateQueries({ queryKey: ['cloud-application'] });
  };
  const sync = useMutation({
    mutationFn: (id: string) =>
      api(`/connections/liara/${id}/sync`, cloudConnectionSchema, {
        method: 'POST',
        csrfToken: session.data?.csrfToken,
      }),
    onSuccess: () => {
      invalidate();
      toast.success('فهرست سرویس‌ها از لیارا به‌روز شد.');
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/connections/liara/${id}/disconnect`, z.object({ disconnected: z.literal(true) }), {
        method: 'POST',
        csrfToken: session.data?.csrfToken,
      }),
    onSuccess: () => {
      client.removeQueries({ queryKey: ['cloud-logs'] });
      client.removeQueries({ queryKey: ['cloud-releases'] });
      client.removeQueries({ queryKey: ['cloud-metrics'] });
      invalidate();
      setDisconnect(null);
      toast.success('اتصال قطع و توکن ذخیره‌شده حذف شد.');
    },
  });
  const submit = async (values: z.infer<typeof liaraConnectSchema>) => {
    // Keep credentials out of TanStack's mutation cache, URLs and persistent browser storage.
    setSubmitting(true);
    setConnectError(null);
    form.setValue('token', '');
    try {
      const result = await api('/connections/liara', cloudConnectionSchema, {
        method: 'POST',
        body: values,
        csrfToken: session.data?.csrfToken,
      });
      form.reset({ label: 'حساب لیارای من', token: '', teamId: '' });
      setOpen(false);
      invalidate();
      toast.success(
        `اتصال اعتبارسنجی شد؛ ${persianNumber(result.applicationCount)} سرویس دریافت شد.`,
      );
    } catch (error) {
      setConnectError(error instanceof Error ? error : new Error('اتصال برقرار نشد.'));
    } finally {
      setSubmitting(false);
    }
  };
  const showApplications = () => {
    ui.setMode('LIVE');
    void navigate(`${base}/applications`);
  };
  return (
    <section className="surface-card connection-card">
      <div className="connection-brand">
        <img src="/brand/liara-logo.svg" width="112" height="51" alt="لیارا" />
        <span className="connection-unavailable">اتصال واقعی · فقط خواندن</span>
      </div>
      <h2>حساب ابری لیارا</h2>
      <p>
        توکن در فرم امن دریافت و پس از اعتبارسنجی، رمزگذاری می‌شود. این اتصال اجازه اجرای انتشار یا
        تغییر سرویس را در برنامه فعال نمی‌کند.
      </p>
      <ErrorNotice
        error={connections.error}
        retry={() => {
          void connections.refetch();
        }}
      />
      {connections.isPending ? (
        <Loading label="در حال دریافت اتصال‌ها…" />
      ) : (
        <>
          {connections.data && !connections.data.configured && (
            <div className="information-note">
              <LockKeyhole size={17} />
              کلید رمزگذاری سرور تنظیم نشده است؛ مدیر برنامه باید آن را پیکربندی کند.
            </div>
          )}
          <div className="saved-connections">
            {connections.data?.connections.map((connection) => (
              <article key={connection.id} className="saved-connection">
                <div>
                  <b>{connection.label}</b>
                  <span
                    className={
                      connection.status === 'CONNECTED' ? 'live-label' : 'connection-unavailable'
                    }
                  >
                    {connection.status === 'CONNECTED' ? 'اعتبارسنجی‌شده' : 'قطع‌شده'}
                  </span>
                </div>
                <p>
                  {connection.teamId ? (
                    <>
                      تیم: <bdi>{connection.teamId}</bdi>
                    </>
                  ) : (
                    'حساب شخصی لیارا'
                  )}{' '}
                  · {persianNumber(connection.applicationCount)} سرویس
                </p>
                {connection.syncedAt && (
                  <small>آخرین دریافت موفق: {formatDate(connection.syncedAt)}</small>
                )}
                {connection.lastErrorCode && (
                  <p className="warning-text">
                    آخرین همگام‌سازی ناموفق بود؛ زمان بالا مربوط به آخرین دریافت موفق است.
                  </p>
                )}
                {connection.status === 'CONNECTED' && (
                  <div className="saved-connection-actions">
                    <Button size="small" variant="secondary" onClick={showApplications}>
                      دیدن سرویس‌ها
                      <ArrowLeft size={14} />
                    </Button>
                    <button
                      className="icon-button"
                      aria-label={`همگام‌سازی ${connection.label}`}
                      onClick={() => sync.mutate(connection.id)}
                      disabled={sync.isPending}
                    >
                      <RefreshCw size={16} className={sync.isPending ? 'spin' : ''} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`قطع اتصال ${connection.label}`}
                      onClick={() => setDisconnect(connection)}
                    >
                      <Unplug size={17} />
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
          <ErrorNotice error={sync.error} />
          <ErrorNotice error={remove.error} />
          <Button
            className="connection-main-action"
            onClick={() => {
              setConnectError(null);
              setOpen(true);
            }}
            disabled={!connections.data?.configured}
          >
            <Plug size={17} />
            {connections.data?.connections.some((connection) => connection.status === 'CONNECTED')
              ? 'افزودن یا جایگزینی اتصال'
              : 'اتصال امن حساب لیارا'}
          </Button>
        </>
      )}
      <Modal
        open={open}
        onOpenChange={(value) => {
          if (submitting) return;
          setOpen(value);
          if (!value) {
            form.setValue('token', '');
            setVisible(false);
          }
        }}
        title="اتصال امن به حساب لیارا"
        description="فقط اطلاعات سرویس‌ها خوانده می‌شود. هیچ منبعی ساخته یا تغییری در لیارا اجرا نمی‌شود."
      >
        <form
          className="modal-body"
          onSubmit={form.handleSubmit((values) => {
            void submit(values);
          })}
          noValidate
        >
          <div className="field">
            <label htmlFor="liara-label">نام این اتصال</label>
            <input
              id="liara-label"
              {...form.register('label')}
              aria-invalid={!!form.formState.errors.label}
            />
            {form.formState.errors.label && (
              <small className="field-error">{form.formState.errors.label.message}</small>
            )}
          </div>
          <div className="field">
            <label htmlFor="liara-token">توکن دسترسی لیارا</label>
            <div className="password-input">
              <input
                id="liara-token"
                type={visible ? 'text' : 'password'}
                dir="ltr"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-invalid={!!form.formState.errors.token}
                aria-describedby="liara-token-help"
                {...form.register('token')}
              />
              <button
                type="button"
                aria-label={visible ? 'پنهان کردن توکن' : 'نمایش توکن'}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <small
              id="liara-token-help"
              className={form.formState.errors.token ? 'field-error' : 'field-hint'}
            >
              {form.formState.errors.token?.message ??
                'فقط خود توکن، بدون پیشوند Bearer؛ آن را در گفتگو ارسال نکنید.'}
            </small>
          </div>
          <div className="field">
            <label htmlFor="liara-team">
              شناسه تیم <span className="field-hint">(اختیاری)</span>
            </label>
            <input
              id="liara-team"
              dir="ltr"
              autoComplete="off"
              placeholder="برای حساب شخصی خالی بگذارید"
              {...form.register('teamId')}
              aria-invalid={!!form.formState.errors.teamId}
            />
            {form.formState.errors.teamId && (
              <small className="field-error">{form.formState.errors.teamId.message}</small>
            )}
          </div>
          <div className="credential-note">
            <ShieldCheck size={17} />
            <p>
              توکن پس از ارسال از ورودی پاک می‌شود و در سرور رمزگذاری‌شده نگه داشته خواهد شد. کلید
              رمزگذاری خارج از دیتابیس است.
            </p>
          </div>
          <ErrorNotice error={connectError} />
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <LoaderCircle size={17} className="spin" />
                در حال اعتبارسنجی…
              </>
            ) : (
              <>
                اعتبارسنجی و اتصال
                <ArrowLeft size={16} />
              </>
            )}
          </Button>
          <a
            className="credential-doc-link"
            href="https://docs.liara.ir/references/api/about/"
            target="_blank"
            rel="noreferrer"
          >
            راهنمای رسمی دریافت توکن لیارا
          </a>
        </form>
      </Modal>
      <Modal
        open={!!disconnect}
        onOpenChange={(value) => {
          if (!remove.isPending && !value) setDisconnect(null);
        }}
        title="اتصال این حساب قطع شود؟"
        description="توکن ذخیره‌شده در لیاراپایلوت حذف می‌شود. سرویس‌های لیارا خاموش یا حذف نمی‌شوند؛ برای اتصال دوباره باید توکن را وارد کنید."
      >
        <div className="modal-body dialog-actions">
          <Button
            variant="secondary"
            onClick={() => setDisconnect(null)}
            disabled={remove.isPending}
          >
            انصراف
          </Button>
          <Button
            onClick={() => {
              if (disconnect) remove.mutate(disconnect.id);
            }}
            disabled={remove.isPending}
          >
            {remove.isPending ? 'در حال قطع اتصال…' : 'قطع اتصال و حذف توکن'}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
