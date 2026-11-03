import { useRef } from 'react';
import { Download, FolderOpen, ShieldCheck, Upload } from 'lucide-react';
import { openBackupFolder } from '../../lib/backup.js';
import { IS_TAURI } from '../../lib/platform.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';

export function DataBackup({ entryCount, onExport, onImport, onRequestConfirm, pushToast }) {
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (err) {
      console.error(err);
      pushToast('Could not read file — it is not valid JSON.', 'err');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    if (inputRef.current) inputRef.current.value = '';
    onRequestConfirm({
      title: 'Restore from backup?',
      message: 'This replaces ALL current data (entries, clients, rates and settings) with the contents of this backup file. Export a backup of your current data first if unsure.',
      confirmLabel: 'Restore', danger: true,
      onConfirm: () => {
        try {
          const count = onImport(parsed);
          pushToast(`Restored ${count} ${count === 1 ? 'entry' : 'entries'} and settings from backup.`, 'ok');
        } catch (err) {
          console.error(err);
          pushToast('Import failed: ' + (err.message || String(err)), 'err');
        }
      },
    });
  };

  const reveal = async () => {
    try { await openBackupFolder(); }
    catch (err) { console.error(err); pushToast('Could not open the backup folder yet (it is created after the first change).', 'err'); }
  };

  return (
    <Card>
      <CardHeader icon={<ShieldCheck />} title="Data & backup"
        actions={<span className="text-xs text-fg-subtle tnum">{entryCount} {entryCount === 1 ? 'entry' : 'entries'} stored</span>} />
      <CardBody>
        <p className="text-sm leading-[21px] text-fg-muted">
          Your data lives only on this device.{IS_TAURI ? ' It is mirrored to a backups folder automatically (one snapshot a day, the last 30 kept).' : ''} Export a JSON backup before you reinstall or move machines. It is the only file that restores into the app. CSV and PDF exports are reports, not backups.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={onExport}><Download /> Export backup (JSON)</Button>
          <Button variant="secondary" onClick={() => inputRef.current && inputRef.current.click()}><Upload /> Restore from backup</Button>
          {IS_TAURI && <Button variant="secondary" onClick={reveal}><FolderOpen /> Open backup folder</Button>}
          <input ref={inputRef} type="file" accept="application/json,.json" className="hidden"
            onChange={(e) => handleFile(e.target.files && e.target.files[0])} />
        </div>
      </CardBody>
    </Card>
  );
}
