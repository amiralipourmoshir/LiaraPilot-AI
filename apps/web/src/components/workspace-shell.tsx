import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  ChevronDown,
  Command,
  FileText,
  FolderKanban,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plug,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { WorkspaceContext, useWorkspaceUi } from '../lib/workspace';
import { useSession, sessionKey } from '../lib/session';
import { api } from '../lib/api';
import { demoProjects } from '../demo/data';
import { Brand, ErrorNotice, Loading, ThemeControl } from './common';
import { Mascot } from './mascot';
import { Modal } from './primitives';
const navigation = [
  { path: '', title: 'نمای کلی', Icon: LayoutDashboard },
  { path: '/assistant', title: 'دستیار هوشمند', Icon: null },
  { path: '/applications', title: 'سرویس‌های لیارا', Icon: Plug },
  { path: '/projects', title: 'پروژه‌ها', Icon: FolderKanban },
  { path: '/deployments', title: 'دیپلوی‌ها', Icon: Rocket },
  { path: '/monitoring', title: 'پایش سرویس‌ها', Icon: Activity },
  { path: '/incidents', title: 'رخدادها و خطاها', Icon: AlertTriangle },
  { path: '/logs', title: 'لاگ‌ها', Icon: FileText },
  { path: '/operations', title: 'تاریخچه عملیات', Icon: History },
];
const utilityNavigation = [
  { path: '/connections', title: 'اتصال‌ها', Icon: Plug },
  { path: '/settings', title: 'تنظیمات', Icon: Settings },
];
export function WorkspaceShell({ preview = false }: { preview?: boolean }) {
  const session = useSession(!preview);
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const preferences = useWorkspaceUi();
  const mode = preview
    ? ('DEMO' as const)
    : location.pathname.includes('/applications')
      ? ('LIVE' as const)
      : location.pathname.endsWith('/foundation')
        ? ('LOCAL' as const)
        : preferences.mode;
  const base = preview ? '/demo' : '/workspace';
  const focusedAssistant = !preview && mode !== 'DEMO' && location.pathname.endsWith('/assistant');
  useEffect(() => {
    if (!focusedAssistant || !session.data?.user) return;
    document.documentElement.classList.add('chat-viewport');
    return () => document.documentElement.classList.remove('chat-viewport');
  }, [focusedAssistant, session.data?.user.id]);
  const [mobile, setMobile] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [search, setSearch] = useState('');
  const previousPath = useRef(location.pathname);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const menuOpenedPath = useRef(location.pathname);
  useEffect(() => {
    setMobile(false);
    setSearchOpen(false);
    setNotifications(false);
    if (previousPath.current !== location.pathname) {
      document.getElementById('main-content')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
    previousPath.current = location.pathname;
  }, [location.pathname]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
  const logout = useMutation({
    mutationFn: () =>
      api('/auth/logout', z.undefined(), { method: 'POST', csrfToken: session.data?.csrfToken }),
    onSuccess: () => {
      client.clear();
      client.setQueryData(sessionKey, null);
      void navigate('/login', { replace: true });
    },
  });
  if (!preview && session.isPending) return <Loading label="در حال باز کردن فضای کاری…" />;
  if (!preview && session.error)
    return (
      <main className="center-page">
        <ErrorNotice
          error={session.error}
          retry={() => {
            void session.refetch();
          }}
        />
      </main>
    );
  if (!preview && !session.data) return <Navigate to="/login" replace />;
  const user = preview ? { id: 'public-demo', name: 'دوست من', email: '' } : session.data!.user;
  const current = [...navigation, ...utilityNavigation]
    .filter((item) =>
      item.path ? location.pathname.startsWith(`${base}${item.path}`) : location.pathname === base,
    )
    .at(-1);
  const renderNav = () => (
    <>
      <div className="shell-brand">
        <Brand />
      </div>
      <button
        className="workspace-switch"
        onClick={() => setModeOpen(true)}
        aria-label="انتخاب فضای کار"
      >
        <span className="workspace-mark">L</span>
        <div>
          <b>{preview ? 'فضای نمایشی لیاراپایلوت' : 'فضای کاری من'}</b>
          <small>{mode === 'DEMO' ? 'آشنایی با تجربه محصول' : 'حساب شخصی'}</small>
        </div>
        <ChevronDown size={14} />
      </button>
      {mode === 'DEMO' && (
        <label className="mobile-project-filter">
          پروژه فعال
          <select
            className="plain-select"
            aria-label="انتخاب پروژه در منو"
            value={preferences.selectedProject}
            onChange={(event) => preferences.setProject(event.target.value)}
          >
            <option value="all">همه پروژه‌ها</option>
            {demoProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <span className="nav-section-label">فضای کار</span>
      <nav className="primary-navigation" aria-label="ناوبری اصلی">
        {navigation
          .filter((item) => !preview || item.path !== '/applications')
          .map(({ path, title, Icon }) => (
            <NavLink
              key={path}
              to={`${base}${path}`}
              end={!path}
              className={({ isActive }) => `navigation-item ${isActive ? 'active' : ''}`}
            >
              {Icon ? <Icon size={18} /> : <Mascot size={23} />}
              <span>{title}</span>
              {path === '/assistant' && <span className="ai-nav-tag">AI</span>}
              {path === '/incidents' && mode === 'DEMO' && <span className="nav-count">۱</span>}
            </NavLink>
          ))}
      </nav>
      <div className="nav-bottom">
        <nav aria-label="تنظیمات فضای کار">
          {utilityNavigation.map(({ path, title, Icon }) => (
            <NavLink
              key={path}
              to={`${base}${path}`}
              className={({ isActive }) => `navigation-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{title}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-pilot">
          <Mascot size={55} />
          <div>
            <b>پایلوت، همراه شماست</b>
            <p>قدم بعدی را با هم پیدا کنیم.</p>
          </div>
          <Link to={`${base}/assistant`} aria-label="گفتگو با پایلوت">
            <ArrowLeft size={16} />
          </Link>
        </div>
        <div className="shell-account">
          <span className="account-avatar">{preview ? 'د' : user.name.slice(0, 1)}</span>
          <div>
            <b>{preview ? 'مهمان محیط دمو' : user.name}</b>
            <small>{preview ? 'بدون اتصال به سرویس واقعی' : 'حساب شخصی'}</small>
          </div>
          {preview ? (
            <Link to="/login" className="icon-button" aria-label="ورود به حساب">
              <ArrowLeft size={16} />
            </Link>
          ) : (
            <button
              className="icon-button"
              aria-label="خروج از حساب"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              <LogOut size={17} />
            </button>
          )}
        </div>
      </div>
    </>
  );
  const searchItems = [...navigation, ...utilityNavigation]
    .filter((item) => !preview || item.path !== '/applications')
    .map((item) => ({ label: item.title, hint: 'صفحه', to: `${base}${item.path}` }))
    .concat(
      mode === 'DEMO'
        ? demoProjects.map((project) => ({
            label: project.title,
            hint: project.name,
            to: `${base}/projects/${project.id}`,
          }))
        : [],
    )
    .filter(
      (item) =>
        !search || `${item.label} ${item.hint}`.toLowerCase().includes(search.toLowerCase()),
    );
  return (
    <WorkspaceContext.Provider value={{ base, preview, mode, user }}>
      <div className={`app-shell ${focusedAssistant ? 'assistant-focus-shell' : ''}`}>
        <aside className="app-sidebar">{renderNav()}</aside>
        <Dialog.Root open={mobile} onOpenChange={setMobile}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content
              className="mobile-navigation"
              onOpenAutoFocus={() => {
                menuOpenedPath.current = location.pathname;
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (menuOpenedPath.current === location.pathname) menuTrigger.current?.focus();
                else document.getElementById('main-content')?.focus({ preventScroll: true });
              }}
            >
              <Dialog.Title className="sr-only">منوی اصلی</Dialog.Title>
              <Dialog.Description className="sr-only">انتخاب بخش‌های فضای کاری</Dialog.Description>
              <Dialog.Close className="icon-button mobile-close" aria-label="بستن منو">
                <X size={20} />
              </Dialog.Close>
              {renderNav()}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <div className="app-main">
          <header className="app-topbar">
            <div className="topbar-start">
              <button
                ref={menuTrigger}
                className="icon-button menu-toggle"
                aria-label="باز کردن منو"
                onClick={() => setMobile(true)}
              >
                <Menu size={20} />
              </button>
              <span className="topbar-breadcrumb">
                فضای کار <span>/</span>{' '}
                <b>
                  {current?.title ??
                    (location.pathname.endsWith('/foundation') ? 'زیرساخت محلی' : 'جزئیات')}
                </b>
              </span>
              {mode === 'DEMO' && (
                <select
                  className="topbar-project-select"
                  aria-label="انتخاب پروژه سراسری"
                  value={preferences.selectedProject}
                  onChange={(event) => preferences.setProject(event.target.value)}
                >
                  <option value="all">همه پروژه‌ها</option>
                  {demoProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="topbar-actions">
              <button
                className="search-trigger"
                onClick={() => setSearchOpen(true)}
                aria-label="جستجو در فضای کار"
              >
                <Search size={16} />
                <span>جستجو در فضای کار…</span>
                <kbd>
                  <Command size={10} /> K
                </kbd>
              </button>
              <ThemeControl />
              <Link
                className="icon-button topbar-mobile-theme"
                to={`${base}/settings`}
                aria-label="تنظیم ظاهر و تم"
              >
                <Moon size={18} />
              </Link>
              <button
                className="icon-button notification-button"
                aria-label="اعلان‌ها"
                onClick={() => setNotifications(true)}
              >
                <Bell size={19} />
                {mode === 'DEMO' && <i />}
              </button>
              <span className="topbar-divider" />
              <span className="account-avatar small-avatar">
                {preview ? 'د' : user.name.slice(0, 1)}
              </span>
            </div>
          </header>
          <div className={`mode-strip ${mode === 'DEMO' ? 'is-demo' : ''}`}>
            <span>
              <i />
              {mode === 'DEMO'
                ? 'حالت نمایشی'
                : mode === 'LIVE'
                  ? 'اطلاعات واقعی لیارا'
                  : 'فضای شخصی'}
              <span className="mode-description">
                {mode === 'DEMO'
                  ? 'داده‌ها نمونه‌اند؛ هیچ عملیاتی روی زیرساخت واقعی انجام نمی‌شود.'
                  : mode === 'LIVE'
                    ? 'فقط خواندن از اتصال فعال؛ داده نمونه نمایش داده نمی‌شود.'
                    : 'پروژه‌های محلی؛ اتصال ابری از بخش اتصال‌ها مدیریت می‌شود.'}
              </span>
            </span>
            <button onClick={() => setModeOpen(true)}>
              {preview ? 'درباره این محیط' : 'تغییر محیط'}
              <ChevronDown size={12} />
            </button>
          </div>
          <main id="main-content" tabIndex={-1} className="app-content">
            <ErrorNotice error={logout.error} />
            <Outlet />
          </main>
          <footer className="app-footer">
            <span>
              <ShieldCheck size={13} /> شفاف در هر قدم، با کنترل شما
            </span>
            <span>
              ساخته‌شده برای کلاد{' '}
              <img src="/brand/liara-logo.svg" alt="لیارا" width="51" height="23" />
            </span>
          </footer>
        </div>
      </div>
      <Modal
        open={modeOpen}
        onOpenChange={setModeOpen}
        title="فضای کاری خود را انتخاب کنید"
        description="داده‌های نمایشی و اطلاعات حساب شخصی کاملاً از هم جدا هستند."
      >
        <div className="mode-options">
          <button
            className={mode === 'DEMO' ? 'selected' : ''}
            onClick={() => {
              if (!preview) preferences.setMode('DEMO');
              setModeOpen(false);
              void navigate(`${base}`);
            }}
          >
            <Mascot size={50} />
            <div>
              <b>محیط دمو</b>
              <p>پروژه‌ها، پایش و رخدادهای نمونه؛ بدون نیاز به اتصال ابری</p>
            </div>
            <span className="sample-label">نمایشی</span>
          </button>
          <button
            className={mode === 'LOCAL' ? 'selected' : ''}
            onClick={() => {
              if (preview) {
                void navigate('/login');
              } else {
                preferences.setMode('LOCAL');
                void navigate(base);
              }
              setModeOpen(false);
            }}
          >
            <ShieldCheck size={26} />
            <div>
              <b>{preview ? 'ورود به حساب شخصی' : 'حساب شخصی'}</b>
              <p>پروژه‌های ذخیره‌شده و بررسی واقعی زیرساخت محلی</p>
            </div>
            <ArrowLeft size={17} />
          </button>
          <button
            className={mode === 'LIVE' ? 'selected' : ''}
            onClick={() => {
              if (preview) void navigate('/login');
              else {
                preferences.setMode('LIVE');
                void navigate(`${base}/applications`);
              }
              setModeOpen(false);
            }}
          >
            <Plug size={25} />
            <div>
              <b>سرویس‌های واقعی لیارا</b>
              <p>خواندن اطلاعات از اتصال امن؛ نیازمند حساب متصل</p>
            </div>
            <ArrowLeft size={17} />
          </button>
        </div>
      </Modal>
      <Modal
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="کجا می‌خواهید بروید؟"
        description="نام صفحه یا پروژه نمونه را جستجو کنید."
      >
        <div className="command-search">
          <Search size={18} />
          <input
            autoFocus
            aria-label="عبارت جستجو"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="مثلاً پروژه‌ها یا اطلس…"
          />
        </div>
        <div className="command-results">
          {searchItems.length ? (
            searchItems.map((item) => (
              <Link key={item.to} to={item.to}>
                <span>{item.label}</span>
                <small>{item.hint}</small>
                <ArrowLeft size={15} />
              </Link>
            ))
          ) : (
            <p className="search-empty">نتیجه‌ای پیدا نشد. عبارت دیگری امتحان کنید.</p>
          )}
        </div>
      </Modal>
      <Modal
        open={notifications}
        onOpenChange={setNotifications}
        title="اعلان‌ها"
        description={
          mode === 'DEMO'
            ? 'اعلان‌های ثابت سناریوی دمو؛ داده زنده نیستند.'
            : 'اعلان‌های حساب شخصی شما'
        }
      >
        {mode === 'DEMO' ? (
          <Link className="notification-card" to={`${base}/incidents/demo-incident-01`}>
            <span className="notice-icon">
              <AlertTriangle size={20} />
            </span>
            <div>
              <b>اطلس به بررسی نیاز دارد</b>
              <p>خطای اتصال دیتابیس در شواهد نمونه دیده شده است.</p>
              <small>مشاهده رخداد و شواهد</small>
            </div>
            <ArrowLeft size={16} />
          </Link>
        ) : (
          <div className="search-empty">اعلان جدیدی ندارید.</div>
        )}
      </Modal>
    </WorkspaceContext.Provider>
  );
}
