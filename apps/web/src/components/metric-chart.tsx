import { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { metricSeries, type DemoProject } from '../demo/data';
import { persianNumber } from '../lib/workspace';
export function MetricChart({
  project,
  metric = 'cpu',
}: {
  project: DemoProject;
  metric?: 'cpu' | 'memory' | 'latency';
}) {
  const id = useId().replace(/:/g, '');
  const reference = metric === 'cpu' ? 24 : metric === 'memory' ? 42 : 128;
  const rows = metricSeries.map((row) => ({
    time: row.time,
    value: Math.round((row[metric] / reference) * project[metric]),
  }));
  const unit = metric === 'latency' ? 'ms' : '٪';
  return (
    <div
      className="resource-chart"
      dir="ltr"
      role="img"
      aria-label={`نمودار نمایشی ${metric === 'cpu' ? 'مصرف پردازنده' : metric === 'memory' ? 'مصرف حافظه' : 'زمان پاسخ'} ${project.title}؛ آخرین مقدار ${persianNumber(project[metric])} ${unit}`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={rows} margin={{ top: 10, right: 8, bottom: 0, left: -22 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--mint)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--mint)" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="time"
            axisLine={false}
            tickLine={false}
            minTickGap={35}
            tick={{ fill: 'var(--subtle)', fontSize: 12, fontFamily: 'Kalameh' }}
            tickFormatter={(value) =>
              String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]!)
            }
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--subtle)', fontSize: 12, fontFamily: 'Kalameh' }}
            tickFormatter={(value) => persianNumber(Number(value))}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: 9,
              fontFamily: 'Kalameh',
              fontSize: 12,
              color: 'var(--text)',
            }}
            formatter={(value) => [`${persianNumber(Number(value))} ${unit}`, 'مقدار نمونه']}
            labelFormatter={(label) => `ساعت ${label} · دمو`}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--mint)"
            strokeWidth={2.5}
            fill={`url(#${id})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
