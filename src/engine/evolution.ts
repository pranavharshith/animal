// Evolution engine: experience-driven anatomy changes with readable reasons.
import { ranked, shares } from './behaviour';
import { ELEMENT_INFO, ENV_INFO, MUTATION_INFO, PERSONALITY_INFO } from './data';
import { shardsToEvolve, xpToEvolve } from './genetics';
import { clamp, hashSeed, lerpHue, mulberry32, weighted } from './rng';
import {
  ENVIRONMENTS,
  MUTATIONS,
  type Creature,
  type EnvironmentId,
  type EvolutionChange,
  type EvolutionResult,
  type Genome,
  type MutationId,
  type Personality,
} from './types';

export function canEvolve(c: Creature, shards: number): { ok: boolean; reason: string } {
  if (c.stage >= 3) return { ok: false, reason: 'Final form reached' };
  const need = xpToEvolve(c.stage);
  if (c.xp < need) return { ok: false, reason: `Needs ${need - c.xp} more Evolution XP` };
  const cost = shardsToEvolve(c.stage);
  if (shards < cost) return { ok: false, reason: `Needs ${cost} Mutation Shards` };
  return { ok: true, reason: 'Ready to evolve' };
}

export function mostExposed(c: Creature): { env: EnvironmentId; runs: number } | null {
  let best: EnvironmentId | null = null;
  let runs = 0;
  for (const e of ENVIRONMENTS) {
    if (c.exposure[e] > runs) {
      best = e;
      runs = c.exposure[e];
    }
  }
  return best ? { env: best, runs } : null;
}

/** Which mutations a creature is drifting toward, for UI hints. */
export function mutationAffinity(c: Creature): Array<{ id: MutationId; score: number }> {
  const t = c.tendencies;
  const scores: Record<MutationId, number> = {} as Record<MutationId, number>;
  for (const m of MUTATIONS) scores[m] = 1;
  scores.shell_plates += t.defensive * 0.12;
  scores.frost_spikes += t.defensive * 0.05;
  scores.extra_limbs += t.agile * 0.08 + t.adaptive * 0.04;
  scores.great_wings += t.agile * 0.1;
  scores.element_tail += t.aggressive * 0.1;
  scores.heat_cracks += t.aggressive * 0.05;
  scores.sensor_stalks += t.curious * 0.12;
  scores.third_eye += t.curious * 0.08;
  scores.glow_markings += t.curious * 0.04 + t.adaptive * 0.06;
  scores.crystal_crown += c.genome.potential * 0.8;
  for (const e of ENVIRONMENTS) {
    for (const m of ENV_INFO[e].mutations) scores[m] += c.exposure[e] * 2.2;
  }
  for (const m of MUTATIONS) {
    const el = MUTATION_INFO[m].element;
    if (el && el === c.genome.element) scores[m] += 3;
    if (el && el !== c.genome.element && !ENVIRONMENTS.some((e) => ENV_INFO[e].element === el && c.exposure[e] > 0)) scores[m] *= 0.3;
  }
  return MUTATIONS.filter((m) => !c.genome.mutations.includes(m))
    .map((id) => ({ id, score: scores[id] }))
    .sort((a, b) => b.score - a.score);
}

function pct(c: Creature, p: Personality): number {
  return Math.round(shares(c.tendencies)[p] * 100);
}

export function evolve(c: Creature): EvolutionResult {
  const rng = mulberry32(hashSeed(c.genome.seed, c.stage, c.expeditions, 'evolve'));
  const g: Genome = { ...c.genome, mutations: [...c.genome.mutations], primary: { ...c.genome.primary }, secondary: { ...c.genome.secondary }, accent: { ...c.genome.accent } };
  const changes: EvolutionChange[] = [];
  const nextStage = (c.stage + 1) as 2 | 3;
  const [[dom], [second]] = ranked(c.tendencies);
  const domName = PERSONALITY_INFO[dom].name;

  // 1. Growth
  g.size = clamp(g.size + 0.07, 0.85, 1.3);
  changes.push({ label: `Stage ${nextStage} growth`, reason: `${c.xp} Evolution XP across ${c.expeditions} expeditions matured its tissue.` });

  // 2. Behaviour-driven anatomy
  const why = `${domName} behaviour made up ${pct(c, dom)}% of its temperament.`;
  switch (dom) {
    case 'aggressive':
      if (g.mouth !== 'fangs') {
        g.mouth = g.body === 'arthropod' ? 'mandibles' : 'fangs';
        changes.push({ label: g.mouth === 'fangs' ? 'Grew fangs' : 'Grew mandibles', reason: why });
      }
      if (g.head !== 'horns' && rng() < 0.6) {
        g.head = 'horns';
        changes.push({ label: 'Sprouted horns', reason: 'Repeated head-on attacks hardened its skull.' });
      } else {
        g.headScale = clamp(g.headScale + 0.12, 0.8, 1.35);
        changes.push({ label: 'Heavier skull', reason: 'Repeated head-on attacks hardened its skull.' });
      }
      break;
    case 'defensive':
      g.girth = clamp(g.girth + 0.1, 0.85, 1.3);
      if (g.back !== 'shell') {
        g.back = 'shell';
        changes.push({ label: 'Grew a carapace', reason: why });
      } else {
        changes.push({ label: 'Thickened body', reason: why });
      }
      break;
    case 'curious':
      g.eyes = g.eyes === 'triple' ? 'cluster' : 'triple';
      changes.push({ label: g.eyes === 'cluster' ? 'Eye cluster opened' : 'Third eye pair opened', reason: `${why} It kept investigating everything.` });
      if (g.head === 'round' || g.head === 'beak') {
        g.head = 'antennae';
        changes.push({ label: 'Antennae emerged', reason: 'It learned to taste the air of unknown places.' });
      }
      break;
    case 'agile':
      g.height = clamp(g.height + 0.08, 0.85, 1.3);
      if (g.back === 'membrane_wings' || g.back === 'insect_wings') {
        if (!g.mutations.includes('great_wings')) g.mutations.push('great_wings');
        changes.push({ label: 'Wings doubled in span', reason: why });
      } else {
        g.back = 'insect_wings';
        changes.push({ label: 'Gossamer wings unfurled', reason: `${why} Constant dodging demanded lift.` });
      }
      if (g.limbs === 'stout') {
        g.limbs = 'spindly';
        changes.push({ label: 'Lighter legs', reason: 'Speed mattered more than weight.' });
      }
      break;
    case 'adaptive': {
      const top = mostExposed(c);
      const targetEl = top ? ENV_INFO[top.env].element : g.element;
      const target = ELEMENT_INFO[targetEl];
      g.secondary = { h: lerpHue(g.secondary.h, hueOf(target.color), 0.7), s: clamp(g.secondary.s + 10, 30, 100), l: g.secondary.l };
      if (g.tail === 'none') g.tail = 'fan';
      changes.push({ label: `Colouring shifted toward ${target.name}`, reason: `${why} It mirrored the places it survived.` });
      break;
    }
  }

  // 3. Environment-driven mutation (the "it has a history" part)
  const top = mostExposed(c);
  const affinity = mutationAffinity({ ...c, genome: g });
  const maxMutations = nextStage === 2 ? 3 : 5;
  let pickedEnv: MutationId | null = null;
  if (top) {
    const envMuts = ENV_INFO[top.env].mutations.filter((m) => !g.mutations.includes(m));
    if (envMuts.length && g.mutations.length < maxMutations) {
      pickedEnv = weighted(rng, envMuts, (m) => affinity.find((a) => a.id === m)?.score ?? 1);
      g.mutations.push(pickedEnv);
      changes.push({ label: MUTATION_INFO[pickedEnv].name, reason: `Adapted to ${ENV_INFO[top.env].name} after ${top.runs} expedition${top.runs > 1 ? 's' : ''}: ${ENV_INFO[top.env].adaptation}.` });
    }
  }

  // 4. Secondary personality mutation from affinity
  const remaining = affinity.filter((a) => a.id !== pickedEnv && !g.mutations.includes(a.id));
  if (remaining.length && g.mutations.length < maxMutations && (nextStage === 3 || rng() < 0.55)) {
    const m = weighted(rng, remaining.slice(0, 5), (a) => a.score).id;
    g.mutations.push(m);
    changes.push({ label: MUTATION_INFO[m].name, reason: `${PERSONALITY_INFO[second].name} instincts (${pct(c, second)}%) unlocked a latent gene.` });
  }

  // 5. Final form flourish
  if (nextStage === 3) {
    if (!g.mutations.includes('crystal_crown') && g.potential >= 4) {
      g.mutations.push('crystal_crown');
      changes.push({ label: 'Crystal Crown', reason: `High evolution potential (${g.potential}/5) crystallised into a crown.` });
    }
    if (g.tail === 'none') {
      g.tail = 'plume';
      changes.push({ label: 'Plume tail', reason: 'Final forms grow a balancing tail.' });
    }
    g.potential = clamp(g.potential + 1, 1, 5);
  }

  const after: Creature = {
    ...c,
    genome: g,
    stage: nextStage,
    xp: 0,
    history: [
      ...c.history,
      { at: Date.now(), kind: 'evolution', text: `Evolved to stage ${nextStage}: ${changes.slice(1).map((ch) => ch.label).join(', ') || 'grew larger'}.` },
    ],
  };
  return { before: c, after, changes };
}

function hueOf(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const gg = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, gg, b);
  const min = Math.min(r, gg, b);
  if (max === min) return 0;
  const d = max - min;
  let h = 0;
  if (max === r) h = ((gg - b) / d) % 6;
  else if (max === gg) h = (b - r) / d + 2;
  else h = (r - gg) / d + 4;
  return (h * 60 + 360) % 360;
}
