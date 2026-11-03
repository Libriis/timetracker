import { Gift } from 'lucide-react';
import { SwitchRow } from './Switch.jsx';

export function FreeToggle({ free, setFree }) {
  return (
    <SwitchRow tone="free" icon={<Gift />} checked={free} onChange={setFree}
      label="Free of charge (complimentary)"
      description={free
        ? 'Tracked but billed at €0. It appears with a goodwill note in the report.'
        : 'Turn on to give this work as a goodwill gesture.'} />
  );
}
