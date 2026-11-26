// Fusion engine: deterministic recombination of two genomes into a new organism.
import { BACK_LABEL, BODY_LABEL, ELEMENT_INFO, EYE_LABEL, HEAD_LABEL, LIMB_LABEL, MOUTH_LABEL, MUTATION_INFO, OPPOSED, PATTERN_LABEL, TAIL_LABEL, TEXTURE_LABEL } from './data';
import { harmonizeGenome } from './color';
import { BODY_PLANS, createCreature } from './genetics';
import { fusionName } from './naming';
import { chance, clamp, hashSeed, int, lerp, lerpHue, mulberry32, pick, range, weighted, type Rng } from './rng';
import {
  BACKS,
  ELEMENTS,
  EYES,
  HEADS,
  MOUTHS,
  MUTATIONS,
  PATTERNS,
  TAILS,
  type Creature,
  type Element,
  type FusionReport,
  type Genome,
  type HSL,
  type MutationId,
} from './types';


function blendColor(rng: Rng, a: HSL, b: HSL, drift: number): HSL {
  const t = range(rng, 0.3, 0.7);
  return {
    h: (lerpHue(a.h, b.h, t) + range(rng, -drift, drift) + 360) % 360,
    s: clamp(lerp(a.s, b.s, t) + range(rng, -6, 10), 30, 100),
    l: clamp(lerp(a.l, b.l, t) + range(rng, -6, 6), 25, 82),
  };
}

export function isOpposed(a: Element, b: Element): boolean {
  return OPPOSED.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

export function fusionSeed(a: Creature, b: Creature, count: number): number {
  return hashSeed(a.genome.seed, b.genome.seed, count, 'fuse');
}

export function fusionCost(a: Creature, b: Creature): number {
  return 20 + (a.stage - 1) * 10 + (b.stage - 1) * 10;
}

export function fuse(a: Creature, b: Creature, seed: number): FusionReport {
  const rng = mulberry32(seed);
  const A = a.genome;
  const B = b.genome;
  const inherited: FusionReport['inherited'] = [];
  const tally = { A: 0, B: 0 };

  // Dominance: the more evolved / higher potential parent passes genes slightly more often.
  const domA = 0.5 + clamp((A.potential - B.potential) * 0.04 + (a.stage - b.stage) * 0.05, -0.15, 0.15);

  function take<K extends keyof Genome>(key: K, label: string, fmt: (v: Genome[K]) => string, pool?: readonly Genome[K][]): Genome[K] {
    // 12% chance of a novel trait neither parent had (keeps fusions surprising)
    if (pool && chance(rng, 0.12)) {
      const novel = pick(rng, pool.filter((v) => v !== A[key] && v !== B[key]));
      if (novel !== undefined) {
        inherited.push({ trait: label, from: 'mutation', value: fmt(novel) });
        return novel;
      }
    }
    const fromA = rng() < domA;
    const v = fromA ? A[key] : B[key];
    tally[fromA ? 'A' : 'B']++;
    inherited.push({ trait: label, from: fromA ? 'A' : 'B', value: fmt(v) });
    return v;
  }

  // Body comes from one parent; the other parent then dominates the head for a true hybrid.
  const bodyFromA = rng() < domA;
  const body = bodyFromA ? A.body : B.body;
  inherited.push({ trait: 'Body', from: bodyFromA ? 'A' : 'B', value: BODY_LABEL[body] });
  tally[bodyFromA ? 'A' : 'B']++;
  const headParent = rng() < 0.7 ? (bodyFromA ? B : A) : bodyFromA ? A : B;
  let head = headParent.head;
  if (chance(rng, 0.12)) {
    head = pick(rng, HEADS.filter((h) => h !== A.head && h !== B.head));
    inherited.push({ trait: 'Head', from: 'mutation', value: HEAD_LABEL[head] });
  } else {
    inherited.push({ trait: 'Head', from: headParent === A ? 'A' : 'B', value: HEAD_LABEL[head] });
    tally[headParent === A ? 'A' : 'B']++;
  }

  const back = take('back', 'Back', (v) => BACK_LABEL[v], BACKS);
  let limbs = take('limbs', 'Limbs', (v) => LIMB_LABEL[v]);
  const tail = take('tail', 'Tail', (v) => TAIL_LABEL[v], TAILS);
  const pattern = take('pattern', 'Pattern', (v) => PATTERN_LABEL[v], PATTERNS);
  const texture = take('texture', 'Texture', (v) => TEXTURE_LABEL[v]);
  const eyes = take('eyes', 'Eyes', (v) => EYE_LABEL[v], EYES);
  const mouth = take('mouth', 'Mouth', (v) => MOUTH_LABEL[v], MOUTHS);
  const personality = rng() < 0.5 ? A.personality : B.personality;

  // Element
  let element: Element = rng() < domA ? A.element : B.element;
  const opposed = isOpposed(A.element, B.element);
  const anomaly = (opposed && chance(rng, 0.22)) || chance(rng, 0.035) || (A.anomaly && B.anomaly && chance(rng, 0.5));
  if (anomaly) {
    element = pick(rng, ELEMENTS.filter((e) => e !== A.element && e !== B.element));
  }
  inherited.push({ trait: 'Element', from: anomaly ? 'mutation' : element === A.element ? 'A' : 'B', value: ELEMENT_INFO[element].name });

  // Colours
  let primary = blendColor(rng, A.primary, B.primary, 24);
  let secondary = rng() < 0.5 ? blendColor(rng, A.secondary, B.primary, 18) : blendColor(rng, B.secondary, A.primary, 18);
  let accent = rng() < 0.5 ? { ...A.accent } : { ...B.accent };
  if (anomaly) {
    // Anomalies invert their palette into vivid, "impossible" colours.
    primary = { h: (primary.h + 180) % 360, s: 92, l: clamp(primary.l, 45, 62) };
    secondary = { h: (secondary.h + 150) % 360, s: 95, l: 60 };
    accent = { h: (accent.h + 90) % 360, s: 100, l: 70 };
  }
  inherited.push({ trait: 'Colour', from: 'blend', value: `hue ${Math.round(primary.h)}°` });

  // Plan-consistent limb count
  const plan = BODY_PLANS[body];
  if (body === 'jelly' && limbs !== 'tentacles' && chance(rng, 0.6)) limbs = 'tentacles';
  let limbPairs = int(rng, plan.pairs[0], plan.pairs[1]);
  if (limbs === 'tentacles' && body !== 'jelly') limbPairs = Math.max(limbPairs, 2);

  // Mutations: inherit some, maybe gain one
  const inheritedMuts = [...new Set([...A.mutations, ...B.mutations])].filter(() => rng() < 0.45);
  const potential = clamp(Math.round((A.potential + B.potential) / 2 + (chance(rng, 0.3) ? 1 : 0)), 1, 5);
  let mutation: MutationId | null = null;
  const mutChance = 0.22 + potential * 0.04 + (anomaly ? 0.5 : 0);
  if (chance(rng, mutChance)) {
    const candidates = MUTATIONS.filter((m) => !inheritedMuts.includes(m));
    mutation = weighted(rng, candidates, (m) => (MUTATION_INFO[m].element === element ? 3 : MUTATION_INFO[m].element ? 0.4 : 1));
  }
  const mutations = [...inheritedMuts, ...(mutation ? [mutation] : [])].slice(0, 3);
  if (mutation) inherited.push({ trait: 'Mutation', from: 'mutation', value: MUTATION_INFO[mutation].name });

  let genome: Genome = {
    seed,
    body,
    head,
    back,
    limbs,
    limbPairs,
    tail,
    pattern,
    texture,
    eyes,
    mouth,
    primary,
    secondary,
    accent,
    element,
    personality,
    size: clamp((A.size + B.size) / 2 + range(rng, -0.05, 0.08), 0.85, 1.15),
    girth: clamp(lerp(A.girth, B.girth, rng()) + range(rng, -0.06, 0.06), 0.85, 1.2),
    height: clamp(lerp(A.height, B.height, rng()) + range(rng, -0.06, 0.06), 0.85, 1.2),
    headScale: clamp(lerp(A.headScale, B.headScale, rng()) + range(rng, -0.08, 0.08), 0.8, 1.25),
    asym: clamp(range(rng, -1, 1), -1, 1),
    potential,
    mutations,
    anomaly,
  };

  // Never let a child look like a recolour of one parent: force a few genes from the other.
  const lopsided = tally.A === 0 || tally.B === 0 || Math.abs(tally.A - tally.B) >= 6;
  if (lopsided) {
    const other = tally.A > tally.B ? B : A;
    genome = { ...genome, head: other.head, tail: other.tail === genome.tail ? pick(rng, TAILS) : other.tail, pattern: other.pattern };
  }
  // At least one appendage for an interesting silhouette.
  if (genome.back === 'none' && genome.tail === 'none' && genome.limbs === 'none') genome.back = pick(rng, ['spines', 'membrane_wings', 'dorsal_fin'] as const);

  // 60-30-10 colour rule (anomalies keep their clashing palette).
  genome = harmonizeGenome(genome);

  const name = fusionName(seed, a.name, b.name, element, body);
  const child = createCreature(genome, 'fusion', {
    name,
    generation: Math.max(a.generation, b.generation) + 1,
    parentNames: [a.name, b.name],
  });
  // Children inherit a blend of parental temperament.
  for (const p of Object.keys(child.tendencies) as Array<keyof typeof child.tendencies>) {
    child.tendencies[p] = Math.round((child.tendencies[p] * 2 + a.tendencies[p] * 0.5 + b.tendencies[p] * 0.5) / 3);
  }
  return { child, inherited, mutation, anomaly };
}
