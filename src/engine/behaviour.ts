// Behaviour model: tendencies, dominance, and personality-driven auto-actions.
import { clamp, type Rng } from './rng';
import { PERSONALITIES, type ExpeditionLog, type Personality, type Tendencies } from './types';

export function baseTendencies(bias: Personality, rng: Rng): Tendencies {
  const t = {} as Tendencies;
  for (const p of PERSONALITIES) t[p] = Math.round(8 + rng() * 10);
  t[bias] += 22;
  return t;
}

export function dominant(t: Tendencies): Personality {
  let best: Personality = 'adaptive';
  let bestV = -1;
  for (const p of PERSONALITIES) {
    if (t[p] > bestV) {
      best = p;
      bestV = t[p];
    }
  }
  return best;
}

/** Sorted [personality, value] descending. */
export function ranked(t: Tendencies): Array<[Personality, number]> {
  return PERSONALITIES.map((p) => [p, t[p]] as [Personality, number]).sort((a, b) => b[1] - a[1]);
}

/** Normalised share 0..1 for display bars. */
export function shares(t: Tendencies): Tendencies {
  const total = PERSONALITIES.reduce((s, p) => s + t[p], 0) || 1;
  const out = {} as Tendencies;
  for (const p of PERSONALITIES) out[p] = t[p] / total;
  return out;
}

/**
 * Convert what happened in an expedition into personality drift.
 * Kept readable: each action type nudges exactly one tendency.
 */
export function tendencyDelta(log: ExpeditionLog, envVisitsBefore: number, distinctEnvs: number): Partial<Tendencies> {
  const d: Partial<Tendencies> = {};
  d.aggressive = Math.min(14, log.attacks * 0.7 + log.specials * 1.5);
  d.agile = Math.min(14, log.dodges * 1.1 + log.perfectDodges * 2);
  d.defensive = Math.min(14, log.braces * 1.5 + log.hitsTaken * 0.6 + (log.lowHpSurvived ? 6 : 0));
  d.curious = Math.min(14, log.investigations * 2 + (envVisitsBefore === 0 ? 8 : 1));
  d.adaptive = Math.min(14, distinctEnvs >= 2 ? 3 + distinctEnvs * 2 : 1);
  for (const k of Object.keys(d) as Personality[]) d[k] = Math.round(d[k]!);
  return d;
}

export function applyDelta(t: Tendencies, d: Partial<Tendencies>): Tendencies {
  const out = { ...t };
  for (const p of PERSONALITIES) out[p] = clamp(Math.round(out[p] + (d[p] ?? 0)), 0, 100);
  return out;
}

export type AutoAction = 'attack' | 'dodge' | 'brace' | 'investigate' | 'mimic';

/** What the creature does on its own when the player is idle. */
export function autoActionFor(t: Tendencies, enemyWindingUp: boolean, rng: Rng): AutoAction {
  const p = dominant(t);
  if (enemyWindingUp) {
    if (p === 'agile') return 'dodge';
    if (p === 'defensive') return 'brace';
    if (p === 'adaptive') return rng() < 0.5 ? 'dodge' : 'brace';
  }
  switch (p) {
    case 'aggressive':
      return 'attack';
    case 'curious':
      return rng() < 0.55 ? 'investigate' : 'attack';
    case 'adaptive':
      return rng() < 0.3 ? 'mimic' : 'attack';
    case 'defensive':
      return rng() < 0.35 ? 'brace' : 'attack';
    case 'agile':
    default:
      return 'attack';
  }
}
