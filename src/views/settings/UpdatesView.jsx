import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { cn } from '../../lib/cn.js';
import { IS_TAURI } from '../../lib/platform.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardBody, CardHeader } from '../../components/ui/Card.jsx';

export function UpdatesView() {
  const [version, setVersion] = useState('');
  const [status, setStatus] = useState(null); // { type, msg }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!IS_TAURI) return;
    getVersion().then(setVersion).catch(() => {});
  }, []);

  const doCheck = async () => {
    if (!IS_TAURI) { setStatus({ type: 'err', msg: 'Updates are only available in the installed desktop app.' }); return; }
    setBusy(true);
    setStatus({ type: 'info', msg: 'Checking for updates…' });
    try {
      const update = await check();
      if (!update) {
        setStatus({ type: 'ok', msg: 'You are on the latest version.' });
      } else {
        setStatus({ type: 'info', msg: `Update ${update.version} available — downloading…` });
        await update.downloadAndInstall();
        setStatus({ type: 'ok', msg: 'Update installed — restarting…' });
        await relaunch();
      }
    } catch (err) {
      console.error(err);
      setStatus({ type: 'err', msg: 'Could not check for updates (no update server configured yet).' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="App updates" description={`Current version ${version ? `v${version}` : '—'}. Installs a newer signed build when one is out.`}
        actions={<Button variant="secondary" size="sm" onClick={doCheck} disabled={busy}><RefreshCw className={cn(busy && 'animate-spin')} /> Check for updates</Button>} />
      <CardBody className="pt-3">
        {status ? (
          <div role="status" className={cn('rounded-lg border px-3 py-2 text-sm',
            status.type === 'ok' ? 'border-free/30 bg-free-soft text-free-text'
              : status.type === 'err' ? 'border-danger/30 bg-danger-soft text-danger-text'
                : 'border-line bg-surface-2 text-fg-muted')}>
            {status.msg}
          </div>
        ) : <div className="text-xs text-fg-subtle">The app also checks once at startup.</div>}
      </CardBody>
    </Card>
  );
}
