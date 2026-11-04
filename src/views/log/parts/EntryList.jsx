import { memo, useEffect, useRef } from 'react';
import { Check, CheckCheck, MoreHorizontal, Pencil, Play, Sparkles, SquareCheck, StickyNote, Trash2, Undo2 } from 'lucide-react';
import { entryAiFactor } from '../../../lib/billing.js';
import { cn } from '../../../lib/cn.js';
import { formatClock, formatEUR, formatTime } from '../../../lib/format.js';
import { Badge, ClientDot } from '../../../components/ui/Badge.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Checkbox } from '../../../components/ui/Checkbox.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../../components/ui/DropdownMenu.jsx';
import { Tooltip } from '../../../components/ui/Tooltip.jsx';
import { dayLabel } from '../logModel.js';

// One grid for day headers and rows, so every number sits in the same column on the page.
// Wide: select | entry | time range | duration | amount. Row actions take the time range's place on hover
// (like a mail list), so the amounts sit flush right. Narrow: the time range moves into the entry and
// the actions get their own column.
export const ROW_GRID = 'grid items-center gap-x-3 grid-cols-[18px_minmax(0,1fr)_84px_92px_32px] min-[1180px]:grid-cols-[18px_minmax(0,1fr)_112px_88px_104px]';
const AT = 'min-[1180px]:row-start-1';
export const COL = {
  select: `min-[1180px]:col-start-1 ${AT}`,
  main: `min-[1180px]:col-start-2 ${AT}`,
  time: `hidden min-[1180px]:block min-[1180px]:col-start-3 ${AT}`,
  actions: `min-[1180px]:col-start-3 ${AT}`,
  duration: `min-[1180px]:col-start-4 ${AT}`,
  amount: `min-[1180px]:col-start-5 ${AT}`,
};

const Sep = () => <span aria-hidden className="text-fg-faint">·</span>;

function timeRange(e) {
  const multiDay = new Date(e.start).toDateString() !== new Date(e.end).toDateString();
  return `${formatTime(e.start)} – ${formatTime(e.end)}${multiDay ? ' +1' : ''}`;
}

// The note, editable in place: click (or press N on the row), type, Enter saves, Esc cancels.
function NoteCell({ entry, editing, canEdit, onStart, onCommit, onCancel }) {
  const ref = useRef(null);
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);
  if (editing) {
    return (
      <input ref={ref} defaultValue={entry.note || ''} aria-label="Note" placeholder="What did you do?"
        onClick={(ev) => ev.stopPropagation()}
        onKeyDown={(ev) => {
          ev.stopPropagation();
          if (ev.key === 'Enter') { ev.preventDefault(); onCommit(ev.currentTarget.value); }
          else if (ev.key === 'Escape') { ev.preventDefault(); onCancel(); }
        }}
        onBlur={(ev) => onCommit(ev.currentTarget.value)}
        className="-my-1 -ml-1.5 h-7 w-full min-w-0 max-w-[28rem] rounded-md border border-ring/60 bg-surface px-1.5 text-base font-medium text-fg shadow-focus outline-none placeholder:font-normal placeholder:text-fg-subtle" />
    );
  }
  const label = entry.note || (canEdit ? 'Add a note' : 'No note');
  if (!canEdit) return <span className={cn('truncate text-base', entry.note ? 'font-medium text-fg' : 'text-fg-subtle')}>{label}</span>;
  return (
    <button type="button" tabIndex={-1} onClick={(ev) => { ev.stopPropagation(); onStart(); }} title="Edit note"
      className={cn('min-w-0 truncate rounded text-left text-base outline-none decoration-fg/30 underline-offset-[3px] hover:underline',
        entry.note ? 'font-medium text-fg' : 'text-fg-subtle')}>
      {label}
    </button>
  );
}

export const EntryRow = memo(function EntryRow({
  e, f, active, selected, selecting, editingNote, canEditNote,
  onActivate, onToggleSelect, onEdit, onStartNote, onCommitNote, onCancelNote, onToggleInvoiced, onResume, onDelete,
}) {
  const showBillable = f.billableMs !== e.duration;
  const tab = active ? 0 : -1;
  const onRowClick = (ev) => {
    if (ev.target.closest('button, input, a, [role="checkbox"], [role="menuitem"]')) return;
    onActivate(e.id);
    onEdit(e);
  };
  return (
    <li data-row-id={e.id} tabIndex={tab} onFocus={(ev) => { if (ev.target === ev.currentTarget) onActivate(e.id); }} onClick={onRowClick}
      aria-selected={selected}
      className={cn(ROW_GRID,
        'group relative cursor-pointer scroll-mb-24 scroll-mt-[140px] px-5 py-2.5 outline-none transition-colors duration-fast last:rounded-b-xl',
        'hover:bg-fg/[0.025] focus-visible:bg-fg/[0.035] focus-visible:shadow-[inset_2px_0_0_rgb(var(--ring))]',
        selected && 'bg-primary/[0.045] hover:bg-primary/[0.06]')}>
      <div className={cn('flex items-center', COL.select)}>
        <Checkbox checked={selected} tabIndex={tab} aria-label={`Select ${e.note || e.task}`}
          onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); onToggleSelect(e, ev.shiftKey); }}
          className={cn('transition-opacity duration-fast', selected || selecting ? 'opacity-100' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100')} />
      </div>

      <div className={cn('min-w-0', COL.main)}>
        <div className="flex min-w-0 items-center gap-2">
          <NoteCell entry={e} editing={editingNote} canEdit={canEditNote}
            onStart={() => onStartNote(e.id)} onCommit={(v) => onCommitNote(e, v)} onCancel={onCancelNote} />
          {e.ai && <Badge variant="ai" title={`AI-assisted, billed at ×${entryAiFactor(e)}${e.aiFactor != null ? ' (its own factor)' : ''}`}><Sparkles />AI ×{entryAiFactor(e)}</Badge>}
          {e.free && <Badge variant="free">Free</Badge>}
          {e.invoiced && <Badge variant="invoiced"><Check strokeWidth={2.5} />Invoiced</Badge>}
        </div>
        {/* Narrow windows have no room for the project chip: it hides, and the line's tooltip names it. */}
        <div title={`${e.client} · ${e.task}${e.project ? ` · ${e.project}` : ''}`} className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden text-sm">
          <ClientDot client={e.client} size={7} />
          <span className="min-w-[3rem] truncate text-fg-muted">{e.client}</span>
          <Sep />
          <span className="min-w-[3rem] shrink-[3] truncate text-fg-subtle">{e.task}</span>
          {e.project && (
            <span title={`Project: ${e.project}`}
              className="ml-1 hidden h-[18px] min-w-[2.5rem] max-w-[14rem] shrink-[8] items-center rounded-md bg-fg/[0.06] px-1.5 text-2xs font-medium text-fg-muted min-[900px]:inline-flex">
              <span className="truncate">{e.project}</span>
            </span>
          )}
          <span className="shrink-0 whitespace-nowrap text-fg-subtle tnum min-[1180px]:hidden"><Sep /> {timeRange(e)}</span>
        </div>
      </div>

      <div className={cn('whitespace-nowrap text-right text-sm text-fg-subtle tnum transition-opacity duration-fast group-focus-within:opacity-0 group-hover:opacity-0 group-has-[[data-state=open]]:opacity-0', COL.time)}>{timeRange(e)}</div>

      <div className={cn('text-right tnum', COL.duration)}>
        <div className="text-base font-semibold text-fg">{formatClock(e.duration)}</div>
        {showBillable && (
          <Tooltip content={e.ai ? `Billed as ${formatClock(f.billableMs)}: AI ×${entryAiFactor(e)}, then rounded` : `Billed as ${formatClock(f.billableMs)} after rounding`}>
            <div className="mt-0.5 whitespace-nowrap text-2xs text-fg-subtle">{formatClock(f.billableMs)} billable</div>
          </Tooltip>
        )}
      </div>

      <div className={cn('text-right tnum', COL.amount)}>
        {e.free ? (
          <>
            <div className="text-sm font-medium text-free-text">€0.00</div>
            <div className="mt-0.5 whitespace-nowrap text-2xs text-fg-subtle"><span className="line-through">{formatEUR(f.standard)}</span> value</div>
          </>
        ) : (
          <>
            <div className="text-sm font-medium text-fg">{formatEUR(f.net)}</div>
            <div className="mt-0.5 whitespace-nowrap text-2xs text-fg-subtle">{formatEUR(f.gross)} incl.</div>
          </>
        )}
      </div>

      <div className={cn('flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-fast group-focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100', COL.actions)}>
        <Tooltip content={e.invoiced ? 'Invoiced. Click to mark unbilled.' : 'Mark as invoiced'} shortcut="I">
          <Button variant="ghost" size="icon-sm" tabIndex={tab} onClick={(ev) => { if (ev.detail <= 1) onToggleInvoiced(e); }} aria-label={e.invoiced ? 'Mark as unbilled' : 'Mark as invoiced'} aria-pressed={!!e.invoiced}
            className={cn('hidden min-[1180px]:inline-flex', e.invoiced ? 'text-invoiced-text hover:bg-invoiced-soft hover:text-invoiced-text' : 'hover:text-invoiced-text')}><CheckCheck /></Button>
        </Tooltip>
        <Tooltip content="Continue this work">
          <Button variant="ghost" size="icon-sm" tabIndex={tab} onClick={(ev) => { if (ev.detail <= 1) onResume(e); }} aria-label="Continue this work" className="hidden hover:text-brand-text min-[1180px]:inline-flex"><Play fill="currentColor" strokeWidth={0} /></Button>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" tabIndex={tab} aria-label="More actions"><MoreHorizontal /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent onCloseAutoFocus={(ev) => ev.preventDefault()}>
            <DropdownMenuItem onSelect={() => onEdit(e)} shortcut="Enter"><Pencil />Edit entry</DropdownMenuItem>
            {canEditNote && <DropdownMenuItem onSelect={() => onStartNote(e.id)} shortcut="N"><StickyNote />Edit note</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => onToggleInvoiced(e)} shortcut="I">{e.invoiced ? <><Undo2 />Mark unbilled</> : <><CheckCheck />Mark invoiced</>}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onToggleSelect(e, false)} shortcut="Space"><SquareCheck />{selected ? 'Deselect' : 'Select'}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onResume(e)}><Play fill="currentColor" strokeWidth={0} />Continue</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem danger onSelect={() => onDelete(e)} shortcut="Del"><Trash2 />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
});

// A day: sticky header with the day's totals in the same columns as the rows below it.
export function DayGroup({ day, totals, selectedCount, children, onToggleDay }) {
  const { title, sub } = dayLabel(day.key);
  const all = selectedCount > 0 && selectedCount === day.items.length;
  const some = selectedCount > 0 && !all;
  return (
    <section aria-label={`${title}, ${sub}`} className="rounded-xl border border-line bg-surface shadow-card">
      <header className={cn(ROW_GRID, 'sticky top-[73px] z-10 items-start rounded-t-xl border-b border-line bg-surface-2 px-5 py-2.5')}>
        <div className={cn('flex h-5 items-center', COL.select)}>
          <Checkbox checked={all ? true : some ? 'indeterminate' : false} onCheckedChange={() => onToggleDay(day, !all)}
            aria-label={`Select all entries on ${title}`} />
        </div>
        {/* Two lines like a row: the day, then its date and entry count. */}
        <div className={cn('min-w-0', COL.main)}>
          <h2 className="truncate text-base font-semibold text-fg">{title}</h2>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-fg-subtle">
            <span className="truncate">{sub}</span>
            <Sep />
            <span className="whitespace-nowrap tnum">{day.items.length} {day.items.length === 1 ? 'entry' : 'entries'}</span>
          </div>
        </div>
        {/* Same stack as the rows: duration in its column; net on top and incl. VAT under it in the money column. */}
        <div className={cn('text-right tnum', COL.duration)}>
          <div className="text-base font-semibold text-fg">{formatClock(totals.ms)}</div>
          {Math.abs(totals.billableMs - totals.ms) >= 1000 && (
            <div className="mt-0.5 whitespace-nowrap text-2xs text-fg-subtle">{formatClock(totals.billableMs)} billable</div>
          )}
        </div>
        <div className={cn('text-right tnum', COL.amount)}>
          <div className={cn('text-base font-semibold', totals.allFree ? 'text-free-text' : 'text-fg')}>{formatEUR(totals.net)}</div>
          <div className="mt-0.5 whitespace-nowrap text-2xs text-fg-subtle">{formatEUR(totals.gross)} incl.</div>
        </div>
        <div className="min-[1180px]:hidden" />
      </header>
      <ul className="divide-y divide-line">{children}</ul>
    </section>
  );
}
