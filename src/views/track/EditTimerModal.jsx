import { useMemo, useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { timerElapsed } from '../../lib/billing.js';
import { formatClock, formatTime } from '../../lib/format.js';
import { AiToggle } from '../../components/ui/AiToggle.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Combobox } from '../../components/ui/Combobox.jsx';
import { Field, Input } from '../../components/ui/Input.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { workKey } from './trackData.js';

const pad = (n) => String(n).padStart(2, '0');
const toInput = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// Fix a running or paused timer: what it is for, and when it started (forgot to press Start?).
// Moving the start earlier adds that time; later removes it. Pauses already taken stay subtracted.
export function EditTimerModal({ timer, timers = [], clients, tasks, projectIndex = {}, onClose, onSave }) {
  const [note, setNote] = useState(timer.note || '');
  const [client, setClient] = useState(timer.client);
  const [task, setTask] = useState(timer.task);
  const [project, setProject] = useState(timer.project || '');
  const [ai, setAi] = useState(!!timer.ai);
  const [start, setStart] = useState(toInput(timer.startedAt));
  const [error, setError] = useState('');

  const clientList = clients.includes(timer.client) ? clients : [timer.client, ...clients];
  const taskList = tasks.includes(timer.task) ? tasks : [timer.task, ...tasks];
  const projects = useMemo(() => (projectIndex[client] || []).map(p => p.project), [projectIndex, client]);

  const now = Date.now();
  const startChanged = toInput(timer.startedAt) !== start;
  // The input shows whole minutes. Keep the original start's seconds, so moving it 10 minutes adds exactly
  // 10 minutes. Never later than now.
  const picked = new Date(start).getTime();
  const startMs = Number.isFinite(picked) ? Math.min(picked + (timer.startedAt % 60000), now) : NaN;
  // Shift elapsed time by the same amount the start moved (pauses stay as they were).
  const delta = startChanged && Number.isFinite(startMs) ? timer.startedAt - startMs : 0;
  const newElapsed = timerElapsed(timer, now) + delta;

  // Editing can turn this timer into the same work as another one. Saving is allowed (it is on purpose),
  // but say plainly that both will bill.
  const twin = timers.find(t => t.id !== timer.id && workKey(t) === workKey({ client, task, project, note }));

  const changeClient = (c) => {
    // Never keep another client's project.
    if (c !== client && !(projectIndex[c] || []).some(p => p.project === project)) setProject('');
    setClient(c);
  };

  const save = () => {
    const patch = { note: note.trim(), client, task, project, ai };
    if (startChanged) {
      if (!Number.isFinite(startMs)) { setError('Enter a valid start time.'); return; }
      if (picked > now) { setError('The start time is in the future.'); return; }
      if (newElapsed < 0) { setError('That start is after the time already tracked. Pick an earlier time.'); return; }
      patch.startedAt = startMs;
      let acc = timer.accumulatedMs || 0;
      if (timer.runningSince) {
        let rs = timer.runningSince - delta;
        // Moving the start later than the current segment began: take the rest from earlier segments.
        if (rs > now) { acc -= rs - now; rs = now; }
        patch.runningSince = rs;
        patch.accumulatedMs = Math.max(0, acc);
      } else {
        patch.accumulatedMs = Math.max(0, acc + delta);
      }
    }
    onSave(timer.id, patch);
  };

  return (
    <Modal onClose={onClose} title="Edit timer" description={`Change the details or the start time. The timer ${timer.runningSince ? 'keeps running' : 'stays paused'}.`} icon={<Pencil />}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}><Check /> Save changes</Button>
        </>
      )}>
      <div className="space-y-4">
        <Field label="Description">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What are you working on?" data-autofocus
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && !e.repeat) save(); }} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label="Client" value={client} onChange={changeClient} options={clientList} clientDots />
          <Select label="Activity" value={task} onChange={setTask} options={taskList} />
          <Field label="Project" hint="Optional">
            <Combobox value={project} onChange={setProject} options={projects} allowCustom clearLabel="No project"
              placeholder="No project" searchPlaceholder={`Find or type a ${client} project…`} label="Project" />
          </Field>
          <Field label="Started at" help={startChanged && Number.isFinite(startMs) && newElapsed >= 0
            ? `Tracked time becomes ${formatClock(newElapsed)}.`
            : `Started ${formatTime(timer.startedAt)}. Tracked so far: ${formatClock(timerElapsed(timer, now))}.`}>
            <Input type="datetime-local" value={start} max={toInput(now)} onChange={(e) => { setStart(e.target.value); setError(''); }} />
          </Field>
        </div>
        <AiToggle ai={ai} setAi={setAi} />
        {twin && (
          <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning-text">
            Another timer already tracks this exact work ({twin.runningSince ? 'running' : 'paused'}). If you save, both timers bill.
          </p>
        )}
      </div>
      {error && <div role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-text">{error}</div>}
    </Modal>
  );
}
