// Real-time expedition arena: a pure, framework-free combat simulation.
// The UI calls tickArena() every animation frame and maps the returned events to visuals + sound.
import { autoActionFor, dominant, type AutoAction } from './behaviour';
import { PERSONALITY_INFO, elementMultiplier } from './data';
import { generateEnemies, type EnemySpec } from './expedition';
import { computeStats } from './genetics';
import { clamp, hashSeed } from './rng';
import type { Creature, Element, EnvironmentId, ExpeditionLog, Genome, Personality, Stats, Tendencies } from './types';

// ---------- Tuning ----------
/** Enemy HP multiplier on top of generateEnemies(); sets fight length (~20-40s for 2 waves). */
export const ENEMY_HP_SCALE = 2.6;
/** Enemy strike damage multiplier; ~6 undodged hits from a wave-2 enemy will drop a stage-1 creature. */
export const ENEMY_DMG_SCALE = 1.75;
/** Base attack cooldown in seconds at speed 10 (scaled by 10 / speed). */
export const ATTACK_COOLDOWN = 0.6;
export const ATTACK_COOLDOWN_MIN = 0.38;
export const ATTACK_COOLDOWN_MAX = 0.85;
export const DODGE_COOLDOWN = 1.1;
/** Invulnerability window after a dodge starts. */
export const DODGE_WINDOW = 0.45;
/** A dodge started this close to impact is PERFECT. */
export const PERFECT_WINDOW = 0.25;
export const SHADOW_DODGE_BONUS = 1.4;
export const SPECIAL_COST = 100;
export const SPECIAL_MULT = 3.5;
export const CRIT_MULT = 1.6;
/** Player idle time before the creature acts on its own personality. */
export const IDLE_THRESHOLD = 1.6;
/** While still idle, the creature keeps acting every ~1.2s. */
const AUTO_REPEAT = 1.2;
export const BRACE_REDUCTION = 0.6;
const BRACE_DURATION = 3;
/** After this many seconds of fighting the enemy enrages. */
export const ENRAGE_AT = 60;
const ENRAGE_DMG = 1.6;
const ENRAGE_TEMPO = 0.6;
const INTRO_TIME = 1.1;
const TRANSITION_TIME = 1.7;
const CASTER_BLAST_CHANCE = 0.35;
const CASTER_BLAST_DMG = 1.8;
const CASTER_BLAST_WINDUP = 1.6;
const SKITTER_DOUBLE_CHANCE = 0.4;
const LOW_HP = 0.3;
const TIDE_HEAL = 0.2;
const EMBER_RAMP_PER_SEC = 0.008;
const EMBER_RAMP_MAX = 0.35;
const VOLT_CHARGE = 1.3;
const FROST_GUARD = 2;
const WEAKNESS_BONUS = 1.1;

export type ArenaInput = 'attack' | 'dodge' | 'special';
export type ArenaPhase = 'intro' | 'fight' | 'transition' | 'over';
export type EnemyMode = 'idle' | 'windup';

export interface ArenaEnemy {
  spec: EnemySpec;
  hp: number;
  maxHp: number;
  mode: EnemyMode;
  /** Seconds left in the current mode. */
  timer: number;
  /** Total length of the current wind-up (for the telegraph bar). */
  windupTotal: number;
  /** Caster charging its big blast. */
  heavy: boolean;
  /** Skitter's queued second strike is in progress. */
  followUp: boolean;
  /** Weakness revealed by an investigation (+10% damage). */
  weakness: boolean;
}

export interface ArenaPlayer {
  name: string;
  element: Element;
  tendencies: Tendencies;
  personality: Personality;
  stats: Stats;
  hp: number;
  maxHp: number;
  guard: number;
  charge: number;
  attackCd: number;
  attackCdMax: number;
  dodgeCd: number;
  dodgeCdMax: number;
  /** Remaining i-frames. */
  dodgeTimer: number;
  dodgeWindow: number;
  /** Seconds since the last dodge started. */
  dodgeAge: number;
  braced: boolean;
  braceTimer: number;
  /** Seconds since the last player input (or auto-action). */
  idle: number;
  pendingAuto: AutoAction | null;
}

export interface ArenaCounters {
  attacks: number;
  dodges: number;
  perfectDodges: number;
  specials: number;
  hitsTaken: number;
  braces: number;
  investigations: number;
  defeated: number;
}

export interface ArenaState {
  creatureId: string;
  env: EnvironmentId;
  seed: number;
  rng: number;
  waves: EnemySpec[];
  wave: number;
  player: ArenaPlayer;
  enemy: ArenaEnemy;
  phase: ArenaPhase;
  phaseTimer: number;
  /** Wall time since creation (includes intro/transitions). */
  elapsed: number;
  /** Time spent actively fighting (drives enrage + ember ramp). */
  fightTime: number;
  enraged: boolean;
  everLowHp: boolean;
  counters: ArenaCounters;
  defeatedGenomes: Genome[];
  won: boolean | null;
}

export type ArenaEvent =
  | { type: 'waveStart'; wave: number }
  | { type: 'playerAttack'; dmg: number; crit: boolean; mult: number; source: 'player' | 'auto' | 'mimic' }
  | { type: 'playerDodge'; auto: boolean }
  | { type: 'special'; dmg: number; mult: number }
  | { type: 'enemyWindup'; heavy: boolean; followUp: boolean; duration: number }
  | { type: 'enemyStrike'; dmg: number; dodged: boolean; perfect: boolean; braced: boolean; heavy: boolean }
  | { type: 'auto'; action: AutoAction; verb: string; personality: Personality; color: string }
  | { type: 'heal'; amount: number; reason: 'tide' | 'bloom' }
  | { type: 'specialReady' }
  | { type: 'enrage' }
  | { type: 'enemyDefeated'; wave: number }
  | { type: 'victory' }
  | { type: 'defeat' };

/** Which personality each auto-action expresses (for callout verb + colour). */
const AUTO_PERSONALITY: Record<AutoAction, Personality> = {
  attack: 'aggressive',
  dodge: 'agile',
  brace: 'defensive',
  investigate: 'curious',
  mimic: 'adaptive',
};

// ---------- Serializable PRNG (same algorithm as rng.mulberry32, but with exposed state) ----------
interface StepRng {
  (): number;
  state: number;
}
function makeRng(seed: number): StepRng {
  const r = (() => {
    r.state = (r.state + 0x6d2b79f5) >>> 0;
    let t = r.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as StepRng;
  r.state = seed >>> 0;
  return r;
}

function makeEnemy(spec: EnemySpec, firstDelay: number): ArenaEnemy {
  const maxHp = Math.max(20, Math.round(spec.stats.vigor * ENEMY_HP_SCALE));
  return { spec, hp: maxHp, maxHp, mode: 'idle', timer: firstDelay, windupTotal: spec.windup, heavy: false, followUp: false, weakness: false };
}

export function createArena(creature: Creature, env: EnvironmentId, seed: number): ArenaState {
  const stats = computeStats(creature);
  const el = creature.genome.element;
  const waves = generateEnemies(env, seed, creature);
  const rng = makeRng(hashSeed(seed, creature.genome.seed, 'arena'));
  const attackCdMax = clamp(ATTACK_COOLDOWN * (10 / Math.max(1, stats.speed)), ATTACK_COOLDOWN_MIN, ATTACK_COOLDOWN_MAX);
  const enemy = makeEnemy(waves[0], 1.1 + rng() * 0.6);
  return {
    creatureId: creature.id,
    env,
    seed,
    rng: rng.state,
    waves,
    wave: 0,
    player: {
      name: creature.name,
      element: el,
      tendencies: { ...creature.tendencies },
      personality: dominant(creature.tendencies),
      stats,
      hp: stats.vigor,
      maxHp: stats.vigor,
      guard: stats.guard + (el === 'frost' ? FROST_GUARD : 0),
      charge: 0,
      attackCd: 0,
      attackCdMax,
      dodgeCd: 0,
      dodgeCdMax: DODGE_COOLDOWN,
      dodgeTimer: 0,
      dodgeWindow: DODGE_WINDOW * (el === 'shadow' ? SHADOW_DODGE_BONUS : 1),
      dodgeAge: 99,
      braced: false,
      braceTimer: 0,
      idle: 0,
      pendingAuto: null,
    },
    enemy,
    phase: 'intro',
    phaseTimer: INTRO_TIME,
    elapsed: 0,
    fightTime: 0,
    enraged: false,
    everLowHp: false,
    counters: { attacks: 0, dodges: 0, perfectDodges: 0, specials: 0, hitsTaken: 0, braces: 0, investigations: 0, defeated: 0 },
    defeatedGenomes: [],
    won: null,
  };
}

// ---------- Derived helpers (also used by the UI) ----------
export function playerDamageMult(s: ArenaState): number {
  const p = s.player;
  const e = s.enemy;
  let m = elementMultiplier(p.element, e.spec.genome.element);
  if (p.element === 'ember') m *= 1 + Math.min(EMBER_RAMP_MAX, s.fightTime * EMBER_RAMP_PER_SEC);
  if (e.weakness) m *= WEAKNESS_BONUS;
  return m;
}

export function enemyDamageMult(s: ArenaState): number {
  return elementMultiplier(s.enemy.spec.genome.element, s.player.element);
}

/** 0..1 progress of the current enemy telegraph. */
export function windupProgress(s: ArenaState): number {
  const e = s.enemy;
  if (e.mode !== 'windup' || e.windupTotal <= 0) return 0;
  return clamp(1 - e.timer / e.windupTotal, 0, 1);
}

export function isWindingUp(s: ArenaState): boolean {
  return s.phase === 'fight' && s.enemy.mode === 'windup';
}

export function arenaLog(s: ArenaState): ExpeditionLog {
  const c = s.counters;
  const won = s.won === true;
  return {
    env: s.env,
    won,
    defeated: c.defeated,
    attacks: c.attacks,
    dodges: c.dodges,
    perfectDodges: c.perfectDodges,
    specials: c.specials,
    hitsTaken: c.hitsTaken,
    braces: c.braces,
    investigations: c.investigations,
    lowHpSurvived: won && s.everLowHp,
    durationSec: Math.round(s.elapsed),
    defeatedGenomes: s.defeatedGenomes.slice(),
  };
}

/** End the fight early as a loss (player pressed Retreat). */
export function retreatArena(s: ArenaState): ArenaState {
  if (s.phase === 'over') return s;
  return { ...s, phase: 'over', won: false };
}

// ---------- Simulation ----------
export function tickArena(state: ArenaState, dt: number, input: ArenaInput | null): { state: ArenaState; events: ArenaEvent[] } {
  if (state.phase === 'over' || dt <= 0) return { state, events: [] };
  const events: ArenaEvent[] = [];
  const rng = makeRng(state.rng);
  const s: ArenaState = {
    ...state,
    player: { ...state.player },
    enemy: { ...state.enemy },
    counters: { ...state.counters },
    defeatedGenomes: state.defeatedGenomes,
  };
  const p = s.player;
  const voltMul = p.element === 'volt' ? VOLT_CHARGE : 1;
  s.elapsed += dt;

  // Player timers always run so cooldowns finish during transitions.
  p.attackCd = Math.max(0, p.attackCd - dt);
  p.dodgeCd = Math.max(0, p.dodgeCd - dt);
  p.dodgeTimer = Math.max(0, p.dodgeTimer - dt);
  p.dodgeAge += dt;
  if (p.braced) {
    p.braceTimer -= dt;
    if (p.braceTimer <= 0) p.braced = false;
  }

  if (s.phase === 'intro' || s.phase === 'transition') {
    s.phaseTimer -= dt;
    if (s.phaseTimer <= 0) {
      if (s.phase === 'transition') {
        s.wave += 1;
        s.enemy = makeEnemy(s.waves[s.wave], 1.0 + rng() * 0.6);
      }
      s.phase = 'fight';
      p.idle = 0;
      p.pendingAuto = null;
      events.push({ type: 'waveStart', wave: s.wave });
    }
    s.rng = rng.state;
    return { state: s, events };
  }

  // ---- fight ----
  s.fightTime += dt;
  if (!s.enraged && s.fightTime >= ENRAGE_AT) {
    s.enraged = true;
    events.push({ type: 'enrage' });
  }

  const addCharge = (amount: number) => {
    const before = p.charge;
    p.charge = Math.min(SPECIAL_COST, p.charge + amount * voltMul);
    if (before < SPECIAL_COST && p.charge >= SPECIAL_COST) events.push({ type: 'specialReady' });
  };
  addCharge(p.stats.focus * 0.1 * dt);

  const hitEnemy = (raw: number): number => {
    const dmg = Math.max(1, Math.round(raw - s.enemy.spec.stats.guard));
    s.enemy.hp = Math.max(0, s.enemy.hp - dmg);
    return dmg;
  };

  const doAttack = (source: 'player' | 'auto'): boolean => {
    if (p.attackCd > 0) return false;
    p.attackCd = p.attackCdMax;
    const crit = rng() < 0.05 + p.stats.focus * 0.006;
    const mult = playerDamageMult(s);
    const dmg = hitEnemy(p.stats.power * mult * (0.9 + rng() * 0.2) * (crit ? CRIT_MULT : 1));
    s.counters.attacks++;
    addCharge(5 + p.stats.focus * 0.2);
    events.push({ type: 'playerAttack', dmg, crit, mult, source });
    if (p.element === 'bloom' && p.hp < p.maxHp) {
      const heal = Math.min(p.maxHp - p.hp, 1 + (rng() < 0.5 ? 1 : 0));
      p.hp += heal;
      events.push({ type: 'heal', amount: heal, reason: 'bloom' });
    }
    return true;
  };

  const doMimic = (): boolean => {
    if (p.attackCd > 0) return false;
    p.attackCd = p.attackCdMax;
    const mult = playerDamageMult(s);
    const copied = Math.max(p.stats.power * 0.8, s.enemy.spec.stats.power * ENEMY_DMG_SCALE);
    const dmg = hitEnemy(copied * mult);
    s.counters.attacks++;
    addCharge(5 + p.stats.focus * 0.2);
    events.push({ type: 'playerAttack', dmg, crit: false, mult, source: 'mimic' });
    return true;
  };

  const doDodge = (auto: boolean): boolean => {
    if (p.dodgeCd > 0) return false;
    p.dodgeCd = p.dodgeCdMax;
    p.dodgeTimer = p.dodgeWindow;
    p.dodgeAge = 0;
    s.counters.dodges++;
    events.push({ type: 'playerDodge', auto });
    return true;
  };

  const doSpecial = (): boolean => {
    if (p.charge < SPECIAL_COST) return false;
    p.charge = 0;
    const mult = playerDamageMult(s);
    const dmg = hitEnemy(p.stats.power * SPECIAL_MULT * mult);
    s.counters.specials++;
    p.attackCd = Math.max(p.attackCd, 0.35);
    events.push({ type: 'special', dmg, mult });
    return true;
  };

  // ---- player input / idle AI ----
  if (input) {
    p.idle = 0;
    p.pendingAuto = null;
    if (input === 'attack') doAttack('player');
    else if (input === 'dodge') doDodge(false);
    else doSpecial();
  } else {
    p.idle += dt;
    if (p.idle >= IDLE_THRESHOLD && !p.pendingAuto) {
      p.pendingAuto = autoActionFor(p.tendencies, s.enemy.mode === 'windup', rng);
    }
    const act = p.pendingAuto;
    if (act) {
      const winding = s.enemy.mode === 'windup';
      let done = false;
      let drop = false;
      switch (act) {
        case 'attack':
          done = doAttack('auto');
          break;
        case 'mimic':
          done = doMimic();
          break;
        case 'dodge':
          // A sensible creature waits for the strike to be close before dodging.
          if (!winding) drop = true;
          else if (s.enemy.timer <= p.dodgeWindow * 0.75) done = doDodge(true);
          break;
        case 'brace':
          if (!p.braced) {
            p.braced = true;
            p.braceTimer = BRACE_DURATION;
            s.counters.braces++;
            done = true;
          } else drop = true;
          break;
        case 'investigate':
          s.enemy.weakness = true;
          s.counters.investigations++;
          addCharge(8);
          done = true;
          break;
      }
      if (done) {
        const pers = AUTO_PERSONALITY[act];
        events.push({ type: 'auto', action: act, verb: PERSONALITY_INFO[pers].verb, personality: pers, color: PERSONALITY_INFO[pers].color });
      }
      if (done || drop) {
        p.pendingAuto = null;
        p.idle = IDLE_THRESHOLD - AUTO_REPEAT;
      }
    }
  }

  // ---- enemy defeated? ----
  if (s.enemy.hp <= 0) {
    finishWave(s, events);
    s.rng = rng.state;
    return { state: s, events };
  }

  // ---- enemy AI ----
  const e = s.enemy;
  e.timer -= dt;
  if (e.mode === 'idle') {
    if (e.timer <= 0) startWindup(s, rng() < CASTER_BLAST_CHANCE, false, events);
  } else if (e.timer <= 0) {
    resolveStrike(s, events, addCharge);
    if (s.phase === 'fight') {
      if (e.spec.archetype === 'skitter' && !e.followUp && rng() < SKITTER_DOUBLE_CHANCE) {
        startWindup(s, false, true, events);
      } else {
        e.mode = 'idle';
        e.heavy = false;
        e.followUp = false;
        e.timer = e.spec.tempo * (0.75 + rng() * 0.45) * (s.enraged ? ENRAGE_TEMPO : 1);
      }
    }
  }

  s.rng = rng.state;
  return { state: s, events };
}

function startWindup(s: ArenaState, blastRoll: boolean, followUp: boolean, events: ArenaEvent[]) {
  const e = s.enemy;
  const heavy = !followUp && e.spec.archetype === 'caster' && blastRoll;
  let dur = e.spec.windup * (heavy ? CASTER_BLAST_WINDUP : 1);
  if (followUp) dur = Math.max(0.55, e.spec.windup * 0.8);
  if (s.enraged) dur *= 0.85;
  e.mode = 'windup';
  e.heavy = heavy;
  e.followUp = followUp;
  e.timer = dur;
  e.windupTotal = dur;
  events.push({ type: 'enemyWindup', heavy, followUp, duration: dur });
}

function resolveStrike(s: ArenaState, events: ArenaEvent[], addCharge: (n: number) => void) {
  const p = s.player;
  const e = s.enemy;
  if (p.dodgeTimer > 0) {
    const perfect = p.dodgeAge <= PERFECT_WINDOW;
    if (perfect) {
      // Perfect timing: bonus charge and the dodge is ready again immediately.
      s.counters.perfectDodges++;
      p.dodgeCd = 0;
      addCharge(25);
    } else addCharge(5);
    events.push({ type: 'enemyStrike', dmg: 0, dodged: true, perfect, braced: false, heavy: e.heavy });
    return;
  }
  let raw = e.spec.stats.power * ENEMY_DMG_SCALE * enemyDamageMult(s) * (e.heavy ? CASTER_BLAST_DMG : 1) * (s.enraged ? ENRAGE_DMG : 1);
  raw -= p.guard;
  const braced = p.braced;
  if (braced) {
    raw *= 1 - BRACE_REDUCTION;
    p.braced = false;
    p.braceTimer = 0;
  }
  const dmg = Math.max(1, Math.round(raw));
  p.hp = Math.max(0, p.hp - dmg);
  s.counters.hitsTaken++;
  if (p.hp > 0 && p.hp < p.maxHp * LOW_HP) s.everLowHp = true;
  events.push({ type: 'enemyStrike', dmg, dodged: false, perfect: false, braced, heavy: e.heavy });
  if (p.hp <= 0) {
    s.phase = 'over';
    s.won = false;
    events.push({ type: 'defeat' });
  }
}

function finishWave(s: ArenaState, events: ArenaEvent[]) {
  s.counters.defeated++;
  s.defeatedGenomes = [...s.defeatedGenomes, s.enemy.spec.genome];
  s.enemy.mode = 'idle';
  events.push({ type: 'enemyDefeated', wave: s.wave });
  if (s.wave >= s.waves.length - 1) {
    s.phase = 'over';
    s.won = true;
    events.push({ type: 'victory' });
    return;
  }
  s.phase = 'transition';
  s.phaseTimer = TRANSITION_TIME;
  const p = s.player;
  if (p.element === 'tide' && p.hp < p.maxHp) {
    const heal = Math.min(p.maxHp - p.hp, Math.round(p.maxHp * TIDE_HEAL));
    p.hp += heal;
    events.push({ type: 'heal', amount: heal, reason: 'tide' });
  }
}

/** Short human description of the element perk, for the arena HUD. */
export function elementPerk(el: Element): string {
  switch (el) {
    case 'ember':
      return 'Damage ramps up over time';
    case 'tide':
      return 'Heals 20% between waves';
    case 'bloom':
      return 'Heals on every hit';
    case 'volt':
      return 'Special charges 30% faster';
    case 'frost':
      return '+2 guard';
    case 'shadow':
      return 'Longer dodge window';
  }
}

