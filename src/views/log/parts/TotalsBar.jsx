import { CheckCheck, Gift, Info, ReceiptText, Undo2 } from 'lucide-react';
import { aiLabel } from '../../../components/ui/AiFactorPicker.jsx';
import { cn } from '../../../lib/cn.js';
import { formatEUR } from '../../../lib/format.js';
import { Amount, Trend } from '../../../components/ui/Stat.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Tooltip } from '../../../components/ui/Tooltip.jsx';
import { hoursMinutes } from '../logModel.js';

const MIN = 60000;
const pct = (a, b) => (b > 0 ? (a - b) / b : null);
const hm = (ms) => `${hoursMinutes(ms)} h`;

// A quiet line under a number. With a tooltip it becomes focusable, so the detail is reachable by keyboard.
function Note({ children, tip }) {
  if (!tip) return <span className="min-w-0 truncate">{children}</span>;
  return (
    <Tooltip content={tip}>
      <span tabIndex={0} className="min-w-0 cursor-help truncate rounded-sm underline decoration-fg/20 decoration-dotted underline-offset-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
        {children}
      </span>
    </Tooltip>
  );
}

// One KPI cell: caps label, big tabular value, a context line, and the change against the period
// before (on every cell or on none, so the four cells stay the same height).
function Kpi({ label, value, unit, sub, subTip, trend, hero = false, className }) {
  return (
    <div className={cn('min-w-0 px-5 pb-4 pt-[18px]', className)}>
      <div className="truncate text-2xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">{label}</div>
      {/* leading-none must come after the size: tailwind-merge drops it when a text-* size follows. */}
      <div className={cn('mt-2 flex h-8 items-end gap-1 whitespace-nowrap font-semibold text-fg tnum', hero ? 'text-[28px] tracking-[-0.02em]' : 'text-2xl', 'leading-none')}>
        {value}
        {unit && <span className="pb-px text-sm font-medium leading-none tracking-normal text-fg-subtle">{unit}</span>}
      </div>
      <div className="mt-2 flex min-h-4 items-center text-xs text-fg-subtle tnum"><Note tip={subTip}>{sub}</Note></div>
      {trend !== undefined && <div className="mt-1 flex min-h-4 items-center text-xs tnum">{trend}</div>}
    </div>
  );
}

// "+52:17 h incl. AI ×1.5": why billable time differs from tracked time, in a few words.
// The factor shows when every billed AI entry shares it (t.aiFactor), else just "AI".
function billableNote(t) {
  const diff = t.billableMs - t.ms;
  if (Math.abs(diff) < MIN) return 'Same as tracked';
  const h = `${diff > 0 ? '+' : '−'}${hm(Math.abs(diff))}`;
  if (diff > 0) return t.aiExtraMs >= MIN ? `${h} incl. ${aiLabel(t.aiFactor)}` : `${h} from rounding`;
  return t.freeMs >= MIN ? `${h}, free work` : `${h} vs tracked`;
}
function billableTip(t) {
  const parts = [];
  if (t.aiExtraMs >= MIN) parts.push(`${aiLabel(t.aiFactor)} adds ${hm(t.aiExtraMs)}.`);
  if (t.roundingMs >= MIN) parts.push(`Rounding adds ${hm(t.roundingMs)}.`);
  if (t.freeMs >= MIN) parts.push(`Free work (${hm(t.freeMs)}) is not billed.`);
  return parts.length ? `Billable = tracked ${hm(t.ms)}. ${parts.join(' ')}` : null;
}

// Totals for the current filter: what was tracked, what bills, and what is left to invoice.
// Every amount is billingTotals of its own entries (see summarize in logModel.js).
export function TotalsBar({ totals: t, prev, onBulkInvoiced, onOpenLines, className }) {
  const allInvoiced = t.count > 0 && t.invoicedCount === t.count;
  const noneInvoiced = t.invoicedCount === 0;
  const heroLabel = noneInvoiced ? 'To invoice incl. VAT' : allInvoiced ? 'Invoiced incl. VAT' : 'Total incl. VAT';
  const perHour = t.billableMs > 0 ? t.net / (t.billableMs / 3600000) : 0;
  const parts = t.invoicedGross + t.unbilledGross;
  const share = parts > 0 ? Math.round((t.invoicedGross / parts) * 100) : (allInvoiced ? 100 : 0);
  const trend = (a, b) => {
    if (!prev) return undefined;
    const v = pct(a, b);
    // Zero before (all free, say): no percentage to show, so say it in words.
    return v == null
      ? <span className="text-fg-subtle">{a > 0 ? 'New' : 'Same'} {prev.label}</span>
      : <Trend value={v} label={prev.label} />;
  };
  const off = Math.abs(t.splitDiff) >= 0.005;
  const splitText = off
    ? `Invoiced + Unbilled is ${formatEUR(Math.abs(t.splitDiff))} ${t.splitDiff > 0 ? 'more' : 'less'} than the total of ${formatEUR(t.gross)}: each part rounds its VAT on its own.`
    : '';

  return (
    <section aria-label="Totals for the shown entries" className={cn('rounded-xl border border-line bg-surface shadow-card', className)}>
      <div className="grid grid-cols-2 lg:grid-cols-[1fr_1fr_1.1fr_1.25fr]">
        <Kpi label="Tracked" value={hoursMinutes(t.ms)} unit="h" trend={trend(t.ms, prev?.ms)}
          sub={`${t.count.toLocaleString('en-US')} ${t.count === 1 ? 'entry' : 'entries'} · ${t.dayCount} ${t.dayCount === 1 ? 'day' : 'days'}`} />
        <Kpi label="Billable" value={hoursMinutes(t.billableMs)} unit="h" trend={trend(t.billableMs, prev?.billableMs)}
          sub={billableNote(t)} subTip={billableTip(t)} className="border-l border-line" />
        <Kpi label="Net" value={<Amount value={t.net} />} trend={trend(t.net, prev?.net)}
          sub={perHour > 0 ? `${formatEUR(perHour)} per billable hour` : 'No billable time'}
          className="border-t border-line lg:border-l lg:border-t-0" />
        <Kpi hero label={heroLabel} value={<Amount value={t.gross} />} trend={trend(t.gross, prev?.gross)}
          sub={`incl. ${formatEUR(t.vat)} VAT`}
          className="border-l border-t border-line bg-fg/[0.022] lg:rounded-tr-xl lg:border-t-0" />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-5 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-2">
          <Tooltip content={`${share}% of the amount incl. VAT is invoiced`}>
            <div className="flex items-center gap-2.5">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-fg/[0.08]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share} aria-label="Share of the amount invoiced">
                <div className="h-full rounded-full bg-invoiced transition-[width] duration-slow ease-out" style={{ width: `${share}%` }} />
              </div>
              <span className="whitespace-nowrap text-sm text-fg-muted"><span className="font-semibold text-fg tnum">{share}%</span> invoiced</span>
            </div>
          </Tooltip>
          <span aria-hidden className="hidden h-4 w-px bg-line lg:block" />
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-invoiced" />
              <dt className="text-fg-subtle">Invoiced</dt>
              <dd className="font-medium text-fg tnum">{formatEUR(t.invoicedGross)}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-unbilled" />
              <dt className="text-fg-subtle">Unbilled</dt>
              <dd className="font-medium text-fg tnum">{formatEUR(t.unbilledGross)}</dd>
            </div>
            {off && (
              <div className="-ml-3 flex items-center">
                <dt className="sr-only">Rounding</dt>
                <dd>
                  <Tooltip content={splitText}>
                    <span tabIndex={0} role="img" aria-label={splitText}
                      className="grid size-5 cursor-help place-items-center rounded-full text-fg-subtle outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60">
                      <Info className="size-3.5" aria-hidden />
                    </span>
                  </Tooltip>
                </dd>
              </div>
            )}
            {t.freeCount > 0 && (
              <Tooltip content={`Complimentary work, billed at €0. Standard value ${formatEUR(t.freeValue)}.`}>
                <div className="flex items-center gap-1.5 text-free-text">
                  <Gift className="size-3.5" aria-hidden />
                  <dt className="sr-only">Complimentary</dt>
                  <dd className="font-medium tnum">{t.freeCount} free</dd>
                </div>
              </Tooltip>
            )}
          </dl>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip content={allInvoiced ? `Mark the ${t.count} shown entries as unbilled` : `Mark the ${t.count - t.invoicedCount} unbilled entries shown as invoiced`}>
            <Button variant="ghost" size="sm" onClick={() => onBulkInvoiced(!allInvoiced)}>
              {allInvoiced ? <><Undo2 /> Mark all unbilled</> : <><CheckCheck /> Mark all invoiced</>}
            </Button>
          </Tooltip>
          <Button variant="secondary" size="sm" onClick={onOpenLines}><ReceiptText /> Invoice lines</Button>
        </div>
      </div>
    </section>
  );
}
