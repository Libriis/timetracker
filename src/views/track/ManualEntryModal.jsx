import { useId, useMemo, useRef, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { withAiFactor } from '../../lib/billing.js';
import { AiToggle } from '../../components/ui/AiToggle.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { buildProjectIndex } from './trackData.js';
import { DurationPicker } from '../../components/ui/DurationPicker.jsx';
import { FreeToggle } from '../../components/ui/FreeToggle.jsx';
import { Field, Input } from '../../components/ui/Input.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { Select } from '../../components/ui/Select.jsx';

// Add a past entry by hand. With `entries`, the Project field suggests only the chosen client's projects
// (newest first) and switching the client drops a project that belongs to another client.
export function ManualEntryModal({ clients, tasks, entries, onClose, onSave }) {
  const projectIndex = useMemo(() => (entries ? buildProjectIndex(entries) : null), [entries]);
  const listId = `manual-projects-${useId().replace(/:/g, '')}`;
  const now = new Date();
  const toInput = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const toDateInput = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const [client, setClient] = useState(clients[0]);
  const [task, setTask] = useState(tasks[0]);
  const [project, setProject] = useState('');
  const [note, setNote] = useState('');
  const [free, setFree] = useState(false);
  const [ai, setAi] = useState(false);
  const [aiFactor, setAiFactor] = useState(null); // the entry's own AI factor, null = Default (follow Settings)
  const [mode, setMode] = useState('duration');
  const [start, setStart] = useState(toInput(new Date(now.getTime() - 3600000)));
  const [end, setEnd] = useState(toInput(now));
  const [date, setDate] = useState(toDateInput(now));
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [error, setError] = useState('');
  const projects = projectIndex ? (projectIndex[client] || []).map(p => p.project) : null;
  const changeClient = (c) => {
    if (projectIndex && c !== client && !(projectIndex[c] || []).some(p => p.project === project)) setProject('');
    setClient(c);
  };

  // One entry per dialog: a double-click on Save must not add it twice.
  const saved = useRef(false);
  const save = () => {
    if (saved.current) return;
    const fields = withAiFactor({ client, task, project: project.trim(), note: note.trim(), free, ai }, aiFactor);
    if (mode === 'range') {
      const s = new Date(start).getTime();
      const e = new Date(end).getTime();
      if (isNaN(s) || isNaN(e) || e <= s) { setError('End time must be after start time.'); return; }
      saved.current = true;
      onSave({ id: 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), ...fields, start: s, end: e, duration: e - s });
    } else {
      const dateObj = new Date(date + 'T00:00:00');
      if (isNaN(dateObj.getTime())) { setError('Invalid date.'); return; }
      if (!(durationMinutes > 0)) { setError('Pick a duration longer than zero.'); return; }
      const today = new Date();
      const isToday = dateObj.toDateString() === today.toDateString();
      const endDate = isToday ? new Date() : (() => { const d = new Date(dateObj); d.setHours(18, 0, 0, 0); return d; })();
      const durationMs = durationMinutes * 60 * 1000;
      const startDate = new Date(endDate.getTime() - durationMs);
      saved.current = true;
      onSave({ id: 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), ...fields, start: startDate.getTime(), end: endDate.getTime(), duration: durationMs });
    }
  };

  return (
    <Modal onClose={onClose} title="Add manual entry" description="Log time you did not track with the timer." icon={<Plus />}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}><Check /> Save entry</Button>
        </>
      )}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label="Client" value={client} onChange={changeClient} options={clients} clientDots />
          <Select label="Activity" value={task} onChange={setTask} options={tasks} />
          <Field label="Project" hint="Optional">
            {/* Type freely; suggestions are this client's projects only (newest first). */}
            <Input value={project} onChange={(e) => setProject(e.target.value)} list={projects ? listId : 'project-suggestions'} placeholder="e.g. RECAP 05/2026" autoComplete="off" />
            {projects && <datalist id={listId}>{projects.map(p => <option key={p} value={p} />)}</datalist>}
          </Field>
          <Field label="Note" hint="Optional">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you do?" />
          </Field>
        </div>
        <div className="grid gap-2">
          <FreeToggle free={free} setFree={setFree} />
          <AiToggle ai={ai} setAi={setAi} factor={aiFactor} setFactor={setAiFactor} />
        </div>
        <div className="rounded-xl border border-line bg-surface-2/60 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-fg">Time</span>
            <SegmentedControl size="sm" label="Time entry method" value={mode} onChange={setMode}
              options={[{ value: 'duration', label: 'Duration' }, { value: 'range', label: 'Start & end' }]} />
          </div>
          {mode === 'duration' ? (
            <DurationPicker date={date} setDate={setDate} durationMinutes={durationMinutes} setDurationMinutes={setDurationMinutes} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Start"><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
              <Field label="End"><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
            </div>
          )}
        </div>
      </div>
      {error && <div role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-text">{error}</div>}
    </Modal>
  );
}
