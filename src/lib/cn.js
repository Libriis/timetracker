import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge must know our custom scale names, or it treats `text-md` / `text-2xs`
// as colors and drops them next to `text-fg`.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['2xs', 'md'] }],
      shadow: [{ shadow: ['xs', 'card', 'brand', 'focus'] }],
      rounded: [{ rounded: ['control', 'card', 'dialog'] }],
    },
  },
});

// Tailwind-aware class joiner: later classes win over conflicting earlier ones.
// cn('px-2 text-fg', cond && 'px-4') -> 'text-fg px-4'
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
