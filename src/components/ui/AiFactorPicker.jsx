import { useEffect, useRef, useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { AI_FACTOR, MAX_AI_FACTOR, MIN_AI_FACTOR, validAiFactor } from '../../lib/billing.js';
import { cn } from '../../lib/cn.js';

// The quick picks. "Default" (no own factor: follow Settings) always comes first.
export const AI_FACTOR_PRESETS = [1.25, 1.5, 1.75, 2];

// "AI ×1.5" for one item. A set whose AI entries bill at different factors passes null: just "AI".
export const aiLabel = (f) => (f != null ? `AI ×${f}` : 'AI');

/** A typed factor ("1,3", "1.3", "×1.3") as a number from 1 to 5 (two decimals), or null. */
export function parseAiFactorInput(s) {
  const t = String(s ?? '').trim().replace(/^[×x*]\s*/i, '').replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return validAiFactor(t);
}

const chipBase = cn(
  'inline-flex h-7 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium tnum outline-none',
  'ring-1 ring-inset transition-[background-color,color,box-shadow] duration-fast ease-out focus-visible:ring-2 focus-visible:ring-ring/70',
);
const chipOn = 'bg-ai-soft font-semibold text-ai-text ring-ai/45';
const chipOff = 'text-fg-muted ring-line-strong/70 hover:bg-fg/[0.04] hover:text-fg hover:ring-line-strong';

/**
 * Choose the AI factor for one piece of work (an entry or a timer).
 * - value: the item's own factor, or null/undefined for Default (follow the setting in Settings).
 * - onChange(next): a number from 1 to 5, or null for Default.
 * - layout: 'grid' (two short rows, for menus and popovers) or 'row' (one line, for dialogs).
 * - menu: render inside a Radix DropdownMenu. Arrow up/down move on to the menu items around it,
 *   Tab moves within it, and picking keeps the menu open.
 * Presets are toggle buttons (aria-pressed); a custom value goes in the small field (a decimal comma
 * works: "1,3"). The field applies on Enter, on blur, and when the menu or popover closes.
 */
export function AiFactorPicker({ value, onChange, layout = 'grid', menu = false, label = 'AI factor', caption, className }) {
  const own = validAiFactor(value);
  const custom = own != null && !AI_FACTOR_PRESETS.includes(own);
  const [draft, setDraft] = useState(custom ? String(own) : '');
  const [bad, setBad] = useState(false);
  const editing = useRef(false);
  const rootRef = useRef(null);
  const shellRef = useRef(null);
  const latest = useRef(null);
  latest.current = { draft, own, onChange };

  // Show the stored custom value, unless the user is typing in the field right now.
  useEffect(() => {
    if (editing.current) return;
    setDraft(custom ? String(own) : '');
    setBad(false);
  }, [own, custom]);

  // A typed value still counts when the menu or popover closes before Enter or blur.
  useEffect(() => () => {
    if (!editing.current) return;
    const { draft: d, own: o, onChange: change } = latest.current;
    const n = parseAiFactorInput(d);
    if (n != null && n !== o) change(n);
  }, []);

  const choose = (v) => {
    setBad(false);
    setDraft(v != null && !AI_FACTOR_PRESETS.includes(v) ? String(v) : '');
    if (v !== own) onChange(v);
  };
  // Apply the field. Empty: nothing to apply. Returns false when the text is not a factor.
  const commit = () => {
    const { draft: d, own: o, onChange: change } = latest.current;
    if (!String(d).trim()) { setBad(false); setDraft(custom ? String(o) : ''); return true; }
    const n = parseAiFactorInput(d);
    if (n == null) { setBad(true); return false; }
    setBad(false);
    setDraft(AI_FACTOR_PRESETS.includes(n) ? '' : String(n));
    if (n !== o) change(n);
    return true;
  };

  const focusables = () => [...(rootRef.current?.querySelectorAll('button, input') || [])];
  // The control that holds the current choice: the pressed preset, or the field for a custom value.
  const focusCurrent = () => {
    const els = focusables();
    (els.find(el => el.getAttribute('aria-pressed') === 'true') || (custom ? els.find(el => el.tagName === 'INPUT') : null) || els[0])?.focus();
  };
  // In a menu: move to the menu item before (-1) or after (+1) the picker.
  const leave = (dir) => {
    const shell = shellRef.current;
    const menuEl = shell?.closest('[role=menu]');
    if (!menuEl) return;
    const items = [...menuEl.querySelectorAll('[data-radix-collection-item]')]
      .filter(n => n.closest('[role=menu]') === menuEl && !n.hasAttribute('data-disabled'));
    const next = items[items.indexOf(shell) + dir];
    next?.focus();
  };

  const onKeyDown = (e) => {
    // Inside a menu the picker owns its keys: no typeahead, and Tab is not swallowed. Escape still closes.
    if (menu && e.key !== 'Escape') e.stopPropagation();
    const els = focusables();
    const i = els.indexOf(document.activeElement);
    const inField = e.target.tagName === 'INPUT';
    if (!inField && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      els[Math.max(0, Math.min(els.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))]?.focus();
      return;
    }
    if (!menu) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); leave(e.key === 'ArrowDown' ? 1 : -1); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const n = i + (e.shiftKey ? -1 : 1);
      if (n < 0) leave(-1); else if (n >= els.length) leave(1); else els[n].focus();
    }
  };

  const grid = layout === 'grid';
  const chip = (v, text, title, extra) => {
    const on = v == null ? own == null : own === v;
    return (
      <button key={v == null ? 'default' : v} type="button" aria-pressed={on} title={title}
        onClick={() => choose(v)} className={cn(chipBase, on ? chipOn : chipOff, extra)}>
        {text}
      </button>
    );
  };

  const body = (
    <div ref={rootRef} role={menu ? undefined : 'group'} aria-label={menu ? undefined : label} onKeyDown={onKeyDown} className={className}>
      {caption && <div className="mb-1.5 text-2xs font-medium text-fg-subtle">{caption}</div>}
      <div className={grid ? 'grid grid-cols-4 gap-1' : 'flex flex-wrap items-center gap-1.5'}>
        {chip(null, <>Default <span className="font-normal opacity-80">(×{AI_FACTOR})</span></>,
          `Follow the setting in Settings (×${AI_FACTOR} now). Changes there re-price this work too.`, grid ? 'col-span-2' : 'px-2.5')}
        {AI_FACTOR_PRESETS.map(p => chip(p, `×${p}`, `Bill ×${p} of the tracked time`, grid ? undefined : 'px-2.5'))}
        <div className={cn('relative', grid ? 'col-span-2' : 'w-[5.5rem]')}>
          <span aria-hidden className={cn('pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs',
            custom && !bad ? 'text-ai-text' : 'text-fg-subtle')}>×</span>
          <input type="text" inputMode="decimal" value={draft} placeholder="Custom" autoComplete="off" spellCheck={false}
            aria-label={`Custom ${label}, from ${MIN_AI_FACTOR} to ${MAX_AI_FACTOR}`}
            aria-invalid={bad || undefined}
            title={`Your own factor, from ×${MIN_AI_FACTOR} to ×${MAX_AI_FACTOR}. A decimal comma works too (1,3).`}
            onFocus={() => { editing.current = true; }}
            onChange={(e) => { setDraft(e.target.value); if (bad) setBad(false); }}
            onBlur={() => { editing.current = false; commit(); }}
            onKeyDown={(e) => {
              // Enter applies the value. It must not submit a form or start a timer.
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); e.stopPropagation(); commit(); }
            }}
            className={cn(
              'h-7 w-full min-w-0 rounded-md bg-transparent pl-5 pr-2 text-xs font-medium text-fg tnum outline-none ring-1 ring-inset',
              'placeholder:font-normal placeholder:text-fg-subtle transition-[background-color,box-shadow] duration-fast ease-out',
              bad ? 'ring-danger/70' : custom ? 'bg-ai-soft font-semibold text-ai-text ring-ai/45' : 'ring-line-strong/70 hover:ring-line-strong',
              'focus:bg-surface focus:text-fg focus:shadow-focus focus:ring-ring/70',
            )} />
        </div>
      </div>
      {bad && <p role="alert" className="mt-1.5 text-2xs text-danger-text">Use a number from {MIN_AI_FACTOR} to {MAX_AI_FACTOR}, like 1,3.</p>}
    </div>
  );

  if (!menu) return body;
  // In a menu the picker is one stop in the arrow-key order. Focus that lands on it moves into the current
  // choice. The pointer never moves focus to it (that would pull focus out of the field while typing),
  // and picking never closes the menu.
  return (
    <Menu.Item asChild textValue="" onSelect={(e) => e.preventDefault()}
      onPointerMove={(e) => e.preventDefault()} onPointerLeave={(e) => e.preventDefault()}
      onFocus={(e) => { if (e.target === e.currentTarget) focusCurrent(); }}>
      <div ref={shellRef} role="group" aria-label={label} className="rounded-lg px-2.5 pb-2 pt-1 outline-none">{body}</div>
    </Menu.Item>
  );
}

/** A labelled panel around the picker for dialogs: "Factor" + one row of choices. */
export function AiFactorField({ value, onChange, noun = 'entry', className }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
      <span className="text-xs font-medium text-ai-text">Factor</span>
      <AiFactorPicker value={value} onChange={onChange} layout="row" label={`AI factor for this ${noun}`} />
    </div>
  );
}
