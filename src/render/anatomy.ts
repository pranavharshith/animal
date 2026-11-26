// Body-plan geometry. Every body type defines anchors so parts attach where they should:
// wings on the back, legs under the belly, head on the neck, tail at the rear.
import { hashSeed, mulberry32, range, type Rng } from '../engine/rng';
import type { Genome } from '../engine/types';

export const GROUND = 172;

export interface Pt {
  x: number;
  y: number;
}

export type Shape =
  | { kind: 'path'; d: string }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number };

export interface Hip extends Pt {
  far: boolean;
  /** horizontal direction legs splay toward (+1 front, -1 back) */
  splay: number;
}

export interface Anatomy {
  /** Main torso ellipse (used for belly, top line, patterns) */
  torso: { cx: number; cy: number; rx: number; ry: number };
  /** Shapes forming the body silhouette (also used as pattern clip). */
  shapes: Shape[];
  head: { x: number; y: number; r: number; integrated: boolean };
  neck: string | null;
  back: Pt;
  /** Points along the dorsal line, back -> front, with outward normal angle (radians). */
  topLine: Array<Pt & { a: number }>;
  hips: Hip[];
  legLen: number;
  tail: Pt & { a: number };
  floats: boolean;
  /** Horizontal shift + scale to keep the organism centred and inside the frame. */
  dx: number;
  fit: number;
}

/** Closed Catmull-Rom spline through points -> smooth organic path. */
export function smoothClosed(pts: Pt[]): string {
  const n = pts.length;
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d + 'Z';
}

/** Organic ellipse: slightly irregular radii, optional rotation and front/back bias. */
export function blob(rng: Rng, cx: number, cy: number, rx: number, ry: number, opts: { wobble?: number; rot?: number; frontBulge?: number; backTaper?: number; bottomFlat?: number } = {}): string {
  const n = 10;
  const wob = opts.wobble ?? 0.06;
  const rot = opts.rot ?? 0;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let r = 1 + range(rng, -wob, wob);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    if (opts.frontBulge) r *= 1 + opts.frontBulge * Math.max(0, cos);
    // Narrower rump/waist toward the rear gives the silhouette some attitude.
    if (opts.backTaper) r *= 1 - opts.backTaper * Math.max(0, -cos) * (0.6 + 0.4 * Math.abs(sin));
    let y = sin * ry * r;
    if (opts.bottomFlat && sin > 0) y *= 1 - opts.bottomFlat;
    const x = cos * rx * r;
    pts.push({ x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) });
  }
  return smoothClosed(pts);
}

function legLength(g: Genome): number {
  switch (g.limbs) {
    case 'stout':
      return g.body === 'quadruped' ? 28 : 18;
    case 'spindly':
      return g.body === 'quadruped' ? 36 : g.body === 'arthropod' ? 22 : 28;
    case 'tentacles':
      return g.body === 'jelly' ? 40 : 22;
    default:
      return 0;
  }
}

function ellipseTop(cx: number, cy: number, rx: number, ry: number, from = -165, to = -25, n = 7) {
  const out: Array<Pt & { a: number }> = [];
  for (let i = 0; i < n; i++) {
    const deg = from + ((to - from) * i) / (n - 1);
    const a = (deg * Math.PI) / 180;
    out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, a: Math.atan2(Math.sin(a) * rx, Math.cos(a) * ry) });
  }
  return out;
}

function pairsX(cx: number, rx: number, pairs: number, spread: number): number[] {
  if (pairs <= 1) return [cx + rx * 0.12];
  const xs: number[] = [];
  for (let i = 0; i < pairs; i++) xs.push(cx + rx * spread * (1 - (2 * i) / (pairs - 1)));
  return xs;
}

export function buildAnatomy(g: Genome): Anatomy {
  const rng = mulberry32(hashSeed(g.seed, 'anatomy'));
  const legLen = legLength(g);
  const hs = g.headScale;
  const pairs = Math.max(1, g.limbPairs);
  let a: Omit<Anatomy, 'dx' | 'fit'>;

  switch (g.body) {
    case 'orb': {
      const rx = 38 * g.girth;
      const ry = 36 * g.height;
      const cy = GROUND - ry * 0.92 - legLen * 0.8;
      const cx = 100;
      a = {
        torso: { cx, cy, rx, ry },
        shapes: [{ kind: 'path', d: blob(rng, cx, cy, rx, ry, { wobble: 0.05, frontBulge: 0.04, backTaper: 0.05, bottomFlat: legLen ? 0 : 0.1 }) }],
        head: { x: cx + rx * 0.42, y: cy - ry * 0.18, r: ry * 0.62 * hs, integrated: true },
        neck: null,
        back: { x: cx - rx * 0.2, y: cy - ry * 0.72 },
        topLine: ellipseTop(cx, cy, rx, ry, -170, -40),
        hips: pairsX(cx, rx, pairs, 0.4).flatMap((x) => [
          { x: x - 9, y: cy + ry * 0.78, far: true, splay: 0 },
          { x: x + 4, y: cy + ry * 0.82, far: false, splay: 0 },
        ]),
        legLen,
        tail: { x: cx - rx * 0.92, y: cy + ry * 0.25, a: Math.PI * 1.08 },
        floats: false,
      };
      break;
    }
    case 'quadruped': {
      const rx = 44 * g.girth;
      const ry = 25 * g.height;
      const cy = GROUND - legLen - ry * 0.7;
      const cx = 92;
      const hx = cx + rx * 0.98;
      const hy = cy - ry * 1.15;
      a = {
        torso: { cx, cy, rx, ry },
        shapes: [{ kind: 'path', d: blob(rng, cx, cy, rx, ry, { wobble: 0.05, frontBulge: 0.15, backTaper: 0.12 }) }],
        head: { x: hx, y: hy, r: 18 * hs, integrated: false },
        neck: `M${cx + rx * 0.45},${cy - ry * 0.5} Q${cx + rx * 0.85},${cy - ry * 0.95} ${hx - 6},${hy + 4} L${hx + 2},${hy + 14} Q${cx + rx * 0.95},${cy + ry * 0.1} ${cx + rx * 0.7},${cy + ry * 0.45}Z`,
        back: { x: cx - rx * 0.05, y: cy - ry * 0.85 },
        topLine: ellipseTop(cx, cy, rx, ry, -165, -55),
        hips: pairsX(cx, rx, Math.max(2, pairs), 0.58).flatMap((x) => [
          { x: x + 7, y: cy + ry * 0.5, far: true, splay: 0 },
          { x: x - 3, y: cy + ry * 0.58, far: false, splay: 0 },
        ]),
        legLen,
        tail: { x: cx - rx * 0.94, y: cy - ry * 0.25, a: Math.PI * 1.12 },
        floats: false,
      };
      break;
    }
    case 'avian': {
      const rx = 28 * g.girth;
      const ry = 34 * g.height;
      const cy = GROUND - legLen - ry * 0.82;
      const cx = 96;
      const rot = -0.22;
      const hx = cx + rx * 0.62;
      const hy = cy - ry * 1.02;
      a = {
        torso: { cx, cy, rx, ry },
        shapes: [{ kind: 'path', d: blob(rng, cx, cy, rx, ry, { wobble: 0.05, rot, frontBulge: 0.07, backTaper: 0.06 }) }],
        head: { x: hx, y: hy, r: 17 * hs, integrated: false },
        neck: `M${cx + rx * 0.05},${cy - ry * 0.6} Q${hx - 8},${hy + 8} ${hx - 4},${hy} L${hx + 8},${hy + 6} Q${cx + rx * 0.85},${cy - ry * 0.4} ${cx + rx * 0.7},${cy - ry * 0.1}Z`,
        back: { x: cx - rx * 0.15, y: cy - ry * 0.45 },
        topLine: ellipseTop(cx, cy, rx * 1.02, ry, -175, -110, 5),
        hips: [
          { x: cx - 4, y: cy + ry * 0.78, far: true, splay: 0 },
          { x: cx + 6, y: cy + ry * 0.8, far: false, splay: 0 },
        ],
        legLen,
        tail: { x: cx - rx * 0.8, y: cy + ry * 0.55, a: Math.PI * 0.85 },
        floats: false,
      };
      break;
    }
    case 'arthropod': {
      const cy = GROUND - Math.max(legLen, 10) - 14 * g.height;
      const cx = 98;
      const abRx = 30 * g.girth;
      const abRy = 19 * g.height;
      const thRx = 19 * g.girth;
      const thRy = 15 * g.height;
      const abCx = cx - 26 * g.girth;
      a = {
        torso: { cx: abCx + 8, cy: cy - 1, rx: abRx + 12, ry: abRy },
        shapes: [
          { kind: 'path', d: blob(rng, abCx, cy, abRx, abRy, { wobble: 0.07, rot: 0.08, backTaper: 0.16 }) },
          { kind: 'path', d: blob(rng, cx + 6, cy - 3, thRx, thRy, { wobble: 0.05 }) },
        ],
        head: { x: cx + 6 + thRx + 9 * hs, y: cy - 8, r: 14 * hs, integrated: false },
        neck: null,
        back: { x: cx - 4, y: cy - thRy },
        topLine: ellipseTop(abCx + 8, cy - 1, abRx + 12, abRy, -170, -35),
        hips: pairsX(cx - 6, 16, Math.max(2, pairs), 1).flatMap((x, i, arr) => [
          { x: x + 5, y: cy + 6, far: true, splay: i === 0 ? 1 : i === arr.length - 1 ? -1 : 0 },
          { x: x - 2, y: cy + 9, far: false, splay: i === 0 ? 1 : i === arr.length - 1 ? -1 : 0 },
        ]),
        legLen: Math.max(legLen, 18),
        tail: { x: abCx - abRx * 0.9, y: cy + 2, a: Math.PI * 1.05 },
        floats: false,
      };
      break;
    }
    case 'jelly': {
      const rx = 38 * g.girth;
      const ry = 32 * g.height;
      const tl = Math.max(legLen, 30);
      const cy = GROUND - tl - ry * 0.45 - 8;
      const cx = 100;
      const bottom = cy + ry * 0.38;
      const tentacleCount = Math.min(7, pairs * 2 + 1);
      const hips: Hip[] = [];
      for (let i = 0; i < tentacleCount; i++) {
        const x = cx - rx * 0.75 + (rx * 1.5 * i) / Math.max(1, tentacleCount - 1);
        hips.push({ x, y: bottom + 2, far: i % 2 === 1, splay: 0 });
      }
      a = {
        torso: { cx, cy: cy - ry * 0.3, rx, ry: ry * 0.9 },
        shapes: [{ kind: 'path', d: bellPath(cx, cy, rx, ry, bottom) }],
        head: { x: cx + rx * 0.22, y: cy - ry * 0.1, r: ry * 0.55 * hs, integrated: true },
        neck: null,
        back: { x: cx - rx * 0.1, y: cy - ry * 1.1 },
        topLine: ellipseTop(cx, cy - ry * 0.15, rx * 0.98, ry * 1.05, -165, -15),
        hips,
        legLen: tl,
        tail: { x: cx - rx * 0.95, y: bottom - 4, a: Math.PI * 1.1 },
        floats: true,
      };
      break;
    }
    case 'serpent':
    default: {
      const segs = 11;
      const shapes: Shape[] = [];
      const top: Array<Pt & { a: number }> = [];
      const centers: Array<Pt & { r: number }> = [];
      const amp = 10 + rng() * 6;
      for (let i = 0; i < segs; i++) {
        const t = i / (segs - 1);
        const x = 34 + 100 * t;
        const lift = Math.pow(t, 2.6) * 52 * g.height;
        const y = GROUND - 14 - Math.sin(t * Math.PI * 1.7 + 0.4) * amp * (1 - t * 0.6) - lift;
        const r = (6 + 12 * Math.sin(Math.PI * Math.min(1, 0.2 + t * 0.95))) * g.girth;
        centers.push({ x, y, r });
        shapes.push({ kind: 'ellipse', cx: x, cy: y, rx: r * 1.15, ry: r });
        top.push({ x, y: y - r, a: -Math.PI / 2 });
      }
      const last = centers[segs - 1];
      const mid = centers[Math.floor(segs * 0.55)];
      a = {
        torso: { cx: mid.x, cy: mid.y, rx: 50 * g.girth, ry: mid.r },
        shapes,
        head: { x: last.x + 10, y: last.y - 10, r: 17 * hs, integrated: false },
        neck: null,
        back: { x: mid.x, y: mid.y - mid.r * 0.8 },
        topLine: top.slice(2, segs - 2),
        hips: [centers[3], centers[7]].flatMap((c) => [
          { x: c.x + 4, y: c.y + c.r * 0.7, far: true, splay: 0 },
          { x: c.x - 2, y: c.y + c.r * 0.85, far: false, splay: 0 },
        ]),
        legLen: g.limbs === 'stout' || g.limbs === 'spindly' ? 10 : legLen,
        tail: { x: centers[0].x, y: centers[0].y, a: Math.PI * 1.05 },
        floats: false,
      };
      break;
    }
  }

  const xmin = Math.min(a.tail.x - (g.tail === 'none' ? 6 : 34), a.torso.cx - a.torso.rx);
  const xmax = a.head.x + a.head.r + (g.head === 'beak' || g.head === 'snout' ? 14 : 6);
  const width = xmax - xmin;
  const fit = Math.min(1, 170 / (width * g.size));
  return { ...a, dx: 100 - (xmin + xmax) / 2, fit };
}

// Builds a clean bell path: dome curves + alternating scallop curve along the bottom edge.
function bellPath(cx: number, cy: number, rx: number, ry: number, bottom: number): string {
  let d = `M${(cx - rx).toFixed(1)},${bottom.toFixed(1)}`;
  d += ` C${(cx - rx * 1.06).toFixed(1)},${(cy - ry * 0.9).toFixed(1)} ${(cx - rx * 0.55).toFixed(1)},${(cy - ry * 1.25).toFixed(1)} ${cx.toFixed(1)},${(cy - ry * 1.22).toFixed(1)}`;
  d += ` C${(cx + rx * 0.6).toFixed(1)},${(cy - ry * 1.25).toFixed(1)} ${(cx + rx * 1.06).toFixed(1)},${(cy - ry * 0.9).toFixed(1)} ${(cx + rx).toFixed(1)},${bottom.toFixed(1)}`;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x0 = cx + rx - (2 * rx * i) / n;
    const x1 = cx + rx - (2 * rx * (i + 1)) / n;
    d += ` Q${((x0 + x1) / 2).toFixed(1)},${(bottom + 9).toFixed(1)} ${x1.toFixed(1)},${bottom.toFixed(1)}`;
  }
  return d + 'Z';
}
