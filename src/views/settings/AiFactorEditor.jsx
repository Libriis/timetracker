import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { DEFAULT_AI_FACTOR, MAX_AI_FACTOR, MIN_AI_FACTOR } from '../../lib/billing.js';

const PRESETS = [1.25, 1.5, 1.75, 2];

// The AI-assisted billing factor. It applies to every AI entry, past and future (the user's choice),
// so the note says plainly that totals of earlier work change too.
export function AiFactorEditor({ aiFactor, onSaveAiFactor, pushToast, className }) {
  const [local, setLocal] = useState(String(aiFactor));
  useEffect(() => setLocal(String(aiFactor)), [aiFactor]);

  const save = (n) => {
    if (n === aiFactor) { setLocal(String(aiFactor)); return; }
    onSaveAiFactor(n);
    pushToast?.(`AI factor set to ×${n}. Every AI-assisted entry now bills at ×${n}.`, 'ok');
  };
  const commit = () => {
    // Accept a decimal comma too ("1,3"), as typed on a Slovak keyboard.
    const n = Math.round(parseFloat(String(local).replace(',', '.')) * 100) / 100;
    if (Number.isFinite(n) && n >= MIN_AI_FACTOR && n <= MAX_AI_FACTOR) save(n);
    else setLocal(String(aiFactor));
  };

  return (
    <Card className={className}>
      <CardHeader icon={<Sparkles />} title="AI factor"
        description="AI-assisted entries bill their tracked time multiplied by this factor." />
      <CardBody>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="text" inputMode="decimal" value={local} aria-label="AI factor"
            onChange={(e) => setLocal(e.target.value)} onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
            suffix="×" wrapperClassName="w-24" className="text-right" />
          {PRESETS.map(p => (
            <Button key={p} size="sm" variant={p === aiFactor ? 'primary' : 'secondary'} aria-pressed={p === aiFactor}
              onClick={() => save(p)}>×{p}</Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-fg-subtle">
          From ×{MIN_AI_FACTOR} to ×{MAX_AI_FACTOR}, default ×{DEFAULT_AI_FACTOR}. A change applies to every AI-assisted entry, past and future,
          so totals of earlier work change too, including work you already invoiced.
        </p>
      </CardBody>
    </Card>
  );
}
