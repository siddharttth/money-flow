'use client';

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';
import { formatINR } from '@/lib/money';
import { dayLabel, monthLabel } from '@/lib/dates';

const axisStyle = { fontSize: 11, fill: 'var(--text-muted)' };

function TooltipBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="card px-3 py-2 text-xs">
      <p className="muted">{label}</p>
      <p className="font-semibold tabular">{formatINR(value, { decimals: true })}</p>
    </div>
  );
}

export function CategoryDonut({
  data,
}: {
  data: { name: string; totalMinor: number; color: string }[];
}) {
  if (!data.length) return null;
  const total = data.reduce((s, d) => s + d.totalMinor, 0);

  return (
    <div className="relative" style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="totalMinor"
            nameKey="name"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ payload }) =>
              payload?.[0] ? (
                <TooltipBox label={String(payload[0].name)} value={Number(payload[0].value)} />
              ) : null
            }
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Centre label — the number that actually matters. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="label mb-0">Total</span>
        <span className="text-xl font-semibold tabular">{formatINR(total)}</span>
      </div>
    </div>
  );
}

export function DailyTrend({ data }: { data: { date: string; totalMinor: number }[] }) {
  if (data.length < 2) return null;
  return (
    <div style={{ height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={dayLabel} tick={axisStyle} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tickFormatter={(v) => formatINR(Number(v), { compact: true })} tick={axisStyle} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            content={({ payload }) =>
              payload?.[0] ? (
                <TooltipBox label={dayLabel(String(payload[0].payload.date))} value={Number(payload[0].value)} />
              ) : null
            }
          />
          <Area type="monotone" dataKey="totalMinor" stroke="var(--accent)" strokeWidth={2} fill="url(#spendFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthlyBars({
  data,
  activeMonth,
}: {
  data: { month: string; totalMinor: number }[];
  activeMonth?: string;
}) {
  if (!data.length) return null;
  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={(m) => monthLabel(String(m)).split(' ')[0].slice(0, 3)}
            tick={axisStyle}
            axisLine={false}
            tickLine={false}
          />
          <YAxis tickFormatter={(v) => formatINR(Number(v), { compact: true })} tick={axisStyle} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={({ payload }) =>
              payload?.[0] ? (
                <TooltipBox label={monthLabel(String(payload[0].payload.month))} value={Number(payload[0].value)} />
              ) : null
            }
          />
          <Bar dataKey="totalMinor" radius={[6, 6, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.month} fill={d.month === activeMonth ? 'var(--accent)' : 'var(--border)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Simple proportional bar — used in lists where a full chart is overkill. */
export function ShareBar({ share, color }: { share: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full overflow-hidden mt-1.5" style={{ background: 'var(--surface-2)' }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.max(share * 100, 2)}%`, background: color }}
      />
    </div>
  );
}
