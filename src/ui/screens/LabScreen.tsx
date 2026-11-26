// Fusion Chamber: choose two organisms, compare their genes, fuse them and reveal the offspring.
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeftRight, Compass, Dna, IdCard, RotateCcw, Sparkles, TriangleAlert, Zap } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { play } from '../../audio/sfx';
import { dominant } from '../../engine/behaviour';
import {
  BACK_LABEL,
  BODY_LABEL,
  ELEMENT_INFO,
  EYE_LABEL,
  HEAD_LABEL,
  LIMB_LABEL,
  MOUTH_LABEL,
  MUTATION_INFO,
  PATTERN_LABEL,
  PERSONALITY_INFO,
  TAIL_LABEL,
  hsl,
} from '../../engine/data';
import { fusionCost, isOpposed } from '../../engine/fusion';
import { computeStats, creatureRarity } from '../../engine/genetics';
import type { Creature, FusionReport, Stats } from '../../engine/types';
import { CreatureSVG } from '../../render/CreatureSVG';
import { useGame } from '../../state/store';
import { CreatureTile, ElementBadge, RarityBadge, StagePips, StatBar } from '../components/common';
import { useUI } from '../uiContext';
import './lab.css';

type Phase = 'idle' | 'charging' | 'burst' | 'reveal';
type Slot = 'A' | 'B';
type Slots = Record<Slot, string | null>;

interface FusionRun {
  report: FusionReport;
  a: Creature;
  b: Creature;
}

const TIMING = {
  normal: { charge: 1800, burst: 500 },
  reduced: { charge: 400, burst: 200 },
};

const FALLBACK_A = '#82c6a6';
const FALLBACK_B = '#b6a1d6';

/** Typed helper for inline CSS custom properties. */
const vars = (v: Record<string, string | number>) => v as CSSProperties;

const elColor = (c: Creature | null, fallback: string) => (c ? ELEMENT_INFO[c.genome.element].color : fallback);

function initialSlots(list: Creature[], activeId: string | null): Slots {
  const a = list.find((c) => c.id === activeId) ?? list[0];
  if (!a) return { A: null, B: null };
  const others = list.filter((c) => c.id !== a.id);
  // Prefer a partner of a different element: makes the first fusion more interesting.
  const b = others.find((c) => c.genome.element !== a.genome.element) ?? others[0];
  return { A: a.id, B: b?.id ?? null };
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function LabScreen() {
  const { state, actions } = useGame();
  const ui = useUI();
  const reduced = state.settings.reducedMotion;
  const timing = reduced ? TIMING.reduced : TIMING.normal;
  const creatures = state.creatures;

  const [slots, setSlots] = useState<Slots>(() => initialSlots(state.creatures, state.activeCreatureId));
  const [focus, setFocus] = useState<Slot>('A');
  const [phase, setPhase] = useState<Phase>('idle');
  const [run, setRun] = useState<FusionRun | null>(null);
  const [travel, setTravel] = useState<Record<Slot, number>>({ A: 0, B: 0 });

  const timers = useRef<number[]>([]);
  const podARef = useRef<HTMLDivElement>(null);
  const podBRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((t) => window.clearTimeout(t));
  }, []);

  const a = creatures.find((c) => c.id === slots.A) ?? null;
  const b = creatures.find((c) => c.id === slots.B) ?? null;
  const ca = elColor(a, FALLBACK_A);
  const cb = elColor(b, FALLBACK_B);
  const cost = a && b ? fusionCost(a, b) : 0;
  const bio = state.resources.bio;
  const busy = phase !== 'idle';
  const opposed = !!a && !!b && isOpposed(a.genome.element, b.genome.element);
  const blocker = !a || !b ? 'Select two organisms to fuse' : bio < cost ? `Needs ${cost - bio} more Bio-energy` : null;
  // Newest first, so fresh offspring are easy to find.
  const ordered = [...creatures].reverse();

  function schedule(ms: number, fn: () => void) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function pickCreature(id: string) {
    if (busy) return;
    const other: Slot = focus === 'A' ? 'B' : 'A';
    setSlots((s) => {
      const next = { ...s };
      if (s[other] === id) next[other] = s[focus]; // already in the other pod: swap
      next[focus] = id;
      return next;
    });
    if (focus === 'A') setFocus('B');
  }

  function swap() {
    if (busy) return;
    play('click');
    setSlots((s) => ({ A: s.B, B: s.A }));
  }

  /** Horizontal distance from each pod's centre to the core's centre. */
  function measureTravel(): Record<Slot, number> {
    const core = coreRef.current?.getBoundingClientRect();
    const out = { A: 0, B: 0 };
    if (!core) return out;
    const cx = core.left + core.width / 2;
    for (const s of ['A', 'B'] as const) {
      const r = (s === 'A' ? podARef : podBRef).current?.getBoundingClientRect();
      if (r) out[s] = (cx - (r.left + r.width / 2)) * 0.72;
    }
    return out;
  }

  function doFuse() {
    if (busy || !a || !b) return;
    const res = actions.fuse(a.id, b.id);
    if (!res.ok) {
      play('error');
      actions.toast({ kind: 'error', title: res.error });
      return;
    }
    setTravel(measureTravel());
    setRun({ report: res.value, a, b });
    setPhase('charging');
    play('fuse_charge');
    schedule(timing.charge, () => {
      setPhase('burst');
      play('fuse_burst');
    });
    schedule(timing.charge + timing.burst, () => {
      setPhase('reveal');
      play('reveal');
    });
  }

  function fuseAgain() {
    play('click');
    if (run) setSlots({ A: run.report.child.id, B: run.b.id });
    setFocus('B');
    setRun(null);
    setPhase('idle');
  }

  return (
    <div className={`lab ${reduced ? 'lab-reduced' : ''}`} style={vars({ '--ca': ca, '--cb': cb })}>
      <header className="lab-head">
        <div>
          <div className="eyebrow">Genetics Lab</div>
          <h1 className="lab-title">Fusion Chamber</h1>
        </div>
        {state.fusionCount === 0 && phase === 'idle' && (
          <motion.p className="lab-hint" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <Sparkles size={15} /> Pick two organisms and press FUSE. Every fusion creates a brand-new species.
          </motion.p>
        )}
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {phase === 'reveal' && run ? (
          <FusionReveal
            key="reveal"
            run={run}
            reduced={reduced}
            onAgain={fuseAgain}
            onExpedition={() => {
              actions.setActive(run.report.child.id);
              ui.go('expedition');
            }}
            onShowcase={() => ui.openShowcase(run.report.child.id)}
          />
        ) : (
          <motion.div key="chamber" className="lab-body" exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <section className={`lab-chamber glass lab-phase-${phase}`}>
              <div className="lab-chamber-bg" aria-hidden />
              <div className="lab-stage">
                <Helix side="A" phase={phase} visible={!!a && !!b} />
                <Helix side="B" phase={phase} visible={!!a && !!b} />
                <Pod slot="A" creature={a} focused={focus === 'A' && !busy} phase={phase} travel={travel.A} chargeMs={timing.charge} reduced={reduced} podRef={podARef} onFocus={() => setFocus('A')} />
                <div className="lab-core-col">
                  <div className="lab-core-anchor" ref={coreRef}>
                    <FusionCore phase={phase} chargeMs={timing.charge} />
                    {phase === 'burst' && <BurstFx colors={[ca, cb]} reduced={reduced} />}
                  </div>
                  <button type="button" className="btn btn-ghost btn-icon lab-swap" onClick={swap} disabled={busy || !a || !b} aria-label="Swap pods" title="Swap pods">
                    <ArrowLeftRight size={16} />
                  </button>
                </div>
                <Pod slot="B" creature={b} focused={focus === 'B' && !busy} phase={phase} travel={travel.B} chargeMs={timing.charge} reduced={reduced} podRef={podBRef} onFocus={() => setFocus('B')} />
              </div>

              <div className="lab-fusebar">
                {opposed && (
                  <div className="lab-opposed">
                    <Sparkles size={14} /> Opposed elements: anomaly chance boosted
                  </div>
                )}
                <button type="button" className="btn btn-primary btn-lg lab-fuse-btn" disabled={!!blocker || busy} onClick={doFuse}>
                  <Zap size={19} />
                  {busy ? 'FUSING' : 'FUSE'}
                  {a && b && (
                    <span className="lab-fuse-cost">
                      {cost} Bio-energy
                    </span>
                  )}
                </button>
                <div className="lab-fuse-meta">{blocker ? <span className="lab-blocker">{blocker}</span> : <span className="dim">You have {bio} Bio-energy</span>}</div>
              </div>
            </section>

            <section className={`lab-picker glass ${busy ? 'lab-locked' : ''}`}>
              <div className="lab-panel-head">
                <span className="eyebrow">Specimens · {creatures.length}</span>
                <span className="lab-picker-target">
                  Assigning to{' '}
                  <b style={{ color: focus === 'A' ? ca : cb }}>Pod {focus}</b>
                </span>
              </div>
              <div className="lab-picker-row">
                {ordered.map((c) => {
                  const inSlot: Slot | null = c.id === slots.A ? 'A' : c.id === slots.B ? 'B' : null;
                  const remix = c.origin === 'imported';
                  return (
                    <CreatureTile
                      key={c.id}
                      creature={c}
                      selected={!!inSlot}
                      disabled={busy}
                      size={92}
                      onClick={() => pickCreature(c.id)}
                      badge={
                        inSlot || remix ? (
                          <span className="lab-tile-badges">
                            {remix && <span className="lab-remix-badge">Remix</span>}
                            {inSlot && <span className="lab-slot-badge">{inSlot}</span>}
                          </span>
                        ) : undefined
                      }
                    />
                  );
                })}
              </div>
            </section>

            <section className="lab-traits glass">
              <div className="lab-panel-head">
                <span className="eyebrow">Genetic comparison</span>
                {opposed && <span className="lab-opposed-mini">Opposed elements: anomaly chance boosted</span>}
              </div>
              <TraitTable a={a} b={b} />
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      <ScreenFx phase={phase} ca={run ? elColor(run.a, FALLBACK_A) : ca} cb={run ? elColor(run.b, FALLBACK_B) : cb} chargeMs={timing.charge} reduced={reduced} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chamber pieces
// ---------------------------------------------------------------------------

const BUBBLES = [
  { l: 18, s: 6, d: 0, t: 5.2 },
  { l: 34, s: 4, d: 1.8, t: 4.4 },
  { l: 52, s: 8, d: 0.9, t: 6.1 },
  { l: 66, s: 5, d: 2.6, t: 4.8 },
  { l: 80, s: 4, d: 3.4, t: 5.6 },
  { l: 44, s: 3, d: 4.1, t: 3.9 },
];

function Pod({
  slot,
  creature,
  focused,
  phase,
  travel,
  chargeMs,
  reduced,
  podRef,
  onFocus,
}: {
  slot: Slot;
  creature: Creature | null;
  focused: boolean;
  phase: Phase;
  travel: number;
  chargeMs: number;
  reduced: boolean;
  podRef: RefObject<HTMLDivElement | null>;
  onFocus: () => void;
}) {
  const color = elColor(creature, '#616a7d');
  const target =
    phase === 'charging'
      ? { x: travel, scale: 0.55, opacity: 1 }
      : phase === 'burst'
        ? { x: travel * 1.3, scale: 0.15, opacity: 0 }
        : { x: 0, scale: 1, opacity: 1 };
  const transition =
    phase === 'charging'
      ? { duration: chargeMs / 1000, ease: [0.55, 0, 0.8, 0.35] as const }
      : { duration: phase === 'burst' ? 0.18 : 0.35, ease: 'easeOut' as const };

  return (
    <div className={`lab-pod-wrap lab-pod-${slot}`} ref={podRef}>
      <motion.button
        type="button"
        className={`lab-pod ${focused ? 'focused' : ''} ${creature ? '' : 'empty'}`}
        style={vars({ '--pc': color })}
        onClick={() => {
          play('click');
          onFocus();
        }}
        disabled={phase !== 'idle'}
        animate={target}
        transition={transition}
        aria-label={`Pod ${slot}: ${creature ? creature.name : 'empty'}. Click to choose a specimen for this pod.`}
        aria-pressed={focused}
      >
        <span className="lab-pod-tag">
          Pod {slot}
          {focused && <i>selecting</i>}
        </span>
        <span className="lab-capsule">
          <span className="lab-capsule-fluid" />
          {!reduced && (
            <span className="lab-bubbles" aria-hidden>
              {BUBBLES.map((bb, i) => (
                <i key={i} style={{ left: `${bb.l}%`, width: bb.s, height: bb.s, animationDelay: `${bb.d}s`, animationDuration: `${bb.t}s` }} />
              ))}
            </span>
          )}
          {creature ? (
            <span className="lab-pod-art">
              <CreatureSVG genome={creature.genome} stage={creature.stage} size="100%" animated={!reduced} personality={dominant(creature.tendencies)} />
            </span>
          ) : (
            <span className="lab-pod-empty">
              <Dna size={26} />
              Choose a specimen
            </span>
          )}
          <span className="lab-capsule-charge" />
          <span className="lab-capsule-glint" />
        </span>
        <span className="lab-pod-base" />
      </motion.button>
      <div className="lab-pod-info">
        {creature ? (
          <>
            <b className="lab-pod-name">{creature.name}</b>
            <span className="lab-pod-badges">
              <RarityBadge rarity={creatureRarity(creature)} small />
              <ElementBadge element={creature.genome.element} small />
              <StagePips stage={creature.stage} />
            </span>
          </>
        ) : (
          <span className="dim">Empty pod</span>
        )}
      </div>
    </div>
  );
}

// Periodic double helix. Track is drawn 2x wide so a -50% translate loops seamlessly.
const HELIX_W = 400;
const HELIX_H = 60;
const HELIX = buildHelix(HELIX_W, HELIX_H, 4);

function buildHelix(w: number, h: number, periods: number) {
  const mid = h / 2;
  const amp = h * 0.34;
  const k = (periods * Math.PI * 2) / w;
  const strand = (phase: number) => {
    let d = '';
    for (let i = 0; i <= 160; i++) {
      const x = (i / 160) * w;
      d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${(mid + Math.sin(x * k + phase) * amp).toFixed(1)}`;
    }
    return d;
  };
  const rungs: Array<[number, number, number]> = [];
  const n = periods * 8;
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * (w / n);
    const s = Math.sin(x * k) * amp;
    rungs.push([x, mid + s, mid - s]);
  }
  return { s1: strand(0), s2: strand(Math.PI), rungs };
}

function HelixTrack({ c1, c2 }: { c1: string; c2: string }) {
  return (
    <span className="lab-helix-track">
      <svg viewBox={`0 0 ${HELIX_W} ${HELIX_H}`} preserveAspectRatio="none" aria-hidden>
        {HELIX.rungs.map(([x, y1, y2], i) => (
          <line key={i} x1={x} y1={y1} x2={x} y2={y2} stroke={i % 2 ? c1 : c2} strokeOpacity={0.45} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        ))}
        <path d={HELIX.s1} fill="none" stroke={c1} strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={HELIX.s2} fill="none" stroke={c2} strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}

function Helix({ side, phase, visible }: { side: Slot; phase: Phase; visible: boolean }) {
  const c = side === 'A' ? 'var(--ca)' : 'var(--cb)';
  return (
    <span className={`lab-helix lab-helix-${side} ${visible ? 'on' : ''} ${phase === 'charging' ? 'charging' : ''}`} aria-hidden>
      <HelixTrack c1={c} c2="#ffffff" />
    </span>
  );
}

function FusionCore({ phase, chargeMs }: { phase: Phase; chargeMs: number }) {
  const anim =
    phase === 'charging'
      ? { scale: 1.45, opacity: 1 }
      : phase === 'burst'
        ? { scale: 0.1, opacity: 0 }
        : { scale: 1, opacity: 1 };
  const transition =
    phase === 'charging' ? { duration: chargeMs / 1000, ease: 'easeIn' as const } : { duration: phase === 'burst' ? 0.15 : 0.4 };
  return (
    <motion.div className={`lab-core ${phase === 'charging' ? 'charging' : ''}`} animate={anim} transition={transition} aria-hidden>
      <span className="lab-core-halo" />
      <span className="lab-core-ring lab-ring-1" />
      <span className="lab-core-ring lab-ring-2" />
      <span className="lab-core-orb">
        <span className="lab-core-dna">
          <HelixTrack c1="var(--ca)" c2="var(--cb)" />
        </span>
      </span>
      <span className="lab-core-shine" />
    </motion.div>
  );
}

interface Particle {
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  dur: number;
}

function makeParticles(count: number, colors: string[], minDist: number, maxDist: number): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const ang = Math.random() * Math.PI * 2;
    const dist = minDist + Math.random() * (maxDist - minDist);
    return {
      x: Math.cos(ang) * dist,
      y: Math.sin(ang) * dist,
      size: 3 + Math.random() * 8,
      color: i % 4 === 3 ? '#ffffff' : colors[i % colors.length],
      delay: Math.random() * 0.12,
      dur: 0.7 + Math.random() * 0.5,
    };
  });
}

function BurstFx({ colors, reduced }: { colors: string[]; reduced: boolean }) {
  const [parts] = useState(() => makeParticles(reduced ? 0 : 30, colors, 120, 360));
  return (
    <span className="lab-burst" aria-hidden>
      <motion.span className="lab-shock" initial={{ scale: 0.2, opacity: 1 }} animate={{ scale: 7, opacity: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }} />
      <motion.span className="lab-shock lab-shock-2" initial={{ scale: 0.2, opacity: 0.8 }} animate={{ scale: 4.5, opacity: 0 }} transition={{ duration: 0.55, ease: 'easeOut', delay: 0.06 }} />
      {parts.map((p, i) => (
        <motion.i
          key={i}
          className="lab-spark"
          style={{ width: p.size, height: p.size, background: p.color, boxShadow: `0 0 6px ${p.color}66` }}
          initial={{ x: 0, y: 0, scale: 1.2, opacity: 1 }}
          animate={{ x: p.x, y: p.y, scale: 0.2, opacity: 0 }}
          transition={{ duration: p.dur, delay: p.delay, ease: [0.1, 0.8, 0.3, 1] }}
        />
      ))}
    </span>
  );
}

/** Full-viewport glow + flash. Portalled to body so the screen wrapper's filter can't clip `position: fixed`. */
function ScreenFx({ phase, ca, cb, chargeMs, reduced }: { phase: Phase; ca: string; cb: string; chargeMs: number; reduced: boolean }) {
  const glowing = phase === 'charging' || phase === 'burst';
  return createPortal(
    <AnimatePresence>
      {glowing && (
        <motion.div
          key="glow"
          className="lab-screen-glow"
          style={vars({ '--ca': ca, '--cb': cb })}
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'burst' ? 1 : 0.85 }}
          exit={{ opacity: 0, transition: { duration: 0.9 } }}
          transition={{ duration: phase === 'charging' ? chargeMs / 1000 : 0.1, ease: 'easeIn' }}
        />
      )}
      {phase === 'burst' && (
        <motion.div
          key="flash"
          className="lab-flash"
          initial={{ opacity: 0 }}
          animate={{ opacity: reduced ? 0.35 : 1 }}
          exit={{ opacity: 0, transition: { duration: 0.75, ease: 'easeOut' } }}
          transition={{ duration: 0.12 }}
        />
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Trait comparison
// ---------------------------------------------------------------------------

interface TraitRow {
  label: string;
  get: (c: Creature) => string;
  color?: (c: Creature) => string;
}

const TRAIT_ROWS: TraitRow[] = [
  { label: 'Body', get: (c) => BODY_LABEL[c.genome.body] },
  { label: 'Head', get: (c) => HEAD_LABEL[c.genome.head] },
  { label: 'Back', get: (c) => BACK_LABEL[c.genome.back] },
  { label: 'Limbs', get: (c) => LIMB_LABEL[c.genome.limbs] },
  { label: 'Tail', get: (c) => TAIL_LABEL[c.genome.tail] },
  { label: 'Pattern', get: (c) => PATTERN_LABEL[c.genome.pattern] },
  { label: 'Eyes', get: (c) => EYE_LABEL[c.genome.eyes] },
  { label: 'Mouth', get: (c) => MOUTH_LABEL[c.genome.mouth] },
  { label: 'Element', get: (c) => ELEMENT_INFO[c.genome.element].name, color: (c) => ELEMENT_INFO[c.genome.element].color },
  { label: 'Personality', get: (c) => PERSONALITY_INFO[dominant(c.tendencies)].name, color: (c) => PERSONALITY_INFO[dominant(c.tendencies)].color },
  { label: 'Mutations', get: (c) => c.genome.mutations.map((m) => MUTATION_INFO[m].name).join(', ') || 'None' },
];

function TraitTable({ a, b }: { a: Creature | null; b: Creature | null }) {
  return (
    <div className="lab-tt" role="table" aria-label="Trait comparison">
      <div className="lab-tt-row lab-tt-head" role="row">
        <span role="columnheader" style={{ color: 'var(--ca)' }}>
          {a?.name ?? 'Pod A'}
        </span>
        <span role="columnheader">Gene</span>
        <span role="columnheader" style={{ color: 'var(--cb)' }}>
          {b?.name ?? 'Pod B'}
        </span>
      </div>
      {TRAIT_ROWS.map((r) => {
        const va = a ? r.get(a) : '—';
        const vb = b ? r.get(b) : '—';
        const same = !!a && !!b && va === vb;
        return (
          <div key={r.label} className={`lab-tt-row ${same ? 'same' : ''}`} role="row">
            <span role="cell" className="lab-tt-a" style={a && r.color ? { color: r.color(a) } : undefined}>
              {va}
            </span>
            <span role="rowheader" className="lab-tt-label">
              {r.label}
            </span>
            <span role="cell" className="lab-tt-b" style={b && r.color ? { color: r.color(b) } : undefined}>
              {vb}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reveal
// ---------------------------------------------------------------------------

const STAT_META: Array<{ key: keyof Stats; label: string; max: number; color: string }> = [
  { key: 'vigor', label: 'Vigor', max: 160, color: '#9cc48a' },
  { key: 'power', label: 'Power', max: 40, color: '#df8a5e' },
  { key: 'guard', label: 'Guard', max: 16, color: '#7ea4cf' },
  { key: 'speed', label: 'Speed', max: 28, color: '#86c4a0' },
  { key: 'focus', label: 'Focus', max: 28, color: '#b6a1d6' },
];

function Letters({ text, delay, reduced }: { text: string; delay: number; reduced: boolean }) {
  return (
    <span className="lab-letters" aria-label={text}>
      {[...text].map((ch, i) => (
        <motion.span
          key={i}
          aria-hidden
          initial={{ opacity: 0, y: reduced ? 0 : 22, scale: reduced ? 1 : 1.4 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: delay + (reduced ? 0 : i * 0.05), duration: reduced ? 0.2 : 0.45, ease: [0.2, 0.9, 0.3, 1.2] }}
        >
          {ch === ' ' ? '\u00a0' : ch}
        </motion.span>
      ))}
    </span>
  );
}

function RevealSparks({ colors }: { colors: string[] }) {
  const [parts] = useState(() => makeParticles(22, colors, 110, 190));
  return (
    <span className="lab-reveal-sparks" aria-hidden>
      {parts.map((p, i) => (
        <motion.i
          key={i}
          className="lab-spark"
          style={{ width: p.size * 0.7, height: p.size * 0.7, background: p.color, boxShadow: `0 0 5px ${p.color}66` }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
          animate={{ x: p.x, y: p.y, opacity: [0, 1, 0], scale: [0.4, 1, 0.3] }}
          transition={{ duration: 2.2 + p.dur, delay: 0.6 + p.delay * 12, repeat: Infinity, ease: 'easeOut' }}
        />
      ))}
    </span>
  );
}

function TraitTag({ from, a, b }: { from: FusionReport['inherited'][number]['from']; a: Creature; b: Creature }) {
  if (from === 'A' || from === 'B') {
    const p = from === 'A' ? a : b;
    return (
      <span className="lab-tag" style={vars({ '--t': ELEMENT_INFO[p.genome.element].color })}>
        {p.name}
      </span>
    );
  }
  if (from === 'blend') return <span className="lab-tag lab-tag-blend">Blend</span>;
  return <span className="lab-tag lab-tag-new">NEW</span>;
}

function FusionReveal({
  run,
  reduced,
  onAgain,
  onExpedition,
  onShowcase,
}: {
  run: FusionRun;
  reduced: boolean;
  onAgain: () => void;
  onExpedition: () => void;
  onShowcase: () => void;
}) {
  const { report, a, b } = run;
  const child = report.child;
  const g = child.genome;
  const el = ELEMENT_INFO[g.element];
  const colA = elColor(a, FALLBACK_A);
  const colB = elColor(b, FALLBACK_B);
  const stats = computeStats(child);
  const mutation = report.mutation ? MUTATION_INFO[report.mutation] : null;

  // Choreography (seconds from mount).
  const sil = reduced ? 0.1 : 0.9;
  const nameAt = sil + (reduced ? 0.1 : 0.35);
  const infoAt = nameAt + (reduced ? 0.1 : Math.min(0.9, child.name.length * 0.05) + 0.2);
  const listAt = infoAt + (reduced ? 0 : 0.35);
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: reduced ? 0 : 14 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: reduced ? 0.2 : 0.45, ease: 'easeOut' as const },
  });

  return (
    <motion.section
      className={`lab-reveal ${report.anomaly ? 'lab-reveal-anomaly' : ''}`}
      style={vars({ '--rc': el.color, '--rc2': el.color2, '--ca': colA, '--cb': colB })}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
    >
      {report.anomaly && (
        <motion.div className="lab-anomaly-banner" role="status" initial={{ opacity: 0, scaleX: 0.4 }} animate={{ opacity: 1, scaleX: 1 }} transition={{ delay: sil, duration: 0.4 }}>
          <TriangleAlert size={16} />
          <b>ANOMALY DETECTED</b>
          <span>Impossible genetics stabilised</span>
        </motion.div>
      )}

      <div className="lab-reveal-hero glass">
        <div className="lab-reveal-stage">
          <span className="lab-rays" aria-hidden />
          {report.anomaly && <span className="lab-reveal-prism" aria-hidden />}
          <motion.span className="lab-reveal-glow" aria-hidden initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: sil * 0.8, duration: 0.8 }} />
          {!reduced && <RevealSparks colors={[el.color, el.color2, colA, colB]} />}
          <div className="lab-reveal-art">
            <motion.div className="lab-reveal-layer" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: sil, duration: 0.7, ease: 'easeOut' }}>
              <CreatureSVG genome={g} stage={child.stage} size="100%" animated={!reduced} personality={dominant(child.tendencies)} />
            </motion.div>
            <motion.div
              className="lab-reveal-layer lab-reveal-sil"
              initial={{ opacity: 1, scale: reduced ? 1 : 0.82 }}
              animate={{ opacity: 0, scale: 1.03 }}
              transition={{ opacity: { delay: sil, duration: 0.6 }, scale: { duration: sil + 0.3, ease: 'easeOut' } }}
            >
              <CreatureSVG genome={g} stage={child.stage} size="100%" animated={false} silhouette shadow={false} />
            </motion.div>
          </div>
        </div>

        <div className="lab-reveal-info">
          <motion.div className="eyebrow" {...rise(nameAt - 0.1)}>
            {report.anomaly ? 'Anomalous organism synthesised' : 'New organism synthesised'}
          </motion.div>
          <h2 className={`lab-reveal-name ${report.anomaly ? 'lab-glitch' : ''}`} data-text={child.name}>
            <Letters text={child.name} delay={nameAt} reduced={reduced} />
          </h2>
          <motion.div className="lab-reveal-badges" {...rise(infoAt)}>
            <RarityBadge rarity={creatureRarity(child)} />
            <ElementBadge element={g.element} />
            <span className="chip">Generation {child.generation}</span>
          </motion.div>
          <motion.p className="lab-reveal-parents" {...rise(infoAt + 0.08)}>
            Fused from <b style={{ color: colA }}>{a.name}</b>
            <span className="lab-plus">+</span>
            <b style={{ color: colB }}>{b.name}</b>
          </motion.p>
          {mutation && (
            <motion.div className="lab-mutation-card" {...rise(infoAt + 0.2)}>
              <span className="lab-mutation-icon">
                <Dna size={18} />
              </span>
              <div>
                <div className="lab-mutation-kicker">Mutation</div>
                <b>{mutation.name}</b>
                <p>{mutation.description}</p>
              </div>
            </motion.div>
          )}
          <motion.div className="lab-reveal-actions" {...rise(infoAt + 0.3)}>
            <button type="button" className="btn btn-primary" onClick={onExpedition}>
              <Compass size={16} /> Send on Expedition
            </button>
            <button type="button" className="btn" style={vars({ '--c': el.color })} onClick={onShowcase}>
              <IdCard size={16} /> View Specimen Card
            </button>
            <button type="button" className="btn btn-ghost" onClick={onAgain}>
              <RotateCcw size={16} /> Fuse Again
            </button>
          </motion.div>
        </div>
      </div>

      <div className="lab-reveal-grid">
        <motion.section className="glass lab-panel" {...rise(listAt)}>
          <div className="lab-panel-head">
            <span className="eyebrow">Inherited genes</span>
            <span className="lab-legend">
              <i style={{ background: colA }} />
              {a.name}
              <i style={{ background: colB }} />
              {b.name}
            </span>
          </div>
          <ul className="lab-inherit">
            {report.inherited.map((t, i) => (
              <motion.li
                key={`${t.trait}-${i}`}
                className={t.from === 'mutation' ? 'is-new' : undefined}
                initial={{ opacity: 0, x: reduced ? 0 : -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: listAt + (reduced ? 0 : 0.1 + i * 0.06), duration: 0.3 }}
              >
                <span className="lab-inherit-trait">{t.trait}</span>
                <span className="lab-inherit-value">
                  {t.trait === 'Colour' && (
                    <span className="lab-swatches" aria-hidden>
                      <i style={{ background: hsl(g.primary) }} />
                      <i style={{ background: hsl(g.secondary) }} />
                      <i style={{ background: hsl(g.accent) }} />
                    </span>
                  )}
                  {t.value}
                </span>
                <TraitTag from={t.from} a={a} b={b} />
              </motion.li>
            ))}
          </ul>
        </motion.section>

        <motion.section className="glass lab-panel lab-stats" {...rise(listAt + 0.1)}>
          <div className="lab-panel-head">
            <span className="eyebrow">Initial stats</span>
            <span className="dim">Stage {child.stage}</span>
          </div>
          <div className="lab-stat-list">
            {STAT_META.map((s) => (
              <StatBar key={s.key} label={s.label} value={stats[s.key]} max={s.max} color={s.color} />
            ))}
          </div>
          <p className="lab-stats-note dim">Expeditions shape its temperament. Temperament shapes what it evolves into.</p>
        </motion.section>
      </div>
    </motion.section>
  );
}
