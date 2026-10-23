import { useRef, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { ArrowLeft, Check, Copy, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { Mascot } from './mascot';
import { Button } from './ui/button';
import { useWorkspace } from '../lib/workspace';
export function PageTitle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <span className="page-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="page-title-actions">{children}</div>}
    </div>
  );
}
export function StatusBadge({
  status,
}: {
  status: 'healthy' | 'attention' | 'succeeded' | 'failed' | 'done' | 'skipped';
}) {
  const labels = {
    healthy: 'سالم',
    attention: 'نیازمند بررسی',
    succeeded: 'موفق',
    failed: 'ناموفق',
    done: 'انجام‌شده',
    skipped: 'اجرا نشده',
  };
  return (
    <span className={`app-status app-status-${status}`}>
      <i />
      {labels[status]}
    </span>
  );
}
export function DemoLabel({ compact = false }: { compact?: boolean }) {
  return <span className="sample-label">{compact ? 'دمو' : 'داده نمایشی'}</span>;
}
export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="text-link" to={to}>
      {children}
      <ArrowLeft size={14} />
    </Link>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="app-empty">
      <Mascot size={94} full />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function DemoRequired({ title = 'این بخش را در محیط دمو ببینید.' }: { title?: string }) {
  const { base, mode } = useWorkspace();
  return (
    <EmptyState
      title={title}
      description={
        mode === 'LIVE'
          ? 'این صفحه فعلاً پیش‌نمایش است. اطلاعات واقعی اتصال را از بخش سرویس‌های لیارا ببینید.'
          : 'در این بخش هنوز اطلاعات ابری دریافت نشده است. اتصال‌ها را مدیریت کنید یا از حالت نمایشی استفاده کنید.'
      }
      action={
        <Button asChild variant="secondary">
          <Link to={`${base}${mode === 'LIVE' ? '/applications' : '/connections'}`}>
            {mode === 'LIVE' ? 'سرویس‌های لیارا' : 'وضعیت اتصال‌ها'}
            <ArrowLeft size={16} />
          </Link>
        </Button>
      }
    />
  );
}
export function CopyButton({ value, label = 'کپی' }: { value: string; label?: string }) {
  return (
    <button
      className="copy-button"
      aria-label={label}
      title={label}
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => toast.success('کپی شد.'))
          .catch(() => toast.error('کپی خودکار ممکن نیست؛ متن را انتخاب کنید.'));
      }}
    >
      <Copy size={14} />
    </button>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = '',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const openedPath = useRef('');
  const location = useLocation();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className={`dialog-content ${className}`}
          onOpenAutoFocus={() => {
            previousFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            openedPath.current = location.pathname;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (openedPath.current !== location.pathname)
              document.getElementById('main-content')?.focus({ preventScroll: true });
            else if (previousFocus.current?.isConnected) previousFocus.current.focus();
          }}
        >
          <div className="dialog-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="بستن">
              <X size={20} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function CheckLine({ children }: { children: ReactNode }) {
  return (
    <span className="check-line">
      <Check size={14} />
      {children}
    </span>
  );
}
