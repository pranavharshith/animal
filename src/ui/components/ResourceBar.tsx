// Resource pills with a bump animation when values change.
import { motion } from 'framer-motion';
import { Gem, Telescope, Zap } from 'lucide-react';
import type { Resources } from '../../engine/types';
import './resourceBar.css';

export const RESOURCE_META = {
  bio: { label: 'Bio-energy', short: 'Bio', color: 'var(--bio)', icon: Zap, hint: 'Spent on fusion' },
  shards: { label: 'Mutation Shards', short: 'Shards', color: 'var(--shard)', icon: Gem, hint: 'Spent on evolution' },
  dxp: { label: 'Discovery XP', short: 'DXP', color: 'var(--dxp)', icon: Telescope, hint: 'Unlocks environments' },
} as const;

export function ResourcePill({ kind, value }: { kind: keyof Resources; value: number }) {
  const m = RESOURCE_META[kind];
  return (
    <span className="res-pill" style={{ ['--c' as string]: m.color }} title={`${m.label}: ${m.hint}`}>
      <m.icon size={14} />
      <motion.b key={value} initial={{ scale: 1.35, color: '#fff' }} animate={{ scale: 1, color: 'var(--ink)' }} transition={{ duration: 0.4 }}>
        {value}
      </motion.b>
      <small>{m.short}</small>
    </span>
  );
}

export function ResourceBar({ resources }: { resources: Resources }) {
  return (
    <div className="res-bar" aria-label="Resources">
      <ResourcePill kind="bio" value={resources.bio} />
      <ResourcePill kind="shards" value={resources.shards} />
      <ResourcePill kind="dxp" value={resources.dxp} />
    </div>
  );
}
