import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';

const OPTIONS = [
  { value: 'system', label: 'System', hint: 'Follows your OS', icon: Monitor },
  { value: 'light', label: 'Light', hint: 'Bright and crisp', icon: Sun },
  { value: 'dark', label: 'Dark', hint: 'Easy at night', icon: Moon },
];

// Theme picker. Stored as a UI preference (tracker:ui:theme), never in backups.
export function AppearanceCard({ themePref = 'system', onThemeChange }) {
  return (
    <Card>
      <CardHeader title="Theme" description="Pick how the app looks on this device." />
      <CardBody>
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
          {OPTIONS.map(o => {
            const on = themePref === o.value;
            return (
              <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onThemeChange && onThemeChange(o.value)}
                className={cn('relative rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
                  on ? 'border-fg/40 bg-surface-2 ring-1 ring-fg/10' : 'border-line hover:bg-surface-2')}>
                <div className={cn('mb-3 h-14 overflow-hidden rounded-lg border border-line',
                  o.value === 'dark' ? 'bg-[#16161a]' : o.value === 'light' ? 'bg-[#f5f5f3]' : 'bg-[linear-gradient(110deg,#f5f5f3_50%,#16161a_50%)]')}>
                  <div className="flex h-full gap-1.5 p-2">
                    <div className={cn('w-4 rounded', o.value === 'dark' ? 'bg-white/10' : 'bg-black/[0.06]')} />
                    <div className="flex flex-1 flex-col gap-1">
                      <div className={cn('h-2 w-2/3 rounded', o.value === 'dark' ? 'bg-white/20' : 'bg-black/10')} />
                      <div className={cn('h-2 w-1/3 rounded', o.value === 'dark' ? 'bg-white/45' : 'bg-black/30')} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-fg"><o.icon className="size-3.5 text-fg-subtle" />{o.label}</div>
                <div className="text-xs text-fg-subtle">{o.hint}</div>
                {on && <span className="absolute right-2.5 top-2.5 grid size-5 place-items-center rounded-full bg-primary text-primary-fg"><Check className="size-3" strokeWidth={3} /></span>}
              </button>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
