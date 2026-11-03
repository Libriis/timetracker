import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Input } from '../../components/ui/Input.jsx';

export function RateEditor({ tasks, rates, onSaveRates }) {
  const updateRate = (task, value) => {
    const num = parseFloat(value);
    onSaveRates({ ...rates, [task]: isNaN(num) ? 0 : num });
  };
  return (
    <Card>
      <CardHeader title="Hourly rates" description="Default rate per activity, in EUR." />
      <ul className="mt-3 divide-y divide-line border-t border-line">
        {tasks.map(task => (
          <li key={task} className="flex items-center gap-3 px-5 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm text-fg">{task}</span>
            <Input type="number" min="0" step="0.5" value={rates[task] ?? ''} aria-label={`${task} rate`}
              onChange={(e) => updateRate(task, e.target.value)} placeholder="0"
              size="sm" suffix="€/h" wrapperClassName="w-32" className="text-right" />
          </li>
        ))}
      </ul>
    </Card>
  );
}
