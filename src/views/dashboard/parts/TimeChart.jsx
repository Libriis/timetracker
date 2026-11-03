import { useState } from 'react';
import { Bar, BarChart, BarStack, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { cn } from '../../../lib/cn.js';
import { niceTicks } from '../reportData.js';
import { useSize } from './useWidth.js';

// Stacked bar chart over time. Built on Recharts with our tokens: hairline grid, rounded top on
// the whole stack, today's tick in full text color, a total over each bar when there is room,
// a dashed average line whose value sits in a tag on the y axis (never on top of the bars),
// a tooltip with the full breakdown and total, and a legend that isolates one series on click.
// A hidden table carries the same numbers for screen readers.
//
// data:    [{ key, label, sub, full, today, future, [seriesKey]: number }]
// series:  stacked series [{ key, label, color, members? }] (members: names folded into "N more")
// detail:  every series for the tooltip (defaults to series)
// format:  value -> text (tooltip, table); axisFormat: axis ticks; shortFormat: bar totals;
//          tagFormat: the average tag on the axis; avgFormat: the average in the legend

const AXIS = { fill: 'rgb(var(--fg-subtle))', fontSize: 11, fontFamily: 'inherit' };
const MARGIN = { top: 18, right: 4, bottom: 0, left: 0 };
const X_AXIS_H = 40;
const AVG_WORD = { day: 'Daily avg', week: 'Weekly avg', month: 'Monthly avg' };
const TOTAL_H = 10; // bar total label: 10px text, line-height 1
const TOTAL_GAP = 3; // space between a bar's top and its label
const TOTAL_CLEAR = 3; // the average line keeps at least this far from a label

function Tick({ x, y, payload, data }) {
  const b = data[payload.index];
  if (!b) return null;
  // Readable text only: future days use fg-subtle like the rest (AA), today is bold fg.
  return (
    <g transform={`translate(${x},${y})`}>
      <text dy={12} textAnchor="middle" fontSize={11} fontWeight={b.today ? 600 : 400} fill={b.today ? 'rgb(var(--fg))' : 'rgb(var(--fg-subtle))'} className="tnum">{b.label}</text>
      {b.sub && <text dy={26} textAnchor="middle" fontSize={10} fill="rgb(var(--fg-subtle))">{b.sub}</text>}
      {b.today && <circle cy={-3} r={2} fill="rgb(var(--brand))" />}
    </g>
  );
}

// Y tick that steps aside for the average tag when they would touch.
function YTick({ x, y, payload, avg, step, format }) {
  if (avg > 0 && Math.abs(payload.value - avg) < step * 0.34) return null;
  return <text x={x} y={y} dy={4} textAnchor="end" {...AXIS} className="tnum">{format(payload.value)}</text>;
}

function AvgTag({ viewBox, text, width }) {
  if (!viewBox) return null;
  const { x, y } = viewBox;
  const w = width - 6;
  return (
    <g>
      <rect x={x - w - 3.5} y={y - 9.5} width={w} height={19} rx={9.5} fill="rgb(var(--surface))" stroke="rgb(var(--fg-muted))" strokeWidth={1} />
      <text x={x - 3.5 - w / 2} y={y} dy={3.6} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="rgb(var(--fg))" className="tnum">{text}</text>
    </g>
  );
}

function TipBox({ active, payload, data, detail, format, total }) {
  if (!active || !payload?.length) return null;
  const b = data[payload[0].payload?.__i] || payload[0].payload;
  const rows = detail.map(s => ({ ...s, v: Number(b[s.key] || 0) })).filter(r => r.v > 0).sort((p, q) => q.v - p.v);
  const sum = total(b);
  return (
    <div className="min-w-[220px] rounded-lg border border-line bg-surface-raised px-3 py-2.5 text-xs text-fg shadow-lg">
      <p className="mb-2 font-semibold">{b.full}</p>
      {rows.length === 0 ? <p className="text-fg-subtle">Nothing tracked</p> : (
        <ul className="grid gap-1.5">
          {rows.map(r => (
            <li key={r.key} className="flex items-center justify-between gap-5">
              <span className="flex min-w-0 items-center gap-1.5 text-fg-muted">
                <span className="size-2 shrink-0 rounded-[3px]" style={{ background: r.color }} />
                <span className="truncate">{r.label}</span>
              </span>
              <span className="font-medium tnum">{format(r.v)}</span>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 1 && (
        <div className="mt-2 flex justify-between border-t border-line pt-1.5 font-semibold"><span>Total</span><span className="tnum">{format(sum)}</span></div>
      )}
    </div>
  );
}

export function TimeChart({ data, series, detail, format, axisFormat, shortFormat, tagFormat = shortFormat, avgFormat = format, avgUnit, fill = false, height = 280, description }) {
  const [only, setOnly] = useState(null);
  const [wrapRef, box] = useSize();
  const width = box.w;
  const isolated = only && series.some(s => s.key === only) ? only : null;
  const shown = isolated ? series.filter(s => s.key === isolated) : series;
  const totalOf = (b) => shown.reduce((s, x) => s + (Number(b[x.key]) || 0), 0);
  const totals = data.map(totalOf);
  const max = Math.max(0, ...totals);
  const activeCount = totals.filter(v => v > 0).length;
  const avg = activeCount ? totals.reduce((s, v) => s + v, 0) / activeCount : 0;
  const ticks = niceTicks(Math.max(max, avg));
  const step = ticks[1] - ticks[0] || 1;
  const indexed = data.map((b, i) => ({ ...b, __i: i }));
  const dense = data.length > 16;

  // Axis width fits the longest tick and the average tag.
  const tagText = avg > 0 ? tagFormat(avg) : '';
  const chars = Math.max(...ticks.map(t => axisFormat(t).length), tagText.length + 1);
  const axisW = Math.max(44, Math.round(chars * 6.4 + 14));
  // Totals over the bars when every label fits its slot.
  const slot = width > 0 ? (width - axisW - MARGIN.right) / Math.max(1, data.length) : 0;
  const longest = Math.max(0, ...totals.filter(v => v > 0).map(v => shortFormat(v).length));
  const showTotals = slot > 0 && slot >= longest * 6 + 8;
  const domainTop = ticks[ticks.length - 1] || 1;
  // Plot box (band scale: every bucket gets an equal slot, bars sit in the middle of it).
  const plotTop = MARGIN.top;
  const plotH = Math.max(0, box.h - MARGIN.top - MARGIN.bottom - X_AXIS_H);

  // A bar total never shares its row with the dashed average line: a label the line would cross
  // moves up so it sits just above the line. Label box: TOTAL_H px tall, its bottom TOTAL_GAP px over the bar.
  const yOf = (v) => plotTop + plotH * (1 - v / domainTop);
  const avgY = avg > 0 ? yOf(avg) : null;
  const totalTop = (v) => {
    const top = yOf(v) - TOTAL_GAP - TOTAL_H;
    if (avgY == null) return top;
    const clash = avgY >= top - TOTAL_CLEAR && avgY <= top + TOTAL_H + TOTAL_CLEAR;
    return clash ? avgY - TOTAL_CLEAR - TOTAL_H - 1 : top;
  };

  const tipDetail = isolated ? shown : (detail || series);
  const fullTotal = (b) => (isolated ? totalOf(b) : (detail || series).reduce((s, x) => s + (Number(b[x.key]) || 0), 0));

  return (
    <div className={fill ? 'flex min-h-0 flex-1 flex-col' : undefined}>
      <div ref={wrapRef} role="img" aria-label={description} className={cn('relative', fill && 'min-h-[240px] flex-1')} style={fill ? undefined : { height }}>
        {/* Bar totals: a quiet label over each bar when every label fits its slot. */}
        {showTotals && plotH > 0 && (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {totals.map((v, i) => (v > 0 ? (
              <span key={data[i].key} className="absolute -translate-x-1/2 text-[10px] font-medium leading-none text-fg-subtle tnum"
                style={{ left: axisW + slot * (i + 0.5), top: totalTop(v), height: TOTAL_H }}>
                {shortFormat(v)}
              </span>
            ) : null))}
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={indexed} margin={MARGIN} barCategoryGap={dense ? '24%' : '32%'}>
            <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
            <XAxis dataKey="key" tickLine={false} axisLine={{ stroke: 'rgb(var(--line-strong))' }} height={X_AXIS_H}
              interval={0} tick={<Tick data={data} />} />
            <YAxis tickLine={false} axisLine={false} width={axisW} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} allowDecimals={false}
              tick={<YTick avg={avg} step={step} format={axisFormat} />} />
            <RTooltip cursor={{ fill: 'rgb(var(--fg) / 0.05)', radius: 4 }} isAnimationActive={false}
              content={<TipBox data={indexed} detail={tipDetail} format={format} total={fullTotal} />} />
            <BarStack radius={[4, 4, 0, 0]}>
              {shown.map(s => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} maxBarSize={44}
                  stroke="rgb(var(--surface))" strokeWidth={1} isAnimationActive={false} />
              ))}
            </BarStack>
            {avg > 0 && (
              <ReferenceLine y={avg} stroke="rgb(var(--fg-muted))" strokeDasharray="3 4" strokeWidth={1} ifOverflow="extendDomain"
                label={<AvgTag text={tagText} width={axisW} />} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1">
        {/* One series: a plain key (nothing to isolate), so its color is still named. */}
        {series.length === 1 && (
          <span className="flex h-6 items-center gap-1.5 px-1.5 text-xs text-fg-muted">
            <span aria-hidden className="size-2 rounded-[3px]" style={{ background: series[0].color }} />{series[0].label}
          </span>
        )}
        {series.length > 1 && series.map(s => {
          const on = isolated === s.key;
          const dim = isolated && !on;
          return (
            <button key={s.key} type="button" aria-pressed={on}
              title={s.members ? s.members.join(', ') : undefined}
              onClick={() => setOnly(on ? null : s.key)}
              className={cn('-my-0.5 flex h-6 items-center gap-1.5 rounded-md px-1.5 text-xs outline-none transition-[background-color,opacity] duration-fast hover:bg-fg/[0.05] focus-visible:ring-2 focus-visible:ring-ring/60',
                on ? 'bg-fg/[0.07] font-medium text-fg' : 'text-fg-muted', dim && 'opacity-45')}>
              <span aria-hidden className="size-2 rounded-[3px]" style={{ background: s.color }} />{s.label}
            </button>
          );
        })}
        {avg > 0 && (
          <span title={`Average ${avgUnit} with tracked time: ${avgFormat(avg)}`}
            className={cn('flex h-6 items-center gap-1.5 px-1.5 text-xs text-fg-muted tnum', series.length > 0 && 'ml-auto')}>
            <span aria-hidden className="w-3 border-t border-dashed border-fg-muted" />
            {AVG_WORD[avgUnit] || 'Average'}
            <span className="sr-only">: {avgFormat(avg)}</span>
          </span>
        )}
        {isolated && (
          <button type="button" onClick={() => setOnly(null)}
            className="flex h-6 items-center rounded-md px-1.5 text-xs font-medium text-fg-muted underline-offset-2 outline-none hover:text-fg hover:underline focus-visible:ring-2 focus-visible:ring-ring/60">
            Show all
          </button>
        )}
      </div>

      {/* The table lives in a clipped box: a bare sr-only table grows to its content and widens the page. */}
      <div className="sr-only">
        <table className="sr-only">
          <caption>{description}</caption>
          <tbody>
            {data.map(b => (
              <tr key={b.key}><th>{b.full}</th>{(detail || series).map(s => <td key={s.key}>{s.label}: {format(Number(b[s.key] || 0))}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
