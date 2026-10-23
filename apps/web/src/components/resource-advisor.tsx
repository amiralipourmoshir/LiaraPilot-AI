import { useEffect, useRef, useState } from 'react';
import { Sparkles, MessageCircle, Check, LoaderCircle } from 'lucide-react';
import { z } from 'zod';
import { resourceAdviceSchema } from '../../../../packages/shared/src/deployment-live';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { Modal } from './primitives';
import { AgentForm } from './agent-form';
import { Button } from './ui/button';
export function ResourceAdvisor({
  analysisId,
  connectionId,
  onChoose,
  model,
}: {
  analysisId: string;
  connectionId: string;
  onChoose: (key: string) => void;
  model?: string;
}) {
  const session = useSession();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [advice, setAdvice] = useState<z.infer<typeof resourceAdviceSchema> | null>(null),
    [answers, setAnswers] = useState<{ question: string; answer: string }[]>([]);
  const ask = async (next = answers) => {
    setOpen(true);
    setBusy(true);
    setError('');
    try {
      setAdvice(
        await api(`/repositories/${analysisId}/resource-advice`, resourceAdviceSchema, {
          method: 'POST',
          csrfToken: session.data?.csrfToken,
          body: { connectionId, answers: next, ...(model ? { model } : {}) },
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ارتباط با ایجنت ممکن نشد.');
    } finally {
      setBusy(false);
    }
  };
  const started = useRef(false);
  useEffect(() => {
    if (!started.current && session.data?.csrfToken) {
      started.current = true;
      void ask([]);
    }
  }, [session.data?.csrfToken]);
  return (
    <section className="resource-advisor-card">
      <Sparkles size={25} />
      <div>
        <h4>با پایلوت، پلن مناسب را پیدا کنیم</h4>
        <p>
          درباره کاربرد پروژه صحبت می‌کنیم؛ هوش مصنوعی با توجه به پاسخ شما و قیمت‌های حساب، پیشنهادش
          را توضیح می‌دهد.
        </p>
        {advice?.planKey && <p className="resource-advisor-result">{advice.explanation}</p>}
      </div>
      <Button type="button" variant="secondary" onClick={() => void ask()}>
        <MessageCircle size={16} />{' '}
        {advice?.planKey ? 'بازبینی پیشنهاد ایجنت' : 'گفتگو برای انتخاب پلن'}
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="انتخاب منابع با پایلوت"
        description="پاسخ تخصصی لازم نیست؛ درباره نیازتان بگویید."
        className="agent-question-dialog"
      >
        {busy ? (
          <div className="advisor-thinking">
            <LoaderCircle className="spin" /> پایلوت در حال بررسی نیاز شما و منابع موجود است…
          </div>
        ) : error ? (
          <>
            <p role="alert">{error}</p>
            <Button onClick={() => void ask()}>دوباره بررسی کن</Button>
          </>
        ) : advice?.question ? (
          <>
            <p>{advice.explanation}</p>
            <AgentForm
              key={advice.question}
              fields={[
                {
                  name: 'need',
                  label: advice.question,
                  type: advice.options.length ? 'radio' : 'textarea',
                  required: true,
                  options: advice.options.map((o) => ({ label: o, value: o })),
                  allowCustom: true,
                },
              ]}
              onSubmit={async (values) => {
                const next = [
                  ...answers,
                  { question: advice.question, answer: String(values.need) },
                ];
                setAnswers(next);
                await ask(next);
              }}
            />
          </>
        ) : advice?.planKey ? (
          <>
            <p className="advisor-recommendation">{advice.explanation}</p>
            <Button
              onClick={() => {
                onChoose(advice.planKey);
                setOpen(false);
              }}
            >
              <Check size={17} /> این پیشنهاد را در جدول انتخاب کن
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setAdvice(null);
                setAnswers([]);
                void ask([]);
              }}
            >
              نیاز من فرق دارد؛ دوباره گفتگو کنیم
            </Button>
          </>
        ) : null}
        <p className="wizard-helper">
          انتخاب نهایی با شماست؛ می‌توانید پنجره را ببندید و هر پلنی را در جدول انتخاب کنید.
        </p>
      </Modal>
    </section>
  );
}
