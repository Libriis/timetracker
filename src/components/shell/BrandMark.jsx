import { cn } from '../../lib/cn.js';

// App mark: a stopwatch glyph on the brand tile.
export function BrandMark({ size = 30, className }) {
  return (
    <span className={cn('relative grid shrink-0 place-items-center rounded-[9px] text-white shadow-brand', className)}
      style={{ width: size, height: size, background: 'linear-gradient(145deg, rgb(255 140 66), rgb(var(--brand)) 55%, rgb(214 72 0))' }}>
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none" aria-hidden>
        <circle cx="12" cy="13.5" r="7" stroke="currentColor" strokeWidth="2.2" />
        <path d="M12 13.5V9.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M10 3.2h4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="12" cy="13.5" r="1.4" fill="currentColor" />
      </svg>
    </span>
  );
}
