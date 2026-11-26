// Colour harmony: 60-30-10 rule for procedural organisms.
// 60% primary: rich mid-tone. 30% secondary: analogous tint/shade. 10% accent: vivid bioluminescent pop.
// Anomalies are always exempt so their "impossible" palettes stay intact.
import { clamp, lerp, lerpHue } from './rng';
import type { Genome, HSL } from './types';

/** Signed shortest hue distance from a to b, in degrees (-180..180). */
export function hueDelta(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

export interface Trio {
  primary: HSL;
  secondary: HSL;
  accent: HSL;
}

/** The fully harmonised palette (idempotent: harmonising twice changes nothing). */
export function harmonize({ primary, secondary, accent }: Trio): Trio {
  const P: HSL = { h: primary.h, s: clamp(primary.s, 42, 78), l: clamp(primary.l, 36, 58) };
  const d = clamp(hueDelta(P.h, secondary.h), -38, 38);
  const S: HSL = { h: (P.h + d + 360) % 360, s: clamp(secondary.s, 30, 76), l: clamp(secondary.l, 26, 80) };
  // Keep the secondary readable against the primary (belly, fins, membranes).
  if (Math.abs(S.l - P.l) < 12) S.l = clamp(P.l + (P.l < 54 ? 16 : -16), 26, 80);
  const A: HSL = { h: accent.h, s: clamp(Math.max(accent.s, 86), 0, 100), l: clamp(accent.l, 58, 74) };
  return { primary: P, secondary: S, accent: A };
}

function mix(a: HSL, b: HSL, t: number): HSL {
  return { h: lerpHue(a.h, b.h, t), s: lerp(a.s, b.s, t), l: lerp(a.l, b.l, t) };
}

/** Apply the rule at creation time (stored in the genome, so share codes stay exact). */
export function harmonizeGenome<T extends Pick<Genome, 'primary' | 'secondary' | 'accent' | 'anomaly'>>(g: T): T {
  if (g.anomaly) return g;
  return { ...g, ...harmonize(g) };
}

/** Gentle draw-time tidy-up for organisms created before the rule existed. Skips anomalies. */
export function displayColors(g: Pick<Genome, 'primary' | 'secondary' | 'accent' | 'anomaly'>, strength = 0.65): Trio {
  const raw = { primary: g.primary, secondary: g.secondary, accent: g.accent };
  if (g.anomaly) return raw;
  const h = harmonize(raw);
  return { primary: mix(raw.primary, h.primary, strength), secondary: mix(raw.secondary, h.secondary, strength), accent: mix(raw.accent, h.accent, strength) };
}
