// Expedition: pick a creature + environment, fight two waves in a small real-time arena, collect rewards.
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Compass, Dna, FlaskConical, Lock, Shield, Sparkles, Swords, Wind, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { play } from '../../audio/sfx';
import {
  PERFECT_WINDOW,
  SPECIAL_COST,
  arenaLog,
  createArena,
  elementPerk,
  retreatArena,
  tickArena,
  windupProgress,
  type ArenaEvent,
  type ArenaInput,
  type ArenaState,
} from '../../engine/arena';
import { dominant } from '../../engine/behaviour';
import { ELEMENT_INFO, ENV_INFO, MUTATION_INFO, PERSONALITY_INFO } from '../../engine/data';
import { canEvolve } from '../../engine/evolution';
import type { ExpeditionOutcome } from '../../engine/expedition';
import { computeStats, creatureRarity, xpToEvolve } from '../../engine/genetics';
import { randomSeed } from '../../engine/rng';
import { ENVIRONMENTS, PERSONALITIES, type Creature, type EnvironmentId, type ExpeditionLog, type Personality } from '../../engine/types';
import { CreatureSVG } from '../../render/CreatureSVG';
import { useGame } from '../../state/store';
import { CreatureTile, ElementBadge, RarityBadge, SectionTitle, StagePips, StatBar, TendencyBars, ElementIcon } from '../components/common';
import { useUI } from '../uiContext';
import './expedition.css';

type Phase = 'select' | 'battle' | 'result';

interface Run {
  key: number;
  creature: Creature;
  env: EnvironmentId;
  seed: number;
}

interface ResultData {
  run: Run;
  log: ExpeditionLog;
  outcome: ExpeditionOutcome | null;
  error?: string;
}

const setBackdrop = (detail: string) => window.dispatchEvent(new CustomEvent('wildshift:backdrop', { detail }));

export default function ExpeditionScreen() {
  const { state, actions } = useGame();
  const ui = useUI();
  const [phase, setPhase] = useState<Phase>('select');
  const [env, setEnv] = useState<EnvironmentId>(() => ENVIRONMENTS.find((e) => state.unlockedEnvs.includes(e)) ?? 'ember_fields');
  const [run, setRun] = useState<Run | null>(null);
  const [result, setResult] = useState<ResultData | null>(null);
  const completedRef = useRef<number | null>(null);
  const runKey = useRef(0);
  const screenRef = useRef(ui.screen);
  useEffect(() => {
    screenRef.current = ui.screen;
  }, [ui.screen]);

  const creature = state.creatures.find((c) => c.id === state.activeCreatureId) ?? state.creatures[0];
  const activeEnv = phase === 'select' ? env : (run?.env ?? env);

  // Themed backdrop follows the chosen environment; restore the lab on leave.
  useEffect(() => {
    setBackdrop(activeEnv);
  }, [activeEnv]);
  useEffect(
    () => () => {
      // If the app already switched screens it set its own backdrop; only reset when still on this screen.
      if (screenRef.current === 'expedition') setBackdrop('lab');
    },
    [],
  );

  const begin = () => {
    if (!creature || !state.unlockedEnvs.includes(env)) {
      play('error');
      return;
    }
    play('click');
    runKey.current += 1;
    setRun({ key: runKey.current, creature, env, seed: randomSeed() });
    setResult(null);
    setPhase('battle');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const finish = useCallback(
    (r: Run, log: ExpeditionLog) => {
      // Exactly once per run, even under StrictMode or repeated callbacks.
      if (completedRef.current === r.key) return;
      completedRef.current = r.key;
      const res = actions.completeExpedition(r.creature.id, log);
      setResult(res.ok ? { run: r, log, outcome: res.value } : { run: r, log, outcome: null, error: res.error });
      setPhase('result');
    },
    [actions],
  );

  if (!creature) {
    return (
      <div className="exp-screen">
        <SectionTitle eyebrow="Field expedition" title="Expedition" />
        <p className="muted">You need an organism before heading out.</p>
      </div>
    );
  }

  return (
    <div className="exp-screen">
      <AnimatePresence mode="wait">
        {phase === 'select' && (
          <motion.div key="select" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.22 }}>
            <SelectPhase creature={creature} env={env} onEnv={setEnv} onBegin={begin} />
          </motion.div>
        )}
        {phase === 'battle' && run && (
          <motion.div key={`battle-${run.key}`} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <Battle run={run} reducedMotion={state.settings.reducedMotion} onEnd={finish} />
          </motion.div>
        )}
        {phase === 'result' && result && (
          <motion.div key={`result-${result.run.key}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <ResultPhase
              data={result}
              onAgain={() => {
                play('click');
                setPhase('select');
              }}
              onLab={() => ui.go('lab')}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ======================================================================
 * SELECT
 * ==================================================================== */

const STAT_MAX = { vigor: 160, power: 40, guard: 16, speed: 26, focus: 30 };
const STAT_COLOR = { vigor: '#7dff8a', power: '#ff7a3d', guard: '#5da9ff', speed: '#5dffb4', focus: '#d98bff' };
const STAT_LABEL = { vigor: 'Vigor', power: 'Power', guard: 'Guard', speed: 'Speed', focus: 'Focus' };

function advantage(c: Creature, env: EnvironmentId): 'strong' | 'risky' | 'neutral' {
  const mine = c.genome.element;
  const theirs = ENV_INFO[env].element;
  if (ELEMENT_INFO[mine].strongAgainst === theirs) return 'strong';
  if (ELEMENT_INFO[theirs].strongAgainst === mine) return 'risky';
  return 'neutral';
}

function SelectPhase({ creature, env, onEnv, onBegin }: { creature: Creature; env: EnvironmentId; onEnv: (e: EnvironmentId) => void; onBegin: () => void }) {
  const { state, actions } = useGame();
  const ui = useUI();
  const stats = useMemo(() => computeStats(creature), [creature]);
  const evo = canEvolve(creature, state.resources.shards);
  const need = xpToEvolve(creature.stage);
  const el = ELEMENT_INFO[creature.genome.element];
  const dom = dominant(creature.tendencies);
  const locked = !state.unlockedEnvs.includes(env);
  const info = ENV_INFO[env];

  return (
    <>
      <SectionTitle
        eyebrow="Field expedition"
        title="Expedition"
        right={
          <span className="chip exp-head-chip">
            <Compass size={14} /> 2 waves · ~30s
          </span>
        }
      />
      <p className="muted exp-intro">Send an organism into the wild. How it fights shapes who it becomes.</p>

      <div className="exp-select">
        <section className="glass exp-panel exp-creature-panel">
          <div className="eyebrow">Organism</div>
          <div className="exp-roster scroll-x">
            {state.creatures.map((c) => (
              <CreatureTile key={c.id} creature={c} size={72} selected={c.id === creature.id} onClick={() => actions.setActive(c.id)} style={{ minWidth: 104, scrollSnapAlign: 'start' }} />
            ))}
          </div>

          <div className="exp-hero" style={{ '--el': el.color } as CSSProperties}>
            <div className="exp-hero-art">
              <CreatureSVG genome={creature.genome} stage={creature.stage} size="100%" personality={dom} />
            </div>
            <div className="exp-hero-info">
              <h3 className="exp-hero-name">{creature.name}</h3>
              <div className="exp-badges">
                <ElementBadge element={creature.genome.element} small />
                <RarityBadge rarity={creatureRarity(creature)} small />
                <StagePips stage={creature.stage} />
              </div>
              <p className="exp-perk">
                <ElementIcon element={creature.genome.element} size={13} /> {elementPerk(creature.genome.element)}
              </p>
              <div className="exp-stats">
                {(Object.keys(STAT_MAX) as Array<keyof typeof STAT_MAX>).map((k) => (
                  <StatBar key={k} label={STAT_LABEL[k]} value={stats[k]} max={STAT_MAX[k]} color={STAT_COLOR[k]} />
                ))}
              </div>
            </div>
          </div>

          <div className="exp-sub-grid">
            <div>
              <div className="eyebrow exp-mini-title">Behaviour</div>
              <TendencyBars tendencies={creature.tendencies} compact />
              <p className="exp-note">
                Idle in combat, it <b style={{ color: PERSONALITY_INFO[dom].color }}>{PERSONALITY_INFO[dom].verb}</b> on its own.
              </p>
            </div>
            <div>
              <div className="eyebrow exp-mini-title">Evolution</div>
              <XpBar xp={creature.xp} need={need} />
              <p className="exp-note">{creature.stage >= 3 ? 'Final form reached.' : evo.ok ? 'Ready to evolve!' : evo.reason}</p>
              {evo.ok && (
                <button className="btn btn-sm exp-evolve-glow" style={{ '--c': 'var(--shard)' } as CSSProperties} onClick={() => ui.openEvolution(creature.id)}>
                  <Dna size={14} /> Evolve first?
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="exp-envs-wrap">
          <div className="eyebrow">Environment</div>
          <div className="exp-envs">
            {ENVIRONMENTS.map((id) => (
              <EnvCard key={id} id={id} creature={creature} selected={id === env} onSelect={() => onEnv(id)} />
            ))}
          </div>
        </section>
      </div>

      <div className="exp-launch glass">
        <div className="exp-launch-info">
          <div className="eyebrow">Destination</div>
          <b>{info.name}</b>
          <span className="dim">
            {creature.name} vs. wild {ELEMENT_INFO[info.element].name} organisms
          </span>
        </div>
        <div className="exp-launch-actions">
          {evo.ok && (
            <button className="btn exp-evolve-glow" style={{ '--c': 'var(--shard)' } as CSSProperties} onClick={() => ui.openEvolution(creature.id)}>
              <Dna size={16} /> Evolve first?
            </button>
          )}
          <button className="btn btn-primary btn-lg exp-begin" style={{ '--c': info.glow } as CSSProperties} onClick={onBegin} disabled={locked}>
            {locked ? <Lock size={18} /> : <Compass size={18} />}
            {locked ? 'LOCKED' : 'BEGIN EXPEDITION'}
          </button>
        </div>
      </div>
    </>
  );
}

function XpBar({ xp, need, from }: { xp: number; need: number; from?: number }) {
  const final = !Number.isFinite(need);
  const pct = final ? 100 : Math.min(100, (xp / need) * 100);
  const fromPct = from === undefined || final ? pct : Math.min(100, (from / need) * 100);
  return (
    <div className="exp-xp">
      <div className="exp-xp-track">
        {from !== undefined && <span className="exp-xp-prev" style={{ transform: `scaleX(${fromPct / 100})` }} />}
        <motion.span
          className="exp-xp-fill"
          initial={{ scaleX: fromPct / 100 }}
          animate={{ scaleX: pct / 100 }}
          transition={{ duration: from !== undefined ? 1.1 : 0.4, delay: from !== undefined ? 0.5 : 0, ease: 'easeOut' }}
        />
      </div>
      <span className="exp-xp-label">{final ? 'MAX' : `${Math.min(xp, need)} / ${need} XP`}</span>
    </div>
  );
}

function EnvCard({ id, creature, selected, onSelect }: { id: EnvironmentId; creature: Creature; selected: boolean; onSelect: () => void }) {
  const { state, actions } = useGame();
  const info = ENV_INFO[id];
  const locked = !state.unlockedEnvs.includes(id);
  const runs = creature.exposure[id];
  const adv = advantage(creature, id);
  const select = () => {
    play('select');
    onSelect();
  };
  const unlock = () => {
    const r = actions.unlockEnv(id);
    if (r.ok) {
      play('coin');
      onSelect();
    } else {
      play('error');
      actions.toast({ kind: 'error', title: 'Not enough Discovery XP', body: r.error });
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      className={`exp-env ${selected ? 'selected' : ''} ${locked ? 'locked' : ''}`}
      style={{ '--env': info.glow } as CSSProperties}
      onClick={select}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select();
        }
      }}
    >
      <EnvScene id={id} />
      <div className="exp-env-body">
        <div className="exp-env-top">
          <h4>{info.name}</h4>
          <ElementBadge element={info.element} small />
        </div>
        <p className="exp-env-tag">{info.tagline}</p>
        <div className="exp-env-chips">
          <span className="chip chip-sm">{runs > 0 ? `${runs} run${runs > 1 ? 's' : ''}` : 'Unexplored'}</span>
          {adv === 'strong' && <span className="chip chip-sm exp-adv-strong">Strong here</span>}
          {adv === 'risky' && <span className="chip chip-sm exp-adv-risky">Risky</span>}
        </div>
        <p className="exp-env-nudge">
          <span className="dim">Nudges toward</span> {info.adaptation}: {info.mutations.map((m) => MUTATION_INFO[m].name).join(', ')}
        </p>
      </div>
      {locked && (
        <div className="exp-env-lock">
          <Lock size={22} />
          <b className="exp-env-lock-name">{info.name}</b>
          <button
            className="btn btn-sm"
            style={{ '--c': 'var(--dxp)' } as CSSProperties}
            onClick={(e) => {
              e.stopPropagation();
              unlock();
            }}
          >
            Unlock for {info.unlockDxp} Discovery XP
          </button>
          {state.resources.dxp < info.unlockDxp && <span className="exp-env-lock-need">You have {state.resources.dxp}</span>}
        </div>
      )}
    </div>
  );
}

/** Mini environment illustration: sky gradient, glow, and a few silhouettes. */
function EnvScene({ id, className }: { id: EnvironmentId; className?: string }) {
  const info = ENV_INFO[id];
  const g = info.glow;
  const dark = 'rgba(0,0,0,0.55)';
  let art: ReactNode;
  switch (id) {
    case 'ember_fields':
      art = (
        <>
          <path d="M10 80 L28 22 L40 30 L52 80Z M60 80 L72 40 L84 80Z M130 80 L150 14 L162 26 L176 80Z M180 80 L192 48 L200 80Z" fill={dark} />
          <path d="M150 14 L156 46 M28 22 L32 50" stroke={g} strokeWidth="2" opacity="0.8" />
          <ellipse cx="100" cy="80" rx="70" ry="8" fill={g} opacity="0.35" />
        </>
      );
      break;
    case 'abyssal_lake':
      art = (
        <>
          <path d="M20 80 C10 60 30 45 18 20 C34 42 22 60 30 80Z M60 80 C52 62 70 54 62 34 C76 52 64 66 70 80Z M150 80 C140 58 162 44 150 16 C168 40 156 60 162 80Z M182 80 C176 66 190 60 184 44 C196 58 188 70 192 80Z" fill={dark} />
          {[30, 70, 110, 140, 170].map((x, i) => (
            <circle key={x} cx={x} cy={20 + ((i * 17) % 40)} r={2 + (i % 2)} fill="none" stroke={g} strokeWidth="1" opacity="0.7" />
          ))}
        </>
      );
      break;
    case 'verdant_wilds':
      art = (
        <>
          <path d="M26 80 V50 H32 V80Z M146 80 V40 H154 V80Z M90 80 V60 H95 V80Z" fill={dark} />
          <ellipse cx="29" cy="50" rx="22" ry="11" fill={dark} />
          <ellipse cx="150" cy="40" rx="30" ry="14" fill={dark} />
          <ellipse cx="92" cy="60" rx="14" ry="7" fill={dark} />
          <circle cx="40" cy="48" r="2.5" fill={g} />
          <circle cx="164" cy="38" r="3" fill={g} />
          <circle cx="98" cy="58" r="2" fill={g} />
        </>
      );
      break;
    case 'stormlands':
      art = (
        <>
          <path d="M20 36 Q45 30 70 36 L52 50 L44 58 L36 48Z M120 22 Q150 16 180 22 L160 40 L150 48 L140 38Z" fill={dark} />
          <path d="M104 0 L96 26 L106 26 L94 56" stroke={g} strokeWidth="2.5" fill="none" strokeLinejoin="round" className="exp-scene-bolt" />
          <rect x="0" y="74" width="200" height="6" fill={dark} />
        </>
      );
      break;
    case 'hollow_night':
      art = (
        <>
          <circle cx="160" cy="18" r="10" fill={g} opacity="0.25" />
          <path d="M30 80 C20 56 44 46 34 18 M34 40 q16 -12 30 -4 M150 80 C140 60 160 50 152 28 M152 48 q-16 -8 -26 2" stroke={dark} strokeWidth="6" fill="none" strokeLinecap="round" />
          <circle cx="64" cy="36" r="3" fill={g} />
          <circle cx="126" cy="50" r="3" fill={g} />
          <circle cx="90" cy="70" r="1.6" fill={g} />
        </>
      );
      break;
  }
  return (
    <div className={`exp-scene ${className ?? ''}`} style={{ background: `linear-gradient(180deg, ${info.sky[0]}, ${info.sky[1]} 60%, ${info.sky[2]})` }} aria-hidden>
      <div className="exp-scene-glow" style={{ background: `radial-gradient(ellipse at 50% 100%, ${g}55, transparent 65%)` }} />
      <svg viewBox="0 0 200 80" preserveAspectRatio="xMidYMax slice">
        {art}
      </svg>
    </div>
  );
}

/* ======================================================================
 * BATTLE
 * ==================================================================== */

interface Floater {
  id: number;
  text: string;
  kind: 'dmg' | 'crit' | 'hurt' | 'dodge' | 'perfect' | 'heal' | 'braced' | 'special';
  side: 'player' | 'enemy';
  born: number;
  dx: number;
}
interface Burst {
  id: number;
  side: 'player' | 'enemy';
  color: string;
  born: number;
  big: boolean;
}
interface Fx {
  floaters: Floater[];
  bursts: Burst[];
  beams: Array<{ id: number; born: number }>;
  callout: { id: number; text: string; color: string; born: number } | null;
  banner: { id: number; text: string; tone: 'wave' | 'danger' | 'win' | 'lose'; born: number } | null;
}
const EMPTY_FX: Fx = { floaters: [], bursts: [], beams: [], callout: null, banner: null };
const FX_TTL = { floater: 1000, burst: 800, beam: 750, callout: 1500, banner: 1400 };

function pruneFx(fx: Fx, now: number): Fx {
  const f = fx.floaters.length && now - fx.floaters[0].born > FX_TTL.floater;
  const b = fx.bursts.length && now - fx.bursts[0].born > FX_TTL.burst;
  const be = fx.beams.length && now - fx.beams[0].born > FX_TTL.beam;
  const c = fx.callout && now - fx.callout.born > FX_TTL.callout;
  const ba = fx.banner && fx.banner.tone !== 'win' && fx.banner.tone !== 'lose' && now - fx.banner.born > FX_TTL.banner;
  if (!f && !b && !be && !c && !ba) return fx;
  return {
    floaters: f ? fx.floaters.filter((x) => now - x.born <= FX_TTL.floater) : fx.floaters,
    bursts: b ? fx.bursts.filter((x) => now - x.born <= FX_TTL.burst) : fx.bursts,
    beams: be ? fx.beams.filter((x) => now - x.born <= FX_TTL.beam) : fx.beams,
    callout: c ? null : fx.callout,
    banner: ba ? null : fx.banner,
  };
}

const KEYMAP: Record<string, ArenaInput> = { a: 'attack', j: 'attack', d: 'dodge', k: 'dodge', ' ': 'dodge', s: 'special', l: 'special' };
const EASE = 'cubic-bezier(.2,.8,.2,1)';

function fmtTime(t: number) {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Battle({ run, reducedMotion, onEnd }: { run: Run; reducedMotion: boolean; onEnd: (r: Run, log: ExpeditionLog) => void }) {
  const [initial] = useState(() => createArena(run.creature, run.env, run.seed));
  const simRef = useRef<ArenaState>(initial);
  const [view, setView] = useState<ArenaState>(initial);
  const [fx, setFx] = useState<Fx>(EMPTY_FX);
  const inputRef = useRef<ArenaInput | null>(null);
  const arenaRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const enemyRef = useRef<HTMLDivElement>(null);
  const playerFlashRef = useRef<HTMLDivElement>(null);
  const enemyFlashRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const endTimer = useRef<number | null>(null);
  const endedRef = useRef(false);
  const onEndRef = useRef(onEnd);
  const reducedRef = useRef(reducedMotion);
  useEffect(() => {
    onEndRef.current = onEnd;
    reducedRef.current = reducedMotion;
  });

  const c = run.creature;
  const el = ELEMENT_INFO[c.genome.element];
  const envInfo = ENV_INFO[run.env];

  const endRun = useCallback(
    (delay: number) => {
      if (endedRef.current) return;
      endedRef.current = true;
      const fire = () => onEndRef.current(run, arenaLog(simRef.current));
      if (delay <= 0) fire();
      else endTimer.current = window.setTimeout(fire, delay);
    },
    [run],
  );

  // Main loop: fixed-ish timestep driven by requestAnimationFrame.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let nextId = 1;
    const anim = (node: HTMLElement | null, frames: Keyframe[], ms: number, delay = 0) => {
      node?.animate(frames, { duration: ms, delay, easing: EASE });
    };
    const pushFx = (mut: (f: Fx, now: number) => Fx) => setFx((f) => mut(f, performance.now()));
    const floater = (side: Floater['side'], text: string, kind: Floater['kind']) =>
      pushFx((f, now) => ({ ...f, floaters: [...f.floaters, { id: nextId++, side, text, kind, born: now, dx: Math.round((Math.random() - 0.5) * 50) }] }));
    const burst = (side: Burst['side'], color: string, big = false) => pushFx((f, now) => ({ ...f, bursts: [...f.bursts, { id: nextId++, side, color, born: now, big }] }));
    const banner = (text: string, tone: NonNullable<Fx['banner']>['tone']) => pushFx((f, now) => ({ ...f, banner: { id: nextId++, text, tone, born: now } }));
    const flash = (node: HTMLElement | null, peak = 0.9, delay = 0) => anim(node, [{ opacity: 0 }, { opacity: peak }, { opacity: 0 }], 260, delay);
    const shake = () => {
      if (reducedRef.current) return;
      anim(
        arenaRef.current,
        [{ transform: 'translate(0,0)' }, { transform: 'translate(-7px,3px)' }, { transform: 'translate(6px,-4px)' }, { transform: 'translate(-4px,2px)' }, { transform: 'translate(0,0)' }],
        320,
      );
    };

    const handle = (events: ArenaEvent[]) => {
      for (const ev of events) {
        switch (ev.type) {
          case 'waveStart':
            play('select');
            banner(`WAVE ${ev.wave + 1}/2`, 'wave');
            break;
          case 'playerAttack':
            if (ev.source !== 'mimic') play('attack');
            else play('special');
            anim(playerRef.current, [{ transform: 'translateX(0)' }, { transform: 'translateX(38%)' }, { transform: 'translateX(0)' }], 280);
            anim(enemyRef.current, [{ transform: 'translateX(0)' }, { transform: 'translateX(9%)' }, { transform: 'translateX(0)' }], 260, 110);
            flash(enemyFlashRef.current, 0.85, 110);
            floater('enemy', ev.crit ? `CRIT ${ev.dmg}` : String(ev.dmg), ev.crit ? 'crit' : 'dmg');
            break;
          case 'playerDodge':
            play('dodge');
            anim(
              playerRef.current,
              [
                { transform: 'translate(0,0)', opacity: 1 },
                { transform: 'translate(-16%,-14%)', opacity: 0.45, offset: 0.35 },
                { transform: 'translate(-10%,-6%)', opacity: 0.6, offset: 0.7 },
                { transform: 'translate(0,0)', opacity: 1 },
              ],
              480,
            );
            break;
          case 'special':
            play('special');
            pushFx((f, now) => ({ ...f, beams: [...f.beams, { id: nextId++, born: now }] }));
            anim(playerRef.current, [{ transform: 'scale(1)' }, { transform: 'scale(1.12) translateX(6%)' }, { transform: 'scale(1)' }], 420);
            anim(enemyRef.current, [{ transform: 'translateX(0)' }, { transform: 'translateX(16%) rotate(6deg)' }, { transform: 'translateX(0)' }], 480, 260);
            flash(flashRef.current, 0.7, 240);
            flash(enemyFlashRef.current, 1, 260);
            burst('enemy', el.color, true);
            floater('enemy', `${ev.dmg}!`, 'special');
            shake();
            break;
          case 'enemyWindup':
            play('enemy_windup');
            break;
          case 'enemyStrike':
            anim(enemyRef.current, [{ transform: 'translateX(0)' }, { transform: 'translateX(-42%)' }, { transform: 'translateX(0)' }], 300);
            if (ev.dodged) {
              floater('player', ev.perfect ? 'PERFECT!' : 'DODGE!', ev.perfect ? 'perfect' : 'dodge');
              if (ev.perfect) burst('player', '#7affdd');
            } else {
              play('hit');
              anim(playerRef.current, [{ transform: 'translateX(0)' }, { transform: 'translateX(-10%)' }, { transform: 'translateX(0)' }], 300, 120);
              flash(playerFlashRef.current, 0.9, 120);
              floater('player', ev.braced ? `BRACED -${ev.dmg}` : `-${ev.dmg}`, ev.braced ? 'braced' : 'hurt');
              shake();
            }
            break;
          case 'auto': {
            const text = `${c.name} ${ev.verb}!`;
            pushFx((f, now) => ({ ...f, callout: { id: nextId++, text, color: ev.color, born: now } }));
            if (ev.action === 'dodge') play('dodge');
            break;
          }
          case 'heal':
            floater('player', `+${ev.amount}`, 'heal');
            break;
          case 'specialReady':
            break;
          case 'enrage':
            play('enemy_windup');
            banner('ENRAGED!', 'danger');
            break;
          case 'enemyDefeated':
            burst('enemy', ELEMENT_INFO[simRef.current.enemy.spec.genome.element].color, true);
            break;
          case 'victory':
            play('victory');
            banner('VICTORY', 'win');
            endRun(1600);
            break;
          case 'defeat':
            play('defeat');
            banner('DEFEATED', 'lose');
            endRun(1600);
            break;
        }
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const cur = simRef.current;
      if (cur.phase !== 'over') {
        const input = inputRef.current;
        inputRef.current = null;
        const { state: next, events } = tickArena(cur, dt, input);
        simRef.current = next;
        setView(next);
        if (events.length) handle(events);
      }
      setFx((f) => pruneFx(f, performance.now()));
    };
    const onVis = () => {
      last = performance.now();
    };
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [c.name, el.color, endRun]);

  useEffect(
    () => () => {
      if (endTimer.current !== null) window.clearTimeout(endTimer.current);
    },
    [],
  );

  const send = useCallback((cmd: ArenaInput) => {
    const s = simRef.current;
    if (s.phase === 'over') return;
    if (cmd === 'special' && s.player.charge < SPECIAL_COST) play('error');
    inputRef.current = cmd;
  }, []);

  // Keyboard: A/J attack, D/K/Space dodge, S/L special.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const cmd = KEYMAP[e.key.toLowerCase()];
      if (!cmd) return;
      e.preventDefault();
      send(cmd);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [send]);

  const retreat = () => {
    simRef.current = retreatArena(simRef.current);
    setView(simRef.current);
    play('defeat');
    endRun(0);
  };

  const s = view;
  const p = s.player;
  const e = s.enemy;
  const enemyEl = ELEMENT_INFO[e.spec.genome.element];
  const winding = s.phase === 'fight' && e.mode === 'windup';
  const wp = windupProgress(s);
  const perfectZone = e.windupTotal > 0 ? Math.min(1, PERFECT_WINDOW / e.windupTotal) : 0;
  const dying = e.hp <= 0;
  const chargePct = Math.round((p.charge / SPECIAL_COST) * 100);
  const ready = p.charge >= SPECIAL_COST;
  const fighting = s.phase === 'fight';
  const dom = p.personality;

  // Memoised artwork so the 60fps HUD re-render doesn't touch the SVG trees.
  const playerArt = useMemo(() => <CreatureSVG genome={c.genome} stage={c.stage} size="100%" personality={dom} />, [c.genome, c.stage, dom]);
  const enemyGenome = e.spec.genome;
  const enemyArt = useMemo(() => <CreatureSVG genome={enemyGenome} stage={1} size="100%" personality="aggressive" />, [enemyGenome]);

  return (
    <div className="exp-battle">
      <div className="exp-battle-top">
        <div className="exp-battle-env">
          <span className="eyebrow">Expedition</span>
          <b>{envInfo.name}</b>
          <ElementBadge element={envInfo.element} small />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={retreat} disabled={s.phase === 'over'}>
          Retreat
        </button>
      </div>

      <div className={`exp-arena ${s.enraged ? 'enraged' : ''}`} ref={arenaRef} style={{ '--env': envInfo.glow, '--pel': el.color, '--eel': enemyEl.color } as CSSProperties}>
        <div className="exp-sky" style={{ background: `linear-gradient(180deg, ${envInfo.sky[0]}cc, ${envInfo.sky[1]}66 55%, transparent)` }} />
        <div className="exp-floor">
          <div className="exp-floor-plane" style={{ background: `linear-gradient(180deg, transparent, ${envInfo.ground})` }} />
          <div className="exp-floor-grid" />
          <div className="exp-floor-glow" />
        </div>

        {/* HUD */}
        <div className="exp-hud">
          <HpPanel name={c.name} hp={p.hp} max={p.maxHp} color={el.color} side="left" extra={<ChargeRing pct={chargePct} color={el.color} ready={ready} />} />
          <div className="exp-hud-mid">
            <span className="exp-wave">
              Wave {s.wave + 1}/{s.waves.length}
            </span>
            <span className={`exp-timer ${s.enraged ? 'hot' : ''}`}>
              <Clock size={12} /> {fmtTime(s.elapsed)}
            </span>
          </div>
          <HpPanel name={e.spec.name} hp={e.hp} max={e.maxHp} color={enemyEl.color} side="right" sub={e.spec.archetype} weakness={e.weakness} />
        </div>

        {/* Fighters */}
        <div className="exp-fighter exp-player">
          <div className="exp-motion" ref={playerRef}>
            <div className={`exp-pose ${p.dodgeTimer > 0 ? 'dodging' : ''} ${p.braced ? 'braced' : ''}`}>
              {playerArt}
              {p.braced && <Shield className="exp-brace-icon" size={22} />}
            </div>
            <div className="exp-hitflash hurt" ref={playerFlashRef} />
          </div>
        </div>

        <div className="exp-fighter exp-enemy">
          {!dying && winding && (
            <div className={`exp-telegraph ${e.heavy ? 'heavy' : ''}`}>
              <span className="exp-bang">{e.heavy ? '!!' : '!'}</span>
              <span className="exp-wind">
                <span className="exp-wind-fill" style={{ transform: `scaleX(${wp})` }} />
                <span className="exp-wind-zone" style={{ width: `${perfectZone * 100}%` }} />
              </span>
              {e.heavy && <span className="exp-wind-label">Charging blast</span>}
            </div>
          )}
          <div className="exp-motion exp-enter" key={s.wave} ref={enemyRef}>
            <div className={`exp-pose ${winding ? 'rear' : ''} ${winding && e.heavy ? 'heavy' : ''} ${dying ? 'dissolve' : ''}`}>
              <div className="exp-mirror">{enemyArt}</div>
            </div>
            <div className="exp-hitflash" ref={enemyFlashRef} />
          </div>
        </div>

        {/* Effects */}
        {fx.beams.map((b) => (
          <div key={b.id} className="exp-beam" style={{ background: `linear-gradient(90deg, ${el.color2}00, ${el.color2}, ${el.color} 60%, #fff)` }}>
            <span className="exp-beam-core" />
          </div>
        ))}
        {fx.bursts.map((b) => (
          <div key={b.id} className={`exp-burst ${b.side} ${b.big ? 'big' : ''}`} style={{ '--bc': b.color } as CSSProperties}>
            {Array.from({ length: b.big ? 14 : 8 }, (_, i) => (
              <i key={i} style={{ '--a': `${(i / (b.big ? 14 : 8)) * 360 + (i % 2) * 11}deg`, '--r': `${b.big ? 70 + (i % 3) * 22 : 46 + (i % 2) * 16}px` } as CSSProperties} />
            ))}
          </div>
        ))}
        {fx.floaters.map((f) => (
          <span key={f.id} className={`exp-float ${f.kind} ${f.side}`} style={{ '--dx': `${f.dx}px` } as CSSProperties}>
            {f.text}
          </span>
        ))}
        {fx.callout && (
          <div key={fx.callout.id} className="exp-callout" style={{ color: fx.callout.color, borderColor: fx.callout.color + '88' }}>
            {fx.callout.text}
          </div>
        )}
        {fx.banner && (
          <div key={fx.banner.id} className={`exp-banner ${fx.banner.tone}`}>
            {fx.banner.text}
          </div>
        )}
        <div className="exp-screenflash" ref={flashRef} style={{ background: `radial-gradient(circle at 70% 60%, #fff, ${el.color}88 40%, transparent 75%)` }} />
        {s.phase === 'intro' && <div className="exp-intro-hint">Get ready…</div>}
      </div>

      <div className="exp-commands">
        <CommandButton label="Attack" icon={<Swords size={26} />} keys={['A', 'J']} color="#ff7a5d" cd={p.attackCd} cdMax={p.attackCdMax} disabled={!fighting} onPress={() => send('attack')} />
        <CommandButton label="Dodge" icon={<Wind size={26} />} keys={['D', 'Space']} color="#5dffb4" cd={p.dodgeCd} cdMax={p.dodgeCdMax} disabled={!fighting} hot={winding} onPress={() => send('dodge')} />
        <CommandButton
          label="Special"
          icon={<Sparkles size={26} />}
          keys={['S', 'L']}
          color={el.color}
          charge={p.charge / SPECIAL_COST}
          ready={ready}
          disabled={!fighting}
          sub={ready ? 'READY' : `${chargePct}%`}
          onPress={() => send('special')}
        />
      </div>
      <p className="exp-tip">
        <Zap size={13} /> Hit <b>DODGE</b> as the red bar fills. Dodge in the bright zone for a <b>PERFECT</b> dodge and bonus charge. Idle for a moment and{' '}
        <span style={{ color: PERSONALITY_INFO[dom].color }}>{c.name}</span> acts on instinct.
      </p>
    </div>
  );
}

function HpPanel({ name, hp, max, color, side, sub, extra, weakness }: { name: string; hp: number; max: number; color: string; side: 'left' | 'right'; sub?: string; extra?: ReactNode; weakness?: boolean }) {
  const pct = max > 0 ? Math.max(0, hp / max) : 0;
  const low = pct < 0.3;
  return (
    <div className={`exp-hp ${side}`}>
      {extra}
      <div className="exp-hp-main">
        <div className="exp-hp-name">
          <b>{name}</b>
          {sub && <span className="exp-hp-sub">{sub}</span>}
          {weakness && <span className="exp-hp-weak">weak spot</span>}
        </div>
        <div className={`exp-hp-track ${low ? 'low' : ''}`}>
          <span className="exp-hp-fill" style={{ transform: `scaleX(${pct})`, background: low ? 'var(--danger)' : color }} />
        </div>
        <span className="exp-hp-num">
          {Math.ceil(hp)} / {max}
        </span>
      </div>
    </div>
  );
}

function ChargeRing({ pct, color, ready }: { pct: number; color: string; ready: boolean }) {
  const r = 15;
  const circ = 2 * Math.PI * r;
  return (
    <div className={`exp-ring ${ready ? 'ready' : ''}`} title={`Special charge ${pct}%`} style={{ '--rc': color } as CSSProperties}>
      <svg viewBox="0 0 40 40" width="40" height="40">
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
        <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} transform="rotate(-90 20 20)" />
      </svg>
      <Sparkles size={13} className="exp-ring-icon" />
    </div>
  );
}

function CommandButton({
  label,
  icon,
  keys,
  color,
  cd = 0,
  cdMax = 1,
  charge,
  ready,
  hot,
  disabled,
  sub,
  onPress,
}: {
  label: string;
  icon: ReactNode;
  keys: string[];
  color: string;
  cd?: number;
  cdMax?: number;
  charge?: number;
  ready?: boolean;
  hot?: boolean;
  disabled?: boolean;
  sub?: string;
  onPress: () => void;
}) {
  const cooling = cd > 0;
  const fill = charge !== undefined ? 1 - Math.min(1, charge) : cooling ? cd / cdMax : 0;
  return (
    <button
      type="button"
      className={`exp-cmd ${cooling ? 'cooling' : ''} ${ready ? 'ready' : ''} ${hot && !cooling ? 'hot' : ''} ${charge !== undefined && !ready ? 'charging' : ''}`}
      style={{ '--c': color } as CSSProperties}
      aria-disabled={disabled}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        if (!disabled) onPress();
      }}
      onClick={(e) => {
        // Keyboard activation (Enter on a focused button) arrives as a click with detail 0.
        if (e.detail === 0 && !disabled) onPress();
      }}
    >
      <span className="exp-cmd-cool" style={{ transform: `scaleY(${fill})` }} />
      <span className="exp-cmd-icon">{icon}</span>
      <span className="exp-cmd-label">{label}</span>
      {sub && <span className="exp-cmd-sub">{sub}</span>}
      <span className="exp-cmd-keys">
        {keys.map((k) => (
          <kbd key={k}>{k}</kbd>
        ))}
      </span>
    </button>
  );
}

/* ======================================================================
 * RESULT
 * ==================================================================== */

function driftReason(p: Personality, log: ExpeditionLog, before: Creature, after: Creature): string {
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  switch (p) {
    case 'aggressive':
      return log.specials > 0 ? `you attacked ${plural(log.attacks, 'time')} and unleashed ${plural(log.specials, 'special')}` : `you attacked ${plural(log.attacks, 'time')}`;
    case 'agile':
      return log.perfectDodges > 0 ? `you dodged ${plural(log.dodges, 'time')} (${log.perfectDodges} perfect)` : `you dodged ${plural(log.dodges, 'time')}`;
    case 'defensive': {
      const parts: string[] = [];
      if (log.braces) parts.push(`braced ${plural(log.braces, 'time')}`);
      if (log.hitsTaken) parts.push(`took ${plural(log.hitsTaken, 'hit')}`);
      if (log.lowHpSurvived) parts.push('survived at low HP');
      return parts.length ? `it ${parts.join(', ')}` : 'it held its ground';
    }
    case 'curious': {
      const first = before.exposure[log.env] === 0;
      const parts: string[] = [];
      if (first) parts.push(`first visit to ${ENV_INFO[log.env].name}`);
      if (log.investigations) parts.push(`investigated ${plural(log.investigations, 'time')}`);
      return parts.length ? parts.join(', ') : `explored ${ENV_INFO[log.env].name} again`;
    }
    case 'adaptive': {
      const n = ENVIRONMENTS.filter((e) => after.exposure[e] > 0).length;
      return n >= 2 ? `it has now adapted to ${n} environments` : 'a taste of a new world';
    }
  }
}

function CountUp({ to, delay, reduced, onStart }: { to: number; delay: number; reduced: boolean; onStart?: () => void }) {
  const [v, setV] = useState(reduced ? to : 0);
  const startRef = useRef(onStart);
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const t0 = performance.now() + delay;
    let started = false;
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / 800));
      if (!started && now >= t0) {
        started = true;
        startRef.current?.();
      }
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, delay, reduced]);
  return <>{v}</>;
}

function ResultPhase({ data, onAgain, onLab }: { data: ResultData; onAgain: () => void; onLab: () => void }) {
  const { state } = useGame();
  const ui = useUI();
  const { log, outcome, run } = data;
  const reduced = state.settings.reducedMotion;
  const won = log.won;
  const latest = state.creatures.find((x) => x.id === run.creature.id) ?? outcome?.creature ?? run.creature;
  const evo = canEvolve(latest, state.resources.shards);
  const envInfo = ENV_INFO[log.env];

  if (!outcome) {
    return (
      <div className="exp-result glass">
        <h2 className="title-xl">Signal lost</h2>
        <p className="muted">{data.error ?? 'The expedition could not be recorded.'}</p>
        <div className="exp-result-actions">
          <button className="btn btn-ghost" onClick={onLab}>
            <FlaskConical size={16} /> Back to Lab
          </button>
        </div>
      </div>
    );
  }

  const r = outcome.rewards;
  const rewards: Array<{ key: string; label: string; value: number; color: string; icon: ReactNode }> = [
    { key: 'xp', label: 'Evolution XP', value: r.xp, color: 'var(--bio)', icon: <Dna size={18} /> },
    { key: 'bio', label: 'Bio-energy', value: r.bio, color: '#7dff8a', icon: <Zap size={18} /> },
    { key: 'shards', label: 'Mutation Shards', value: r.shards, color: 'var(--shard)', icon: <Sparkles size={18} /> },
    { key: 'dxp', label: 'Discovery XP', value: r.dxp, color: 'var(--dxp)', icon: <Compass size={18} /> },
  ];
  const drift = PERSONALITIES.map((p) => [p, r.tendencyDelta[p] ?? 0] as [Personality, number])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const after = outcome.creature;
  const need = xpToEvolve(after.stage);
  const sample = r.sample;

  return (
    <div className="exp-result">
      <div className={`exp-result-head ${won ? 'win' : 'lose'}`}>
        <div className="eyebrow">
          {envInfo.name} · {fmtTime(log.durationSec)} · {log.defeated}/2 defeated
        </div>
        <motion.h2 className="title-xl" initial={{ scale: reduced ? 1 : 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }}>
          {won ? 'VICTORY' : 'RETREAT'}
        </motion.h2>
        <p className="muted">{won ? `${run.creature.name} survived ${envInfo.name}.` : `${run.creature.name} pulled back to recover. Experience still counts.`}</p>
      </div>

      <div className="exp-result-grid">
        <section className="glass exp-panel">
          <div className="eyebrow exp-mini-title">Rewards</div>
          <div className="exp-rewards">
            {rewards.map((rw, i) => (
              <div key={rw.key} className="exp-reward" style={{ '--c': rw.color } as CSSProperties}>
                <span className="exp-reward-icon">{rw.icon}</span>
                <span className="exp-reward-val">
                  +<CountUp to={rw.value} delay={300 + i * 280} reduced={reduced} onStart={rw.value > 0 ? () => play('coin') : undefined} />
                </span>
                <span className="exp-reward-label">{rw.label}</span>
              </div>
            ))}
          </div>

          <div className="eyebrow exp-mini-title">Evolution progress</div>
          <XpBar xp={after.xp} need={need} from={run.creature.stage === after.stage ? run.creature.xp : undefined} />
          {evo.ok ? <p className="exp-note exp-ready">Ready to evolve!</p> : <p className="exp-note">{evo.reason}</p>}
        </section>

        <section className="glass exp-panel">
          <div className="eyebrow exp-mini-title">Behaviour drift</div>
          {drift.length ? (
            <ul className="exp-drift">
              {drift.map(([p, v], i) => (
                <motion.li key={p} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.12 }}>
                  <b style={{ color: PERSONALITY_INFO[p].color }}>
                    +{v} {PERSONALITY_INFO[p].name}
                  </b>
                  <span className="muted">: {driftReason(p, log, run.creature, after)}</span>
                </motion.li>
              ))}
            </ul>
          ) : (
            <p className="muted">No change in behaviour this time.</p>
          )}
          <TendencyBars tendencies={after.tendencies} compact />
        </section>

        <section className="glass exp-panel exp-sample">
          <div className="eyebrow exp-mini-title">Genetic sample</div>
          {sample ? (
            <>
              <div className="exp-sample-art">
                <CreatureSVG genome={sample.genome} stage={sample.stage} size="100%" />
              </div>
              <div className="exp-sample-name">
                <b>{sample.name}</b>
                {r.newDiscoveries.length > 0 && <span className="chip chip-sm exp-new">NEW SPECIES</span>}
              </div>
              <div className="exp-badges">
                <ElementBadge element={sample.genome.element} small />
                <RarityBadge rarity={creatureRarity(sample)} small />
              </div>
              <p className="exp-note">Recovered from a defeated organism and added to your collection.</p>
              <button className="btn btn-ghost btn-sm" onClick={() => ui.openCreature(sample.id)}>
                Inspect specimen
              </button>
            </>
          ) : (
            <p className="muted">{won ? 'No viable sample this time.' : 'Win an expedition to recover genetic samples.'}</p>
          )}
        </section>
      </div>

      <div className="exp-result-actions">
        {evo.ok && (
          <button className="btn btn-primary btn-lg exp-evolve-glow" style={{ '--c': 'var(--shard)' } as CSSProperties} onClick={() => ui.openEvolution(latest.id)}>
            <Dna size={18} /> EVOLVE NOW
          </button>
        )}
        <button className="btn btn-lg" style={{ '--c': envInfo.glow } as CSSProperties} onClick={onAgain}>
          <Compass size={18} /> Explore again
        </button>
        <button className="btn btn-ghost btn-lg" onClick={onLab}>
          <FlaskConical size={18} /> Back to Lab
        </button>
      </div>
    </div>
  );
}
