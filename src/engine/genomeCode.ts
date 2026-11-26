// Genome share codes: compact byte packing -> base64url, with a checksum.
// Format: WS1-<base64url>. Encodes the full genome, stage and name so imports are exact.
import { clamp, hashSeed } from './rng';
import {
  BACKS,
  BODIES,
  ELEMENTS,
  EYES,
  HEADS,
  LIMBS,
  MOUTHS,
  MUTATIONS,
  PATTERNS,
  PERSONALITIES,
  TAILS,
  TEXTURES,
  type Genome,
  type HSL,
  type Stage,
} from './types';

const PREFIX = 'WS1-';

function toB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const scaleByte = (v: number) => clamp(Math.round(v * 100) - 50, 0, 255);
const byteScale = (b: number) => (b + 50) / 100;

export interface DecodedGenome {
  genome: Genome;
  stage: Stage;
  name: string;
}

export function encodeGenome(g: Genome, stage: Stage, name: string): string {
  const bytes: number[] = [];
  const seed = g.seed >>> 0;
  bytes.push((seed >>> 24) & 255, (seed >>> 16) & 255, (seed >>> 8) & 255, seed & 255);
  bytes.push(
    BODIES.indexOf(g.body),
    HEADS.indexOf(g.head),
    BACKS.indexOf(g.back),
    LIMBS.indexOf(g.limbs),
    g.limbPairs,
    TAILS.indexOf(g.tail),
    PATTERNS.indexOf(g.pattern),
    TEXTURES.indexOf(g.texture),
    EYES.indexOf(g.eyes),
    MOUTHS.indexOf(g.mouth),
    ELEMENTS.indexOf(g.element),
    PERSONALITIES.indexOf(g.personality),
  );
  const col = (c: HSL) => bytes.push(Math.round(c.h / 2) % 180, Math.round(c.s), Math.round(c.l));
  col(g.primary);
  col(g.secondary);
  col(g.accent);
  bytes.push(scaleByte(g.size), scaleByte(g.girth), scaleByte(g.height), scaleByte(g.headScale), Math.round((g.asym + 1) * 100));
  bytes.push(g.potential, (g.anomaly ? 1 : 0) | (stage << 1));
  let mask = 0;
  for (const m of g.mutations) mask |= 1 << MUTATIONS.indexOf(m);
  bytes.push((mask >>> 8) & 255, mask & 255);
  const nameBytes = new TextEncoder().encode(name.slice(0, 20));
  bytes.push(nameBytes.length, ...nameBytes);
  const check = hashSeed(bytes.join(',')) & 255;
  bytes.push(check);
  return PREFIX + toB64Url(new Uint8Array(bytes));
}

export function decodeGenome(code: string): DecodedGenome {
  const trimmed = code.trim();
  // Accept raw codes or remix links containing #g=CODE
  const match = trimmed.match(/WS1-[A-Za-z0-9_-]+/);
  if (!match) throw new Error('Not a WILDSHIFT genome code');
  const bytes = fromB64Url(match[0].slice(PREFIX.length));
  if (bytes.length < 35) throw new Error('Genome code is too short');
  const body = Array.from(bytes.slice(0, bytes.length - 1));
  const check = hashSeed(body.join(',')) & 255;
  if (check !== bytes[bytes.length - 1]) throw new Error('Genome code checksum failed');
  let i = 0;
  const next = () => bytes[i++];
  const seed = ((next() << 24) | (next() << 16) | (next() << 8) | next()) >>> 0;
  const at = <T,>(arr: readonly T[], idx: number): T => {
    if (idx < 0 || idx >= arr.length) throw new Error('Genome code has unknown genes');
    return arr[idx];
  };
  const bodyT = at(BODIES, next());
  const head = at(HEADS, next());
  const back = at(BACKS, next());
  const limbs = at(LIMBS, next());
  const limbPairs = clamp(next(), 1, 3);
  const tail = at(TAILS, next());
  const pattern = at(PATTERNS, next());
  const texture = at(TEXTURES, next());
  const eyes = at(EYES, next());
  const mouth = at(MOUTHS, next());
  const element = at(ELEMENTS, next());
  const personality = at(PERSONALITIES, next());
  const col = (): HSL => ({ h: next() * 2, s: clamp(next(), 0, 100), l: clamp(next(), 0, 100) });
  const primary = col();
  const secondary = col();
  const accent = col();
  const size = byteScale(next());
  const girth = byteScale(next());
  const height = byteScale(next());
  const headScale = byteScale(next());
  const asym = next() / 100 - 1;
  const potential = clamp(next(), 1, 5);
  const flags = next();
  const anomaly = (flags & 1) === 1;
  const stage = clamp(flags >> 1, 1, 3) as Stage;
  const mask = (next() << 8) | next();
  const mutations = MUTATIONS.filter((_, idx) => (mask & (1 << idx)) !== 0);
  const nameLen = next();
  const name = new TextDecoder().decode(bytes.slice(i, i + nameLen)) || 'Unknown';
  return {
    genome: {
      seed, body: bodyT, head, back, limbs, limbPairs, tail, pattern, texture, eyes, mouth,
      primary, secondary, accent, element, personality,
      size: clamp(size, 0.7, 1.4), girth: clamp(girth, 0.7, 1.4), height: clamp(height, 0.7, 1.4), headScale: clamp(headScale, 0.7, 1.4),
      asym: clamp(asym, -1, 1), potential, mutations, anomaly,
    },
    stage,
    name,
  };
}

export function remixLink(code: string): string {
  const base = typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : '';
  return `${base}#g=${code}`;
}
