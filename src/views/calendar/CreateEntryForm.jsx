import { useMemo, useRef, useState } from 'react';
import { Gift, Plus } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { formatHM } from '../../lib/format.js';
import { AiPill } from '../../components/ui/AiToggle.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Combobox } from '../../components/ui/Combobox.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Kbd } from '../../components/ui/Kbd.jsx';
import { atMinutes, clockHM, fmtDayLong, minutesFrom, startOfDay } from './calendarUtils.js';

const toMin = (s) => { const [h, m] = String(s).split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN; };

// Popover body for a new entry drawn on the grid. Builds the entry exactly like ManualEntryModal.
export function CreateEntryForm({ draft, clients, tasks, entries, onChangeRange, onCancel, onCreate, onNavigate }) {
  const recent = useMemo(() => {
    let best = null;
    for (const e of entries) if (!best || e.start > best.start) best = e;
    return best;
  }, [entries]);
  const [client, setClient] = useState(() => (recent && clients.includes(recent.client) ? recent.client : clients[0] || ''));
  const [task, setTask] = useState(() => (recent && tasks.includes(recent.task) ? recent.task : tasks[0] || ''));
  const [project, setProject] = useState('');
  const [note, setNote] = useState('');
  const [ai, setAi] = useState(false);
  const [free, setFree] = useState(false);
  const [error, setError] = useState('');
  const noteRef = useRef(null);

  const day = startOfDay(new Date(draft.start));
  const startStr = clockHM(draft.start);
  const endDayOffset = Math.round(minutesFrom(day, draft.end));
  const endStr = endDayOffset >= 1440 && clockHM(draft.end) === '00:00' ? '24:00' : clockHM(draft.end);

  // Projects this client used before, newest first.
  const projects = useMemo(() => {
    const seen = new Set();
    return [...entries].sort((a, b) => b.start - a.start)
      .filter(e => e.client === client && e.project && !seen.has(e.project) && seen.add(e.project))
      .map(e => e.project).slice(0, 30);
  }, [entries, client]);

  const setTime = (which, value) => {
    const m = toMin(value);
    if (!Number.isFinite(m)) return;
    const s = which === 'start' ? atMinutes(day, m) : draft.start;
    let e = which === 'end' ? atMinutes(day, m === 0 ? 1440 : m) : draft.end;
    if (which === 'start' && e <= s) e = s + (draft.end - draft.start);
    setError('');
    onChangeRange(s, e);
  };

  const submit = (ev) => {
    ev?.preventDefault();
    if (!client) { setError('Pick a client.'); return; }
    if (!task) { setError('Pick an activity.'); return; }
    const start = draft.start;
    const end = draft.end;
    if (!(end > start)) { setError('End must be after start.'); return; }
    onCreate({ id: 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), client, task, project, note, free, ai, start, end, duration: end - start });
  };

  if (!clients.length || !tasks.length) {
    return (
      <div className="w-72 p-4 text-sm">
        <div className="font-semibold text-fg">Add a client and an activity first</div>
        <p className="mt-1 text-fg-subtle">Entries need both. Set them up in Settings.</p>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={() => onNavigate('settings')}>Open Settings</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-[min(22rem,calc(100vw-24px))]"
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e); }}>
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 pb-3 pt-3.5">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fg">New entry</div>
          <div className="mt-0.5 text-xs text-fg-subtle">{fmtDayLong(day)}</div>
        </div>
        <span className="mt-0.5 inline-flex h-6 shrink-0 items-center rounded-md bg-fg/[0.06] px-2 text-xs font-semibold text-fg tnum">
          {formatHM(Math.max(0, draft.end - draft.start))}
        </span>
      </div>
      <div className="space-y-2.5 px-4 py-3.5">
        <Input ref={noteRef} data-autofocus autoFocus value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="What did you work on?" aria-label="Note" />
        <div className="grid grid-cols-2 gap-2">
          <Combobox label="Client" value={client} onChange={(v) => { setClient(v); setProject(''); }} options={clients} clientDots size="sm"
            placeholder="Client" searchPlaceholder="Find a client…" />
          <Combobox label="Activity" value={task} onChange={setTask} options={tasks} size="sm"
            placeholder="Activity" searchPlaceholder="Find an activity…" />
        </div>
        <Combobox label="Project" value={project} onChange={setProject} options={projects} size="sm" allowCustom clearLabel="No project"
          placeholder="Project (optional)" searchPlaceholder="Find or type a project…" emptyText="Type to add a project." />
        <div className="flex items-center gap-2">
          <Input type="time" size="sm" step={900} value={startStr} onChange={(e) => setTime('start', e.target.value)} aria-label="Start time" className="w-[92px]" />
          <span aria-hidden className="text-fg-faint">–</span>
          <Input type="time" size="sm" step={900} value={endStr === '24:00' ? '00:00' : endStr} onChange={(e) => setTime('end', e.target.value)} aria-label="End time" className="w-[92px]" />
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <AiPill on={ai} onToggle={() => setAi(v => !v)} size="sm" />
          <button type="button" role="switch" aria-checked={free} onClick={() => setFree(v => !v)}
            className={cn('inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring/60',
              free ? 'border-free/35 bg-free-soft text-free-text' : 'border-line-strong/80 bg-surface text-fg-muted hover:text-fg')}>
            <Gift className={cn('size-3.5', !free && 'text-fg-subtle')} />Free
          </button>
        </div>
        {error && <div role="alert" className="rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs text-danger-text">{error}</div>}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-2/60 px-4 py-2.5">
        <span className="hidden items-center gap-1 text-2xs text-fg-subtle sm:flex"><Kbd>Esc</Kbd> to cancel</span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" type="submit"><Plus />Add entry</Button>
        </div>
      </div>
    </form>
  );
}
