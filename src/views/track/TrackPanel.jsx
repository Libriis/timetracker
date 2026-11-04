import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Command as CommandIcon, Maximize2, MoreHorizontal, Play, Plus, Sparkles, X } from 'lucide-react';
import { AI_FACTOR, validAiFactor } from '../../lib/billing.js';
import { cn } from '../../lib/cn.js';
import { AiFactorPicker } from '../../components/ui/AiFactorPicker.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/DropdownMenu.jsx';
import { Kbd } from '../../components/ui/Kbd.jsx';
import { Tooltip } from '../../components/ui/Tooltip.jsx';
import { ContextPicker } from './ContextPicker.jsx';
import { naturalWidth } from './measure.js';

const tipKbd = 'border-canvas/25 bg-transparent text-canvas/75';
// The description must keep at least this much room on the bar; below it the chip moves to a second line.
const MIN_INPUT_PX = 260;
const HINT_PX = 100;
// Fixed parts of the bar: Start (48) + ⋯ (40) + two gaps (20); inside the field: padding (22), divider (13), gaps (12).
const BAR_FIXED_PX = 108;
const FIELD_FIXED_PX = 47;

// Orange = start / record. This round play button is the only filled orange control on the page.
// The second click of a double-click is ignored here (and any start within 600 ms in TrackView).
function StartButton({ onStart }) {
  return (
    <Tooltip content="Start timer" shortcut={<Kbd className={tipKbd}>Enter</Kbd>}>
      <button type="button" onClick={(e) => { if (e.detail > 1) { e.currentTarget.blur(); return; } onStart(); }} aria-label="Start timer"
        className={cn(
          'grid size-12 shrink-0 place-items-center rounded-full bg-brand text-brand-fg shadow-brand outline-none transition-[background-color,transform,box-shadow] duration-fast ease-out',
          'hover:scale-[1.04] hover:bg-brand-hover active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        )}>
        <Play className="ml-0.5 size-5" fill="currentColor" strokeWidth={0} />
      </button>
    </Tooltip>
  );
}

// The timer composer: [ What are you working on?   ● Client · Activity ▾ ] (▶) (⋯)
// The description field is the main control. Client, activity and project sit in one chip inside it,
// Start follows right after, and the rare switches (AI ×1.5, manual entry) live in the ⋯ menu.
// With AI on, the ⋯ menu also picks the next timer's AI factor (aiAssistedFactor, null = Default).
// Form state lives in App; this component only renders it. The ref exposes focus() for the N shortcut.
export const TrackPanel = forwardRef(function TrackPanel({
  clients, tasks, selectedClient, setSelectedClient, selectedTask, setSelectedTask, project, setProject, note, setNote,
  aiAssisted, setAiAssisted, aiAssistedFactor, setAiAssistedFactor, onStart, onAddManualEntry, projectIndex, lastTask, pairs, onOpenPalette, onOpenFocus, canFocus,
}, ref) {
  const aiF = validAiFactor(aiAssistedFactor) ?? AI_FACTOR; // the factor the next timer bills at
  // AI off also forgets the picked factor: the next time AI goes on, it starts at Default.
  const setAi = (on) => { setAiAssisted(on); if (!on) setAiAssistedFactor?.(null); };
  const inputRef = useRef(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);
  // The description dominates. When the chip (long client, activity and project) and the AI tag would
  // leave it less than MIN_INPUT_PX, the chip moves to a second line inside the field, so client,
  // activity and project stay readable and the description keeps the full width. The "Enter to start"
  // hint shows only where it fits next to a roomy description.
  const barRef = useRef(null);
  const barWidth = useRef(0);
  const [layout, setLayout] = useState({ stacked: false, hint: true });
  const measure = useCallback(() => {
    const bar = barRef.current;
    if (!bar || !barWidth.current) return;
    const chip = bar.querySelector('[data-ctx-chip]');
    const ai = bar.querySelector('[data-ai-tag]');
    const room = barWidth.current - BAR_FIXED_PX - FIELD_FIXED_PX - (chip ? naturalWidth(chip) : 0) - (ai ? ai.getBoundingClientRect().width + 4 : 0);
    const next = { stacked: room < MIN_INPUT_PX, hint: room - HINT_PX >= MIN_INPUT_PX + 100 };
    setLayout(l => (l.stacked === next.stacked && l.hint === next.hint ? l : next));
  }, []);
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return undefined;
    const cs = getComputedStyle(el);
    barWidth.current = el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    measure();
    let alive = true;
    document.fonts?.ready?.then(() => { if (alive) measure(); });
    if (typeof ResizeObserver === 'undefined') return () => { alive = false; };
    const ro = new ResizeObserver(([entry]) => { barWidth.current = entry.contentRect.width; measure(); });
    ro.observe(el);
    return () => { alive = false; ro.disconnect(); };
  }, [measure]);
  // New client, activity, project or AI tag: measure again before paint.
  useLayoutEffect(() => { measure(); }, [measure, selectedClient, selectedTask, project, aiAssisted, aiF]);
  const { stacked } = layout;
  const typed = note.trim().length > 0;
  const start = (viaKeyboard) => {
    onStart();
    // After a keyboard start, leave the field so S, Space and F act on the new timer.
    if (viaKeyboard) inputRef.current?.blur();
  };
  return (
    <div className="border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div ref={barRef} className="mx-auto flex w-full max-w-[1240px] items-center gap-2.5 px-5 py-3 sm:px-8">
        {/* The field: click anywhere outside a control to type. */}
        <div
          onMouseDown={(e) => {
            // React bubbles events from the portaled picker through this wrapper. Only real clicks on the
            // field's own empty space move focus; anything else (the picker, its rows) is left alone.
            if (!e.currentTarget.contains(e.target)) return;
            if (e.target.closest('button, input, a, [role=option], [role=tab]')) return;
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className={cn(
            'flex min-w-0 flex-1 cursor-text items-center gap-1 rounded-xl bg-canvas pl-4 pr-1.5 ring-1 ring-inset ring-line-strong/70',
            stacked ? 'flex-wrap pb-1 pt-1.5' : 'h-12',
            'transition-[background-color,box-shadow] duration-fast ease-out hover:ring-line-strong',
            'focus-within:bg-surface focus-within:shadow-focus focus-within:ring-ring/60 hover:focus-within:ring-ring/60',
          )}>
          <input ref={inputRef} id="track-note" value={note} onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && !e.repeat) start(true);
              else if (e.key === 'Escape') e.currentTarget.blur();
            }}
            placeholder="What are you working on?" aria-label="What are you working on?" aria-keyshortcuts="N"
            autoComplete="off" spellCheck={false}
            className={cn('peer min-w-0 flex-1 bg-transparent text-lg font-medium text-fg outline-none placeholder:font-normal placeholder:text-fg-muted',
              stacked ? 'h-9' : 'h-full')} />
          {!layout.hint && !stacked ? null : typed ? (
            <span aria-hidden className="mr-1 hidden shrink-0 items-center gap-1.5 text-xs text-fg-subtle md:flex">
              <Kbd>Enter</Kbd> to start
            </span>
          ) : (
            <span aria-hidden className="mr-1 hidden shrink-0 items-center gap-1 text-xs text-fg-subtle peer-focus:hidden xl:flex">
              <Kbd>N</Kbd>
            </span>
          )}
          {stacked && <span aria-hidden className="basis-full" />}
          {aiAssisted && (
            <Tooltip content={`AI-assisted: bills ×${aiF} of the tracked time. Click to turn off.`}>
              <button type="button" data-ai-tag="" onClick={() => setAi(false)} aria-label={`AI-assisted ×${aiF} is on. Turn off`}
                className="group/ai inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-ai-soft pl-2 pr-1.5 text-xs font-medium text-ai-text outline-none transition-colors hover:bg-ai/15 focus-visible:ring-2 focus-visible:ring-ring/60">
                <Sparkles className="size-3.5" /> <span className="tnum">AI ×{aiF}</span>
                <X className="size-3 opacity-60 group-hover/ai:opacity-100" />
              </button>
            </Tooltip>
          )}
          {!stacked && <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-line-strong/80" />}
          <ContextPicker clients={clients} tasks={tasks}
            client={selectedClient} setClient={setSelectedClient}
            task={selectedTask} setTask={setSelectedTask}
            project={project} setProject={setProject}
            projectIndex={projectIndex} lastTask={lastTask} pairs={pairs}
            onDone={() => inputRef.current?.focus()}
            className={stacked ? cn('h-8 shrink', aiAssisted ? 'ml-1' : '-ml-2.5 max-w-[calc(100%+0.625rem)]') : 'max-w-[66%] shrink'} />
        </div>
        <StartButton onStart={() => start(false)} />
        <DropdownMenu>
          <Tooltip content={`More: AI ×${aiF}, past entry, search`}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More timer options"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Next timer</DropdownMenuLabel>
            {/* Turning AI on keeps the menu open, so the factor picker shows right under the switch. */}
            <DropdownMenuCheckboxItem checked={aiAssisted} onCheckedChange={(v) => setAi(!!v)} className="h-auto items-start py-2"
              onSelect={(ev) => { if (!aiAssisted && setAiAssistedFactor) ev.preventDefault(); }}>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium"><Sparkles className="!size-3.5 !text-ai-text" /> AI-assisted, bill ×{aiF}</span>
                <span className="mt-0.5 block text-xs text-fg-subtle">For work where AI did part of the job.</span>
              </span>
            </DropdownMenuCheckboxItem>
            {aiAssisted && setAiAssistedFactor && (
              <AiFactorPicker menu value={aiAssistedFactor} onChange={setAiAssistedFactor}
                label="AI factor for the next timer" caption="Factor" />
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onAddManualEntry} shortcut="M"><Plus /> Add a past entry by hand</DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenPalette} shortcut="K"><CommandIcon /> Start recent work…</DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenFocus} disabled={!canFocus} shortcut="F"><Maximize2 /> Focus mode</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});
