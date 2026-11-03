import { CheckCircle2, Clock3, Gift, TrendingDown } from 'lucide-react';
import { cn } from '../../../lib/cn.js';
import { formatEUR, formatHM } from '../../../lib/format.js';
import { ClientDot } from '../../../components/ui/Badge.jsx';
import { Tooltip } from '../../../components/ui/Tooltip.jsx';

// "Needs attention": old unbilled work, clients paying below the studio average, a lot of free work.
// items come from buildInsights().attention.
const KIND = {
  unbilled: { icon: Clock3, tone: 'bg-warning-soft text-warning-text', what: 'Unbilled for 30+ days' },
  rate: { icon: TrendingDown, tone: 'bg-danger-soft text-danger-text', what: 'Low rate, last 12 months' },
  free: { icon: Gift, tone: 'bg-free-soft text-free-text', what: 'Free work, last 90 days' },
};

export function Attention({ items }) {
  if (!items.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <CheckCircle2 className="mb-3 size-6 text-free-text" />
        <div className="text-sm font-semibold text-fg">Nothing needs a look</div>
        <p className="mt-1 max-w-[16rem] text-sm text-fg-subtle">No old unbilled work and no client far below your average rate.</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {items.map(it => {
        const k = KIND[it.kind];
        const Icon = k.icon;
        const value = it.kind === 'rate' ? `${formatEUR(it.value)}/h` : formatEUR(it.value);
        const side = it.kind === 'unbilled' ? `${it.days} days old` : it.kind === 'rate' ? `${Math.round(it.gap * 100)}% vs avg`.replace('-', '−') : `${formatHM(it.ms)} h`;
        const hint = it.kind === 'unbilled' ? `${value} of ${it.client} work is still unbilled. The oldest entry is ${it.days} days old.`
          : it.kind === 'rate' ? `${it.client} paid ${value} over the last 12 months, ${Math.abs(Math.round(it.gap * 100))}% below your average.`
          : `${formatHM(it.ms)} h of complimentary work for ${it.client} in 90 days, worth ${value} at standard rates.`;
        return (
          <Tooltip key={it.id} content={hint} side="left">
            <li tabIndex={0} className="flex items-center gap-3 px-5 py-2.5 outline-none transition-colors hover:bg-fg/[0.025] focus-visible:bg-fg/[0.04]">
              <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg [&_svg]:size-3.5', k.tone)}><Icon aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <ClientDot client={it.client} size={7} />
                  <span className="truncate text-sm font-medium text-fg">{it.client}</span>
                </div>
                <div className="truncate text-xs text-fg-subtle">{k.what}</div>
              </div>
              <div className="shrink-0 text-right tnum">
                <div className="text-sm font-semibold text-fg">{value}</div>
                <div className="text-xs text-fg-subtle">{side}</div>
              </div>
            </li>
          </Tooltip>
        );
      })}
    </ul>
  );
}
