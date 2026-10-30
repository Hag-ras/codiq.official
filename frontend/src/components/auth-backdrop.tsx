'use client';
import { useEffect, useMemo, useRef } from 'react';
import { gsap } from '@/lib/gsap';

const W = 1200;
const H = 800;
const LAYERS = [4, 6, 6, 5, 3];
// Output nodes wear the three track colours (kids, school, college).
const OUT = ['#2b62b3', '#3d7a5a', '#6a4c9c'];
const NS = 'http://www.w3.org/2000/svg';
const GLYPHS: { t: string; x: string; y: string; s: number; code?: boolean }[] = [
  { t: '{ }', x: '8%', y: '14%', s: 34 }, { t: '</>', x: '84%', y: '12%', s: 30 }, { t: '=>', x: '6%', y: '70%', s: 28 },
  { t: '01', x: '90%', y: '64%', s: 30 }, { t: '[ ]', x: '22%', y: '88%', s: 26 }, { t: '( )', x: '74%', y: '90%', s: 26 },
  { t: 'brain.learn("think it")', x: '58%', y: '6%', s: 14 }, { t: 'if (idea) code();', x: '4%', y: '40%', s: 14 },
  { t: 'for (;;) learn();', x: '78%', y: '38%', s: 14 }, { t: '// understand, don\'t memorise', x: '30%', y: '95%', s: 13 },
];

/** Backdrop for the login and sign-up pages: a faint neural network with signals running through it, and code symbols drifting. */
export function AuthBackdrop() {
  const svg = useRef<SVGSVGElement>(null);
  const glyphs = useRef<HTMLDivElement>(null);

  const nodes = useMemo(() => LAYERS.map((n, l) => Array.from({ length: n }, (_, i) => ({
    x: 70 + (l * (W - 140)) / (LAYERS.length - 1) + Math.sin((l + 1) * (i + 2) * 12.9) * 18,
    y: 70 + ((i + 0.5) * (H - 140)) / n + Math.cos((l + 2) * (i + 1) * 7.3) * 16,
  }))), []);
  const edges = useMemo(() => nodes.slice(0, -1).flatMap((layer, l) => layer.flatMap((a, i) => nodes[l + 1].map((b, j) => ({ a, b, k: `${l}-${i}-${j}` })))), [nodes]);

  useEffect(() => {
    const root = svg.current;
    if (!root) return;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const nodeEls = [...root.querySelectorAll<SVGCircleElement>('[data-node]')];
      const sig = root.querySelector<SVGGElement>('[data-signals]')!;
      const at = (l: number, i: number) => nodeEls[LAYERS.slice(0, l).reduce((s, n) => s + n, 0) + i];

      gsap.from(root.querySelectorAll('[data-edge]'), { opacity: 0, duration: 1.2, stagger: { each: 0.004, from: 'random' }, ease: 'none' });
      gsap.from(nodeEls, { scale: 0, transformOrigin: '50% 50%', duration: 0.6, ease: 'back.out(2)', stagger: 0.03, delay: 0.2 });
      nodeEls.forEach((n, i) => gsap.to(n, { opacity: 0.35, duration: 1.6 + (i % 5) * 0.25, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: (i % 9) * 0.2 }));

      const fire = () => {
        const dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('r', '5');
        dot.setAttribute('fill', '#2b62b3');
        sig.appendChild(dot);
        const pick = LAYERS.map((n) => Math.floor(Math.random() * n));
        gsap.set(dot, { attr: { cx: nodes[0][pick[0]].x, cy: nodes[0][pick[0]].y } });
        const tl = gsap.timeline({ onComplete: () => dot.remove() });
        for (let l = 1; l < LAYERS.length; l++) {
          const p = nodes[l][pick[l]];
          const hit = at(l, pick[l]);
          const last = l === LAYERS.length - 1;
          tl.to(dot, { attr: { cx: p.x, cy: p.y }, duration: 0.6, ease: 'power1.inOut' });
          tl.fromTo(hit, { attr: { r: last ? 14 : 10 } }, { attr: { r: last ? 11 : 6 }, duration: 0.25, ease: 'power2.out' }, '<0.45');
        }
        tl.to(dot, { opacity: 0, duration: 0.25 });
      };
      let timer: gsap.core.Tween;
      const loop = () => { fire(); timer = gsap.delayedCall(0.6 + Math.random() * 0.9, loop); };
      timer = gsap.delayedCall(0.8, loop);
      const onFire = () => fire();
      window.addEventListener('neural:fire', onFire);

      const g = glyphs.current;
      if (g) g.querySelectorAll<HTMLElement>('[data-glyph]').forEach((el, i) => {
        gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 1, delay: 0.4 + i * 0.12 });
        gsap.to(el, { y: () => gsap.utils.random(-26, 26), x: () => gsap.utils.random(-14, 14), rotate: () => gsap.utils.random(-8, 8), duration: () => gsap.utils.random(5, 9), ease: 'sine.inOut', repeat: -1, yoyo: true, repeatRefresh: true });
      });

      return () => { timer.kill(); window.removeEventListener('neural:fire', onFire); sig.replaceChildren(); };
    });
    return () => mm.revert();
  }, [nodes]);

  return (
    <div dir="ltr" aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden text-ink">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="size-full">
        <g stroke="currentColor" strokeOpacity="0.09" strokeWidth="1.2">
          {edges.map((e) => <line key={e.k} data-edge x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} />)}
        </g>
        {nodes.map((layer, l) => layer.map((n, i) => (
          <circle key={`${l}-${i}`} data-node cx={n.x} cy={n.y} r={l === LAYERS.length - 1 ? 11 : 6} fill={l === LAYERS.length - 1 ? OUT[i] : 'currentColor'} fillOpacity={l === LAYERS.length - 1 ? 0.55 : 0.22} />
        )))}
        <g data-signals />
      </svg>
      <div ref={glyphs}>
        {GLYPHS.map((g) => (
          <span key={g.t} data-glyph className="absolute font-mono font-bold whitespace-nowrap opacity-0" style={{ left: g.x, top: g.y, fontSize: g.s, color: 'color-mix(in srgb, currentColor 16%, transparent)' }}>{g.t}</span>
        ))}
      </div>
    </div>
  );
}
