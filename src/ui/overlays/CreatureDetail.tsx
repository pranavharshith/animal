// Specimen detail sheet: art, identity, genes, mutations, stats, behaviour, habitats, history, actions.
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Compass, Crosshair, Dna, Download, Egg, FlaskConical, IdCard, Pencil, Sparkles, Star, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { play } from '../../audio/sfx';
import { dominant } from '../../engine/behaviour';
import {
  BACK_LABEL,
  BODY_LABEL,
  ELEMENT_INFO,
  ENV_INFO,
  EYE_LABEL,
  HEAD_LABEL,
  hsl,
  LIMB_LABEL,
  MOUTH_LABEL,
  MUTATION_INFO,
  PATTERN_LABEL,
  PERSONALITY_INFO,
  TAIL_LABEL,
  TEXTURE_LABEL,
} from '../../engine/data';
import { canEvolve, mostExposed, mutationAffinity } from '../../engine/evolution';
import { computeStats, creatureRarity, shardsToEvolve, xpToEvolve } from '../../engine/genetics';
import { ENVIRONMENTS, type Creature, type HistoryEvent } from '../../engine/types';
import { CreatureSVG } from '../../render/CreatureSVG';
import { useGame } from '../../state/store';
import { ElementBadge, Modal, RarityBadge, StagePips, StatBar, TendencyBars } from '../components/common';
import { useUI } from '../uiContext';
import './detail.css';

type Tab = 'genes' | 'mutations' | 'stats' | 'behaviour' | 'habitats' | 'history';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'genes', label: 'Genes' },
  { id: 'mutations', label: 'Mutations' },
  { id: 'stats', label: 'Stats' },
  { id: 'behaviour', label: 'Behaviour' },
  { id: 'habitats', label: 'Habitats' },
  { id: 'history', label: 'History' },
];

const HISTORY_ICON: Record<HistoryEvent['kind'], typeof Egg> = {
  born: Egg,
  fusion: FlaskConical,
  expedition: Compass,
  evolution: Sparkles,
  mutation: Dna,
  import: Download,
};

function originText(c: Creature): string {
  switch (c.origin) {
    case 'starter':
      return 'Lab starter, hatched in the incubator';
    case 'wild':
      return `Wild sample from ${c.originEnv ? ENV_INFO[c.originEnv].name : 'the wild'}`;
    case 'fusion':
      return c.parentNames ? `Fusion of ${c.parentNames[0]} × ${c.parentNames[1]}` : 'Born in the fusion chamber';
    case 'imported':
      return 'Reconstructed from a genome code';
    case 'daily':
      return 'Captured as a daily anomaly';
  }
}

export default function CreatureDetail({ creatureId, onClose }: { creatureId: string; onClose: () => void }) {
  const { state } = useGame();
  const c = state.creatures.find((x) => x.id === creatureId);

  useEffect(() => {
    if (!c) onClose();
  }, [c, onClose]);

  return (
    <Modal open={!!c} onClose={onClose} wide className="det-modal" title={<span className="eyebrow det-modal-title">Specimen file</span>}>
      {c && <DetailBody c={c} onClose={onClose} />}
    </Modal>
  );
}

function DetailBody({ c, onClose }: { c: Creature; onClose: () => void }) {
  const { state, actions } = useGame();
  const ui = useUI();
  const [tab, setTab] = useState<Tab>('genes');
  const [confirmRelease, setConfirmRelease] = useState(false);
  const el = ELEMENT_INFO[c.genome.element];
  const pers = dominant(c.tendencies);
  const pInfo = PERSONALITY_INFO[pers];
  const isActive = state.activeCreatureId === c.id;
  const evo = canEvolve(c, state.resources.shards);

  useEffect(() => {
    if (!confirmRelease) return;
    const t = window.setTimeout(() => setConfirmRelease(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmRelease]);

  const launch = (screen: 'lab' | 'expedition') => {
    actions.setActive(c.id);
    onClose();
    ui.go(screen);
  };

  const release = () => {
    if (!confirmRelease) {
      play('click');
      setConfirmRelease(true);
      return;
    }
    const r = actions.release(c.id);
    if (r.ok) {
      play('coin');
      actions.toast({ kind: 'info', title: r.value });
    } else {
      play('error');
      actions.toast({ kind: 'error', title: 'Cannot release', body: r.error });
      setConfirmRelease(false);
    }
  };

  return (
    <div className="det" style={{ ['--el' as string]: el.color, ['--el2' as string]: el.color2, ['--eldark' as string]: el.dark } as CSSProperties}>
      <div className="det-art">
        <div className="det-art-bg" aria-hidden />
        <div className="det-art-ring" aria-hidden />
        <div className="det-art-svg">
          <CreatureSVG genome={c.genome} stage={c.stage} size="100%" animated personality={pers} shadow />
        </div>
        <div className="det-art-foot">
          <span className="chip chip-sm">Gen {c.generation}</span>
          <span className="chip chip-sm">
            <Compass size={11} /> {c.expeditions} runs · {c.wins} wins
          </span>
        </div>
      </div>

      <div className="det-info">
        <NameEditor c={c} onRename={(n) => actions.rename(c.id, n)} />
        <div className="det-badges">
          <RarityBadge rarity={creatureRarity(c)} />
          <ElementBadge element={c.genome.element} />
          <span className="chip" style={{ color: pInfo.color, borderColor: pInfo.color + '55', background: pInfo.color + '14' }}>
            {pInfo.name}
          </span>
          <span className="chip det-stage">
            <StagePips stage={c.stage} /> Stage {c.stage}
          </span>
          {isActive && (
            <span className="chip det-active">
              <Crosshair size={12} /> Active
            </span>
          )}
        </div>
        <p className="det-origin muted">
          <b>Generation {c.generation}</b> · {originText(c)}
        </p>

        <EvolutionBox c={c} shards={state.resources.shards} ok={evo.ok} reason={evo.reason} onEvolve={() => ui.openEvolution(c.id)} />

        <div className="det-actions">
          <button
            className="btn btn-sm btn-primary"
            disabled={isActive}
            onClick={() => {
              play('select');
              actions.setActive(c.id);
            }}
          >
            <Crosshair size={14} /> {isActive ? 'Active' : 'Set as active'}
          </button>
          <button
            className={`btn btn-sm ${c.favourite ? '' : 'btn-ghost'}`}
            style={{ ['--c' as string]: 'var(--dxp)' } as CSSProperties}
            aria-pressed={c.favourite}
            onClick={() => {
              play('select');
              actions.toggleFavourite(c.id);
            }}
          >
            <Star size={14} fill={c.favourite ? 'currentColor' : 'none'} /> {c.favourite ? 'In sanctuary' : 'Favourite'}
          </button>
          <button className="btn btn-sm btn-ghost" style={{ ['--c' as string]: 'var(--shard)' } as CSSProperties} onClick={() => ui.openShowcase(c.id)}>
            <IdCard size={14} /> Specimen card
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => launch('lab')}>
            <FlaskConical size={14} /> Use in Lab
          </button>
          <button className="btn btn-sm btn-ghost" style={{ ['--c' as string]: 'var(--dxp)' } as CSSProperties} onClick={() => launch('expedition')}>
            <Compass size={14} /> Expedition
          </button>
          <button className={`btn btn-sm ${confirmRelease ? 'btn-primary' : 'btn-ghost'} det-release`} style={{ ['--c' as string]: 'var(--danger)' } as CSSProperties} onClick={release}>
            <Trash2 size={14} /> {confirmRelease ? `Release for +${6 + c.stage * 6} Bio?` : 'Release'}
          </button>
        </div>

        <div className="det-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`det-tab ${tab === t.id ? 'on' : ''}`}
              onClick={() => {
                play('click');
                setTab(t.id);
              }}
            >
              {t.label}
              {tab === t.id && <motion.span layoutId={`det-tab-${c.id}`} className="det-tab-ink" />}
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={tab} className="det-panel" role="tabpanel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {tab === 'genes' && <GenesPanel c={c} />}
            {tab === 'mutations' && <MutationsPanel c={c} />}
            {tab === 'stats' && <StatsPanel c={c} />}
            {tab === 'behaviour' && (
              <div className="det-beh">
                <TendencyBars tendencies={c.tendencies} />
                <p className="muted det-note">
                  <b style={{ color: pInfo.color }}>{pInfo.name}:</b> {pInfo.description} In battle it {pInfo.verb} on its own when you wait.
                </p>
              </div>
            )}
            {tab === 'habitats' && <HabitatsPanel c={c} />}
            {tab === 'history' && <HistoryPanel c={c} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function NameEditor({ c, onRename }: { c: Creature; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    if (draft.trim() && draft.trim() !== c.name) {
      onRename(draft);
      play('select');
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <form
        className="det-name-edit"
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <input
          ref={inputRef}
          className="input det-name-input"
          value={draft}
          maxLength={16}
          aria-label="Creature name"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setEditing(false);
            }
          }}
        />
        <button type="submit" className="btn btn-icon btn-primary" aria-label="Save name">
          <Check size={16} />
        </button>
        <button type="button" className="btn btn-icon btn-ghost" aria-label="Cancel rename" onClick={() => setEditing(false)}>
          <X size={16} />
        </button>
      </form>
    );
  }
  return (
    <div className="det-name-row">
      <h2 className="det-name">{c.name}</h2>
      <button
        className="btn btn-icon btn-ghost det-pencil"
        aria-label="Rename"
        onClick={() => {
          setDraft(c.name);
          setEditing(true);
        }}
      >
        <Pencil size={15} />
      </button>
    </div>
  );
}

function EvolutionBox({ c, shards, ok, reason, onEvolve }: { c: Creature; shards: number; ok: boolean; reason: string; onEvolve: () => void }) {
  if (c.stage >= 3) {
    return (
      <div className="det-evo final">
        <Sparkles size={18} />
        <div>
          <b>Final form</b>
          <small className="dim">This organism has reached its peak anatomy.</small>
        </div>
      </div>
    );
  }
  const need = xpToEvolve(c.stage);
  const cost = shardsToEvolve(c.stage);
  return (
    <div className={`det-evo ${ok ? 'ready' : ''}`}>
      <div className="det-evo-main">
        <div className="det-evo-head">
          <span className="eyebrow">Evolution to stage {c.stage + 1}</span>
          <span className="det-evo-xp">
            {Math.min(c.xp, need)} / {need} XP
          </span>
        </div>
        <div className="det-evo-track">
          <motion.span initial={false} animate={{ width: `${Math.min(100, (c.xp / need) * 100)}%` }} />
        </div>
        <small className={shards >= cost ? 'det-evo-cost' : 'det-evo-cost short'}>
          Costs {cost} Mutation Shards · you have {shards}
          {!ok && <span className="dim"> · {reason}</span>}
        </small>
      </div>
      <button
        className="btn btn-primary det-evo-btn"
        style={{ ['--c' as string]: 'var(--shard)' } as CSSProperties}
        disabled={!ok}
        onClick={() => {
          play('click');
          onEvolve();
        }}
      >
        <Sparkles size={16} /> Evolve
      </button>
    </div>
  );
}

function Swatch({ label, color }: { label: string; color: string }) {
  return (
    <span className="det-swatch">
      <i style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
      {label}
    </span>
  );
}

function GenesPanel({ c }: { c: Creature }) {
  const g = c.genome;
  const genes: Array<[string, string]> = [
    ['Body', BODY_LABEL[g.body]],
    ['Head', HEAD_LABEL[g.head]],
    ['Back', BACK_LABEL[g.back]],
    ['Limbs', g.limbs === 'none' ? LIMB_LABEL[g.limbs] : `${LIMB_LABEL[g.limbs]} ×${g.limbPairs * 2}`],
    ['Tail', TAIL_LABEL[g.tail]],
    ['Pattern', PATTERN_LABEL[g.pattern]],
    ['Texture', TEXTURE_LABEL[g.texture]],
    ['Eyes', EYE_LABEL[g.eyes]],
    ['Mouth', MOUTH_LABEL[g.mouth]],
  ];
  return (
    <div className="det-genes">
      <dl className="det-gene-grid">
        {genes.map(([k, v]) => (
          <div key={k} className="det-gene">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="det-gene-foot">
        <div className="det-swatches">
          <Swatch label="Primary" color={hsl(g.primary)} />
          <Swatch label="Secondary" color={hsl(g.secondary)} />
          <Swatch label="Accent" color={hsl(g.accent)} />
        </div>
        <div className="det-potential" title={`Evolution potential ${g.potential}/5`}>
          <span className="eyebrow">Potential</span>
          <span className="det-pips">
            {[1, 2, 3, 4, 5].map((i) => (
              <i key={i} className={i <= g.potential ? 'on' : ''} />
            ))}
          </span>
        </div>
      </div>
      {g.anomaly && (
        <p className="det-anomaly">
          <Sparkles size={14} /> Anomaly genetics: shifted, impossible traits.
        </p>
      )}
    </div>
  );
}

function MutationsPanel({ c }: { c: Creature }) {
  const muts = c.genome.mutations;
  const drift = mutationAffinity(c).slice(0, 3);
  return (
    <div className="det-muts">
      {muts.length > 0 ? (
        <div className="det-mut-list">
          {muts.map((m) => {
            const info = MUTATION_INFO[m];
            const color = info.element ? ELEMENT_INFO[info.element].color : '#d98bff';
            return (
              <div key={m} className="det-mut" style={{ ['--c' as string]: color } as CSSProperties}>
                <Dna size={16} />
                <div>
                  <b>{info.name}</b>
                  <small>{info.description}</small>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted det-note">No mutations yet. Expeditions and evolution push the genome.</p>
      )}
      {c.stage < 3 && drift.length > 0 && (
        <div className="det-drift">
          <span className="eyebrow">Drifting toward</span>
          <div className="det-drift-list">
            {drift.map((d, i) => (
              <span key={d.id} className="chip det-drift-chip" style={{ opacity: 1 - i * 0.22 }}>
                <Dna size={12} /> {MUTATION_INFO[d.id].name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatsPanel({ c }: { c: Creature }) {
  const s = computeStats(c);
  const rows: Array<[string, number, number, string]> = [
    ['Vigor', s.vigor, 150, '#5dffb4'],
    ['Power', s.power, 40, '#ff5d5d'],
    ['Guard', s.guard, 40, '#5da9ff'],
    ['Speed', s.speed, 40, '#ffd35d'],
    ['Focus', s.focus, 40, '#d78bff'],
  ];
  return (
    <div className="det-stats">
      {rows.map(([label, v, max, color]) => (
        <StatBar key={label} label={label} value={v} max={max} color={color} />
      ))}
    </div>
  );
}

function HabitatsPanel({ c }: { c: Creature }) {
  const top = mostExposed(c);
  const max = Math.max(5, ...ENVIRONMENTS.map((e) => c.exposure[e]));
  return (
    <div className="det-envs">
      {ENVIRONMENTS.map((e) => {
        const info = ENV_INFO[e];
        const runs = c.exposure[e];
        return (
          <div key={e} className={`det-env ${runs ? '' : 'none'}`} style={{ ['--c' as string]: info.glow } as CSSProperties}>
            <span className="det-env-name">{info.name}</span>
            <span className="det-env-track">
              <motion.span initial={false} animate={{ width: `${(runs / max) * 100}%` }} />
            </span>
            <span className="det-env-runs">
              {runs} run{runs === 1 ? '' : 's'}
            </span>
          </div>
        );
      })}
      <p className="muted det-note">
        {top ? (
          <>
            Most exposed to <b style={{ color: ENV_INFO[top.env].glow }}>{ENV_INFO[top.env].name}</b>: evolution may favour {ENV_INFO[top.env].adaptation}.
          </>
        ) : (
          'Never left the lab. Each environment leaves its mark on the genome.'
        )}
      </p>
    </div>
  );
}

function HistoryPanel({ c }: { c: Creature }) {
  const items = [...c.history].sort((a, b) => b.at - a.at);
  if (items.length === 0) return <p className="muted det-note">No recorded events.</p>;
  return (
    <ol className="det-history">
      {items.map((h, i) => {
        const Icon = HISTORY_ICON[h.kind] ?? Egg;
        return (
          <li key={`${h.at}-${i}`} className={`det-hist k-${h.kind}`}>
            <span className="det-hist-icon">
              <Icon size={14} />
            </span>
            <div>
              <p>{h.text}</p>
              <time className="dim">{new Date(h.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

