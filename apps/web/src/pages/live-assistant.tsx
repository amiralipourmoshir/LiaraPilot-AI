import { ReliabilityPanel } from '../components/reliability-panel';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Plus,
  ShieldCheck,
  Clock3,
  Check,
  AlertTriangle,
  ChevronDown,
  MessageSquare,
  Search,
  ArrowUp,
  ArrowLeft,
  Layers3,
  Sparkles,
  PanelRightClose,
  PanelRightOpen,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import {
  assistantConfigSchema,
  conversationsSchema,
  conversationDetailSchema,
  type ConversationDetail,
} from '../../../../packages/shared/src/assistant';
import { cloudApplicationsSchema } from '../../../../packages/shared/src/cloud';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { formatDate, useWorkspace } from '../lib/workspace';
import { Mascot } from '../components/mascot';
import { Button } from '../components/ui/button';
import { Modal } from '../components/primitives';
import { ErrorNotice, Loading } from '../components/common';
import { ChatMarkdown } from '../components/chat-markdown';
import { DeploymentWizard } from '../components/deployment-wizard';
import { AgentForm } from '../components/agent-form';
import { AgentDeploymentRun } from '../components/agent-deployment-run';
import { ModelPicker } from '../components/model-picker';
type Plan = ConversationDetail['plans'][number];
const stateLabels: Record<Plan['state'], string> = {
  PENDING: 'منتظر تأیید شما',
  RUNNING: 'در حال جمع‌آوری شواهد',
  SUCCEEDED: 'بررسی ثبت شد',
  CANCELLED: 'لغوشده',
  EXPIRED: 'مهلت تمام شده',
  NEEDS_ATTENTION: 'نیازمند بررسی',
};
export function LiveAssistantPage() {
  const { user, base } = useWorkspace();
  const session = useSession();
  const client = useQueryClient();
  const [search, setSearch] = useSearchParams();
  const selected = search.get('conversation');
  const [activeQuestion, setActiveQuestion] = useState<
    ConversationDetail['messages'][number] | null
  >(null);
  const [patchFlow, setPatchFlow] = useState<{ applicationId: string; runId: string } | null>(null);
  const [deploymentFlow, setDeploymentFlow] = useState<{ url?: string; id?: string } | null>(null);
  const openedActions = useRef(new Set<string>());
  const [draft, setDraft] = useState('');
  const [modelChoice, setModelChoice] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(0);
  const [historyPageSize, setHistoryPageSize] = useState(3);
  const historyViewport = useRef<HTMLElement>(null);
  const [railOpen, setRailOpen] = useState(() => matchMedia('(min-width: 761px)').matches);
  const [contextOpen, setContextOpen] = useState(false);
  const [applicationId, setApplicationId] = useState(search.get('application') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [review, setReview] = useState<Plan | null>(null);
  const [consent, setConsent] = useState(false);
  const messageViewport = useRef<HTMLDivElement>(null);
  const config = useQuery({
    queryKey: ['assistant-config', user.id],
    queryFn: () => api('/assistant/config', assistantConfigSchema),
    retry: false,
  });
  const list = useQuery({
    queryKey: ['conversations', user.id],
    queryFn: () => api('/conversations', conversationsSchema),
    retry: false,
  });
  const apps = useQuery({
    queryKey: ['cloud-applications', user.id],
    queryFn: () => api('/applications', cloudApplicationsSchema),
    retry: false,
  });
  const detailKey = ['conversation', user.id, selected];
  const detail = useQuery({
    queryKey: detailKey,
    enabled: !!selected,
    queryFn: () => api(`/conversations/${selected}`, conversationDetailSchema),
    retry: false,
    refetchInterval: (q) => (q.state.data?.busy ? 2500 : false),
  });
  useEffect(() => {
    const message = [...(detail.data?.messages ?? [])].reverse().find((m) => m.actionPath);
    if (!message || openedActions.current.has(message.id)) return;
    openedActions.current.add(message.id);
    const path = message.actionPath!;
    if (path.startsWith('/monitoring?')) {
      const p = new URLSearchParams(path.split('?')[1]);
      setPatchFlow({ applicationId: p.get('applicationId')!, runId: p.get('run')! });
    } else if (path.startsWith('/deployments?'))
      setDeploymentFlow({ url: new URLSearchParams(path.split('?')[1]).get('repository') ?? '' });
    else if (/^\/deployments\/[a-f0-9-]{36}$/.test(path))
      setDeploymentFlow({ id: path.split('/')[2] });
  }, [detail.data?.messages]);
  useEffect(() => {
    const message = [...(detail.data?.messages ?? [])]
      .reverse()
      .find((m) => m.interaction && !m.interaction.answered);
    if (message && !openedActions.current.has(message.id)) {
      openedActions.current.add(message.id);
      setActiveQuestion(message);
    }
  }, [detail.data?.messages]);
  useEffect(() => {
    if (search.get('github') === 'connected') {
      setDeploymentFlow({ url: sessionStorage.getItem('pilot-repository-url') ?? '' });
      const next = new URLSearchParams(search);
      next.delete('github');
      setSearch(next, { replace: true });
    }
  }, [search]);
  const activeModel = modelChoice || detail.data?.model || config.data?.model || '';
  const newConversation = () => {
    setSearch({});
    setDraft('');
    setError(null);
  };
  const locked = busy || !!detail.data?.busy;
  useEffect(() => {
    const viewport = messageViewport.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [detail.data?.messages.length, locked]);
  const historyRows = (list.data?.conversations ?? []).filter((c) =>
    c.title.includes(historySearch.trim()),
  );
  const historyPages = Math.max(1, Math.ceil(historyRows.length / historyPageSize));
  const currentHistoryPage = Math.min(historyPage, historyPages - 1);
  useEffect(() => {
    const viewport = historyViewport.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHistoryPageSize(Math.max(1, Math.floor(entry.contentRect.height / 76)));
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [railOpen]);
  const save = (data: ConversationDetail) => {
    client.setQueryData(['conversation', user.id, data.id], data);
    void client.invalidateQueries({ queryKey: ['conversations', user.id] });
  };
  async function run(action: () => Promise<void>) {
    if (locked) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e : new Error('درخواست کامل نشد.'));
      if (selected) await client.invalidateQueries({ queryKey: detailKey });
    } finally {
      setBusy(false);
    }
  }
  async function send(text: string) {
    if (!text.trim()) return;
    if (/دیپلوی|دپلوی|منتشر|انتشار|deploy/i.test(text)) {
      const repo = /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/.exec(text)?.[0];
      setDeploymentFlow({ url: repo ?? '' });
    }
    if (!config.data?.configured) return;
    await run(async () => {
      let id = selected;
      if (!id) {
        const created = await api('/conversations', conversationDetailSchema, {
          method: 'POST',
          body: {},
          csrfToken: session.data?.csrfToken,
        });
        id = created.id;
        save(created);
        setSearch({ conversation: id });
      }
      const result = await api(`/conversations/${id}/messages`, conversationDetailSchema, {
        method: 'POST',
        body: {
          content: text,
          ...(applicationId ? { applicationId } : {}),
          ...(activeModel ? { model: activeModel } : {}),
        },
        csrfToken: session.data?.csrfToken,
        idempotencyKey: crypto.randomUUID(),
      }).catch(async (error) => {
        await client.invalidateQueries({ queryKey: ['conversation', user.id, id] });
        throw error;
      });
      save(result);
      setDraft('');
    });
  }
  async function decision(plan: Plan, choice: 'approve' | 'cancel') {
    if (!selected) return;
    await run(async () => {
      const data = await api(
        `/conversations/${selected}/plans/${plan.id}/decision`,
        conversationDetailSchema,
        {
          method: 'POST',
          body: { hash: plan.hash, decision: choice },
          csrfToken: session.data?.csrfToken,
        },
      );
      save(data);
      setReview(null);
      setConsent(false);
    });
  }
  return (
    <div
      className={`assistant-layout live-assistant-layout pilot-chat ${railOpen ? 'rail-open' : 'rail-closed'}`}
    >
      <section className="assistant-workspace">
        <header className="assistant-header">
          <button
            className="chat-rail-toggle"
            aria-label="نمایش یا پنهان کردن گفتگوها"
            onClick={() => setRailOpen(!railOpen)}
          >
            {railOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
          </button>
          <Mascot size={35} />
          <div>
            <h1>دستیار هوشمند</h1>
            <p>
              <span className="mint-dot" />
              فکر، بررسی و اجرا؛ در کنار هم
            </p>
          </div>
          <span className="chat-header-badge">AI</span>
          <Button variant="ghost" size="small" onClick={() => setContextOpen(!contextOpen)}>
            <Layers3 size={15} />
            {contextOpen ? 'بستن شواهد' : 'زمینه و شواهد'}
          </Button>
        </header>
        <div className="assistant-live-notice">
          <ShieldCheck size={17} />
          <span>خواندن با شواهد، اجرا با تأیید شما</span>
          <span className="live-label">فضای واقعی</span>
        </div>
        {detail.data?.plans[0]?.state === 'PENDING' && (
          <div className="live-plan-prompt">
            <span>یک طرح بررسی منتظر تصمیم شماست.</span>
            <Button
              size="small"
              disabled={locked}
              onClick={() => {
                setReview(detail.data!.plans[0]!);
                setConsent(false);
              }}
            >
              بازبینی طرح
            </Button>
          </div>
        )}
        {config.isPending && <Loading />}
        {config.error && <ErrorNotice error={config.error} retry={() => void config.refetch()} />}
        {config.data && !config.data.configured && (
          <div className="assistant-setup">
            <Mascot size={58} />
            <div>
              <h2>پایلوت آماده اتصال به مدل است</h2>
              <p>
                کلید و نام مدل هنوز در سرور تنظیم نشده‌اند. پس از پیکربندی مدیر برنامه، گفتگو از
                همین‌جا فعال می‌شود.
              </p>
              <Link to={`${base}/connections`}>مدیریت اتصال لیارا</Link>
            </div>
          </div>
        )}
        {error && (
          <div role="alert" className="assistant-error">
            <AlertTriangle size={17} />
            {error.message}
            <Button
              variant="ghost"
              size="small"
              onClick={() => {
                setError(null);
                void detail.refetch();
              }}
            >
              تازه‌سازی گفتگو
            </Button>
          </div>
        )}
        {detail.error && <ErrorNotice error={detail.error} retry={() => void detail.refetch()} />}
        {detail.isFetching && !detail.data && selected && <Loading />}
        <div
          className={`assistant-messages ${!detail.data?.messages.length ? 'is-empty' : ''}`}
          ref={messageViewport}
          role="log"
          aria-label="گفتگوی شخصی"
          aria-live="polite"
          aria-busy={locked}
        >
          {!detail.data?.messages.length ? (
            <div className="assistant-greeting">
              <div className="greeting-pet">
                <Mascot size={98} animate />
              </div>
              <span className="page-eyebrow">فضای گفتگوی شما با پایلوت</span>
              <h2>از ایده تا اجرا، کنار شماییم.</h2>
              <p>
                سلام {user.name}! امروز چه چیزی را با هم پیش ببریم؟
                <br />
                از شناخت سرویس تا بررسی خطا؛ هر قدم، روشن و قابل پیگیری.
              </p>
              <div className="assistant-suggestions chat-starter-grid">
                {[
                  {
                    Icon: Layers3,
                    title: 'سرویس‌ها را بشناسیم',
                    text: 'سرویس‌های من را نشان بده',
                    caption: 'یک تصویر روشن از فضای ابری',
                  },
                  {
                    Icon: ShieldCheck,
                    title: 'خطا را بررسی کنیم',
                    text: 'برای بررسی این سرویس یک طرح آماده کن',
                    caption: 'قدم‌به‌قدم، همراه با شواهد',
                  },
                  {
                    Icon: Sparkles,
                    title: 'مسیر انتشار را بچینیم',
                    text: 'برای انتشار پروژه‌ام از کجا شروع کنم؟',
                    caption: 'از ایده تا یک برنامه عملی',
                  },
                ].map(({ Icon, title, text, caption }) => (
                  <button
                    key={title}
                    disabled={locked || !config.data?.configured}
                    onClick={() => void send(text)}
                  >
                    <Icon size={23} />
                    <b>{title}</b>
                    <span>{caption}</span>
                    <ArrowLeft size={16} />
                  </button>
                ))}
              </div>
              <span className="chat-greeting-hint">
                یک سؤال بپرسید؛ قدم بعدی را با هم پیدا می‌کنیم.
              </span>
            </div>
          ) : (
            <div className="chat-thread">
              {detail.data.messages.map((message) => (
                <article
                  key={message.id}
                  className={`chat-message message-${message.role.toLowerCase()}`}
                >
                  {message.role === 'ASSISTANT' ? (
                    <Mascot size={37} />
                  ) : (
                    <span className="message-user-avatar">شما</span>
                  )}
                  <div className="message-content">
                    <div className="message-role">
                      {message.role === 'ASSISTANT' ? 'پایلوت' : 'شما'}
                      <time dateTime={message.createdAt}>{formatDate(message.createdAt)}</time>
                    </div>
                    {message.role === 'ASSISTANT' ? (
                      <ChatMarkdown content={message.content} />
                    ) : (
                      <p>{message.content}</p>
                    )}
                    {message.interaction && !message.interaction.answered && (
                      <button className="message-action" onClick={() => setActiveQuestion(message)}>
                        پاسخ به سؤال پایلوت <ArrowLeft size={15} />
                      </button>
                    )}
                    {message.interaction?.answered && (
                      <span className="wizard-connected">
                        <Check size={13} />
                        پاسخ شما ثبت شد
                      </span>
                    )}
                    {message.actionPath && (
                      <button
                        className="message-action"
                        onClick={() =>
                          message.actionPath!.startsWith('/monitoring?')
                            ? setPatchFlow({
                                applicationId: new URLSearchParams(
                                  message.actionPath!.split('?')[1],
                                ).get('applicationId')!,
                                runId: new URLSearchParams(message.actionPath!.split('?')[1]).get(
                                  'run',
                                )!,
                              })
                            : setDeploymentFlow(
                                message.actionPath!.startsWith('/deployments?')
                                  ? {
                                      url:
                                        new URLSearchParams(message.actionPath!.split('?')[1]).get(
                                          'repository',
                                        ) ?? '',
                                    }
                                  : { id: message.actionPath!.split('/')[2] },
                              )
                        }
                      >
                        ادامه عملیات در گفتگو
                        <ArrowLeft size={15} />
                      </button>
                    )}
                    {message.diagnosis && (
                      <div className="diagnosis-grid">
                        {[
                          { title: 'مشاهدات مستند', items: message.diagnosis.facts },
                          {
                            title: 'فرضیه‌ها · نیازمند بررسی',
                            items: message.diagnosis.hypotheses,
                          },
                        ].map((group) => (
                          <section key={group.title}>
                            <h3>{group.title}</h3>
                            {!group.items.length && <p>موردی ثبت نشده است.</p>}
                            {group.items.map((item, i) => (
                              <div key={i}>
                                <ChatMarkdown content={item.text} />
                                <div className="evidence-chips">
                                  {item.evidenceIds.map((id) => (
                                    <a href={`#evidence-${id}`} key={id}>
                                      شاهد {id.slice(0, 6)}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </section>
                        ))}
                        <section>
                          <h3>شواهد ناکافی</h3>
                          {message.diagnosis.missingEvidence.map((text, i) => (
                            <ChatMarkdown key={i} content={text} />
                          ))}
                        </section>
                        <section>
                          <h3>پیشنهادهای بعدی</h3>
                          {message.diagnosis.recommendations.map((text, i) => (
                            <ChatMarkdown key={i} content={text} />
                          ))}
                        </section>
                        <p className="diagnosis-disclaimer">
                          این تحلیل مدل است؛ تطبیق معنای ادعاها با شواهد به بررسی شما نیاز دارد.
                        </p>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          {locked && (
            <div className="assistant-working" role="status">
              <Mascot size={32} />
              <span className="typing-dots">
                <i />
                <i />
                <i />
              </span>
              در حال پردازش؛ می‌توانید پس از بازگشت نتیجه را ببینید.
            </div>
          )}
        </div>
        <div className="assistant-composer">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <label className="sr-only" htmlFor="live-assistant-input">
              پیام به پایلوت
            </label>
            <textarea
              id="live-assistant-input"
              rows={2}
              maxLength={4000}
              value={draft}
              disabled={locked || !config.data?.configured}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              placeholder="چه کاری را با هم انجام بدهیم؟"
            />
            <div className="composer-tools">
              <div className="chat-composer-options">
                <ModelPicker
                  value={activeModel}
                  disabled={locked}
                  onChange={setModelChoice}
                  models={
                    config.data?.models.length
                      ? config.data.models
                      : activeModel
                        ? [{ id: activeModel, label: activeModel }]
                        : []
                  }
                />
                <button
                  type="button"
                  className="chat-context-button"
                  onClick={() => setContextOpen(!contextOpen)}
                >
                  <Layers3 size={16} />
                  زمینه سرویس
                </button>
              </div>
              <span>
                <ShieldCheck size={13} />
                کلید و رمز را در گفتگو وارد نکنید.
              </span>
              <button
                type="submit"
                className="composer-send"
                aria-label="ارسال پیام"
                disabled={locked || !draft.trim() || !config.data?.configured}
              >
                <ArrowUp size={22} />
              </button>
            </div>
          </form>
          <p>پیام‌ها در حساب شما ذخیره و برای پاسخ‌گویی به مدل پیکربندی‌شده ارسال می‌شوند.</p>
        </div>
      </section>
      <aside className="chat-history-rail" aria-label="تاریخچه گفتگوها">
        <div className="chat-rail-brand">
          <Mascot size={48} />
          <div>
            <b>لیاراپایلوت</b>
            <span>هم‌تیمی هوشمند شما</span>
          </div>
        </div>
        <Button variant="secondary" disabled={locked} onClick={newConversation}>
          <Plus size={19} />
          گفتگوی جدید
        </Button>
        <label className="chat-history-search">
          <Search size={18} />
          <input
            aria-label="جستجو در گفتگوها"
            placeholder="جستجو در گفتگوها…"
            value={historySearch}
            onChange={(e) => {
              setHistorySearch(e.target.value);
              setHistoryPage(0);
            }}
          />
        </label>
        <span className="chat-history-caption">گفتگوهای شما</span>
        <nav className="chat-history-list" ref={historyViewport}>
          {list.isPending && <Loading />}
          {list.error && <ErrorNotice error={list.error} retry={() => void list.refetch()} />}
          {historyRows
            .slice(currentHistoryPage * historyPageSize, (currentHistoryPage + 1) * historyPageSize)
            .map((c) => (
              <button
                key={c.id}
                disabled={locked}
                aria-current={selected === c.id ? 'page' : undefined}
                onClick={() => {
                  setSearch({ conversation: c.id });
                  setError(null);
                  setModelChoice('');
                }}
              >
                <MessageSquare size={15} />
                <span>
                  <b>{c.title}</b>
                  <time>{formatDate(c.updatedAt)}</time>
                </span>
              </button>
            ))}
          {list.data?.conversations.length === 0 && (
            <div className="chat-history-empty">
              <MessageSquare size={24} />
              <p>اینجا، شروع ایده‌های تازه است.</p>
              <span>گفتگوی اولتان را آغاز کنید.</span>
            </div>
          )}
        </nav>
        {historyPages > 1 && (
          <div className="chat-history-pages">
            <button
              type="button"
              aria-label="گفتگوهای قبلی"
              disabled={currentHistoryPage === 0}
              onClick={() => setHistoryPage(currentHistoryPage - 1)}
            >
              <ChevronRight size={16} />
            </button>
            <span>
              {new Intl.NumberFormat('fa-IR').format(currentHistoryPage + 1)} /{' '}
              {new Intl.NumberFormat('fa-IR').format(historyPages)}
            </span>
            <button
              type="button"
              aria-label="گفتگوهای بعدی"
              disabled={currentHistoryPage >= historyPages - 1}
              onClick={() => setHistoryPage(currentHistoryPage + 1)}
            >
              <ChevronLeft size={16} />
            </button>
          </div>
        )}
        <footer>
          <Link to={`${base}/`}>
            <ArrowLeft size={16} />
            بازگشت به فضای کار
          </Link>
          <div className="chat-rail-user">
            <span>{user.name.slice(0, 1)}</span>
            <div>
              <b>{user.name}</b>
              <Link to={`${base}/connections`}>حساب و اتصال‌ها</Link>
            </div>
            <ShieldCheck size={18} />
          </div>
        </footer>
      </aside>
      <aside
        className={`assistant-context live-assistant-context chat-evidence-drawer ${contextOpen ? 'is-open' : ''}`}
      >
        <button className="chat-context-close" onClick={() => setContextOpen(false)}>
          بستن پنل شواهد ×
        </button>
        <span className="page-eyebrow">زمینه و شواهد</span>
        <h2>شفاف، قدم‌به‌قدم.</h2>
        <label className="assistant-target">
          سرویس گفتگو
          <select
            aria-label="سرویس گفتگو"
            value={applicationId}
            disabled={locked}
            onChange={(e) => setApplicationId(e.target.value)}
          >
            <option value="">انتخاب با گفتگو</option>
            {apps.data?.applications
              .filter((a) => !a.providerMissing)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        {apps.error && <ErrorNotice error={apps.error} retry={() => void apps.refetch()} />}
        <p className="assistant-model">
          مدل: <bdi>{config.data?.model ?? 'تنظیم نشده'}</bdi>
        </p>
        {detail.data?.plans.map((plan) => (
          <section key={plan.id} className={`inspection-card plan-${plan.state.toLowerCase()}`}>
            <div className="inspection-heading">
              <ShieldCheck size={18} />
              <b>طرح بررسی سرویس</b>
            </div>
            <span className="inspection-state">{stateLabels[plan.state]}</span>
            <h3>
              <bdi>{plan.snapshot.applicationName}</bdi>
            </h3>
            <p>
              اطلاعات سرویس و ۵ انتشار آخر
              {plan.snapshot.includeLogs ? '، همراه با حداکثر ۳۰ خط لاگ' : '، بدون لاگ'}
            </p>
            <p>
              <Clock3 size={13} />
              از {formatDate(plan.snapshot.since)}
            </p>
            {plan.errorCode && <p role="status">بررسی کامل نشده؛ طرح تازه بخواهید.</p>}
            {plan.state === 'PENDING' && (
              <Button
                size="small"
                disabled={locked}
                onClick={() => {
                  setReview(plan);
                  setConsent(false);
                }}
              >
                بازبینی و تصمیم
              </Button>
            )}
            {plan.evidence.map((e) => (
              <details key={e.id} id={`evidence-${e.id}`} className="evidence-detail">
                <summary>
                  <FileText size={14} />
                  شاهد {e.id.slice(0, 6)}
                  <ChevronDown size={13} />
                </summary>
                <p>منبع: لیارا · {formatDate(e.collectedAt)}</p>
                <pre dir="ltr">{JSON.stringify(e.data, null, 2)}</pre>
              </details>
            ))}
          </section>
        ))}
        <div className="context-principles">
          <h3>اختیار با شماست</h3>
          <span>
            <Check size={16} />
            طرح‌ها یک‌بار مصرف و زمان‌دارند
          </span>
          <span>
            <ShieldCheck size={16} />
            هیچ تغییر ابری در این مرحله فعال نیست
          </span>
        </div>
      </aside>
      <Modal
        open={!!activeQuestion}
        onOpenChange={(open) => {
          if (!open) setActiveQuestion(null);
        }}
        className="agent-question-dialog"
        title={activeQuestion?.interaction?.title ?? 'سؤال پایلوت'}
        description={
          activeQuestion?.interaction?.description ?? 'برای ادامه مسیر به پاسخ شما نیاز داریم.'
        }
      >
        {activeQuestion?.interaction && (
          <>
            <p className="wizard-helper">
              اطلاعات محرمانه، کلید و رمز را در این فرم ننویسید؛ اتصال حساب‌ها فرم امن جداگانه دارد.
            </p>
            <AgentForm
              key={activeQuestion.id}
              fields={activeQuestion.interaction.fields}
              busy={locked}
              onSubmit={async (values) => {
                if (!selected) return;
                await run(async () => {
                  const data = await api(
                    `/conversations/${selected}/messages/${activeQuestion.id}/answer`,
                    conversationDetailSchema,
                    { method: 'POST', body: { values }, csrfToken: session.data?.csrfToken },
                  );
                  save(data);
                  setActiveQuestion(null);
                });
              }}
            />
            {error && <ErrorNotice error={error} />}
          </>
        )}
      </Modal>
      <Modal
        open={!!patchFlow}
        onOpenChange={(open) => {
          if (!open) setPatchFlow(null);
        }}
        title="پچ فایل سرور در همین گفتگو"
        description="روند زنده تولید پچ، بازبینی کد و تأیید مستقل اعمال روی کانتینر"
        className="reliability-dialog"
      >
        {patchFlow && (
          <ReliabilityPanel
            key={patchFlow.runId}
            applicationId={patchFlow.applicationId}
            initialRunId={patchFlow.runId}
            compact
          />
        )}
      </Modal>
      <Modal
        open={!!deploymentFlow}
        onOpenChange={(open) => {
          if (!open) setDeploymentFlow(null);
        }}
        title="با پایلوت، پروژه‌ات را آنلاین کن"
        description="بررسی، انتخاب منابع، تأیید و اجرای زنده؛ در همین گفتگو."
        className="agent-workflow-dialog"
      >
        {deploymentFlow?.id ? (
          <AgentDeploymentRun id={deploymentFlow.id} model={activeModel || undefined} />
        ) : (
          deploymentFlow && (
            <DeploymentWizard
              model={activeModel || undefined}
              initialUrl={deploymentFlow.url}
              onPrepared={(id) => {
                setDeploymentFlow({ id });
                if (selected)
                  void api(`/conversations/${selected}/deployment`, conversationDetailSchema, {
                    method: 'POST',
                    body: { deploymentId: id },
                    csrfToken: session.data?.csrfToken,
                  })
                    .then(save)
                    .catch((e) => setError(e));
              }}
            />
          )
        )}
      </Modal>
      <Modal
        open={!!review}
        onOpenChange={(open) => {
          if (!busy && !open) {
            setReview(null);
            setConsent(false);
          }
        }}
        title="تأیید بررسی و اشتراک شواهد"
        description="قبل از ادامه، سرویس، بازه بررسی و داده‌های ارسالی به مدل را مرور کنید."
      >
        <div className="modal-body approval-review">
          {error && <div role="alert">{error.message}</div>}
          {review && (
            <>
              <div className="approval-target">
                <Mascot size={48} />
                <div>
                  <span>سرویس انتخاب‌شده</span>
                  <h3>
                    <bdi>{review.snapshot.applicationName}</bdi>
                  </h3>
                </div>
              </div>
              <dl>
                <dt>داده‌ها</dt>
                <dd>
                  جزئیات سرویس، ۵ انتشار آخر
                  {review.snapshot.includeLogs ? ' و حداکثر ۳۰ خط لاگ' : '؛ بدون لاگ'}
                </dd>
                <dt>آغاز بازه لاگ</dt>
                <dd>{formatDate(review.snapshot.since)}</dd>
                <dt>مهلت تأیید</dt>
                <dd>{formatDate(review.snapshot.expiresAt)}</dd>
                <dt>اثر بر سرویس</dt>
                <dd>فقط خواندن؛ بدون انتشار، حذف یا راه‌اندازی مجدد</dd>
                <dt>مقصد تحلیل</dt>
                <dd>
                  <bdi>{review.snapshot.model}</bdi> · <bdi>{review.snapshot.modelHost}</bdi>
                </dd>
              </dl>
              <div className="approval-privacy">
                <ShieldCheck size={19} />
                <p>
                  شواهد پس از پالایش به مدل ارسال می‌شوند. پالایش ممکن است همه اطلاعات حساس را تشخیص
                  ندهد. فراخوانی مدل می‌تواند هزینه ارائه‌دهنده داشته باشد.
                </p>
              </div>
              <label className="approval-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={busy}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                خواندن داده‌های مشخص‌شده و ارسال آن‌ها به مدل را تأیید می‌کنم.
              </label>
              <details>
                <summary>شناسه طرح</summary>
                <code className="approval-hash" dir="ltr">
                  {review.hash}
                </code>
              </details>
              <div className="dialog-actions">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void decision(review, 'cancel')}
                >
                  لغو طرح
                </Button>
                <Button
                  disabled={
                    !consent || locked || Date.parse(review.snapshot.expiresAt) <= Date.now()
                  }
                  onClick={() => void decision(review, 'approve')}
                >
                  {busy ? 'در حال بررسی…' : 'تأیید و شروع بررسی'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
