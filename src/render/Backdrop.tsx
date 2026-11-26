// Animated living-ecosystem backgrounds. Layered SVG flora + drifting spores.
import { memo, useMemo, type ReactNode } from 'react';
import { ENV_INFO } from '../engine/data';
import { hashSeed, mulberry32, range } from '../engine/rng';
import type { EnvironmentId } from '../engine/types';
import './backdrop.css';

export type BackdropKind = EnvironmentId | 'lab';

const LAB = { sky: ['#03050c', '#131922', '#212d35'] as [string, string, string], ground: '#0e1418', glow: '#82c6a6' };

function flora(kind: BackdropKind, seed: number, layer: number, color: string, glow: string) {
  const rng = mulberry32(hashSeed(seed, kind, layer));
  const items: ReactNode[] = [];
  const count = 9 - layer * 2;
  const baseY = 600 - layer * 30;
  for (let i = 0; i < count; i++) {
    const x = (i / count) * 1600 + range(rng, -60, 60);
    const h = range(rng, 120, 280) * (1 - layer * 0.18);
    const w = range(rng, 18, 40);
    const k = `${layer}-${i}`;
    switch (kind) {
      case 'ember_fields':
        // crystal spires
        items.push(<path key={k} d={`M${x - w},${baseY} L${x - w * 0.3},${baseY - h} L${x + w * 0.2},${baseY - h * 0.85} L${x + w},${baseY}Z`} fill={color} />);
        if (layer === 0) items.push(<path key={k + 'g'} d={`M${x - w * 0.3},${baseY - h} L${x - w * 0.05},${baseY - h * 0.4}`} stroke={glow} strokeWidth={3} opacity={0.6} className="bd-flicker" style={{ animationDelay: `${rng() * 3}s` }} />);
        break;
      case 'abyssal_lake':
        // kelp
        items.push(<path key={k} className="bd-sway" style={{ animationDelay: `${-rng() * 6}s`, transformOrigin: `${x}px ${baseY}px` }} d={`M${x},${baseY} C${x - 30},${baseY - h * 0.3} ${x + 30},${baseY - h * 0.6} ${x - 6},${baseY - h} C${x + 18},${baseY - h * 0.6} ${x - 12},${baseY - h * 0.3} ${x + w * 0.5},${baseY}Z`} fill={color} />);
        break;
      case 'verdant_wilds':
        // bulbous mushrooms / pods
        items.push(<rect key={k + 's'} x={x - w * 0.2} y={baseY - h * 0.75} width={w * 0.4} height={h * 0.75} rx={w * 0.2} fill={color} />);
        items.push(<ellipse key={k} cx={x} cy={baseY - h * 0.75} rx={w * 1.6} ry={w * 0.8} fill={color} />);
        if (layer === 0) items.push(<circle key={k + 'd'} cx={x + w * 0.4} cy={baseY - h * 0.8} r={4} fill={glow} className="bd-pulse" style={{ animationDelay: `${rng() * 3}s` }} />);
        break;
      case 'stormlands':
        // floating islands
        {
          const y = baseY - h - range(rng, 40, 160);
          items.push(<path key={k} className="bd-bob" style={{ animationDelay: `${-rng() * 6}s` }} d={`M${x - w * 2.4},${y} Q${x},${y - 18} ${x + w * 2.4},${y} L${x + w * 0.6},${y + w * 1.8} L${x},${y + w * 2.6} L${x - w * 0.8},${y + w * 1.6}Z`} fill={color} />);
        }
        break;
      case 'hollow_night':
        // twisted trees with glowing bulbs
        items.push(<path key={k} d={`M${x - w * 0.3},${baseY} C${x - w},${baseY - h * 0.5} ${x + w},${baseY - h * 0.6} ${x},${baseY - h} M${x},${baseY - h * 0.7} q${w},-${w} ${w * 2},-${w * 0.4}`} stroke={color} strokeWidth={w * 0.5} fill="none" strokeLinecap="round" />);
        if (layer < 2) items.push(<circle key={k + 'b'} cx={x + w * 2} cy={baseY - h * 0.7 - w * 0.4} r={5} fill={glow} className="bd-pulse" style={{ animationDelay: `${rng() * 3}s` }} />);
        break;
      case 'lab':
      default:
        // tall glass tubes and coral fronds
        if (i % 2 === 0) {
          items.push(<rect key={k} x={x - w * 0.6} y={baseY - h} width={w * 1.2} height={h} rx={w * 0.6} fill="none" stroke={color} strokeWidth={2} opacity={0.8} />);
          items.push(<rect key={k + 'l'} x={x - w * 0.6} y={baseY - h * range(rng, 0.3, 0.7)} width={w * 1.2} height={h * 0.5} rx={w * 0.6} fill={glow} opacity={0.06 + layer * 0.02} />);
        } else {
          items.push(<path key={k} className="bd-sway" style={{ animationDelay: `${-rng() * 6}s`, transformOrigin: `${x}px ${baseY}px` }} d={`M${x},${baseY} C${x - 20},${baseY - h * 0.4} ${x + 24},${baseY - h * 0.6} ${x},${baseY - h * 0.9}`} stroke={color} strokeWidth={6} fill="none" strokeLinecap="round" />);
        }
    }
  }
  return items;
}

function BackdropInner({ kind = 'lab', dim = 0, seed = 7 }: { kind?: BackdropKind; dim?: number; seed?: number }) {
  const env = kind === 'lab' ? LAB : ENV_INFO[kind];
  const spores = useMemo(() => {
    const rng = mulberry32(hashSeed(seed, kind, 'spores'));
    return Array.from({ length: 26 }, (_, i) => ({
      left: `${range(rng, 0, 100).toFixed(1)}%`,
      top: `${range(rng, 10, 95).toFixed(1)}%`,
      size: range(rng, 1.5, 4.5),
      delay: -range(rng, 0, 14),
      dur: range(rng, 10, 22),
      hueShift: i % 3,
    }));
  }, [kind, seed]);
  const layers = [2, 1, 0];
  const layerColor = (l: number) => (l === 2 ? 'rgba(255,255,255,0.035)' : l === 1 ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.6)');

  return (
    <div className="backdrop" aria-hidden="true" style={{ background: `linear-gradient(180deg, ${env.sky[0]} 0%, ${env.sky[1]} 55%, ${env.sky[2]} 100%)` }}>
      <div className="bd-glow" style={{ background: `radial-gradient(ellipse at 50% 85%, ${env.glow}24 0%, transparent 62%)` }} />
      <div className="bd-glow bd-glow-2" style={{ background: `radial-gradient(circle at 15% 20%, ${env.glow}14 0%, transparent 42%)` }} />
      {kind === 'stormlands' && <div className="bd-lightning" />}
      <svg className="bd-flora" viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice">
        {layers.map((l) => (
          <g key={l} className={`bd-layer bd-layer-${l}`}>
            {flora(kind, seed, l, layerColor(l), env.glow)}
          </g>
        ))}
        <rect x={0} y={592} width={1600} height={20} fill={env.ground} />
      </svg>
      <div className="bd-spores">
        {spores.map((s, i) => (
          <span
            key={i}
            style={{
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.dur}s`,
              background: s.hueShift === 1 ? '#ece6da' : env.glow,
              boxShadow: `0 0 ${s.size * 1.6}px ${env.glow}66`,
            }}
          />
        ))}
      </div>
      <div className="bd-grain" />
      <div className="bd-vignette" style={{ opacity: 0.85 + dim * 0.15 }} />
      {dim > 0 && <div className="bd-dim" style={{ opacity: dim }} />}
    </div>
  );
}

export const Backdrop = memo(BackdropInner);
export default Backdrop;
