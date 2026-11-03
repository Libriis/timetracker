// Pause turns into Resume under the pointer (and back), so a quick second click would undo the first.
// A pointer click that flips the same timer again within FLIP_GUARD_MS does nothing, and so does the
// second click of a double-click (detail > 1). Keyboard activation (detail 0) always counts, so Space
// on a focused button, or the Space shortcut, still pauses and resumes as fast as you press it.
const FLIP_GUARD_MS = 400;
const lastFlip = new Map();

export function pointerFlipOk(id, ev) {
  if (!ev || !ev.detail) return true;
  if (ev.detail > 1) return false;
  const now = Date.now();
  if (now - (lastFlip.get(id) || 0) < FLIP_GUARD_MS) return false;
  // Forget old timers so the map stays small.
  for (const [k, at] of lastFlip) if (now - at > 60000) lastFlip.delete(k);
  lastFlip.set(id, now);
  return true;
}
