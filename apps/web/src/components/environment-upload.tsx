import { useRef, useState } from 'react';
import { UploadCloud, FileCheck2, X } from 'lucide-react';
import { parseEnvFile } from '../../../../packages/shared/src/env-file';
export function EnvironmentUpload({
  value,
  onChange,
  required,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  required: string[];
}) {
  const input = useRef<HTMLInputElement>(null),
    [filename, setFilename] = useState(''),
    [error, setError] = useState('');
  const names = Object.keys(value),
    missing = required.filter((n) => !value[n]?.trim());
  return (
    <section className="wizard-secret-form env-upload-card">
      <UploadCloud size={30} />
      <h4>فایل تنظیمات پروژه را آپلود کنید</h4>
      <p>
        فایل <bdi>.env</bdi> آماده پروژه را انتخاب کنید. مقدارها به مدل یا تاریخچه گفتگو فرستاده
        نمی‌شوند و هنگام ثبت طرح، رمزگذاری می‌شوند.
      </p>
      <input
        ref={input}
        type="file"
        aria-label="آپلود فایل تنظیمات"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setError('');
          try {
            if (file.size > 131072) throw new Error('حجم فایل باید کمتر از ۱۲۸ کیلوبایت باشد.');
            const parsed = parseEnvFile(await file.text());
            if (!Object.keys(parsed).length) throw new Error('فایل تنظیمات مقدار غیرخالی ندارد.');
            onChange(parsed);
            setFilename(file.name);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'خواندن فایل ممکن نشد.');
          }
          e.target.value = '';
        }}
      />
      <button type="button" className="env-upload-button" onClick={() => input.current?.click()}>
        {filename ? <FileCheck2 size={19} /> : <UploadCloud size={19} />}{' '}
        {filename || 'انتخاب فایل .env'}
      </button>
      {!!names.length && (
        <>
          <p>{names.length} متغیر آماده شد؛ فقط نام‌ها نمایش داده می‌شوند.</p>
          <div className="env-name-chips">
            {names.map((n) => (
              <bdi key={n}>{n}</bdi>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange({});
              setFilename('');
            }}
          >
            <X size={14} /> حذف فایل
          </button>
        </>
      )}
      {!!missing.length && (
        <details>
          <summary>{missing.length} تنظیم شناسایی‌شده هنوز مقدار ندارد</summary>
          <p className="env-name-chips">
            {missing.map((n) => (
              <bdi key={n}>{n}</bdi>
            ))}
          </p>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
