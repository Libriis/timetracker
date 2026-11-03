import { SwitchRow } from './Switch.jsx';

// Legacy name kept for existing imports. Prefer SwitchRow from './Switch.jsx'.
export function ToggleRow({ label, description, checked, onChange, icon }) {
  return <SwitchRow label={label} description={description} checked={checked} onChange={onChange} icon={icon} />;
}
