import { Button } from './Button.jsx';

export function QuickRangeBtn({ label, onClick }) {
  return <Button variant="subtle" size="sm" onClick={onClick}>{label}</Button>;
}
