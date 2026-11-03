import { cn } from '../../lib/cn.js';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';

export function CsvFormatEditor({ csvFormat, onSaveCsvFormat }) {
  const opts = [
    { value: 'standard', label: 'Standard', hint: 'Comma separator, dot decimals. Works with most import tools.' },
    { value: 'excel-sk', label: 'Slovak Excel', hint: 'Semicolon separator, decimal comma, UTF-8 BOM. Opens in columns in SK Excel.' },
  ];
  return (
    <Card>
      <CardHeader title="CSV export format" description="How Dashboard and Log CSV files are written." />
      <CardBody>
        <div role="radiogroup" aria-label="CSV export format" className="grid gap-2 sm:grid-cols-2">
          {opts.map(o => {
            const on = csvFormat === o.value;
            return (
              <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onSaveCsvFormat(o.value)}
                className={cn('flex items-start gap-3 rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
                  on ? 'border-fg/40 bg-surface-2 ring-1 ring-fg/10' : 'border-line hover:bg-surface-2')}>
                <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border', on ? 'border-primary' : 'border-line-strong')}>
                  {on && <span className="size-2 rounded-full bg-primary" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg">{o.label}</span>
                  <span className="mt-0.5 block text-xs text-fg-subtle">{o.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
