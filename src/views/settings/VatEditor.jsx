import { useState, useEffect } from 'react';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';
import { Input } from '../../components/ui/Input.jsx';

export function VatEditor({ vat, onSaveVat }) {
  const [local, setLocal] = useState(vat);
  useEffect(() => setLocal(vat), [vat]);
  const commit = () => {
    const n = parseFloat(local);
    if (!isNaN(n) && n >= 0 && n <= 100) onSaveVat(n);
    else setLocal(vat);
  };
  return (
    <Card>
      <CardHeader title="VAT rate" description="Shown on amounts incl. VAT across the app." />
      <CardBody>
        <Input type="number" min="0" max="100" step="0.5" value={local} aria-label="Default VAT rate"
          onChange={(e) => setLocal(e.target.value)} onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
          suffix="%" wrapperClassName="w-32" className="text-right" />
        <p className="mt-2 text-xs text-fg-subtle">SK 23% from 2025. Use 0% for reverse charge or non-VAT clients.</p>
      </CardBody>
    </Card>
  );
}
