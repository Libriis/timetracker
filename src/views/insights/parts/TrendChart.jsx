import { Bar, CartesianGrid, ComposedChart, LabelList, Line, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { formatEUR, formatHM } from '../../../lib/format.js';
import { eurAxis, niceTicks } from '../../dashboard/reportData.js';

// Monthly net earnings as bars (value on top) with the effective €/h as a line on a second axis,
// in one chart. The € grid gets two extra steps on top; the €/h axis maps its two round ticks onto
// those top grid lines (dashed, blue), so the line runs in its own band above the bars: one chart,
// one hover and one tooltip, but the two measures never cross or crowd each other's labels.
// The €/h values sit in one row over that band, so no dashed line runs through them, and the line
// breaks at months without tracked time (no rate there). The current month shows what is earned
// so far plus a hatched forecast.
// data: [{ key, label, full, net, ms, rate, current, projectedExtra }]

const AXIS = { fill: 'rgb(var(--fg-subtle))', fontSize: 11, fontFamily: 'inherit' };
const BAR = 'rgb(var(--fg) / 0.84)';
const RATE = 'rgb(var(--invoiced))';
const AXIS_W = 46;
const RATE_W = 52;
const MARGIN = { top: 28, right: 0, bottom: 0, left: 0 }; // room for the €/h value row over the band
const GAP = '19%'; // per side: bars take about 60% of each month column

function Tip({ active, payload, projected, monthName }) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <div className="min-w-[210px] rounded-lg border border-line bg-surface-raised px-3 py-2.5 text-xs text-fg shadow-lg">
      <p className="mb-2 font-semibold">{m.full}{m.current ? ' so far' : ''}</p>
      <ul className="grid gap-1.5">
        <li className="flex justify-between gap-4"><span className="flex items-center gap-1.5 text-fg-muted"><span className="size-2 rounded-[3px]" style={{ background: BAR }} />Net earnings</span><span className="font-medium tnum">{formatEUR(m.net)}</span></li>
        {m.current && projected != null && (
          <li className="flex justify-between gap-4"><span className="flex items-center gap-1.5 text-fg-muted"><span className="size-2 rounded-[3px] border border-dashed border-fg/50" />Forecast for {monthName}</span><span className="font-medium tnum">{formatEUR(projected)}</span></li>
        )}
        <li className="flex justify-between gap-4"><span className="flex items-center gap-1.5 text-fg-muted"><span className="h-0.5 w-2.5 rounded" style={{ background: RATE }} />Effective rate</span><span className="font-medium tnum">{m.rate != null ? `${formatEUR(m.rate)}/h` : '–'}</span></li>
        <li className="flex justify-between gap-4 text-fg-subtle"><span>Tracked</span><span className="tnum">{formatHM(m.ms)} h</span></li>
      </ul>
    </div>
  );
}

// Soft column highlight behind the hovered month (a ComposedChart would draw Recharts' 1px #ccc line).
function ColumnCursor({ points, top, height, width, count }) {
  if (!points?.length || !count) return null;
  const band = width / count;
  const w = Math.max(8, band - 12);
  return <rect x={points[0].x - w / 2} y={top} width={w} height={height} rx={6} fill="rgb(var(--fg) / 0.05)" pointerEvents="none" />;
}

function TopLabel({ x, y, width, value, index, data }) {
  const m = data[index];
  const proj = m?.current && m.projectedExtra > 0;
  if (!m || !(m.net > 0 || proj)) return null;
  return (
    <text x={x + width / 2} y={y - 7} textAnchor="middle" fontSize={11} fontWeight={600} fill={proj ? 'rgb(var(--fg-muted))' : 'rgb(var(--fg))'} className="tnum">
      {proj ? `≈${eurAxis(m.net + m.projectedExtra)}` : eurAxis(value)}
    </text>
  );
}

const rateText = (v) => `€${v.toFixed(v >= 100 ? 0 : 1)}`;
const X_AXIS_H = 36;
// A €/h label's box around its baseline (11px Geist), and the room a dashed line keeps from it.
const LABEL_UP = 11;
const LABEL_DOWN = 4;
const LABEL_CLEAR = 2;

// The €/h values read as one row over the band, each above its month, just over the top dashed
// line: no dashed line ever runs through a label, and the numbers line up like a table row while
// the line below shows the shape. Returns the baseline for that row.
export function rateRowBaseline(topLineY) {
  return topLineY - LABEL_DOWN - LABEL_CLEAR - 3;
}
export const rateLabelBox = (base) => [base - LABEL_UP, base + LABEL_DOWN];

// Two round €/h values that bracket [lo, hi] tightly, at most two round steps apart:
// 30.8 – 39.8 -> [30, 40], 36.1 – 40.2 -> [35, 45], 30.8 alone -> [30, 31].
export function rateBounds(lo, hi) {
  for (const s of [1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 500]) {
    const a = Math.floor(lo / s) * s;
    let b = Math.ceil(hi / s) * s;
    if (b === a) b = a + s;
    if (b - a <= 2 * s + 1e-9) return [a, b];
  }
  return [Math.floor(lo), Math.ceil(hi) + 1];
}

export function TrendChart({ data, projected, monthName, height = 300 }) {
  const rows = data.map(m => ({ ...m, extra: m.current ? m.projectedExtra || 0 : 0 }));
  const maxNet = Math.max(0, ...rows.map(m => m.net + m.extra));
  const ticks = niceTicks(maxNet * 1.04);
  const top = ticks[ticks.length - 1];
  const step = ticks[1] - ticks[0];
  const rates = rows.map(m => m.rate).filter(r => r != null);
  const hasRate = rates.length > 0;
  // One free grid step above the bars for their labels, one more for the €/h band.
  const extTop = hasRate ? top + 2 * step : top;
  const allTicks = hasRate ? [...ticks, top + step, extTop] : ticks;
  const [rLo, rHi] = hasRate ? rateBounds(Math.min(...rates), Math.max(...rates)) : [0, 1];
  // rLo sits on the grid line at top + step and rHi on the top line; the axis is linear below that.
  const rDomain = [rLo - ((top + step) / step) * (rHi - rLo), rHi];
  // Pixel rows of the two dashed €/h lines (same geometry Recharts uses: margin top, x axis below).
  const plotH = Math.max(1, height - MARGIN.top - MARGIN.bottom - X_AXIS_H);
  const rateY = (v) => MARGIN.top + plotH * ((rDomain[1] - v) / (rDomain[1] - rDomain[0] || 1));
  const rowBase = rateRowBaseline(rateY(rHi));

  return (
    <div>
      <div role="img" aria-label="Net earnings and effective hourly rate per month" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={MARGIN} barCategoryGap={GAP}>
            <defs>
              <pattern id="tt-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="rgb(var(--fg) / 0.05)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="rgb(var(--fg) / 0.28)" strokeWidth="2" />
              </pattern>
            </defs>
            <CartesianGrid vertical={false} stroke="rgb(var(--line))" horizontalValues={ticks} />
            <XAxis dataKey="key" tickLine={false} axisLine={{ stroke: 'rgb(var(--line-strong))' }} interval={0} height={X_AXIS_H}
              tick={({ x, y, payload }) => {
                const m = rows[payload.index];
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text dy={13} textAnchor="middle" fontSize={11} fontWeight={m?.current ? 600 : 400} fill={m?.current ? 'rgb(var(--fg))' : 'rgb(var(--fg-subtle))'}>{m?.label}</text>
                    {m && (m.label === 'Jan' || payload.index === 0) && <text dy={26} textAnchor="middle" fontSize={10} fill="rgb(var(--fg-subtle))">{m.year}</text>}
                  </g>
                );
              }} />
            <YAxis tickLine={false} axisLine={false} tick={AXIS} width={AXIS_W} ticks={allTicks} domain={[0, extTop]} allowDataOverflow
              tickFormatter={(v) => (v <= top ? eurAxis(v) : '')} />
            <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} width={hasRate ? RATE_W : 8} domain={rDomain}
              ticks={hasRate ? [rLo, rHi] : []} allowDataOverflow
              tick={({ x, y, payload }) => (
                <text x={x + 6} y={y} dy={4} fontSize={11} fontWeight={500} fill="rgb(var(--invoiced-text))" className="tnum">{`€${payload.value}/h`}</text>
              )} />
            {hasRate && [rLo, rHi].map(v => <ReferenceLine key={v} yAxisId="r" y={v} stroke="rgb(var(--invoiced) / 0.35)" strokeDasharray="3 4" />)}
            <RTooltip cursor={<ColumnCursor count={rows.length} />} isAnimationActive={false}
              content={<Tip projected={projected} monthName={monthName} />} />
            <Bar dataKey="net" stackId="m" fill={BAR} maxBarSize={64} isAnimationActive={false}
              shape={(p) => {
                const r = p.payload.extra > 0 ? 0 : 4;
                const { x, y, width: w, height: h } = p;
                if (!(h > 0)) return null;
                return <path d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`} fill={BAR} />;
              }}>
              <LabelList dataKey="net" content={(p) => (rows[p.index]?.extra > 0 ? null : <TopLabel {...p} data={rows} />)} />
            </Bar>
            <Bar dataKey="extra" stackId="m" fill="url(#tt-hatch)" maxBarSize={64} isAnimationActive={false}
              shape={(p) => {
                const { x, y, width: w, height: h } = p;
                if (!(h > 0)) return null;
                return <path d={`M${x + 0.5},${y + h} V${y + 4} Q${x + 0.5},${y + 0.5} ${x + 4},${y + 0.5} H${x + w - 4} Q${x + w - 0.5},${y + 0.5} ${x + w - 0.5},${y + 4} V${y + h}`}
                  fill="url(#tt-hatch)" stroke="rgb(var(--fg) / 0.35)" strokeDasharray="3 3" />;
              }}>
              <LabelList dataKey="extra" content={(p) => (rows[p.index]?.extra > 0 ? <TopLabel {...p} data={rows} /> : null)} />
            </Bar>
            {hasRate && (
              // No connectNulls: a month without tracked time has no rate, so the line breaks there
              // instead of drawing a rate across it.
              <Line yAxisId="r" dataKey="rate" type="monotone" stroke={RATE} strokeWidth={2} isAnimationActive={false}
                dot={(p) => (p.value == null ? <g key={p.index} /> : (
                  <circle key={p.index} cx={p.cx} cy={p.cy} r={rows[p.index]?.current ? 3.75 : 3} fill={rows[p.index]?.current ? RATE : 'rgb(var(--surface))'} stroke={RATE} strokeWidth={2} />
                ))}
                activeDot={{ r: 4.5, fill: RATE, stroke: 'rgb(var(--surface))', strokeWidth: 2 }}>
                <LabelList dataKey="rate" content={({ x, y, value, index }) => (value == null ? null : (
                  <text x={x} y={rowBase} textAnchor="middle" fontSize={11} fontWeight={rows[index]?.current ? 600 : 500}
                    fill={rows[index]?.current ? 'rgb(var(--invoiced-text))' : 'rgb(var(--fg-muted))'} className="tnum">{rateText(value)}</text>
                ))} />
              </Line>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="sr-only">
        <table className="sr-only">
          <caption>Net earnings and effective hourly rate per month</caption>
          <tbody>{rows.map(m => <tr key={m.key}><th>{m.full}{m.current ? ' so far' : ''}</th><td>{formatEUR(m.net)}</td><td>{m.rate != null ? `${formatEUR(m.rate)} per hour` : 'no time'}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
