import { useEffect, useState } from 'react';

export function useMediaQuery(query) {
  const get = () => { try { return window.matchMedia(query).matches; } catch (e) { return false; } };
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia(query); } catch (e) { return undefined; }
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

// Small persisted UI preference (tracker:ui:* keys only). JSON-encoded, failures ignored.
export function readUiPref(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) { return fallback; }
}
export function writeUiPref(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
}
