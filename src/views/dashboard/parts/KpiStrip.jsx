import { cn } from '../../../lib/cn.js';
import { Delta } from './Delta.jsx';

// A row of headline numbers in one card, split by hairlines. Each tile: label + change pill,
// a big tabular value, one quiet line under it. Optional footer strip for context notes.
// tiles: [{ id, label, value, unit, delta, goodWhen, hint, sub, action, emphasis }]
export function KpiStrip({ tiles, footer, className }) {
  const n = tiles.length;
  return (
    <section aria-label="Summary" className={cn('overflow-hidden rounded-xl border border-line bg-surface shadow-card', className)}>
      {/* Hairlines: every tile draws its left and top border; the -1px offset hides the outer ones. */}
      {/* Five tiles: one row when wide; 3 + 2 (no empty cell) on a 6-column grid in between; pairs on phones. */}
      <div className={cn('-ml-px -mt-px grid grid-cols-2',
        n === 5 ? 'sm:grid-cols-6 min-[1180px]:grid-cols-5' : n === 4 ? 'lg:grid-cols-4' : 'sm:grid-cols-3')}>
        {tiles.map((t, i) => (
          <div key={t.id}
            className={cn('relative min-w-0 border-l border-t border-line px-5 py-4', t.emphasis && 'bg-surface-2/60',
              n === 5 && (i < 3 ? 'sm:col-span-2' : 'sm:col-span-3'), n === 5 && 'min-[1180px]:col-span-1',
              n % 2 === 1 && i === n - 1 && 'max-sm:col-span-2')}>
            <div className="flex h-5 items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-fg-subtle">
                {t.icon && <span aria-hidden className="flex shrink-0 [&_svg]:size-3.5">{t.icon}</span>}
                {t.label}
              </span>
              {t.action ?? <Delta value={t.delta} goodWhen={t.goodWhen} hint={t.hint} />}
            </div>
            <div className="mt-2 flex items-baseline gap-1 truncate text-[26px] font-semibold leading-8 tracking-[-0.02em] text-fg tnum">
              {t.value}
              {t.unit && <span className="text-base font-medium tracking-normal text-fg-subtle">{t.unit}</span>}
            </div>
            <div className="mt-1 flex min-h-4 min-w-0 items-center gap-1.5 truncate text-xs text-fg-subtle tnum">{t.sub}</div>
          </div>
        ))}
      </div>
      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-line bg-surface-2/50 px-5 py-2 text-xs text-fg-subtle">
          {footer}
        </div>
      )}
    </section>
  );
}
