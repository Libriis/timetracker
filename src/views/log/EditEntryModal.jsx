import { useState } from 'react';
import { AlertTriangle, Check, Gift, Info, Pencil, RotateCcw, Sparkles } from 'lucide-react';
import { AI_FACTOR, validAiFactor, withAiFactor } from '../../lib/billing.js';
import { formatHM, formatTime, UI_LOCALE } from '../../lib/format.js';
import { AiFactorField } from '../../components/ui/AiFactorPicker.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { DurationSlider } from '../../components/ui/DurationSlider.jsx';
import { SwitchRow } from '../../components/ui/Switch.jsx';
import { Field, Input } from '../../components/ui/Input.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Select } from '../../components/ui/Select.jsx';

const MIN = 60000;
// Past this length an edited entry needs a second click to save (a typo in a date makes 190 h entries).
const LONG_MS = 16 * 3600000;
const floorMinute = (ms) => Math.floor(ms / MIN) * MIN;
// Anything later than this moment is the future. A typed time is a whole minute, so the current
// minute (its :00 is already past) passes and the next one is flagged.
const isFuture = (ms) => ms > Date.now();
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const dayWord = (ms) => new Date(ms).toLocaleDateString(UI_LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
// "14:55", or "Mon 2 Nov 14:55" when the time is on another day than `ref`.
const when = (ms, ref) => (sameDay(ms, ref) ? formatTime(ms) : `${dayWord(ms)} ${formatTime(ms)}`);

function toInput(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditEntryModal({ entry, clients, tasks, onClose, onSave }) {
  const [client, setClient] = useState(entry.client);
  const [task, setTask] = useState(entry.task);
  const [project, setProject] = useState(entry.project || '');
  const [note, setNote] = useState(entry.note || '');
  const [free, setFree] = useState(!!entry.free);
  const [ai, setAi] = useState(!!entry.ai);
  const [aiFactor, setAiFactor] = useState(validAiFactor(entry.aiFactor)); // own factor, null = Default (follow Settings)
  const aiF = aiFactor ?? AI_FACTOR;
  const startInit = toInput(entry.start);
  const endInit = toInput(entry.end);
  const [start, setStart] = useState(startInit);
  const [end, setEnd] = useState(endInit);
  const [error, setError] = useState('');
  // Exact times set by the slider or a preset: { str, ms }. The fields can only show whole minutes,
  // but a timer start carries seconds, so "1h" must save exactly 60:00 between Start and End.
  const [startExact, setStartExact] = useState(null);
  const [endExact, setEndExact] = useState(null);
  // The Start the user chose: the stored one, or the last one typed. Every preset and slider move
  // measures from here, so a move that had to shift Start back is undone by the next shorter one.
  const [anchorMs, setAnchorMs] = useState(entry.start);
  // Set when a preset moved Start back (End would have passed now): { from, to } in ms.
  const [shift, setShift] = useState(null);
  // The range the user already confirmed as "long" with a second Save click.
  const [longOkKey, setLongOkKey] = useState('');

  // The inputs only hold whole minutes. While a field is untouched, use the stored timestamp
  // (with its seconds), so a note-only edit never shifts the times.
  const startMs = startExact && start === startExact.str ? startExact.ms
    : start === startInit ? entry.start : new Date(start).getTime();
  const endMs = endExact && end === endExact.str ? endExact.ms
    : end === endInit ? entry.end : new Date(end).getTime();
  // A timer with pauses tracks less than end − start. Keep the stored duration until the range changes.
  const rangeUntouched = start === startInit && end === endInit && !endExact && !startExact;
  const hasPauses = Math.abs((entry.end - entry.start) - entry.duration) >= MIN;
  const validRange = !isNaN(startMs) && !isNaN(endMs) && endMs > startMs;
  const durationMs = rangeUntouched ? entry.duration : validRange ? endMs - startMs : 0;
  const durationMinutes = Math.round(durationMs / MIN);
  const shifted = !!(shift && start === toInput(shift.to));
  const endInFuture = !rangeUntouched && !isNaN(endMs) && isFuture(endMs);
  const long = !rangeUntouched && validRange && durationMs > LONG_MS;
  const rangeKey = `${startMs}|${endMs}`;
  const longConfirmed = long && longOkKey === rangeKey;

  // Slider and presets keep Start and move End. When that End would pass the current time,
  // End stops at now and Start moves back instead, so the entry still lasts exactly N minutes.
  const setDurationMinutes = (m) => {
    if (isNaN(anchorMs)) { setError('Set a valid start time first.'); return; }
    setError('');
    const len = m * MIN;
    const now = Date.now();
    let s = anchorMs;
    let e = anchorMs + len;
    if (e > now) {
      e = floorMinute(now);
      s = e - len;
      setShift({ from: anchorMs, to: s });
    } else {
      setShift(null);
    }
    setStart(toInput(s));
    setStartExact({ str: toInput(s), ms: s });
    setEnd(toInput(e));
    setEndExact({ str: toInput(e), ms: e });
  };
  // A hand-typed time drops the exact value of that field: it then counts in whole minutes.
  const changeStart = (v) => {
    setStart(v);
    setStartExact(null);
    setEndExact(null);
    setShift(null);
    setAnchorMs(v === startInit ? entry.start : new Date(v).getTime());
    setError('');
  };
  // A typed End is the user's own: the "Start moved back / End = now" notice no longer applies.
  const changeEnd = (v) => { setEnd(v); setEndExact(null); setShift(null); setError(''); };
  const setEndTo = (ms) => {
    setEnd(toInput(ms));
    setEndExact({ str: toInput(ms), ms });
    setShift(null);
    setError('');
  };
  // Undo the shift: Start goes back to the chosen time and the entry ends now (shorter than the preset).
  // Only offered while the chosen Start is before now: a future Start can't end now.
  const canKeepStart = !!shift && !isNaN(shift.from) && floorMinute(Date.now()) > shift.from;
  const keepStart = () => {
    const s = anchorMs;
    const e = floorMinute(Date.now());
    if (isNaN(s) || e <= s) { setShift(null); return; }
    setStart(toInput(s));
    setStartExact({ str: toInput(s), ms: s });
    setEndTo(e);
  };

  // A future End on an old entry is almost always a date typo: offer End on Start's day, not "now".
  const nowMs = Date.now();
  const endNowOk = !isNaN(startMs) && floorMinute(nowMs) > startMs && floorMinute(nowMs) - startMs <= LONG_MS;
  let endOnStartDay = null;
  if ((endInFuture || long) && !isNaN(startMs) && !isNaN(endMs) && !sameDay(startMs, endMs)) {
    const s = new Date(startMs);
    const e = new Date(endMs);
    const c = new Date(s.getFullYear(), s.getMonth(), s.getDate(), e.getHours(), e.getMinutes()).getTime();
    if (c > startMs && !isFuture(c)) endOnStartDay = c;
  }

  const save = () => {
    const s = startMs;
    const e = endMs;
    if (isNaN(s) || isNaN(e) || e <= s) { setError('End time must be after start time.'); return; }
    if (!rangeUntouched && isFuture(e)) { setError('End is in the future. Set it to now or earlier.'); return; }
    if (long && !longConfirmed) { setLongOkKey(rangeKey); return; }
    const duration = rangeUntouched ? entry.duration : e - s;
    // Default or AI off: the entry has no own factor (the key goes away).
    onSave(withAiFactor({ ...entry, client, task, project, note, free, ai, start: s, end: e, duration }, aiFactor));
  };

  const notice = shifted ? (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-lg border border-line-strong/70 bg-surface px-3 py-2.5 text-xs text-fg-muted shadow-xs">
      <Info className="mt-px size-3.5 shrink-0 text-fg-subtle" aria-hidden />
      <span className="min-w-0 flex-1 leading-[18px]">
        End can&apos;t be later than now ({formatTime(endMs)}), so <span className="font-medium text-fg">Start moved back from {when(shift.from, shift.to)} to {when(shift.to, shift.from)}</span>.
      </span>
      {canKeepStart && (
        <Button variant="link" size="xs" className="h-auto px-0 text-xs" onClick={keepStart}>
          <RotateCcw className="!size-3" /> Keep Start at {when(shift.from, shift.to)}
        </Button>
      )}
    </div>
  ) : hasPauses && rangeUntouched ? (
    <p className="text-xs leading-[18px] text-fg-subtle">
      Paused time is left out: {formatHM(entry.duration)} h tracked between {formatTime(entry.start)} and {formatTime(entry.end)}. Change a time or the duration to set it from the range.
    </p>
  ) : null;

  return (
    <Modal onClose={onClose} title="Edit entry" description={`${entry.client} · ${entry.task}`} icon={<Pencil />}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {/* A double click is one click: it must not skip the "this entry is long" check. */}
          <Button variant="primary" onClick={(ev) => { if (ev.detail <= 1) save(); }}><Check /> {longConfirmed ? 'Save anyway' : 'Save changes'}</Button>
        </>
      )}>
      <div className="space-y-3.5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label="Client" value={client} onChange={setClient} clientDots options={clients.includes(entry.client) ? clients : [entry.client, ...clients]} />
          <Select label="Activity" value={task} onChange={setTask} options={tasks.includes(entry.task) ? tasks : [entry.task, ...tasks]} />
          <Field label="Project">
            <Input value={project} onChange={(e) => setProject(e.target.value)} list="project-suggestions" placeholder="e.g. RECAP 05/2026" />
          </Field>
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you do?" />
          </Field>
        </div>

        <div className="rounded-xl border border-line bg-surface-2/60 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Start" hint={shifted ? 'Moved back' : undefined}>
              <Input type="datetime-local" value={start} onChange={(e) => changeStart(e.target.value)}
                className={shifted ? 'border-ring/60 bg-ring/[0.04]' : undefined} />
            </Field>
            <Field label="End" hint={shifted ? 'Now' : undefined}>
              <Input type="datetime-local" value={end} onChange={(e) => changeEnd(e.target.value)} aria-invalid={endInFuture || undefined}
                className={endInFuture ? 'border-warning' : undefined} />
            </Field>
          </div>

          {/* What just happened to the times, right under them (never below the fold). */}
          <div role="status" className={notice ? 'mt-3' : undefined}>{notice}</div>

          {endInFuture && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-warning-text">
              <span className="flex items-center gap-1.5"><AlertTriangle className="size-3.5 shrink-0" aria-hidden />End is later than now.</span>
              {endOnStartDay != null && (
                <Button variant="link" size="xs" className="h-auto px-0 text-xs text-warning-text" onClick={() => setEndTo(endOnStartDay)}>
                  End on {dayWord(endOnStartDay)} at {formatTime(endOnStartDay)}
                </Button>
              )}
              {endNowOk && (
                <Button variant="link" size="xs" className="h-auto px-0 text-xs text-warning-text" onClick={() => setEndTo(floorMinute(Date.now()))}>Set End to now</Button>
              )}
            </div>
          )}
          {long && !endInFuture && (
            <div role="alert" className="mt-3 flex items-start gap-1.5 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs leading-[18px] text-warning-text">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                This entry lasts <span className="font-semibold tnum">{formatHM(durationMs)} h</span>. Check the dates of Start and End.
                {longConfirmed && ' Click Save anyway to keep it.'}
                {endOnStartDay != null && (
                  <Button variant="link" size="xs" className="ml-1.5 h-auto px-0 text-xs text-warning-text" onClick={() => setEndTo(endOnStartDay)}>
                    End on {dayWord(endOnStartDay)} at {formatTime(endOnStartDay)}
                  </Button>
                )}
              </span>
            </div>
          )}

          <div className="mt-3.5">
            <DurationSlider durationMinutes={durationMinutes} setDurationMinutes={setDurationMinutes} />
          </div>
        </div>

        {/* Short rows side by side, so the whole form fits a 800px window without scrolling. */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <SwitchRow tone="free" icon={<Gift />} checked={free} onChange={setFree}
            label="Free of charge" description={free ? 'Goodwill, billed at €0' : 'Bill this at €0'} />
          <SwitchRow tone="ai" icon={<Sparkles />} checked={ai} onChange={setAi}
            label={`AI-assisted ×${aiF}`} description={`Bills ×${aiF} the time`} />
        </div>
        {/* AI on: this entry's factor. Default follows Settings; a number stays with the entry. */}
        {ai && (
          <AiFactorField value={aiFactor} onChange={setAiFactor}
            className="rounded-xl border border-ai/30 bg-ai-soft/40 px-3 py-2.5" />
        )}
      </div>
      {error && <div role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-text">{error}</div>}
    </Modal>
  );
}
