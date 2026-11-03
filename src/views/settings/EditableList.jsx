import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { ClientDot } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Input } from '../../components/ui/Input.jsx';

export function EditableList({ title, items, onSave, placeholder, clientDots = false }) {
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim();
    if (!v || items.includes(v)) return;
    onSave([...items, v]);
    setInput('');
  };
  return (
    <Card className="flex flex-col">
      <CardHeader title={title} actions={<span className="text-xs text-fg-subtle tnum">{items.length}</span>} />
      <ul className="mt-3 flex-1 divide-y divide-line border-y border-line">
        {items.map(item => (
          <li key={item} className="group flex items-center gap-2.5 px-5 py-2">
            {clientDots && <ClientDot client={item} />}
            <span className="min-w-0 flex-1 truncate text-sm text-fg">{item}</span>
            <Button variant="danger-ghost" size="icon-xs" aria-label={`Remove ${item}`} onClick={() => onSave(items.filter(i => i !== item))}
              className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"><X /></Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 p-4">
        <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={placeholder} size="sm" />
        <Button variant="secondary" size="icon-sm" onClick={add} aria-label="Add" disabled={!input.trim()}><Plus /></Button>
      </div>
    </Card>
  );
}
