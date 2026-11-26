// THE FIELD ARCHIVE: species atlas (body × element), discovery progress, specimen dossiers.
import { motion } from 'framer-motion';
import { Download, FlaskConical, Globe, Lock, MapPin, ScanSearch } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { play } from '../../audio/sfx';
import {
  BACK_LABEL,
  BODY_LABEL,
  ELEMENT_INFO,
  ENV_INFO,
  EYE_LABEL,
  HEAD_LABEL,
  LIMB_LABEL,
  MOUTH_LABEL,
  MUTATION_INFO,
  PATTERN_LABEL,
  RARITY_INFO,
  TAIL_LABEL,
  TEXTURE_LABEL,
} from '../../engine/data';
import { ALL_SPECIES, creatureRarity, genomeFromSeed, RARITY_RANK, speciesKey } from '../../engine/genetics';
import { hashSeed } from '../../engine/rng';
import {
  BODIES,
  ELEMENTS,
  ENVIRONMENTS,
  RARITIES,
  type BodyType,
  type Creature,
  type Element,
  type EnvironmentId,
  type Genome,
  type MutationId,
  type Rarity,
  type Stage,
} from '../../engine/types';
import { CreatureSVG } from '../../render/CreatureSVG';
import { useGame } from '../../state/store';
import { CreatureTile, ElementBadge, EmptyState, Modal, RarityBadge, StagePips, ElementIcon } from '../components/common';
import { useUI } from '../uiContext';
import './archive.css';

interface SpeciesEntry {
  key: string;
  index: number;
  body: BodyType;
  element: Element;
  discovered: boolean;
  owned: Creature[];
  best: Creature | null;
  genome: Genome;
  stage: Stage;
  rarity: Rarity | null;
  env: EnvironmentId | null;
  mutations: MutationId[];
}

const parseKey = (key: string) => {
  const [body, element] = key.split(':') as [BodyType, Element];
  return { body, element };
};

/** Deterministic representative organism per species (used for silhouettes and released species). */
const REPRESENTATIVES: Record<string, Genome> = Object.fromEntries(ALL_SPECIES.map((key) => [key, genomeFromSeed(hashSeed(key), parseKey(key))]));

const ENV_FOR_ELEMENT: Partial<Record<Element, EnvironmentId>> = Object.fromEntries(ENVIRONMENTS.map((e) => [ENV_INFO[e].element, e]));

const speciesName = (body: BodyType, element: Element) => `${ELEMENT_INFO[element].name} ${BODY_LABEL[body]}`;

function rankCreature(a: Creature, b: Creature): number {
  return RARITY_RANK[creatureRarity(b)] - RARITY_RANK[creatureRarity(a)] || b.stage - a.stage || b.generation - a.generation || b.bornAt - a.bornAt;
}

function hintFor(e: Pick<SpeciesEntry, 'body' | 'element'>): { icon: 'env' | 'lab'; text: string } {
  const env = ENV_FOR_ELEMENT[e.element];
  if (env) return { icon: 'env', text: `Found in ${ENV_INFO[env].name}` };
  return { icon: 'lab', text: `Fuse a ${BODY_LABEL[e.body]} parent with ${ELEMENT_INFO[e.element].name} genes` };
}

function useSpecies(): SpeciesEntry[] {
  const { state } = useGame();
  return useMemo(() => {
    const byKey = new Map<string, Creature[]>();
    for (const c of state.creatures) {
      const k = speciesKey(c.genome);
      const list = byKey.get(k);
      if (list) list.push(c);
      else byKey.set(k, [c]);
    }
    const discovered = new Set(state.discovered);
    return ALL_SPECIES.map((key, index) => {
      const { body, element } = parseKey(key);
      const owned = (byKey.get(key) ?? []).slice().sort(rankCreature);
      const best = owned[0] ?? null;
      const muts = new Set<MutationId>();
      for (const c of owned) for (const m of c.genome.mutations) muts.add(m);
      const env = owned.find((c) => c.origin === 'wild' && c.originEnv)?.originEnv ?? owned.find((c) => c.originEnv)?.originEnv ?? null;
      return {
        key,
        index,
        body,
        element,
        discovered: discovered.has(key) || owned.length > 0,
        owned,
        best,
        genome: best?.genome ?? REPRESENTATIVES[key],
        stage: best?.stage ?? 1,
        rarity: best ? creatureRarity(best) : null,
        env,
        mutations: [...muts],
      };
    });
  }, [state.creatures, state.discovered]);
}

type Filter = 'all' | Element;

export default function ArchiveScreen() {
  const { state } = useGame();
  const ui = useUI();
  const species = useSpecies();
  const [filter, setFilter] = useState<Filter>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const reduced = state.settings.reducedMotion;

  const found = species.filter((s) => s.discovered).length;
  const pct = Math.round((found / ALL_SPECIES.length) * 100);
  const rarityCounts = useMemo(() => {
    const counts = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
    for (const c of state.creatures) counts[creatureRarity(c)]++;
    return counts;
  }, [state.creatures]);

  const visible = filter === 'all' ? species : species.filter((s) => s.element === filter);
  const open = openKey ? species.find((s) => s.key === openKey) ?? null : null;

  const pickFilter = (f: Filter) => {
    if (f === filter) return;
    play('select');
    setFilter(f);
  };

  return (
    <div className="arc">
      <header className="arc-header glass">
        <div className="arc-head-main">
          <div className="eyebrow">Species atlas · Body × Element</div>
          <h1 className="title-xl arc-title">The Field Archive</h1>
          <p className="muted arc-lead">Every organism you grow, fuse or recover is catalogued here. Unrecorded species appear as silhouettes.</p>
          <div className="arc-head-actions">
            <button className="btn btn-sm" onClick={() => ui.openImport()}>
              <Download size={14} />
              Import genome
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => ui.go('lab')} style={{ '--c': '#b6a1d6' } as CSSProperties}>
              <FlaskConical size={14} />
              Fusion Lab
            </button>
          </div>
        </div>
        <div className="arc-progress">
          <div className="arc-pct">
            <b>{pct}</b>
            <span>%</span>
          </div>
          <div className="arc-pct-label">Discovered</div>
          <div className="arc-bar" role="progressbar" aria-valuemin={0} aria-valuemax={ALL_SPECIES.length} aria-valuenow={found} aria-label="Species discovered">
            <motion.i initial={{ scaleX: 0 }} animate={{ scaleX: found / ALL_SPECIES.length }} transition={{ duration: reduced ? 0 : 1.1, ease: [0.2, 0.8, 0.2, 1] }} />
          </div>
          <div className="arc-counts">
            <span>
              <b>{found}</b>/{ALL_SPECIES.length} species
            </span>
            <span>
              <b>{state.creatures.length}</b> specimens
            </span>
            <span>
              <b>{state.seenMutations.length}</b> mutations seen
            </span>
          </div>
        </div>
        <ul className="arc-legend" aria-label="Rarity tiers">
          {RARITIES.map((r) => (
            <li key={r} style={{ '--rc': RARITY_INFO[r].color, '--rg': RARITY_INFO[r].glow } as CSSProperties}>
              <i />
              {RARITY_INFO[r].name}
              <em>{rarityCounts[r]}</em>
            </li>
          ))}
        </ul>
      </header>

      <div className="arc-tabs" role="tablist" aria-label="Filter by element">
        <button role="tab" aria-selected={filter === 'all'} className={`arc-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => pickFilter('all')} style={{ '--tc': 'var(--bio)' } as CSSProperties}>
          <span className="arc-tab-glyph" aria-hidden>
            <Globe size={14} />
          </span>
          All
          <em>
            {found}/{ALL_SPECIES.length}
          </em>
        </button>
        {ELEMENTS.map((e) => {
          const info = ELEMENT_INFO[e];
          const n = species.filter((s) => s.element === e && s.discovered).length;
          return (
            <button key={e} role="tab" aria-selected={filter === e} className={`arc-tab ${filter === e ? 'active' : ''}`} onClick={() => pickFilter(e)} style={{ '--tc': info.color } as CSSProperties}>
              <span className="arc-tab-glyph" aria-hidden>
                <ElementIcon element={e} size={14} />
              </span>
              {info.name}
              <em>{n}/6</em>
            </button>
          );
        })}
      </div>

      {filter === 'all' ? (
        <div className="arc-atlas rows" key="all">
          {BODIES.map((body, row) => {
            const entries = visible.filter((s) => s.body === body);
            const n = entries.filter((s) => s.discovered).length;
            return (
              <section key={body} className="arc-row" aria-label={BODY_LABEL[body]}>
                <div className="arc-row-head">
                  <span className="eyebrow">Body plan</span>
                  <h3>{BODY_LABEL[body]}</h3>
                  <span className="arc-row-count">
                    <i style={{ transform: `scaleX(${n / 6})` }} />
                    {n}/6
                  </span>
                </div>
                {entries.map((s, i) => (
                  <SpeciesCard key={s.key} entry={s} order={row * 6 + i} reduced={reduced} onOpen={() => setOpenKey(s.key)} />
                ))}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="arc-atlas plain" key={filter}>
          {visible.map((s, i) => (
            <SpeciesCard key={s.key} entry={s} order={i} reduced={reduced} onOpen={() => setOpenKey(s.key)} />
          ))}
        </div>
      )}

      {createPortal(
        <Modal open={open !== null} onClose={() => setOpenKey(null)} title={open ? speciesName(open.body, open.element) : ''} wide className="arc-modal">
          {open && <SpeciesDossier entry={open} reduced={reduced} onOpenCreature={(id) => ui.openCreature(id)} />}
        </Modal>,
        document.body,
      )}
    </div>
  );
}

function SpeciesCard({ entry: s, order, reduced, onOpen }: { entry: SpeciesEntry; order: number; reduced: boolean; onOpen: () => void }) {
  const el = ELEMENT_INFO[s.element];
  const plate = `No. ${String(s.index + 1).padStart(2, '0')}`;
  const hint = hintFor(s);
  const style = {
    '--el': el.color,
    '--el2': el.color2,
    '--rar': s.rarity ? RARITY_INFO[s.rarity].color : 'transparent',
  } as CSSProperties;
  const anim = {
    initial: { opacity: 0, y: reduced ? 0 : 16, scale: reduced ? 1 : 0.97 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { duration: 0.35, delay: reduced ? 0 : Math.min(order * 0.022, 0.7), ease: [0.2, 0.8, 0.2, 1] as const },
    whileHover: reduced ? undefined : { y: -5 },
  };

  if (!s.discovered) {
    return (
      <motion.div {...anim} className="arc-card locked" style={style} title={hint.text} aria-label={`Undiscovered species. ${hint.text}`}>
        <div className="arc-card-top">
          <span className="arc-plate">{plate}</span>
          <Lock size={12} className="dim" />
        </div>
        <div className="arc-art">
          <span className="arc-sil-glow" aria-hidden />
          <CreatureSVG genome={s.genome} size="100%" animated={false} lite silhouette shadow={false} framing="tight" />
        </div>
        <div className="arc-name">???</div>
        <div className="arc-sub">
          <ElementIcon element={s.element} size={12} />
          {BODY_LABEL[s.body]}
        </div>
        <div className="arc-hint">
          {hint.icon === 'env' ? <MapPin size={11} /> : <FlaskConical size={11} />}
          <span>{hint.text}</span>
        </div>
      </motion.div>
    );
  }

  const extra = s.mutations.length - 2;
  return (
    <motion.button {...anim} type="button" className={`arc-card found ${s.rarity ? `rarity-${s.rarity}` : 'released'}`} style={style} onClick={() => { play('select'); onOpen(); }} aria-label={`${speciesName(s.body, s.element)}, ${s.owned.length} owned`}>
      <div className="arc-card-top">
        <span className="arc-plate">{plate}</span>
        {s.rarity ? <RarityBadge rarity={s.rarity} small /> : <span className="chip chip-sm dim">Released</span>}
      </div>
      <div className="arc-art">
        <span className="arc-glow" aria-hidden />
        <CreatureSVG genome={s.genome} stage={s.stage} size="100%" animated={false} lite framing="tight" />
      </div>
      <div className="arc-name">{speciesName(s.body, s.element)}</div>
      <div className="arc-sub">
        <ElementIcon element={s.element} size={12} />
        <span>
          <b>{s.owned.length}</b> owned
        </span>
        {s.best && <StagePips stage={s.best.stage} />}
      </div>
      <div className="arc-meta">
        {s.env && (
          <span className="arc-env">
            <MapPin size={10} />
            {ENV_INFO[s.env].name}
          </span>
        )}
        {s.mutations.slice(0, 2).map((m) => (
          <span key={m} className="arc-mut" title={MUTATION_INFO[m].description}>
            {MUTATION_INFO[m].name}
          </span>
        ))}
        {extra > 0 && <span className="arc-mut more">+{extra}</span>}
      </div>
    </motion.button>
  );
}

function SpeciesDossier({ entry: s, reduced, onOpenCreature }: { entry: SpeciesEntry; reduced: boolean; onOpenCreature: (id: string) => void }) {
  const el = ELEMENT_INFO[s.element];
  const g = s.genome;
  const hint = hintFor(s);
  const genes: Array<[string, string]> = [
    ['Body', BODY_LABEL[g.body]],
    ['Head', HEAD_LABEL[g.head]],
    ['Dorsal', BACK_LABEL[g.back]],
    ['Limbs', g.limbs === 'none' ? LIMB_LABEL.none : `${LIMB_LABEL[g.limbs]} ×${g.limbPairs}`],
    ['Tail', TAIL_LABEL[g.tail]],
    ['Pattern', PATTERN_LABEL[g.pattern]],
    ['Texture', TEXTURE_LABEL[g.texture]],
    ['Eyes', EYE_LABEL[g.eyes]],
    ['Mouth', MOUTH_LABEL[g.mouth]],
    ['Potential', '◆'.repeat(g.potential) + '◇'.repeat(Math.max(0, 5 - g.potential))],
  ];
  return (
    <div className="arc-dossier" style={{ '--el': el.color, '--el2': el.color2 } as CSSProperties}>
      <div className="arc-dossier-hero">
        <div className="arc-dossier-art">
          <span className="arc-glow" aria-hidden />
          <CreatureSVG genome={g} stage={s.stage} size="100%" animated={!reduced} />
        </div>
        <div className="arc-dossier-info">
          <div className="eyebrow">
            Plate No. {String(s.index + 1).padStart(2, '0')} · {s.best ? `Best specimen: ${s.best.name}` : 'Reference specimen'}
          </div>
          <div className="arc-dossier-badges">
            <ElementBadge element={s.element} small />
            {s.rarity && <RarityBadge rarity={s.rarity} small />}
            {s.best && (
              <span className="chip chip-sm">
                <StagePips stage={s.best.stage} /> Stage {s.best.stage} · Gen {s.best.generation}
              </span>
            )}
            {g.anomaly && <span className="chip chip-sm arc-anom">Anomalous genetics</span>}
          </div>
          <p className="muted arc-dossier-desc">{el.description}</p>
          <div className="arc-dossier-facts">
            <span>
              <ScanSearch size={13} /> {s.owned.length} specimen{s.owned.length === 1 ? '' : 's'} in collection
            </span>
            <span>
              <MapPin size={13} /> {s.env ? `Discovered in ${ENV_INFO[s.env].name}` : s.owned.length ? 'Grown in the lab' : hint.text}
            </span>
          </div>
          <dl className="arc-genes">
            {genes.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="arc-dossier-section">
        <h4 className="eyebrow">Mutations observed in this species</h4>
        {s.mutations.length === 0 ? (
          <p className="dim arc-small">No mutations recorded yet. Evolve or fuse specimens to trigger one.</p>
        ) : (
          <ul className="arc-mut-list">
            {s.mutations.map((m) => (
              <li key={m}>
                <b>{MUTATION_INFO[m].name}</b>
                <span className="dim">{MUTATION_INFO[m].description}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="arc-dossier-section">
        <h4 className="eyebrow">Specimens ({s.owned.length})</h4>
        {s.owned.length === 0 ? (
          <EmptyState title="No living specimens" body="This species was recorded earlier but none remain in your collection. Fuse or recover a new one." />
        ) : (
          <div className="arc-specimens">
            {s.owned.map((c) => (
              <CreatureTile key={c.id} creature={c} size={110} onClick={() => onOpenCreature(c.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
