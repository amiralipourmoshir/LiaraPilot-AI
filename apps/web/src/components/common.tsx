import { useEffect } from 'react';
import { Sun, Moon, Monitor, AlertCircle, ArrowUpLeft } from 'lucide-react';
import { Link } from 'react-router';
import { useTheme } from '../lib/theme';
import { Button } from './ui/button';
import { ApiError } from '../lib/api';
import { Mascot } from './mascot';
export function ThemeControl() {
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [theme]);
  return (
    <div className="theme-control" role="group" aria-label="انتخاب تم">
      {(
        [
          { value: 'light', label: 'تم روشن', Icon: Sun },
          { value: 'dark', label: 'تم تاریک', Icon: Moon },
          { value: 'system', label: 'تم سیستم', Icon: Monitor },
        ] as const
      ).map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          title={label}
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="brand" aria-label="لیاراپایلوت، صفحه اصلی">
      <Mascot size={45} />
      <span>
        <b>
          لیاراپایلوت<span className="brand-ai"> AI</span>
        </b>
        {!compact && <small>از کد تا کلاد</small>}
      </span>
    </Link>
  );
}
export function ErrorNotice({ error, retry }: { error: Error | null; retry?: () => void }) {
  if (!error) return null;
  return (
    <div className="error-notice" role="alert">
      <AlertCircle size={19} />
      <div>
        <p>{error.message}</p>
        {error instanceof ApiError && error.requestId && (
          <small>
            شناسه پیگیری: <bdi>{error.requestId}</bdi>
          </small>
        )}
        {retry && (
          <button type="button" onClick={retry}>
            تلاش دوباره
          </button>
        )}
      </div>
    </div>
  );
}
export function Loading({ label = 'در حال دریافت اطلاعات…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <Mascot size={65} animate />
      <p>{label}</p>
    </div>
  );
}
export function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className="center-page">
      <Brand />
      <span className="eyebrow">۴۰۴ / مسیر نامعتبر</span>
      <h1>این صفحه پیدا نشد.</h1>
      <p>از صفحه اصلی به فضای کاری خود برگردید.</p>
      <Button asChild>
        <Link to="/">
          بازگشت به خانه <ArrowUpLeft size={17} />
        </Link>
      </Button>
    </main>
  );
}
