import { cn } from '../../lib/cn.js';

export function DurationSlider({ durationMinutes, setDurationMinutes }) {
  const presets = [15, 30, 45, 60, 90, 120, 180, 240];
  const step = 5;
  const sliderMax = Math.max(480, Math.ceil(durationMinutes / 60) * 60);
  const safeMinutes = Math.max(0, Math.round(durationMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  const durationLabel = hours > 0
    ? (minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`)
    : `${minutes}m`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const m = f === 0 ? step : Math.round(sliderMax * f);
    return m < 60 ? `${m}m` : `${Math.round(m / 60 * 10) / 10}h`;
  });
  const fill = ((Math.min(sliderMax, Math.max(step, safeMinutes)) - step) / (sliderMax - step)) * 100;
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 flex items-end justify-between">
          <label className="text-xs font-medium text-fg-muted">Duration</label>
          <span className="text-xl font-semibold text-fg tnum">{durationLabel}</span>
        </div>
        <input type="range" min={step} max={sliderMax} step={step} value={Math.min(sliderMax, Math.max(step, safeMinutes))}
          onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10))}
          aria-label="Duration in minutes"
          className="tt-range w-full cursor-pointer"
          style={{ '--fill': `${fill}%` }} />
        <div className="mt-1 flex justify-between px-0.5 text-2xs text-fg-subtle tnum">
          {ticks.map((t, i) => <span key={i}>{t}</span>)}
        </div>
      </div>
      <div>
        <div className="mb-2 text-xs font-medium text-fg-muted">Quick presets</div>
        <div className="flex flex-wrap gap-1.5">
          {presets.map(m => {
            const label = m >= 60 ? `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}m` : ''}` : `${m}m`;
            const on = safeMinutes === m;
            return (
              <button key={m} type="button" onClick={() => setDurationMinutes(m)} aria-pressed={on}
                className={cn('h-7 rounded-md border px-2.5 text-xs font-medium outline-none transition-colors duration-fast tnum focus-visible:ring-2 focus-visible:ring-ring/50',
                  on ? 'border-primary bg-primary text-primary-fg' : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg')}>
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
