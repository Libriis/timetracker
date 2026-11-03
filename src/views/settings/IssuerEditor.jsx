import { useState, useEffect } from 'react';
import { Building2 } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';
import { Field, Input } from '../../components/ui/Input.jsx';

export function IssuerEditor({ issuer, onSaveIssuer }) {
  const [local, setLocal] = useState(issuer);
  useEffect(() => setLocal(issuer), [issuer]);
  const fields = [
    { key: 'name', label: 'Name / company', placeholder: 'DEV1S s.r.o.', wide: true },
    { key: 'address', label: 'Address', placeholder: 'Street 1, 060 01 Kežmarok', wide: true },
    { key: 'regId', label: 'Reg. No (IČO)', placeholder: '12345678' },
    { key: 'taxId', label: 'Tax ID (DIČ)', placeholder: '1234567890' },
    { key: 'vatId', label: 'VAT ID (IČ DPH)', placeholder: 'SK1234567890' },
    { key: 'iban', label: 'IBAN', placeholder: 'SK00 0000 0000 0000 0000 0000' },
    { key: 'email', label: 'Email', placeholder: 'invoice@dev1s.sk' },
    { key: 'phone', label: 'Phone', placeholder: '+421 900 000 000' },
  ];
  const update = (key, value) => {
    const next = { ...local, [key]: value };
    setLocal(next);
  };
  const commit = () => onSaveIssuer(local);
  return (
    <Card>
      <CardHeader icon={<Building2 />} title="Supplier details" description="Printed on invoices. Leave blank to keep plain time reports." />
      <CardBody>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" onBlur={commit}>
          {fields.map(f => (
            <Field key={f.key} label={f.label} className={f.wide ? 'sm:col-span-2' : ''}>
              <Input value={local[f.key] ?? ''} onChange={(e) => update(f.key, e.target.value)} placeholder={f.placeholder} />
            </Field>
          ))}
          <Field label="Footer note" hint="Optional" className="sm:col-span-2">
            <Input value={local.note ?? ''} onChange={(e) => update('note', e.target.value)} placeholder="e.g. Not a VAT payer / reverse charge applies" />
          </Field>
        </div>
      </CardBody>
    </Card>
  );
}
