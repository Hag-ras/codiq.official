'use client';
import { useEffect, useRef } from 'react';
import { EASE, gsap } from '@/lib/gsap';

/** Wraps the auth card: it rises in with GSAP, and typing in any field fires a signal in the neural network beside it. */
export function AuthCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from(el, { y: 40, opacity: 0, scale: 0.97, duration: 0.9, ease: EASE, clearProps: 'transform,opacity' });
    });
    let last = 0;
    const onInput = () => {
      const now = Date.now();
      if (now - last < 250) return;
      last = now;
      window.dispatchEvent(new Event('neural:fire'));
    };
    el.addEventListener('input', onInput);
    return () => { mm.revert(); el.removeEventListener('input', onInput); };
  }, []);
  return <div ref={ref} className="stagger w-full max-w-[440px] rounded-2xl border border-line bg-white p-7">{children}</div>;
}
