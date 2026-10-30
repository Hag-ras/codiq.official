export type Kind = 'pen' | 'hl' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text';
/** One drawn shape in a 1600x900 board space. p = flat x,y points (pen), a = x1,y1,x2,y2 (shapes) or x,y (text). */
export interface El { id: string; k: Kind; c: string; w: number; p?: number[]; a?: number[]; t?: string }
export type View = 'class' | 'board' | 'code';
export type Lang = 'javascript' | 'python' | 'html';
export type Msg =
  | { t: 'sync' }
  | { t: 'view'; v: View }
  | { t: 'allow'; v: boolean }
  | { t: 'add'; k: string; e: El[] }
  | { t: 'del'; k: string; ids: string[] }
  | { t: 'clear'; k: string }
  | { t: 'laser'; x: number; y: number; n: string }
  | { t: 'slides'; m: { id: string; name: string } | null; n: number }
  | { t: 'page'; n: number }
  | { t: 'code'; on: boolean; lang: Lang; code: string }
  | { t: 'ask'; what: 'mic' | 'cam'; n: string };

export const W = 1600;
export const H = 900;
export const COLORS = ['#1c1d21', '#2b62b3', '#b3402a', '#3d7a5a', '#6a4c9c', '#c28a12'];
export const TOPIC = 'class';

export const encode = (m: Msg) => new TextEncoder().encode(JSON.stringify(m));
export const decode = (b: Uint8Array): Msg | null => { try { return JSON.parse(new TextDecoder().decode(b)) as Msg; } catch { return null; } };
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Splits shapes into groups small enough for one data message. */
export function chunk(els: El[], max = 9000): El[][] {
  const out: El[][] = [];
  let cur: El[] = [], size = 0;
  for (const e of els) {
    const n = JSON.stringify(e).length;
    if (cur.length && size + n > max) { out.push(cur); cur = []; size = 0; }
    cur.push(e); size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

const segDist = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
  const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
};

/** Does the eraser (radius r) at x,y touch this shape? */
export function hit(e: El, x: number, y: number, r: number): boolean {
  const pad = r + (e.k === 'hl' ? e.w * 1.5 : e.w / 2);
  if (e.k === 'pen' || e.k === 'hl') {
    const p = e.p ?? [];
    if (p.length < 4) return p.length >= 2 && Math.hypot(x - p[0], y - p[1]) <= pad;
    for (let i = 0; i + 3 < p.length; i += 2) if (segDist(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= pad) return true;
    return false;
  }
  const a = e.a ?? [];
  if (e.k === 'line' || e.k === 'arrow') return segDist(x, y, a[0], a[1], a[2], a[3]) <= pad;
  if (e.k === 'rect') {
    const [x1, y1, x2, y2] = [Math.min(a[0], a[2]), Math.min(a[1], a[3]), Math.max(a[0], a[2]), Math.max(a[1], a[3])];
    return [segDist(x, y, x1, y1, x2, y1), segDist(x, y, x2, y1, x2, y2), segDist(x, y, x2, y2, x1, y2), segDist(x, y, x1, y2, x1, y1)].some((d) => d <= pad);
  }
  if (e.k === 'ellipse') {
    const cx = (a[0] + a[2]) / 2, cy = (a[1] + a[3]) / 2, rx = Math.abs(a[2] - a[0]) / 2 || 1, ry = Math.abs(a[3] - a[1]) / 2 || 1;
    const v = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
    return Math.abs(v - 1) * Math.min(rx, ry) <= pad;
  }
  const len = (e.t?.length ?? 1) * e.w * 0.58;
  return x >= a[0] - r && x <= a[0] + len + r && y >= a[1] - e.w - r && y <= a[1] + e.w * 0.3 + r;
}
