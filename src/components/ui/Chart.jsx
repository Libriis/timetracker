import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { cn } from '../../lib/cn.js';

// Chart primitives on Recharts, themed with our tokens. Ported from the 21st.dev
// "Charts & KPI Cards" kit (uvain): thin marks, hairline grid, text never wears the series color,
// a legend for 2+ series, a tooltip on every chart, a hidden data table for screen readers.

const AXIS = { fill: 'rgb(var(--fg-subtle))', fontSize: 11, fontFamily: 'inherit' };

export function ChartLegend({ series, className }) {
  if (!series || series.length < 2) return null;
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1.5', className)} aria-hidden>
      {series.map(s => (
        <li key={s.key} className="flex items-center gap-1.5 text-xs text-fg-muted">
          <span className="size-2 rounded-[3px]" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function TooltipBox({ active, payload, label, series, format, labelFormat, total }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter(p => Number(p.value) > 0);
  const sum = rows.reduce((s, p) => s + Number(p.value), 0);
  return (
    <div className="min-w-[180px] rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs text-fg shadow-lg">
      {label !== undefined && <p className="mb-1.5 font-semibold">{labelFormat ? labelFormat(label) : label}</p>}
      <ul className="grid gap-1">
        {rows.map(p => {
          const s = series?.find(x => x.key === p.dataKey) || { label: p.name, color: p.payload?.color || p.color };
          return (
            <li key={p.dataKey || p.name} className="flex items-center justify-between gap-4">
              <span className="flex min-w-0 items-center gap-1.5 text-fg-muted">
                <span className="size-2 shrink-0 rounded-[3px]" style={{ background: s.color || p.payload?.color }} />
                <span className="truncate">{s.label}</span>
              </span>
              <span className="font-medium tnum">{format(Number(p.value))}</span>
            </li>
          );
        })}
      </ul>
      {total && rows.length > 1 && (
        <div className="mt-1.5 flex justify-between border-t border-line pt-1.5 font-semibold"><span>Total</span><span className="tnum">{format(sum)}</span></div>
      )}
    </div>
  );
}

// Stacked (or grouped) bar chart. series: [{ key, label, color }]
export function BarChartCard({ data, xKey, series, height = 240, format = (v) => String(v), xFormat, yFormat, labelFormat, stacked = true, description, maxBarSize = 28, yTicks }) {
  return (
    <div className="grid gap-3">
      <div role="img" aria-label={description} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={AXIS} tickMargin={8} tickFormatter={xFormat} minTickGap={12} interval="preserveStartEnd" />
            <YAxis tickLine={false} axisLine={false} tick={AXIS} tickFormatter={yFormat || format} width={44} ticks={yTicks} allowDecimals={false} />
            <RTooltip cursor={{ fill: 'rgb(var(--fg) / 0.05)' }} content={<TooltipBox series={series} format={format} labelFormat={labelFormat} total={stacked} />} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} stackId={stacked ? 'a' : undefined} fill={s.color}
                maxBarSize={maxBarSize} radius={stacked && i < series.length - 1 ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                stroke="rgb(var(--surface))" strokeWidth={stacked ? 1 : 0} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{description}</caption>
        <tbody>{data.map((row, i) => <tr key={i}><th>{String(row[xKey])}</th>{series.map(s => <td key={s.key}>{format(Number(row[s.key] || 0))}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// Donut with a centered total and a side legend. data: [{ label, value, color, sub? }]
export function DonutChart({ data, format = (v) => String(v), centerLabel, centerValue, size = 172, description, legendFormat }) {
  const total = data.reduce((n, d) => n + d.value, 0);
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <div role="img" aria-label={description} className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data.length ? data : [{ label: 'none', value: 1, color: 'rgb(var(--surface-3))' }]} dataKey="value" nameKey="label"
              innerRadius="70%" outerRadius="100%" stroke="rgb(var(--surface))" strokeWidth={2} startAngle={90} endAngle={-270}
              paddingAngle={data.length > 1 ? 1 : 0} cornerRadius={3} isAnimationActive={false} rootTabIndex={-1}>
              {(data.length ? data : [{ color: 'rgb(var(--surface-3))' }]).map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            {data.length > 0 && <RTooltip content={<TooltipBox format={format} />} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <span className="text-xl font-semibold text-fg tnum">{centerValue ?? format(total)}</span>
          {centerLabel && <span className="mt-0.5 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">{centerLabel}</span>}
        </div>
      </div>
      <ul className="grid min-w-[180px] flex-1 gap-2">
        {data.map(d => (
          <li key={d.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-fg">
              <span className="size-2 shrink-0 rounded-full" style={{ background: d.color }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2 tnum">
              <span className="font-medium text-fg">{(legendFormat || format)(d.value)}</span>
              <span className="w-9 text-right text-xs text-fg-subtle">{total ? Math.round((d.value / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
