import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import { formatMoney } from '@folio/shared';
import type { Overview } from '../lib';
import { Empty } from './ui';
const colors = [
  '#356354',
  '#b6ca85',
  '#dda16e',
  '#8caeb4',
  '#b69ac1',
  '#d5c38f',
  '#748a66',
  '#d19a9a',
  '#8891ae',
  '#9cb398',
];
const tooltipStyle = {
  background: 'var(--card)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  color: 'var(--text)',
  fontSize: 12,
};
const yLabel = (v: number) =>
  Math.abs(v) >= 10000000
    ? `${(v / 10000000).toFixed(1)}L`
    : Math.abs(v) >= 100000
      ? `${(v / 100000).toFixed(0)}k`
      : `${Math.round(v / 100)}`;
const monthLabel = (v: string) =>
  new Date(`${v}-01T12:00:00`).toLocaleDateString('en-IN', { month: 'short' });
export function CashFlowChart({ data }: { data: Overview['history'] }) {
  return (
    <div
      className="chart"
      role="img"
      aria-label="Monthly income and expenses for the last twelve months"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={4}>
          <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" />
          <XAxis
            dataKey="month"
            tickFormatter={monthLabel}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            dy={7}
          />
          <YAxis
            tickFormatter={yLabel}
            tickLine={false}
            axisLine={false}
            width={42}
            tick={{ fontSize: 10, fill: 'var(--muted)' }}
          />
          <Tooltip
            formatter={(v) => formatMoney(Number(v))}
            labelFormatter={(v) => String(v)}
            contentStyle={tooltipStyle}
            cursor={{ fill: 'var(--hover)' }}
          />
          <Bar
            isAnimationActive={false}
            name="Income"
            dataKey="income"
            fill="#356354"
            radius={[3, 3, 0, 0]}
            maxBarSize={18}
          />
          <Bar
            isAnimationActive={false}
            name="Expenses"
            dataKey="expense"
            fill="#c5d6ad"
            radius={[3, 3, 0, 0]}
            maxBarSize={18}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function ExpenseChart({ data }: { data: { name: string; total: number }[] }) {
  const categories = data.filter((d) => d.total > 0);
  return categories.length ? (
    <div className="donut-layout">
      <div className="donut-chart" role="img" aria-label="Expense breakdown by category">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              isAnimationActive={false}
              data={categories}
              dataKey="total"
              nameKey="name"
              innerRadius="65%"
              outerRadius="90%"
              paddingAngle={3}
              stroke="none"
            >
              {categories.map((c, i) => (
                <Cell key={c.name} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => formatMoney(Number(v))} contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-label">
          <small>Spent this month</small>
          <strong>{formatMoney(categories.reduce((n, c) => n + c.total, 0))}</strong>
        </div>
      </div>
      <div className="category-legend">
        {categories.slice(0, 6).map((c, i) => (
          <div key={c.name}>
            <span className="legend-dot" style={{ background: colors[i % colors.length] }} />
            <span>{c.name}</span>
            <strong>{formatMoney(c.total)}</strong>
          </div>
        ))}
      </div>
    </div>
  ) : (
    <Empty title="A clean slate">Your expense categories will appear here.</Empty>
  );
}
export function WealthChart({ data }: { data: Overview['history'] }) {
  return (
    <div className="chart" role="img" aria-label="Net worth history">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="wealth-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4a7a64" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#4a7a64" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" />
          <XAxis
            dataKey="month"
            tickFormatter={monthLabel}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
          />
          <YAxis
            tickFormatter={yLabel}
            width={45}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: 'var(--muted)' }}
          />
          <Tooltip formatter={(v) => formatMoney(Number(v))} contentStyle={tooltipStyle} />
          <Area
            isAnimationActive={false}
            name="Net worth"
            dataKey="net_worth"
            type="monotone"
            stroke="#4a7a64"
            strokeWidth={2.5}
            fill="url(#wealth-fill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function InvestmentChart({
  data,
}: {
  data: { date: string; value: number; invested: number }[];
}) {
  return (
    <div className="chart" role="img" aria-label="Investment current value versus invested amount">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => String(v).slice(0, 7)}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: 'var(--muted)' }}
          />
          <YAxis
            width={45}
            tickFormatter={yLabel}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: 'var(--muted)' }}
          />
          <Tooltip formatter={(v) => formatMoney(Number(v))} contentStyle={tooltipStyle} />
          <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
          <Line
            isAnimationActive={false}
            name="Current value"
            dataKey="value"
            stroke="#356354"
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            isAnimationActive={false}
            name="Net invested"
            dataKey="invested"
            stroke="#b4c58e"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
