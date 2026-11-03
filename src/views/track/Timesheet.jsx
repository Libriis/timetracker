import { useMemo } from 'react';
import { Table2 } from 'lucide-react';
import { billingTotals, calcEarnings } from '../../lib/billing.js';
import { cn } from '../../lib/cn.js';
import { formatEUR, formatHM, isoDay, UI_LOCALE } from '../../lib/format.js';
import { ClientDot } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';

const MAX_DAYS = 14;
// 196 + 7 days × 44 + 84 = 588 px: a week fits the narrowest window (720 px) without sideways scroll.
const WORK_MIN = 196;

// Timesheet: one row per client · project · activity, one column per day of the chosen range,
// totals on the right and at the bottom. Read-only; saved entries only (running timers are on the cards above).
// Row amounts are per-row net (calcEarnings); the grand total comes from billingTotals (the money rule).
export function Timesheet({ entries, range, billing, onPickRange }) {
  const days = useMemo(() => {
    if (!range) return [];
    const out = [];
    const d = new Date(range.from); d.setHours(0, 0, 0, 0);
    const end = new Date(range.to); end.setHours(0, 0, 0, 0);
    while (d <= end && out.length <= MAX_DAYS) { out.push(new Date(d)); d.setDate(d.getDate() + 1); }
    return out;
  }, [range]);
  const tooLong = !range || days.length > MAX_DAYS;

  const sheet = useMemo(() => {
    if (tooLong) return null;
    const { rates, clientRates, rounding, clientRounding } = billing;
    const idx = new Map(days.map((d, i) => [isoDay(d), i]));
    const rows = new Map();
    const inRange = [];
    for (const e of entries) {
      const i = idx.get(isoDay(new Date(e.start)));
      if (i == null) continue;
      inRange.push(e);
      const key = `${e.client}|${e.project || ''}|${e.task}`;
      let r = rows.get(key);
      if (!r) { r = { key, client: e.client, project: e.project || '', task: e.task, cells: days.map(() => 0), total: 0, eur: 0 }; rows.set(key, r); }
      r.cells[i] += e.duration;
      r.total += e.duration;
      r.eur += calcEarnings(e, rates, clientRates, rounding, clientRounding);
    }
    const list = [...rows.values()].sort((a, b) => a.client.localeCompare(b.client) || b.total - a.total);
    const dayTotals = days.map((_, i) => list.reduce((s, r) => s + r.cells[i], 0));
    const total = dayTotals.reduce((s, x) => s + x, 0);
    const net = billingTotals(inRange, { rates, clientRates, vat: 0, clientVat: {}, rounding, clientRounding }).net;
    return { list, dayTotals, total, net };
  }, [entries, days, billing, tooLong]);

  if (tooLong) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface/60">
        <EmptyState icon={<Table2 />} title="Pick up to two weeks"
          description="The timesheet shows one column per day, so it needs a range of 14 days or less."
          action={onPickRange && <Button variant="secondary" size="sm" onClick={() => onPickRange({ period: 'week', from: '', to: '' })}>Show this week</Button>} />
      </div>
    );
  }
  if (!sheet.list.length) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface/60">
        <EmptyState icon={<Table2 />} title="Nothing tracked in these days" description="Pick other days with the arrows above." />
      </div>
    );
  }

  const todayKey = isoDay();
  const isToday = days.map(d => isoDay(d) === todayKey);
  // Fixed layout: the day and total columns keep their width, the Work column takes the rest but never
  // less than WORK_MIN (then the table scrolls sideways), so the activity, which sets the rate, stays whole.
  const cell = 'w-[44px] px-1 text-right tnum';
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: WORK_MIN + days.length * 44 + 84 }}>
          <caption className="sr-only">Hours per day for each client, project and activity</caption>
          <thead>
            <tr className="border-b border-line bg-surface-2/70 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
              <th scope="col" className="py-2.5 pl-4 pr-2 text-left font-semibold">Work</th>
              {days.map((d, i) => (
                <th key={i} scope="col" className={cn(cell, 'py-2 font-semibold', isToday[i] && 'bg-fg/[0.035] text-fg')}>
                  <span className="block">{d.toLocaleDateString(UI_LOCALE, { weekday: 'short' })}</span>
                  <span className={cn('block text-xs normal-case tracking-normal', isToday[i] ? 'font-semibold text-fg' : 'font-medium text-fg-muted')}>{d.getDate()}</span>
                </th>
              ))}
              <th scope="col" className="w-[84px] py-2.5 pl-2 pr-4 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sheet.list.map(r => (
              <tr key={r.key} className="transition-colors hover:bg-surface-2/60">
                <th scope="row" className="overflow-hidden py-2.5 pl-4 pr-2 text-left font-normal">
                  <span className="flex min-w-0 items-center gap-2" title={[r.client, r.project, r.task].filter(Boolean).join(' · ')}>
                    <ClientDot client={r.client} size={7} />
                    <span className="min-w-0 flex-1">
                      {/* Line 1: project, then its client in small type (the client gives way first). */}
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className={cn('min-w-[2.5rem] truncate font-medium', r.project ? 'text-fg' : 'text-fg-muted')}>{r.project || r.client}</span>
                        {r.project && <span className="min-w-[2rem] shrink-[3] truncate text-xs text-fg-subtle">{r.client}</span>}
                      </span>
                      {/* Line 2: the activity on its own. It sets the rate, so it never truncates. */}
                      <span data-activity className="block whitespace-nowrap text-xs text-fg-subtle">{r.task}</span>
                    </span>
                  </span>
                </th>
                {r.cells.map((ms, i) => (
                  <td key={i} className={cn(cell, isToday[i] && 'bg-fg/[0.035]', ms ? 'text-fg' : 'text-fg-faint')}>
                    {ms ? formatHM(ms) : <span aria-label="none">–</span>}
                  </td>
                ))}
                <td className="py-2.5 pl-2 pr-4 text-right tnum">
                  <span className="block font-semibold text-fg">{formatHM(r.total)}</span>
                  <span className="block text-xs text-fg-subtle">{formatEUR(r.eur)}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong/70 bg-surface-2/70">
              <th scope="row" className="py-2.5 pl-4 pr-2 text-left text-sm font-semibold text-fg">Total</th>
              {sheet.dayTotals.map((ms, i) => (
                <td key={i} className={cn(cell, 'font-semibold', isToday[i] && 'bg-fg/[0.035]', ms ? 'text-fg' : 'text-fg-faint')}>{ms ? formatHM(ms) : '–'}</td>
              ))}
              <td className="py-2.5 pl-2 pr-4 text-right tnum">
                <span className="block font-semibold text-fg">{formatHM(sheet.total)}</span>
                <span className="block text-xs text-fg-muted" title="Net, before VAT">{formatEUR(sheet.net)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
