import { useState } from 'react';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { ChoicePicker } from './choice-picker';
import { Button } from './ui/button';
export type AgentField = {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  allowCustom?: boolean;
  type:
    | 'text'
    | 'password'
    | 'url'
    | 'email'
    | 'number'
    | 'date'
    | 'textarea'
    | 'select'
    | 'radio'
    | 'checkbox'
    | 'multiselect';
  options?: { value: string; label: string }[];
  defaultValue?: string | boolean | string[];
};
export function AgentForm({
  fields,
  onSubmit,
  submitLabel = 'ثبت پاسخ و ادامه',
  busy = false,
}: {
  fields: AgentField[];
  onSubmit: (values: Record<string, string | boolean | string[]>) => Promise<void>;
  submitLabel?: string;
  busy?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string | boolean | string[]>>(() =>
    Object.fromEntries(
      fields.map((f) => [
        f.name,
        f.defaultValue ?? (f.type === 'checkbox' ? false : f.type === 'multiselect' ? [] : ''),
      ]),
    ),
  );
  const [sending, setSending] = useState(false);
  const set = (name: string, value: string | boolean | string[]) =>
    setValues((old) => ({ ...old, [name]: value }));
  return (
    <form
      className="agent-question-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setSending(true);
        try {
          await onSubmit(values);
        } finally {
          setSending(false);
        }
      }}
    >
      <div className="agent-form-caption">
        <Sparkles size={16} /> برای ادامه، این بخش را با هم مشخص کنیم
      </div>
      {fields.map((f) => (
        <div className="agent-form-field" key={f.name}>
          {f.type !== 'checkbox' && (
            <label htmlFor={`agent-${f.name}`}>
              {f.label}
              {f.required && <span aria-hidden="true"> *</span>}
            </label>
          )}
          {f.hint && <p id={`hint-${f.name}`}>{f.hint}</p>}
          {f.type === 'select' ? (
            <ChoicePicker
              id={`agent-${f.name}`}
              label={f.label}
              required={f.required}
              value={String(values[f.name] ?? '')}
              onChange={(value) => set(f.name, value)}
              options={f.options ?? []}
              allowCustom={f.allowCustom}
            />
          ) : f.type === 'textarea' ? (
            <textarea
              id={`agent-${f.name}`}
              required={f.required}
              value={String(values[f.name] ?? '')}
              onChange={(e) => set(f.name, e.target.value)}
            />
          ) : f.type === 'radio' || f.type === 'multiselect' ? (
            <div role="group" aria-label={f.label} className="agent-form-options">
              {f.options?.map((o) => (
                <label key={o.value}>
                  <input
                    type={f.type === 'radio' ? 'radio' : 'checkbox'}
                    name={f.name}
                    value={o.value}
                    checked={
                      f.type === 'radio'
                        ? values[f.name] === o.value
                        : ((values[f.name] as string[]) ?? []).includes(o.value)
                    }
                    required={f.type === 'radio' && f.required}
                    onChange={(e) =>
                      set(
                        f.name,
                        f.type === 'radio'
                          ? o.value
                          : e.target.checked
                            ? [...((values[f.name] as string[]) ?? []), o.value]
                            : (values[f.name] as string[]).filter((v) => v !== o.value),
                      )
                    }
                  />
                  {o.label}
                </label>
              ))}
            </div>
          ) : f.type === 'checkbox' ? (
            <label className="agent-form-check">
              <input
                id={`agent-${f.name}`}
                type="checkbox"
                required={f.required}
                checked={values[f.name] === true}
                onChange={(e) => set(f.name, e.target.checked)}
              />
              {f.label}
            </label>
          ) : (
            <input
              id={`agent-${f.name}`}
              type={f.type}
              required={f.required}
              autoComplete={f.type === 'password' ? 'off' : undefined}
              value={String(values[f.name] ?? '')}
              onChange={(e) => set(f.name, e.target.value)}
            />
          )}
        </div>
      ))}
      <Button type="submit" disabled={busy || sending}>
        {sending ? 'در حال ثبت…' : submitLabel}
        <ArrowLeft size={15} />
      </Button>
    </form>
  );
}
