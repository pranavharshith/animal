// Shared presentational components used across all screens.
import { AnimatePresence, motion } from 'framer-motion';
import { Droplet, Flame, Leaf, Moon, Snowflake, Sparkles, X, Zap } from 'lucide-react';
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { play } from '../../audio/sfx';
import { ELEMENT_INFO, PERSONALITY_INFO, RARITY_INFO } from '../../engine/data';
import { ranked, shares } from '../../engine/behaviour';
import { creatureRarity } from '../../engine/genetics';
import { PERSONALITIES, type Creature, type Element, type Rarity, type Stage, type Tendencies } from '../../engine/types';
import { CreatureSVG } from '../../render/CreatureSVG';
import './common.css';

export function RarityBadge({ rarity, small }: { rarity: Rarity; small?: boolean }) {
  const r = RARITY_INFO[rarity];
  return (
    <span className={`chip rarity-badge rarity-${rarity} ${small ? 'chip-sm' : ''}`} style={{ color: r.color, borderColor: r.color + '66', boxShadow: `0 0 14px ${r.glow}` }}>
      {rarity === 'anomaly' && <Sparkles size={12} />}
      {r.name}
    </span>
  );
}

const ELEMENT_ICONS: Record<Element, typeof Flame> = { ember: Flame, tide: Droplet, bloom: Leaf, volt: Zap, frost: Snowflake, shadow: Moon };

/** Element icon (Lucide) so it renders identically on every platform. */
export function ElementIcon({ element, size = 13, color }: { element: Element; size?: number; color?: string }) {
  const Icon = ELEMENT_ICONS[element];
  return <Icon size={size} color={color ?? ELEMENT_INFO[element].color} strokeWidth={2.4} aria-hidden style={{ display: 'inline-block', verticalAlign: '-0.15em', flex: 'none' }} />;
}

export function ElementBadge({ element, small }: { element: Element; small?: boolean }) {
  const e = ELEMENT_INFO[element];
  return (
    <span className={`chip ${small ? 'chip-sm' : ''}`} style={{ color: e.color, borderColor: e.color + '55', background: e.color + '14' }}>
      <ElementIcon element={element} size={small ? 11 : 13} />
      {e.name}
    </span>
  );
}

export function StagePips({ stage }: { stage: Stage }) {
  return (
    <span className="stage-pips" title={`Evolution stage ${stage}`} aria-label={`Stage ${stage} of 3`}>
      {[1, 2, 3].map((s) => (
        <i key={s} className={s <= stage ? 'on' : ''} />
      ))}
    </span>
  );
}

/** Compact selectable creature tile. */
export function CreatureTile({
  creature,
  selected,
  onClick,
  disabled,
  badge,
  size = 120,
  lite = true,
  style,
}: {
  creature: Creature;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  badge?: ReactNode;
  size?: number;
  lite?: boolean;
  style?: CSSProperties;
}) {
  const rarity = creatureRarity(creature);
  const el = ELEMENT_INFO[creature.genome.element];
  return (
    <button
      type="button"
      className={`creature-tile ${selected ? 'selected' : ''} rarity-${rarity}`}
      onClick={() => {
        play('select');
        onClick?.();
      }}
      disabled={disabled}
      style={{ ['--el' as string]: el.color, ['--rar' as string]: RARITY_INFO[rarity].color, ...style }}
      aria-pressed={selected}
      title={creature.name}
    >
      {badge && <span className="tile-badge">{badge}</span>}
      <div className="tile-art">
        <span className="tile-pad" aria-hidden />
        {(rarity === 'exotic' || rarity === 'anomaly') && (
          <span className="tile-motes" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        )}
        <CreatureSVG genome={creature.genome} stage={creature.stage} size={size} lite={lite} animated={selected} framing="tight" shadow={false} personality={ranked(creature.tendencies)[0][0]} />
      </div>
      <div className="tile-meta">
        <span className="tile-name">{creature.name}</span>
        <span className="tile-sub">
          <ElementIcon element={creature.genome.element} size={11} />
          <StagePips stage={creature.stage} />
          <span className="tile-rar" style={{ color: RARITY_INFO[rarity].color }}>
            {RARITY_INFO[rarity].name}
          </span>
        </span>
      </div>
    </button>
  );
}

export function TendencyBars({ tendencies, compact }: { tendencies: Tendencies; compact?: boolean }) {
  const sh = shares(tendencies);
  const top = ranked(tendencies)[0][0];
  return (
    <div className={`tendency-bars ${compact ? 'compact' : ''}`}>
      {PERSONALITIES.map((p) => {
        const info = PERSONALITY_INFO[p];
        return (
          <div key={p} className={`tb-row ${p === top ? 'top' : ''}`}>
            <span className="tb-label">{info.name}</span>
            <span className="tb-track">
              <motion.span className="tb-fill" style={{ background: info.color, boxShadow: `0 0 10px ${info.color}88` }} initial={false} animate={{ width: `${Math.round(sh[p] * 100)}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
            </span>
            <span className="tb-val">{Math.round(sh[p] * 100)}%</span>
          </div>
        );
      })}
    </div>
  );
}

export function StatBar({ label, value, max, color = 'var(--bio)' }: { label: string; value: number; max: number; color?: string }) {
  return (
    <div className="stat-bar">
      <span className="sb-label">{label}</span>
      <span className="sb-track">
        <motion.span className="sb-fill" style={{ background: color }} initial={false} animate={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </span>
      <span className="sb-val">{value}</span>
    </div>
  );
}

export function Modal({ open, onClose, children, title, wide, className }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode; wide?: boolean; className?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className={`modal glass ${wide ? 'wide' : ''} ${className ?? ''}`}
            role="dialog"
            aria-modal="true"
            initial={{ y: 30, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              {title ? <h3>{title}</h3> : <span />}
              <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SectionTitle({ eyebrow, title, right }: { eyebrow?: string; title: ReactNode; right?: ReactNode }) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
      </div>
      {right}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon}
      <h4>{title}</h4>
      {body && <p className="muted">{body}</p>}
      {action}
    </div>
  );
}
