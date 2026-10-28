'use client';
import { useEffect, useRef } from 'react';
import { gsap, ScrollTrigger } from '@/lib/gsap';

/** A thin clay bar at the top of the page that fills as you scroll. */
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tween = gsap.to(el, {
      scaleX: 1, ease: 'none',
      scrollTrigger: { trigger: document.documentElement, start: 'top top', end: 'max', scrub: 0.3 },
    });
    return () => { tween.scrollTrigger?.kill(); tween.kill(); ScrollTrigger.refresh(); };
  }, []);
  return <div ref={bar} aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] origin-[0_50%] scale-x-0 bg-clay rtl:origin-[100%_50%]" />;
}
