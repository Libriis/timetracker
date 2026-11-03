import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getVat, getRounding } from '../../lib/billing.js';
import { cn } from '../../lib/cn.js';
import { Badge, ClientDot } from '../../components/ui/Badge.jsx';
import { Card, CardHeader, SectionLabel } from '../../components/ui/Card.jsx';
import { Input } from '../../components/ui/Input.jsx';

export function ClientOverrides({ clients, tasks, rates, clientRates, vat, clientVat, rounding, clientRounding, onSaveClientRates, onSaveClientVat, onSaveClientRounding }) {
  const [expanded, setExpanded] = useState(null);

  const setRate = (client, task, value) => {
    const num = parseFloat(value);
    const next = { ...clientRates };
    if (!next[client]) next[client] = {};
    if (value === '' || isNaN(num)) {
      delete next[client][task];
      if (Object.keys(next[client]).length === 0) delete next[client];
    } else {
      next[client] = { ...next[client], [task]: num };
    }
    onSaveClientRates(next);
  };
  const setClientVatRate = (client, value) => {
    const num = parseFloat(value);
    const next = { ...clientVat };
    if (value === '' || isNaN(num)) delete next[client]; else next[client] = num;
    onSaveClientVat(next);
  };
  const setClientRoundingValue = (client, value) => {
    const next = { ...clientRounding };
    if (value === '' || value == null || (typeof value === 'string' && value.trim() === '')) {
      delete next[client];
    } else {
      const num = parseFloat(value);
      if (isNaN(num)) delete next[client]; else next[client] = num;
    }
    onSaveClientRounding(next);
  };

  const overrideCount = (client) => {
    const rateCount = Object.keys(clientRates[client] || {}).length;
    const hasVat = clientVat[client] != null;
    const hasRounding = clientRounding[client] != null;
    return rateCount + (hasVat ? 1 : 0) + (hasRounding ? 1 : 0);
  };

  const roundingPresets = [
    { value: 0, label: 'Off' }, { value: 5, label: '5m' }, { value: 10, label: '10m' },
    { value: 15, label: '15m' }, { value: 30, label: '30m' }, { value: 60, label: '1h' },
  ];
  const chip = (on) => cn('h-7 rounded-md border px-2.5 text-xs font-medium outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring/50',
    on ? 'border-primary bg-primary text-primary-fg' : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg');

  return (
    <Card>
      <CardHeader title="Per-client overrides" description="Set a different VAT, rounding or rate for one client. Empty fields use the defaults." />
      <ul className="mt-3 divide-y divide-line border-t border-line">
        {clients.map(client => {
          const isOpen = expanded === client;
          const count = overrideCount(client);
          const effectiveVat = getVat(client, vat, clientVat);
          const effectiveRounding = getRounding(client, rounding, clientRounding);
          const clientRoundingValue = clientRounding[client];
          return (
            <li key={client}>
              <button type="button" onClick={() => setExpanded(isOpen ? null : client)} aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-5 py-3 text-left outline-none transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50">
                <ClientDot client={client} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{client}</span>
                <span className="hidden whitespace-nowrap text-xs text-fg-subtle tnum sm:inline">VAT {effectiveVat}% · {effectiveRounding > 0 ? `${effectiveRounding}-min` : 'exact'}</span>
                {count > 0 && <Badge variant="outline">{count} {count === 1 ? 'override' : 'overrides'}</Badge>}
                <ChevronDown className={cn('size-4 text-fg-subtle transition-transform duration-base', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <div className="space-y-4 bg-surface-2/50 px-5 pb-5 pt-2">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border border-line bg-surface p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-fg">VAT rate</span>
                        <span className="text-xs text-fg-subtle tnum">default {vat}%</span>
                      </div>
                      <Input type="number" min="0" max="100" step="0.5" value={clientVat[client] ?? ''} aria-label={`${client} VAT`}
                        onChange={(e) => setClientVatRate(client, e.target.value)} placeholder="Default"
                        size="sm" suffix="%" wrapperClassName="mt-2 w-32" className="text-right" />
                      <div className="mt-1.5 text-xs text-fg-subtle">Set 0 for reverse charge or non-VAT clients.</div>
                    </div>
                    <div className="rounded-lg border border-line bg-surface p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-fg">Billing rounding</span>
                        <span className="text-xs text-fg-subtle">default {rounding > 0 ? `${rounding}-min` : 'exact'}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <button type="button" onClick={() => setClientRoundingValue(client, '')} className={chip(clientRoundingValue == null)}>Default</button>
                        {roundingPresets.map(p => (
                          <button type="button" key={p.value} onClick={() => setClientRoundingValue(client, p.value)} className={chip(clientRoundingValue === p.value)}>{p.label}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <SectionLabel className="mb-2">Hourly rates</SectionLabel>
                    <div className="divide-y divide-line rounded-lg border border-line bg-surface">
                      {tasks.map(task => {
                        const overrideValue = clientRates[client]?.[task];
                        const defaultValue = rates[task] || 0;
                        return (
                          <div key={task} className="flex items-center gap-3 px-3 py-2">
                            <span className="min-w-0 flex-1 truncate text-sm text-fg">{task}</span>
                            <span className="whitespace-nowrap text-xs text-fg-subtle tnum">default €{defaultValue}/h</span>
                            <Input type="number" min="0" step="0.5" value={overrideValue ?? ''} aria-label={`${client} ${task} rate`}
                              onChange={(e) => setRate(client, task, e.target.value)} placeholder="—"
                              size="sm" suffix="€/h" wrapperClassName="w-28" className="text-right" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
