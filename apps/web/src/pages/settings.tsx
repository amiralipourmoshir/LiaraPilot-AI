import { Link, useNavigate } from 'react-router';
import {
  ArrowLeft,
  Check,
  Code2,
  Github,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useTheme } from '../lib/theme';
import { useWorkspace, useWorkspaceUi } from '../lib/workspace';
import { Button } from '../components/ui/button';
import { Mascot } from '../components/mascot';
import { LiaraConnectionCard } from '../components/liara-connection';
import { CopyButton, PageTitle, SectionHeading } from '../components/primitives';
export function ConnectionsPage() {
  const { base, mode, preview } = useWorkspace();
  return (
    <>
      <PageTitle
        eyebrow="یک مرکز، برای اتصال‌های شما"
        title="اتصال‌ها"
        description="وضعیت دسترسی‌ها را شفاف ببینید؛ فقط قابلیت‌های آماده فعال خواهند بود."
      />
      <div className="connections-grid">
        <LiaraConnectionCard />
        <section className="surface-card connection-card">
          <div className="connection-brand">
            <Github size={38} />
            <span className="connection-unavailable">تحلیل مخزن عمومی فعال است</span>
          </div>
          <h2>مخزن GitHub</h2>
          <p>بررسی ساختار پروژه و مشخص کردن نسخه مبدأ، شروع مسیر انتشار قابل ردیابی است.</p>
          <div className="connection-features">
            <span>
              <Check size={14} />
              مخزن عمومی بدون ورود GitHub
            </span>
            <span>
              <Check size={14} />
              انتخاب branch و ثبت commit
            </span>
            <span>
              <Check size={14} />
              مخزن خصوصی از طریق ورود رسمی GitHub
            </span>
          </div>
          <div className="connection-planned">
            <Code2 size={18} />
            <div>
              <b>از مخزن تا طرح انتشار</b>
              <p>تشخیص نوع پروژه، انتخاب شاخه، پیشنهاد پلن واقعی و تنظیمات خودکار آماده است.</p>
            </div>
          </div>
          <Button asChild variant="secondary">
            <Link to={preview ? '/login' : `${base}/deployments`}>
              آماده‌سازی انتشار
              <ArrowLeft size={16} />
            </Link>
          </Button>
        </section>
      </div>
      <div className="surface-card demo-connection-card">
        <Mascot size={78} full />
        <div>
          <h2>
            {mode === 'DEMO'
              ? 'برای تجربه رابط، نیازی به اتصال ندارید.'
              : 'محیط دمو همیشه جدا و در دسترس است.'}
          </h2>
          <p>
            داده‌های نمونه به شما اجازه می‌دهند مسیر پروژه، پایش و بررسی خطا را بدون دسترسی به سرویس
            واقعی ببینید.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link to={preview ? `${base}/projects` : '/demo/projects'}>
            دیدن پروژه‌های دمو
            <ArrowLeft size={16} />
          </Link>
        </Button>
      </div>
    </>
  );
}
export function SettingsPage() {
  const { base, user, preview } = useWorkspace();
  const { theme, setTheme } = useTheme();
  const ui = useWorkspaceUi();
  const navigate = useNavigate();
  return (
    <>
      <PageTitle
        eyebrow="فضا را به سلیقه خودتان بسازید"
        title="تنظیمات"
        description="ظاهر برنامه و اطلاعات فضای کاری خود را ببینید و تنظیم کنید."
      />
      <section className="surface-card settings-section">
        <SectionHeading
          title="ظاهر برنامه"
          description="هر دو تم با فونت کلمه طراحی شده‌اند. انتخاب شما در همین مرورگر ذخیره می‌شود."
          action={<Palette size={21} />}
        />
        <div className="theme-cards" role="group" aria-label="تنظیم تم">
          {[
            { id: 'light' as const, title: 'روشن', Icon: Sun },
            { id: 'dark' as const, title: 'تاریک', Icon: Moon },
            { id: 'system' as const, title: 'هماهنگ با سیستم', Icon: Monitor },
          ].map((item) => (
            <button
              key={item.id}
              className={`theme-card theme-card-${item.id}`}
              aria-pressed={theme === item.id}
              onClick={() => setTheme(item.id)}
            >
              <span className="theme-preview">
                <span className="theme-preview-sidebar">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="theme-preview-content">
                  <i />
                  <span>
                    <i />
                    <i />
                  </span>
                  <i />
                </span>
              </span>
              <span className="theme-card-label">
                <item.Icon size={16} />
                {item.title}
                {theme === item.id && <Check size={16} />}
              </span>
            </button>
          ))}
        </div>
      </section>
      <div className="two-column-grid settings-lower">
        <section className="surface-card">
          <SectionHeading
            title="اطلاعات حساب"
            description={
              preview ? 'شما در محیط عمومی دمو هستید.' : 'اطلاعات ثبت‌شده هنگام ساخت حساب'
            }
          />
          <dl className="detail-list">
            <div>
              <dt>نام</dt>
              <dd>{preview ? 'مهمان دمو' : user.name}</dd>
            </div>
            <div>
              <dt>ایمیل</dt>
              <dd>
                {user.email ? (
                  <>
                    <bdi>{user.email}</bdi>
                    <CopyButton value={user.email} />
                  </>
                ) : (
                  'بدون حساب شخصی'
                )}
              </dd>
            </div>
            <div>
              <dt>زبان و جهت</dt>
              <dd>فارسی · راست‌به‌چپ</dd>
            </div>
            <div>
              <dt>فونت</dt>
              <dd>کلمه · چهار وزن</dd>
            </div>
          </dl>
          {preview && (
            <div className="detail-panel-action">
              <Button asChild variant="secondary">
                <Link to="/register">
                  ساخت حساب شخصی
                  <ArrowLeft size={16} />
                </Link>
              </Button>
            </div>
          )}
        </section>
        <section className="surface-card">
          <SectionHeading title="محیط و دسترسی‌ها" />
          <div className="settings-mode-description">
            <ShieldCheck size={27} />
            <h3>اطلاعات شخصی و دمو از هم جدا هستند.</h3>
            <p>تغییر محیط، هیچ منبع ابری را ایجاد نمی‌کند و اطلاعات حساب شما را تغییر نمی‌دهد.</p>
            <Button
              variant="secondary"
              onClick={() => {
                ui.setProject('all');
                if (!preview) ui.setMode('DEMO');
                void navigate(base);
              }}
            >
              بازگشت به نمای کلی دمو
              <ArrowLeft size={16} />
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
