import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { DEFAULT_DESCRIPTIONS } from '../../lib/constants.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Textarea } from '../../components/ui/Input.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';

export function DescriptionsEditor({ tasks, descriptions, onSaveDescriptions }) {
  const [language, setLanguage] = useState('en');
  const [expanded, setExpanded] = useState(null);

  const updateText = (task, value) => {
    const next = {
      en: { ...(descriptions.en || {}) },
      sk: { ...(descriptions.sk || {}) },
    };
    if (!next[language]) next[language] = {};
    if (value === '' || value == null) {
      delete next[language][task];
    } else {
      next[language][task] = value;
    }
    onSaveDescriptions(next);
  };

  const resetToDefault = (task) => {
    const next = {
      en: { ...(descriptions.en || {}) },
      sk: { ...(descriptions.sk || {}) },
    };
    if (DEFAULT_DESCRIPTIONS[language]?.[task]) {
      next[language][task] = DEFAULT_DESCRIPTIONS[language][task];
    } else {
      delete next[language][task];
    }
    onSaveDescriptions(next);
  };

  const isCustom = (task) => {
    const current = descriptions[language]?.[task];
    const def = DEFAULT_DESCRIPTIONS[language]?.[task];
    if (current == null && def == null) return false;
    return current !== def;
  };

  return (
    <Card>
      <CardHeader title="Activity descriptions" description="The glossary on PDF reports. Leave one empty to hide it."
        actions={<SegmentedControl size="sm" label="Language" value={language} onChange={setLanguage} options={[{ value: 'en', label: 'EN' }, { value: 'sk', label: 'SK' }]} />} />
      <ul className="mt-3 divide-y divide-line border-t border-line">
        {tasks.map(task => {
          const isOpen = expanded === task;
          const value = descriptions[language]?.[task] ?? '';
          const customized = isCustom(task);
          const hasValue = value.trim().length > 0;
          return (
            <li key={task}>
              <button type="button" onClick={() => setExpanded(isOpen ? null : task)} aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-5 py-3 text-left outline-none transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{task}</span>
                {!hasValue && <Badge variant="neutral">Empty</Badge>}
                {customized && hasValue && <Badge variant="outline">Edited</Badge>}
                <ChevronDown className={cn('size-4 text-fg-subtle transition-transform duration-base', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <div className="space-y-2 bg-surface-2/50 px-5 pb-4 pt-1">
                  <Textarea value={value} onChange={(e) => updateText(task, e.target.value)}
                    placeholder={DEFAULT_DESCRIPTIONS[language]?.[task] || 'Describe this activity for the client…'} rows={3} />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-fg-subtle tnum">{value.length} characters</span>
                    {customized && (
                      <button type="button" onClick={() => resetToDefault(task)} className="font-medium text-fg-muted underline decoration-fg/25 underline-offset-2 hover:text-fg">Reset to default</button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {tasks.length === 0 && <li className="px-5 py-6 text-center text-sm text-fg-subtle">Add activities below to write descriptions.</li>}
      </ul>
    </Card>
  );
}
