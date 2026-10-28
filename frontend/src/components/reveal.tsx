'use client';
import { useEffect, useRef } from 'react';
import { EASE, gsap } from '@/lib/gsap';

/** Fades and slides its children up when they scroll into view (GSAP ScrollTrigger). `delay` (ms) staggers siblings. */
export function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(el, { opacity: 0, y: 36 }, {
        opacity: 1, y: 0, duration: 0.9, delay: delay / 1000, ease: EASE, clearProps: 'transform',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });
    mm.add('(prefers-reduced-motion: reduce)', () => { gsap.set(el, { opacity: 1, y: 0 }); });
    return () => mm.revert();
  }, [delay]);
  return <div ref={ref} className={`reveal ${className}`}>{children}</div>;
}
