import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { paginatePDF, pdfHTMLForFrame } from '../../lib/pdf.js';
import { cn } from '../../lib/cn.js';

const PAGE_W = 794; // A4 at 96 dpi: the document is laid out at its real print width, then scaled down.

// Live preview of the PDF document. The HTML goes into a same-origin blank iframe with document.write
// (the same path printing uses, so it works under the packaged app's CSP), laid out at A4 width and
// scaled to fit the column. Page 1 is split exactly as it will print (paginatePDF), so a long invoice
// shows its continuation sheet here too. The frame is as tall as the document; the outer well scrolls.
// onLayout({ sheets, split }) reports how many sheets the document has and whether page 1 had to break.
export function PDFPreview({ html, className, label = 'Document preview', onLayout }) {
  const wellRef = useRef(null);
  const frameRef = useRef(null);
  const layoutRef = useRef(onLayout);
  layoutRef.current = onLayout;
  const [scale, setScale] = useState(0.6);
  const [docH, setDocH] = useState(1123);

  useLayoutEffect(() => {
    const el = wellRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const fit = () => {
      const inner = el.clientWidth - 32; // p-4 on both sides
      if (inner > 0) setScale(Math.min(1, inner / PAGE_W));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    const doc = frame && (frame.contentDocument || frame.contentWindow?.document);
    if (!doc || !html) return undefined;
    let alive = true;
    doc.open();
    doc.write(pdfHTMLForFrame(html));
    doc.close();
    doc.documentElement.setAttribute('data-embed', '');
    const layout = () => {
      if (!alive) return;
      let split = -1;
      try { split = paginatePDF(doc); } catch (e) { console.error(e); }
      const h = Math.max(doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0);
      if (h > 0) setDocH(h);
      if (layoutRef.current) layoutRef.current({ sheets: doc.querySelectorAll('.sheet:not(.merged)').length, split: split >= 0 });
    };
    layout();
    // Re-split once the embedded font has loaded: the first pass may have measured a fallback font.
    try { doc.fonts?.ready?.then(layout); } catch (e) { /* no font loading API */ }
    const t = setTimeout(layout, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [html]);

  return (
    <div ref={wellRef}
      className={cn('overflow-y-auto overflow-x-hidden rounded-xl border border-line bg-surface-3 p-4', className)}>
      <div className="mx-auto" style={{ width: PAGE_W * scale, height: docH * scale }}>
        <iframe ref={frameRef} title={label} tabIndex={-1} scrolling="no"
          className="block origin-top-left rounded-[2px] bg-transparent"
          style={{ width: PAGE_W, height: docH, border: 0, transform: `scale(${scale})` }} />
      </div>
    </div>
  );
}
