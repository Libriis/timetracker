// Width a row of elements would take with nothing cut. Truncated text still reports its full scrollWidth,
// so the result does not depend on the current layout: measuring never flips a layout back and forth.
// Flex children without their own text are measured part by part; max-width in px still caps a part.
export function naturalWidth(el) {
  if (!el) return 0;
  const cs = getComputedStyle(el);
  const kids = [...el.children].filter((k) => {
    const s = getComputedStyle(k);
    return s.display !== 'none' && s.position !== 'absolute' && s.position !== 'fixed';
  });
  let w = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.columnGap) || 0) * Math.max(0, kids.length - 1);
  for (const k of kids) {
    const kcs = getComputedStyle(k);
    const hasText = [...k.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const own = k instanceof SVGElement ? k.getBoundingClientRect().width
      : kcs.display.includes('flex') && !hasText ? naturalWidth(k)
        : Math.max(k.scrollWidth, k.getBoundingClientRect().width);
    const max = kcs.maxWidth.endsWith('px') ? parseFloat(kcs.maxWidth) : Infinity;
    w += (parseFloat(kcs.marginLeft) || 0) + (parseFloat(kcs.marginRight) || 0) + Math.min(own, max);
  }
  return Math.ceil(w);
}
