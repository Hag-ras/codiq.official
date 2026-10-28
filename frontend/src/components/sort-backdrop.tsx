'use client';
import { useEffect, useRef } from 'react';
import { gsap } from '@/lib/gsap';

const N = 24;
const CLAY = '#ae593a';

/** Backdrop for the rest of the site: a row of bars along the bottom keeps sorting itself, shuffles, and starts over. */
export function SortBackdrop() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const bars = [...el.querySelectorAll<HTMLElement>('[data-bar]')];
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const heights = bars.map((_, i) => 12 + (i * 88) / (N - 1));
      bars.forEach((b, i) => gsap.set(b, { height: heights[i] + '%', left: (i * 100) / N + '%', opacity: 0.1 }));
      let slotOf = bars.map((_, i) => i); // slotOf[bar] = its current slot
      let tl: gsap.core.Timeline;
      let next: gsap.core.Tween | undefined;
      let alive = true;
      const slotLeft = (s: number) => (s * 100) / N + '%';

      const cycle = () => {
        tl = gsap.timeline({ onComplete: () => { if (alive) next = gsap.delayedCall(1.5, cycle); } });
        // Shuffle: every bar glides to a random slot.
        const slots = gsap.utils.shuffle(bars.map((_, i) => i));
        slotOf = slots;
        tl.to(bars, { left: (i: number) => slotLeft(slots[i]), duration: 1.4, ease: 'power2.inOut', stagger: 0.02 });
        // Bubble sort, animating only the steps that swap two neighbours.
        const order: number[] = []; // order[slot] = bar
        slots.forEach((s, bar) => { order[s] = bar; });
        let swapped = true;
        while (swapped) {
          swapped = false;
          for (let s = 0; s < N - 1; s++) {
            const a = order[s], b = order[s + 1];
            if (heights[a] > heights[b]) {
              tl.set([bars[a], bars[b]], { backgroundColor: CLAY, opacity: 0.4 });
              tl.to(bars[a], { left: slotLeft(s + 1), duration: 0.09, ease: 'none' }, '+=0.02');
              tl.to(bars[b], { left: slotLeft(s), duration: 0.09, ease: 'none' }, '<');
              tl.set([bars[a], bars[b]], { backgroundColor: 'currentColor', opacity: 0.1 });
              order[s] = b; order[s + 1] = a;
              swapped = true;
            }
          }
        }
        // Sorted: a clay wave runs across the bars.
        tl.to(bars, { backgroundColor: CLAY, opacity: 0.35, duration: 0.25, stagger: 0.04 });
        tl.to(bars, { backgroundColor: 'currentColor', opacity: 0.1, duration: 0.6, stagger: 0.02 }, '+=0.3');
      };
      cycle();
      return () => { alive = false; next?.kill(); tl?.kill(); };
    });
    return () => mm.revert();
  }, []);
  return (
    <div ref={root} dir="ltr" aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 -z-10 h-32 text-ink [mask-image:linear-gradient(to_top,black_30%,transparent)]">
      {Array.from({ length: N }, (_, i) => (
        <span key={i} data-bar className="absolute bottom-0 rounded-t-[3px] bg-current" style={{ width: `calc(${100 / N}% - 6px)`, height: `${12 + (i * 88) / (N - 1)}%`, left: `${(i * 100) / N}%`, opacity: 0.1, marginInlineStart: 3 }} />
      ))}
    </div>
  );
}
