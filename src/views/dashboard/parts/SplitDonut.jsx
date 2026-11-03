import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { cn } from '../../../lib/cn.js';
import { useWidth } from './useWidth.js';

// Donut + ranked legend. Hovering a legend row (or a slice) lifts that slice and fades the rest.
// items: [{ id, label, sub?, value, color }] sorted; shows the top `limit`, folds the rest into "Other".
export function SplitDonut({ items, format, center, centerLabel, limit = 5, size = 156, description }) {
  const [hover, setHover] = useState(null);
  const [ref, width] = useWidth();
  const total = items.reduce((s, d) => s + d.value, 0);
  // Fold the tail into "N more" only when that saves at least two rows.
  const cut = items.length > limit + 1 ? limit : items.length;
  const shown = items.slice(0, cut);
  const rest = items.slice(cut);
  const list = rest.length
    ? [...shown, { id: '__other', label: `${rest.length} more`, value: rest.reduce((s, d) => s + d.value, 0), color: 'rgb(var(--fg-faint))' }]
    : shown;
  const slices = list.filter(d => d.value > 0);
  const pct = (v) => (total > 0 ? (v / total) * 100 : 0);
  const fmtPct = (v) => { const p = pct(v); return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`; };
  const active = hover && slices.find(s => s.id === hover);

  return (
    // Side by side when the card is wide (stacked layouts, 760 px windows), donut over legend otherwise.
    <div ref={ref} className={cn('flex items-stretch gap-4', width >= 520 ? 'flex-row items-center gap-10 px-2' : 'flex-col')}>
      <div role="img" aria-label={description} className="relative mx-auto shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices.length ? slices : [{ id: 'none', value: 1, color: 'rgb(var(--surface-3))' }]} dataKey="value" nameKey="label"
              innerRadius="72%" outerRadius="100%" stroke="rgb(var(--surface))" strokeWidth={2} startAngle={90} endAngle={-270}
              paddingAngle={slices.length > 1 ? 1.5 : 0} cornerRadius={3} isAnimationActive={false} rootTabIndex={-1}
              onMouseLeave={() => setHover(null)}>
              {(slices.length ? slices : [{ id: 'none', color: 'rgb(var(--surface-3))' }]).map(d => (
                <Cell key={d.id} fill={d.color} opacity={hover && hover !== d.id ? 0.28 : 1}
                  onMouseEnter={() => setHover(d.id)} style={{ transition: 'opacity 120ms', outline: 'none' }} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-content-center px-5 text-center">
          <span className="truncate text-lg font-semibold leading-6 text-fg tnum">{active ? format(active.value) : center}</span>
          <span className="mt-0.5 truncate text-2xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">{active ? fmtPct(active.value) + ' share' : centerLabel}</span>
        </div>
      </div>
      <ul className="grid min-w-0 flex-1 gap-0.5" onMouseLeave={() => setHover(null)}>
        {list.map(d => (
          <li key={d.id} onMouseEnter={() => setHover(d.id)}
            className={cn('-mx-2 grid grid-cols-[minmax(0,1fr)_auto_36px] items-center gap-3 rounded-md px-2 py-[5px] text-sm transition-colors duration-fast',
              hover === d.id ? 'bg-fg/[0.05]' : '')}>
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className={cn('size-2 shrink-0 rounded-full', d.sub && 'self-start mt-[5px]')} style={{ background: d.color }} />
              {d.sub ? (
                // Project rows name their client on a second line, so neither name gets cut short.
                <span className="min-w-0 leading-tight">
                  <span title={d.label} className="block truncate text-fg">{d.label}</span>
                  <span title={d.sub} className="block truncate text-2xs text-fg-subtle">{d.sub}</span>
                </span>
              ) : (
                <span title={d.label} className={cn('truncate', d.id === '__other' ? 'text-fg-subtle' : 'text-fg')}>{d.label}</span>
              )}
            </span>
            <span className="text-right font-medium text-fg tnum">{format(d.value)}</span>
            <span className="text-right text-xs text-fg-subtle tnum">{fmtPct(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
