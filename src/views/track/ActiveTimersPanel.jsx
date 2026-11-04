import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useNow } from '../../lib/useNow.js';
import { ActiveTimerRow } from './ActiveTimerRow.jsx';

// Running + paused timers. The shared clock (useNow) re-renders only these rows each second.
// flashId / flashN: ring one card for a moment (a start found its work already on that timer).
// Each card reports whether its work line and clock fit on one line (see ActiveTimerRow). If one does not,
// every card uses two lines, so the clocks and buttons stay lined up.
export function ActiveTimersPanel({ timers, billing, primaryId, flashId, flashN, onPause, onResume, onStop, onToggleAi, onFocus, onEdit, onSetAiFactor }) {
  const anyRunning = timers.some(t => t.runningSince);
  const now = useNow(anyRunning);
  const [tight, setTight] = useState({});
  const onFit = useCallback((id, v) => setTight(m => (m[id] === v ? m : { ...m, [id]: v })), []);
  const narrow = timers.some(t => tight[t.id]);
  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {timers.map(t => (
          <motion.div key={t.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 40 }}>
            <ActiveTimerRow timer={t} now={now} billing={billing} narrow={narrow} onFit={onFit} primary={t.id === primaryId && timers.length > 0}
              flash={t.id === flashId ? flashN : 0}
              onPause={onPause} onResume={onResume} onStop={onStop} onToggleAi={onToggleAi} onFocus={onFocus} onEdit={onEdit} onSetAiFactor={onSetAiFactor} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
