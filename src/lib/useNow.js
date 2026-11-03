import { useEffect, useState } from 'react';

// One shared 1-second clock for every live timer readout, so all clocks tick in sync
// and only subscribed components re-render. Pass active=false to stop ticking.
const subscribers = new Set();
let intervalId = null;

function tick() {
  const now = Date.now();
  subscribers.forEach(fn => fn(now));
}

export function useNow(active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    subscribers.add(setNow);
    if (!intervalId) intervalId = setInterval(tick, 1000);
    return () => {
      subscribers.delete(setNow);
      if (subscribers.size === 0 && intervalId) { clearInterval(intervalId); intervalId = null; }
    };
  }, [active]);
  return now;
}
