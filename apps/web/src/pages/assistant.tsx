import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  ArrowLeft,
  CircleHelp,
  GitBranch,
  Plus,
  Send,
  ShieldCheck,
  Square,
  TriangleAlert,
} from 'lucide-react';
import { replyToDemo, type DemoReply } from '../demo/assistant';
import { demoProjects } from '../demo/data';
import { useWorkspace, useWorkspaceUi } from '../lib/workspace';
import { Mascot } from '../components/mascot';
import { Button } from '../components/ui/button';
import { DemoLabel, DemoRequired, Modal, StatusBadge } from '../components/primitives';
import { ChatMarkdown } from '../components/chat-markdown';
import { LiveAssistantPage } from './live-assistant';
export function AssistantPage() {
  const { mode, preview } = useWorkspace();
  return !preview && mode !== 'DEMO' ? <LiveAssistantPage /> : <DemoAssistantPage />;
}
type Message = { id: number; role: 'user' | 'assistant'; text: string; reply?: DemoReply };
const suggestions = [
  { icon: GitBranch, title: 'مسیر انتشار را نشان بده', text: 'می‌خواهم پروژه‌ام را دیپلوی کنم' },
  { icon: ShieldCheck, title: 'وضعیت سرویس‌ها چطور است؟', text: 'سلامت سرویس‌ها را بررسی کن' },
  { icon: TriangleAlert, title: 'خطای اطلس را بررسی کنیم', text: 'خطای ۵۰۰ اطلس را بررسی کن' },
];
function DemoAssistantPage() {
  const { base, mode } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedProject } = useWorkspaceUi();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const initialPrompt = useRef(false);
  const project = demoProjects.find((item) => item.id === selectedProject) ?? demoProjects[1]!;
  const send = (input: string) => {
    const text = input.trim().slice(0, 1500);
    if (!text || busy || mode !== 'DEMO') return;
    setDraft('');
    setMessages((previous) => [...previous.slice(-28), { id: Date.now(), role: 'user', text }]);
    setBusy(true);
    pending.current = setTimeout(() => {
      const reply = replyToDemo(text);
      setMessages((previous) => [
        ...previous,
        { id: Date.now() + 1, role: 'assistant', text: reply.text, reply },
      ]);
      setBusy(false);
      pending.current = null;
    }, 650);
  };
  useEffect(() => {
    const state: unknown = location.state;
    if (
      initialPrompt.current ||
      mode !== 'DEMO' ||
      !state ||
      typeof state !== 'object' ||
      !('prompt' in state) ||
      typeof state.prompt !== 'string'
    )
      return;
    const prompt = state.prompt;
    // Defer the kickoff so React StrictMode can cancel its rehearsal before any message is sent.
    const kickoff = setTimeout(() => {
      initialPrompt.current = true;
      send(prompt);
      void navigate(location.pathname, { replace: true, state: null });
    }, 0);
    return () => clearTimeout(kickoff);
  }, [mode, location.state]);
  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );
  useEffect(() => {
    end.current?.scrollIntoView({
      block: 'nearest',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }, [messages.length, busy]);
  if (mode !== 'DEMO') return <DemoRequired title="با پایلوت در محیط دمو آشنا شوید." />;
  const stop = () => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
    setBusy(false);
  };
  return (
    <div className="assistant-layout">
      <section className="assistant-workspace">
        <header className="assistant-header">
          <Mascot size={43} />
          <div>
            <h1>دستیار هوشمند</h1>
            <p>
              <span className="mint-dot" />
              پایلوت · پیش‌نمایش تعاملی
            </p>
          </div>
          <Button
            variant="ghost"
            size="small"
            onClick={() => (messages.length ? setResetOpen(true) : setDraft(''))}
          >
            <Plus size={16} />
            گفتگوی تازه
          </Button>
        </header>
        <div className="assistant-demo-notice">
          <DemoLabel />
          پاسخ‌ها از سناریوی ثابت می‌آیند؛ هنوز مدل هوش مصنوعی متصل نیست.
        </div>
        <div
          className={`assistant-messages ${!messages.length ? 'is-empty' : ''}`}
          aria-label="گفتگوی نمایشی"
          role="log"
          aria-live="polite"
          aria-busy={busy}
        >
          {!messages.length ? (
            <div className="assistant-greeting">
              <div className="greeting-pet">
                <Mascot size={154} full animate />
              </div>
              <span className="page-eyebrow">از کد تا کلاد، با یک گفتگو</span>
              <h2>سلام! من پایلوت‌ام.</h2>
              <p>
                درباره انتشار، سلامت سرویس یا علت خطا بپرسید.
                <br />
                قدم بعدی را روشن و قابل بررسی می‌کنیم.
              </p>
              <div className="assistant-suggestions">
                {suggestions.map((item) => (
                  <button key={item.title} onClick={() => send(item.text)}>
                    <item.icon size={18} />
                    <span>{item.title}</span>
                    <ArrowLeft size={15} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="chat-thread">
              {messages.map((message) => (
                <article key={message.id} className={`chat-message message-${message.role}`}>
                  {message.role === 'assistant' ? (
                    <Mascot size={37} />
                  ) : (
                    <span className="message-user-avatar">شما</span>
                  )}
                  <div className="message-content">
                    <div className="message-role">
                      {message.role === 'assistant' ? (
                        <>
                          پایلوت
                          <DemoLabel compact />
                        </>
                      ) : (
                        'شما'
                      )}
                    </div>
                    {message.role === 'assistant' ? (
                      <ChatMarkdown content={message.text} />
                    ) : (
                      <p>{message.text}</p>
                    )}
                    {message.reply?.evidence && (
                      <div className="message-evidence">
                        <span>شواهد سناریو</span>
                        {message.reply.evidence.map((id) => (
                          <code key={id}>{id}</code>
                        ))}
                      </div>
                    )}
                    {message.reply?.action && (
                      <Link className="message-action" to={`${base}${message.reply.action.path}`}>
                        {message.reply.action.label}
                        <ArrowLeft size={15} />
                      </Link>
                    )}
                  </div>
                </article>
              ))}
              {busy && (
                <div className="chat-message message-assistant">
                  <Mascot size={37} />
                  <div className="scenario-loading" role="status">
                    <span className="typing-dots">
                      <i />
                      <i />
                      <i />
                    </span>
                    آماده‌سازی پاسخ نمایشی…
                  </div>
                </div>
              )}
              <div ref={end} />
            </div>
          )}
        </div>
        <div className="assistant-composer">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
            }}
          >
            <label htmlFor="assistant-input" className="sr-only">
              پیام به پایلوت
            </label>
            <textarea
              id="assistant-input"
              value={draft}
              maxLength={1500}
              rows={2}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send(draft);
                }
              }}
              placeholder="پایلوت، می‌خوام پروژه‌ام رو راه‌اندازی کنم…"
            />
            <div className="composer-tools">
              <span>
                <ShieldCheck size={13} />
                کلید و رمز را در گفتگو وارد نکنید.
              </span>
              {busy ? (
                <button
                  className="composer-send"
                  type="button"
                  aria-label="توقف پاسخ نمایشی"
                  onClick={stop}
                >
                  <Square size={15} />
                </button>
              ) : (
                <button
                  className="composer-send"
                  type="submit"
                  disabled={!draft.trim()}
                  aria-label="ارسال پیام"
                >
                  <Send size={18} />
                </button>
              )}
            </div>
          </form>
          <p>
            <CircleHelp size={11} />
            این گفتگو در همین صفحه نگه داشته می‌شود؛ گفتگوی ماندگار در فضای حساب شخصی در دسترس است.
          </p>
        </div>
      </section>
      <aside className="assistant-context">
        <span className="page-eyebrow">زمینه گفتگو</span>
        <h2>همه‌چیز، با شواهد.</h2>
        <p>این پنل کمک می‌کند پاسخ را کنار وضعیت نمونه سرویس ببینید.</p>
        <div className="context-project">
          <div>
            <b>
              <bdi>{project.name}</bdi>
            </b>
            <DemoLabel compact />
          </div>
          <p>{project.title}</p>
          <StatusBadge status={project.status} />
          <Link to={`${base}/projects/${project.id}`}>
            جزئیات پروژه
            <ArrowLeft size={14} />
          </Link>
        </div>
        <div className="context-principles">
          <h3>قول پایلوت به شما</h3>
          <span>
            <ShieldCheck size={16} />
            عملیات حساس، فقط با تأیید شما
          </span>
          <span>
            <GitBranch size={16} />
            هر نتیجه، همراه با منبع
          </span>
          <span>
            <CircleHelp size={16} />
            ابهام، روشن و بدون حدس قطعی
          </span>
        </div>
        <div className="context-bottom">
          <Mascot size={62} />
          <p>
            یک هم‌تیمی آرام،
            <br />
            برای تصمیم‌های بهتر.
          </p>
        </div>
      </aside>
      <Modal
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="گفتگوی تازه شروع شود؟"
        description="پیام‌های همین پیش‌نمایش از صفحه پاک می‌شوند؛ گفتگو ذخیره دائمی ندارد."
      >
        <div className="modal-body dialog-actions">
          <Button variant="secondary" onClick={() => setResetOpen(false)}>
            ادامه همین گفتگو
          </Button>
          <Button
            onClick={() => {
              stop();
              setMessages([]);
              setDraft('');
              setResetOpen(false);
            }}
          >
            شروع گفتگوی تازه
          </Button>
        </div>
      </Modal>
    </div>
  );
}
