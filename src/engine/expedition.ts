// Expedition setup (enemies) and outcome processing (rewards, behaviour drift, samples).
import { applyDelta, tendencyDelta } from './behaviour';
import { ENV_INFO } from './data';
import { computeStats, createCreature, genomeFromSeed, speciesKey } from './genetics';
import { chance, hashSeed, mulberry32 } from './rng';
import { ENVIRONMENTS, type Creature, type EnvironmentId, type ExpeditionLog, type ExpeditionRewards, type Genome, type Stats } from './types';

export interface EnemySpec {
  genome: Genome;
  name: string;
  stats: Stats;
  /** Seconds between attacks */
  tempo: number;
  /** Wind-up telegraph duration in seconds */
  windup: number;
  /** 'brute' hits hard and slow, 'skitter' fast and weak, 'caster' charges a big blast */
  archetype: 'brute' | 'skitter' | 'caster';
}

/** Generate the wild organisms for one expedition (2 waves). Deterministic by seed. */
export function generateEnemies(env: EnvironmentId, seed: number, player: Creature): EnemySpec[] {
  const info = ENV_INFO[env];
  const ps = computeStats(player);
  const out: EnemySpec[] = [];
  const archetypes: EnemySpec['archetype'][] = ['skitter', 'brute', 'caster'];
  for (let wave = 0; wave < 2; wave++) {
    const s = hashSeed(seed, env, wave);
    const rng = mulberry32(s);
    const element = rng() < 0.8 ? info.element : undefined;
    const genome = genomeFromSeed(s, { element, rareBias: 1 + wave * 0.5 });
    const archetype = archetypes[(s >>> 3) % archetypes.length];
    // Enemy stats already derive from the player's (stage-scaled) stats, so stage adds only a little.
    const tier = 1 + wave * 0.25 + (player.stage - 1) * 0.05;
    const base = { vigor: ps.power * (7 + wave * 2.5), power: Math.max(6, ps.vigor * 0.11), guard: 1, speed: 10, focus: 10 };
    const mods = archetype === 'brute' ? { vigor: 1.25, power: 1.35, tempo: 2.6, windup: 1.05 } : archetype === 'skitter' ? { vigor: 0.8, power: 0.7, tempo: 1.6, windup: 0.7 } : { vigor: 1, power: 1.1, tempo: 2.2, windup: 1.2 };
    out.push({
      genome,
      name: `Wild ${genome.body === 'jelly' ? 'Medusoid' : genome.body.charAt(0).toUpperCase() + genome.body.slice(1)}`,
      stats: {
        vigor: Math.round(base.vigor * mods.vigor * tier * 0.9),
        power: Math.round(base.power * mods.power * tier),
        guard: base.guard,
        speed: base.speed,
        focus: base.focus,
      },
      tempo: mods.tempo,
      windup: mods.windup,
      archetype,
    });
  }
  return out;
}

export interface ExpeditionOutcome {
  creature: Creature;
  rewards: ExpeditionRewards;
}

/** Apply an expedition log to a creature and compute rewards. Pure. */
export function resolveExpedition(c: Creature, log: ExpeditionLog, discovered: string[]): ExpeditionOutcome {
  const rng = mulberry32(hashSeed(c.genome.seed, c.expeditions, log.env, 'reward'));
  const visitsBefore = c.exposure[log.env];
  const exposure = { ...c.exposure, [log.env]: visitsBefore + 1 };
  const distinctEnvs = ENVIRONMENTS.filter((e) => exposure[e] > 0).length;
  const delta = tendencyDelta(log, visitsBefore, distinctEnvs);
  const tendencies = applyDelta(c.tendencies, delta);

  // A loss still teaches something, but only if the creature actually fought (no retreat farming).
  const engaged = log.won || log.defeated > 0 || (log.durationSec >= 12 && log.attacks + log.dodges >= 6);
  const xp = log.won ? 42 + log.defeated * 6 + (log.perfectDodges > 2 ? 6 : 0) : engaged ? 14 + log.defeated * 8 : 0;
  const bio = log.won ? 22 + log.defeated * 4 : engaged ? 8 : 0;
  const shards = log.won ? 1 + (log.defeated >= 2 ? 1 : 0) + (chance(rng, 0.25) ? 1 : 0) : engaged && chance(rng, 0.3) ? 1 : 0;
  const dxp = engaged ? (log.won ? 24 : 10) + (visitsBefore === 0 ? 15 : 0) + log.investigations * 3 : 0;

  // Genetic sample: on a win, recover one defeated organism's genome.
  let sample: Creature | null = null;
  if (log.won && log.defeatedGenomes.length && chance(rng, 0.7 + log.investigations * 0.05)) {
    const picked = log.defeatedGenomes[Math.floor(rng() * log.defeatedGenomes.length)];
    // The sample is exactly the organism that was fought.
    sample = createCreature({ ...picked, mutations: [...picked.mutations] }, 'wild', { originEnv: log.env });
  }
  const newDiscoveries: string[] = [];
  if (sample) {
    const key = speciesKey(sample.genome);
    if (!discovered.includes(key)) newDiscoveries.push(key);
  }

  const creature: Creature = {
    ...c,
    tendencies,
    exposure,
    xp: c.xp + xp,
    expeditions: c.expeditions + 1,
    wins: c.wins + (log.won ? 1 : 0),
    history: [
      ...c.history,
      {
        at: Date.now(),
        kind: 'expedition',
        text: `${log.won ? 'Survived' : 'Retreated from'} ${ENV_INFO[log.env].name}: ${log.attacks} attacks, ${log.dodges} dodges${log.lowHpSurvived ? ', clung to life' : ''}.`,
      },
    ],
  };
  return { creature, rewards: { xp, bio, shards, dxp, sample, tendencyDelta: delta, newDiscoveries } };
}
