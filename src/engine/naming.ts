// Procedural creature names: element-flavoured syllables + shape-flavoured suffixes.
import { hashSeed, mulberry32, pick } from './rng';
import type { BodyType, Element } from './types';

const PREFIX: Record<Element, string[]> = {
  ember: ['Pyr', 'Cind', 'Sco', 'Ash', 'Brai', 'Vul', 'Ign', 'Kel'],
  tide: ['Mar', 'Nau', 'Thal', 'Bry', 'Ondu', 'Ael', 'Pel', 'Syl'],
  bloom: ['Fen', 'Ver', 'Myc', 'Lum', 'Sporo', 'Tha', 'Ivi', 'Moss'],
  volt: ['Zap', 'Ark', 'Kilo', 'Ozo', 'Vex', 'Tesl', 'Jolt', 'Ion'],
  frost: ['Gla', 'Riv', 'Kry', 'Hoar', 'Nev', 'Ise', 'Bor', 'Sil'],
  shadow: ['Nyx', 'Umb', 'Vel', 'Mor', 'Eclo', 'Noc', 'Duva', 'Shae'],
};

const MIDDLE = ['', '', 'a', 'i', 'o', 'u', 'ae', 'ri', 'lo', 'mi', 'ze', 'ka', 'th', 'vy'];

const SUFFIX: Record<BodyType, string[]> = {
  orb: ['bub', 'pod', 'mote', 'lin', 'puff', 'orb'],
  serpent: ['wyrm', 'coil', 'eel', 'ssa', 'thrax', 'lisk'],
  quadruped: ['hound', 'paw', 'lux', 'tusk', 'mane', 'rook'],
  avian: ['wing', 'kite', 'rax', 'finch', 'plume', 'ter'],
  arthropod: ['mite', 'pede', 'scar', 'chit', 'nid', 'ix'],
  jelly: ['medu', 'drift', 'ula', 'gel', 'bell', 'sae'],
};

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function generateName(seed: number, element: Element, body: BodyType): string {
  const rng = mulberry32(hashSeed(seed, 'name'));
  const raw = pick(rng, PREFIX[element]) + pick(rng, MIDDLE) + pick(rng, SUFFIX[body]);
  // collapse triple letters and awkward doubles
  return cap(raw.replace(/(.)\1\1+/g, '$1$1'));
}

/** Fusion names splice the front of one parent with the back of the other. */
export function fusionName(seed: number, a: string, b: string, element: Element, body: BodyType): string {
  const rng = mulberry32(hashSeed(seed, 'fname', a, b));
  if (rng() < 0.35) return generateName(seed, element, body);
  const cutA = Math.max(2, Math.ceil(a.length * (0.4 + rng() * 0.2)));
  const cutB = Math.max(2, Math.floor(b.length * (0.4 + rng() * 0.2)));
  const front = a.slice(0, cutA);
  const back = b.slice(b.length - cutB).toLowerCase();
  const joiner = /[aeiouy]$/i.test(front) || /^[aeiouy]/i.test(back) ? '' : pick(rng, ['a', 'o', 'i', 'e']);
  let name = cap(front + joiner + back);
  if (name.length > 11) name = name.slice(0, 11);
  if (name.toLowerCase() === a.toLowerCase() || name.toLowerCase() === b.toLowerCase()) {
    return generateName(seed, element, body);
  }
  return name;
}

export const EPITHETS: Record<string, string[]> = {
  aggressive: ['the Fierce', 'Fangborn', 'the Relentless'],
  defensive: ['the Bulwark', 'Stonehide', 'the Patient'],
  curious: ['the Seeker', 'Wanderer', 'the Inquisitive'],
  agile: ['the Swift', 'Quickshade', 'the Untouched'],
  adaptive: ['the Shifting', 'Manyform', 'the Unbound'],
};
