import { writeTextFile, readDir, mkdir, exists, remove, BaseDirectory } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { IS_TAURI } from './platform.js';

// Mirror the full dataset to disk so data survives even if the in-app (localStorage)
// store is cleared. Writes an always-current "latest.json" plus one snapshot per day,
// and prunes daily snapshots beyond the most recent 30. No-op outside Tauri.
// A dev build (`npm run tauri dev`) runs from http://localhost:1420, so it has its own
// localStorage (separate from the installed app), but it shares the same AppData folder.
// It must never overwrite the real backups, so dev writes to "backups-dev".
const BACKUP_DIR = import.meta.env?.DEV ? 'backups-dev' : 'backups';

export async function writeDiskBackup(data) {
  if (!IS_TAURI) return;
  const dir = BACKUP_DIR;
  try {
    if (!(await exists(dir, { baseDir: BaseDirectory.AppData }))) {
      await mkdir(dir, { baseDir: BaseDirectory.AppData, recursive: true });
    }
    const payload = JSON.stringify({ app: 'timetracker', version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
    await writeTextFile(`${dir}/latest.json`, payload, { baseDir: BaseDirectory.AppData });
    const day = new Date().toISOString().slice(0, 10);
    await writeTextFile(`${dir}/backup-${day}.json`, payload, { baseDir: BaseDirectory.AppData });
    try {
      const items = await readDir(dir, { baseDir: BaseDirectory.AppData });
      const dailies = items
        .filter(i => i.isFile && /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(i.name))
        .map(i => i.name).sort();
      for (const name of dailies.slice(0, Math.max(0, dailies.length - 30))) {
        await remove(`${dir}/${name}`, { baseDir: BaseDirectory.AppData });
      }
    } catch (e) { /* pruning is best-effort */ }
  } catch (e) {
    console.error('Disk backup failed:', e);
  }
}

export async function openBackupFolder() {
  if (!IS_TAURI) return;
  const base = await appDataDir();
  const dir = await join(base, BACKUP_DIR);
  await revealItemInDir(dir);
}
