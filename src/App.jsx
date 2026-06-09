import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Plus, Trash2, Edit2, Download, X, Check, Clock, BarChart3, List, Settings, RefreshCw, FolderOpen, Building2, TrendingUp } from 'lucide-react';
import { writeTextFile, readDir, mkdir, exists, remove, BaseDirectory } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

const IS_TAURI = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

// Mirror the full dataset to disk so data survives even if the in-app (localStorage)
// store is cleared. Writes an always-current "latest.json" plus one snapshot per day,
// and prunes daily snapshots beyond the most recent 30. No-op outside Tauri.
async function writeDiskBackup(data) {
  if (!IS_TAURI) return;
  const dir = 'backups';
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

async function openBackupFolder() {
  if (!IS_TAURI) return;
  const base = await appDataDir();
  const dir = await join(base, 'backups');
  await revealItemInDir(dir);
}

const DEFAULT_CLIENTS = ['DEV1S', '1. MFK Kežmarok', 'Pohrebné a kamenárske služby Paciga', 'RCT Kežmarok', 'SportServis', 'Woodheat', 'Other'];
const DEFAULT_TASKS = ['Pre-production', 'Production (Photography)', 'Production (Videography)', 'Post-production', 'META Ads']; const DEFAULT_RATES = {
  'Pre-production': 15,
  'Production (Photography)': 40,
  'Production (Videography)': 70,
  'Post-production': 30,
  'META Ads': 15,
};
const DEFAULT_VAT = 23;
const DEFAULT_CLIENT_RATES = {};
const DEFAULT_CLIENT_VAT = {};
const DEFAULT_ROUNDING = 15;
const LONG_TIMER_WARN_MS = 8 * 3600000; // warn if a running timer exceeds 8 hours
const IDLE_THRESHOLD_S = 600; // offer to subtract idle time after 10 minutes away

// Normalise a stored timer to the current shape (id + pause tracking). Migrates older
// single-timer records that only had `startedAt`.
function normalizeTimer(tt) {
  const legacy = tt.runningSince === undefined && tt.accumulatedMs === undefined;
  return {
    id: tt.id || ('t_' + (tt.startedAt || Date.now()) + '_' + Math.random().toString(36).slice(2, 6)),
    client: tt.client,
    task: tt.task,
    project: tt.project || '',
    note: tt.note || '',
    startedAt: tt.startedAt,
    runningSince: legacy ? tt.startedAt : (tt.runningSince ?? null),
    accumulatedMs: tt.accumulatedMs || 0,
  };
}
const DEFAULT_CLIENT_ROUNDING = {};
const DEFAULT_DESCRIPTIONS = {
  en: {
    'Pre-production': 'Preparation before the shoot — script, planning, location scouting, scheduling, and technical prep.',
    'Production (Photography)': 'The actual photo shoot on location or in studio — direction, lighting, composition. The rate includes professional equipment.',
    'Production (Videography)': 'Video shooting — camera, lighting, sound, and stabilization. The rate covers professional gear.',
    'Post-production': 'Processing after the shoot — editing, color grading, retouching, audio, and exports. The final deliverable is created here.',
    'META Ads': 'Managing campaigns on Facebook and Instagram — strategy, creatives, optimization, and reporting.',
  },
  sk: {
    'Pre-production': 'Príprava pred natáčaním alebo fotografovaním — scenár, plánovanie, vyhľadávanie lokácií, harmonogram a technická príprava.',
    'Production (Photography)': 'Samotné fotografovanie na lokácii alebo v štúdiu — réžia, svetlo, kompozícia. Sadzba zahŕňa profesionálne vybavenie.',
    'Production (Videography)': 'Natáčanie videa — kamera, svetlo, zvuk, stabilizácia. Sadzba pokrýva profesionálnu výbavu.',
    'Post-production': 'Spracovanie po natáčaní — strih, farby, retuš, zvuk, exporty. Tu vzniká finálny produkt.',
    'META Ads': 'Správa kampaní na Facebook a Instagram — stratégia, kreatívy, optimalizácia, reporty.',
  },
};

// Supplier / issuer details, shown on the PDF when generating an invoice.
const DEFAULT_ISSUER = { name: '', address: '', regId: '', taxId: '', vatId: '', iban: '', email: '', phone: '', note: '' };

// No seeded entries — the log starts empty on a fresh install.
const SEED_ENTRIES = [];

// ---------- helpers ----------
function getRate(client, task, rates, clientRates) {
  const o = clientRates?.[client]?.[task];
  if (o != null && !isNaN(o)) return o;
  return rates[task] || 0;
}
function getVat(client, defaultVat, clientVat) {
  const o = clientVat?.[client];
  if (o != null && !isNaN(o)) return o;
  return defaultVat;
}
function getRounding(client, defaultRounding, clientRounding) {
  const o = clientRounding?.[client];
  if (o != null && !isNaN(o)) return o;
  return defaultRounding;
}
function roundedDuration(durationMs, roundingMinutes) {
  if (!roundingMinutes || roundingMinutes <= 0) return durationMs;
  const blockMs = roundingMinutes * 60000;
  return Math.ceil(durationMs / blockMs) * blockMs;
}
// Round monetary amounts to whole cents so line items always add up to the total on an invoice.
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function calcEarnings(entry, rates, clientRates, defaultRounding, clientRounding) {
  if (entry.free) return 0;
  const rate = getRate(entry.client, entry.task, rates, clientRates);
  const r = defaultRounding != null ? getRounding(entry.client, defaultRounding, clientRounding || {}) : 0;
  const billableMs = roundedDuration(entry.duration, r);
  return round2((billableMs / 3600000) * rate);
}

function calcStandardValue(entry, rates, clientRates, defaultRounding, clientRounding) {
  // What the entry would have cost if not free
  const rate = getRate(entry.client, entry.task, rates, clientRates);
  const r = defaultRounding != null ? getRounding(entry.client, defaultRounding, clientRounding || {}) : 0;
  const billableMs = roundedDuration(entry.duration, r);
  return round2((billableMs / 3600000) * rate);
}
function formatEUR(amount) {
  if (!amount) return '€0';
  if (amount < 1) return `€${amount.toFixed(2)}`;
  return `€${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: amount < 100 ? 2 : 0 })}`;
}
function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
function formatHours(ms) {
  const h = ms / 3600000;
  if (h < 1) return `${Math.round(ms / 60000)}m`;
  return `${h.toFixed(1)}h`;
}
function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function formatDate(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function formatShortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
export default function TimeTracker() {
  const [clients, setClients] = useState(DEFAULT_CLIENTS);
  const [tasks, setTasks] = useState(DEFAULT_TASKS);
  const [rates, setRates] = useState(DEFAULT_RATES);
  const [clientRates, setClientRates] = useState(DEFAULT_CLIENT_RATES);
  const [vat, setVat] = useState(DEFAULT_VAT);
  const [clientVat, setClientVat] = useState(DEFAULT_CLIENT_VAT);
  const [rounding, setRounding] = useState(DEFAULT_ROUNDING);
  const [clientRounding, setClientRounding] = useState(DEFAULT_CLIENT_ROUNDING);
  const [descriptions, setDescriptions] = useState(DEFAULT_DESCRIPTIONS);
  const [issuer, setIssuer] = useState(DEFAULT_ISSUER);
  const [csvFormat, setCsvFormat] = useState('standard'); // 'standard' | 'excel-sk'
  const [entries, setEntries] = useState(SEED_ENTRIES);
  const [loading, setLoading] = useState(true);

  const [activeTimers, setActiveTimers] = useState([]); // multiple concurrent timers
  const [now, setNow] = useState(Date.now());

  const [selectedClient, setSelectedClient] = useState(DEFAULT_CLIENTS[0]);
  const [selectedTask, setSelectedTask] = useState(DEFAULT_TASKS[0]);
  const [project, setProject] = useState('');
  const [note, setNote] = useState('');

  const [view, setView] = useState('dashboard');
  const [period, setPeriod] = useState('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [filterClient, setFilterClient] = useState('all');

  const [showManualEntry, setShowManualEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [pdfOptionsFor, setPdfOptionsFor] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  const intervalRef = useRef(null);
  const toggleTimerRef = useRef(() => {});
  const backupRef = useRef(null);

  // Load
  useEffect(() => {
    (async () => {
      try {
        const keys = ['clients', 'tasks', 'rates', 'clientRates', 'vat', 'clientVat', 'rounding', 'clientRounding', 'descriptions', 'issuer', 'csvFormat', 'entries', 'activeTimer', 'activeTimers'];
        const results = await Promise.all(keys.map(k => window.storage.get('tracker:' + k).catch(() => null)));
        const [c, t, r, cr, v, cv, rd, crd, dsc, iss, csvf, e, at, ats] = results;
        if (c?.value) setClients(JSON.parse(c.value));
        if (t?.value) setTasks(JSON.parse(t.value));
        if (r?.value) setRates(JSON.parse(r.value));
        if (cr?.value) setClientRates(JSON.parse(cr.value));
        if (v?.value) setVat(JSON.parse(v.value));
        if (cv?.value) setClientVat(JSON.parse(cv.value));
        if (rd?.value) setRounding(JSON.parse(rd.value));
        if (crd?.value) setClientRounding(JSON.parse(crd.value));
        if (dsc?.value) {
          const stored = JSON.parse(dsc.value);
          // Merge defaults with stored — defaults provide fallback for tasks not yet edited
          setDescriptions({
            en: { ...DEFAULT_DESCRIPTIONS.en, ...(stored.en || {}) },
            sk: { ...DEFAULT_DESCRIPTIONS.sk, ...(stored.sk || {}) },
          });
        }
        if (iss?.value) setIssuer({ ...DEFAULT_ISSUER, ...JSON.parse(iss.value) });
        if (csvf?.value) setCsvFormat(JSON.parse(csvf.value));
        if (e?.value) setEntries(JSON.parse(e.value));
        // Restore running timers: prefer the new array, fall back to a single legacy timer.
        if (ats?.value) {
          try { setActiveTimers(JSON.parse(ats.value).map(normalizeTimer)); } catch (e2) { console.error(e2); }
        } else if (at?.value) {
          try { setActiveTimers([normalizeTimer(JSON.parse(at.value))]); } catch (e2) { console.error(e2); }
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!activeTimers.some(t => t.runningSince)) return;
    setNow(Date.now());
    intervalRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(intervalRef.current);
  }, [activeTimers]);

  // Debounced mirror of the full dataset to disk (Tauri only) — survives a cleared in-app store.
  useEffect(() => {
    if (loading || !IS_TAURI) return;
    if (backupRef.current) clearTimeout(backupRef.current);
    backupRef.current = setTimeout(() => {
      writeDiskBackup({ clients, tasks, rates, clientRates, vat, clientVat, rounding, clientRounding, descriptions, issuer, entries });
    }, 1500);
    return () => { if (backupRef.current) clearTimeout(backupRef.current); };
  }, [loading, clients, tasks, rates, clientRates, vat, clientVat, rounding, clientRounding, descriptions, issuer, entries]);

  // The tray "Start / stop timer" item emits this event from Rust; toggle via a ref to avoid stale state.
  useEffect(() => {
    if (!IS_TAURI) return;
    let unlisten;
    listen('tray-toggle-timer', () => { toggleTimerRef.current(); }).then(fn => { unlisten = fn; }).catch(() => {});
    return () => { if (unlisten) unlisten(); };
  }, []);

  // While at least one timer runs, watch system idle time and offer to subtract away time from all running timers.
  useEffect(() => {
    if (!IS_TAURI || !activeTimers.some(t => t.runningSince)) return;
    let prev = 0;
    let cancelled = false;
    const poll = async () => {
      try {
        const idle = Number(await invoke('system_idle_seconds')) || 0;
        if (cancelled) return;
        if (prev >= IDLE_THRESHOLD_S && idle < 60) {
          const awayS = prev;
          const mins = Math.max(1, Math.round(awayS / 60));
          requestConfirm({
            title: 'Away from keyboard?',
            message: `Your computer was idle for about ${mins} minute${mins === 1 ? '' : 's'} while tracking. Subtract that idle time from the running timer(s)?`,
            confirmLabel: 'Subtract idle', cancelLabel: 'Keep it',
            onConfirm: () => setActiveTimers(ts => {
              const next = ts.map(t => t.runningSince ? { ...t, runningSince: Math.min(t.runningSince + awayS * 1000, Date.now()) } : t);
              window.storage.set('tracker:activeTimers', JSON.stringify(next)).catch(() => {});
              return next;
            }),
          });
        }
        prev = idle;
      } catch (e) { /* idle source unavailable */ }
    };
    const id = setInterval(poll, 20000);
    poll();
    return () => { cancelled = true; clearInterval(id); };
  }, [activeTimers]);

  // Check for a newer signed release once on startup and offer a one-click install.
  useEffect(() => {
    if (!IS_TAURI) return;
    let cancelled = false;
    (async () => {
      try {
        const update = await check();
        if (cancelled || !update) return;
        requestConfirm({
          title: 'Update available',
          message: `Version ${update.version} is available. Download and install it now? The app will restart.`,
          confirmLabel: 'Update now', cancelLabel: 'Later',
          onConfirm: async () => {
            try {
              pushToast('Downloading update…');
              await update.downloadAndInstall();
              await relaunch();
            } catch (err) {
              console.error(err);
              pushToast('Update failed: ' + (err.message || err), 'err');
            }
          },
        });
      } catch (e) { /* no update server reachable — stay silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveTo = (key, next, setter) => {
    setter(next);
    window.storage.set('tracker:' + key, JSON.stringify(next)).catch(e => console.error(e));
  };
  const saveClients = (n) => saveTo('clients', n, setClients);
  const saveTasks = (n) => saveTo('tasks', n, setTasks);
  const saveRates = (n) => saveTo('rates', n, setRates);
  const saveClientRates = (n) => saveTo('clientRates', n, setClientRates);
  const saveVat = (n) => saveTo('vat', n, setVat);
  const saveClientVat = (n) => saveTo('clientVat', n, setClientVat);
  const saveRounding = (n) => saveTo('rounding', n, setRounding);
  const saveClientRounding = (n) => saveTo('clientRounding', n, setClientRounding);
  const saveDescriptions = (n) => saveTo('descriptions', n, setDescriptions);
  const saveIssuer = (n) => saveTo('issuer', n, setIssuer);
  const saveCsvFormat = (n) => saveTo('csvFormat', n, setCsvFormat);
  const saveEntries = (n) => saveTo('entries', n, setEntries);
  const saveActiveTimers = (arr) => {
    setActiveTimers(arr);
    if (arr && arr.length) window.storage.set('tracker:activeTimers', JSON.stringify(arr)).catch(e => console.error(e));
    else window.storage.delete('tracker:activeTimers').catch(e => console.error(e));
  };

  // Worked time so far: completed (un-paused) segments + the segment running right now.
  const timerElapsed = (t) => (t.accumulatedMs || 0) + (t.runningSince ? Date.now() - t.runningSince : 0);
  const newTimerId = () => 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

  const startTimer = () => {
    const ts = Date.now();
    saveActiveTimers([...activeTimers, { id: newTimerId(), client: selectedClient, task: selectedTask, project, note, startedAt: ts, runningSince: ts, accumulatedMs: 0 }]);
    setNote('');
    setProject('');
  };
  // Continue an earlier piece of work: start an additional session pre-filled from an entry.
  const resumeWork = (work) => {
    const ts = Date.now();
    saveActiveTimers([...activeTimers, { id: newTimerId(), client: work.client, task: work.task, project: work.project || '', note: work.note || '', startedAt: ts, runningSince: ts, accumulatedMs: 0 }]);
    pushToast(`Started: ${work.client} · ${work.task}${work.project ? ' · ' + work.project : ''}`, 'ok');
  };
  const pauseTimer = (id) => saveActiveTimers(activeTimers.map(t => (t.id === id && t.runningSince) ? { ...t, accumulatedMs: timerElapsed(t), runningSince: null } : t));
  const resumeTimer = (id) => saveActiveTimers(activeTimers.map(t => (t.id === id && !t.runningSince) ? { ...t, runningSince: Date.now() } : t));
  const stopTimer = (id) => {
    const t = activeTimers.find(x => x.id === id);
    if (!t) return;
    const rest = activeTimers.filter(x => x.id !== id);
    const duration = timerElapsed(t);
    if (duration < 1000) { saveActiveTimers(rest); return; }
    const entry = {
      id: 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      client: t.client, task: t.task, project: t.project || '', note: t.note || '',
      start: t.startedAt, end: Date.now(), duration,
    };
    saveEntries([entry, ...entries]);
    saveActiveTimers(rest);
  };
  // Tray "Start / stop timer": no timers → start one; some running → pause all; all paused → resume all.
  toggleTimerRef.current = () => {
    if (activeTimers.length === 0) { startTimer(); return; }
    const anyRunning = activeTimers.some(t => t.runningSince);
    saveActiveTimers(activeTimers.map(t => anyRunning
      ? (t.runningSince ? { ...t, accumulatedMs: timerElapsed(t), runningSince: null } : t)
      : { ...t, runningSince: Date.now() }));
  };
  const deleteEntry = (id) => saveEntries(entries.filter(e => e.id !== id));
  const updateEntry = (u) => saveEntries(entries.map(e => e.id === u.id ? u : e));
  const addManualEntry = (entry) => saveEntries([entry, ...entries].sort((a, b) => b.start - a.start));

  const pushToast = (msg, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
  };
  const requestConfirm = (opts) => setConfirmState(opts);
  const confirmDeleteEntry = (entry) => requestConfirm({
    title: 'Delete entry?',
    message: `${entry.client} · ${entry.task}${entry.note ? ' — ' + entry.note : ''} · ${formatDuration(entry.duration)} will be permanently removed.`,
    confirmLabel: 'Delete', danger: true,
    onConfirm: () => deleteEntry(entry.id),
  });

  const periodStart = () => {
    const now = new Date();
    if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (period === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    if (period === 'custom' && customStart) return new Date(customStart + 'T00:00:00').getTime();
    return 0;
  };
  const periodEnd = () => {
    if (period === 'custom' && customEnd) return new Date(customEnd + 'T23:59:59.999').getTime();
    return Infinity;
  };

  const filteredEntries = entries.filter(e => {
    if (e.start < periodStart()) return false;
    if (e.start > periodEnd()) return false;
    if (filterClient !== 'all' && e.client !== filterClient) return false;
    return true;
  });

  const projectSuggestions = Array.from(new Set(entries.map(e => e.project).filter(Boolean)));

  // Most recent distinct pieces of work (client+task+project+note) for one-click continuation.
  const recentWork = (() => {
    const seen = new Set(); const out = [];
    [...entries].sort((a, b) => b.start - a.start).forEach(e => {
      const key = `${e.client}|${e.task}|${e.project || ''}|${e.note || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(e);
    });
    return out.slice(0, 5);
  })();

  const totalMs = filteredEntries.reduce((s, e) => s + e.duration, 0);
  // Billable time excludes complimentary (free) work, so it matches the billed earnings and the PDF report.
  const totalBillableMs = filteredEntries.reduce((s, e) => e.free ? s : s + roundedDuration(e.duration, getRounding(e.client, rounding, clientRounding)), 0);
  const totalEarnings = filteredEntries.reduce((s, e) => s + calcEarnings(e, rates, clientRates, rounding, clientRounding), 0);
  const totalComplimentary = filteredEntries.reduce((s, e) => e.free ? s + calcStandardValue(e, rates, clientRates, rounding, clientRounding) : s, 0);
  const complimentaryCount = filteredEntries.filter(e => e.free).length;

  const byClient = {};
  filteredEntries.forEach(e => {
    if (!byClient[e.client]) {
      byClient[e.client] = {
        total: 0, billable: 0, earnings: 0,
        complimentary: 0, complimentaryCount: 0,
        vat: getVat(e.client, vat, clientVat),
        rounding: getRounding(e.client, rounding, clientRounding),
        byTask: {},
      };
    }
    const earned = calcEarnings(e, rates, clientRates, rounding, clientRounding);
    const billableMs = e.free ? 0 : roundedDuration(e.duration, byClient[e.client].rounding);
    byClient[e.client].total += e.duration;
    byClient[e.client].billable += billableMs;
    byClient[e.client].earnings += earned;
    if (e.free) {
      byClient[e.client].complimentary += calcStandardValue(e, rates, clientRates, rounding, clientRounding);
      byClient[e.client].complimentaryCount += 1;
    }
    if (!byClient[e.client].byTask[e.task]) byClient[e.client].byTask[e.task] = { ms: 0, billable: 0, earnings: 0 };
    byClient[e.client].byTask[e.task].ms += e.duration;
    byClient[e.client].byTask[e.task].billable += billableMs;
    byClient[e.client].byTask[e.task].earnings += earned;
  });
  const totalGross = round2(Object.values(byClient).reduce((s, c) => s + c.earnings + round2(c.earnings * c.vat / 100), 0));

  const exportCSV = (list, suffix) => {
    const data = Array.isArray(list) ? list : entries;
    if (data.length === 0) { pushToast('No entries to export for the current selection.', 'err'); return; }
    const excel = csvFormat === 'excel-sk';
    const sep = excel ? ';' : ',';
    const num = (n, dp = 2) => { const s = Number(n).toFixed(dp); return excel ? s.replace('.', ',') : s; };
    const rows = [['Date', 'Client', 'Project', 'Task', 'Note', 'Free', 'Start', 'End', 'Duration (h)', 'Duration (hh:mm:ss)', 'Rounding (min)', 'Billable (h)', 'Rate (€/h)', 'Standard value (€)', 'Earnings net (€)', 'VAT %', 'Earnings with VAT (€)']];
    [...data].sort((a, b) => b.start - a.start).forEach(e => {
      const rate = getRate(e.client, e.task, rates, clientRates);
      const r = getRounding(e.client, rounding, clientRounding);
      const billableMs = roundedDuration(e.duration, r);
      const standardValue = calcStandardValue(e, rates, clientRates, rounding, clientRounding);
      const earnings = calcEarnings(e, rates, clientRates, rounding, clientRounding);
      const entryVat = getVat(e.client, vat, clientVat);
      const withVat = earnings * (1 + entryVat / 100);
      rows.push([
        new Date(e.start).toISOString().slice(0, 10), e.client, e.project || '', e.task, e.note || '',
        e.free ? 'YES' : '',
        new Date(e.start).toLocaleString(), new Date(e.end).toLocaleString(),
        num(e.duration / 3600000), formatDuration(e.duration),
        String(r), num(billableMs / 3600000),
        num(rate), num(standardValue),
        num(earnings), String(entryVat), num(withVat),
      ]);
    });
    const body = rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(sep)).join('\r\n');
    const csv = (excel ? 'sep=;\r\n' : '') + body;
    const blob = new Blob([excel ? '﻿' + csv : csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `time-tracker${suffix ? '-' + suffix : ''}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    pushToast(`Exported ${data.length} ${data.length === 1 ? 'entry' : 'entries'} to CSV.`, 'ok');
  };

  // CSV from the Dashboard honours the active client + period filter.
  const csvFilterSuffix = () => {
    const parts = [];
    if (filterClient !== 'all') parts.push(filterClient.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
    if (period !== 'all') parts.push(period === 'custom' ? `${customStart || 'start'}_${customEnd || 'end'}` : period);
    return parts.join('-');
  };
  const exportDashboardCSV = () => exportCSV(filteredEntries, csvFilterSuffix());

  const exportPDF = () => {
    if (filterClient === 'all') { pushToast('Select a specific client to generate a PDF report.', 'err'); return; }
    const clientEntries = filteredEntries.filter(e => e.client === filterClient).sort((a, b) => a.start - b.start);
    if (clientEntries.length === 0) { pushToast('No entries to export for this client and period.', 'err'); return; }
    setPdfOptionsFor({ entries: clientEntries });
  };

  const generatePDF = (options) => {
    if (!pdfOptionsFor) return;
    let html;
    try {
      html = buildPDFHTML({
        client: filterClient, entries: pdfOptionsFor.entries, rates, clientRates,
        vat: getVat(filterClient, vat, clientVat),
        rounding: getRounding(filterClient, rounding, clientRounding),
        period, customStart, customEnd,
        showDates: options.showDates,
        showTimes: options.showTimes,
        showNotes: options.showNotes,
        showVat: options.showVat,
        language: options.language,
        descriptions,
        issuer,
        invoiceMode: options.invoiceMode,
        invoiceNumber: options.invoiceNumber,
        issueDate: options.issueDate,
        dueDate: options.dueDate,
      });
    } catch (err) {
      console.error(err); pushToast('Error generating report: ' + (err.message || err), 'err'); return;
    }
    setPdfOptionsFor(null);
    printReportHTML(html, filterClient, pushToast);
  };

  // Full JSON backup — the only export that round-trips back into the app.
  const exportBackup = () => {
    const backup = {
      app: 'timetracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { clients, tasks, rates, clientRates, vat, clientVat, rounding, clientRounding, descriptions, entries },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timetracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Restore from a backup file. Accepts the wrapped backup or a bare data object.
  // Returns the number of valid entries imported. Throws on malformed input.
  const importBackup = (parsed) => {
    const data = parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
    if (!data || typeof data !== 'object') throw new Error('Unrecognised file format.');
    if (!Array.isArray(data.entries)) throw new Error('Missing "entries" list — is this a Time Tracker backup?');

    const validEntries = data.entries
      .filter(e => e && typeof e === 'object'
        && typeof e.client === 'string' && typeof e.task === 'string'
        && Number.isFinite(e.start) && Number.isFinite(e.end) && Number.isFinite(e.duration))
      .map(e => ({
        id: typeof e.id === 'string' && e.id ? e.id : 'e_' + e.start + '_' + Math.random().toString(36).slice(2, 8),
        client: e.client, task: e.task,
        project: typeof e.project === 'string' ? e.project : '',
        note: typeof e.note === 'string' ? e.note : '',
        free: !!e.free,
        start: e.start, end: e.end, duration: e.duration,
      }));
    if (validEntries.length === 0 && data.entries.length > 0) throw new Error('No valid entries found in the file.');

    if (Array.isArray(data.clients)) saveClients(data.clients);
    if (Array.isArray(data.tasks)) saveTasks(data.tasks);
    if (data.rates && typeof data.rates === 'object') saveRates(data.rates);
    if (data.clientRates && typeof data.clientRates === 'object') saveClientRates(data.clientRates);
    if (Number.isFinite(data.vat)) saveVat(data.vat);
    if (data.clientVat && typeof data.clientVat === 'object') saveClientVat(data.clientVat);
    if (Number.isFinite(data.rounding)) saveRounding(data.rounding);
    if (data.clientRounding && typeof data.clientRounding === 'object') saveClientRounding(data.clientRounding);
    if (data.descriptions && typeof data.descriptions === 'object') {
      saveDescriptions({
        en: { ...DEFAULT_DESCRIPTIONS.en, ...(data.descriptions.en || {}) },
        sk: { ...DEFAULT_DESCRIPTIONS.sk, ...(data.descriptions.sk || {}) },
      });
    }
    saveEntries(validEntries.sort((a, b) => b.start - a.start));
    return validEntries.length;
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center"><div className="text-slate-500">Loading…</div></div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <datalist id="project-suggestions">
        {projectSuggestions.map(p => <option key={p} value={p} />)}
      </datalist>
      <div className="max-w-5xl mx-auto p-4 md:p-6">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Clock className="w-6 h-6 text-amber-500" />
            <h1 className="text-xl font-semibold">Time Tracker</h1>
          </div>
          <nav className="flex gap-1 bg-slate-900 rounded-lg p-1">
            <NavBtn active={view === 'dashboard'} onClick={() => setView('dashboard')} icon={<BarChart3 className="w-4 h-4" />} label="Dashboard" />
            <NavBtn active={view === 'log'} onClick={() => setView('log')} icon={<List className="w-4 h-4" />} label="Log" />
            <NavBtn active={view === 'insights'} onClick={() => setView('insights')} icon={<TrendingUp className="w-4 h-4" />} label="Insights" />
            <NavBtn active={view === 'settings'} onClick={() => setView('settings')} icon={<Settings className="w-4 h-4" />} label="Settings" />
          </nav>
        </header>

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6">
          {activeTimers.length > 0 && (
            <div className="space-y-2 mb-5">
              {activeTimers.map(t => (
                <ActiveTimerRow key={t.id} timer={t} now={now} onPause={pauseTimer} onResume={resumeTimer} onStop={stopTimer} />
              ))}
            </div>
          )}
          <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">{activeTimers.length > 0 ? 'Start another session' : 'Start a new session'}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <Select label="Client" value={selectedClient} onChange={setSelectedClient} options={clients} />
                <Select label="Task" value={selectedTask} onChange={setSelectedTask} options={tasks} />
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Project (optional)</label>
                  <input value={project} onChange={(e) => setProject(e.target.value)} list="project-suggestions" placeholder="e.g. RECAP 05/2026"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Note (optional)</label>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. match preview post"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={startTimer} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white font-medium px-5 py-2.5 rounded-xl transition">
                  <Play className="w-4 h-4" /> Start timer
                </button>
                <button onClick={() => setShowManualEntry(true)} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl transition text-sm">
                  <Plus className="w-4 h-4" /> Add manual entry
                </button>
              </div>
              {recentWork.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-800">
                  <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-2">Continue recent work</div>
                  <div className="flex flex-wrap gap-1.5">
                    {recentWork.map(w => (
                      <button key={w.id} onClick={() => resumeWork(w)} title="Start a new session for this work"
                        className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg text-xs transition max-w-xs">
                        <Play className="w-3 h-3 text-amber-500 flex-shrink-0" />
                        <span className="truncate">{w.client} · {w.task}{w.project ? ` · ${w.project}` : ''}{w.note ? ` — ${w.note}` : ''}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
          </div>
        </section>

        {view === 'dashboard' && (
          <Dashboard
            period={period} setPeriod={setPeriod}
            customStart={customStart} setCustomStart={setCustomStart}
            customEnd={customEnd} setCustomEnd={setCustomEnd}
            filterClient={filterClient} setFilterClient={setFilterClient}
            clients={clients}
            totalMs={totalMs} totalBillableMs={totalBillableMs}
            totalEarnings={totalEarnings} totalGross={totalGross}
            totalComplimentary={totalComplimentary} complimentaryCount={complimentaryCount}
            byClient={byClient} filteredCount={filteredEntries.length}
            onExport={exportDashboardCSV} onExportPDF={exportPDF}
          />
        )}
        {view === 'log' && (
          <Log entries={entries} clients={clients} rates={rates} clientRates={clientRates}
            vat={vat} clientVat={clientVat}
            rounding={rounding} clientRounding={clientRounding}
            onDelete={confirmDeleteEntry} onEdit={setEditingEntry} onResume={resumeWork} onExport={exportCSV} />
        )}
        {view === 'insights' && (
          <InsightsView entries={entries} rates={rates} clientRates={clientRates}
            rounding={rounding} clientRounding={clientRounding} />
        )}
        {view === 'settings' && (
          <SettingsView clients={clients} tasks={tasks} rates={rates} clientRates={clientRates}
            vat={vat} clientVat={clientVat}
            rounding={rounding} clientRounding={clientRounding}
            descriptions={descriptions}
            onSaveClients={saveClients} onSaveTasks={saveTasks} onSaveRates={saveRates}
            onSaveClientRates={saveClientRates}
            onSaveVat={saveVat} onSaveClientVat={saveClientVat}
            onSaveRounding={saveRounding} onSaveClientRounding={saveClientRounding}
            onSaveDescriptions={saveDescriptions}
            issuer={issuer} onSaveIssuer={saveIssuer}
            csvFormat={csvFormat} onSaveCsvFormat={saveCsvFormat}
            entryCount={entries.length} onExportBackup={exportBackup} onImportBackup={importBackup}
            onRequestConfirm={requestConfirm} pushToast={pushToast} />
        )}
      </div>

      {showManualEntry && (
        <ManualEntryModal clients={clients} tasks={tasks}
          onClose={() => setShowManualEntry(false)}
          onSave={(entry) => { addManualEntry(entry); setShowManualEntry(false); }} />
      )}
      {editingEntry && (
        <EditEntryModal entry={editingEntry} clients={clients} tasks={tasks}
          onClose={() => setEditingEntry(null)}
          onSave={(u) => { updateEntry(u); setEditingEntry(null); }} />
      )}
      {pdfOptionsFor && (
        <PDFOptionsModal client={filterClient} entryCount={pdfOptionsFor.entries.length} issuer={issuer}
          onClose={() => setPdfOptionsFor(null)}
          onGenerate={generatePDF} />
      )}
      {confirmState && (
        <ConfirmDialog {...confirmState} onClose={() => setConfirmState(null)} />
      )}
      <ToastStack toasts={toasts} />
    </div>
  );
}

function ActiveTimerRow({ timer, now, onPause, onResume, onStop }) {
  const running = !!timer.runningSince;
  const elapsed = (timer.accumulatedMs || 0) + (running ? now - timer.runningSince : 0);
  const longWarn = running && elapsed >= LONG_TIMER_WARN_MS;
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-white truncate">{timer.client}</span>
          {timer.project && <span className="text-[10px] tracking-wide bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">{timer.project}</span>}
          {!running && <span className="text-[10px] uppercase tracking-wider bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">paused</span>}
        </div>
        <div className="text-xs text-slate-400 truncate">{timer.task}{timer.note && ` — ${timer.note}`}</div>
        {longWarn && <div className="text-[10px] text-amber-400 mt-0.5">Running {formatHours(elapsed)} — forgot to stop?</div>}
      </div>
      <div className="flex items-center gap-2 self-end sm:self-auto">
        <div className={`font-mono text-2xl tabular-nums ${!running ? 'text-slate-500' : longWarn ? 'text-red-400' : 'text-amber-400'}`}>{formatDuration(elapsed)}</div>
        {running ? (
          <button onClick={() => onPause(timer.id)} aria-label="Pause" title="Pause (breaks aren't counted)" className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"><Pause className="w-4 h-4" /></button>
        ) : (
          <button onClick={() => onResume(timer.id)} aria-label="Resume" title="Resume tracking" className="p-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition"><Play className="w-4 h-4" /></button>
        )}
        <button onClick={() => onStop(timer.id)} aria-label="Stop and save" title="Stop and save this session" className="p-2 rounded-lg bg-red-600 hover:bg-red-500 text-white transition"><Square className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

function NavBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition ${active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
      {icon}<span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Dashboard({ period, setPeriod, customStart, setCustomStart, customEnd, setCustomEnd, filterClient, setFilterClient, clients, totalMs, totalBillableMs, totalEarnings, totalGross, totalComplimentary, complimentaryCount, byClient, filteredCount, onExport, onExportPDF }) {
  const sortedClients = Object.entries(byClient).sort((a, b) => b[1].total - a[1].total);
  const todayStr = new Date().toISOString().slice(0, 10);
  const handleSelectCustom = () => {
    setPeriod('custom');
    if (!customStart) {
      const d = new Date(); d.setDate(d.getDate() - 7);
      setCustomStart(d.toISOString().slice(0, 10));
    }
    if (!customEnd) setCustomEnd(todayStr);
  };
  const periodSublabel = () => {
    if (period === 'all') return 'all time';
    if (period === 'today') return 'today';
    if (period === 'week') return 'this week';
    if (period === 'month') return 'this month';
    if (period === 'custom' && customStart && customEnd) return `${formatShortDate(customStart)} – ${formatShortDate(customEnd)}`;
    return 'custom range';
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-1 bg-slate-900 rounded-lg p-1">
          {['today', 'week', 'month', 'all'].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-sm capitalize transition ${period === p ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {p === 'today' ? 'Today' : p === 'week' ? 'This week' : p === 'month' ? 'This month' : 'All time'}
            </button>
          ))}
          <button onClick={handleSelectCustom}
            className={`px-3 py-1.5 rounded-md text-sm transition ${period === 'custom' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            Custom
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-sm">
            <option value="all">All clients</option>
            {clients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={onExport}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 px-3 py-1.5 rounded-lg text-sm transition">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={onExportPDF} disabled={filterClient === 'all'}
            title={filterClient === 'all' ? 'Select a specific client to enable PDF export' : 'Export client report as PDF'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition border ${filterClient === 'all' ? 'bg-slate-900/50 border-slate-800/50 text-slate-600 cursor-not-allowed' : 'bg-amber-600/10 hover:bg-amber-600/20 border-amber-700/40 text-amber-400'}`}>
            <Download className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {period === 'custom' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-4 flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs text-slate-500 mb-1">From</label>
            <input type="date" value={customStart} max={customEnd || undefined} onChange={(e) => setCustomStart(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600" />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-slate-500 mb-1">To</label>
            <input type="date" value={customEnd} min={customStart || undefined} onChange={(e) => setCustomEnd(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <QuickRangeBtn label="Last 7 days" onClick={() => { const d = new Date(); d.setDate(d.getDate() - 6); setCustomStart(d.toISOString().slice(0, 10)); setCustomEnd(todayStr); }} />
            <QuickRangeBtn label="Last 30 days" onClick={() => { const d = new Date(); d.setDate(d.getDate() - 29); setCustomStart(d.toISOString().slice(0, 10)); setCustomEnd(todayStr); }} />
            <QuickRangeBtn label="Last month" onClick={() => { const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth() - 1, 1); const last = new Date(now.getFullYear(), now.getMonth(), 0); setCustomStart(first.toISOString().slice(0, 10)); setCustomEnd(last.toISOString().slice(0, 10)); }} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <TimeStat label="Total tracked" trackedMs={totalMs} billableMs={totalBillableMs} sublabel={periodSublabel()} />
        <MoneyStat label="Earnings" netAmount={totalEarnings} grossAmount={totalGross} sublabel="billable" highlight />
        <Stat label="Sessions" value={filteredCount.toString()} sublabel="entries" />
        <Stat label="Clients active" value={Object.keys(byClient).length.toString()} sublabel="in period" />
      </div>

      {totalComplimentary > 0 && (
        <div className="bg-emerald-600/5 border border-emerald-700/30 rounded-2xl p-4 mb-6 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold mb-1">Complimentary work</div>
            <div className="text-sm text-slate-300">
              {complimentaryCount} {complimentaryCount === 1 ? 'session provided' : 'sessions provided'} as goodwill in this period.
            </div>
          </div>
          <div className="text-right whitespace-nowrap">
            <div className="text-xs text-slate-500">Standard value</div>
            <div className="font-mono text-lg text-emerald-400">{formatEUR(totalComplimentary)}</div>
          </div>
        </div>
      )}

      {sortedClients.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500">No tracked time in this period yet.</div>
      ) : (
        <div className="space-y-3">
          {sortedClients.map(([client, data]) => (
            <ClientCard key={client} client={client} data={data} totalMs={totalMs} />
          ))}
        </div>
      )}
    </div>
  );
}

function QuickRangeBtn({ label, onClick }) {
  return (
    <button onClick={onClick} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg text-xs whitespace-nowrap transition">{label}</button>
  );
}

function Stat({ label, value, sublabel }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">{label}</div>
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sublabel}</div>
    </div>
  );
}

function TimeStat({ label, trackedMs, billableMs, sublabel }) {
  const showBillable = billableMs !== trackedMs;
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">{label}</div>
      <div className="text-2xl font-semibold text-white">{formatHours(trackedMs)}</div>
      {showBillable && <div className="text-xs text-slate-500 mt-0.5">{formatHours(billableMs)} <span className="text-slate-600">billable</span></div>}
      <div className="text-xs text-slate-500 mt-1">{sublabel}</div>
    </div>
  );
}

function MoneyStat({ label, netAmount, grossAmount, sublabel, highlight }) {
  return (
    <div className={`bg-slate-900 border rounded-2xl p-5 ${highlight ? 'border-amber-700/50' : 'border-slate-800'}`}>
      <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">{label}</div>
      <div className={`text-2xl font-semibold ${highlight ? 'text-amber-400' : 'text-white'}`}>{formatEUR(netAmount)}</div>
      <div className="text-xs text-slate-500 mt-0.5">{formatEUR(grossAmount)} <span className="text-slate-600">incl. VAT</span></div>
      <div className="text-xs text-slate-500 mt-1">{sublabel}</div>
    </div>
  );
}

function ClientCard({ client, data, totalMs }) {
  const pct = totalMs > 0 ? (data.total / totalMs) * 100 : 0;
  const sortedTasks = Object.entries(data.byTask).sort((a, b) => b[1].ms - a[1].ms);
  const earningsWithVat = data.earnings * (1 + data.vat / 100);
  const showBillable = data.billable !== data.total;
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="min-w-0">
          <div className="font-medium text-white truncate">{client}</div>
          {data.rounding > 0 && (
            <div className="text-[10px] uppercase tracking-wider text-slate-600 mt-0.5">Rounded to {data.rounding}-min blocks</div>
          )}
        </div>
        <div className="text-right whitespace-nowrap">
          <div className="font-mono text-lg text-amber-400">{formatEUR(data.earnings)}</div>
          <div className="text-xs text-slate-500">{formatEUR(earningsWithVat)} <span className="text-slate-600">incl. {data.vat}%</span></div>
          <div className="text-xs text-slate-500 mt-0.5">
            {showBillable
              ? <>{formatHours(data.billable)} <span className="text-slate-600">/ {formatHours(data.total)} tracked</span></>
              : <>{formatHours(data.total)} · {pct.toFixed(1)}%</>
            }
          </div>
        </div>
      </div>
      {data.complimentaryCount > 0 && (
        <div className="bg-emerald-600/5 border border-emerald-700/30 rounded-lg px-3 py-2 mb-3 flex items-center justify-between text-xs">
          <span className="text-emerald-400">
            {data.complimentaryCount} complimentary {data.complimentaryCount === 1 ? 'session' : 'sessions'}
          </span>
          <span className="font-mono text-emerald-400">{formatEUR(data.complimentary)} <span className="text-slate-600">value</span></span>
        </div>
      )}
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
        <div className="h-full bg-amber-600" style={{ width: `${pct}%` }} />
      </div>
      <div className="space-y-1.5">
        {sortedTasks.map(([task, t]) => {
          const taskPct = (t.ms / data.total) * 100;
          const taskWithVat = t.earnings * (1 + data.vat / 100);
          const taskShowBillable = t.billable !== t.ms;
          return (
            <div key={task} className="flex items-center justify-between text-sm gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-slate-400 truncate">{task}</span>
                <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden max-w-[80px]">
                  <div className="h-full bg-slate-600" style={{ width: `${taskPct}%` }} />
                </div>
              </div>
              <div className="text-right whitespace-nowrap">
                <div className="font-mono text-slate-300">{formatHours(taskShowBillable ? t.billable : t.ms)}</div>
                {taskShowBillable && <div className="font-mono text-slate-600 text-[10px]">{formatHours(t.ms)} tracked</div>}
              </div>
              <div className="text-right whitespace-nowrap w-24">
                <div className="font-mono text-amber-400/80 text-sm">{formatEUR(t.earnings)}</div>
                <div className="font-mono text-slate-600 text-xs">{formatEUR(taskWithVat)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InsightsView({ entries, rates, clientRates, rounding, clientRounding }) {
  if (entries.length === 0) {
    return <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500">No data yet — track some time to see insights.</div>;
  }
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString(undefined, { month: 'short' }), year: d.getFullYear(), ms: 0, earnings: 0 });
  }
  const idx = {}; months.forEach((m, i) => { idx[m.key] = i; });
  const byClient = {};
  const byProject = {};
  entries.forEach(e => {
    const earned = calcEarnings(e, rates, clientRates, rounding, clientRounding);
    const d = new Date(e.start);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (idx[key] != null) { months[idx[key]].ms += e.duration; months[idx[key]].earnings += earned; }
    if (!byClient[e.client]) byClient[e.client] = { ms: 0, earnings: 0 };
    byClient[e.client].ms += e.duration; byClient[e.client].earnings += earned;
    const p = e.project || '';
    if (p) { if (!byProject[p]) byProject[p] = { ms: 0, earnings: 0 }; byProject[p].ms += e.duration; byProject[p].earnings += earned; }
  });
  const maxEarn = Math.max(1, ...months.map(m => m.earnings));
  const clientRows = Object.entries(byClient).map(([client, d]) => ({ client, ms: d.ms, earnings: d.earnings, rate: d.ms > 0 ? d.earnings / (d.ms / 3600000) : 0 })).sort((a, b) => b.rate - a.rate);
  const projectRows = Object.entries(byProject).map(([project, d]) => ({ project, ms: d.ms, earnings: d.earnings })).sort((a, b) => b.earnings - a.earnings).slice(0, 8);
  const thisMonth = months[11].earnings, lastMonth = months[10].earnings;
  const delta = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="text-sm font-medium text-white">Monthly earnings — last 12 months</div>
          {delta != null && <div className={`text-xs whitespace-nowrap ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}% vs last month</div>}
        </div>
        <div className="flex items-end gap-1.5 h-36">
          {months.map(m => (
            <div key={m.key} className="flex-1 flex flex-col items-center justify-end h-full" title={`${m.label} ${m.year}: ${formatEUR(m.earnings)} · ${formatHours(m.ms)}`}>
              <div className="text-[9px] text-slate-500 mb-1 font-mono leading-none">{m.earnings > 0 ? formatEUR(m.earnings) : ''}</div>
              <div className="w-full rounded-t bg-amber-600/80" style={{ height: `${(m.earnings / maxEarn) * 100}%`, minHeight: m.earnings > 0 ? '2px' : '0' }} />
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 mt-2">
          {months.map(m => <div key={m.key} className="flex-1 text-center text-[9px] text-slate-600">{m.label}</div>)}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="text-sm font-medium text-white mb-1">Effective hourly rate by client</div>
        <div className="text-xs text-slate-500 mb-4">Net earnings ÷ tracked time (all time) — what each client really pays per hour after free work and rounding.</div>
        <div className="space-y-1">
          {clientRows.map(r => (
            <div key={r.client} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-slate-800/60 last:border-0">
              <span className="text-slate-300 truncate flex-1 min-w-0">{r.client}</span>
              <span className="font-mono text-slate-500 text-xs whitespace-nowrap">{formatHours(r.ms)} · {formatEUR(r.earnings)}</span>
              <span className="font-mono text-amber-400 w-24 text-right whitespace-nowrap">{formatEUR(r.rate)}/h</span>
            </div>
          ))}
        </div>
      </div>

      {projectRows.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="text-sm font-medium text-white mb-4">Top projects by earnings</div>
          <div className="space-y-1">
            {projectRows.map(r => (
              <div key={r.project} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-slate-800/60 last:border-0">
                <span className="text-slate-300 truncate flex-1 min-w-0">{r.project}</span>
                <span className="font-mono text-slate-500 text-xs whitespace-nowrap">{formatHours(r.ms)}</span>
                <span className="font-mono text-amber-400 w-24 text-right">{formatEUR(r.earnings)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Log({ entries, clients, rates, clientRates, vat, clientVat, rounding, clientRounding, onDelete, onEdit, onResume, onExport }) {
  const [fClient, setFClient] = useState('all');
  const [fProject, setFProject] = useState('all');
  const [fPeriod, setFPeriod] = useState('all');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [search, setSearch] = useState('');

  if (entries.length === 0) {
    return <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500">No entries yet. Start a timer or add a manual entry.</div>;
  }

  const selectPeriod = (p) => {
    setFPeriod(p);
    if (p === 'custom' && !fFrom && !fTo) {
      const d = new Date(); d.setDate(d.getDate() - 30);
      setFFrom(d.toISOString().slice(0, 10));
      setFTo(new Date().toISOString().slice(0, 10));
    }
  };
  const periodFrom = () => {
    const now = new Date();
    if (fPeriod === 'week') { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0, 0, 0, 0); return d.getTime(); }
    if (fPeriod === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    if (fPeriod === 'year') return new Date(now.getFullYear(), 0, 1).getTime();
    if (fPeriod === 'custom' && fFrom) return new Date(fFrom + 'T00:00:00').getTime();
    return 0;
  };
  const periodTo = () => (fPeriod === 'custom' && fTo) ? new Date(fTo + 'T23:59:59.999').getTime() : Infinity;
  const q = search.trim().toLowerCase();
  const from = periodFrom();
  const to = periodTo();
  const filtered = entries.filter(e => {
    if (fClient !== 'all' && e.client !== fClient) return false;
    if (fProject !== 'all' && (e.project || '') !== fProject) return false;
    if (e.start < from || e.start > to) return false;
    if (q && !`${e.client} ${e.task} ${e.project || ''} ${e.note || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const clientOptions = Array.from(new Set([...(clients || []), ...entries.map(e => e.client)]));
  const projectOptions = Array.from(new Set(entries.map(e => e.project).filter(Boolean)));
  const exportSuffix = () => {
    const parts = [];
    if (fClient !== 'all') parts.push(fClient.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
    if (fProject !== 'all') parts.push(fProject.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
    if (fPeriod === 'custom') parts.push(`${fFrom || 'start'}_${fTo || 'end'}`);
    else if (fPeriod !== 'all') parts.push(fPeriod);
    if (q) parts.push('search');
    return parts.join('-');
  };

  // Totals for the current filter (the amount to invoice).
  const sums = filtered.reduce((a, e) => {
    const net = calcEarnings(e, rates, clientRates, rounding, clientRounding);
    const v = getVat(e.client, vat, clientVat);
    a.ms += e.duration;
    a.billableMs += e.free ? 0 : roundedDuration(e.duration, getRounding(e.client, rounding, clientRounding));
    a.net += net;
    a.vat += net * v / 100;
    if (e.free) a.freeCount += 1;
    return a;
  }, { ms: 0, billableMs: 0, net: 0, vat: 0, freeCount: 0 });
  const netTotal = round2(sums.net);
  const grossTotal = round2(netTotal + round2(sums.vat));

  const grouped = {};
  filtered.forEach(e => {
    const d = new Date(e.start).toISOString().slice(0, 10);
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(e);
  });
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
        <select value={fClient} onChange={(e) => setFClient(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-sm">
          <option value="all">All clients</option>
          {clientOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {projectOptions.length > 0 && (
          <select value={fProject} onChange={(e) => setFProject(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-sm">
            <option value="all">All projects</option>
            {projectOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <select value={fPeriod} onChange={(e) => selectPeriod(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-sm">
          <option value="all">All time</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
          <option value="year">This year</option>
          <option value="custom">Custom range…</option>
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes, task, client…"
          className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-amber-600 placeholder:text-slate-600" />
        <button onClick={() => onExport(filtered, exportSuffix())}
          className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 px-3 py-1.5 rounded-lg text-sm transition whitespace-nowrap">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>
      {fPeriod === 'custom' && (
        <div className="flex flex-col sm:flex-row sm:items-end gap-2 mb-3 bg-slate-900 border border-slate-800 rounded-xl p-3">
          <div className="flex-1">
            <label className="block text-xs text-slate-500 mb-1">From</label>
            <input type="date" value={fFrom} max={fTo || undefined} onChange={(e) => setFFrom(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-amber-600" />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-slate-500 mb-1">To</label>
            <input type="date" value={fTo} min={fFrom || undefined} onChange={(e) => setFTo(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-amber-600" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <QuickRangeBtn label="Last 7 days" onClick={() => { const d = new Date(); d.setDate(d.getDate() - 6); setFFrom(d.toISOString().slice(0, 10)); setFTo(new Date().toISOString().slice(0, 10)); }} />
            <QuickRangeBtn label="Last 30 days" onClick={() => { const d = new Date(); d.setDate(d.getDate() - 29); setFFrom(d.toISOString().slice(0, 10)); setFTo(new Date().toISOString().slice(0, 10)); }} />
            <QuickRangeBtn label="Last month" onClick={() => { const n = new Date(); const f = new Date(n.getFullYear(), n.getMonth() - 1, 1); const l = new Date(n.getFullYear(), n.getMonth(), 0); setFFrom(f.toISOString().slice(0, 10)); setFTo(l.toISOString().slice(0, 10)); }} />
          </div>
        </div>
      )}
      {filtered.length > 0 && (
        <div className="bg-slate-900 border border-amber-700/40 rounded-2xl p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <div><span className="text-slate-500">Entries </span><span className="text-slate-200 font-medium">{filtered.length}</span></div>
            <div><span className="text-slate-500">Tracked </span><span className="text-slate-200 font-medium">{formatHours(sums.ms)}</span>{sums.billableMs !== sums.ms && <span className="text-slate-500"> · {formatHours(sums.billableMs)} billable</span>}</div>
            <div><span className="text-slate-500">Net </span><span className="text-slate-200 font-medium">{formatEUR(netTotal)}</span></div>
            {sums.freeCount > 0 && <div className="text-emerald-400/80 text-xs">{sums.freeCount} free</div>}
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold">To invoice (incl. VAT)</div>
            <div className="font-mono text-2xl text-amber-400">{formatEUR(grossTotal)}</div>
          </div>
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500">No entries match the current filter.</div>
      ) : (
      <div className="space-y-5">
        {Object.entries(grouped).map(([date, dayEntries]) => {
          const dayMs = dayEntries.reduce((s, e) => s + e.duration, 0);
          const dayEur = dayEntries.reduce((s, e) => s + calcEarnings(e, rates, clientRates, rounding, clientRounding), 0);
          const dayVat = dayEntries.reduce((s, e) => {
            const v = getVat(e.client, vat, clientVat);
            return s + calcEarnings(e, rates, clientRates, rounding, clientRounding) * (1 + v / 100);
          }, 0);
          return (
            <div key={date}>
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="text-sm text-slate-400">{formatDate(date)}</div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-mono text-slate-500">{formatHours(dayMs)}</span>
                  <span className="font-mono text-amber-400/80">{formatEUR(dayEur)}</span>
                  <span className="font-mono text-slate-600 text-xs">{formatEUR(dayVat)} <span className="text-slate-700">incl.</span></span>
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                {dayEntries.map((e, i) => {
                  const earned = calcEarnings(e, rates, clientRates, rounding, clientRounding);
                  const standardValue = calcStandardValue(e, rates, clientRates, rounding, clientRounding);
                  const entryVat = getVat(e.client, vat, clientVat);
                  const earnedVat = earned * (1 + entryVat / 100);
                  const r = getRounding(e.client, rounding, clientRounding);
                  const billableMs = roundedDuration(e.duration, r);
                  const showBillable = billableMs !== e.duration;
                  return (
                    <div key={e.id} className={`p-4 flex items-center gap-3 ${i < dayEntries.length - 1 ? 'border-b border-slate-800' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium text-white">{e.client}</span>
                          <span className="text-slate-500">·</span>
                          <span className="text-sm text-slate-400">{e.task}</span>
                          {e.project && (
                            <span className="text-[10px] tracking-wide bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">{e.project}</span>
                          )}
                          {e.free && (
                            <span className="text-[10px] uppercase tracking-wider bg-emerald-600/20 text-emerald-400 px-1.5 py-0.5 rounded font-semibold">FREE</span>
                          )}
                        </div>
                        {e.note && <div className="text-sm text-slate-500 mt-0.5 truncate">{e.note}</div>}
                        <div className="text-xs text-slate-600 mt-1">{formatTime(e.start)} – {formatTime(e.end)}</div>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <div className="font-mono text-sm text-amber-400 tabular-nums">{formatDuration(e.duration)}</div>
                        {showBillable && <div className="font-mono text-[10px] text-slate-600">→ {formatDuration(billableMs)} billable</div>}
                        {e.free ? (
                          <>
                            <div className="font-mono text-xs text-emerald-400">€0 <span className="text-slate-600">(free)</span></div>
                            <div className="font-mono text-[10px] text-slate-600 line-through">{formatEUR(standardValue)} value</div>
                          </>
                        ) : (
                          <>
                            <div className="font-mono text-xs text-amber-400/70">{formatEUR(earned)}</div>
                            <div className="font-mono text-xs text-slate-600">{formatEUR(earnedVat)}</div>
                          </>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => onResume(e)} aria-label="Continue this work" className="p-1.5 text-slate-500 hover:text-amber-400 transition" title="Continue this work (start a new session)"><Play className="w-4 h-4" /></button>
                        <button onClick={() => onEdit(e)} aria-label="Edit entry" className="p-1.5 text-slate-500 hover:text-slate-200 transition" title="Edit"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => onDelete(e)} aria-label="Delete entry" className="p-1.5 text-slate-500 hover:text-red-400 transition" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

function SettingsView({ clients, tasks, rates, clientRates, vat, clientVat, rounding, clientRounding, descriptions, issuer, csvFormat, onSaveClients, onSaveTasks, onSaveRates, onSaveClientRates, onSaveVat, onSaveClientVat, onSaveRounding, onSaveClientRounding, onSaveDescriptions, onSaveIssuer, onSaveCsvFormat, entryCount, onExportBackup, onImportBackup, onRequestConfirm, pushToast }) {
  return (
    <div className="space-y-4">
      <IssuerEditor issuer={issuer} onSaveIssuer={onSaveIssuer} />
      <VatEditor vat={vat} onSaveVat={onSaveVat} />
      <RoundingEditor rounding={rounding} onSaveRounding={onSaveRounding} />
      <RateEditor tasks={tasks} rates={rates} onSaveRates={onSaveRates} />
      <ClientOverrides clients={clients} tasks={tasks} rates={rates} clientRates={clientRates}
        vat={vat} clientVat={clientVat} rounding={rounding} clientRounding={clientRounding}
        onSaveClientRates={onSaveClientRates} onSaveClientVat={onSaveClientVat} onSaveClientRounding={onSaveClientRounding} />
      <DescriptionsEditor tasks={tasks} descriptions={descriptions} onSaveDescriptions={onSaveDescriptions} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EditableList title="Clients" items={clients} onSave={onSaveClients} placeholder="New client name" />
        <EditableList title="Task types" items={tasks} onSave={onSaveTasks} placeholder="New task type" />
      </div>
      <CsvFormatEditor csvFormat={csvFormat} onSaveCsvFormat={onSaveCsvFormat} />
      <DataBackup entryCount={entryCount} onExport={onExportBackup} onImport={onImportBackup} onRequestConfirm={onRequestConfirm} pushToast={pushToast} />
      <UpdatesView />
    </div>
  );
}

function CsvFormatEditor({ csvFormat, onSaveCsvFormat }) {
  const opts = [
    { value: 'standard', label: 'Standard', hint: 'Comma separator, dot decimals (universal, most import tools)' },
    { value: 'excel-sk', label: 'Slovak Excel', hint: 'Semicolon separator, decimal comma, UTF-8 BOM — opens in columns in SK Excel' },
  ];
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="text-sm font-medium text-white mb-1">CSV export format</div>
      <div className="text-xs text-slate-500 mb-4">How the Dashboard/Log CSV export is formatted.</div>
      <div className="space-y-1.5">
        {opts.map(o => (
          <button key={o.value} type="button" onClick={() => onSaveCsvFormat(o.value)}
            className={`w-full flex items-start gap-3 border rounded-lg p-3 text-left transition ${csvFormat === o.value ? 'bg-amber-600/10 border-amber-700/50' : 'bg-slate-950 border-slate-800 hover:bg-slate-900'}`}>
            <div className={`mt-0.5 w-4 h-4 rounded-full border flex-shrink-0 ${csvFormat === o.value ? 'border-amber-500 bg-amber-500' : 'border-slate-600'}`} />
            <div className="min-w-0">
              <div className="text-sm text-slate-200">{o.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{o.hint}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function IssuerEditor({ issuer, onSaveIssuer }) {
  const [local, setLocal] = useState(issuer);
  useEffect(() => setLocal(issuer), [issuer]);
  const fields = [
    { key: 'name', label: 'Name / company', placeholder: 'DEV1S s.r.o.', wide: true },
    { key: 'address', label: 'Address', placeholder: 'Street 1, 060 01 Kežmarok', wide: true },
    { key: 'regId', label: 'Reg. No (IČO)', placeholder: '12345678' },
    { key: 'taxId', label: 'Tax ID (DIČ)', placeholder: '1234567890' },
    { key: 'vatId', label: 'VAT ID (IČ DPH)', placeholder: 'SK1234567890' },
    { key: 'iban', label: 'IBAN', placeholder: 'SK00 0000 0000 0000 0000 0000' },
    { key: 'email', label: 'Email', placeholder: 'invoice@dev1s.sk' },
    { key: 'phone', label: 'Phone', placeholder: '+421 900 000 000' },
  ];
  const update = (key, value) => {
    const next = { ...local, [key]: value };
    setLocal(next);
  };
  const commit = () => onSaveIssuer(local);
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-4 h-4 text-amber-500" />
        <div className="text-sm font-medium text-white">Supplier details (for invoices)</div>
      </div>
      <div className="text-xs text-slate-500 mb-4">Shown on the PDF when you generate it as an invoice. Leave blank to keep producing a plain time report.</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" onBlur={commit}>
        {fields.map(f => (
          <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
            <label className="block text-xs text-slate-500 mb-1">{f.label}</label>
            <input value={local[f.key] ?? ''} onChange={(e) => update(f.key, e.target.value)} placeholder={f.placeholder}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600 placeholder:text-slate-700" />
          </div>
        ))}
        <div className="sm:col-span-2">
          <label className="block text-xs text-slate-500 mb-1">Footer note (optional)</label>
          <input value={local.note ?? ''} onChange={(e) => update('note', e.target.value)} placeholder="e.g. Not a VAT payer / reverse charge applies"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600 placeholder:text-slate-700" />
        </div>
      </div>
    </div>
  );
}

function UpdatesView() {
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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="text-sm font-medium text-white mb-1">App updates</div>
      <div className="text-xs text-slate-500 mb-4">
        Current version {version ? `v${version}` : '—'}. Checks the release server and installs a newer signed build if available.
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={doCheck} disabled={busy}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition ${busy ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'}`}>
          <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> Check for updates
        </button>
      </div>
      {status && (
        <div className={`mt-3 text-xs rounded-lg px-3 py-2 border ${status.type === 'ok'
          ? 'bg-emerald-600/10 border-emerald-700/40 text-emerald-300'
          : status.type === 'err'
            ? 'bg-red-600/10 border-red-700/40 text-red-300'
            : 'bg-slate-800/60 border-slate-700/40 text-slate-300'}`}>
          {status.msg}
        </div>
      )}
    </div>
  );
}

function DataBackup({ entryCount, onExport, onImport, onRequestConfirm, pushToast }) {
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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="text-sm font-medium text-white mb-1">Data &amp; backup</div>
      <div className="text-xs text-slate-500 mb-4">
        Your data lives only on this device.{IS_TAURI ? ' It is mirrored automatically to a backups folder (a daily snapshot, last 30 kept).' : ''} Export a JSON backup before reinstalling or moving machines — it is the only file that restores back into the app. CSV and PDF exports are reports, not backups.
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onExport}
          className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-sm transition">
          <Download className="w-4 h-4" /> Export backup (JSON)
        </button>
        <button onClick={() => inputRef.current && inputRef.current.click()}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm transition">
          <Plus className="w-4 h-4" /> Restore from backup
        </button>
        {IS_TAURI && (
          <button onClick={reveal}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm transition">
            <FolderOpen className="w-4 h-4" /> Open backup folder
          </button>
        )}
        <input ref={inputRef} type="file" accept="application/json,.json" className="hidden"
          onChange={(e) => handleFile(e.target.files && e.target.files[0])} />
        <span className="text-xs text-slate-600">{entryCount} {entryCount === 1 ? 'entry' : 'entries'} stored</span>
      </div>
    </div>
  );
}

function DescriptionsEditor({ tasks, descriptions, onSaveDescriptions }) {
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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <div className="text-sm font-medium text-white">Activity descriptions</div>
          <div className="text-xs text-slate-500 mt-0.5">Shown in the PDF report glossary. Leave empty to hide a task from the glossary.</div>
        </div>
        <div className="flex gap-1 bg-slate-950 rounded-lg p-1 flex-shrink-0">
          <button type="button" onClick={() => setLanguage('en')}
            className={`px-2.5 py-1 rounded-md text-xs transition ${language === 'en' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            🇬🇧 EN
          </button>
          <button type="button" onClick={() => setLanguage('sk')}
            className={`px-2.5 py-1 rounded-md text-xs transition ${language === 'sk' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            🇸🇰 SK
          </button>
        </div>
      </div>
      <div className="space-y-2 mt-4">
        {tasks.map(task => {
          const isOpen = expanded === task;
          const value = descriptions[language]?.[task] ?? '';
          const customized = isCustom(task);
          const hasValue = value.trim().length > 0;
          return (
            <div key={task} className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
              <button onClick={() => setExpanded(isOpen ? null : task)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-900 transition">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-slate-200 truncate">{task}</span>
                  {!hasValue && <span className="text-[10px] uppercase tracking-wider text-slate-600">empty</span>}
                  {customized && hasValue && <span className="text-[10px] uppercase tracking-wider bg-amber-600/20 text-amber-400 px-1.5 py-0.5 rounded">edited</span>}
                </div>
                <span className="text-slate-500 text-sm">{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen && (
                <div className="border-t border-slate-800 p-3 space-y-2">
                  <textarea
                    value={value}
                    onChange={(e) => updateText(task, e.target.value)}
                    placeholder={DEFAULT_DESCRIPTIONS[language]?.[task] || 'Describe this activity for the client...'}
                    rows={3}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-600 resize-none placeholder:text-slate-700"
                  />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{value.length} characters</span>
                    {customized && (
                      <button onClick={() => resetToDefault(task)} className="text-slate-500 hover:text-amber-400 transition">
                        Reset to default
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {tasks.length === 0 && (
          <div className="text-sm text-slate-500 text-center py-3">Add task types below to write descriptions.</div>
        )}
      </div>
    </div>
  );
}

function VatEditor({ vat, onSaveVat }) {
  const [local, setLocal] = useState(vat);
  useEffect(() => setLocal(vat), [vat]);
  const commit = () => {
    const n = parseFloat(local);
    if (!isNaN(n) && n >= 0 && n <= 100) onSaveVat(n);
    else setLocal(vat);
  };
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="text-sm font-medium text-white mb-1">VAT rate</div>
      <div className="text-xs text-slate-500 mb-4">Used to display amounts including VAT throughout the app.</div>
      <div className="flex items-center gap-3">
        <input type="number" min="0" max="100" step="0.5" value={local}
          onChange={(e) => setLocal(e.target.value)} onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
          className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:border-amber-600" />
        <span className="text-sm text-slate-500">%</span>
        <span className="text-xs text-slate-600 ml-2">(SK 23% from 2025, 0% for reverse charge / non-VAT clients)</span>
      </div>
    </div>
  );
}

function RoundingEditor({ rounding, onSaveRounding }) {
  const presets = [
    { value: 0, label: 'Off (exact)' },
    { value: 5, label: '5 min' },
    { value: 10, label: '10 min' },
    { value: 15, label: '15 min' },
    { value: 30, label: '30 min' },
    { value: 60, label: '1 hour' },
  ];
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="text-sm font-medium text-white mb-1">Billing rounding</div>
      <div className="text-xs text-slate-500 mb-4">
        Round each entry up to the nearest billable block. Standard agency practice is 15 minutes — a 16-min session bills as 30 min.
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map(p => (
          <button key={p.value} onClick={() => onSaveRounding(p.value)}
            className={`px-3 py-1.5 rounded-md text-sm transition ${rounding === p.value ? 'bg-amber-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RateEditor({ tasks, rates, onSaveRates }) {
  const updateRate = (task, value) => {
    const num = parseFloat(value);
    onSaveRates({ ...rates, [task]: isNaN(num) ? 0 : num });
  };
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="text-sm font-medium text-white mb-1">Hourly rates</div>
      <div className="text-xs text-slate-500 mb-4">Default rate per task type in EUR.</div>
      <div className="space-y-2">
        {tasks.map(task => (
          <div key={task} className="flex items-center gap-3">
            <span className="text-sm text-slate-300 flex-1 truncate">{task}</span>
            <div className="flex items-center gap-1">
              <input type="number" min="0" step="0.5" value={rates[task] ?? ''}
                onChange={(e) => updateRate(task, e.target.value)} placeholder="0"
                className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:border-amber-600" />
              <span className="text-sm text-slate-500">€/h</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientOverrides({ clients, tasks, rates, clientRates, vat, clientVat, rounding, clientRounding, onSaveClientRates, onSaveClientVat, onSaveClientRounding }) {
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

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="text-sm font-medium text-white mb-1">Per-client overrides</div>
      <div className="text-xs text-slate-500 mb-4">Override defaults for specific clients. Leave empty to use the default.</div>
      <div className="space-y-2">
        {clients.map(client => {
          const isOpen = expanded === client;
          const count = overrideCount(client);
          const effectiveVat = getVat(client, vat, clientVat);
          const effectiveRounding = getRounding(client, rounding, clientRounding);
          const clientRoundingValue = clientRounding[client];
          return (
            <div key={client} className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
              <button onClick={() => setExpanded(isOpen ? null : client)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-900 transition">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="text-sm text-slate-200 truncate">{client}</span>
                  <span className="text-xs text-slate-600 whitespace-nowrap">VAT {effectiveVat}%</span>
                  <span className="text-xs text-slate-600 whitespace-nowrap">·</span>
                  <span className="text-xs text-slate-600 whitespace-nowrap">{effectiveRounding > 0 ? `${effectiveRounding}-min` : 'exact'}</span>
                </div>
                <div className="flex items-center gap-2">
                  {count > 0 && <span className="text-xs bg-amber-600/20 text-amber-400 px-2 py-0.5 rounded-full whitespace-nowrap">{count} {count === 1 ? 'override' : 'overrides'}</span>}
                  <span className="text-slate-500 text-sm">{isOpen ? '−' : '+'}</span>
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-slate-800 p-3 space-y-3">
                  <div className="bg-slate-900 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-slate-300 flex-1">VAT rate</span>
                      <span className="text-xs text-slate-600 whitespace-nowrap">default {vat}%</span>
                      <div className="flex items-center gap-1">
                        <input type="number" min="0" max="100" step="0.5" value={clientVat[client] ?? ''}
                          onChange={(e) => setClientVatRate(client, e.target.value)} placeholder="—"
                          className="w-20 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:border-amber-600 placeholder:text-slate-700" />
                        <span className="text-sm text-slate-500">%</span>
                      </div>
                    </div>
                    <div className="text-xs text-slate-600 mt-1.5">Set to <span className="text-slate-500">0</span> for reverse-charge / non-VAT clients.</div>
                  </div>

                  <div className="bg-slate-900 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-sm text-slate-300">Billing rounding</span>
                      <span className="text-xs text-slate-600 whitespace-nowrap">default {rounding > 0 ? `${rounding}-min` : 'exact'}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => setClientRoundingValue(client, '')}
                        className={`px-2.5 py-1 rounded-md text-xs transition ${clientRoundingValue == null ? 'bg-slate-700 text-slate-200 ring-1 ring-slate-600' : 'bg-slate-950 hover:bg-slate-900 text-slate-500 border border-slate-800'}`}>
                        Use default
                      </button>
                      {roundingPresets.map(p => (
                        <button key={p.value} onClick={() => setClientRoundingValue(client, p.value)}
                          className={`px-2.5 py-1 rounded-md text-xs transition ${clientRoundingValue === p.value ? 'bg-amber-600 text-white' : 'bg-slate-950 hover:bg-slate-900 text-slate-400 border border-slate-800'}`}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-wider text-slate-600 px-1">Hourly rates</div>
                    {tasks.map(task => {
                      const overrideValue = clientRates[client]?.[task];
                      const defaultValue = rates[task] || 0;
                      return (
                        <div key={task} className="flex items-center gap-3">
                          <span className="text-sm text-slate-300 flex-1 truncate">{task}</span>
                          <span className="text-xs text-slate-600 whitespace-nowrap">default {defaultValue}€/h</span>
                          <div className="flex items-center gap-1">
                            <input type="number" min="0" step="0.5" value={overrideValue ?? ''}
                              onChange={(e) => setRate(client, task, e.target.value)} placeholder="—"
                              className="w-20 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:border-amber-600 placeholder:text-slate-700" />
                            <span className="text-sm text-slate-500">€/h</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EditableList({ title, items, onSave, placeholder }) {
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim();
    if (!v || items.includes(v)) return;
    onSave([...items, v]);
    setInput('');
  };
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="text-sm font-medium text-white mb-3">{title}</div>
      <div className="space-y-1.5 mb-4">
        {items.map(item => (
          <div key={item} className="flex items-center justify-between bg-slate-950 rounded-lg px-3 py-2 text-sm">
            <span className="text-slate-300">{item}</span>
            <button onClick={() => onSave(items.filter(i => i !== item))} className="text-slate-600 hover:text-red-400 transition"><X className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={placeholder}
          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600" />
        <button onClick={add} className="bg-amber-600 hover:bg-amber-500 text-white px-3 rounded-lg transition"><Plus className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

function ManualEntryModal({ clients, tasks, onClose, onSave }) {
  const now = new Date();
  const toInput = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const toDateInput = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const [client, setClient] = useState(clients[0]);
  const [task, setTask] = useState(tasks[0]);
  const [project, setProject] = useState('');
  const [note, setNote] = useState('');
  const [free, setFree] = useState(false);
  const [mode, setMode] = useState('duration');
  const [start, setStart] = useState(toInput(new Date(now.getTime() - 3600000)));
  const [end, setEnd] = useState(toInput(now));
  const [date, setDate] = useState(toDateInput(now));
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [error, setError] = useState('');

  const save = () => {
    if (mode === 'range') {
      const s = new Date(start).getTime();
      const e = new Date(end).getTime();
      if (isNaN(s) || isNaN(e) || e <= s) { setError('End time must be after start time.'); return; }
      onSave({ id: 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), client, task, project, note, free, start: s, end: e, duration: e - s });
    } else {
      const dateObj = new Date(date + 'T00:00:00');
      if (isNaN(dateObj.getTime())) { setError('Invalid date.'); return; }
      const today = new Date();
      const isToday = dateObj.toDateString() === today.toDateString();
      const endDate = isToday ? new Date() : (() => { const d = new Date(dateObj); d.setHours(18, 0, 0, 0); return d; })();
      const durationMs = durationMinutes * 60 * 1000;
      const startDate = new Date(endDate.getTime() - durationMs);
      onSave({ id: 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), client, task, project, note, free, start: startDate.getTime(), end: endDate.getTime(), duration: durationMs });
    }
  };

  return (
    <Modal onClose={onClose} title="Add manual entry">
      <div className="space-y-3">
        <Select label="Client" value={client} onChange={setClient} options={clients} />
        <Select label="Task" value={task} onChange={setTask} options={tasks} />
        <div>
          <label className="block text-xs text-slate-500 mb-1">Project (optional)</label>
          <input value={project} onChange={(e) => setProject(e.target.value)} list="project-suggestions" placeholder="e.g. RECAP 05/2026"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Note (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600" />
        </div>
        <FreeToggle free={free} setFree={setFree} />
        <div>
          <label className="block text-xs text-slate-500 mb-1">Time entry method</label>
          <div className="flex gap-1 bg-slate-950 rounded-lg p-1">
            <button type="button" onClick={() => setMode('duration')}
              className={`flex-1 px-3 py-1.5 rounded-md text-sm transition ${mode === 'duration' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Duration</button>
            <button type="button" onClick={() => setMode('range')}
              className={`flex-1 px-3 py-1.5 rounded-md text-sm transition ${mode === 'range' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Start & end time</button>
          </div>
        </div>
        {mode === 'duration' ? (
          <DurationPicker date={date} setDate={setDate} durationMinutes={durationMinutes} setDurationMinutes={setDurationMinutes} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Start</label>
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">End</label>
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600" />
            </div>
          </div>
        )}
      </div>
      {error && <div className="mt-3 text-xs rounded-lg px-3 py-2 border bg-red-600/10 border-red-700/40 text-red-300">{error}</div>}
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
        <button onClick={save} className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-sm transition">
          <Check className="w-4 h-4" /> Save entry
        </button>
      </div>
    </Modal>
  );
}

function FreeToggle({ free, setFree }) {
  return (
    <button
      type="button"
      onClick={() => setFree(!free)}
      className={`w-full flex items-start gap-3 border rounded-lg p-3 text-left transition ${free
          ? 'bg-emerald-600/10 border-emerald-700/50 hover:bg-emerald-600/15'
          : 'bg-slate-950 border-slate-800 hover:bg-slate-900'
        }`}
    >
      <div className={`mt-0.5 w-9 h-5 rounded-full transition flex-shrink-0 relative ${free ? 'bg-emerald-600' : 'bg-slate-700'}`}>
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${free ? 'left-[18px]' : 'left-0.5'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-200">Free of charge (complimentary)</div>
        <div className="text-xs text-slate-500 mt-0.5">
          {free
            ? 'Tracked but billed at €0. Will appear with a goodwill note in the report.'
            : 'Toggle on to provide this work as a goodwill gesture.'}
        </div>
      </div>
    </button>
  );
}

function DurationPicker({ date, setDate, durationMinutes, setDurationMinutes }) {
  const presets = [15, 30, 45, 60, 90, 120, 180, 240];
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  const durationLabel = hours > 0
    ? (minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`)
    : `${minutes}m`;
  const previewRange = () => {
    const dateObj = new Date(date + 'T00:00:00');
    if (isNaN(dateObj.getTime())) return '—';
    const today = new Date();
    const isToday = dateObj.toDateString() === today.toDateString();
    const endDate = isToday ? new Date() : (() => { const d = new Date(dateObj); d.setHours(18, 0, 0, 0); return d; })();
    const startDate = new Date(endDate.getTime() - durationMinutes * 60000);
    const fmt = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${fmt(startDate)} – ${fmt(endDate)}`;
  };
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-slate-500 mb-1">Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600" />
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-slate-500">Duration</label>
          <span className="font-mono text-amber-400 text-lg tabular-nums">{durationLabel}</span>
        </div>
        <input type="range" min="5" max="480" step="5" value={durationMinutes}
          onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10))}
          className="w-full cursor-pointer" style={{ accentColor: '#d97706' }} />
        <div className="flex justify-between text-[10px] text-slate-600 mt-1 px-0.5">
          <span>5m</span><span>1h</span><span>2h</span><span>4h</span><span>8h</span>
        </div>
      </div>
      <div>
        <div className="text-xs text-slate-500 mb-2">Quick presets</div>
        <div className="flex flex-wrap gap-1.5">
          {presets.map(m => {
            const label = m >= 60 ? `${m / 60}h${m % 60 > 0 ? ` ${m % 60}m` : ''}` : `${m}m`;
            return (
              <button key={m} type="button" onClick={() => setDurationMinutes(m)}
                className={`px-2.5 py-1 rounded-md text-xs transition ${durationMinutes === m ? 'bg-amber-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
        <span className="text-slate-600">Will be saved as:</span>
        <span className="text-slate-300">{previewRange()}</span>
      </div>
    </div>
  );
}

function EditEntryModal({ entry, clients, tasks, onClose, onSave }) {
  const toInput = (ts) => {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [client, setClient] = useState(entry.client);
  const [task, setTask] = useState(entry.task);
  const [project, setProject] = useState(entry.project || '');
  const [note, setNote] = useState(entry.note || '');
  const [free, setFree] = useState(!!entry.free);
  const [start, setStart] = useState(toInput(entry.start));
  const [end, setEnd] = useState(toInput(entry.end));
  const [error, setError] = useState('');
  const save = () => {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    if (isNaN(s) || isNaN(e) || e <= s) { setError('End time must be after start time.'); return; }
    onSave({ ...entry, client, task, project, note, free, start: s, end: e, duration: e - s });
  };
  return (
    <Modal onClose={onClose} title="Edit entry">
      <div className="space-y-3">
        <Select label="Client" value={client} onChange={setClient} options={clients.includes(entry.client) ? clients : [entry.client, ...clients]} />
        <Select label="Task" value={task} onChange={setTask} options={tasks.includes(entry.task) ? tasks : [entry.task, ...tasks]} />
        <div>
          <label className="block text-xs text-slate-500 mb-1">Project</label>
          <input value={project} onChange={(e) => setProject(e.target.value)} list="project-suggestions" placeholder="e.g. RECAP 05/2026"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Note</label>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600" />
        </div>
        <FreeToggle free={free} setFree={setFree} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Start</label>
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">End</label>
            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600" />
          </div>
        </div>
      </div>
      {error && <div className="mt-3 text-xs rounded-lg px-3 py-2 border bg-red-600/10 border-red-700/40 text-red-300">{error}</div>}
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
        <button onClick={save} className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-sm transition">
          <Check className="w-4 h-4" /> Save changes
        </button>
      </div>
    </Modal>
  );
}

function PDFOptionsModal({ client, entryCount, issuer, onClose, onGenerate }) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const dueISO = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const [language, setLanguage] = useState('en');
  const [showDates, setShowDates] = useState(true);
  const [showTimes, setShowTimes] = useState(true);
  const [showNotes, setShowNotes] = useState(true);
  const [showVat, setShowVat] = useState(true);
  const [invoiceMode, setInvoiceMode] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issueDate, setIssueDate] = useState(todayISO);
  const [dueDate, setDueDate] = useState(dueISO);
  const hasIssuer = !!(issuer && issuer.name && issuer.name.trim());

  return (
    <Modal onClose={onClose} title={invoiceMode ? 'Invoice options' : 'PDF report options'}>
      <div className="space-y-4">
        <div className="text-sm text-slate-400">
          For <span className="text-slate-200 font-medium">{client}</span> · {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-slate-500">Document type</div>
          <ToggleRow
            label="Generate as invoice"
            description="Adds your supplier details, an invoice number and issue/due dates. Off = plain time report."
            checked={invoiceMode}
            onChange={setInvoiceMode}
          />
          {invoiceMode && !hasIssuer && (
            <div className="text-xs text-amber-400/90 bg-amber-600/10 border border-amber-700/40 rounded-lg p-3">
              Add your supplier details in <span className="font-medium">Settings → Supplier details</span> so they appear on the invoice.
            </div>
          )}
          {invoiceMode && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="sm:col-span-1">
                <label className="block text-xs text-slate-500 mb-1">Invoice No.</label>
                <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder={`${new Date().getFullYear()}001`}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600 placeholder:text-slate-700" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Issue date</label>
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Due date</label>
                <input type="date" value={dueDate} min={issueDate} onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-600" />
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Language</div>
          <div className="flex gap-1 bg-slate-950 rounded-lg p-1">
            <button type="button" onClick={() => setLanguage('en')}
              className={`flex-1 px-3 py-2 rounded-md text-sm transition ${language === 'en' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              🇬🇧 English
            </button>
            <button type="button" onClick={() => setLanguage('sk')}
              className={`flex-1 px-3 py-2 rounded-md text-sm transition ${language === 'sk' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              🇸🇰 Slovenčina
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-slate-500">Pricing</div>
          <ToggleRow
            label="Show VAT"
            description="Display VAT breakdown and total including VAT. Turn off for clients who only need plain prices."
            checked={showVat}
            onChange={setShowVat}
          />
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-slate-500">Detailed log columns</div>
          <ToggleRow label="Show dates" description="Include date column for each entry" checked={showDates} onChange={setShowDates} />
          <ToggleRow label="Show times" description="Include time range (e.g. 14:30–16:00)" checked={showTimes} onChange={setShowTimes} />
          <ToggleRow label="Show notes" description="Include task notes if available" checked={showNotes} onChange={setShowNotes} />
        </div>

        {!showDates && (
          <div className="text-xs text-slate-500 bg-slate-950 border border-slate-800 rounded-lg p-3">
            <span className="text-amber-400/80">Note:</span> Date range will be hidden from the header. The report will show only summary, breakdown by task, and time-only details.
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
        <button
          onClick={() => onGenerate({ showDates, showTimes, showNotes, showVat, language, invoiceMode, invoiceNumber, issueDate, dueDate })}
          className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-sm transition"
        >
          <Download className="w-4 h-4" /> {invoiceMode ? 'Generate invoice' : 'Generate PDF'}
        </button>
      </div>
    </Modal>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-lg p-3 text-left transition"
    >
      <div className={`mt-0.5 w-9 h-5 rounded-full transition flex-shrink-0 relative ${checked ? 'bg-amber-600' : 'bg-slate-700'}`}>
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-200">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5">{description}</div>
      </div>
    </button>
  );
}

function Modal({ title, children, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-white">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-500 hover:text-slate-200"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="text-sm text-slate-300">{message}</div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">{cancelLabel}</button>
        <button onClick={() => { onConfirm(); onClose(); }}
          className={`px-4 py-2 rounded-lg text-sm transition text-white ${danger ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-600 hover:bg-amber-500'}`}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

function ToastStack({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <div key={t.id} className={`text-sm rounded-lg px-4 py-3 border shadow-lg ${t.type === 'ok'
          ? 'bg-emerald-600/15 border-emerald-700/50 text-emerald-200'
          : t.type === 'err'
            ? 'bg-red-600/15 border-red-700/50 text-red-200'
            : 'bg-slate-800 border-slate-700 text-slate-200'}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ---------- i18n ----------
const PDF_TRANSLATIONS = {
  en: {
    title: 'Time Report',
    generated: 'Generated',
    today: 'Today',
    week: 'This week',
    month: 'This month',
    all: 'All time',
    customRange: 'Custom range',
    summary: 'Summary',
    billableTime: 'Billable time',
    totalTime: 'Total time',
    sessions: 'sessions',
    session: 'session',
    complimentary: 'complimentary',
    netAmount: 'Net amount',
    exclVat: 'excl. VAT',
    totalToInvoice: 'Total to invoice',
    totalAmount: 'Total amount',
    inclVat: (vat) => `incl. ${vat}% VAT`,
    billingPolicy: 'Billing policy',
    billingPolicyText: (rounding) => `Each billable session is rounded up to the nearest ${rounding}-minute block (standard agency practice).`,
    complimentaryHead: '★ Complimentary work included',
    complimentaryBody: (count, inPeriod) => `${count} ${count === 1 ? 'session is' : 'sessions are'} provided free of charge as a goodwill gesture${inPeriod ? ' in this period' : ''}. These items are listed below for transparency but are not included in the invoice total.`,
    complimentaryValue: 'Standard value of complimentary work',
    breakdownByTask: 'Breakdown by task (billable)',
    task: 'Task',
    sessionsCol: 'Sessions',
    tracked: 'Tracked',
    billable: 'Billable',
    hours: 'Hours',
    rate: 'Rate',
    net: 'Net',
    subtotalNet: 'Subtotal (net)',
    vatLabel: (vat) => `VAT ${vat}%`,
    totalInclVat: 'Total (incl. VAT)',
    detailedLog: 'Detailed log',
    date: 'Date',
    time: 'Time',
    taskNote: 'Task / Note',
    taskOnly: 'Task',
    complimentaryBadge: '★ Complimentary',
    activityDescriptions: 'Activity descriptions',
    printBtn: 'Print / Save as PDF',
    closeBtn: 'Close',
    footer: 'Time Report',
    invoiceTitle: 'Invoice',
    invoiceFooter: 'Invoice',
    supplier: 'Supplier',
    billTo: 'Bill to',
    invoiceNo: 'Invoice No.',
    issueDate: 'Issue date',
    dueDate: 'Due date',
    regId: 'Reg. No',
    taxId: 'Tax ID',
    vatId: 'VAT ID',
    iban: 'IBAN',
    locale: 'en-GB',
  },
  sk: {
    title: 'Výkaz odpracovaného času',
    generated: 'Vygenerované',
    today: 'Dnes',
    week: 'Tento týždeň',
    month: 'Tento mesiac',
    all: 'Celé obdobie',
    customRange: 'Vlastné obdobie',
    summary: 'Súhrn',
    billableTime: 'Fakturovateľný čas',
    totalTime: 'Celkový čas',
    sessions: 'záznamov',
    session: 'záznam',
    complimentary: 'bezplatne',
    netAmount: 'Suma bez DPH',
    exclVat: 'bez DPH',
    totalToInvoice: 'Celková suma',
    totalAmount: 'Celková suma',
    inclVat: (vat) => `s DPH ${vat}%`,
    billingPolicy: 'Spôsob fakturácie',
    billingPolicyText: (rounding) => `Každý fakturovateľný záznam je zaokrúhlený nahor na ${rounding}-minútový blok (štandardná agentúrna prax).`,
    complimentaryHead: '★ Práce poskytnuté bezplatne',
    complimentaryBody: (count, inPeriod) => `${count} ${count === 1 ? 'záznam je' : (count >= 2 && count <= 4 ? 'záznamy sú' : 'záznamov je')} poskytnut${count === 1 ? 'ý' : (count >= 2 && count <= 4 ? 'é' : 'ých')} bezplatne ako prejav ústretovosti${inPeriod ? ' v tomto období' : ''}. Tieto položky sú uvedené nižšie pre transparentnosť, ale nie sú zahrnuté vo fakturovanej sume.`,
    complimentaryValue: 'Štandardná hodnota bezplatne poskytnutej práce',
    breakdownByTask: 'Rozpis podľa činností (fakturovateľné)',
    task: 'Činnosť',
    sessionsCol: 'Počet',
    tracked: 'Zaznamenané',
    billable: 'Fakturované',
    hours: 'Hodiny',
    rate: 'Sadzba',
    net: 'Suma',
    subtotalNet: 'Medzisúčet (bez DPH)',
    vatLabel: (vat) => `DPH ${vat}%`,
    totalInclVat: 'Spolu (s DPH)',
    detailedLog: 'Podrobný zoznam',
    date: 'Dátum',
    time: 'Čas',
    taskNote: 'Činnosť / Poznámka',
    taskOnly: 'Činnosť',
    complimentaryBadge: '★ Bezplatne',
    activityDescriptions: 'Vysvetlivky činností',
    printBtn: 'Tlač / Uložiť ako PDF',
    closeBtn: 'Zavrieť',
    footer: 'Výkaz odpracovaného času',
    invoiceTitle: 'Faktúra',
    invoiceFooter: 'Faktúra',
    supplier: 'Dodávateľ',
    billTo: 'Odberateľ',
    invoiceNo: 'Faktúra č.',
    issueDate: 'Dátum vystavenia',
    dueDate: 'Dátum splatnosti',
    regId: 'IČO',
    taxId: 'DIČ',
    vatId: 'IČ DPH',
    iban: 'IBAN',
    locale: 'sk-SK',
  },
};

function formatHoursDecimalLocalized(h, language) {
  if (language === 'sk') return h.toFixed(2).replace('.', ',') + ' h';
  return h.toFixed(2) + ' h';
}

function formatPDFDateLocalized(iso, language) {
  const d = new Date(iso + 'T00:00:00');
  const locale = language === 'sk' ? 'sk-SK' : 'en-GB';
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatPDFDateFromTsLocalized(d, language) {
  const locale = language === 'sk' ? 'sk-SK' : 'en-GB';
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatEURLocalized(amount, language) {
  if (language !== 'sk') return formatEUR(amount);
  if (!amount) return '0 €';
  if (amount < 1) return `${amount.toFixed(2).replace('.', ',')} €`;
  // Slovak format: 1 234,56 €
  const formatted = amount.toLocaleString('sk-SK', { minimumFractionDigits: amount < 100 ? 2 : 0, maximumFractionDigits: amount < 100 ? 2 : 0 });
  return `${formatted} €`;
}

// ---------- report output ----------
// Print a generated report by loading it into a hidden iframe and invoking the print
// dialog. This works both in a plain browser and inside the Tauri webview (WebView2),
// where window.open is unreliable / blocked. Falls back to downloading the HTML.
function printReportHTML(html, client, onMessage) {
  try {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;';

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try { document.body.removeChild(iframe); } catch (e) { /* already removed */ }
    };

    iframe.onload = () => {
      const frameWin = iframe.contentWindow;
      if (!frameWin) { cleanup(); downloadReportHTML(html, client, onMessage); return; }
      frameWin.onafterprint = cleanup;
      try {
        frameWin.focus();
        frameWin.print();
      } catch (err) {
        console.error(err);
        cleanup();
        downloadReportHTML(html, client, onMessage);
        return;
      }
      // Safety net in case onafterprint never fires (some webviews).
      setTimeout(cleanup, 120000);
    };

    document.body.appendChild(iframe);
    iframe.srcdoc = html;
  } catch (err) {
    console.error(err);
    downloadReportHTML(html, client, onMessage);
  }
}

function downloadReportHTML(html, client, onMessage) {
  const safe = String(client || 'report').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report-${safe}-${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  const msg = 'Could not open the print dialog — the report was downloaded as HTML instead. Open it and press Ctrl+P to save as PDF.';
  if (onMessage) onMessage(msg, 'err'); else alert(msg);
}

// ---------- PDF builder ----------
function buildPDFHTML({ client, entries, rates, clientRates, vat, rounding, period, customStart, customEnd, showDates = true, showTimes = true, showNotes = true, showVat = true, language = 'en', descriptions = DEFAULT_DESCRIPTIONS, issuer = DEFAULT_ISSUER, invoiceMode = false, invoiceNumber = '', issueDate = '', dueDate = '' }) {
  const t = PDF_TRANSLATIONS[language] || PDF_TRANSLATIONS.en;
  const fmtEUR = (a) => formatEURLocalized(a, language);
  const fmtHours = (h) => formatHoursDecimalLocalized(h, language);
  const fmtDate = (ts) => formatPDFDateFromTsLocalized(new Date(ts), language);

  const tempClientRounding = { [client]: rounding };
  const totalNet = round2(entries.reduce((s, e) => s + calcEarnings(e, rates, clientRates, rounding, tempClientRounding), 0));
  const totalVatAmount = round2(totalNet * (vat / 100));
  const totalGross = round2(totalNet + totalVatAmount);
  const complimentaryCount = entries.filter(e => e.free).length;

  // Group billable entries (non-free) by task
  const byTask = {};
  entries.forEach(e => {
    if (e.free) return;
    if (!byTask[e.task]) byTask[e.task] = { ms: 0, billableMs: 0, earnings: 0, count: 0, rate: getRate(e.client, e.task, rates, clientRates) };
    byTask[e.task].ms += e.duration;
    byTask[e.task].billableMs += roundedDuration(e.duration, rounding);
    byTask[e.task].earnings += calcEarnings(e, rates, clientRates, rounding, tempClientRounding);
    byTask[e.task].count += 1;
  });
  const sortedTasks = Object.entries(byTask).sort((a, b) => b[1].ms - a[1].ms);

  const billableEntriesCount = entries.filter(e => !e.free).length;
  const billableTotalMs = entries.reduce((s, e) => e.free ? s : s + e.duration, 0);
  const billableTotalHours = entries.reduce((s, e) => e.free ? s : s + roundedDuration(e.duration, rounding), 0) / 3600000;

  const periodLabel = (() => {
    if (period === 'today') return t.today;
    if (period === 'week') return t.week;
    if (period === 'month') return t.month;
    if (period === 'all') return t.all;
    if (period === 'custom' && customStart && customEnd) return `${formatPDFDateLocalized(customStart, language)} – ${formatPDFDateLocalized(customEnd, language)}`;
    return t.customRange;
  })();

  const firstDate = new Date(entries[0].start);
  const lastDate = new Date(entries[entries.length - 1].start);
  const dateRangeStr = `${fmtDate(firstDate)} – ${fmtDate(lastDate)}`;
  const generatedAt = new Date().toLocaleString(t.locale);
  const escape = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const showRoundingNote = rounding > 0 && billableTotalMs !== Math.round(billableTotalHours * 3600000);

  const docTitle = invoiceMode ? t.invoiceTitle : t.title;
  const footerLabel = invoiceMode ? t.invoiceFooter : t.footer;
  const issuerLine = (label, value) => (value && String(value).trim())
    ? `<div><span class="muted">${escape(label)}:</span> ${escape(value)}</div>` : '';
  const partiesBlock = invoiceMode ? `
  <div class="section parties">
    <div class="party">
      <div class="party-label">${escape(t.supplier)}</div>
      <div class="party-name">${escape(issuer.name || '')}</div>
      ${issuer.address ? `<div>${escape(issuer.address)}</div>` : ''}
      ${issuerLine(t.regId, issuer.regId)}
      ${issuerLine(t.taxId, issuer.taxId)}
      ${issuerLine(t.vatId, issuer.vatId)}
      ${issuerLine(t.iban, issuer.iban)}
      ${issuer.email ? `<div>${escape(issuer.email)}</div>` : ''}
      ${issuer.phone ? `<div>${escape(issuer.phone)}</div>` : ''}
    </div>
    <div class="party">
      <div class="party-label">${escape(t.billTo)}</div>
      <div class="party-name">${escape(client)}</div>
    </div>
  </div>` : '';
  const invoiceMeta = invoiceMode ? `
      ${invoiceNumber ? `<strong>${escape(t.invoiceNo)} ${escape(invoiceNumber)}</strong>` : ''}
      ${issueDate ? `${escape(t.issueDate)}: ${escape(formatPDFDateLocalized(issueDate, language))}<br>` : ''}
      ${dueDate ? `${escape(t.dueDate)}: ${escape(formatPDFDateLocalized(dueDate, language))}<br>` : ''}
  ` : '';

  const sessionWord = (count) => {
    if (language !== 'sk') return count === 1 ? t.session : t.sessions;
    if (count === 1) return 'záznam';
    if (count >= 2 && count <= 4) return 'záznamy';
    return 'záznamov';
  };

  // Collect unique tasks present in the report (billable + complimentary), preserving sort order from billable breakdown then adding any free-only tasks
  const usedTasks = [];
  const seenTasks = new Set();
  sortedTasks.forEach(([task]) => { if (!seenTasks.has(task)) { usedTasks.push(task); seenTasks.add(task); } });
  entries.forEach(e => { if (!seenTasks.has(e.task)) { usedTasks.push(e.task); seenTasks.add(e.task); } });
  const langDescriptions = (descriptions && descriptions[language]) || DEFAULT_DESCRIPTIONS[language] || DEFAULT_DESCRIPTIONS.en;
  const glossaryItems = usedTasks
    .map(task => ({ task, desc: (langDescriptions[task] || '').trim() }))
    .filter(item => item.desc.length > 0);

  return `<!DOCTYPE html>
<html lang="${language}"><head><meta charset="UTF-8">
<title>${escape(docTitle)} — ${escape(client)}${showDates ? ` — ${dateRangeStr}` : ''}</title>
<style>
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1a202c; font-size: 10.5pt; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a202c; padding-bottom: 14px; margin-bottom: 24px; }
.header h1 { font-size: 22pt; font-weight: 600; margin: 0; letter-spacing: -0.02em; }
.header .subtitle { font-size: 10pt; color: #64748b; margin-top: 4px; }
.header .meta { text-align: right; font-size: 9pt; color: #64748b; }
.header .meta strong { color: #1a202c; font-size: 10pt; display: block; margin-bottom: 2px; }
.section { margin-bottom: 24px; }
.section-title { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; font-weight: 600; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }
.parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.party { border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; font-size: 9.5pt; line-height: 1.45; }
.party-label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; font-weight: 600; margin-bottom: 4px; }
.party-name { font-weight: 600; color: #1a202c; font-size: 11pt; margin-bottom: 2px; }
.summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 6px; }
.summary-grid.two-cols { grid-template-columns: 1fr 1.2fr; }
.summary-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; display: flex; flex-direction: column; justify-content: center; }
.summary-card.total { background: #fef9e7; border-color: #d97706; }
.summary-label { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 4px; }
.summary-value { font-size: 18pt; font-weight: 600; color: #1a202c; line-height: 1.1; }
.two-cols .summary-card.total .summary-value { font-size: 22pt; }
.summary-sub { font-size: 8.5pt; color: #64748b; margin-top: 2px; }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
thead th { background: #f1f5f9; text-align: left; padding: 8px 10px; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; font-weight: 600; border-bottom: 1px solid #cbd5e1; }
tbody td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
tbody tr:last-child td { border-bottom: none; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.muted { color: #64748b; font-size: 8.5pt; }
.note { color: #475569; font-style: italic; font-size: 8.5pt; }
.totals-row td { background: #f8fafc; font-weight: 600; border-top: 1.5px solid #cbd5e1; border-bottom: none; padding-top: 10px; padding-bottom: 10px; }
.totals-vat td { background: #f8fafc; border-top: none; border-bottom: none; color: #64748b; font-size: 9pt; }
.totals-gross td { background: #fef9e7; font-weight: 700; font-size: 11pt; border-top: 1px solid #d97706; border-bottom: none; color: #1a202c; }
.free-badge { display: inline-block; background: #d1fae5; color: #047857; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 1px 6px; border-radius: 3px; margin-left: 6px; vertical-align: middle; }
.free-row td { background: #f0fdf4; }
.free-row .strike { text-decoration: line-through; color: #94a3b8; font-size: 8.5pt; }
.free-row .free-amount { color: #047857; font-weight: 600; }
.complimentary-callout { background: #ecfdf5; border: 1px solid #a7f3d0; border-left: 4px solid #059669; border-radius: 6px; padding: 14px 16px; margin-bottom: 18px; }
.complimentary-callout .head { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.06em; color: #047857; font-weight: 700; margin-bottom: 4px; }
.complimentary-callout .body { font-size: 10pt; color: #1f2937; }
.complimentary-callout .value { font-size: 14pt; font-weight: 700; color: #047857; margin-top: 4px; }
.glossary { margin-top: 8px; }
.glossary dl { margin: 0; }
.glossary dt { font-weight: 600; color: #1a202c; font-size: 9.5pt; margin-top: 10px; }
.glossary dt:first-child { margin-top: 0; }
.glossary dd { margin: 2px 0 0 0; color: #475569; font-size: 9pt; line-height: 1.5; }
.footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 8.5pt; color: #94a3b8; display: flex; justify-content: space-between; }
thead { display: table-header-group; }
tr, td { page-break-inside: avoid; }
@media screen {
  body { background: #f1f5f9; padding: 24px; }
  .page { max-width: 820px; margin: 0 auto; background: white; padding: 32px 40px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 4px; }
  .print-bar { max-width: 820px; margin: 0 auto 16px; display: flex; justify-content: flex-end; gap: 8px; }
  .print-bar button { padding: 8px 16px; border: none; background: #d97706; color: white; border-radius: 6px; font-size: 10pt; cursor: pointer; font-weight: 500; }
  .print-bar button:hover { background: #b45309; }
  .print-bar button.secondary { background: #64748b; }
  .print-bar button.secondary:hover { background: #475569; }
}
@media print {
  .print-bar { display: none; }
  .page { box-shadow: none; padding: 0; max-width: 100%; }
  body { background: white; padding: 0; }
}
</style></head><body>
<div class="print-bar">
  <button onclick="window.print()">${escape(t.printBtn)}</button>
  <button class="secondary" onclick="window.close()">${escape(t.closeBtn)}</button>
</div>
<div class="page">
  <div class="header">
    <div>
      <h1>${escape(docTitle)}</h1>
      <div class="subtitle">${escape(client)}</div>
    </div>
    <div class="meta">
      ${invoiceMeta}
      ${showDates ? `<strong>${escape(periodLabel)}</strong>${dateRangeStr}<br>` : ''}
      <span style="color:#94a3b8;">${escape(t.generated)} ${escape(generatedAt)}</span>
    </div>
  </div>
${partiesBlock}
  <div class="section">
    <div class="section-title">${escape(t.summary)}</div>
    <div class="summary-grid${showVat ? '' : ' two-cols'}">
      <div class="summary-card">
        <div class="summary-label">${escape(showRoundingNote ? t.billableTime : t.totalTime)}</div>
        <div class="summary-value">${fmtHours(billableTotalHours)}</div>
        <div class="summary-sub">${billableEntriesCount} ${escape(sessionWord(billableEntriesCount))}${complimentaryCount > 0 ? ` · ${complimentaryCount} ${escape(t.complimentary)}` : ''}</div>
      </div>
      ${showVat ? `
        <div class="summary-card">
          <div class="summary-label">${escape(t.netAmount)}</div>
          <div class="summary-value">${fmtEUR(totalNet)}</div>
          <div class="summary-sub">${escape(t.exclVat)}</div>
        </div>
        <div class="summary-card total">
          <div class="summary-label">${escape(t.totalToInvoice)}</div>
          <div class="summary-value">${fmtEUR(totalGross)}</div>
          <div class="summary-sub">${escape(t.inclVat(vat))}</div>
        </div>
      ` : `
        <div class="summary-card total">
          <div class="summary-label">${escape(t.totalAmount)}</div>
          <div class="summary-value">${fmtEUR(totalNet)}</div>
        </div>
      `}
    </div>
    ${showRoundingNote ? `<div style="margin-top:10px;font-size:8.5pt;color:#64748b;padding:8px 12px;background:#f8fafc;border-radius:4px;border-left:3px solid #d97706;"><strong style="color:#475569;">${escape(t.billingPolicy)}:</strong> ${escape(t.billingPolicyText(rounding))}</div>` : ''}
  </div>

  ${sortedTasks.length > 0 ? `
  <div class="section">
    <div class="section-title">${escape(t.breakdownByTask)}</div>
    <table>
      <thead>
        <tr>
          <th>${escape(t.task)}</th>
          <th class="num">${escape(t.sessionsCol)}</th>
          ${showRoundingNote ? `<th class="num">${escape(t.tracked)}</th>` : ''}
          <th class="num">${escape(showRoundingNote ? t.billable : t.hours)}</th>
          <th class="num">${escape(t.rate)}</th>
          <th class="num">${escape(t.net)}</th>
        </tr>
      </thead>
      <tbody>
        ${sortedTasks.map(([task, tt]) => `
          <tr>
            <td>${escape(task)}</td>
            <td class="num">${tt.count}</td>
            ${showRoundingNote ? `<td class="num muted">${fmtHours(tt.ms / 3600000)}</td>` : ''}
            <td class="num">${fmtHours(tt.billableMs / 3600000)}</td>
            <td class="num muted">${fmtEUR(tt.rate)}/h</td>
            <td class="num">${fmtEUR(tt.earnings)}</td>
          </tr>
        `).join('')}
        <tr class="totals-row">
          <td>${escape(showVat ? t.subtotalNet : t.totalAmount)}</td>
          <td class="num">${billableEntriesCount}</td>
          ${showRoundingNote ? `<td class="num muted">${fmtHours(billableTotalMs / 3600000)}</td>` : ''}
          <td class="num">${fmtHours(billableTotalHours)}</td>
          <td></td>
          <td class="num">${fmtEUR(totalNet)}</td>
        </tr>
        ${showVat ? `
          <tr class="totals-vat">
            <td colspan="${showRoundingNote ? 5 : 4}">${escape(t.vatLabel(vat))}</td>
            <td class="num">${fmtEUR(totalVatAmount)}</td>
          </tr>
          <tr class="totals-gross">
            <td colspan="${showRoundingNote ? 5 : 4}">${escape(t.totalInclVat)}</td>
            <td class="num">${fmtEUR(totalGross)}</td>
          </tr>
        ` : ''}
      </tbody>
    </table>
  </div>
  ` : ''}

  <div class="section">
    <div class="section-title">${escape(t.detailedLog)}</div>
    <table>
      <thead>
        <tr>
          ${showDates ? `<th style="width: 70px;">${escape(t.date)}</th>` : ''}
          ${showTimes ? `<th style="width: 90px;">${escape(t.time)}</th>` : ''}
          <th>${escape(showNotes ? t.taskNote : t.taskOnly)}</th>
          <th class="num" style="width: 70px;">${escape(t.tracked)}</th>
          ${showRoundingNote ? `<th class="num" style="width: 70px;">${escape(t.billable)}</th>` : ''}
          <th class="num" style="width: 60px;">${escape(t.rate)}</th>
          <th class="num" style="width: 80px;">${escape(t.net)}</th>
        </tr>
      </thead>
      <tbody>
        ${entries.map(e => {
    const rate = getRate(e.client, e.task, rates, clientRates);
    const billableMs = roundedDuration(e.duration, rounding);
    const standardValue = calcStandardValue(e, rates, clientRates, rounding, tempClientRounding);
    const earned = calcEarnings(e, rates, clientRates, rounding, tempClientRounding);
    const rowClass = e.free ? 'free-row' : '';
    return `
            <tr class="${rowClass}">
              ${showDates ? `<td>${fmtDate(e.start)}</td>` : ''}
              ${showTimes ? `<td class="muted">${formatTime(e.start)}–${formatTime(e.end)}</td>` : ''}
              <td>
                <div>${escape(e.task)}${e.free ? `<span class="free-badge">${escape(t.complimentaryBadge)}</span>` : ''}</div>
                ${showNotes && e.note ? `<div class="note">${escape(e.note)}</div>` : ''}
              </td>
              <td class="num ${showRoundingNote ? 'muted' : ''}">${formatDuration(e.duration)}</td>
              ${showRoundingNote ? `<td class="num">${formatDuration(billableMs)}</td>` : ''}
              <td class="num muted">${fmtEUR(rate)}</td>
              <td class="num">
                ${e.free
        ? `<div class="strike">${fmtEUR(standardValue)}</div><div class="free-amount">${fmtEUR(0)}</div>`
        : fmtEUR(earned)}
              </td>
            </tr>
          `;
  }).join('')}
      </tbody>
    </table>
  </div>

  ${glossaryItems.length > 0 ? `
  <div class="section glossary">
    <div class="section-title">${escape(t.activityDescriptions)}</div>
    <dl>
      ${glossaryItems.map(item => `
        <dt>${escape(item.task)}</dt>
        <dd>${escape(item.desc)}</dd>
      `).join('')}
    </dl>
  </div>
  ` : ''}

  <div class="footer">
    <div>${escape(footerLabel)} · ${escape(client)}${invoiceMode && issuer.note ? ` · ${escape(issuer.note)}` : ''}</div>
    <div>${escape(generatedAt)}</div>
  </div>
</div>
</body></html>`;
}