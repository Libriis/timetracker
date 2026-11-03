import { useEffect, useState, useCallback } from 'react';

// UI preference only: 'system' (default, follows the OS), 'light' or 'dark'.
// Stored under the UI-only key below. Never part of backups or billing data.
export const THEME_KEY = 'tracker:ui:theme';
const VALID = ['system', 'light', 'dark'];

export function readThemePref() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw == null) return 'system';
    let v = raw;
    try { v = JSON.parse(raw); } catch (e) { /* stored as a bare string */ }
    return VALID.includes(v) ? v : 'system';
  } catch (e) {
    return 'system';
  }
}

function systemPrefersDark() {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
}

export function resolveTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  return systemPrefersDark() ? 'dark' : 'light';
}

export function applyTheme(resolved) {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.classList.toggle('dark', resolved === 'dark');
}

// Returns { pref, resolved, setPref }. Keeps <html data-theme> in sync with the OS when pref is 'system'.
export function useTheme() {
  const [pref, setPrefState] = useState(readThemePref);
  const [resolved, setResolved] = useState(() => resolveTheme(readThemePref()));

  useEffect(() => {
    const r = resolveTheme(pref);
    setResolved(r);
    applyTheme(r);
    if (pref !== 'system') return undefined;
    let mq;
    try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) { return undefined; }
    const onChange = () => { const next = mq.matches ? 'dark' : 'light'; setResolved(next); applyTheme(next); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const setPref = useCallback((next) => {
    if (!VALID.includes(next)) return;
    setPrefState(next);
    try { localStorage.setItem(THEME_KEY, JSON.stringify(next)); } catch (e) { /* storage unavailable */ }
  }, []);

  return { pref, resolved, setPref };
}
