'use client';
import { useEffect, useRef } from 'react';
import { gsap } from '@/lib/gsap';

const COUNT = 28;

/** A light rain of 0s and 1s falling down the page, forever. Sparse and faint so it never fights the content. */
export function BinaryRain() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const bit = () => (Math.random() < 0.5 ? '0' : '1');
      el.querySelectorAll<HTMLElement>('[data-bit]').forEach((b, i) => {
        const place = () => {
          b.textContent = bit();
          b.style.left = gsap.utils.random(1, 97) + '%';
          // Most digits are ink; now and then one is the brand blue.
          const accent = Math.random() < 0.16;
          b.style.color = accent ? 'var(--color-clay)' : 'var(--color-ink)';
          b.style.opacity = String(accent ? gsap.utils.random(0.28, 0.4) : gsap.utils.random(0.1, 0.2));
          b.style.fontSize = Math.round(gsap.utils.random(15, 26)) + 'px';
        };
        place();
        const duration = gsap.utils.random(9, 17);
        gsap.fromTo(b, { y: '-8vh' }, { y: '108vh', duration, ease: 'none', repeat: -1, onRepeat: place, delay: -gsap.utils.random(0, duration) });
      });
    });
    return () => mm.revert();
  }, []);
  return (
    <div ref={root} dir="ltr" aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden font-mono font-bold">
      {Array.from({ length: COUNT }, (_, i) => <span key={i} data-bit className="absolute top-0 opacity-0">0</span>)}
    </div>
  );
}
