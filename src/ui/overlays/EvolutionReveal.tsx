// Full-screen evolution sequence: dim -> charge -> morph -> burst -> reveal with before/after breakdown.
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Share2, SkipForward } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { play } from '../../audio/sfx';
import { dominant } from '../../engine/behaviour';
import { ELEMENT_INFO } from '../../engine/data';
import { computeStats, creatureRarity } from '../../engine/genetics';
import type { Creature, EvolutionResult, Stats } from '../../engine/types';
import { CreatureSVG } from '../../render/CreatureSVG';
import { useGame } from '../../state/store';
import { ElementBadge, RarityBadge, StagePips } from '../components/common';
import { useUI } from '../uiContext';
import './evolution.css';

type Phase = 'dim' | 'charge' | 'morph' | 'burst' | 'reveal';

const DURATIONS = {
  normal: { dim: 700, charge: 2800, morph: 1400, burst: 600 },
  reduced: { dim: 200, charge: 500, morph: 300, burst: 200 },
};

const STATS: Array<{ key: keyof Stats; label: string }> = [
  { key: 'vigor', label: 'Vigor' },
  { key: 'power', label: 'Power' },
  { key: 'guard', label: 'Guard' },
  { key: 'speed', label: 'Speed' },
  { key: 'focus', label: 'Focus' },
];

/** Typed helper for inline CSS custom properties. */
const vars = (v: Record<string, string | number>) => v as CSSProperties;

export default function EvolutionReveal({ creatureId, onClose }: { creatureId: string; onClose: () => void }) {
  const { state, actions } = useGame();
  const ui = useUI();
  const reduced = state.settings.reducedMotion;
  const dur = reduced ? DURATIONS.reduced : DURATIONS.normal;

  // Snapshot of the creature before evolving, used until the result arrives.
  const [initial] = useState<Creature | null>(() => state.creatures.find((c) => c.id === creatureId) ?? null);
  const [result, setResult] = useState<EvolutionResult | null>(null);
  const [phase, setPhase] = useState<Phase>('dim');
  const started = useRef(false);
  const resultRef = useRef<EvolutionResult | null>(null);
  const timeline = useRef<number[]>([]);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Evolve exactly once (StrictMode double-invokes effects in dev), then run the phase timeline.
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      const res = actions.evolve(creatureId);
      if (!res.ok) {
        play('error');
        actions.toast({ kind: 'error', title: res.error });
        closeRef.current();
        return;
      }
      resultRef.current = res.value;
    }
    const value = resultRef.current;
    if (!value) return;
    const d = reduced ? DURATIONS.reduced : DURATIONS.normal;
    const ids: number[] = [];
    const at = (ms: number, fn: () => void) => ids.push(window.setTimeout(fn, ms));
    let t = d.dim;
    at(t, () => {
      setResult(value);
      setPhase('charge');
      play('evolve_charge');
    });
    t += d.charge;
    at(t, () => setPhase('morph'));
    t += d.morph;
    at(t, () => {
      setPhase('burst');
      play('evolve_burst');
    });
    t += d.burst;
    at(t, () => {
      setPhase('reveal');
      play('reveal');
    });
    timeline.current = ids;
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [actions, creatureId, reduced]);

  // Esc closes only once the reveal is showing.
  useEffect(() => {
    if (phase !== 'reveal') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onClose]);

  // Lock page scroll behind the overlay.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function skip() {
    const value = resultRef.current;
    if (!value) return;
    timeline.current.forEach((id) => window.clearTimeout(id));
    timeline.current = [];
    play('reveal');
    setResult(value);
    setPhase('reveal');
  }

  const before = result?.before ?? initial;
  if (!before) return null;
  const el = ELEMENT_INFO[before.genome.element];
  const revealed = phase === 'reveal' && result;

  return (
    <motion.div
      className={`evo evo-p-${phase} ${reduced ? 'evo-reduced' : ''}`}
      style={vars({ '--ec': el.color, '--ec2': el.color2, '--ed': el.dark })}
      role="dialog"
      aria-modal="true"
      aria-label={`${before.name} is evolving`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0.15 : 0.6 }}
    >
      <div className="evo-backdrop" aria-hidden />
      <div className="evo-glowfield" aria-hidden />
      <div className="evo-fx" aria-hidden>
        <span className="evo-rays" />
        {(phase === 'burst' || phase === 'reveal') && !reduced && <Explosion colors={[el.color, el.color2, '#ffffff']} />}
      </div>

      {revealed ? (
        <Reveal result={result} reduced={reduced} onClose={onClose} onShare={() => {
          ui.openShowcase(result.after.id);
          onClose();
        }} />
      ) : (
        <Sequence before={before} after={result?.after ?? null} phase={phase} reduced={reduced} morphMs={dur.morph} chargeMs={dur.charge} />
      )}

      <AnimatePresence>
        {phase === 'burst' && (
          <motion.div
            key="flash"
            className="evo-flash"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: reduced ? 0.4 : 1 }}
            exit={{ opacity: 0, transition: { duration: reduced ? 0.2 : 0.9, ease: 'easeOut' } }}
            transition={{ duration: 0.1 }}
          />
        )}
      </AnimatePresence>

      {phase !== 'reveal' && (
        <button type="button" className="btn btn-ghost btn-sm evo-skip" onClick={skip}>
          <SkipForward size={14} /> Skip
        </button>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Build-up sequence
// ---------------------------------------------------------------------------

function Sequence({
  before,
  after,
  phase,
  reduced,
  morphMs,
  chargeMs,
}: {
  before: Creature;
  after: Creature | null;
  phase: Phase;
  reduced: boolean;
  morphMs: number;
  chargeMs: number;
}) {
  const subject =
    phase === 'dim'
      ? { scale: 1, opacity: 1 }
      : phase === 'charge'
        ? { scale: 1.06, opacity: 1 }
        : phase === 'morph'
          ? { scale: 1.22, opacity: 1 }
          : { scale: 1.4, opacity: 0 };
  const transition =
    phase === 'charge'
      ? { duration: chargeMs / 1000, ease: 'easeIn' as const }
      : phase === 'morph'
        ? { duration: morphMs / 1000, ease: 'easeIn' as const }
        : { duration: 0.25 };
  const caption = phase === 'dim' ? 'Energy readings spiking' : phase === 'charge' ? `${before.name} is evolving` : phase === 'morph' ? 'Rewriting genome' : '';

  return (
    <div className="evo-stage">
      <motion.div className="evo-subject" initial={{ scale: 0.92, opacity: 0 }} animate={subject} transition={transition}>
        <span className="evo-subject-aura" aria-hidden />
        {(phase === 'charge' || phase === 'morph') && (
          <span className="evo-rings" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
        )}
        {phase === 'charge' && !reduced && <Converge color={ELEMENT_INFO[before.genome.element].color} color2={ELEMENT_INFO[before.genome.element].color2} />}
        <div className="evo-subject-art">
          {phase === 'morph' && after ? (
            <Morph before={before} after={after} reduced={reduced} durMs={morphMs} />
          ) : (
            <CreatureSVG genome={before.genome} stage={before.stage} size="100%" animated={phase === 'dim' && !reduced} personality={dominant(before.tendencies)} />
          )}
          <span className="evo-subject-glow" aria-hidden />
        </div>
      </motion.div>
      <AnimatePresence mode="wait">
        {caption && (
          <motion.div key={caption} className="evo-caption" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}>
            {caption}
            <span className="evo-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Alternates before/after silhouettes with increasing frequency, ending on "after". */
function Morph({ before, after, reduced, durMs }: { before: Creature; after: Creature; reduced: boolean; durMs: number }) {
  const [showAfter, setShowAfter] = useState(false);
  useEffect(() => {
    let id = 0;
    if (reduced) {
      id = window.setTimeout(() => setShowAfter(true), durMs / 2);
      return () => window.clearTimeout(id);
    }
    let delay = 240;
    let elapsed = 0;
    let flag = false;
    const tick = () => {
      flag = !flag;
      setShowAfter(flag);
      elapsed += delay;
      delay = Math.max(34, delay * 0.78);
      if (elapsed + delay < durMs - 120) id = window.setTimeout(tick, delay);
      else id = window.setTimeout(() => setShowAfter(true), delay);
    };
    id = window.setTimeout(tick, delay);
    return () => window.clearTimeout(id);
  }, [reduced, durMs]);

  return (
    <span className="evo-morph">
      <span className="evo-sil" style={{ opacity: showAfter ? 0 : 1 }}>
        <CreatureSVG genome={before.genome} stage={before.stage} size="100%" animated={false} silhouette shadow={false} lite />
      </span>
      <span className="evo-sil" style={{ opacity: showAfter ? 1 : 0 }}>
        <CreatureSVG genome={after.genome} stage={after.stage} size="100%" animated={false} silhouette shadow={false} lite />
      </span>
    </span>
  );
}

interface Mote {
  x: number;
  y: number;
  rot: number;
  len: number;
  color: string;
  delay: number;
  dur: number;
  rest: number;
}

/** Energy motes streaming in from the screen edges toward the creature. */
function Converge({ color, color2 }: { color: string; color2: string }) {
  const [motes] = useState<Mote[]>(() => {
    const r = Math.hypot(window.innerWidth, window.innerHeight) / 2 + 40;
    return Array.from({ length: 34 }, (_, i) => {
      const ang = Math.random() * Math.PI * 2;
      const rr = r * (0.75 + Math.random() * 0.3);
      return {
        x: Math.cos(ang) * rr,
        y: Math.sin(ang) * rr,
        rot: (ang * 180) / Math.PI,
        len: 14 + Math.random() * 30,
        color: i % 3 === 0 ? '#ffffff' : i % 2 ? color : color2,
        delay: Math.random() * 1.6,
        dur: 0.8 + Math.random() * 0.6,
        rest: Math.random() * 0.3,
      };
    });
  });
  return (
    <span className="evo-converge" aria-hidden>
      {motes.map((m, i) => (
        <motion.i
          key={i}
          style={{ width: m.len, background: `linear-gradient(90deg, ${m.color}, transparent)`, boxShadow: `0 0 8px ${m.color}`, rotate: m.rot }}
          initial={{ x: m.x, y: m.y, opacity: 0 }}
          animate={{ x: [m.x, m.x * 0.08], y: [m.y, m.y * 0.08], opacity: [0, 1, 0] }}
          transition={{ duration: m.dur, delay: m.delay, repeat: Infinity, repeatDelay: m.rest, ease: 'easeIn' }}
        />
      ))}
    </span>
  );
}

interface Spark {
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  dur: number;
}

function Explosion({ colors }: { colors: string[] }) {
  const [sparks] = useState<Spark[]>(() =>
    Array.from({ length: 40 }, (_, i) => {
      const ang = Math.random() * Math.PI * 2;
      const dist = 160 + Math.random() * 360;
      return {
        x: Math.cos(ang) * dist,
        y: Math.sin(ang) * dist,
        size: 3 + Math.random() * 9,
        color: colors[i % colors.length],
        delay: Math.random() * 0.15,
        dur: 0.9 + Math.random() * 0.8,
      };
    }),
  );
  return (
    <span className="evo-explosion">
      <motion.span className="evo-shock" initial={{ scale: 0.2, opacity: 1 }} animate={{ scale: 9, opacity: 0 }} transition={{ duration: 0.9, ease: 'easeOut' }} />
      <motion.span className="evo-shock evo-shock-2" initial={{ scale: 0.2, opacity: 0.9 }} animate={{ scale: 6, opacity: 0 }} transition={{ duration: 0.7, delay: 0.08, ease: 'easeOut' }} />
      {sparks.map((s, i) => (
        <motion.i
          key={i}
          style={{ width: s.size, height: s.size, background: s.color, boxShadow: `0 0 14px ${s.color}` }}
          initial={{ x: 0, y: 0, scale: 1.3, opacity: 1 }}
          animate={{ x: s.x, y: s.y, scale: 0.2, opacity: 0 }}
          transition={{ duration: s.dur, delay: s.delay, ease: [0.1, 0.8, 0.3, 1] }}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Reveal
// ---------------------------------------------------------------------------

function Reveal({ result, reduced, onClose, onShare }: { result: EvolutionResult; reduced: boolean; onClose: () => void; onShare: () => void }) {
  const { before, after, changes } = result;
  const el = ELEMENT_INFO[after.genome.element];
  const s = reduced ? 0 : 1; // delay scale
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: reduced ? 0 : 18 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: delay * s, duration: reduced ? 0.2 : 0.5, ease: 'easeOut' as const },
  });
  const listAt = 0.95;
  const actionsAt = listAt + changes.length * 0.12 + 0.2;

  return (
    <div className="evo-scroll">
      <div className="evo-reveal">
        <div className="evo-hero">
          <motion.span className="evo-hero-aura" aria-hidden initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduced ? 0.2 : 0.9 }} />
          <motion.div
            className="evo-hero-art"
            initial={{ opacity: 0, scale: reduced ? 1 : 1.3 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduced ? { duration: 0.2 } : { type: 'spring', stiffness: 140, damping: 14 }}
          >
            <CreatureSVG genome={after.genome} stage={after.stage} size="100%" animated={!reduced} personality={dominant(after.tendencies)} />
          </motion.div>
        </div>

        <motion.div className="evo-title" {...rise(0.35)}>
          <span className="evo-stage-chip">
            Stage {after.stage}
            <StagePips stage={after.stage} />
          </span>
          <h1 className="evo-name">
            <b>{after.name}</b> has evolved!
          </h1>
          <div className="evo-badges">
            <RarityBadge rarity={creatureRarity(after)} />
            <ElementBadge element={after.genome.element} />
          </div>
        </motion.div>

        <div className="evo-panels">
          <motion.section className="glass evo-panel evo-compare" {...rise(0.7)}>
            <div className="eyebrow">Before / After</div>
            <div className="evo-compare-row">
              <figure className="evo-fig">
                <CreatureSVG genome={before.genome} stage={before.stage} size="100%" animated={false} lite />
                <figcaption>Stage {before.stage}</figcaption>
              </figure>
              <span className="evo-arrow" aria-hidden>
                <ArrowRight size={22} />
              </span>
              <figure className="evo-fig evo-fig-after">
                <CreatureSVG genome={after.genome} stage={after.stage} size="100%" animated={false} lite />
                <figcaption>Stage {after.stage}</figcaption>
              </figure>
            </div>
            <StatDiff before={before} after={after} />
          </motion.section>

          <motion.section className="glass evo-panel evo-changes" {...rise(0.8)}>
            <div className="eyebrow">What changed and why</div>
            <ol>
              {changes.map((c, i) => (
                <motion.li
                  key={`${c.label}-${i}`}
                  initial={{ opacity: 0, x: reduced ? 0 : -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: (listAt + i * 0.12) * s, duration: 0.35, ease: 'easeOut' }}
                >
                  <span className="evo-change-dot" aria-hidden />
                  <div>
                    <b>{c.label}</b>
                    <p>{c.reason}</p>
                  </div>
                </motion.li>
              ))}
            </ol>
          </motion.section>
        </div>

        <motion.div className="evo-actions" {...rise(actionsAt)}>
          <button type="button" className="btn btn-lg" style={vars({ '--c': el.color })} onClick={onShare}>
            <Share2 size={18} /> Share this evolution
          </button>
          <button type="button" className="btn btn-primary btn-lg" onClick={onClose}>
            Continue
          </button>
        </motion.div>
      </div>
    </div>
  );
}

function StatDiff({ before, after }: { before: Creature; after: Creature }) {
  const a = computeStats(before);
  const b = computeStats(after);
  return (
    <div className="evo-stats" role="table" aria-label="Stat changes">
      {STATS.map(({ key, label }) => {
        const d = b[key] - a[key];
        return (
          <div key={key} className="evo-stat-row" role="row">
            <span className="evo-stat-label" role="rowheader">
              {label}
            </span>
            <span className="evo-stat-before" role="cell">
              {a[key]}
            </span>
            <ArrowRight size={12} className="evo-stat-arrow" aria-hidden />
            <span className="evo-stat-after" role="cell">
              {b[key]}
            </span>
            <span className={`evo-stat-diff ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`} role="cell">
              {d > 0 ? `+${d}` : d < 0 ? d : '·'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
