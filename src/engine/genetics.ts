// Genome generation, derived stats, rarity and species identity.
import { baseTendencies, dominant } from './behaviour';
import { ELEMENT_PALETTES, GENE_RARITY, MUTATION_INFO, PALETTES } from './data';
import { generateName } from './naming';
import { chance, clamp, hashSeed, int, mulberry32, pick, range, uid, weighted, type Rng } from './rng';
import {
  BODIES,
  ELEMENTS,
  ENVIRONMENTS,
  EYES,
  HEADS,
  MOUTHS,
  PATTERNS,
  PERSONALITIES,
  TEXTURES,
  type BackType,
  type BodyType,
  type Creature,
  type CreatureOrigin,
  type Element,
  type EnvironmentId,
  type Exposure,
  type Genome,
  type HSL,
  type LimbType,
  type Rarity,
  type Stats,
  type TailType,
} from './types';

interface Anatomy {
  limbs: LimbType[];
  pairs: [number, number];
  back: BackType[];
  tail: TailType[];
}

/** Body plans keep wild organisms anatomically plausible. */
export const BODY_PLANS: Record<BodyType, Anatomy> = {
  orb: { limbs: ['none', 'stout', 'spindly', 'tentacles'], pairs: [1, 1], back: ['none', 'membrane_wings', 'insect_wings', 'spines', 'dorsal_fin'], tail: ['none', 'whip', 'plume', 'fan'] },
  serpent: { limbs: ['none', 'fins', 'none'], pairs: [1, 1], back: ['dorsal_fin', 'spines', 'none', 'membrane_wings'], tail: ['whip', 'fan', 'club'] },
  quadruped: { limbs: ['stout', 'spindly', 'stout'], pairs: [2, 2], back: ['none', 'spines', 'shell', 'membrane_wings'], tail: ['whip', 'club', 'plume', 'fan'] },
  avian: { limbs: ['spindly', 'stout'], pairs: [1, 1], back: ['membrane_wings', 'insect_wings', 'membrane_wings'], tail: ['fan', 'plume', 'whip'] },
  arthropod: { limbs: ['spindly'], pairs: [3, 3], back: ['shell', 'insect_wings', 'spines'], tail: ['none', 'whip', 'club'] },
  jelly: { limbs: ['tentacles'], pairs: [2, 3], back: ['none', 'dorsal_fin', 'none'], tail: ['none'] },
};

const ELEMENT_BODY_BIAS: Record<Element, Partial<Record<BodyType, number>>> = {
  ember: { quadruped: 3, serpent: 2, arthropod: 2 },
  tide: { jelly: 3, serpent: 3, orb: 1 },
  bloom: { orb: 3, quadruped: 2, arthropod: 2 },
  volt: { avian: 3, arthropod: 2, orb: 2 },
  frost: { avian: 2, quadruped: 3, jelly: 1 },
  shadow: { jelly: 2, serpent: 2, avian: 2 },
};

function jitterColor(rng: Rng, c: HSL, amt: number): HSL {
  return {
    h: (c.h + range(rng, -amt, amt) + 360) % 360,
    s: clamp(c.s + range(rng, -amt / 2, amt / 2), 25, 100),
    l: clamp(c.l + range(rng, -amt / 2, amt / 2), 22, 85),
  };
}

export interface WildOptions {
  element?: Element;
  body?: BodyType;
  /** Probability multiplier for rare genes (1 = normal). */
  rareBias?: number;
}

/** Deterministic wild genome: same seed + options => same organism. */
export function genomeFromSeed(seed: number, opts: WildOptions = {}): Genome {
  const rng = mulberry32(hashSeed(seed, 'genome'));
  const rareBias = opts.rareBias ?? 1;
  const element = opts.element ?? pick(rng, ELEMENTS);
  const bodyBias = ELEMENT_BODY_BIAS[element];
  const body = opts.body ?? weighted(rng, BODIES, (b) => (bodyBias[b] ?? 1) / (1 + (GENE_RARITY[`body:${b}`] ?? 0) / rareBias));
  const plan = BODY_PLANS[body];
  const paletteIdx = rng() < 0.75 ? pick(rng, ELEMENT_PALETTES[element]) : int(rng, 0, PALETTES.length - 1);
  const pal = PALETTES[paletteIdx];
  const rareWeight = (key: string) => 1 / (1 + (GENE_RARITY[key] ?? 0) * 1.5 / rareBias);

  let back = pick(rng, plan.back);
  let limbs = pick(rng, plan.limbs);
  if (element === 'tide' && rng() < 0.4) back = 'dorsal_fin';
  if (element === 'tide' && body !== 'jelly' && rng() < 0.3) limbs = 'fins';
  if (element === 'volt' && body !== 'jelly' && rng() < 0.25) back = 'insect_wings';

  return {
    seed: seed >>> 0,
    body,
    head: weighted(rng, HEADS, (h) => rareWeight(`head:${h}`)),
    back,
    limbs,
    limbPairs: int(rng, plan.pairs[0], plan.pairs[1]),
    tail: pick(rng, plan.tail),
    pattern: weighted(rng, PATTERNS, (p) => rareWeight(`pattern:${p}`)),
    texture: weighted(rng, TEXTURES, (t) => rareWeight(`texture:${t}`)),
    eyes: weighted(rng, EYES, (e) => (e === 'pair' ? 3 : 1) * rareWeight(`eyes:${e}`)),
    mouth: pick(rng, MOUTHS),
    primary: jitterColor(rng, pal.primary, 16),
    secondary: jitterColor(rng, pal.secondary, 18),
    accent: jitterColor(rng, pal.accent, 12),
    element,
    personality: pick(rng, PERSONALITIES),
    size: range(rng, 0.9, 1.08),
    girth: range(rng, 0.88, 1.15),
    height: range(rng, 0.88, 1.12),
    headScale: range(rng, 0.85, 1.15),
    asym: range(rng, -1, 1),
    potential: int(rng, 1, 4) + (chance(rng, 0.08 * rareBias) ? 1 : 0),
    mutations: [],
    anomaly: false,
  };
}

export function emptyExposure(): Exposure {
  const e = {} as Exposure;
  for (const env of ENVIRONMENTS) e[env] = 0;
  return e;
}

export function createCreature(
  genome: Genome,
  origin: CreatureOrigin,
  opts: { name?: string; generation?: number; parentNames?: [string, string]; originEnv?: EnvironmentId; stage?: 1 | 2 | 3 } = {},
): Creature {
  const rng = mulberry32(hashSeed(genome.seed, 'tendency'));
  const name = opts.name ?? generateName(genome.seed, genome.element, genome.body);
  const now = Date.now();
  return {
    id: uid('c'),
    name,
    genome,
    stage: opts.stage ?? 1,
    generation: opts.generation ?? 0,
    parentNames: opts.parentNames,
    tendencies: baseTendencies(genome.personality, rng),
    exposure: emptyExposure(),
    xp: 0,
    expeditions: 0,
    wins: 0,
    origin,
    originEnv: opts.originEnv,
    favourite: false,
    bornAt: now,
    history: [{ at: now, kind: origin === 'fusion' ? 'fusion' : origin === 'imported' ? 'import' : 'born', text: originText(origin, name, opts.parentNames, opts.originEnv) }],
  };
}

function originText(origin: CreatureOrigin, name: string, parents?: [string, string], env?: EnvironmentId): string {
  switch (origin) {
    case 'fusion':
      return parents ? `${name} was fused from ${parents[0]} and ${parents[1]}.` : `${name} emerged from the fusion chamber.`;
    case 'starter':
      return `${name} hatched in the lab incubator.`;
    case 'wild':
      return `Genetic sample recovered from ${env ? env.replace('_', ' ') : 'the wild'}.`;
    case 'daily':
      return `${name} was captured as the daily anomaly.`;
    case 'imported':
      return `${name} was reconstructed from a shared genome code.`;
  }
}

export function speciesKey(g: Pick<Genome, 'body' | 'element'>): string {
  return `${g.body}:${g.element}`;
}

export const ALL_SPECIES: string[] = BODIES.flatMap((b) => ELEMENTS.map((e) => `${b}:${e}`));

export function computeStats(c: Creature): Stats {
  const g = c.genome;
  const stageMul = 1 + (c.stage - 1) * 0.28;
  const t = c.tendencies;
  let vigor = 60 * g.size * g.girth;
  let power = 10 + g.headScale * 3;
  let guard = 2;
  let speed = 10;
  let focus = 10;
  if (g.limbs === 'stout') { vigor += 8; guard += 1; }
  if (g.limbs === 'spindly') speed += 3;
  if (g.limbs === 'tentacles') focus += 2;
  if (g.limbs === 'fins') speed += 2;
  if (g.back === 'shell') guard += 3;
  if (g.back === 'spines') power += 2;
  if (g.back === 'membrane_wings' || g.back === 'insect_wings') speed += 3;
  if (g.tail === 'club') power += 2;
  if (g.mouth === 'fangs' || g.mouth === 'mandibles') power += 2;
  if (g.eyes === 'triple' || g.eyes === 'cluster') focus += 3;
  for (const m of g.mutations) {
    if (m === 'shell_plates' || m === 'frost_spikes') guard += 2;
    if (m === 'extra_limbs' || m === 'great_wings') speed += 2;
    if (m === 'element_tail' || m === 'heat_cracks' || m === 'storm_coils') power += 2;
    if (m === 'sensor_stalks' || m === 'third_eye' || m === 'glow_markings') focus += 2;
    if (m === 'crystal_crown' || m === 'leaf_mane' || m === 'abyssal_fins' || m === 'shadow_wisps') vigor += 10;
  }
  power += t.aggressive * 0.06;
  guard += t.defensive * 0.04;
  speed += t.agile * 0.06;
  focus += t.curious * 0.05 + t.adaptive * 0.03;
  vigor += t.defensive * 0.25;
  if (g.anomaly) { power += 2; focus += 2; }
  return {
    vigor: Math.round(vigor * stageMul),
    power: Math.round(power * stageMul),
    guard: Math.round(guard * stageMul),
    speed: Math.round(speed * (1 + (c.stage - 1) * 0.12)),
    focus: Math.round(focus * (1 + (c.stage - 1) * 0.15)),
  };
}

export function rarityScore(g: Genome, stage: number): number {
  let score = 0;
  const genes: Array<[string, string]> = [
    ['body', g.body], ['head', g.head], ['back', g.back], ['limbs', g.limbs], ['tail', g.tail],
    ['eyes', g.eyes], ['pattern', g.pattern], ['texture', g.texture],
  ];
  for (const [k, v] of genes) score += GENE_RARITY[`${k}:${v}`] ?? 0;
  for (const m of g.mutations) score += MUTATION_INFO[m].rarity;
  score += (stage - 1) * 1.5;
  if (g.potential >= 5) score += 1.5;
  return score;
}

export function computeRarity(g: Genome, stage: number): Rarity {
  if (g.anomaly) return 'anomaly';
  const s = rarityScore(g, stage);
  if (s < 2) return 'common';
  if (s < 4.5) return 'unusual';
  if (s < 8) return 'rare';
  return 'exotic';
}

export const RARITY_RANK: Record<Rarity, number> = { common: 0, unusual: 1, rare: 2, exotic: 3, anomaly: 4 };

export function creatureRarity(c: Creature): Rarity {
  return computeRarity(c.genome, c.stage);
}

export function creaturePersonality(c: Creature) {
  return dominant(c.tendencies);
}

export function xpToEvolve(stage: number): number {
  return stage === 1 ? 80 : stage === 2 ? 200 : Infinity;
}

export function shardsToEvolve(stage: number): number {
  return stage === 1 ? 2 : stage === 2 ? 4 : Infinity;
}

/** Starter organisms: chosen seeds that produce contrasting, appealing silhouettes. */
export function starterGenomes(): [Genome, Genome] {
  const a = genomeFromSeed(0x5eed01, { element: 'ember', body: 'quadruped' });
  const b = genomeFromSeed(0x7ade02, { element: 'tide', body: 'jelly' });
  a.back = 'spines';
  a.tail = 'plume';
  a.limbs = 'stout';
  a.head = 'horns';
  a.eyes = 'pair';
  a.mouth = 'smile';
  a.personality = 'aggressive';
  a.pattern = 'stripes';
  a.primary = { h: 16, s: 84, l: 55 };
  a.secondary = { h: 38, s: 92, l: 60 };
  a.accent = { h: 50, s: 100, l: 66 };
  b.primary = { h: 196, s: 76, l: 54 };
  b.secondary = { h: 252, s: 62, l: 64 };
  b.accent = { h: 168, s: 92, l: 68 };
  b.pattern = 'spots';
  b.back = 'dorsal_fin';
  b.head = 'antennae';
  b.eyes = 'pair';
  b.mouth = 'tiny';
  b.personality = 'curious';
  return [a, b];
}

/** Seed for "today's" daily anomaly. */
export function dailySeed(dateKey: string): number {
  return hashSeed('daily', dateKey);
}

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dailyGenome(dateKey: string): Genome {
  const seed = dailySeed(dateKey);
  const g = genomeFromSeed(seed, { rareBias: 2.5 });
  const rng = mulberry32(hashSeed(seed, 'daily-mut'));
  const muts = ['glow_markings', 'crystal_crown', 'third_eye', 'shadow_wisps', 'sensor_stalks'] as const;
  g.mutations = [pick(rng, muts)];
  g.potential = Math.max(g.potential, 4);
  return g;
}
