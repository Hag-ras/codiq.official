'use client';
import { useEffect, useRef, useState } from 'react';
import { cx } from '@/components/ui';
import { COLORS, H, W, hit, uid, type El, type Kind } from './types';

type Tool = 'pointer' | Kind | 'eraser';
type Action = { k: 'add'; els: El[] } | { k: 'del'; els: El[] };
export type Laser = { x: number; y: number; n: string; at: number };

const TOOLS: { id: Tool; label: string; d: string }[] = [
  { id: 'pointer', label: 'Pointer', d: 'M4 4l7 17 2.5-7.5L21 11z' },
  { id: 'pen', label: 'Pen', d: 'M3 21l3.5-.9L19 7.6 16.4 5 3.9 17.5zM17.8 3.6l2.6 2.6' },
  { id: 'hl', label: 'Highlighter', d: 'M4 20h8M9 15l-1 3 3-1 9-9-2-2z' },
  { id: 'eraser', label: 'Eraser', d: 'M16 3l5 5-10 11H5l-2-2zM9 10l5 5' },
  { id: 'line', label: 'Line', d: 'M5 19L19 5' },
  { id: 'arrow', label: 'Arrow', d: 'M5 19L19 5M9 5h10v10' },
  { id: 'rect', label: 'Rectangle', d: 'M4 6h16v12H4z' },
  { id: 'ellipse', label: 'Ellipse', d: 'M12 5c5 0 9 3 9 7s-4 7-9 7-9-3-9-7 4-7 9-7z' },
  { id: 'text', label: 'Text', d: 'M5 6V4h14v2M12 4v16M9 20h6' },
];
const WIDTHS = [3, 6, 12];
const FONTS = [30, 46, 68];

const smooth = (p: number[]) => {
  if (p.length < 4) return `M${p[0]} ${p[1]}l0.1 0`;
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length - 2; i += 2) d += `Q${p[i]} ${p[i + 1]} ${(p[i] + p[i + 2]) / 2} ${(p[i + 1] + p[i + 3]) / 2}`;
  return d + `L${p[p.length - 2]} ${p[p.length - 1]}`;
};

function Shape({ e }: { e: El }) {
  const a = e.a ?? [];
  const common = { stroke: e.c, strokeWidth: e.w, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (e.k === 'pen') return <path d={smooth(e.p ?? [])} {...common} />;
  if (e.k === 'hl') return <path d={smooth(e.p ?? [])} {...common} strokeWidth={e.w * 3} strokeOpacity={0.32} strokeLinecap="butt" />;
  if (e.k === 'line') return <line x1={a[0]} y1={a[1]} x2={a[2]} y2={a[3]} {...common} />;
  if (e.k === 'arrow') {
    const ang = Math.atan2(a[3] - a[1], a[2] - a[0]), h = 14 + e.w * 2;
    const head = `M${a[2] - h * Math.cos(ang - 0.45)} ${a[3] - h * Math.sin(ang - 0.45)}L${a[2]} ${a[3]}L${a[2] - h * Math.cos(ang + 0.45)} ${a[3] - h * Math.sin(ang + 0.45)}`;
    return <g {...common}><line x1={a[0]} y1={a[1]} x2={a[2]} y2={a[3]} /><path d={head} /></g>;
  }
  if (e.k === 'rect') return <rect x={Math.min(a[0], a[2])} y={Math.min(a[1], a[3])} width={Math.abs(a[2] - a[0])} height={Math.abs(a[3] - a[1])} rx={4} {...common} />;
  if (e.k === 'ellipse') return <ellipse cx={(a[0] + a[2]) / 2} cy={(a[1] + a[3]) / 2} rx={Math.abs(a[2] - a[0]) / 2} ry={Math.abs(a[3] - a[1]) / 2} {...common} />;
  return <text x={a[0]} y={a[1]} fill={e.c} fontSize={e.w} fontFamily="var(--font-mono), monospace" fontWeight={600}>{e.t}</text>;
}

/** Fits a 16:9 box inside its parent, as large as it can be. */
function Fit({ children, ratio = 16 / 9 }: { children: React.ReactNode; ratio?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      setBox(w / h > ratio ? { w: h * ratio, h } : { w, h: w / ratio });
    });
    ro.observe(el); return () => ro.disconnect();
  }, [ratio]);
  return <div ref={ref} className="grid min-h-0 flex-1 place-items-center"><div style={{ width: box.w, height: box.h, containerType: 'inline-size' }} className="relative overflow-hidden rounded-lg bg-white shadow-lg">{box.w > 0 && children}</div></div>;
}

/**
 * Whiteboard. Everything is drawn in a fixed 1600x900 space so it looks the same on every screen.
 * The owner of the board (the host, or anyone while drawing is allowed) gets the toolbar.
 * `bg` is an optional slide image drawn behind the shapes.
 */
export function Board({ els, bg, bgRatio, canDraw, lasers, boardKey, onUpsert, onRemove, onClear, onLaser }: {
  els: El[]; bg: string | null; bgRatio: number; canDraw: boolean; lasers: Laser[]; boardKey: string;
  onUpsert: (e: El) => void; onRemove: (ids: string[]) => void; onClear: () => void; onLaser: (x: number, y: number) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[1]);
  const [size, setSize] = useState(1);
  const [draft, setDraft] = useState<El | null>(null);
  const [typing, setTyping] = useState<{ x: number; y: number } | null>(null);
  const [, bump] = useState(0);
  const undo = useRef<Action[]>([]);
  const redo = useRef<Action[]>([]);
  const drag = useRef<{ el: El | null; erased: El[]; lastSend: number } | null>(null);
  const current = useRef(els);
  current.current = els;

  useEffect(() => { undo.current = []; redo.current = []; setDraft(null); setTyping(null); bump((n) => n + 1); }, [boardKey]);

  const pt = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: Math.round(((e.clientX - r.left) / r.width) * W), y: Math.round(((e.clientY - r.top) / r.height) * H) };
  };
  const push = (a: Action) => { undo.current.push(a); redo.current = []; bump((n) => n + 1); };

  const erase = (x: number, y: number) => {
    const d = drag.current!;
    const gone = current.current.filter((e) => !d.erased.some((g) => g.id === e.id) && hit(e, x, y, 16));
    if (gone.length) { d.erased.push(...gone); onRemove(gone.map((g) => g.id)); }
  };

  const down = (e: React.PointerEvent) => {
    if (!canDraw || typing) return;
    const { x, y } = pt(e);
    svg.current!.setPointerCapture(e.pointerId);
    drag.current = { el: null, erased: [], lastSend: 0 };
    if (tool === 'pointer') { onLaser(x, y); return; }
    if (tool === 'eraser') { erase(x, y); return; }
    if (tool === 'text') { setTyping({ x, y }); drag.current = null; return; }
    const w = WIDTHS[size];
    const el: El = tool === 'pen' || tool === 'hl'
      ? { id: uid(), k: tool, c: color, w, p: [x, y] }
      : { id: uid(), k: tool, c: color, w, a: [x, y, x, y] };
    drag.current.el = el; setDraft(el);
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!canDraw) return;
    const { x, y } = pt(e);
    if (tool === 'pointer') { const now = Date.now(); if (now - lastMove.current > 40) { lastMove.current = now; onLaser(x, y); } return; }
    if (!d) return;
    if (tool === 'eraser') { erase(x, y); return; }
    if (!d.el) return;
    let el = d.el;
    if (el.k === 'pen' || el.k === 'hl') {
      const p = el.p!;
      if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) < 3) return;
      el = { ...el, p: [...p, x, y] };
    } else {
      let [x2, y2] = [x, y];
      if (e.shiftKey && (el.k === 'line' || el.k === 'arrow')) { // snap to 45 degree steps
        const a = el.a!, ang = Math.round(Math.atan2(y - a[1], x - a[0]) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(x - a[0], y - a[1]);
        x2 = Math.round(a[0] + len * Math.cos(ang)); y2 = Math.round(a[1] + len * Math.sin(ang));
      }
      el = { ...el, a: [el.a![0], el.a![1], x2, y2] };
    }
    d.el = el; setDraft(el);
    const now = Date.now();
    if (now - d.lastSend > 90 && JSON.stringify(el).length < 12000) { d.lastSend = now; onUpsert(el); }
  };

  const lastMove = useRef(0);
  const up = () => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    if (tool === 'eraser' && d.erased.length) push({ k: 'del', els: d.erased });
    if (d.el) {
      let el = d.el;
      while (JSON.stringify(el).length > 12000 && el.p && el.p.length > 8) el = { ...el, p: el.p.filter((_, i) => i < 2 || i >= el.p!.length - 2 || Math.floor(i / 2) % 2 === 0) };
      const tiny = (el.k === 'pen' || el.k === 'hl') ? false : Math.hypot(el.a![2] - el.a![0], el.a![3] - el.a![1]) < 4;
      if (!tiny) { onUpsert(el); push({ k: 'add', els: [el] }); }
    }
    setDraft(null);
  };

  const commitText = (value: string) => {
    const t = value.trim();
    if (t && typing) { const el: El = { id: uid(), k: 'text', c: color, w: FONTS[size], a: [typing.x, typing.y + FONTS[size]], t }; onUpsert(el); push({ k: 'add', els: [el] }); }
    setTyping(null);
  };

  const apply = (a: Action, inverse: boolean) => {
    const add = (a.k === 'add') !== inverse;
    if (add) a.els.forEach(onUpsert); else onRemove(a.els.map((e) => e.id));
  };
  const doUndo = () => { const a = undo.current.pop(); if (!a) return; apply(a, true); redo.current.push(a); bump((n) => n + 1); };
  const doRedo = () => { const a = redo.current.pop(); if (!a) return; apply(a, false); undo.current.push(a); bump((n) => n + 1); };
  const clearAll = () => {
    if (!els.length || !confirm('Clear everything on this board for everyone?')) return;
    const gone = [...els]; onClear(); push({ k: 'del', els: gone });
  };

  const btn = 'grid size-10 place-items-center rounded-lg transition-colors';
  const cursor = tool === 'pointer' ? 'cursor-crosshair' : tool === 'eraser' ? 'cursor-cell' : tool === 'text' ? 'cursor-text' : 'cursor-crosshair';

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      {canDraw && (
        <div className="flex w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto rounded-xl bg-white/10 p-2" role="toolbar" aria-label="Whiteboard tools">
          {TOOLS.map((t) => (
            <button key={t.id} title={t.label} aria-label={t.label} aria-pressed={tool === t.id} onClick={() => setTool(t.id)}
              className={cx(btn, tool === t.id ? 'bg-clay text-white' : 'text-white/80 hover:bg-white/15')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={t.d} /></svg>
            </button>
          ))}
          <hr className="my-1 w-8 border-white/15" />
          {COLORS.map((c) => (
            <button key={c} aria-label={`Color ${c}`} onClick={() => setColor(c)} className="grid size-8 place-items-center rounded-full">
              <span className={cx('size-5 rounded-full border-2', color === c ? 'border-white' : 'border-white/20')} style={{ background: c }} />
            </button>
          ))}
          <hr className="my-1 w-8 border-white/15" />
          {WIDTHS.map((w, i) => (
            <button key={w} aria-label={`Size ${i + 1}`} onClick={() => setSize(i)} className={cx(btn, 'size-9', size === i ? 'bg-white/20' : 'hover:bg-white/10')}>
              <span className="rounded-full bg-white" style={{ width: 6 + i * 5, height: 6 + i * 5 }} />
            </button>
          ))}
          <hr className="my-1 w-8 border-white/15" />
          <button title="Undo" aria-label="Undo" disabled={!undo.current.length} onClick={doUndo} className={cx(btn, 'text-white/80 hover:bg-white/15 disabled:opacity-30')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" /></svg>
          </button>
          <button title="Redo" aria-label="Redo" disabled={!redo.current.length} onClick={doRedo} className={cx(btn, 'text-white/80 hover:bg-white/15 disabled:opacity-30')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3" /></svg>
          </button>
          <button title="Clear board" aria-label="Clear board" onClick={clearAll} className={cx(btn, 'text-white/80 hover:bg-white/15')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
          </button>
        </div>
      )}
      <Fit>
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className={cx('size-full touch-none select-none', canDraw && cursor)}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <rect width={W} height={H} fill="#fff" />
          {bg && <image href={bg} x={bgRatio >= W / H ? 0 : (W - H * bgRatio) / 2} y={bgRatio >= W / H ? (H - W / bgRatio) / 2 : 0} width={bgRatio >= W / H ? W : H * bgRatio} height={bgRatio >= W / H ? W / bgRatio : H} />}
          {els.map((e) => <Shape key={e.id} e={e} />)}
          {draft && <Shape e={draft} />}
          {lasers.map((l) => (
            <g key={l.n} transform={`translate(${l.x} ${l.y})`}>
              <circle r={22} fill="#b3402a" opacity={0.2} /><circle r={9} fill="#b3402a" />
              <text y={-18} textAnchor="middle" fontSize={24} fontWeight={700} fill="#b3402a">{l.n}</text>
            </g>
          ))}
        </svg>
        {typing && (
          <input autoFocus aria-label="Text" className="absolute rounded border border-clay bg-white/90 px-1 font-mono font-semibold outline-none"
            style={{ left: `${(typing.x / W) * 100}%`, top: `${(typing.y / H) * 100}%`, color, fontSize: `${(FONTS[size] / W) * 100}cqw`, minWidth: 120 }}
            onKeyDown={(e) => { if (e.key === 'Enter') commitText(e.currentTarget.value); if (e.key === 'Escape') setTyping(null); }}
            onBlur={(e) => commitText(e.currentTarget.value)} />
        )}
      </Fit>
    </div>
  );
}
