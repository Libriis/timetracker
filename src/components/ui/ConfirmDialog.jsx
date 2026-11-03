import { AlertTriangle, HelpCircle } from 'lucide-react';
import { Button } from './Button.jsx';
import { Modal } from './Modal.jsx';

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose} size="sm" describeBody
      icon={danger ? <AlertTriangle className="!text-danger-text" /> : <HelpCircle />}
      footer={(
        <>
          {/* Focus starts on Cancel: one stray Enter must never delete or overwrite data. */}
          <Button variant="secondary" data-autofocus onClick={onClose}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
        </>
      )}>
      <div className="text-sm leading-[21px] text-fg-muted">{message}</div>
    </Modal>
  );
}
