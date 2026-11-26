// Procedural creature renderer. Pure SVG, deterministic from the genome.
import { memo, useId, useMemo, type CSSProperties, type ReactNode, type SVGAttributes } from 'react';
import { displayColors, painterly } from '../engine/color';
import { ELEMENT_INFO, hsl } from '../engine/data';
import { hashSeed, lerpHue, mulberry32, range, type Rng } from '../engine/rng';
import type { Genome, Personality, Stage } from '../engine/types';
import { buildAnatomy, GROUND, type Anatomy, type Hip, type Shape } from './anatomy';
import './creature.css';

export interface CreatureSVGProps {
  genome: Genome;
  stage?: Stage;
  /** CSS width/height of the square artwork */
  size?: number | string;
  animated?: boolean;
  /** Skip filters + particles (for dense grids) */
  lite?: boolean;
  silhouette?: boolean;
  personality?: Personality;
  /** 'tight' crops empty space around the organism (cards, grids). */
  framing?: 'full' | 'tight';
  shadow?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

interface Palette {
  body: string;
  bodyLight: string;
  bodyDark: string;
  far: string;
  outline: string;
  sec: string;
  secLight: string;
  secDark: string;
  acc: string;
  accLight: string;
  eyeWhite: string;
  iris: string;
  pupil: string;
  bone: string;
  el: string;
  el2: string;
  /** Soft crease line used where outlines were removed. */
  crease: string;
  /** Rim light colour (ambient lab light catching the top edge). */
  rim: string;
}

interface Ctx {
  g: Genome;
  a: Anatomy;
  c: Palette;
  id: (name: string) => string;
  url: (name: string) => string;
  rng: Rng;
  lite: boolean;
  sil: boolean;
  animated: boolean;
  /** Dominant personality: drives eye style + idle. */
  mood: Personality;
  /** True when the body is drawn with one joined silhouette outline. */
  joined: boolean;
  /** Wings tuck behind the body (round / bell bodies). */
  tuck: boolean;
}

const f1 = (n: number) => n.toFixed(1);

function makePalette(g: Genome, sil: boolean): Palette {
  const el = ELEMENT_INFO[g.element];
  if (sil) {
    const d = '#070a14';
    return { body: d, bodyLight: d, bodyDark: d, far: '#05070e', outline: '#2d364b', sec: d, secLight: d, secDark: d, acc: '#262a37', accLight: '#262a37', eyeWhite: d, iris: d, pupil: d, bone: d, el: '#424c66', el2: '#424c66', crease: 'transparent', rim: '#424c66' };
  }
  // Gentle draw-time harmony, then painterly softening. Anomalies are exempt from both.
  const tidy = displayColors(g);
  const { primary: p, secondary: s, accent: ac } = g.anomaly ? tidy : painterly(tidy);
  // Tinted outline: the body hue nudged toward indigo, very dark but never pure black.
  const outlineHue = lerpHue(p.h, 250, 0.38);
  const outline = hsl({ h: outlineHue, s: Math.min(55, p.s * 0.8 + 10), l: 15 + Math.max(0, p.l - 45) * 0.15 });
  return {
    body: hsl(p),
    bodyLight: hsl(p, 14, 4),
    bodyDark: hsl({ h: lerpHue(p.h, 250, 0.15), s: p.s, l: p.l }, -17, -4),
    far: hsl({ h: lerpHue(p.h, 250, 0.2), s: p.s, l: p.l }, -15, -12),
    outline,
    sec: hsl(s),
    secLight: hsl(s, 12),
    secDark: hsl(s, -15),
    acc: hsl(ac),
    accLight: hsl(ac, 12),
    eyeWhite: hsl({ h: lerpHue(ac.h, 45, 0.5), s: 22, l: 95 }),
    iris: hsl({ h: ac.h, s: g.anomaly ? Math.max(78, ac.s) : Math.min(64, Math.max(48, ac.s)), l: Math.min(62, ac.l) }),
    pupil: hsl({ h: outlineHue, s: 45, l: 6 }),
    bone: hsl({ h: (p.h + 30) % 360, s: 22, l: 86 }),
    el: el.color,
    el2: el.color2,
    crease: hsl({ h: outlineHue, s: 45, l: 18 }, 0, 0, 0.38),
    rim: hsl({ h: lerpHue(ac.h, 42, 0.4), s: 42, l: 88 }),
  };
}

function ShapeEl({ s, ...rest }: { s: Shape } & SVGAttributes<SVGElement>) {
  if (s.kind === 'ellipse') return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...rest} />;
  return <path d={s.d} {...rest} />;
}

// ---------- Limbs ----------
function Limb({ x: ctx, hip, i, scale = 1 }: { x: Ctx; hip: Hip; i: number; scale?: number }) {
  const { g, a, c } = ctx;
  const fill = hip.far ? c.far : c.body;
  const L = a.legLen * scale;
  const footY = a.floats ? hip.y + L : GROUND - 2;
  // Follow-through: limbs lag a little behind the 3.4s breathing cycle.
  const delay = `${(-(3.4 - 0.35 - (i % 4) * 0.12)).toFixed(2)}s`;
  const front = hip.x >= a.torso.cx;
  switch (g.limbs) {
    case 'stout': {
      const w = 11 * g.girth * scale;
      const y0 = hip.y - 7;
      const fx = hip.x + hip.splay * 4 + (front ? 2 : -1);
      const bend = front ? 2.5 : -3.5; // rear legs kink back at the hock
      const wT = w * 1.35;
      const wB = w * 0.7;
      const mid = y0 + (footY - 4 - y0) * 0.55;
      const d = `M${f1(hip.x - wT / 2)},${f1(y0)} Q${f1(hip.x + bend - wT * 0.42)},${f1(mid)} ${f1(fx - wB / 2)},${f1(footY - 4)} L${f1(fx + wB / 2)},${f1(footY - 4)} Q${f1(hip.x + bend + wT * 0.4)},${f1(mid)} ${f1(hip.x + wT / 2)},${f1(y0)}Z`;
      return (
        <g>
          <path d={d} fill={fill} stroke={c.outline} strokeWidth={1.9} strokeLinejoin="round" />
          {!hip.far && !ctx.sil && <path d={`M${f1(hip.x + wT * 0.28)},${f1(y0 + 8)} Q${f1(hip.x + bend + wT * 0.26)},${f1(mid)} ${f1(fx + wB * 0.3)},${f1(footY - 7)}`} stroke={c.bodyLight} strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.55} />}
          <ellipse cx={fx + 2.5} cy={footY - 2.6} rx={wB * 1.0} ry={wB * 0.5} fill={fill} stroke={c.outline} strokeWidth={1.7} />
          {!hip.far && !ctx.sil && [0, 1, 2].map((k) => <circle key={k} cx={fx + 2.5 + (k - 0.6) * wB * 0.55} cy={footY - 1.2} r={1.2} fill={c.accLight} />)}
        </g>
      );
    }
    case 'spindly': {
      const arth = g.body === 'arthropod';
      const kx = hip.x + (arth ? hip.splay * 12 + 8 : front ? 7 : -6);
      const ky = arth ? hip.y - 9 : hip.y + (footY - hip.y) * 0.45;
      const fx = hip.x + (arth ? hip.splay * 20 + 6 : front ? -1 : 2);
      const seg = (x1: number, y1: number, x2: number, y2: number, wv: number, col: string) => <line x1={f1(x1)} y1={f1(y1)} x2={f1(x2)} y2={f1(y2)} stroke={col} strokeWidth={wv * scale} strokeLinecap="round" />;
      return (
        <g>
          {seg(hip.x, hip.y - 3, kx, ky, 7.4, c.outline)}
          {seg(kx, ky, fx, footY, 5, c.outline)}
          {seg(hip.x, hip.y - 3, kx, ky, 5.2, fill)}
          {seg(kx, ky, fx, footY, 2.9, fill)}
          <circle cx={kx} cy={ky} r={2.5 * scale} fill={hip.far ? c.far : c.secDark} stroke={c.outline} strokeWidth={1} />
          {!arth && <path d={`M${f1(fx - 5)},${f1(footY + 1)} L${f1(fx)},${f1(footY - 1)} L${f1(fx + 6)},${f1(footY + 1)}`} stroke={c.outline} strokeWidth={2.2} fill="none" strokeLinecap="round" />}
        </g>
      );
    }
    case 'tentacles': {
      const sway = i % 2 ? 1 : -1;
      const d = `M${f1(hip.x)},${f1(hip.y - 3)} C${f1(hip.x + 9 * sway)},${f1(hip.y + L * 0.35)} ${f1(hip.x - 9 * sway)},${f1(hip.y + L * 0.7)} ${f1(hip.x + 4 * sway)},${f1(hip.y + L)} q${f1(4 * sway)},3 ${f1(6 * sway)},-2`;
      const col = hip.far ? c.far : c.sec;
      // Taper: a thicker stroke over the first half of the same path.
      return (
        <g className={ctx.animated ? 'cr-tentacle' : undefined} style={{ transformOrigin: `${f1(hip.x)}px ${f1(hip.y)}px`, animationDelay: delay }}>
          <path d={d} fill="none" stroke={c.outline} strokeWidth={6.2 * scale} strokeLinecap="round" />
          <path d={d} fill="none" stroke={c.outline} strokeWidth={8.4 * scale} strokeLinecap="round" pathLength={100} strokeDasharray="52 100" />
          <path d={d} fill="none" stroke={col} strokeWidth={3.8 * scale} strokeLinecap="round" />
          <path d={d} fill="none" stroke={col} strokeWidth={6 * scale} strokeLinecap="round" pathLength={100} strokeDasharray="50 100" />
          {!ctx.sil && !hip.far && <path d={d} fill="none" stroke={c.accLight} strokeWidth={1.2} strokeDasharray="1 5" strokeLinecap="round" opacity={0.9} />}
        </g>
      );
    }
    case 'fins': {
      const len = 20 * scale;
      return (
        <g className={ctx.animated ? 'cr-fin' : undefined} style={{ transformOrigin: `${f1(hip.x)}px ${f1(hip.y)}px`, animationDelay: delay }}>
          <path
            d={`M${f1(hip.x)},${f1(hip.y)} Q${f1(hip.x - len * 0.2)},${f1(hip.y + len * 0.9)} ${f1(hip.x - len)},${f1(hip.y + len * 0.7)} Q${f1(hip.x - len * 0.55)},${f1(hip.y + len * 0.2)} ${f1(hip.x)},${f1(hip.y)}Z`}
            fill={hip.far ? c.far : c.sec}
            stroke={c.outline}
            strokeWidth={1.6}
            opacity={0.95}
          />
          {!ctx.sil && <path d={`M${f1(hip.x - 2)},${f1(hip.y + 3)} L${f1(hip.x - len * 0.7)},${f1(hip.y + len * 0.62)} M${f1(hip.x - 1)},${f1(hip.y + 4)} L${f1(hip.x - len * 0.4)},${f1(hip.y + len * 0.75)}`} stroke={c.secLight} strokeWidth={1} opacity={0.7} />}
        </g>
      );
    }
    default:
      return null;
  }
}

// ---------- Back appendages ----------
function wingPath(L: number) {
  return `M0,0 Q${f1(-L * 0.08)},${f1(-L * 0.75)} ${f1(-L * 0.35)},${f1(-L * 0.98)} L${f1(-L * 1.08)},${f1(-L * 0.62)} Q${f1(-L * 0.86)},${f1(-L * 0.5)} ${f1(-L * 0.8)},${f1(-L * 0.28)} Q${f1(-L * 0.62)},${f1(-L * 0.34)} ${f1(-L * 0.5)},${f1(-L * 0.1)} Q${f1(-L * 0.3)},${f1(-L * 0.18)} ${f1(-L * 0.12)},${f1(L * 0.04)}Z`;
}

function Wing({ x: ctx, far }: { x: Ctx; far: boolean }) {
  const { g, a, c } = ctx;
  const great = g.mutations.includes('great_wings');
  const L = (g.body === 'avian' ? 52 : 42) * (great ? 1.45 : 1);
  const root = a.back;
  const cls = ctx.animated ? (g.back === 'insect_wings' ? 'cr-flutter' : 'cr-flap') : undefined;
  const style: CSSProperties = { transformOrigin: `${f1(root.x)}px ${f1(root.y)}px`, animationDelay: far ? '0.08s' : '0s' };
  // Round and bell bodies tuck both wings behind their curvature instead of floating them off the back.
  const tuckY = ctx.tuck ? 6 : 0;
  const tx = `translate(${f1(root.x + (far ? 7 : 0))} ${f1(root.y + tuckY - (far ? 3 : 0))}) rotate(${(far ? 12 : 0) + (ctx.tuck ? -8 : 0)})${ctx.tuck ? ' scale(0.9)' : ''}`;
  if (g.back === 'insect_wings') {
    const op = ctx.sil ? 1 : far ? 0.35 : 0.55;
    return (
      <g className={cls} style={style}>
        <g transform={tx}>
          <ellipse cx={-L * 0.48} cy={-L * 0.42} rx={L * 0.58} ry={L * 0.19} transform={`rotate(-38 ${f1(-L * 0.48)} ${f1(-L * 0.42)})`} fill={far ? c.secDark : c.accLight} fillOpacity={op} stroke={ctx.sil ? c.outline : c.acc} strokeWidth={1.2} />
          <ellipse cx={-L * 0.42} cy={-L * 0.1} rx={L * 0.42} ry={L * 0.14} transform={`rotate(-12 ${f1(-L * 0.42)} ${f1(-L * 0.1)})`} fill={far ? c.secDark : c.accLight} fillOpacity={op} stroke={ctx.sil ? c.outline : c.acc} strokeWidth={1.2} />
          {!ctx.sil && !far && (
            <path d={`M0,0 L${f1(-L * 0.95)},${f1(-L * 0.8)} M${f1(-L * 0.3)},${f1(-L * 0.25)} L${f1(-L * 0.55)},${f1(-L * 0.62)} M0,0 L${f1(-L * 0.8)},${f1(-L * 0.2)}`} stroke={c.acc} strokeWidth={0.8} opacity={0.8} />
          )}
        </g>
      </g>
    );
  }
  return (
    <g className={cls} style={style}>
      <g transform={tx}>
        <path d={wingPath(L)} fill={far ? c.secDark : ctx.url('wing')} stroke={c.outline} strokeWidth={1.8} strokeLinejoin="round" />
        {!ctx.sil && (
          <path
            d={`M0,0 L${f1(-L * 0.35)},${f1(-L * 0.98)} M${f1(-L * 0.35)},${f1(-L * 0.98)} L${f1(-L * 0.8)},${f1(-L * 0.28)} M${f1(-L * 0.35)},${f1(-L * 0.98)} L${f1(-L * 0.5)},${f1(-L * 0.1)}`}
            stroke={far ? c.far : c.bodyDark}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
            opacity={0.85}
          />
        )}
      </g>
    </g>
  );
}

function BehindBack({ x: ctx }: { x: Ctx }) {
  const { g, a, c } = ctx;
  const tl = a.topLine;
  if (g.back === 'dorsal_fin') {
    // Swept-back fin: convex leading edge from the front, concave trailing edge to the rear.
    const rear = tl[1];
    const frontP = tl[tl.length - 2];
    const m = tl[Math.floor(tl.length / 2)];
    const h = (g.body === 'jelly' ? 17 : 22) * g.height;
    const peak = { x: rear.x + (frontP.x - rear.x) * 0.12 - h * 0.35, y: m.y - h };
    const d = `M${f1(frontP.x)},${f1(frontP.y + 5)} C${f1(frontP.x - (frontP.x - peak.x) * 0.25)},${f1(frontP.y - h * 0.55)} ${f1(peak.x + (frontP.x - peak.x) * 0.45)},${f1(peak.y - 3)} ${f1(peak.x)},${f1(peak.y)} Q${f1(peak.x + 6)},${f1(peak.y + h * 0.62)} ${f1(rear.x)},${f1(rear.y + 5)}Z`;
    return (
      <g>
        <path d={d} fill={ctx.url('sec')} stroke={c.outline} strokeWidth={1.8} strokeLinejoin="round" />
        {!ctx.sil &&
          [0.3, 0.55, 0.8].map((t) => {
            const bx = rear.x + (frontP.x - rear.x) * t;
            const by = rear.y + (frontP.y - rear.y) * t + 4;
            return <path key={t} d={`M${f1(bx)},${f1(by)} Q${f1(bx - 4)},${f1(by - h * 0.4)} ${f1(peak.x + (bx - peak.x) * 0.32)},${f1(peak.y + (by - peak.y) * 0.3)}`} stroke={c.secLight} strokeWidth={1.1} fill="none" opacity={0.7} />;
          })}
      </g>
    );
  }
  if (g.back === 'spines') {
    return (
      <g>
        {tl.slice(1, -1).map((p, i) => {
          const len = (11 + (i % 2) * 4) * g.height;
          const ang = p.a;
          // Tips sweep toward the tail.
          const tipX = p.x + Math.cos(ang) * len - len * 0.5;
          const tipY = p.y + Math.sin(ang) * len * 0.9;
          const nx = Math.cos(ang + Math.PI / 2) * 4.8;
          const ny = Math.sin(ang + Math.PI / 2) * 4.8;
          return (
            <path
              key={i}
              d={`M${f1(p.x - nx)},${f1(p.y - ny + 4)} Q${f1(p.x - len * 0.15)},${f1(p.y - len * 0.45)} ${f1(tipX)},${f1(tipY)} Q${f1(p.x + nx * 0.2)},${f1(p.y - len * 0.25)} ${f1(p.x + nx)},${f1(p.y + ny + 4)}Z`}
              fill={c.secDark}
              stroke={c.outline}
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
          );
        })}
      </g>
    );
  }
  return null;
}

function Shell({ x: ctx }: { x: Ctx }) {
  const { a, c } = ctx;
  const tl = a.topLine;
  if (tl.length < 3) return null;
  const s = tl[0];
  const e = tl[tl.length - 1];
  const pts = tl.map((p) => `${f1(p.x + Math.cos(p.a) * 7)},${f1(p.y + Math.sin(p.a) * 7)}`);
  const d = `M${f1(s.x)},${f1(s.y + 6)} L${pts.join(' L')} L${f1(e.x)},${f1(e.y + 6)} Q${f1((s.x + e.x) / 2)},${f1(Math.max(s.y, e.y) + 10)} ${f1(s.x)},${f1(s.y + 6)}Z`;
  return (
    <g>
      <path d={d} fill={ctx.url('sec')} stroke={c.outline} strokeWidth={1.8} strokeLinejoin="round" />
      {!ctx.sil &&
        tl.slice(1, -1).map((p, i) => (
          <path key={i} d={`M${f1(p.x)},${f1(p.y + 8)} L${f1(p.x + Math.cos(p.a) * 6)},${f1(p.y + Math.sin(p.a) * 6)}`} stroke={c.secDark} strokeWidth={1.4} />
        ))}
      {!ctx.sil && <path d={d} fill="none" stroke={c.secLight} strokeWidth={1} opacity={0.6} transform="translate(0 2)" />}
    </g>
  );
}

// ---------- Tail ----------
function Tail({ x: ctx }: { x: Ctx }) {
  const { g, a, c } = ctx;
  const elTail = g.mutations.includes('element_tail');
  const type = g.tail === 'none' && elTail ? 'whip' : g.tail;
  if (type === 'none') return null;
  if (g.body === 'jelly') return <Ribbons x={ctx} type={type} elTail={elTail} />;
  const deg = (a.tail.a * 180) / Math.PI;
  const tx = `translate(${f1(a.tail.x)} ${f1(a.tail.y)}) rotate(${f1(deg)})`;
  let body: ReactNode = null;
  let tip = { x: 44, y: 4 };
  switch (type) {
    case 'whip':
      body = (
        <>
          <path d="M-2,-6 Q20,-9 34,2 Q40,8 47,5 Q40,13 31,9 Q18,3 -2,6Z" fill={ctx.url('body')} stroke={c.outline} strokeWidth={1.8} strokeLinejoin="round" />
          {!ctx.sil && <path d="M44,4 l6,-5 l2,7z" fill={c.acc} stroke={c.outline} strokeWidth={1} />}
        </>
      );
      tip = { x: 50, y: 3 };
      break;
    case 'fan':
      body = (
        <>
          {[-34, -14, 6, 26].map((r, i) => (
            <ellipse key={r} cx={36} cy={0} rx={15} ry={5.5} transform={`rotate(${r} 22 0)`} fill={i % 2 ? c.sec : c.acc} stroke={c.outline} strokeWidth={1.3} />
          ))}
          <path d="M-2,-6 Q12,-6 24,-2 L24,3 Q12,6 -2,6Z" fill={ctx.url('body')} stroke={c.outline} strokeWidth={1.6} />
        </>
      );
      tip = { x: 48, y: 0 };
      break;
    case 'club':
      body = (
        <>
          <path d="M-2,-7 Q14,-6 26,-3 L26,4 Q14,7 -2,7Z" fill={ctx.url('body')} stroke={c.outline} strokeWidth={1.6} />
          {[0, 72, 144, 216, 288].map((r) => (
            <path key={r} d="M34,-3 L34,-15 L38,-3Z" transform={`rotate(${r} 34 0)`} fill={c.bone} stroke={c.outline} strokeWidth={1} />
          ))}
          <circle cx={34} cy={0} r={9} fill={c.secDark} stroke={c.outline} strokeWidth={1.8} />
          {!ctx.sil && <circle cx={31} cy={-3} r={2.5} fill={c.secLight} opacity={0.7} />}
        </>
      );
      tip = { x: 44, y: 0 };
      break;
    case 'plume':
      body = (
        <>
          {[0, 1, 2, 3, 4].map((k) => (
            <ellipse key={k} cx={8 + k * 9} cy={-Math.sin(k * 0.8) * 5} rx={7 + k * 1.6} ry={4 + k * 1.2} fill={k % 2 ? c.sec : c.secLight} stroke={c.outline} strokeWidth={1.2} />
          ))}
        </>
      );
      tip = { x: 52, y: -3 };
      break;
  }
  return (
    <g className={ctx.animated ? 'cr-tail' : undefined} style={{ transformOrigin: `${f1(a.tail.x)}px ${f1(a.tail.y)}px`, animationDelay: '-2.9s' }}>
      <g transform={tx}>
        {body}
        {elTail && !ctx.sil && (
          <g className={ctx.animated ? 'cr-pulse' : undefined} style={{ transformOrigin: `${tip.x}px ${tip.y}px` }}>
            <circle cx={tip.x} cy={tip.y} r={13} fill={ctx.url('haloEl')} />
            <path d={`M${tip.x - 5},${tip.y + 3} Q${tip.x},${tip.y - 12} ${tip.x + 6},${tip.y + 3} Q${tip.x},${tip.y + 7} ${tip.x - 5},${tip.y + 3}Z`} fill={c.el} stroke={c.el2} strokeWidth={1} />
            <circle cx={tip.x} cy={tip.y + 1} r={2.4} fill="#fff" opacity={0.85} />
          </g>
        )}
      </g>
    </g>
  );
}

/** Medusoid tails: luminous ribbons trailing beneath the bell instead of a stiff tail. */
function Ribbons({ x: ctx, type, elTail }: { x: Ctx; type: Genome['tail']; elTail: boolean }) {
  const { a, c, g } = ctx;
  const by = (a.hips[0]?.y ?? a.torso.cy + a.torso.ry) - 4;
  const cx = a.torso.cx;
  const count = type === 'club' ? 1 : type === 'whip' ? 2 : 3;
  const rx = a.torso.rx;
  const xs = count === 1 ? [cx - rx * 0.55] : count === 2 ? [cx - rx * 0.7, cx - rx * 0.4] : [cx - rx * 0.8, cx - rx * 0.55, cx - rx * 0.3];
  const L = 62 * g.height;
  return (
    <g>
      {xs.map((x, i) => {
        const len = L * (1 - Math.abs(i - (count - 1) / 2) * 0.18);
        const d = `M${f1(x)},${f1(by)} C${f1(x - 10)},${f1(by + len * 0.3)} ${f1(x - 2)},${f1(by + len * 0.6)} ${f1(x - 30)},${f1(by + len * 0.92)}`;
        const end = { x: x - 30, y: by + len * 0.92 };
        return (
          <g key={i} className={ctx.animated ? 'cr-ribbon' : undefined} style={{ transformOrigin: `${f1(x)}px ${f1(by)}px`, animationDelay: `${(-2.8 + i * 0.25).toFixed(2)}s` }}>
            <path d={d} fill="none" stroke={c.sec} strokeOpacity={ctx.sil ? 1 : 0.55} strokeWidth={type === 'fan' ? 6 : 4.4} strokeLinecap="round" />
            <path d={d} fill="none" stroke={c.sec} strokeOpacity={ctx.sil ? 1 : 0.7} strokeWidth={type === 'fan' ? 9 : 7} strokeLinecap="round" pathLength={100} strokeDasharray="40 100" />
            {!ctx.sil && <path d={d} fill="none" stroke={c.accLight} strokeWidth={1.6} strokeLinecap="round" strokeDasharray={type === 'plume' ? '1.5 4' : undefined} className={ctx.animated ? 'cr-glowpulse' : undefined} />}
            {!ctx.sil && <path d={d} fill="none" stroke={c.acc} strokeOpacity={0.25} strokeWidth={type === 'fan' ? 13 : 10} strokeLinecap="round" />}
            {type === 'club' && <circle cx={end.x} cy={end.y} r={5} fill={c.secDark} stroke={c.outline} strokeWidth={1.4} />}
            {elTail && i === Math.floor((count - 1) / 2) && !ctx.sil && (
              <g className={ctx.animated ? 'cr-pulse' : undefined} style={{ transformOrigin: `${f1(end.x)}px ${f1(end.y)}px` }}>
                <circle cx={end.x} cy={end.y} r={12} fill={ctx.url('haloEl')} />
                <circle cx={end.x} cy={end.y} r={4} fill={c.el} stroke={c.el2} strokeWidth={1} />
                <circle cx={end.x - 1} cy={end.y - 1} r={1.6} fill="#fff" />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ---------- Pattern ----------
function Pattern({ x: ctx }: { x: Ctx }) {
  const { g, a, c } = ctx;
  if (ctx.sil) return null;
  const { cx, cy, rx, ry } = a.torso;
  const rng = mulberry32(hashSeed(g.seed, 'pattern'));
  const col = c.sec;
  const items: ReactNode[] = [];
  switch (g.pattern) {
    case 'spots':
      for (let i = 0; i < 9; i++) {
        const t = rng() * Math.PI * 2;
        const rr = Math.sqrt(rng()) * 0.85;
        items.push(<circle key={i} cx={cx + Math.cos(t) * rx * rr} cy={cy + Math.sin(t) * ry * rr - ry * 0.15} r={range(rng, 2.5, 6.5)} fill={col} opacity={0.75} />);
      }
      break;
    case 'stripes':
      for (let i = 0; i < 6; i++) {
        const x = cx - rx + (2 * rx * (i + 0.5)) / 6;
        items.push(<path key={i} d={`M${f1(x - 3)},${f1(cy - ry * 1.1)} Q${f1(x + 6)},${f1(cy)} ${f1(x - 2)},${f1(cy + ry * 0.4)}`} stroke={col} strokeWidth={4.5} fill="none" opacity={0.7} strokeLinecap="round" />);
      }
      break;
    case 'rings':
      for (let i = 1; i <= 3; i++) items.push(<ellipse key={i} cx={cx - rx * 0.15} cy={cy - ry * 0.1} rx={rx * 0.28 * i} ry={ry * 0.24 * i} stroke={col} strokeWidth={2.6} fill="none" opacity={0.6} />);
      break;
    case 'scales':
      for (let row = 0; row < 4; row++) {
        for (let k = 0; k < 7; k++) {
          const x = cx - rx + k * (rx / 3.2) + (row % 2) * 5;
          const y = cy - ry * 0.85 + row * 9;
          items.push(<path key={`${row}-${k}`} d={`M${f1(x - 5)},${f1(y)} Q${f1(x)},${f1(y + 7)} ${f1(x + 5)},${f1(y)}`} stroke={col} strokeWidth={1.6} fill="none" opacity={0.65} />);
        }
      }
      break;
    case 'veins': {
      const veins: string[] = [];
      for (let i = 0; i < 4; i++) {
        let x = cx - rx * 0.6 + i * rx * 0.4;
        let y = cy + ry * 0.6;
        let d = `M${f1(x)},${f1(y)}`;
        for (let s = 0; s < 4; s++) {
          x += range(rng, -7, 7);
          y -= ry * 0.35;
          d += ` L${f1(x)},${f1(y)}`;
        }
        veins.push(d);
      }
      items.push(
        <g key="v" className={ctx.animated ? 'cr-glowpulse' : undefined}>
          {veins.map((d, i) => (
            <path key={i} d={d} stroke={c.accLight} strokeWidth={1.6} fill="none" strokeLinejoin="round" opacity={0.85} />
          ))}
        </g>,
      );
      break;
    }
    case 'speckles':
      for (let i = 0; i < 34; i++) {
        items.push(<circle key={i} cx={cx + range(rng, -rx, rx)} cy={cy + range(rng, -ry, ry * 0.5)} r={range(rng, 0.8, 1.8)} fill={i % 3 ? col : c.accLight} opacity={0.8} />);
      }
      break;
    case 'chevrons':
      for (let i = 0; i < 4; i++) {
        const x = cx - rx * 0.6 + i * rx * 0.42;
        items.push(<path key={i} d={`M${f1(x - 6)},${f1(cy - ry * 0.8)} L${f1(x + 4)},${f1(cy - ry * 0.2)} L${f1(x - 6)},${f1(cy + ry * 0.3)}`} stroke={col} strokeWidth={4} fill="none" strokeLinejoin="round" opacity={0.7} />);
      }
      break;
    case 'gradient':
    default:
      items.push(<rect key="g" x={cx - rx * 1.4} y={cy - ry * 1.4} width={rx * 2.8} height={ry * 2.8} fill={ctx.url('fade')} />);
  }
  return <g clipPath={ctx.url('clip')}>{items}</g>;
}

function Texture({ x: ctx }: { x: Ctx }) {
  const { g, a, c } = ctx;
  if (ctx.sil) return null;
  if (g.texture === 'furry') {
    return (
      <g>
        {a.shapes.map((s, i) => (
          <ShapeEl key={i} s={s} fill="none" stroke={c.body} strokeWidth={5} strokeDasharray="1.2 3.2" strokeLinecap="round" />
        ))}
      </g>
    );
  }
  if (g.texture === 'rough') {
    const rng = mulberry32(hashSeed(g.seed, 'rough'));
    const { cx, cy, rx, ry } = a.torso;
    return (
      <g clipPath={ctx.url('clip')} opacity={0.3}>
        {Array.from({ length: 26 }, (_, i) => (
          <circle key={i} cx={cx + range(rng, -rx, rx)} cy={cy + range(rng, -ry, ry)} r={range(rng, 0.8, 2.2)} fill={c.outline} />
        ))}
      </g>
    );
  }
  if (g.texture === 'scaly' && g.pattern !== 'scales') {
    const { cx, cy, rx, ry } = a.torso;
    return (
      <g clipPath={ctx.url('clip')} opacity={0.25}>
        {Array.from({ length: 18 }, (_, i) => {
          const x = cx - rx + (i % 6) * (rx / 2.6) + (Math.floor(i / 6) % 2) * 4;
          const y = cy - ry * 0.3 + Math.floor(i / 6) * 8;
          return <path key={i} d={`M${f1(x - 4)},${f1(y)} Q${f1(x)},${f1(y + 5)} ${f1(x + 4)},${f1(y)}`} stroke={c.outline} strokeWidth={1.2} fill="none" />;
        })}
      </g>
    );
  }
  if (g.texture === 'glassy') {
    return (
      <g>
        {a.shapes.map((s, i) => (
          <ShapeEl key={i} s={s} fill="none" stroke={c.accLight} strokeWidth={1.4} opacity={0.7} transform="translate(1.5 1.5)" clipPath={ctx.url('clip')} />
        ))}
      </g>
    );
  }
  return null;
}

// ---------- Body-mounted mutations ----------
function BodyMutations({ x: ctx }: { x: Ctx }) {
  const { g, a, c } = ctx;
  if (ctx.sil) return null;
  const { cx, cy, rx, ry } = a.torso;
  const out: ReactNode[] = [];
  const glow = ctx.lite ? undefined : ctx.url('glow');
  if (g.mutations.includes('glow_markings')) {
    out.push(
      <g key="gm" className={ctx.animated ? 'cr-glowpulse' : undefined} filter={glow} clipPath={ctx.url('clip')}>
        <circle cx={cx - rx * 0.35} cy={cy - ry * 0.25} r={4} fill="none" stroke={c.el} strokeWidth={1.8} />
        <circle cx={cx - rx * 0.35} cy={cy - ry * 0.25} r={1.4} fill={c.el} />
        <path d={`M${f1(cx - rx * 0.1)},${f1(cy - ry * 0.55)} l6,6 l-6,6 l6,6`} stroke={c.el} strokeWidth={1.8} fill="none" />
        <path d={`M${f1(cx + rx * 0.2)},${f1(cy - ry * 0.1)} h10 m-5,-5 v10`} stroke={c.el} strokeWidth={1.8} />
        <circle cx={cx - rx * 0.6} cy={cy + ry * 0.15} r={2} fill={c.el} />
        <circle cx={cx + rx * 0.05} cy={cy + ry * 0.3} r={2} fill={c.el} />
      </g>,
    );
  }
  if (g.mutations.includes('heat_cracks')) {
    out.push(
      <g key="hc" filter={glow} clipPath={ctx.url('clip')} className={ctx.animated ? 'cr-glowpulse' : undefined}>
        <path d={`M${f1(cx - rx * 0.7)},${f1(cy - ry * 0.1)} l8,-6 l5,8 l9,-10 l6,5 M${f1(cx)},${f1(cy + ry * 0.4)} l6,-9 l7,4 l5,-11 M${f1(cx - rx * 0.3)},${f1(cy + ry * 0.55)} l7,-4 l4,5`} stroke="#e3b882" strokeWidth={2.2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <path d={`M${f1(cx - rx * 0.7)},${f1(cy - ry * 0.1)} l8,-6 l5,8 l9,-10 l6,5`} stroke="#e7e1c6" strokeWidth={0.8} fill="none" />
      </g>,
    );
  }
  if (g.mutations.includes('shell_plates')) {
    out.push(
      <g key="sp">
        {a.topLine.slice(1, -1).map((p, i) => (
          <ellipse key={i} cx={p.x} cy={p.y + 3} rx={9} ry={6} transform={`rotate(${f1((p.a * 180) / Math.PI + 90)} ${f1(p.x)} ${f1(p.y + 3)})`} fill={c.secDark} stroke={c.outline} strokeWidth={1.4} />
        ))}
        {a.topLine.slice(1, -1).map((p, i) => (
          <ellipse key={`h${i}`} cx={p.x - 1.5} cy={p.y + 1.5} rx={4} ry={2} fill={c.secLight} opacity={0.55} />
        ))}
      </g>,
    );
  }
  if (g.mutations.includes('frost_spikes')) {
    out.push(
      <g key="fs" filter={glow}>
        {a.topLine.slice(1, -1).map((p, i) => {
          const len = 13 + (i % 2) * 6;
          const tipX = p.x + Math.cos(p.a) * len;
          const tipY = p.y + Math.sin(p.a) * len;
          return <path key={i} d={`M${f1(p.x - 3.5)},${f1(p.y + 2)} L${f1(tipX)},${f1(tipY)} L${f1(p.x + 3.5)},${f1(p.y + 2)}Z`} fill="#d1e2e7" fillOpacity={0.75} stroke="#ffffff" strokeWidth={0.9} />;
        })}
      </g>,
    );
  }
  if (g.mutations.includes('storm_coils')) {
    const b = a.back;
    out.push(
      <g key="sc" filter={glow}>
        {[0, 1, 2].map((k) => (
          <ellipse key={k} cx={b.x + 4} cy={b.y - 4 - k * 6} rx={9 - k * 1.5} ry={3} fill="none" stroke="#e5cc8a" strokeWidth={2} />
        ))}
        <line x1={b.x + 4} y1={b.y + 2} x2={b.x + 4} y2={b.y - 18} stroke="#a88b58" strokeWidth={2} />
        <path className={ctx.animated ? 'cr-spark' : undefined} d={`M${f1(b.x + 4)},${f1(b.y - 20)} l-4,-6 l5,1 l-3,-7`} stroke="#e8e6d7" strokeWidth={1.4} fill="none" />
      </g>,
    );
  }
  return <>{out}</>;
}

function Wisps({ x: ctx }: { x: Ctx }) {
  const { g, a, c } = ctx;
  if (!g.mutations.includes('shadow_wisps') || ctx.sil) return null;
  const b = a.back;
  return (
    <g className={ctx.animated ? 'cr-wisps' : undefined} style={{ transformOrigin: `${f1(b.x)}px ${f1(b.y)}px` }} opacity={0.85}>
      {[0, 1, 2].map((k) => (
        <path key={k} d={`M${f1(b.x)},${f1(b.y + k * 6)} q-14,${-10 + k * 4} -28,${-2 + k * 3} t-26,${4 - k * 2} t-18,-6`} stroke={ctx.url('wisp')} strokeWidth={6 - k * 1.4} fill="none" strokeLinecap="round" />
      ))}
      <circle cx={b.x - 60} cy={b.y - 6} r={2} fill={c.el2} />
    </g>
  );
}

// ---------- Head ----------
function Head({ x: ctx }: { x: Ctx }) {
  const { g, a, c } = ctx;
  const { x: hx, y: hy, r, integrated } = a.head;
  const glow = ctx.lite ? undefined : ctx.url('glow');
  // Top of skull for accessories
  const topY = integrated ? Math.min(hy - r * 0.9, a.torso.cy - a.torso.ry * 0.95) : hy - r * 0.92;
  const topX = integrated ? hx - r * 0.25 : hx - r * 0.1;
  const behind: ReactNode[] = [];
  const front: ReactNode[] = [];

  if (g.head === 'frill') {
    behind.push(
      <g key="frill">
        {[-70, -45, -20, 5, 30].map((rot, i) => (
          <path key={i} d={`M${f1(hx - r * 0.3)},${f1(hy)} L${f1(hx - r * 0.3 - r * 1.6)},${f1(hy - 6)} L${f1(hx - r * 0.3 - r * 1.5)},${f1(hy + 8)}Z`} transform={`rotate(${rot + 90} ${f1(hx - r * 0.3)} ${f1(hy)})`} fill={i % 2 ? c.sec : c.acc} stroke={c.outline} strokeWidth={1.3} />
        ))}
      </g>,
    );
  }
  if (g.mutations.includes('leaf_mane')) {
    behind.push(
      <g key="mane">
        {[-120, -85, -50, -15, 20, 55].map((rot, i) => (
          <ellipse key={i} cx={hx - r * 0.2} cy={hy - r * 1.25} rx={r * 0.32} ry={r * 0.75} transform={`rotate(${rot} ${f1(hx - r * 0.2)} ${f1(hy)})`} fill={i % 2 ? '#8bc98e' : '#abd793'} stroke={ctx.sil ? c.outline : '#36553a'} strokeWidth={1.3} />
        ))}
      </g>,
    );
  }
  if (g.mutations.includes('abyssal_fins') && !ctx.sil) {
    behind.push(
      <g key="afin" filter={glow} opacity={0.85}>
        <path d={`M${f1(hx - r * 0.4)},${f1(hy - r * 0.2)} q-${f1(r * 1.2)},-${f1(r * 0.9)} -${f1(r * 1.5)},${f1(r * 0.1)} q${f1(r * 0.8)},0 ${f1(r * 1.5)},${f1(r * 0.5)}Z`} fill="#a0d8e4" fillOpacity={0.45} stroke="#c3e2e7" strokeWidth={1.1} />
      </g>,
    );
  }
  if (g.head === 'snout' && !integrated) {
    behind.push(<ellipse key="snout" cx={hx + r * 0.85} cy={hy + r * 0.3} rx={r * 0.62} ry={r * 0.44} fill={ctx.url('body')} stroke={c.outline} strokeWidth={1.8} />);
  }
  if (g.head === 'horns') {
    const hornColor = ctx.sil ? c.body : c.bone;
    const hx2 = topX;
    behind.push(<path key="hf" d={`M${f1(hx2 - 6)},${f1(topY + 6)} Q${f1(hx2 - 16)},${f1(topY - 14)} ${f1(hx2 - 30)},${f1(topY - 16)} Q${f1(hx2 - 16)},${f1(topY - 4)} ${f1(hx2 + 1)},${f1(topY + 7)}Z`} fill={ctx.sil ? c.body : c.secDark} stroke={c.outline} strokeWidth={1.5} />);
    front.push(<path key="hn" d={`M${f1(hx2 + 2)},${f1(topY + 5)} Q${f1(hx2 - 2)},${f1(topY - 18)} ${f1(hx2 - 18)},${f1(topY - 24)} Q${f1(hx2 - 6)},${f1(topY - 8)} ${f1(hx2 + 10)},${f1(topY + 6)}Z`} fill={hornColor} stroke={c.outline} strokeWidth={1.6} />);
    if (!ctx.sil) front.push(<path key="hr" d={`M${f1(hx2 + 1)},${f1(topY - 2)} q-4,-5 -9,-9 M${f1(hx2 - 3)},${f1(topY - 9)} q-3,-3 -7,-5`} stroke={c.outline} strokeWidth={0.9} opacity={0.5} fill="none" />);
  }
  if (g.head === 'crest') {
    // Blades sweep back along the skull instead of standing upright.
    front.push(
      <g key="crest">
        {[2, 1, 0].map((k) => {
          const b1 = { x: topX + 8 - k * 7, y: topY + 5 + k * 2 };
          const b2 = { x: topX - 3 - k * 7, y: topY + 7 + k * 2 };
          const tip = { x: topX - 14 - k * 9, y: topY - 13 + k * 4 };
          return (
            <path
              key={k}
              d={`M${f1(b1.x)},${f1(b1.y)} Q${f1(topX - k * 7)},${f1(topY - 11 + k * 3)} ${f1(tip.x)},${f1(tip.y)} Q${f1(topX - 6 - k * 7)},${f1(topY + 1 + k * 2)} ${f1(b2.x)},${f1(b2.y)}Z`}
              fill={k === 1 ? c.acc : c.sec}
              stroke={c.outline}
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
          );
        })}
      </g>,
    );
  }
  const pulse = ctx.animated ? 'cr-biolum' : undefined;
  if (g.head === 'antennae') {
    const t1 = { x: topX - 15, y: topY - 21 };
    const t2 = { x: topX + 2, y: topY - 25 };
    front.push(
      <g key="ant" className={ctx.animated ? 'cr-antenna' : undefined} style={{ transformOrigin: `${f1(topX)}px ${f1(topY + 4)}px`, animationDelay: '-2.95s' }}>
        <path d={`M${f1(topX)},${f1(topY + 4)} Q${f1(topX - 4)},${f1(topY - 12)} ${f1(t1.x)},${f1(t1.y)} M${f1(topX + 6)},${f1(topY + 4)} Q${f1(topX + 7)},${f1(topY - 13)} ${f1(t2.x)},${f1(t2.y)}`} stroke={c.outline} strokeWidth={2.2} fill="none" strokeLinecap="round" />
        {!ctx.sil && <circle className={pulse} cx={t1.x} cy={t1.y} r={9} fill={ctx.url('haloAcc')} />}
        {!ctx.sil && <circle className={pulse} cx={t2.x} cy={t2.y} r={9} fill={ctx.url('haloAcc')} style={{ animationDelay: '-1.3s' }} />}
        <circle cx={t1.x} cy={t1.y} r={3.3} fill={c.accLight} stroke={c.outline} strokeWidth={1} />
        <circle cx={t2.x} cy={t2.y} r={3.3} fill={c.accLight} stroke={c.outline} strokeWidth={1} />
      </g>,
    );
  }
  if (g.mutations.includes('sensor_stalks')) {
    const tip = { x: topX - 34, y: topY - 36 };
    const d = `M${f1(topX - 4)},${f1(topY + 4)} C${f1(topX - 10)},${f1(topY - 20)} ${f1(topX - 30)},${f1(topY - 14)} ${f1(tip.x)},${f1(tip.y + 2)}`;
    front.push(
      <g key="stalk" className={ctx.animated ? 'cr-antenna' : undefined} style={{ transformOrigin: `${f1(topX - 4)}px ${f1(topY + 4)}px`, animationDelay: '-2.6s' }}>
        <path d={d} stroke={c.outline} strokeWidth={3} fill="none" strokeLinecap="round" />
        <path d={d} stroke={c.sec} strokeWidth={1.6} fill="none" strokeLinecap="round" />
        {!ctx.sil && <circle className={pulse} cx={tip.x} cy={tip.y} r={12} fill={ctx.url('haloEl')} style={{ animationDelay: '-0.7s' }} />}
        <circle cx={tip.x} cy={tip.y} r={4.5} fill={ctx.sil ? c.body : c.el} stroke={ctx.sil ? c.outline : c.el2} strokeWidth={0.8} />
        {!ctx.sil && <circle cx={tip.x - 1} cy={tip.y - 1} r={1.5} fill="#fff" />}
      </g>,
    );
  }
  if (g.mutations.includes('crystal_crown')) {
    front.push(
      <g key="crown">
        {!ctx.sil && <ellipse className={pulse} cx={topX} cy={topY - 6} rx={24} ry={16} fill={ctx.url('haloEl')} />}
        {[-16, -6, 4, 14].map((dx, i) => {
          const h = i === 1 || i === 2 ? 18 : 12;
          const bx = topX + dx * 0.8;
          return <path key={i} d={`M${f1(bx - 4)},${f1(topY + 5)} L${f1(bx - 2.5)},${f1(topY - h)} L${f1(bx + 4)},${f1(topY + 5)}Z`} fill={ctx.sil ? c.body : ctx.url('crystal')} stroke={ctx.sil ? c.outline : '#ffffff'} strokeWidth={0.9} strokeLinejoin="round" />;
        })}
      </g>,
    );
  }

  // Head base
  const base = integrated ? null : (
    <g>
      <path d={`M${f1(hx - r)},${f1(hy)} C${f1(hx - r)},${f1(hy - r * 1.1)} ${f1(hx + r * 0.9)},${f1(hy - r * 1.15)} ${f1(hx + r * 1.02)},${f1(hy - r * 0.05)} C${f1(hx + r * 1.1)},${f1(hy + r * 0.9)} ${f1(hx - r * 0.8)},${f1(hy + r * 1.05)} ${f1(hx - r)},${f1(hy)}Z`} fill={ctx.url('body')} stroke={c.outline} strokeWidth={2} />
      {!ctx.sil && <path d={`M${f1(hx - r)},${f1(hy)} C${f1(hx - r)},${f1(hy - r * 1.1)} ${f1(hx + r * 0.9)},${f1(hy - r * 1.15)} ${f1(hx + r * 1.02)},${f1(hy - r * 0.05)} C${f1(hx + r * 1.1)},${f1(hy + r * 0.9)} ${f1(hx - r * 0.8)},${f1(hy + r * 1.05)} ${f1(hx - r)},${f1(hy)}Z`} fill="none" stroke={ctx.url('rimGrad')} strokeWidth={1.6} />}
      {!ctx.sil && <ellipse cx={hx - r * 0.15} cy={hy - r * 0.55} rx={r * 0.45} ry={r * 0.18} fill="#fff" opacity={0.16} />}
      {!ctx.sil && <ellipse cx={hx + r * 0.3} cy={hy + r * 0.55} rx={r * 0.55} ry={r * 0.28} fill={c.secLight} opacity={0.45} />}
    </g>
  );

  if (g.head === 'beak') {
    const bx = integrated ? hx + r * 0.75 : hx + r * 0.8;
    const by = integrated ? hy + r * 0.3 : hy + r * 0.05;
    front.push(
      <g key="beak">
        <path d={`M${f1(bx - 2)},${f1(by - r * 0.35)} Q${f1(bx + r * 0.7)},${f1(by - r * 0.2)} ${f1(bx + r * 0.9)},${f1(by + r * 0.25)} Q${f1(bx + r * 0.4)},${f1(by + r * 0.15)} ${f1(bx - 2)},${f1(by + r * 0.1)}Z`} fill={ctx.sil ? c.body : hsl({ h: g.accent.h, s: 75, l: 58 })} stroke={c.outline} strokeWidth={1.6} />
        <path d={`M${f1(bx - 2)},${f1(by + r * 0.1)} Q${f1(bx + r * 0.4)},${f1(by + r * 0.2)} ${f1(bx + r * 0.6)},${f1(by + r * 0.35)} Q${f1(bx + r * 0.2)},${f1(by + r * 0.45)} ${f1(bx - 2)},${f1(by + r * 0.32)}Z`} fill={ctx.sil ? c.body : hsl({ h: g.accent.h, s: 60, l: 42 })} stroke={c.outline} strokeWidth={1.4} />
      </g>,
    );
  }
  if (g.head === 'snout' && !ctx.sil) {
    const sx = integrated ? hx + r * 0.6 : hx + r * 1.25;
    const sy = integrated ? hy + r * 0.45 : hy + r * 0.2;
    if (integrated) front.push(<ellipse key="sn" cx={sx - 3} cy={sy} rx={r * 0.45} ry={r * 0.3} fill={c.bodyLight} stroke={c.outline} strokeWidth={1.4} />);
    front.push(<ellipse key="n1" cx={sx} cy={sy} rx={1.6} ry={1.2} fill={c.outline} />);
  }

  return (
    <g className={ctx.animated ? 'cr-head' : undefined} style={{ transformOrigin: `${f1(hx - r * 0.6)}px ${f1(hy + r * 0.6)}px` }}>
      {behind}
      {base}
      <Eyes x={ctx} />
      <Mouth x={ctx} />
      {front}
    </g>
  );
}

type EyeStyle = 'glossy' | 'luminous' | 'slit' | 'lidded' | 'sharp';

/** Eye style follows personality (and Shadow organisms always have glowing slits). */
function eyeStyle(ctx: Ctx): EyeStyle {
  if (ctx.g.eyes === 'slit' || ctx.mood === 'aggressive' || ctx.g.element === 'shadow') return 'slit';
  if (ctx.mood === 'curious') return 'luminous';
  if (ctx.mood === 'defensive') return 'lidded';
  if (ctx.mood === 'agile') return 'sharp';
  return 'glossy';
}

function almond(cx: number, cy: number, r: number) {
  return `M${f1(cx - r)},${f1(cy + r * 0.05)} Q${f1(cx - r * 0.1)},${f1(cy - r * 1.2)} ${f1(cx + r)},${f1(cy - r * 0.12)} Q${f1(cx + r * 0.1)},${f1(cy + r * 1.05)} ${f1(cx - r)},${f1(cy + r * 0.05)}Z`;
}

function Eye({ x: ctx, cx, cy, r, brow }: { x: Ctx; cx: number; cy: number; r: number; brow?: boolean }) {
  const { c } = ctx;
  if (ctx.sil) return <circle cx={cx} cy={cy} r={r * 0.5} fill="#323c55" opacity={0.6} />;
  const style = eyeStyle(ctx);
  const specular = (
    <>
      <circle cx={cx - r * 0.3} cy={cy - r * 0.36} r={r * 0.24} fill="#fff" />
      <circle cx={cx + r * 0.3} cy={cy + r * 0.26} r={r * 0.1} fill="#fff" opacity={0.85} />
    </>
  );
  switch (style) {
    case 'slit':
      // Bioluminescent dragon eye: glowing iris, dark vertical pupil.
      return (
        <g>
          <ellipse cx={cx} cy={cy} rx={r * 1.5} ry={r * 1.2} fill={ctx.url('haloAcc')} opacity={0.45} />
          <path d={almond(cx, cy, r * 1.12)} fill={ctx.url('eyeSlit')} stroke={c.outline} strokeWidth={1.3} />
          <ellipse cx={cx + r * 0.08} cy={cy - r * 0.02} rx={r * 0.15} ry={r * 0.66} fill={c.pupil} />
          <circle cx={cx - r * 0.38} cy={cy - r * 0.32} r={r * 0.17} fill="#fff" opacity={0.95} />
          {brow && <path d={`M${f1(cx - r * 1.1)},${f1(cy - r * 1.16)} L${f1(cx + r * 0.95)},${f1(cy - r * 0.62)}`} stroke={c.outline} strokeWidth={Math.max(1.6, r * 0.34)} strokeLinecap="round" />}
        </g>
      );
    case 'luminous':
      return (
        <g>
          <circle cx={cx} cy={cy} r={r * 1.75} fill={ctx.url('haloAcc')} opacity={0.55} />
          <ellipse cx={cx} cy={cy} rx={r * 1.02} ry={r * 1.08} fill={ctx.url('eyeLum')} stroke={c.outline} strokeWidth={1.3} />
          <circle cx={cx + r * 0.1} cy={cy + r * 0.08} r={r * 0.2} fill={c.pupil} />
          {specular}
        </g>
      );
    case 'sharp':
      return (
        <g transform={`rotate(-12 ${f1(cx)} ${f1(cy)})`}>
          <path d={almond(cx, cy, r * 1.02)} fill={ctx.url('eyeGloss')} stroke={c.outline} strokeWidth={1.3} />
          <circle cx={cx + r * 0.1} cy={cy + r * 0.05} r={r * 0.46} fill="none" stroke={c.accLight} strokeWidth={r * 0.08} opacity={0.55} />
          {specular}
        </g>
      );
    case 'lidded': {
      const y0 = cy - r * 0.32;
      const w = r * 0.9 * Math.sqrt(1 - 0.32 * 0.32);
      return (
        <g>
          <ellipse cx={cx} cy={cy} rx={r * 0.9} ry={r} fill={ctx.url('eyeGloss')} stroke={c.outline} strokeWidth={1.3} />
          <circle cx={cx + r * 0.08} cy={cy + r * 0.16} r={r * 0.5} fill="none" stroke={c.accLight} strokeWidth={r * 0.08} opacity={0.55} />
          <circle cx={cx + r * 0.3} cy={cy + r * 0.32} r={r * 0.1} fill="#fff" opacity={0.85} />
          <circle cx={cx - r * 0.32} cy={cy + r * 0.05} r={r * 0.15} fill="#fff" />
          <path d={`M${f1(cx - w)},${f1(y0)} A${f1(r * 0.9)} ${f1(r)} 0 0 1 ${f1(cx + w)},${f1(y0)} Z`} fill={c.bodyLight} stroke={c.outline} strokeWidth={1.3} strokeLinejoin="round" />
          <path d={`M${f1(cx - w)},${f1(y0)} L${f1(cx + w)},${f1(y0)}`} stroke={c.outline} strokeWidth={1.9} strokeLinecap="round" />
        </g>
      );
    }
    case 'glossy':
    default:
      return (
        <g>
          <ellipse cx={cx} cy={cy} rx={r * 0.92} ry={r} fill={ctx.url('eyeGloss')} stroke={c.outline} strokeWidth={1.3} />
          <circle cx={cx + r * 0.08} cy={cy + r * 0.1} r={r * 0.55} fill="none" stroke={c.accLight} strokeWidth={r * 0.08} opacity={0.55} />
          {specular}
        </g>
      );
  }
}

function Eyes({ x: ctx }: { x: Ctx }) {
  const { g, a, c } = ctx;
  const { x: hx, y: hy, r, integrated } = a.head;
  const ex = integrated ? hx + r * 0.1 : hx + r * 0.38;
  const ey = integrated ? hy : hy - r * 0.12;
  const er = (integrated ? r * 0.34 : r * 0.31) * (g.eyes === 'single' ? 1.45 : 1);
  const blinkDelay = `${(g.seed % 4000) / 1000}s`;
  const glow = ctx.lite ? undefined : ctx.url('glow');
  let eyes: ReactNode;
  if (g.head === 'visor') {
    eyes = (
      <g>
        <path d={`M${f1(ex - r * 0.7)},${f1(ey - r * 0.3)} Q${f1(ex + r * 0.2)},${f1(ey - r * 0.5)} ${f1(ex + r * 0.75)},${f1(ey - r * 0.2)} L${f1(ex + r * 0.7)},${f1(ey + r * 0.28)} Q${f1(ex + r * 0.1)},${f1(ey + r * 0.15)} ${f1(ex - r * 0.65)},${f1(ey + r * 0.25)}Z`} fill={ctx.sil ? c.body : '#13151d'} stroke={c.outline} strokeWidth={1.6} />
        {!ctx.sil && <path d={`M${f1(ex - r * 0.45)},${f1(ey)} L${f1(ex + r * 0.55)},${f1(ey - r * 0.05)}`} stroke={c.el} strokeWidth={2.6} strokeLinecap="round" filter={glow} className={ctx.animated ? 'cr-glowpulse' : undefined} />}
        {!ctx.sil && <path d={`M${f1(ex - r * 0.5)},${f1(ey - r * 0.22)} Q${f1(ex)},${f1(ey - r * 0.36)} ${f1(ex + r * 0.4)},${f1(ey - r * 0.25)}`} stroke="#fff" strokeWidth={1} opacity={0.4} fill="none" />}
      </g>
    );
  } else {
    switch (g.eyes) {
      case 'single':
        eyes = <Eye x={ctx} cx={ex} cy={ey} r={er} brow={ctx.mood === 'aggressive'} />;
        break;
      case 'triple':
        eyes = (
          <>
            <Eye x={ctx} cx={ex - r * 0.42} cy={ey - r * 0.02} r={er * 0.82} />
            <Eye x={ctx} cx={ex + r * 0.18} cy={ey + r * 0.02} r={er} />
            <Eye x={ctx} cx={ex - r * 0.1} cy={ey - r * 0.5} r={er * 0.62} />
          </>
        );
        break;
      case 'cluster':
        eyes = (
          <>
            {[
              [-0.42, 0, 0.62],
              [0.12, 0.04, 0.75],
              [-0.15, -0.42, 0.55],
              [0.4, -0.3, 0.5],
              [-0.12, 0.36, 0.45],
            ].map(([dx, dy, s], i) => (
              <Eye key={i} x={ctx} cx={ex + r * dx} cy={ey + r * dy} r={er * s} />
            ))}
          </>
        );
        break;
      case 'slit':
        eyes = (
          <>
            <Eye x={ctx} cx={ex - r * 0.4} cy={ey - r * 0.03} r={er * 0.82} brow={ctx.mood === 'aggressive'} />
            <Eye x={ctx} cx={ex + r * 0.18} cy={ey} r={er} brow={ctx.mood === 'aggressive'} />
          </>
        );
        break;
      case 'pair':
      default:
        eyes = (
          <>
            <Eye x={ctx} cx={ex - r * 0.4} cy={ey - r * 0.03} r={er * 0.84} brow={ctx.mood === 'aggressive'} />
            <Eye x={ctx} cx={ex + r * 0.2} cy={ey} r={er} brow={ctx.mood === 'aggressive'} />
          </>
        );
    }
  }
  return (
    <g>
      <g className={ctx.animated && g.head !== 'visor' ? 'cr-blink' : undefined} style={{ transformOrigin: `${f1(ex)}px ${f1(ey)}px`, animationDelay: blinkDelay }}>
        {eyes}
      </g>
      {g.mutations.includes('third_eye') && (
        <g className={ctx.animated ? 'cr-blink' : undefined} style={{ transformOrigin: `${f1(ex - r * 0.05)}px ${f1(ey - r * 0.68)}px`, animationDelay: `${(g.seed % 3000) / 1000 + 1}s` }}>
          {ctx.sil ? null : (
            <g>
              <ellipse cx={ex - r * 0.05} cy={ey - r * 0.68} rx={r * 0.38} ry={r * 0.5} fill={ctx.url('haloEl')} />
              <ellipse cx={ex - r * 0.05} cy={ey - r * 0.68} rx={r * 0.16} ry={r * 0.3} fill={c.el2} stroke={c.outline} strokeWidth={1.2} />
              <ellipse cx={ex - r * 0.05} cy={ey - r * 0.68} rx={r * 0.06} ry={r * 0.22} fill={c.pupil} />
            </g>
          )}
        </g>
      )}
    </g>
  );
}

function Mouth({ x: ctx }: { x: Ctx }) {
  const { g, a, c } = ctx;
  if (ctx.sil) return null;
  if (g.head === 'beak' && g.mouth !== 'mandibles') return null;
  const { x: hx, y: hy, r, integrated } = a.head;
  const mx = integrated ? hx + r * 0.3 : hx + r * 0.62;
  const my = integrated ? hy + r * 0.62 : hy + r * 0.45;
  const w = r * (integrated ? 0.55 : 0.5);
  switch (g.mouth) {
    case 'fangs':
      return (
        <g>
          <path d={`M${f1(mx - w / 2)},${f1(my)} Q${f1(mx)},${f1(my + w * 0.4)} ${f1(mx + w / 2)},${f1(my - w * 0.1)}`} stroke={c.outline} strokeWidth={2} fill="none" strokeLinecap="round" />
          <path d={`M${f1(mx - w * 0.2)},${f1(my + w * 0.12)} l2,6 l2,-5.5z M${f1(mx + w * 0.2)},${f1(my + w * 0.08)} l2,5.5 l2,-5.5z`} fill="#fff" stroke={c.outline} strokeWidth={0.8} />
        </g>
      );
    case 'tiny':
      return <ellipse cx={mx} cy={my} rx={w * 0.16} ry={w * 0.12} fill={c.outline} />;
    case 'mandibles':
      return (
        <g>
          <path d={`M${f1(mx - 2)},${f1(my - 2)} q${f1(w * 0.9)},${f1(-w * 0.1)} ${f1(w * 0.9)},${f1(w * 0.7)} q-${f1(w * 0.3)},-${f1(w * 0.35)} -${f1(w * 0.85)},-${f1(w * 0.3)}z`} fill={c.secDark} stroke={c.outline} strokeWidth={1.3} />
          <path d={`M${f1(mx - 4)},${f1(my + 2)} q${f1(w * 0.8)},${f1(w * 0.25)} ${f1(w * 0.65)},${f1(w * 0.95)} q-${f1(w * 0.25)},-${f1(w * 0.4)} -${f1(w * 0.7)},-${f1(w * 0.55)}z`} fill={c.secDark} stroke={c.outline} strokeWidth={1.3} />
        </g>
      );
    case 'grin':
      return (
        <g>
          <path d={`M${f1(mx - w * 0.7)},${f1(my - w * 0.1)} Q${f1(mx)},${f1(my + w * 0.75)} ${f1(mx + w * 0.6)},${f1(my - w * 0.25)} Q${f1(mx)},${f1(my + w * 0.2)} ${f1(mx - w * 0.7)},${f1(my - w * 0.1)}Z`} fill="#331f27" stroke={c.outline} strokeWidth={1.6} />
          <path d={`M${f1(mx - w * 0.5)},${f1(my + w * 0.05)} Q${f1(mx)},${f1(my + w * 0.3)} ${f1(mx + w * 0.45)},${f1(my - w * 0.1)}`} stroke="#fff" strokeWidth={1.4} strokeDasharray="2 1.5" fill="none" />
        </g>
      );
    case 'smile':
    default:
      return <path d={`M${f1(mx - w / 2)},${f1(my)} Q${f1(mx)},${f1(my + w * 0.45)} ${f1(mx + w / 2)},${f1(my - w * 0.1)}`} stroke={c.outline} strokeWidth={2} fill="none" strokeLinecap="round" />;
  }
}

// ---------- Element FX ----------
function ElementFx({ x: ctx }: { x: Ctx }) {
  const { g, c } = ctx;
  if (ctx.lite || ctx.sil || !ctx.animated) return null;
  const rng = mulberry32(hashSeed(g.seed, 'fx'));
  const n = 7;
  const parts: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const x = range(rng, 38, 162);
    const y = range(rng, 70, 160);
    const style: CSSProperties = { animationDelay: `${(-range(rng, 0, 4)).toFixed(2)}s`, animationDuration: `${range(rng, 2.6, 4.6).toFixed(2)}s`, transformOrigin: `${f1(x)}px ${f1(y)}px` };
    let shape: ReactNode;
    switch (g.element) {
      case 'ember':
        shape = <circle cx={x} cy={y} r={range(rng, 1.2, 2.6)} fill={i % 2 ? c.el : c.el2} />;
        break;
      case 'tide':
        shape = <circle cx={x} cy={y} r={range(rng, 2, 4)} fill="none" stroke={c.el} strokeWidth={1} />;
        break;
      case 'bloom':
        shape = <ellipse cx={x} cy={y} rx={3.2} ry={1.5} fill={i % 2 ? c.el : c.el2} transform={`rotate(${Math.round(rng() * 180)} ${f1(x)} ${f1(y)})`} />;
        break;
      case 'volt':
        shape = <path d={`M${f1(x)},${f1(y)} l3,-5 l-2,0 l3,-6`} stroke={c.el} strokeWidth={1.4} fill="none" strokeLinecap="round" />;
        break;
      case 'frost':
        shape = <path d={`M${f1(x)},${f1(y - 4)} L${f1(x + 1)},${f1(y - 1)} L${f1(x + 4)},${f1(y)} L${f1(x + 1)},${f1(y + 1)} L${f1(x)},${f1(y + 4)} L${f1(x - 1)},${f1(y + 1)} L${f1(x - 4)},${f1(y)} L${f1(x - 1)},${f1(y - 1)}Z`} fill={c.el2} />;
        break;
      case 'shadow':
        shape = <circle cx={x} cy={y} r={range(rng, 1.5, 3)} fill={i % 2 ? c.el : c.el2} opacity={0.8} />;
        break;
    }
    parts.push(
      <g key={i} className={`cr-fx cr-fx-${g.element}`} style={style}>
        {shape}
      </g>,
    );
  }
  return <g filter={ctx.url('glowSoft')}>{parts}</g>;
}

// ---------- Framing ----------
interface Bounds {
  top: number;
  left: number;
  right: number;
}

/** Approximate local-space bounds of the organism including tall/wide appendages. */
function contentBounds(g: Genome, a: Anatomy, tuck: boolean): Bounds {
  const r = a.head.r;
  const headTop = a.head.integrated ? Math.min(a.head.y - r * 0.9, a.torso.cy - a.torso.ry * 0.95) : a.head.y - r * 0.92;
  const headExtra = Math.max(
    g.head === 'horns' ? 26 : g.head === 'antennae' ? 30 : g.head === 'crest' ? 16 : g.head === 'frill' ? r * 0.9 : 4,
    g.mutations.includes('sensor_stalks') ? 44 : 0,
    g.mutations.includes('crystal_crown') ? 22 : 0,
  );
  let top = Math.min(a.torso.cy - a.torso.ry, headTop - headExtra);
  let left = Math.min(a.tail.x - (g.tail === 'none' ? 6 : 52), a.torso.cx - a.torso.rx - 4);
  if (g.back === 'membrane_wings' || g.back === 'insect_wings') {
    const L = (g.body === 'avian' ? 52 : 42) * (g.mutations.includes('great_wings') ? 1.45 : 1) * (tuck ? 0.9 : 1);
    top = Math.min(top, a.back.y - L * 1.02);
    left = Math.min(left, a.back.x - L * 1.1);
  }
  if (g.back === 'dorsal_fin') top = Math.min(top, a.topLine[Math.floor(a.topLine.length / 2)].y - 24);
  if (g.back === 'spines' || g.mutations.includes('frost_spikes')) top = Math.min(top, Math.min(...a.topLine.map((p) => p.y)) - 18);
  const right = a.head.x + r + (g.head === 'beak' || g.head === 'snout' ? 18 : 10);
  return { top, left, right };
}

/** Largest scale (<= wanted) that keeps the bounds inside the 200x200 frame. */
function fitScale(b: Bounds, dx: number, wanted: number): number {
  let s = wanted;
  if (b.top < GROUND) s = Math.min(s, (GROUND - 4) / (GROUND - b.top));
  if (b.left < 100) s = Math.min(s, (dx + 97) / (100 - b.left));
  if (b.right > 100) s = Math.min(s, (97 - dx) / (b.right - 100));
  return Math.max(0.45, s);
}

/** Crop empty space around the organism (cards, grids). */
function tightViewBox(b: Bounds, a: Anatomy, scale: number): string {
  const bottom = GROUND + 9;
  const tx = (x: number) => a.dx + 100 + (x - 100) * scale;
  const ty = (y: number) => GROUND + (y - GROUND) * scale;
  const L = tx(b.left) - 8;
  const R = tx(b.right) + 8;
  const T = ty(b.top) - 8;
  const B = ty(bottom);
  const side = Math.min(200, Math.max(118, R - L, B - T));
  const cx = (L + R) / 2;
  const extra = side - (B - T);
  const y0 = T - extra * 0.62;
  return `${f1(cx - side / 2)} ${f1(y0)} ${f1(side)} ${f1(side)}`;
}

// ---------- Main ----------
function CreatureSVGInner({ genome: g, stage = 1, size = 200, animated = true, lite = false, silhouette = false, personality, framing = 'full', shadow = true, className, style, title }: CreatureSVGProps) {
  const rawId = useId();
  // Every <defs> id is scoped to this SVG instance, so cards never share or lose references.
  const uidp = useMemo(() => 'cr' + rawId.replace(/[^a-zA-Z0-9]/g, '') + (g.seed >>> 0).toString(36), [rawId, g.seed]);
  const a = useMemo(() => buildAnatomy(g), [g]);
  const c = useMemo(() => makePalette(g, silhouette), [g, silhouette]);
  const hasWings = g.back === 'membrane_wings' || g.back === 'insect_wings';
  const tuck = hasWings && (g.body === 'orb' || g.body === 'jelly');
  // Translucent (glassy) bodies keep per-shape outlines: a solid under-silhouette would bleed through.
  const joined = g.texture !== 'glassy';
  const mood = personality ?? g.personality;
  const ctx: Ctx = {
    g,
    a,
    c,
    id: (n) => `${uidp}-${n}`,
    url: (n) => `url(#${uidp}-${n})`,
    rng: mulberry32(hashSeed(g.seed, 'render')),
    lite,
    sil: silhouette,
    animated,
    mood,
    joined,
    tuck,
  };
  const bounds = useMemo(() => contentBounds(g, a, tuck), [g, a, tuck]);
  const scale = fitScale(bounds, a.dx, g.size * a.fit * (1 + (stage - 1) * 0.05));
  const root = `translate(${f1(a.dx)} 0) translate(100 ${GROUND}) scale(${scale.toFixed(3)}) translate(-100 -${GROUND})`;
  const viewBox = framing === 'tight' ? tightViewBox(bounds, a, scale) : '0 0 200 200';
  const el = ELEMENT_INFO[g.element];
  const auraStrength = silhouette ? 0 : g.anomaly ? 0.55 : stage === 3 ? 0.45 : stage === 2 ? 0.28 : 0;
  // Near limbs tuck under the belly (the body hides the hip joint), except bug legs and side fins.
  const underBody = (g.limbs === 'stout' || g.limbs === 'spindly' || g.limbs === 'tentacles') && !(g.body === 'arthropod' && g.limbs === 'spindly');
  const far = a.hips.filter((h) => h.far);
  const near = a.hips.filter((h) => !h.far);
  const extraHips: Hip[] = g.mutations.includes('extra_limbs')
    ? [
        { x: a.torso.cx - a.torso.rx * 0.05, y: a.torso.cy + a.torso.ry * 0.62, far: true, splay: 0 },
        { x: a.torso.cx - a.torso.rx * 0.15, y: a.torso.cy + a.torso.ry * 0.7, far: false, splay: 0 },
      ]
    : [];
  const extraCtx: Ctx = g.limbs === 'none' ? { ...ctx, g: { ...g, limbs: 'spindly' } } : ctx;
  const extraUnder = extraCtx.g.limbs !== 'fins' && !(g.body === 'arthropod' && extraCtx.g.limbs === 'spindly');
  const breatheCls = animated ? 'cr-breathe' : undefined;
  const breatheStyle: CSSProperties = { transformOrigin: `${f1(a.torso.cx)}px ${f1(a.torso.cy + a.torso.ry)}px` };
  const segmented = joined && (g.body === 'serpent' || g.body === 'arthropod');
  const nearLimbs = near.map((h, i) => <Limb key={`n${i}`} x={ctx} hip={h} i={i + 2} />);
  const extraNear = extraHips.filter((h) => !h.far).map((h, i) => <Limb key={`en${i}`} x={extraCtx} hip={h} i={i + 7} scale={0.85} />);

  return (
    <svg
      viewBox={viewBox}
      width={size}
      height={size}
      className={`cr-root ${animated ? 'cr-animated' : ''} ${className ?? ''}`}
      style={style}
      role="img"
      aria-label={title ?? 'Procedurally generated creature'}
    >
      <defs>
        <radialGradient id={ctx.id('body')} cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor={c.bodyLight} />
          <stop offset="52%" stopColor={c.body} />
          <stop offset="100%" stopColor={c.bodyDark} />
        </radialGradient>
        <linearGradient id={ctx.id('sec')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.secLight} />
          <stop offset="100%" stopColor={c.secDark} />
        </linearGradient>
        <linearGradient id={ctx.id('wing')} x1="1" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={c.sec} stopOpacity={0.95} />
          <stop offset="100%" stopColor={c.acc} stopOpacity={0.8} />
        </linearGradient>
        <linearGradient id={ctx.id('fade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.sec} stopOpacity={0} />
          <stop offset="100%" stopColor={c.sec} stopOpacity={0.7} />
        </linearGradient>
        <radialGradient id={ctx.id('eyeGloss')} cx="54%" cy="66%" r="72%">
          <stop offset="0%" stopColor={c.accLight} />
          <stop offset="34%" stopColor={c.iris} />
          <stop offset="72%" stopColor={c.pupil} />
          <stop offset="100%" stopColor={c.pupil} />
        </radialGradient>
        <radialGradient id={ctx.id('eyeSlit')} cx="52%" cy="52%" r="62%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="22%" stopColor={c.accLight} />
          <stop offset="62%" stopColor={c.iris} />
          <stop offset="100%" stopColor={c.pupil} />
        </radialGradient>
        <radialGradient id={ctx.id('eyeLum')} cx="46%" cy="46%" r="62%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="20%" stopColor={c.accLight} />
          <stop offset="58%" stopColor={c.iris} />
          <stop offset="100%" stopColor={c.pupil} />
        </radialGradient>
        <radialGradient id={ctx.id('haloAcc')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={c.accLight} stopOpacity={0.85} />
          <stop offset="40%" stopColor={c.acc} stopOpacity={0.32} />
          <stop offset="100%" stopColor={c.acc} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={ctx.id('haloEl')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={c.el2} stopOpacity={0.9} />
          <stop offset="38%" stopColor={c.el} stopOpacity={0.35} />
          <stop offset="100%" stopColor={c.el} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={ctx.id('rimGrad')} x1="0.95" y1="0" x2="0.2" y2="0.85">
          <stop offset="0%" stopColor={c.rim} stopOpacity={0.95} />
          <stop offset="38%" stopColor={c.rim} stopOpacity={0.35} />
          <stop offset="62%" stopColor={c.rim} stopOpacity={0} />
        </linearGradient>
        <radialGradient id={ctx.id('shadowGrad')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={silhouette ? '#000' : el.dark} stopOpacity={0.85} />
          <stop offset="65%" stopColor={silhouette ? '#000' : el.dark} stopOpacity={0.45} />
          <stop offset="100%" stopColor={silhouette ? '#000' : el.dark} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={ctx.id('crystal')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor={c.el2} />
          <stop offset="100%" stopColor={c.el} />
        </linearGradient>
        <linearGradient id={ctx.id('wisp')} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor={c.el} stopOpacity={0.9} />
          <stop offset="100%" stopColor={c.el2} stopOpacity={0} />
        </linearGradient>
        <radialGradient id={ctx.id('aura')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={el.color} stopOpacity={0.6} />
          <stop offset="60%" stopColor={el.color} stopOpacity={0.15} />
          <stop offset="100%" stopColor={el.color} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={ctx.id('anomaly')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d48ab0" />
          <stop offset="35%" stopColor="#6fb0c8" />
          <stop offset="70%" stopColor="#ccd07a" />
          <stop offset="100%" stopColor="#d48ab0" />
        </linearGradient>
        <clipPath id={ctx.id('clip')}>
          {a.shapes.map((s, i) => (
            <ShapeEl key={i} s={s} />
          ))}
        </clipPath>
        {!lite && (
          <filter id={ctx.id('glow')} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
        {!lite && (
          <filter id={ctx.id('glowSoft')} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {auraStrength > 0 && (
        <g className={animated ? 'cr-aura' : undefined} style={{ transformOrigin: '100px 110px' }}>
          <circle cx={100} cy={110} r={88} fill={ctx.url('aura')} opacity={auraStrength} />
          {g.anomaly && <circle cx={100} cy={108} r={84} fill="none" stroke={ctx.url('anomaly')} strokeWidth={2} strokeDasharray="6 10" opacity={0.8} className={animated ? 'cr-spin' : undefined} style={{ transformOrigin: '100px 108px' }} />}
        </g>
      )}

      {shadow && (
        <ellipse
          className={animated && a.floats ? 'cr-shadow-float' : undefined}
          cx={100}
          cy={GROUND + 4}
          rx={a.floats ? 38 : 58 * g.size * a.fit}
          ry={a.floats ? 6 : 8}
          fill={ctx.url('shadowGrad')}
          opacity={silhouette ? 0.5 : 0.85}
          style={{ transformOrigin: `100px ${GROUND + 4}px` }}
        />
      )}

      <g transform={root}>
        <g className={animated ? `cr-idle cr-idle-${mood} ${a.floats ? 'cr-float' : ''}` : undefined} style={{ transformOrigin: `100px ${GROUND}px` }}>
          <Wisps x={ctx} />
          {/* 1. One joined silhouette outline under the whole torso (removes seams between neck, segments and body). */}
          {joined && (
            <g className={breatheCls} style={breatheStyle}>
              {a.neck && <path d={a.neck} fill={c.outline} stroke={c.outline} strokeWidth={4.6} strokeLinejoin="round" />}
              {a.shapes.map((s, i) => (
                <ShapeEl key={i} s={s} fill={c.outline} stroke={c.outline} strokeWidth={4.6} strokeLinejoin="round" />
              ))}
            </g>
          )}
          {/* 2. Parts that grow out from behind the body. */}
          <Tail x={ctx} />
          {far.map((h, i) => (
            <Limb key={`f${i}`} x={ctx} hip={h} i={i} />
          ))}
          {extraHips.filter((h) => h.far).map((h, i) => (
            <Limb key={`ef${i}`} x={extraCtx} hip={h} i={i + 5} scale={0.85} />
          ))}
          {hasWings && <Wing x={ctx} far />}
          {tuck && <Wing x={ctx} far={false} />}
          <BehindBack x={ctx} />
          {underBody && nearLimbs}
          {extraUnder && extraNear}
          {/* 3. Body fills, shading and surface detail. */}
          <g className={breatheCls} style={breatheStyle}>
            {a.neck && <path d={a.neck} fill={ctx.url('body')} stroke={joined ? 'none' : c.outline} strokeWidth={2} strokeLinejoin="round" />}
            {a.shapes.map((s, i) => (
              <g key={i}>
                <ShapeEl s={s} fill={ctx.url('body')} fillOpacity={g.texture === 'glassy' && !silhouette ? 0.82 : 1} stroke={joined ? 'none' : c.outline} strokeWidth={2.2} strokeLinejoin="round" />
                {/* Soft crease keeps overlapping segments readable once inner outlines are gone. */}
                {segmented && i > 0 && !silhouette && <ShapeEl s={s} fill="none" stroke={c.crease} strokeWidth={1.4} />}
              </g>
            ))}
            {!silhouette && (
              <g clipPath={ctx.url('clip')}>
                <ellipse cx={a.torso.cx + a.torso.rx * 0.1} cy={a.torso.cy + a.torso.ry * 0.62} rx={a.torso.rx * 0.75} ry={a.torso.ry * 0.5} fill={c.secLight} opacity={g.body === 'jelly' ? 0.25 : 0.45} />
              </g>
            )}
            <Pattern x={ctx} />
            <Texture x={ctx} />
            {!silhouette && (
              <g clipPath={ctx.url('clip')}>
                <ellipse cx={a.torso.cx - a.torso.rx * 0.25} cy={a.torso.cy - a.torso.ry * 0.55} rx={a.torso.rx * 0.45} ry={a.torso.ry * 0.2} fill="#fff" opacity={g.texture === 'glassy' ? 0.4 : 0.14} />
                {/* Rim light: ambient lab light catching the top-right edge. */}
                {a.shapes.map((s, i) => (
                  <ShapeEl key={`rim${i}`} s={s} fill="none" stroke={ctx.url('rimGrad')} strokeWidth={3.4} />
                ))}
              </g>
            )}
            {g.back === 'shell' && <Shell x={ctx} />}
            <BodyMutations x={ctx} />
          </g>
          {/* 4. Parts in front of the body. */}
          {!underBody && nearLimbs}
          {!extraUnder && extraNear}
          {hasWings && !tuck && <Wing x={ctx} far={false} />}
          <Head x={ctx} />
        </g>
      </g>
      <ElementFx x={ctx} />
      {title && <title>{title}</title>}
    </svg>
  );
}

export const CreatureSVG = memo(CreatureSVGInner);
export default CreatureSVG;
