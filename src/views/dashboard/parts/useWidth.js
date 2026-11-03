import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Width of an element, kept current with a ResizeObserver. Layout decisions that depend on the
// card's own width (not the viewport) use this, because the sidebar changes how wide a card is.
export function useWidth() {
  const [ref, size] = useSize();
  return [ref, size.w];
}

// Width and height of an element.
export function useSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => {
      const { width: w, height: h } = e.contentRect;
      setSize(s => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}
