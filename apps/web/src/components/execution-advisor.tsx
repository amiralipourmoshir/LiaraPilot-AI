import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles, LoaderCircle } from 'lucide-react';
import { z } from 'zod';
import { executionInsightSchema } from '../../../../packages/shared/src/deployment-live';
import { deploymentSchema } from '../../../../packages/shared/src/deployment';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { useWorkspace } from '../lib/workspace';
import { Button } from './ui/button';
import { AgentForm } from './agent-form';
import { Modal } from './primitives';
export function ExecutionAdvisor({
  id,
  state,
  model,
}: {
  id: string;
  state: string;
  model?: string;
}) {
  const session = useSession(),
    client = useQueryClient(),
    { user } = useWorkspace();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [insight, setInsight] = useState<z.infer<typeof executionInsightSchema> | null>(null),
    [answers, setAnswers] = useState<{ question: string; answer: string }[]>([]);
  const automatic = useRef('');
  const analyze = async (next = answers) => {
    setOpen(true);
    setBusy(true);
    setError('');
    try {
      setInsight(
        await api(`/deployments/${id}/insight`, executionInsightSchema, {
          method: 'POST',
          csrfToken: session.data?.csrfToken,
          body: { answers: next, ...(model ? { model } : {}) },
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تحلیل این مرحله ممکن نشد.');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (
      ['FAILED', 'NEEDS_ATTENTION'].includes(state) &&
      session.data?.csrfToken &&
      automatic.current !== `${id}-${state}`
    ) {
      automatic.current = `${id}-${state}`;
      setAnswers([]);
      void analyze([]);
    }
  }, [id, state, session.data?.csrfToken]);
  return (
    <section className="execution-advisor">
      <Button variant="secondary" onClick={() => void analyze()}>
        <Sparkles size={17} /> پایلوت، این مرحله را بررسی کن
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="پایلوت در کنار اجرای پروژه"
        description="تحلیل هوش مصنوعی بر اساس وضعیت و لاگ واقعی همین انتشار"
        className="agent-question-dialog"
      >
        {busy ? (
          <div className="advisor-thinking">
            <LoaderCircle className="spin" /> در حال خواندن شواهد و بررسی قدم بعد…
          </div>
        ) : error ? (
          <>
            <p role="alert">{error}</p>
            <Button onClick={() => void analyze()}>تلاش دوباره برای تحلیل</Button>
          </>
        ) : insight ? (
          <>
            <p className="advisor-recommendation">{insight.summary}</p>
            {insight.question && (
              <AgentForm
                key={insight.question}
                fields={[
                  {
                    name: 'answer',
                    label: insight.question,
                    type: insight.options.length ? 'radio' : 'textarea',
                    options: insight.options.map((o) => ({ label: o, value: o })),
                    required: true,
                    allowCustom: true,
                  },
                ]}
                onSubmit={async (values) => {
                  const next = [
                    ...answers,
                    { question: insight.question, answer: String(values.answer) },
                  ];
                  setAnswers(next);
                  await analyze(next);
                }}
              />
            )}
            {insight.nextStep === 'RECHECK' && (
              <Button
                onClick={async () => {
                  setBusy(true);
                  try {
                    const data = await api(`/deployments/${id}/recheck`, deploymentSchema, {
                      method: 'POST',
                      body: {},
                      csrfToken: session.data?.csrfToken,
                    });
                    client.setQueryData(['deployment', user.id, id], data);
                    setOpen(false);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'بررسی انجام نشد.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                وضعیت واقعی سرویس را بررسی کن
              </Button>
            )}
            {insight.nextStep === 'REVIEW_SETTINGS' && (
              <p className="wizard-helper">
                برای اعمال تغییر، از «اصلاح تنظیمات و تلاش دوباره» در کارت بازیابی استفاده کنید؛ طرح
                تازه پیش از اجرا برای تأیید نمایش داده می‌شود.
              </p>
            )}
          </>
        ) : null}
      </Modal>
    </section>
  );
}
