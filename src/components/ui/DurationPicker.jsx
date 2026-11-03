import { CalendarClock } from 'lucide-react';
import { DurationSlider } from './DurationSlider.jsx';
import { Field, Input } from './Input.jsx';

export function DurationPicker({ date, setDate, durationMinutes, setDurationMinutes }) {
  const previewRange = () => {
    const dateObj = new Date(date + 'T00:00:00');
    if (isNaN(dateObj.getTime())) return '—';
    const today = new Date();
    const isToday = dateObj.toDateString() === today.toDateString();
    const endDate = isToday ? new Date() : (() => { const d = new Date(dateObj); d.setHours(18, 0, 0, 0); return d; })();
    const startDate = new Date(endDate.getTime() - durationMinutes * 60000);
    const fmt = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${fmt(startDate)} – ${fmt(endDate)}`;
  };
  return (
    <div className="space-y-4">
      <Field label="Date">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <DurationSlider durationMinutes={durationMinutes} setDurationMinutes={setDurationMinutes} />
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">
        <CalendarClock className="size-3.5 text-fg-subtle" />
        <span className="text-fg-subtle">Saved as</span>
        <span className="font-medium text-fg tnum">{previewRange()}</span>
      </div>
    </div>
  );
}
