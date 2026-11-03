import { cn } from '../../../lib/cn.js';
import { formatEUR } from '../../../lib/format.js';
import { SectionLabel } from '../../../components/ui/Card.jsx';

// Unbilled work by age as one split bar with the amounts under it. ages from buildInsights().unbilled.ages.
const TONE = { fresh: 'bg-fg/30', aging: 'bg-warning', old: 'bg-danger' };

export function UnbilledAge({ ages, total, className }) {
  if (!(total > 0)) return null;
  return (
    <div className={cn('px-5 py-4', className)}>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <SectionLabel>Unbilled by age</SectionLabel>
        <span className="text-xs font-semibold text-fg tnum">{formatEUR(total)}</span>
      </div>
      <div role="img" aria-label={ages.map(a => `${a.label}: ${formatEUR(a.net)}`).join(', ')} className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        {ages.filter(a => a.net > 0).map(a => (
          <span key={a.id} className={cn('h-full first:rounded-l-full last:rounded-r-full', TONE[a.id])} style={{ width: `${(a.net / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-3">
        {ages.map(a => (
          <li key={a.id} className="min-w-0">
            <div className="flex items-center gap-1.5 text-2xs text-fg-subtle"><span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', TONE[a.id])} />{a.label}</div>
            <div className={cn('mt-0.5 truncate text-sm font-semibold tnum', a.net > 0 ? 'text-fg' : 'text-fg-subtle')}>{formatEUR(a.net)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
