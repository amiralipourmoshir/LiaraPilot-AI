import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, Navigate, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpLeft,
  Check,
  Eye,
  EyeOff,
  GitBranch,
  Layers,
  LockKeyhole,
  LoaderCircle,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { registerSchema, sessionSchema } from '../../../../packages/shared/src/index';
import { Brand, ThemeControl, ErrorNotice, Loading } from '../components/common';
import { Mascot } from '../components/mascot';
import { Button } from '../components/ui/button';
import { api } from '../lib/api';
import { sessionKey, useSession } from '../lib/session';
const authFormSchema = z.object({
  name: z.string().optional(),
  email: z.string().trim().email('ایمیل معتبر وارد کنید.'),
  password: z.string().min(1, 'رمز عبور را وارد کنید.').max(128, 'رمز عبور بیش از حد طولانی است.'),
});
type Values = z.infer<typeof authFormSchema>;
export function AuthPage({ register = false }: { register?: boolean }) {
  const session = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(authFormSchema),
    defaultValues: { name: '', email: '', password: '' },
  });
  const mutation = useMutation({
    mutationFn: (values: Values) =>
      api(register ? '/auth/register' : '/auth/login', sessionSchema, {
        method: 'POST',
        body: register
          ? registerSchema.parse(values)
          : { email: values.email, password: values.password },
      }),
    onSuccess: (data) => {
      client.clear();
      client.setQueryData(sessionKey, data);
      void navigate('/workspace');
    },
  });
  const submit = (values: Values) => {
    if (register) {
      const parsed = registerSchema.safeParse(values);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const name = issue.path[0];
          if (name === 'name' || name === 'email' || name === 'password')
            form.setError(name, { message: issue.message });
        }
        return;
      }
    }
    mutation.mutate(values);
  };
  if (session.isPending) return <Loading label="در حال بررسی نشست…" />;
  if (session.data) return <Navigate to="/workspace" replace />;
  return (
    <div className="auth-page">
      <header className="public-header">
        <Brand />
        <div className="header-tools">
          <span className="version-tag">نسخه توسعه · مرحله ۰۴</span>
          <ThemeControl />
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="auth-layout">
        <section className="auth-story" aria-labelledby="story-title">
          <div className="eyebrow">
            <span className="tiny-dot" /> هم‌تیمی ابری شما
          </div>
          <h1 id="story-title">
            ایده از شما.
            <br />
            مسیر تا <span>کلاد،</span>
            <br />
            با لیاراپایلوت.
          </h1>
          <p className="story-description">
            فضایی یکپارچه برای راه‌اندازی، پایش و نگهداری پروژه‌ها؛ با تجربه‌ای روشن، قدم‌به‌قدم و
            به زبان خودتان.
          </p>
          <div className="auth-pet-showcase">
            <Mascot size={210} full animate />
            <div>
              <b>سلام، من پایلوت‌ام.</b>
              <span>همراه شما در مسیر کد تا کلاد</span>
            </div>
          </div>
          <div className="orbit-panel" aria-label="مسیر طراحی‌شده محصول">
            <div className="orbit-grid" />
            <div className="orbit-head">
              <span className="mini-icon">
                <Workflow size={18} />
              </span>
              <span>یک مسیر، از شروع تا پایداری</span>
              <span className="outline-tag">نقشه محصول</span>
            </div>
            <div className="pipeline">
              {[
                { Icon: GitBranch, title: 'کد شما', sub: 'مبدأ پروژه' },
                { Icon: Layers, title: 'انتشار', sub: 'با تأیید شما' },
                { Icon: ShieldCheck, title: 'پایداری', sub: 'بر پایه شواهد' },
              ].map(({ Icon, title, sub }, index) => (
                <div className="pipeline-node" key={title}>
                  <div className={`pipeline-icon pipeline-${index}`}>
                    <Icon size={23} />
                  </div>
                  <b>{title}</b>
                  <small>{sub}</small>
                  {index < 2 && (
                    <span className="pipeline-connector">
                      <ArrowLeft size={15} />
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="orbit-foot">
              <span className="tiny-dot" /> زیرساخت امروز؛ عملیات هوشمند در مراحل بعد
            </div>
          </div>
          <div className="story-benefits">
            <span>
              <Check size={15} /> فارسی و راست‌به‌چپ
            </span>
            <span>
              <Check size={15} /> دو تم، یک تجربه
            </span>
            <span>
              <Check size={15} /> کنترل در دست شما
            </span>
          </div>
        </section>
        <section className="auth-card" aria-labelledby="auth-title">
          <span className="section-number">شروع یک مسیر تازه / ۰۱</span>
          <div className="auth-card-title">
            <h2 id="auth-title">{register ? 'فضای خودتان را بسازید.' : 'خوش برگشتید.'}</h2>
            <p>
              {register
                ? 'با ساخت حساب، اولین قدم را برای مدیریت پروژه‌ها بردارید.'
                : 'وارد شوید و از همان‌جایی که مانده بودید ادامه دهید.'}
            </p>
          </div>
          <ErrorNotice
            error={mutation.error ?? session.error}
            retry={
              session.error
                ? () => {
                    void session.refetch();
                  }
                : undefined
            }
          />
          <form onSubmit={form.handleSubmit(submit)} noValidate>
            {register && (
              <div className="field">
                <label htmlFor="name">نام شما</label>
                <input
                  id="name"
                  autoComplete="name"
                  placeholder="چطور صدایتان کنیم؟"
                  aria-invalid={!!form.formState.errors.name}
                  aria-describedby={form.formState.errors.name ? 'name-error' : undefined}
                  {...form.register('name')}
                />
                {form.formState.errors.name && (
                  <small id="name-error" className="field-error">
                    {form.formState.errors.name.message}
                  </small>
                )}
              </div>
            )}
            <div className="field">
              <label htmlFor="email">ایمیل</label>
              <input
                id="email"
                type="email"
                dir="ltr"
                autoComplete="email"
                placeholder="you@example.com"
                aria-invalid={!!form.formState.errors.email}
                aria-describedby={form.formState.errors.email ? 'email-error' : undefined}
                {...form.register('email')}
              />
              {form.formState.errors.email && (
                <small id="email-error" className="field-error">
                  {form.formState.errors.email.message}
                </small>
              )}
            </div>
            <div className="field">
              <label htmlFor="password">رمز عبور</label>
              <div className="password-input">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  autoComplete={register ? 'new-password' : 'current-password'}
                  placeholder={register ? 'دست‌کم ۱۲ نویسه' : 'رمز عبور شما'}
                  aria-invalid={!!form.formState.errors.password}
                  aria-describedby="password-help"
                  {...form.register('password')}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <small
                id="password-help"
                className={form.formState.errors.password ? 'field-error' : 'field-hint'}
              >
                {form.formState.errors.password?.message ??
                  (register
                    ? 'حداقل ۱۲ نویسه؛ از یک رمز عبور یکتا استفاده کنید.'
                    : 'ورود با ایمیل و رمز عبوری که ثبت کرده‌اید.')}
              </small>
            </div>
            <Button type="submit" className="auth-submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <LoaderCircle className="spin" size={18} /> در حال بررسی…
                </>
              ) : (
                <>
                  {register ? 'ساخت حساب و ورود' : 'ورود به فضای کاری'}
                  <ArrowLeft size={18} />
                </>
              )}
            </Button>
          </form>
          <Button variant="secondary" asChild className="demo-entry">
            <Link to="/demo">
              تجربه محیط دمو
              <ArrowLeft size={16} />
            </Link>
          </Button>
          <p className="auth-switch">
            {register ? 'قبلاً حساب ساخته‌اید؟' : 'هنوز حساب ندارید؟'}{' '}
            <Link to={register ? '/login' : '/register'}>
              {register ? 'وارد شوید' : 'حساب بسازید'}
              <ArrowUpLeft size={15} />
            </Link>
          </p>
          <div className="auth-security">
            <LockKeyhole size={16} />
            <span>نشست امن · رمز عبور به‌صورت هش‌شده ذخیره می‌شود</span>
          </div>
        </section>
      </main>
      <footer className="public-footer">
        <span>لیاراپایلوت / از کد تا کلاد، فقط با یک گفتگو</span>
        <span>دستیار ابری شما، قدم‌به‌قدم</span>
      </footer>
    </div>
  );
}
