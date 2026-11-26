// Sanctuary: a glass terrarium where favourite organisms wander at different depths.
import { Leaf, Star } from 'lucide-react';
import { memo, useMemo, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { play } from '../../audio/sfx';
import { dominant } from '../../engine/behaviour';
import { ELEMENT_INFO } from '../../engine/data';
import { hashSeed, mulberry32, range } from '../../engine/rng';
import type { Creature } from '../../engine/types';
import { CreatureSVG } from '../../render/CreatureSVG';
import { useGame } from '../../state/store';
import { CreatureTile, EmptyState, SectionTitle } from '../components/common';
import { useUI } from '../uiContext';
import './sanctuary.css';

const MAX_RESIDENTS = 8;

interface Walker {
  c: Creature;
  depth: number; // 0 = front, 1 = back
  x0: number;
  x1: number;
  dur: number;
  delay: number;
  variant: 'a' | 'b';
  floats: boolean;
}

function isFloater(c: Creature): boolean {
  const g = c.genome;
  return g.body === 'jelly' || (g.body === 'avian' && (g.back === 'membrane_wings' || g.back === 'insect_wings'));
}

function planWalkers(list: Creature[]): Walker[] {
  const n = list.length;
  // Spread depth slots evenly, then shuffle them deterministically so order != depth.
  const slots = list.map((_, i) => (n === 1 ? 0.25 : i / (n - 1)));
  const rngSlots = mulberry32(hashSeed('sanc', ...list.map((c) => c.id)));
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rngSlots() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return list.map((c, i) => {
    const rng = mulberry32(hashSeed(c.id, 'walk'));
    const x0 = range(rng, 0, 38);
    const x1 = Math.min(100, x0 + range(rng, 34, 70));
    const dur = range(rng, 18, 36);
    return {
      c,
      depth: slots[i],
      x0,
      x1,
      dur,
      delay: -range(rng, 0, dur),
      variant: rng() < 0.5 ? 'a' : 'b',
      floats: isFloater(c),
    };
  });
}

export default function SanctuaryScreen() {
  const { state, actions } = useGame();
  const ui = useUI();
  const favourites = useMemo(() => state.creatures.filter((c) => c.favourite).sort((a, b) => a.bornAt - b.bornAt), [state.creatures]);
  const residents = useMemo(() => favourites.slice(0, MAX_RESIDENTS), [favourites]);
  const walkers = useMemo(() => planWalkers(residents), [residents]);
  const sorted = useMemo(() => [...state.creatures].sort((a, b) => Number(b.favourite) - Number(a.favourite) || b.bornAt - a.bornAt), [state.creatures]);

  const toggle = (e: MouseEvent | KeyboardEvent, c: Creature) => {
    e.stopPropagation();
    e.preventDefault();
    if (!c.favourite && favourites.length >= MAX_RESIDENTS) {
      actions.toast({ kind: 'info', title: 'Sanctuary is full', body: `Only ${MAX_RESIDENTS} organisms roam at once. Extra favourites wait in the wings.` });
    }
    play(c.favourite ? 'click' : 'select');
    actions.toggleFavourite(c.id);
  };

  return (
    <div className="sanc">
      <SectionTitle
        eyebrow="Living habitat"
        title="Sanctuary"
        right={
          <span className="chip sanc-count">
            <Leaf size={13} /> {residents.length}/{MAX_RESIDENTS} residents
          </span>
        }
      />

      <div className="sanc-habitat">
        <Flora layer="back" />
        <div className="sanc-floor" aria-hidden>
          <div className="sanc-floor-plane" />
        </div>
        <Spores />

        {walkers.length === 0 ? (
          <div className="sanc-empty glass">
            <EmptyState
              icon={<Star size={32} color="var(--dxp)" />}
              title="The habitat is quiet"
              body="Tap the star on any organism below to move it into your sanctuary."
            />
          </div>
        ) : (
          walkers.map((w) => <WalkerEl key={w.c.id} w={w} lite={walkers.length > 5} onOpen={() => ui.openCreature(w.c.id)} />)
        )}

        <Flora layer="left" />
        <Flora layer="right" />
        <div className="sanc-glass" aria-hidden />
      </div>

      <section className="sanc-residents">
        <SectionTitle
          eyebrow="Choose who lives here"
          title="Residents"
          right={<span className="dim sanc-hint">Tap the star to move in or out</span>}
        />
        {favourites.length > MAX_RESIDENTS && (
          <p className="dim sanc-over">
            {favourites.length} favourites. The first {MAX_RESIDENTS} roam the habitat.
          </p>
        )}
        <div className="sanc-strip scroll-x">
          {sorted.map((c) => (
            <div key={c.id} className="sanc-tile">
              <CreatureTile
                creature={c}
                size={100}
                selected={c.favourite}
                onClick={() => ui.openCreature(c.id)}
                badge={
                  <span
                    role="button"
                    tabIndex={0}
                    aria-pressed={c.favourite}
                    aria-label={c.favourite ? `Remove ${c.name} from sanctuary` : `Add ${c.name} to sanctuary`}
                    className={`sanc-star ${c.favourite ? 'on' : ''}`}
                    onClick={(e) => toggle(e, c)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') toggle(e, c);
                    }}
                  >
                    <Star size={16} fill={c.favourite ? 'currentColor' : 'none'} />
                  </span>
                }
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function WalkerEl({ w, lite, onOpen }: { w: Walker; lite: boolean; onOpen: () => void }) {
  const { c } = w;
  const el = ELEMENT_INFO[c.genome.element];
  const scale = 1 - w.depth * 0.4;
  const bottom = 6 + w.depth * 28;
  const style = {
    bottom: `${bottom}%`,
    zIndex: 10 + Math.round((1 - w.depth) * 50),
    ['--s' as string]: scale.toFixed(3),
    ['--x0' as string]: `${w.x0.toFixed(1)}%`,
    ['--x1' as string]: `${w.x1.toFixed(1)}%`,
    ['--dur' as string]: `${w.dur.toFixed(1)}s`,
    ['--delay' as string]: `${w.delay.toFixed(1)}s`,
    ['--el' as string]: el.color,
  } as CSSProperties;
  return (
    <div className={`sanc-lane ${w.floats ? 'floats' : ''}`} style={style}>
      <div className={`sanc-walker walk-${w.variant}`}>
        <button
          className="sanc-body"
          onClick={() => {
            play('select');
            onOpen();
          }}
          aria-label={`Inspect ${c.name}`}
        >
          {w.floats && <span className="sanc-shadow" aria-hidden />}
          <span className="sanc-label">{c.name}</span>
          <span className={`sanc-face walk-${w.variant}`}>
            <span className="sanc-bob">
              <CreatureSVG genome={c.genome} stage={c.stage} size="100%" animated lite={lite} shadow={!w.floats} personality={dominant(c.tendencies)} />
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

/** Procedural glowing flora. Back layer sits behind creatures; corner layers frame the glass in front. */
const Flora = memo(function Flora({ layer }: { layer: 'back' | 'left' | 'right' }) {
  const items = useMemo(() => {
    const rng = mulberry32(hashSeed('sanc-flora', layer));
    const out: ReactNode[] = [];
    const glows = ['#2bf0c0', '#7affdd', '#c77dff', '#7dff8a', '#3dd6ff'];
    if (layer === 'back') {
      // Distant ridge + tall glowing stalks along the horizon line.
      out.push(<path key="hill" d="M0,330 C200,280 340,310 520,290 C720,268 880,300 1040,280 C1120,272 1170,290 1200,286 L1200,600 L0,600Z" fill="#04140f" opacity={0.9} />);
      for (let i = 0; i < 14; i++) {
        const x = (i / 14) * 1200 + range(rng, 0, 70);
        const h = range(rng, 90, 210);
        const base = 300 + range(rng, -10, 14);
        const g = glows[Math.floor(rng() * glows.length)];
        const bend = range(rng, -30, 30);
        out.push(
          <g key={`s${i}`} className="sanc-sway" style={{ transformOrigin: `${x}px ${base}px`, animationDelay: `${-rng() * 8}s` }} opacity={0.8}>
            <path d={`M${x},${base} Q${x + bend},${base - h * 0.55} ${x + bend * 0.4},${base - h}`} stroke="#0b3a2c" strokeWidth={range(rng, 4, 8)} fill="none" strokeLinecap="round" />
            <circle cx={x + bend * 0.4} cy={base - h} r={range(rng, 6, 12)} fill={g} opacity={0.7} className="sanc-pulse" style={{ animationDelay: `${rng() * 4}s` }} />
          </g>,
        );
      }
      for (let i = 0; i < 6; i++) {
        const x = range(rng, 40, 1160);
        const w = range(rng, 40, 90);
        const base = 312;
        const g = glows[Math.floor(rng() * glows.length)];
        out.push(
          <g key={`m${i}`} opacity={0.65}>
            <rect x={x - w * 0.12} y={base - w * 0.9} width={w * 0.24} height={w * 0.9} rx={w * 0.1} fill="#0c3326" />
            <path d={`M${x - w * 0.7},${base - w * 0.85} Q${x},${base - w * 1.6} ${x + w * 0.7},${base - w * 0.85}Z`} fill={g} opacity={0.4} />
            <path d={`M${x - w * 0.7},${base - w * 0.85} Q${x},${base - w * 1.6} ${x + w * 0.7},${base - w * 0.85}`} fill="none" stroke={g} strokeWidth={2} className="sanc-pulse" style={{ animationDelay: `${rng() * 4}s` }} />
          </g>,
        );
      }
    } else {
      // Foreground fronds and a glowing mushroom hugging one glass corner (viewBox 0..300 x 0..600).
      const off = layer === 'left' ? 0 : 1;
      for (let i = 0; i < 6; i++) {
        const x = range(rng, 10, 120);
        const h = range(rng, 140, 300);
        const lean = range(rng, 10, 70);
        const g = glows[(off * 2 + i) % glows.length];
        out.push(
          <g key={`f${i}`} className="sanc-sway" style={{ transformOrigin: `${x}px 600px`, animationDelay: `${-rng() * 6}s` }}>
            <path d={`M${x - 8},600 C${x - 10 + lean * 0.3},${600 - h * 0.5} ${x + lean},${600 - h * 0.8} ${x + lean * 1.2},${600 - h} C${x + lean * 0.6},${600 - h * 0.7} ${x + 10},${600 - h * 0.4} ${x + 8},600Z`} fill="#03100c" />
            <circle cx={x + lean * 1.2} cy={600 - h} r={4} fill={g} className="sanc-pulse" style={{ animationDelay: `${rng() * 3}s` }} />
          </g>,
        );
      }
      const mx = range(rng, 170, 210);
      const mw = range(rng, 60, 80);
      const g = glows[(off + 2) % glows.length];
      out.push(
        <g key="fm">
          <rect x={mx - mw * 0.14} y={600 - mw * 1.1} width={mw * 0.28} height={mw * 1.1} rx={mw * 0.12} fill="#062019" />
          <path d={`M${mx - mw},${600 - mw * 1.05} Q${mx},${600 - mw * 2} ${mx + mw},${600 - mw * 1.05}Z`} fill="#082a20" stroke={g} strokeWidth={2.5} />
          {[0.25, 0.5, 0.75].map((t, k) => (
            <circle key={k} cx={mx - mw + t * mw * 2} cy={600 - mw * (1.12 + 0.3 * Math.sin(t * Math.PI))} r={3 + k} fill={g} className="sanc-pulse" style={{ animationDelay: `${k * 0.7}s` }} />
          ))}
        </g>,
      );
    }
    return out;
  }, [layer]);
  return layer === 'back' ? (
    <svg className="sanc-flora back" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMax slice" aria-hidden>
      {items}
    </svg>
  ) : (
    <svg className={`sanc-flora corner ${layer}`} viewBox="0 0 300 600" preserveAspectRatio="xMinYMax meet" aria-hidden>
      {items}
    </svg>
  );
});

const SPORE_DATA = Array.from({ length: 22 }, (_, i) => {
  const rng = mulberry32(hashSeed('sanc-spore', i));
  return { left: range(rng, 2, 98), top: range(rng, 8, 90), size: range(rng, 2, 5), dur: range(rng, 9, 20), delay: -range(rng, 0, 20), dx: range(rng, -50, 50) };
});

function Spores() {
  return (
    <div className="sanc-spores" aria-hidden>
      {SPORE_DATA.map((s, i) => (
        <i
          key={i}
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s`, ['--dx' as string]: `${s.dx}px` } as CSSProperties}
        />
      ))}
    </div>
  );
}
