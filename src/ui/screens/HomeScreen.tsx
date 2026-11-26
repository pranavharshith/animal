// Home: specimen in focus, the core loop, daily anomaly and recent discoveries.
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Compass, FlaskConical, Gift, Hourglass, IdCard, Play, Sparkles, Telescope } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { play } from '../../audio/sfx';
import { dominant } from '../../engine/behaviour';
import { ELEMENT_INFO, PERSONALITY_INFO } from '../../engine/data';
import { canEvolve } from '../../engine/evolution';
import { ALL_SPECIES, creatureRarity, dailyGenome, todayKey, xpToEvolve } from '../../engine/genetics';
import type { Creature } from '../../engine/types';
import { CreatureSVG } from '../../render/CreatureSVG';
import { useActiveCreature, useGame } from '../../state/store';
import { CreatureTile, ElementBadge, RarityBadge, SectionTitle, StagePips, TendencyBars } from '../components/common';
import { RESOURCE_META, ResourcePill } from '../components/ResourceBar';
import { useUI } from '../uiContext';
import './home.css';

type Step = 'fuse' | 'explore' | 'evolve';

const LOOP: Array<{ id: Step; label: string; text: string; icon: typeof FlaskConical; color: string }> = [
  { id: 'fuse', label: 'Fuse', text: 'Merge two organisms', icon: FlaskConical, color: 'var(--bio)' },
  { id: 'explore', label: 'Explore', text: 'Battle in the wild', icon: Compass, color: 'var(--dxp)' },
  { id: 'evolve', label: 'Evolve', text: 'Behaviour reshapes anatomy', icon: Sparkles, color: 'var(--shard)' },
];

/** Deterministic spore field around the hero. */
const SPORES = Array.from({ length: 16 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return { left: 6 + r(1) * 88, top: 10 + r(2) * 75, size: 3 + r(3) * 5, dur: 7 + r(4) * 8, delay: -r(5) * 12, drift: (r(6) - 0.5) * 60 };
});

function msToMidnight(now: number): number {
  const d = new Date(now);
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return next.getTime() - now;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

export default function HomeScreen() {
  const { state, actions } = useGame();
  const ui = useUI();
  const active: Creature | undefined = useActiveCreature();

  const nextStep: Step = state.fusionCount === 0 ? 'fuse' : active && canEvolve(active, state.resources.shards).ok ? 'evolve' : 'explore';
  const recent = useMemo(() => [...state.creatures].sort((a, b) => b.bornAt - a.bornAt).slice(0, 6), [state.creatures]);

  const onPlay = () => {
    play('click');
    ui.go(state.fusionCount === 0 ? 'lab' : 'expedition');
  };

  return (
    <div className="home">
      {active ? <Hero creature={active} shards={state.resources.shards} /> : null}

      <section className="home-cta">
        <motion.button
          className="home-play"
          onClick={onPlay}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          style={{ ['--c' as string]: state.fusionCount === 0 ? 'var(--bio)' : 'var(--dxp)' } as CSSProperties}
        >
          <span className="home-play-ring" aria-hidden />
          <Play size={30} fill="currentColor" />
          <span className="home-play-text">
            <b>PLAY</b>
            <small>{state.fusionCount === 0 ? 'Make your first fusion' : 'Send your specimen on an expedition'}</small>
          </span>
        </motion.button>
        <div className="home-secondary">
          <button className="btn btn-ghost" onClick={() => ui.go('lab')}>
            <FlaskConical size={16} /> Fusion Lab
          </button>
          <button className="btn btn-ghost" style={{ ['--c' as string]: 'var(--dxp)' } as CSSProperties} onClick={() => ui.go('expedition')}>
            <Compass size={16} /> Expedition
          </button>
          {active && (
            <button
              className="btn btn-ghost"
              style={{ ['--c' as string]: 'var(--shard)' } as CSSProperties}
              onClick={() => {
                play('click');
                ui.openShowcase(active.id);
              }}
            >
              <IdCard size={16} /> Specimen card
            </button>
          )}
        </div>
      </section>

      <ol className="home-loop" aria-label="How to play">
        {LOOP.map((s, i) => (
          <li key={s.id} className={`home-step ${nextStep === s.id ? 'next' : ''}`} style={{ ['--c' as string]: s.color } as CSSProperties}>
            <span className="home-step-icon">
              <s.icon size={18} />
            </span>
            <span className="home-step-text">
              <b>{s.label}</b>
              <small>{s.text}</small>
            </span>
            {nextStep === s.id && <span className="home-step-now">Next</span>}
            {i < LOOP.length - 1 && <ArrowRight className="home-step-arrow" size={16} aria-hidden />}
          </li>
        ))}
      </ol>

      <section className="home-cards">
        <DiscoveryCard found={state.discovered.length} onOpen={() => ui.go('archive')} />
        <div className="home-card glass home-res">
          <div className="eyebrow">Resources</div>
          <ul>
            {(Object.keys(RESOURCE_META) as Array<keyof typeof RESOURCE_META>).map((k) => (
              <li key={k}>
                <ResourcePill kind={k} value={state.resources[k]} />
                <span className="dim">{RESOURCE_META[k].hint}</span>
              </li>
            ))}
          </ul>
          <button className="btn btn-sm btn-ghost" onClick={() => ui.go('collection')}>
            Collection <ArrowRight size={14} />
          </button>
        </div>
        <DailyCard claimed={state.dailyClaimed === todayKey()} onClaim={() => actions.claimDaily()} onOpen={ui.openCreature} />
      </section>

      <section className="home-recent">
        <SectionTitle
          eyebrow="Field log"
          title="Recent discoveries"
          right={
            <button className="btn btn-sm btn-ghost" onClick={() => ui.go('collection')}>
              All {state.creatures.length} <ArrowRight size={14} />
            </button>
          }
        />
        <div className="home-recent-grid">
          {recent.map((c) => (
            <CreatureTile key={c.id} creature={c} size={110} selected={c.id === active?.id} onClick={() => ui.openCreature(c.id)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Hero({ creature: c, shards }: { creature: Creature; shards: number }) {
  const ui = useUI();
  const el = ELEMENT_INFO[c.genome.element];
  const pers = dominant(c.tendencies);
  const pInfo = PERSONALITY_INFO[pers];
  const evo = canEvolve(c, shards);
  const need = xpToEvolve(c.stage);
  const pct = c.stage >= 3 ? 100 : Math.min(100, (c.xp / need) * 100);

  return (
    <section className="home-hero" style={{ ['--el' as string]: el.color, ['--el2' as string]: el.color2 } as CSSProperties}>
      <div className="home-stage">
        <div className="home-stage-glow" aria-hidden />
        {SPORES.map((s, i) => (
          <i
            key={i}
            className="home-spore"
            aria-hidden
            style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s`, ['--dx' as string]: `${s.drift}px` } as CSSProperties}
          />
        ))}
        <div className="home-pedestal" aria-hidden>
          <span className="home-ring r1" />
          <span className="home-ring r2" />
          <span className="home-ring r3" />
          <span className="home-beam" />
        </div>
        <AnimatePresence mode="wait">
          <motion.button
            key={c.id}
            className="home-creature"
            onClick={() => ui.openCreature(c.id)}
            aria-label={`Open ${c.name}`}
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 160, damping: 18 }}
          >
            <CreatureSVG genome={c.genome} stage={c.stage} size="100%" animated personality={pers} shadow />
          </motion.button>
        </AnimatePresence>
      </div>

      <div className="home-info">
        <div className="eyebrow">Specimen in focus</div>
        <h1 className="title-xl home-name">{c.name}</h1>
        <div className="home-badges">
          <RarityBadge rarity={creatureRarity(c)} />
          <ElementBadge element={c.genome.element} />
          <span className="chip" style={{ color: pInfo.color, borderColor: pInfo.color + '55', background: pInfo.color + '14' }}>
            {pInfo.name}
          </span>
          <span className="chip home-stage-chip">
            <StagePips stage={c.stage} /> Stage {c.stage}
          </span>
        </div>

        <div className="home-xp">
          <div className="home-xp-head">
            <span>Evolution XP</span>
            <b>{c.stage >= 3 ? 'Final form' : `${c.xp} / ${need}`}</b>
          </div>
          <div className="home-xp-track">
            <motion.span className="home-xp-fill" initial={false} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 90, damping: 20 }} />
          </div>
          {c.stage < 3 && !evo.ok && <small className="dim">{evo.reason}</small>}
        </div>

        {evo.ok && (
          <button
            className="btn btn-primary btn-lg home-evolve"
            style={{ ['--c' as string]: 'var(--shard)' } as CSSProperties}
            onClick={() => {
              play('click');
              ui.openEvolution(c.id);
            }}
          >
            <Sparkles size={18} /> EVOLVE NOW
          </button>
        )}

        <div className="home-tend">
          <TendencyBars tendencies={c.tendencies} compact />
        </div>
      </div>
    </section>
  );
}

function DiscoveryCard({ found, onOpen }: { found: number; onOpen: () => void }) {
  const total = ALL_SPECIES.length;
  const frac = total ? found / total : 0;
  const R = 42;
  const C = 2 * Math.PI * R;
  return (
    <button className="home-card glass home-disc" onClick={onOpen}>
      <div className="eyebrow">Discovery</div>
      <div className="home-disc-body">
        <svg viewBox="0 0 100 100" className="home-ring-svg" aria-hidden>
          <defs>
            <linearGradient id="home-disc-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#7affdd" />
              <stop offset="1" stopColor="#d98bff" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
          <motion.circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="url(#home-disc-g)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: C * (1 - frac) }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div className="home-disc-num">
          <b>{Math.round(frac * 100)}%</b>
          <small>
            {found}/{total} species
          </small>
        </div>
      </div>
      <span className="home-card-link">
        <Telescope size={14} /> Field Archive
      </span>
    </button>
  );
}

function DailyCard({ claimed, onClaim, onOpen }: { claimed: boolean; onClaim: () => { ok: true; value: Creature } | { ok: false; error: string }; onOpen: (id: string) => void }) {
  const now = useNow(30_000);
  const key = todayKey(new Date(now));
  const genome = useMemo(() => dailyGenome(key), [key]);
  const [capturedId, setCapturedId] = useState<string | null>(null);
  const left = msToMidnight(now);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const el = ELEMENT_INFO[genome.element];

  const capture = () => {
    const r = onClaim();
    if (r.ok) {
      play('reveal');
      setCapturedId(r.value.id);
    } else play('error');
  };

  return (
    <div className={`home-card glass home-daily ${claimed ? 'claimed' : ''}`} style={{ ['--el' as string]: claimed ? el.color : '#ff4fd8' } as CSSProperties}>
      <div className="eyebrow">Daily anomaly</div>
      <div className="home-daily-art">
        <AnimatePresence mode="wait">
          <motion.div
            key={claimed ? 'on' : 'off'}
            className="home-daily-svg"
            initial={claimed ? { scale: 0.6, opacity: 0, rotate: -6 } : { opacity: 0 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 1.3, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 14 }}
          >
            <CreatureSVG genome={genome} size="100%" silhouette={!claimed} animated={claimed} lite shadow />
          </motion.div>
        </AnimatePresence>
        {!claimed && <span className="home-daily-q">?</span>}
      </div>
      {claimed ? (
        <div className="home-daily-foot">
          {capturedId ? (
            <button className="btn btn-sm" onClick={() => onOpen(capturedId)}>
              Inspect capture
            </button>
          ) : (
            <span className="muted">Captured today</span>
          )}
          <span className="dim home-daily-timer">
            <Hourglass size={13} /> Next anomaly in {h}h {m}m
          </span>
        </div>
      ) : (
        <div className="home-daily-foot">
          <button className="btn btn-primary" style={{ ['--c' as string]: '#ff4fd8' } as CSSProperties} onClick={capture}>
            <Gift size={16} /> Capture
          </button>
          <span className="dim">One rare specimen per day</span>
        </div>
      )}
    </div>
  );
}
