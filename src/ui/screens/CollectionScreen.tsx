// Collection: resources, specimen library, achievements, mutation codex and lab stats.
import { motion } from 'framer-motion';
import { Check, Dna, FlaskConical, Layers, Lock, Sparkles, Swords, Trophy, Compass } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import { play } from '../../audio/sfx';
import { ACHIEVEMENT_INFO, ELEMENT_INFO, MUTATION_INFO, RARITY_INFO } from '../../engine/data';
import { creatureRarity, RARITY_RANK } from '../../engine/genetics';
import { ACHIEVEMENTS, ELEMENTS, MUTATIONS, type AchievementId, type Creature, type Element, type GameState, type Resources } from '../../engine/types';
import { useGame } from '../../state/store';
import { CreatureTile, EmptyState, SectionTitle, ElementIcon } from '../components/common';
import { RESOURCE_META } from '../components/ResourceBar';
import { useUI } from '../uiContext';
import './collection.css';

type SortKey = 'newest' | 'rarity' | 'stage' | 'name';
const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'newest', label: 'Newest' },
  { id: 'rarity', label: 'Rarity' },
  { id: 'stage', label: 'Stage' },
  { id: 'name', label: 'Name' },
];

const RESOURCE_COPY: Record<keyof Resources, { use: string; earn: string }> = {
  bio: { use: 'Fuels the fusion chamber', earn: 'Expeditions · releasing organisms' },
  shards: { use: 'Triggers evolution', earn: 'Expeditions · achievements' },
  dxp: { use: 'Unlocks new environments', earn: 'Fusions · expeditions · discoveries' },
};

function sortCreatures(list: Creature[], key: SortKey): Creature[] {
  const out = [...list];
  switch (key) {
    case 'newest':
      return out.sort((a, b) => b.bornAt - a.bornAt);
    case 'rarity':
      return out.sort((a, b) => RARITY_RANK[creatureRarity(b)] - RARITY_RANK[creatureRarity(a)] || b.stage - a.stage);
    case 'stage':
      return out.sort((a, b) => b.stage - a.stage || b.xp - a.xp);
    case 'name':
      return out.sort((a, b) => a.name.localeCompare(b.name));
  }
}

function achievementProgress(id: AchievementId, s: GameState): { cur: number; max: number } | null {
  switch (id) {
    case 'first_fusion':
      return { cur: Math.min(1, s.fusionCount), max: 1 };
    case 'first_mutation':
      return { cur: Math.min(1, s.seenMutations.length), max: 1 };
    case 'first_evolution':
      return { cur: Math.max(1, ...s.creatures.map((c) => c.stage)), max: 2 };
    case 'five_discoveries':
      return { cur: Math.min(5, s.discovered.length), max: 5 };
    case 'first_anomaly':
      return { cur: Math.min(1, s.creatures.filter((c) => c.genome.anomaly).length), max: 1 };
    case 'rare_organism':
      return null;
  }
}

function rewardText(r: { bio?: number; shards?: number; dxp?: number }): string {
  return [r.bio && `+${r.bio} Bio`, r.shards && `+${r.shards} Shards`, r.dxp && `+${r.dxp} DXP`].filter(Boolean).join(' · ');
}

export default function CollectionScreen() {
  const { state } = useGame();
  const ui = useUI();
  const [sort, setSort] = useState<SortKey>('newest');
  const [filter, setFilter] = useState<Element | 'all'>('all');

  const counts = useMemo(() => {
    const m = { all: state.creatures.length } as Record<Element | 'all', number>;
    for (const e of ELEMENTS) m[e] = 0;
    for (const c of state.creatures) m[c.genome.element]++;
    return m;
  }, [state.creatures]);

  const list = useMemo(() => sortCreatures(filter === 'all' ? state.creatures : state.creatures.filter((c) => c.genome.element === filter), sort), [state.creatures, filter, sort]);

  const stats = useMemo(() => {
    const exp = state.creatures.reduce((s, c) => s + c.expeditions, 0);
    const wins = state.creatures.reduce((s, c) => s + c.wins, 0);
    const gen = state.creatures.reduce((m, c) => Math.max(m, c.generation), 0);
    const anomalies = state.creatures.filter((c) => c.genome.anomaly).length;
    return [
      { label: 'Fusions', value: state.fusionCount, icon: FlaskConical, color: 'var(--bio)' },
      { label: 'Expeditions', value: exp, icon: Compass, color: 'var(--dxp)' },
      { label: 'Victories', value: wins, icon: Swords, color: '#df8a5e' },
      { label: 'Top generation', value: gen, icon: Layers, color: '#7fb1d0' },
      { label: 'Anomalies', value: anomalies, icon: Sparkles, color: RARITY_INFO.anomaly.color },
    ];
  }, [state.creatures, state.fusionCount]);

  const unlockedCount = ACHIEVEMENTS.filter((a) => state.achievements[a] !== undefined).length;
  const bestRarity = state.creatures.reduce((best, c) => Math.max(best, RARITY_RANK[creatureRarity(c)]), 0);
  const rarityNames = Object.keys(RARITY_RANK) as Array<keyof typeof RARITY_RANK>;

  return (
    <div className="col">
      <SectionTitle eyebrow="Genetic samples & resources" title="Collection" />

      <section className="col-res">
        {(Object.keys(RESOURCE_META) as Array<keyof Resources>).map((k, i) => {
          const m = RESOURCE_META[k];
          return (
            <motion.div
              key={k}
              className="col-res-card glass"
              style={{ ['--c' as string]: m.color } as CSSProperties}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <span className="col-res-icon">
                <m.icon size={26} />
              </span>
              <div className="col-res-main">
                <span className="eyebrow">{m.label}</span>
                <b className="col-res-val">{state.resources[k]}</b>
              </div>
              <dl className="col-res-copy">
                <dt>For</dt>
                <dd>{RESOURCE_COPY[k].use}</dd>
                <dt>Earn</dt>
                <dd>{RESOURCE_COPY[k].earn}</dd>
              </dl>
            </motion.div>
          );
        })}
      </section>

      <section className="col-stats">
        {stats.map((s) => (
          <div key={s.label} className="col-stat" style={{ ['--c' as string]: s.color } as CSSProperties}>
            <s.icon size={18} />
            <b>{s.value}</b>
            <span>{s.label}</span>
          </div>
        ))}
      </section>

      <section className="col-library glass">
        <SectionTitle
          eyebrow="Specimen library"
          title={
            <>
              Organisms <span className="col-count">{state.creatures.length}</span>
            </>
          }
          right={
            <div className="col-sort" role="group" aria-label="Sort">
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  className={`col-sort-btn ${sort === s.id ? 'on' : ''}`}
                  onClick={() => {
                    play('click');
                    setSort(s.id);
                  }}
                  aria-pressed={sort === s.id}
                >
                  {s.label}
                </button>
              ))}
            </div>
          }
        />
        <div className="col-filters scroll-x" role="group" aria-label="Filter by element">
          <button className={`chip col-filter ${filter === 'all' ? 'on' : ''}`} style={{ ['--c' as string]: 'var(--bio)' } as CSSProperties} onClick={() => {
              play('click');
              setFilter('all');
            }} aria-pressed={filter === 'all'}>
            All <small>{counts.all}</small>
          </button>
          {ELEMENTS.map((e) => {
            const info = ELEMENT_INFO[e];
            return (
              <button
                key={e}
                className={`chip col-filter ${filter === e ? 'on' : ''}`}
                style={{ ['--c' as string]: info.color } as CSSProperties}
                onClick={() => {
                  play('click');
                  setFilter(e);
                }}
                aria-pressed={filter === e}
                disabled={counts[e] === 0 && filter !== e}
              >
                <ElementIcon element={e} size={12} color="currentColor" /> {info.name} <small>{counts[e]}</small>
              </button>
            );
          })}
        </div>
        {list.length === 0 ? (
          <EmptyState icon={<Dna size={28} />} title="No organisms here yet" body="Fuse or explore to find this element." />
        ) : (
          <div className="col-grid">
            {list.map((c) => (
              <CreatureTile key={c.id} creature={c} size={110} selected={c.id === state.activeCreatureId} onClick={() => ui.openCreature(c.id)} />
            ))}
          </div>
        )}
      </section>

      <div className="col-split">
        <section className="col-ach glass">
          <SectionTitle
            eyebrow="Milestones"
            title="Achievements"
            right={
              <span className="chip">
                <Trophy size={13} /> {unlockedCount}/{ACHIEVEMENTS.length}
              </span>
            }
          />
          <ul className="col-ach-list">
            {ACHIEVEMENTS.map((id) => {
              const info = ACHIEVEMENT_INFO[id];
              const at = state.achievements[id];
              const done = at !== undefined;
              const prog = achievementProgress(id, state);
              return (
                <li key={id} className={`col-ach-item ${done ? 'done' : ''}`}>
                  <span className="col-ach-icon">{done ? <Trophy size={18} /> : <Lock size={16} />}</span>
                  <div className="col-ach-body">
                    <b>{info.name}</b>
                    <span className="muted">{info.description}</span>
                    {!done && prog && (
                      <span className="col-ach-prog">
                        <span className="col-ach-track">
                          <span style={{ width: `${(prog.cur / prog.max) * 100}%` }} />
                        </span>
                        <small>
                          {id === 'first_evolution' ? `Stage ${prog.cur}/${prog.max}` : `${prog.cur}/${prog.max}`}
                        </small>
                      </span>
                    )}
                    {!done && id === 'rare_organism' && <small className="dim">Best so far: {RARITY_INFO[rarityNames[bestRarity]].name}</small>}
                  </div>
                  <div className="col-ach-side">
                    <span className="col-ach-reward">{rewardText(info.reward)}</span>
                    {done && (
                      <small className="col-ach-date">
                        <Check size={12} /> {new Date(at).toLocaleDateString()}
                      </small>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="col-codex glass">
          <SectionTitle
            eyebrow="Mutation codex"
            title="Mutations"
            right={
              <span className="chip" style={{ color: 'var(--shard)' }}>
                <Dna size={13} /> {state.seenMutations.length}/{MUTATIONS.length}
              </span>
            }
          />
          <div className="col-codex-grid">
            {MUTATIONS.map((m) => {
              const info = MUTATION_INFO[m];
              const seen = state.seenMutations.includes(m);
              const color = info.element ? ELEMENT_INFO[info.element].color : '#b6a1d6';
              return (
                <div key={m} className={`col-mut ${seen ? 'seen' : ''}`} style={{ ['--c' as string]: color } as CSSProperties}>
                  <span className="col-mut-glyph" aria-hidden>
                    {seen ? (info.element ? <ElementIcon element={info.element} size={16} color="currentColor" /> : <Sparkles size={16} />) : '?'}
                  </span>
                  <div className="col-mut-body">
                    <b>{seen ? info.name : '???'}</b>
                    <small>{seen ? info.description : 'Not yet observed'}</small>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
