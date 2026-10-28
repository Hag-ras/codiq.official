'use client';
import { useEffect } from 'react';
import { EASE, gsap } from '@/lib/gsap';

/**
 * GSAP motion for the landing page. It only animates elements marked with data attributes, so the
 * server-rendered markup stays the source of truth:
 *   data-hero          hero text column (children enter in sequence)
 *   data-hero-title    the headline (rises in) with [data-shine] blurring into focus
 *   data-tilt          3D tilt that follows the pointer
 *   data-parallax="n"  drifts with scroll (n = distance in px)
 *   data-magnetic      pulled slightly toward the pointer
 *   data-steps         list whose items get a growing top rule
 */
export function LandingMotion() {
  useEffect(() => {
    const mm = gsap.matchMedia();

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const hero = document.querySelector<HTMLElement>('[data-hero]');
      if (hero) {
        const tl = gsap.timeline({ defaults: { ease: EASE } });
        tl.from(hero.children, { y: 40, opacity: 0, duration: 0.9, stagger: 0.12, clearProps: 'transform,opacity' });
        const shine = hero.querySelector('[data-shine]');
        if (shine) tl.from(shine, { filter: 'blur(14px)', opacity: 0, duration: 1, clearProps: 'filter,opacity' }, 0.25);
      }

      const tilt = document.querySelector<HTMLElement>('[data-tilt]');
      if (tilt) {
        gsap.from(tilt, { y: 60, opacity: 0, rotateX: 12, duration: 1.1, delay: 0.25, ease: EASE, transformPerspective: 900 });
      }

      document.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
        const d = Number(el.dataset.parallax) || 60;
        gsap.to(el, { y: d, ease: 'none', scrollTrigger: { trigger: el.parentElement ?? el, start: 'top top', end: 'bottom top', scrub: 0.6 } });
      });

      document.querySelectorAll<HTMLElement>('[data-steps] > li > div').forEach((el, i) => {
        gsap.fromTo(el, { '--rule': 0 }, { '--rule': 1, duration: 0.9, delay: i * 0.1, ease: EASE, scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
      });
    });

    // Pointer effects only make sense with a real mouse.
    mm.add('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)', () => {
      const cleanups: (() => void)[] = [];

      const tilt = document.querySelector<HTMLElement>('[data-tilt]');
      if (tilt) {
        const rx = gsap.quickTo(tilt, 'rotateX', { duration: 0.6, ease: 'power3.out' });
        const ry = gsap.quickTo(tilt, 'rotateY', { duration: 0.6, ease: 'power3.out' });
        const move = (e: PointerEvent) => {
          const r = tilt.getBoundingClientRect();
          ry(((e.clientX - r.left) / r.width - 0.5) * 10);
          rx(-((e.clientY - r.top) / r.height - 0.5) * 10);
        };
        const leave = () => { rx(0); ry(0); };
        tilt.addEventListener('pointermove', move);
        tilt.addEventListener('pointerleave', leave);
        cleanups.push(() => { tilt.removeEventListener('pointermove', move); tilt.removeEventListener('pointerleave', leave); });
      }

      document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
        const x = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
        const y = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          x((e.clientX - (r.left + r.width / 2)) * 0.25);
          y((e.clientY - (r.top + r.height / 2)) * 0.35);
        };
        const leave = () => { x(0); y(0); };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerleave', leave);
        cleanups.push(() => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); });
      });

      return () => cleanups.forEach((fn) => fn());
    });

    return () => mm.revert();
  }, []);
  return null;
}
