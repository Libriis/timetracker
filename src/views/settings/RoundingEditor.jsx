import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';

export function RoundingEditor({ rounding, onSaveRounding }) {
  const presets = [
    { value: 0, label: 'Off' },
    { value: 5, label: '5m' },
    { value: 10, label: '10m' },
    { value: 15, label: '15m' },
    { value: 30, label: '30m' },
    { value: 60, label: '1h' },
  ];
  return (
    <Card>
      <CardHeader title="Billing rounding" description="Each entry rounds up to the next block." />
      <CardBody>
        <SegmentedControl label="Billing rounding" fullWidth value={String(rounding)} onChange={(v) => onSaveRounding(Number(v))}
          options={presets.map(p => ({ value: String(p.value), label: p.label }))} />
        <p className="mt-2 text-xs text-fg-subtle">Agencies often use 15 minutes: a 16-minute session bills as 30.</p>
      </CardBody>
    </Card>
  );
}
