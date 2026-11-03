import { useLayoutEffect } from 'react';

// One spelling of September on the Dashboard. The shared DateRangePicker formats its dates en-GB
// ("3 Aug – 28 Sept"); every other Reports label (axes, compare notes, the page header, Insights)
// says "Sep". Until the shared formatter changes, this rewrites "<day> Sept" to "<day> Sep" inside
// the picker: its trigger text, its aria-label and its open popover (a portal, found through the
// trigger's aria-controls). Text only. React keeps owning the nodes and never reads them back, and
// a rewrite that finds nothing to change stops, so the observers never loop.
const SEPT = /(\d{1,2})(\s)Sept\b/g;
const fixText = (s) => (s && s.includes('Sept') ? s.replace(SEPT, '$1$2Sep') : s);

function fix(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const v = fixText(n.nodeValue);
    if (v !== n.nodeValue) n.nodeValue = v;
  }
  root.querySelectorAll('[aria-label*="Sept"]').forEach(el => {
    const a = el.getAttribute('aria-label');
    const v = fixText(a);
    if (v !== a) el.setAttribute('aria-label', v);
  });
}

export function useSepSpelling(ref) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || typeof MutationObserver === 'undefined') return undefined;
    let popover = null;
    let popObs = null;
    const watchPopover = () => {
      const trigger = root.querySelector('[aria-haspopup="dialog"][aria-controls]');
      const id = trigger?.getAttribute('aria-expanded') === 'true' ? trigger.getAttribute('aria-controls') : null;
      const el = id ? document.getElementById(id) : null;
      if (el === popover) return;
      popObs?.disconnect();
      popObs = null;
      popover = el;
      if (el) {
        fix(el);
        popObs = new MutationObserver(() => fix(el));
        popObs.observe(el, { subtree: true, childList: true, characterData: true });
      }
    };
    const run = () => { fix(root); watchPopover(); };
    const own = new MutationObserver(run);
    own.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'aria-expanded'] });
    // The popover mounts in a portal on <body>; a shallow watch there catches it opening.
    const body = new MutationObserver(watchPopover);
    body.observe(document.body, { childList: true });
    run();
    return () => { own.disconnect(); body.disconnect(); popObs?.disconnect(); };
  }, [ref]);
}
