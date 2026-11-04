import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { writeDiskBackup } from './lib/backup.js';
import { round2, getRate, getVat, getRounding, billableDuration, calcEarnings, calcStandardValue, timerElapsed, normalizeTimer, billingTotals, setAiFactor, DEFAULT_AI_FACTOR } from './lib/billing.js';
import { DEFAULT_CLIENTS, DEFAULT_TASKS, DEFAULT_RATES, DEFAULT_VAT, DEFAULT_CLIENT_RATES, DEFAULT_CLIENT_VAT, DEFAULT_ROUNDING, IDLE_THRESHOLD_S, SCHEMA_VERSION, DEFAULT_CLIENT_ROUNDING, DEFAULT_DESCRIPTIONS, DEFAULT_ISSUER, SEED_ENTRIES } from './lib/constants.js';
import { formatClock, formatDuration, isoDay } from './lib/format.js';
import { printReportHTML, buildPDFHTML } from './lib/pdf.js';
import { IS_TAURI } from './lib/platform.js';
import { useTheme } from './lib/theme.js';
import { Sidebar } from './components/shell/Sidebar.jsx';
import { BrandMark } from './components/shell/BrandMark.jsx';
import { excludedSuffix } from './components/ui/ActivityFilter.jsx';
import { ConfirmDialog } from './components/ui/ConfirmDialog.jsx';
import { ToastStack, notify } from './components/ui/ToastStack.jsx';
import { TooltipProvider } from './components/ui/Tooltip.jsx';
import { CalendarView } from './views/calendar/CalendarView.jsx';
import { PDFOptionsModal } from './views/invoice/PDFOptionsModal.jsx';
import { EditEntryModal } from './views/log/EditEntryModal.jsx';
import { Log } from './views/log/Log.jsx';
import { SettingsView } from './views/settings/SettingsView.jsx';
import { ManualEntryModal } from './views/track/ManualEntryModal.jsx';
import { TrackView } from './views/track/TrackView.jsx';

// Chart views load on demand so Recharts stays out of the startup bundle.
const Dashboard = lazy(() => import('./views/dashboard/Dashboard.jsx').then(m => ({ default: m.Dashboard })));
const InsightsView = lazy(() => import('./views/insights/InsightsView.jsx').then(m => ({ default: m.InsightsView })));

// Every view name; each one opens via ?view=<name>. 'track' (the Timer page) is home.
const VIEWS = ['track', 'calendar', 'log', 'dashboard', 'insights', 'settings'];

// Initial page. Honours ?view=<name> (used for automated screenshots); anything else falls back to the Timer page.
function initialView() {
  try {
    const v = new URLSearchParams(window.location.search).get('view');
    if (VIEWS.includes(v)) return v;
  } catch (e) { /* no usable URL: use the default */ }
  return 'track';
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
  const [aiFactor, setAiFactorState] = useState(DEFAULT_AI_FACTOR); // AI-assisted billing factor; applies to every AI entry
  const [entries, setEntries] = useState(SEED_ENTRIES);
  const [loading, setLoading] = useState(true);

  const [activeTimers, setActiveTimers] = useState([]); // multiple concurrent timers

  const [selectedClient, setSelectedClient] = useState(DEFAULT_CLIENTS[0]);
  const [selectedTask, setSelectedTask] = useState(DEFAULT_TASKS[0]);
  const [project, setProject] = useState('');
  const [note, setNote] = useState('');
  const [aiAssisted, setAiAssisted] = useState(false);

  const [view, setView] = useState(initialView);
  const [period, setPeriod] = useState('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [filterClient, setFilterClient] = useState('all');
  const [filterBilled, setFilterBilled] = useState('all'); // all | unbilled | invoiced
  const [excludedTasks, setExcludedTasks] = useState([]); // activities hidden on the Dashboard

  const [showManualEntry, setShowManualEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [pdfOptionsFor, setPdfOptionsFor] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const { pref: themePref, resolved: theme, setPref: setThemePref } = useTheme();
  const mainRef = useRef(null);

  const toggleTimerRef = useRef(() => {});
  // Start gate: every start path (buttons, keys, palette, tray, Continue) creates a timer from the
  // activeTimers snapshot of the last render, so two fast presses would both add one. A second start
  // within START_GATE_MS of the previous one is ignored; nobody starts two pieces of work that fast.
  const lastStartRef = useRef(0);
  const START_GATE_MS = 600;
  const passStartGate = () => {
    const now = Date.now();
    if (now - lastStartRef.current < START_GATE_MS) return false;
    lastStartRef.current = now;
    return true;
  };
  const backupRef = useRef(null);

  // Load
  useEffect(() => {
    (async () => {
      // Parse one stored value defensively — a single corrupt/incompatible key must not block the rest.
      const parse = (res) => {
        try { return res?.value != null ? JSON.parse(res.value) : undefined; }
        catch (e2) { console.error('Skipped corrupt storage value', e2); return undefined; }
      };
      const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
      try {
        const keys = ['clients', 'tasks', 'rates', 'clientRates', 'vat', 'clientVat', 'rounding', 'clientRounding', 'descriptions', 'issuer', 'csvFormat', 'entries', 'activeTimer', 'activeTimers', 'aiFactor'];
        const results = await Promise.all(keys.map(k => window.storage.get('tracker:' + k).catch(() => null)));
        const [c, t, r, cr, v, cv, rd, crd, dsc, iss, csvf, e, at, ats, aif] = results;
        // AI factor first, so the very first render after load already bills with it (missing = 1.5).
        const aifV = parse(aif); if (aifV != null) setAiFactorState(setAiFactor(aifV));

        const cV = parse(c); if (Array.isArray(cV)) setClients(cV);
        const tV = parse(t); if (Array.isArray(tV)) setTasks(tV);
        const rV = parse(r); if (isObj(rV)) setRates(rV);
        const crV = parse(cr); if (isObj(crV)) setClientRates(crV);
        const vV = parse(v); if (Number.isFinite(vV)) setVat(vV);
        const cvV = parse(cv); if (isObj(cvV)) setClientVat(cvV);
        const rdV = parse(rd); if (Number.isFinite(rdV)) setRounding(rdV);
        const crdV = parse(crd); if (isObj(crdV)) setClientRounding(crdV);
        const dscV = parse(dsc);
        if (isObj(dscV)) setDescriptions({
          en: { ...DEFAULT_DESCRIPTIONS.en, ...(dscV.en || {}) },
          sk: { ...DEFAULT_DESCRIPTIONS.sk, ...(dscV.sk || {}) },
        });
        const issV = parse(iss); if (isObj(issV)) setIssuer({ ...DEFAULT_ISSUER, ...issV });
        const csvfV = parse(csvf); if (csvfV === 'standard' || csvfV === 'excel-sk') setCsvFormat(csvfV);
        const eV = parse(e); if (Array.isArray(eV)) setEntries(eV);

        // Restore running timers: prefer the new array, fall back to a single legacy timer.
        const atsV = parse(ats);
        const atV = parse(at);
        if (Array.isArray(atsV)) {
          setActiveTimers(atsV.map(normalizeTimer));
        } else if (isObj(atV)) {
          const migrated = [normalizeTimer(atV)];
          setActiveTimers(migrated);
          window.storage.set('tracker:activeTimers', JSON.stringify(migrated)).catch(() => {});
        }
        // The legacy single-timer key is obsolete — remove it so it can never resurrect a stopped timer.
        if (at?.value) window.storage.delete('tracker:activeTimer').catch(() => {});
        // Stamp the schema version (hook for future migrations).
        window.storage.set('tracker:schemaVersion', JSON.stringify(SCHEMA_VERSION)).catch(() => {});
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  // Keep the timer composer's client/activity valid when the lists load or change
  // (the defaults may not exist in the user's own lists).
  useEffect(() => {
    if (clients.length && !clients.includes(selectedClient)) setSelectedClient(clients[0]);
  }, [clients, selectedClient]);
  useEffect(() => {
    if (tasks.length && !tasks.includes(selectedTask)) setSelectedTask(tasks[0]);
  }, [tasks, selectedTask]);

  // Debounced mirror of the full dataset to disk (Tauri only) — survives a cleared in-app store.
  useEffect(() => {
    if (loading || !IS_TAURI) return;
    if (backupRef.current) clearTimeout(backupRef.current);
    backupRef.current = setTimeout(() => {
      writeDiskBackup({ clients, tasks, rates, clientRates, vat, clientVat, rounding, clientRounding, descriptions, issuer, csvFormat, aiFactor, entries });
    }, 1500);
    return () => { if (backupRef.current) clearTimeout(backupRef.current); };
  }, [loading, clients, tasks, rates, clientRates, vat, clientVat, rounding, clientRounding, descriptions, issuer, csvFormat, aiFactor, entries]);

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
  // Sets the live factor in billing.js first, then stores it; every screen re-renders with it.
  const saveAiFactor = (n) => saveTo('aiFactor', setAiFactor(n), setAiFactorState);
  const saveEntries = (n) => saveTo('entries', n, setEntries);
  const saveActiveTimers = (arr) => {
    setActiveTimers(arr);
    window.storage.delete('tracker:activeTimer').catch(() => {}); // obsolete legacy key — keep it gone
    if (arr && arr.length) window.storage.set('tracker:activeTimers', JSON.stringify(arr)).catch(e => console.error(e));
    else window.storage.delete('tracker:activeTimers').catch(e => console.error(e));
  };

  const newTimerId = () => 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

  const startTimer = () => {
    if (!passStartGate()) return;
    const ts = Date.now();
    saveActiveTimers([...activeTimers, { id: newTimerId(), client: selectedClient, task: selectedTask, project, note, ai: aiAssisted, startedAt: ts, runningSince: ts, accumulatedMs: 0 }]);
    setNote('');
    setProject('');
    setAiAssisted(false);
  };
  // Continue an earlier piece of work: start an additional session pre-filled from an entry.
  const resumeWork = (work, opts) => {
    // track hook: identical work (client, activity, project, note) never gets a second timer by accident, from any page.
    // Paused: it resumes. Running: a toast says so. Only the Timer page's "Start another copy" passes { copy: true }.
    const same = (t) => t.client === work.client && t.task === work.task && (t.project || '') === (work.project || '') && (t.note || '').trim() === (work.note || '').trim();
    const on = opts?.copy === true ? null : (activeTimers.find(t => t.runningSince && same(t)) || activeTimers.find(same));
    if (on) {
      if (on.runningSince) pushToast(`Already running: ${(on.note || '').trim() || on.task}`, 'info');
      else { resumeTimer(on.id); pushToast(`Resumed: ${(on.note || '').trim() || on.task}`, 'ok'); }
      return;
    }
    if (!passStartGate()) return;
    const ts = Date.now();
    saveActiveTimers([...activeTimers, { id: newTimerId(), client: work.client, task: work.task, project: work.project || '', note: work.note || '', ai: !!work.ai, startedAt: ts, runningSince: ts, accumulatedMs: 0 }]);
    pushToast(`Started: ${work.client} · ${work.task}${work.project ? ' · ' + work.project : ''}`, 'ok');
  };
  // AI can turn out to be the bigger half mid-session, so the flag stays flippable while running.
  const toggleTimerAi = (id) => saveActiveTimers(activeTimers.map(t => t.id === id ? { ...t, ai: !t.ai } : t));
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
      client: t.client, task: t.task, project: t.project || '', note: t.note || '', ai: !!t.ai,
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
  };  const deleteEntry = (id) => saveEntries(entries.filter(e => e.id !== id));
  const updateEntry = (u) => saveEntries(entries.map(e => e.id === u.id ? u : e));
  const addManualEntry = (entry) => saveEntries([entry, ...entries].sort((a, b) => b.start - a.start));
  const toggleInvoiced = (entry) => saveEntries(entries.map(e => e.id === entry.id ? { ...e, invoiced: !e.invoiced } : e));
  const setInvoicedBulk = (list, value) => {
    const ids = new Set(list.map(e => e.id));
    saveEntries(entries.map(e => ids.has(e.id) ? { ...e, invoiced: value } : e));
    pushToast(`Marked ${ids.size} ${ids.size === 1 ? 'entry' : 'entries'} as ${value ? 'invoiced' : 'unbilled'}.`, 'ok');
  };
  // log hook: bulk change (client or activity) and bulk delete from the Log selection.
  const updateEntriesBulk = (list, patch) => {
    const ids = new Set(list.map(e => e.id));
    saveEntries(entries.map(e => ids.has(e.id) ? { ...e, ...patch } : e));
  };
  const deleteEntriesBulk = (list) => {
    const ids = new Set(list.map(e => e.id));
    saveEntries(entries.filter(e => !ids.has(e.id)));
  };

  const pushToast = (msg, type = 'info') => { notify(msg, type); };
  const navigate = (v) => {
    if (!VIEWS.includes(v)) return;
    setView(v);
    if (mainRef.current) mainRef.current.scrollTop = 0;
  };
  // Mirror the view into ?view= so a reload of the window reopens the same page.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('view') === view) return;
      url.searchParams.set('view', view);
      window.history.replaceState(window.history.state, '', url);
    } catch (e) { /* no history API: nothing to keep */ }
  }, [view]);
  const requestConfirm = (opts) => setConfirmState(opts);
  const confirmDeleteEntry = (entry) => requestConfirm({
    title: 'Delete entry?',
    message: `${entry.client} · ${entry.task}${entry.note ? ' · ' + entry.note : ''} (${formatClock(entry.duration)}) will be permanently removed.`,
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
    if (period === 'year') return new Date(now.getFullYear(), 0, 1).getTime();
    if (period === 'custom' && customStart) return new Date(customStart + 'T00:00:00').getTime();
    return 0;
  };
  const periodEnd = () => {
    if (period === 'custom' && customEnd) return new Date(customEnd + 'T23:59:59.999').getTime();
    if (period === 'year') return new Date(new Date().getFullYear() + 1, 0, 1).getTime() - 1;
    // reports hook: today / week / month end on their last day, so future-dated entries stay out (same window as Dashboard periodWindow)
    const n = new Date();
    if (period === 'today') return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).getTime() - 1;
    if (period === 'week') return new Date(n.getFullYear(), n.getMonth(), n.getDate() - ((n.getDay() + 6) % 7) + 7).getTime() - 1;
    if (period === 'month') return new Date(n.getFullYear(), n.getMonth() + 1, 1).getTime() - 1;
    return Infinity;
  };

  const filteredEntries = useMemo(() => {
    const start = periodStart();
    const end = periodEnd();
    return entries.filter(e =>
      e.start >= start && e.start <= end
      && (filterClient === 'all' || e.client === filterClient)
      && (filterBilled === 'all' || (filterBilled === 'invoiced' ? e.invoiced : !e.invoiced))
      && !excludedTasks.includes(e.task));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, period, customStart, customEnd, filterClient, filterBilled, excludedTasks]);

  // Every activity the filters can offer: the configured list plus any old names still used by entries.
  const activityOptions = useMemo(
    () => Array.from(new Set([...tasks, ...entries.map(e => e.task)])),
    [tasks, entries]);

  const projectSuggestions = useMemo(
    () => Array.from(new Set(entries.map(e => e.project).filter(Boolean))),
    [entries]);

  // Most recent distinct pieces of work (client+task+project+note) for one-click continuation.
  const recentWork = useMemo(() => {
    const seen = new Set(); const out = [];
    [...entries].sort((a, b) => b.start - a.start).forEach(e => {
      const key = `${e.client}|${e.task}|${e.project || ''}|${e.note || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(e);
    });
    return out.slice(0, 5);
  }, [entries]);

  const { totalMs, totalBillableMs, totalEarnings, totalComplimentary, complimentaryCount, byClient, totalGross } = useMemo(() => {
    const totalMs = filteredEntries.reduce((s, e) => s + e.duration, 0);
    // Billable time excludes complimentary (free) work, so it matches the billed earnings and the PDF report.
    const totalBillableMs = filteredEntries.reduce((s, e) => e.free ? s : s + billableDuration(e, getRounding(e.client, rounding, clientRounding)), 0);
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
      const billableMs = e.free ? 0 : billableDuration(e, byClient[e.client].rounding);
      byClient[e.client].total += e.duration;
      byClient[e.client].billable += billableMs;
      byClient[e.client].earnings += earned;
      if (e.free) {
        byClient[e.client].complimentary += calcStandardValue(e, rates, clientRates, rounding, clientRounding);
        byClient[e.client].complimentaryCount += 1;
      }
      if (!byClient[e.client].byTask[e.task]) byClient[e.client].byTask[e.task] = { ms: 0, billable: 0, earnings: 0, byNote: {} };
      const bt = byClient[e.client].byTask[e.task];
      bt.ms += e.duration;
      bt.billable += billableMs;
      bt.earnings += earned;
      const noteLabel = [e.project, e.note].filter(Boolean).join(' — ') || '(no note)';
      if (!bt.byNote[noteLabel]) bt.byNote[noteLabel] = { ms: 0, billable: 0, earnings: 0 };
      bt.byNote[noteLabel].ms += e.duration;
      bt.byNote[noteLabel].billable += billableMs;
      bt.byNote[noteLabel].earnings += earned;
    });
    // Money totals follow the one shared rule (billingTotals) so Dashboard, Log, Reports and the PDF agree to the cent.
    const money = billingTotals(filteredEntries, { rates, clientRates, vat, clientVat, rounding, clientRounding });
    const totalGross = money.gross;
    return { totalMs, totalBillableMs, totalEarnings: money.net, totalComplimentary, complimentaryCount, byClient, totalGross };
  }, [filteredEntries, rates, clientRates, vat, clientVat, rounding, clientRounding, aiFactor]);

  const exportCSV = (list, suffix) => {
    const data = Array.isArray(list) ? list : entries;
    if (data.length === 0) { pushToast('No entries to export for the current selection.', 'err'); return; }
    const excel = csvFormat === 'excel-sk';
    const sep = excel ? ';' : ',';
    const num = (n, dp = 2) => { const s = Number(n).toFixed(dp); return excel ? s.replace('.', ',') : s; };
    const rows = [['Date', 'Client', 'Project', 'Task', 'Note', 'Free', 'AI', 'Invoiced', 'Start', 'End', 'Duration (h)', 'Duration (hh:mm:ss)', 'Rounding (min)', 'Billable (h)', 'Rate (€/h)', 'Standard value (€)', 'Earnings net (€)', 'VAT %', 'Earnings with VAT (€)']];
    [...data].sort((a, b) => b.start - a.start).forEach(e => {
      const rate = getRate(e.client, e.task, rates, clientRates);
      const r = getRounding(e.client, rounding, clientRounding);
      const billableMs = billableDuration(e, r);
      const standardValue = calcStandardValue(e, rates, clientRates, rounding, clientRounding);
      const earnings = calcEarnings(e, rates, clientRates, rounding, clientRounding);
      const entryVat = getVat(e.client, vat, clientVat);
      const withVat = billingTotals([e], { rates, clientRates, vat, clientVat, rounding, clientRounding }).gross; // log hook: row gross via vatOf (Money rule), same cents as the Log row
      rows.push([
        isoDay(new Date(e.start)), e.client, e.project || '', e.task, e.note || '',
        e.free ? 'YES' : '', e.ai ? 'YES' : '', e.invoiced ? 'YES' : '',
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
    a.href = url; a.download = `time-tracker${suffix ? '-' + suffix : ''}-${isoDay()}.csv`; a.click();
    URL.revokeObjectURL(url);
    pushToast(`Exported ${data.length} ${data.length === 1 ? 'entry' : 'entries'} to CSV.`, 'ok');
  };

  // CSV from the Dashboard honours the active client + period filter.
  const csvFilterSuffix = () => {
    const parts = [];
    if (filterClient !== 'all') parts.push(filterClient.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
    if (period !== 'all') parts.push(period === 'custom' ? `${customStart || 'start'}_${customEnd || 'end'}` : period);
    if (filterBilled !== 'all') parts.push(filterBilled);
    const excl = excludedSuffix(excludedTasks, activityOptions);
    if (excl) parts.push(excl);
    return parts.join('-');
  };
  const exportDashboardCSV = () => exportCSV(filteredEntries, csvFilterSuffix());

  // PDF report / invoice for one client. With "All clients" the Dashboard passes the client picked
  // from its menu; the client filter then follows, so the screen matches the document.
  const exportPDF = (pickedClient, mode) => { // invoice hook: optional mode 'invoice' | 'report'
    const client = typeof pickedClient === 'string' ? pickedClient : filterClient;
    if (!client || client === 'all') { pushToast('Pick a client to make a PDF report or invoice.', 'err'); return; }
    const clientEntries = filteredEntries.filter(e => e.client === client).sort((a, b) => a.start - b.start);
    if (clientEntries.length === 0) { pushToast('No entries to export for this client and period.', 'err'); return; }
    if (client !== filterClient) setFilterClient(client);
    // invoice hook: unbilled work opens as an invoice unless the caller asks for a mode
    setPdfOptionsFor({ client, entries: clientEntries, mode: typeof mode === 'string' ? mode : (filterBilled === 'unbilled' ? 'invoice' : undefined) });
  };

  const generatePDF = (options) => {
    if (!pdfOptionsFor) return;
    const pdfClient = pdfOptionsFor.client || filterClient;
    let html;
    try {
      html = buildPDFHTML({
        client: pdfClient, entries: pdfOptionsFor.entries, rates, clientRates,
        vat: getVat(pdfClient, vat, clientVat),
        rounding: getRounding(pdfClient, rounding, clientRounding),
        period, customStart, customEnd,
        showDates: options.showDates,
        showTimes: options.showTimes,
        showNotes: options.showNotes,
        showVat: options.showVat,
        showQr: options.showQr, // invoice hook: payment QR on/off
        language: options.language,
        descriptions,
        issuer,
        invoiceMode: options.invoiceMode,
        invoiceNumber: options.invoiceNumber,
        issueDate: options.issueDate,
        dueDate: options.dueDate,
        ...(options.extra || {}), // invoice hook: entries (invoiced ones left out), billTo, showDescriptions from the dialog
      });
    } catch (err) {
      console.error(err); pushToast('Error generating report: ' + (err.message || err), 'err'); return;
    }
    setPdfOptionsFor(null);
    printReportHTML(html, pdfClient, pushToast);
  };

  // Full JSON backup — the only export that round-trips back into the app.
  const exportBackup = () => {
    const backup = {
      app: 'timetracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { clients, tasks, rates, clientRates, vat, clientVat, rounding, clientRounding, descriptions, issuer, csvFormat, aiFactor, entries }, // invoice hook: issuer (supplier + Bill to details) is in the backup too; csvFormat so a restore keeps every setting
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timetracker-backup-${isoDay()}.json`;
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
        ai: !!e.ai,
        invoiced: !!e.invoiced,
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
    if (data.issuer && typeof data.issuer === 'object' && !Array.isArray(data.issuer)) saveIssuer({ ...DEFAULT_ISSUER, ...data.issuer }); // invoice hook: older backups have no issuer and keep the current one
    if (data.csvFormat === 'standard' || data.csvFormat === 'excel-sk') saveCsvFormat(data.csvFormat); // older backups have none and keep the current one
    if (data.aiFactor != null) saveAiFactor(data.aiFactor); // older backups have none and keep the current factor
    saveEntries(validEntries.sort((a, b) => b.start - a.start));
    return validEntries.length;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3 text-fg-subtle">
          <BrandMark size={36} className="animate-pulse" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  const openManualEntry = () => setShowManualEntry(true);

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-canvas text-fg">
        <datalist id="project-suggestions">
          {projectSuggestions.map(p => <option key={p} value={p} />)}
        </datalist>
        <Sidebar view={view} onNavigate={navigate} activeTimers={activeTimers} onPause={pauseTimer} onResume={resumeTimer}
          workspace={issuer && issuer.name ? issuer.name : ''} themePref={themePref} onThemeChange={setThemePref} />

        <main ref={mainRef} className="relative min-w-0 flex-1 overflow-y-auto" id="main">
          <Suspense key={'ai-' + aiFactor} fallback={null}>{/* a new AI factor remounts the views so every memo re-prices */}
          {view === 'track' && (
            <TrackView
              activeTimers={activeTimers} onPause={pauseTimer} onResume={resumeTimer} onStop={stopTimer} onToggleAi={toggleTimerAi}
              clients={clients} tasks={tasks} projectSuggestions={projectSuggestions}
              selectedClient={selectedClient} setSelectedClient={setSelectedClient}
              selectedTask={selectedTask} setSelectedTask={setSelectedTask}
              project={project} setProject={setProject}
              note={note} setNote={setNote}
              aiAssisted={aiAssisted} setAiAssisted={setAiAssisted}
              onStart={startTimer} onAddManualEntry={openManualEntry}
              recentWork={recentWork} onResumeWork={resumeWork}
              entries={entries} rates={rates} clientRates={clientRates} rounding={rounding} clientRounding={clientRounding}
              onEdit={setEditingEntry} onDelete={confirmDeleteEntry} onNavigate={navigate}
              onUpdateTimer={(id, patch) => saveActiveTimers(activeTimers.map(t => t.id === id ? { ...t, ...patch } : t))} /* track hook: edit a running timer (same fields, no new keys) */ />
          )}
          {view === 'calendar' && (
            <CalendarView onAddManualEntry={openManualEntry} onNavigate={navigate}
              entries={entries} clients={clients} tasks={tasks} activeTimers={activeTimers}
              rates={rates} clientRates={clientRates} vat={vat} clientVat={clientVat} rounding={rounding} clientRounding={clientRounding}
              onEdit={setEditingEntry} onDelete={confirmDeleteEntry} onResume={resumeWork}
              onCreateEntry={addManualEntry} onUpdateEntry={updateEntry} pushToast={pushToast}
              onPauseTimer={pauseTimer} onResumeTimer={resumeTimer} onStopTimer={stopTimer} // calendar hook: timer bar
            />
          )}
          {view === 'dashboard' && (
            <Dashboard
              period={period} setPeriod={setPeriod}
              customStart={customStart} setCustomStart={setCustomStart}
              customEnd={customEnd} setCustomEnd={setCustomEnd}
              filterClient={filterClient} setFilterClient={setFilterClient}
              filterBilled={filterBilled} setFilterBilled={setFilterBilled}
              activityOptions={activityOptions} excludedTasks={excludedTasks} setExcludedTasks={setExcludedTasks}
              clients={clients}
              allEntries={entries} // reports hook: previous-period comparison needs the unfiltered list
              totalMs={totalMs} totalBillableMs={totalBillableMs}
              totalEarnings={totalEarnings} totalGross={totalGross}
              totalComplimentary={totalComplimentary} complimentaryCount={complimentaryCount}
              byClient={byClient} filteredCount={filteredEntries.length}
              filteredEntries={filteredEntries} rates={rates} clientRates={clientRates} rounding={rounding} clientRounding={clientRounding}
              onExport={exportDashboardCSV} onExportPDF={exportPDF}
            />
          )}
          {view === 'log' && (
            <Log entries={entries} clients={clients} activityOptions={activityOptions} rates={rates} clientRates={clientRates}
              vat={vat} clientVat={clientVat}
              rounding={rounding} clientRounding={clientRounding} csvFormat={csvFormat}
              onDelete={confirmDeleteEntry} onEdit={setEditingEntry} onResume={resumeWork} onExport={exportCSV}
              onToggleInvoiced={toggleInvoiced} onBulkInvoiced={setInvoicedBulk}
              onAddManualEntry={openManualEntry}
              onUpdateEntry={updateEntry} onBulkUpdate={updateEntriesBulk} onBulkDelete={deleteEntriesBulk}
              activeTimers={activeTimers} onStopTimer={stopTimer} onNavigate={navigate} // log hook: start/stop bar on top of the Log
            />
          )}
          {view === 'insights' && (
            <InsightsView entries={entries} activityOptions={activityOptions} rates={rates} clientRates={clientRates}
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
              aiFactor={aiFactor} onSaveAiFactor={saveAiFactor}
              entryCount={entries.length} onExportBackup={exportBackup} onImportBackup={importBackup}
              onRequestConfirm={requestConfirm} pushToast={pushToast}
              themePref={themePref} onThemeChange={setThemePref} />
          )}
          </Suspense>
        </main>

        {showManualEntry && (
          <ManualEntryModal clients={clients} tasks={tasks} entries={entries} /* track hook: projects scoped to the chosen client */
            onClose={() => setShowManualEntry(false)}
            onSave={(entry) => { addManualEntry(entry); setShowManualEntry(false); }} />
        )}
        {editingEntry && (
          <EditEntryModal entry={editingEntry} clients={clients} tasks={tasks}
            onClose={() => setEditingEntry(null)}
            onSave={(u) => { updateEntry(u); setEditingEntry(null); }} />
        )}
        {pdfOptionsFor && (
          <PDFOptionsModal client={pdfOptionsFor.client || filterClient} entryCount={pdfOptionsFor.entries.length} hasAi={pdfOptionsFor.entries.some(e => e.ai)} issuer={issuer}
            pdfInput={{ // invoice hook: same inputs as generatePDF, for the live preview
              entries: pdfOptionsFor.entries, rates, clientRates, descriptions, period, customStart, customEnd,
              vat: getVat(pdfOptionsFor.client || filterClient, vat, clientVat), rounding: getRounding(pdfOptionsFor.client || filterClient, rounding, clientRounding) }}
            initialMode={pdfOptionsFor.mode} // invoice hook
            onSaveIssuer={saveIssuer} // invoice hook: remembers the client's Bill to details (issuer.clientDetails)
            onClose={() => setPdfOptionsFor(null)}
            onGenerate={generatePDF} />
        )}
        {confirmState && (
          <ConfirmDialog {...confirmState} onClose={() => setConfirmState(null)} />
        )}
        <ToastStack theme={theme} />
      </div>
    </TooltipProvider>
  );
}
