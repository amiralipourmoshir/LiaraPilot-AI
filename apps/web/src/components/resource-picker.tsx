import { useState } from 'react';
import { Check, Expand, Sparkles, Gem } from 'lucide-react';
import { z } from 'zod';
import { planOptionSchema } from '../../../../packages/shared/src/wizard';
import { persianNumber } from '../lib/workspace';
type Plan = z.infer<typeof planOptionSchema>;
const bundleOrder = ['basic', 'standard', 'pro', 'free'];
export function ResourcePicker({
  plans,
  value,
  onChange,
}: {
  plans: Plan[];
  value?: string;
  onChange: (key: string) => void;
}) {
  const selected = plans.find((p) => `${p.id}|${p.bundleId}` === value);
  const [preferredBundle, setPreferredBundle] = useState('');
  const bundleIds = [...new Set(plans.map((p) => p.bundleId))].sort(
    (a, b) => bundleOrder.indexOf(a) - bundleOrder.indexOf(b),
  );
  const bundle =
    preferredBundle && bundleIds.includes(preferredBundle)
      ? preferredBundle
      : (selected?.bundleId ?? (bundleIds.includes('standard') ? 'standard' : bundleIds[0]));
  const visible = plans.filter((p) => p.bundleId === bundle);
  const money = (amount: number | null | undefined) =>
    amount == null ? 'قیمت در دسترس نیست' : persianNumber(amount) + ' تومان';
  const choose = (p: Plan) => onChange(`${p.id}|${p.bundleId}`);
  return (
    <section className="liara-resources" aria-label="انتخاب منابع لیارا">
      <div className="resource-heading">
        <div>
          <h3>انتخاب منابع</h3>
          <p>پلن مناسب پروژه‌تان را انتخاب کنید؛ مشخصات و قیمت‌ها از حساب لیارا دریافت شده‌اند.</p>
        </div>
        <span>
          <Sparkles size={14} /> انتخاب با شماست
        </span>
      </div>
      <div className="resource-bundles" role="tablist" aria-label="بسته امکانات">
        {bundleIds.map((id) => (
          <button
            type="button"
            role="tab"
            aria-selected={id === bundle}
            key={id}
            onClick={() => {
              setPreferredBundle(id);
              const next =
                plans.find((p) => p.bundleId === id && p.id === selected?.id) ??
                plans.find((p) => p.bundleId === id && p.recommended) ??
                plans.find((p) => p.bundleId === id);
              if (next) choose(next);
            }}
          >
            {['basic', 'standard', 'pro'].includes(id) ? (
              <img src={`/plans/${id}.svg`} alt="" />
            ) : (
              <Gem size={22} />
            )}
            <span>{plans.find((p) => p.bundleId === id)?.bundleName ?? id}</span>
          </button>
        ))}
      </div>
      <div
        className="resource-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="مقایسه قیمت و مشخصات پلن‌ها"
      >
        <table className="resource-table">
          <thead>
            <tr>
              <th scope="col">
                <span>پلن سرویس</span>
                <small>مقایسه منابع</small>
              </th>
              {visible.map((p) => (
                <th
                  scope="col"
                  key={p.id}
                  className={
                    selected?.id === p.id && selected.bundleId === p.bundleId ? 'is-selected' : ''
                  }
                >
                  <button
                    type="button"
                    aria-pressed={selected?.id === p.id && selected.bundleId === p.bundleId}
                    onClick={() => choose(p)}
                    className="resource-planet-button"
                  >
                    {p.planet ? (
                      <img
                        src={`/plans/${p.planet}.${p.planet === 'pluto' ? 'webp' : p.planet === 'sun' ? 'svg' : 'png'}`}
                        className="resource-planet"
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <Gem className="resource-planet-fallback" size={58} />
                    )}
                    <span className="resource-expand">
                      {selected?.id === p.id && selected.bundleId === p.bundleId ? (
                        <Check size={16} />
                      ) : (
                        <Expand size={15} />
                      )}
                    </span>
                    <strong>{p.name}</strong>
                    {p.recommended && (
                      <small className="resource-recommended">پیشنهاد اولیه پایلوت</small>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { title: 'قیمت ماهانه', render: (p: Plan) => money(p.estimatedMonthlyToman) },
              { title: 'قیمت ساعتی', render: (p: Plan) => money(p.estimatedHourlyToman) },
              {
                title: 'RAM',
                render: (p: Plan) => (
                  <bdi>{p.ramGb < 1 ? Math.round(p.ramGb * 1024) + ' MB' : p.ramGb + ' GB'}</bdi>
                ),
              },
              { title: 'vCPU', render: (p: Plan) => <bdi>{p.cpu} Core</bdi> },
              { title: 'Disk', render: (p: Plan) => <bdi>{p.diskGb} GB</bdi> },
            ].map((row) => (
              <tr key={row.title}>
                <th scope="row">{row.title}</th>
                {visible.map((p) => (
                  <td
                    key={p.id}
                    className={
                      selected?.id === p.id && selected.bundleId === p.bundleId ? 'is-selected' : ''
                    }
                  >
                    {row.render(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="resource-footnote">
        برآورد ماهانه برای ۷۲۰ ساعت است؛ مالیات و مصرف اضافه جداست. قیمت نهایی پیش از اجرا دوباره
        بررسی می‌شود.
      </p>
    </section>
  );
}
