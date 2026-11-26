// Share hub: live holographic card preview, PNG download, genome code, remix link, native share.
import { Check, Copy, Download, Link2, Loader2, Share2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { play } from '../../audio/sfx';
import { ELEMENT_INFO, MUTATION_INFO, RARITY_INFO } from '../../engine/data';
import { ranked } from '../../engine/behaviour';
import { computeStats, creatureRarity } from '../../engine/genetics';
import { encodeGenome, remixLink } from '../../engine/genomeCode';
import type { Creature } from '../../engine/types';
import { barcodeBars, cardFileName, downloadBlob, frameColors, renderSpecimenCard, specimenSerial, STAT_META } from '../../render/card';
import { CreatureSVG } from '../../render/CreatureSVG';
import { useGame } from '../../state/store';
import { ElementIcon, EmptyState, Modal } from '../components/common';
import './showcase.css';

type Copied = 'code' | 'link' | null;

/** HTML/CSS mirror of the PNG specimen card with pointer tilt + holographic shimmer. */
function SpecimenCardPreview({ creature, reduced = false }: { creature: Creature; reduced?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const g = creature.genome;
  const el = ELEMENT_INFO[g.element];
  const rarity = creatureRarity(creature);
  const rar = RARITY_INFO[rarity];
  const stats = useMemo(() => computeStats(creature), [creature]);
  const code = useMemo(() => encodeGenome(g, creature.stage, creature.name), [g, creature.stage, creature.name]);
  const bars = useMemo(() => barcodeBars(code), [code]);
  const frame = frameColors(creature, rarity).join(', ');

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const node = ref.current;
    if (!node || reduced) return;
    const r = node.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    node.style.setProperty('--rx', `${((0.5 - y) * 14).toFixed(2)}deg`);
    node.style.setProperty('--ry', `${((x - 0.5) * 18).toFixed(2)}deg`);
    node.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    node.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    node.classList.add('is-tilting');
  };
  const onLeave = () => {
    const node = ref.current;
    if (!node) return;
    node.style.setProperty('--rx', '0deg');
    node.style.setProperty('--ry', '0deg');
    node.classList.remove('is-tilting');
  };

  const style = {
    '--el': el.color,
    '--el2': el.color2,
    '--eldark': el.dark,
    '--rar': rar.color,
    '--frame': `linear-gradient(135deg, ${frame})`,
  } as CSSProperties;

  return (
    <div className="show-stage">
      <div ref={ref} className={`show-card rarity-${rarity}`} style={style} onPointerMove={onMove} onPointerLeave={onLeave}>
        <div className="show-card-inner">
          <div className="show-hex" aria-hidden />
          <header className="show-head">
            <b>WILDSHIFT</b>
            <span>FIELD SPECIMEN</span>
          </header>
          <div className="show-window">
            <span className="show-win-label left">No. {specimenSerial(creature)}</span>
            <span className="show-win-label right">
              <ElementIcon element={g.element} size={12} color="currentColor" /> {el.name.toUpperCase()}
            </span>
            <i className="show-tick tl" />
            <i className="show-tick tr" />
            <i className="show-tick bl" />
            <i className="show-tick br" />
            <div className="show-art">
              <CreatureSVG genome={g} stage={creature.stage} size="100%" animated={!reduced} framing="tight" personality={ranked(creature.tendencies)[0][0]} />
            </div>
          </div>
          <h4 className="show-name">{creature.name}</h4>
          <div className="show-chips">
            <span style={{ '--cc': el.color } as CSSProperties}>
              <ElementIcon element={g.element} size={12} color="currentColor" /> {el.name}
            </span>
            <span style={{ '--cc': rar.color } as CSSProperties}>{rar.name}</span>
            <span style={{ '--cc': '#b3ad9f' } as CSSProperties}>
              Stage {creature.stage} · Gen {creature.generation}
            </span>
          </div>
          <div className="show-panel">
            <div className="show-stats">
              {STAT_META.map((s) => (
                <div key={s.key} className="show-stat">
                  <span>{s.label}</span>
                  <i>
                    <b style={{ width: `${Math.max(4, Math.min(100, (stats[s.key] / s.max) * 100))}%`, background: s.color }} />
                  </i>
                  <em>{stats[s.key]}</em>
                </div>
              ))}
            </div>
            <div className="show-muts">
              <span className="show-muts-title">MUTATIONS</span>
              {g.mutations.length === 0 && <span className="show-mut none">None recorded</span>}
              {g.mutations.slice(0, 3).map((m) => (
                <span key={m} className="show-mut">
                  <i />
                  {MUTATION_INFO[m].name}
                </span>
              ))}
              {g.mutations.length > 3 && <span className="show-mut none">+{g.mutations.length - 3} more</span>}
            </div>
          </div>
          <div className="show-strip">
            <svg viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden>
              {bars.map(([o, w], i) => (
                <rect key={i} x={o * 1000} y={0} width={Math.max(0.8, w * 1000 - 0.2)} height={40} />
              ))}
            </svg>
            <code>{code}</code>
          </div>
        </div>
        <div className="show-shine" aria-hidden />
      </div>
    </div>
  );
}

export default function ShowcaseModal({ creatureId, onClose }: { creatureId: string; onClose: () => void }) {
  const { state, actions } = useGame();
  const creature = state.creatures.find((c) => c.id === creatureId);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<'png' | 'share' | null>(null);
  const [copied, setCopied] = useState<Copied>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const copiedTimer = useRef<number | undefined>(undefined);

  const code = useMemo(() => (creature ? encodeGenome(creature.genome, creature.stage, creature.name) : ''), [creature]);
  const link = useMemo(() => (code ? remixLink(code) : ''), [code]);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(
    () => () => {
      window.clearTimeout(closeTimer.current);
      window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const close = useCallback(() => {
    setOpen(false);
    closeTimer.current = window.setTimeout(onClose, 260);
  }, [onClose]);

  const flagCopied = (what: Copied) => {
    setCopied(what);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(null), 1800);
  };

  const copy = async (text: string, what: Exclude<Copied, null>) => {
    const label = what === 'code' ? 'Genome code' : 'Remix link';
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      play('coin');
      flagCopied(what);
      actions.toast({ kind: 'success', title: `${label} copied`, body: what === 'code' ? 'Paste it into WILDSHIFT to grow an exact copy.' : 'Opening it imports this specimen.' });
    } catch {
      // Fallback: select the text in the readonly field so the player can copy manually.
      const input = inputRef.current;
      if (input) {
        input.value = text;
        input.focus();
        input.select();
      }
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      if (ok) {
        play('coin');
        flagCopied(what);
        actions.toast({ kind: 'success', title: `${label} copied` });
      } else {
        play('error');
        actions.toast({ kind: 'info', title: 'Copy blocked by the browser', body: 'The text is selected. Press Ctrl/Cmd + C to copy it.' });
      }
      // Restore the field to show the genome code.
      window.setTimeout(() => {
        if (inputRef.current) inputRef.current.value = code;
      }, 4000);
    }
  };

  const download = async () => {
    if (!creature || busy) return;
    setBusy('png');
    try {
      const blob = await renderSpecimenCard(creature);
      downloadBlob(blob, cardFileName(creature));
      play('coin');
      actions.toast({ kind: 'success', title: 'Specimen card saved', body: cardFileName(creature) });
    } catch (e) {
      play('error');
      actions.toast({ kind: 'error', title: 'Card export failed', body: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    if (!creature || busy || !canNativeShare) return;
    setBusy('share');
    const text = `Meet ${creature.name}, my WILDSHIFT organism. Genome: ${code}`;
    const title = `${creature.name} · WILDSHIFT specimen`;
    try {
      let shared = false;
      if (typeof navigator.canShare === 'function') {
        try {
          const blob = await renderSpecimenCard(creature);
          const file = new File([blob], cardFileName(creature), { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title, text, url: link });
            shared = true;
          }
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') throw e;
          // Fall through to a text-only share.
        }
      }
      if (!shared) await navigator.share({ title, text, url: link });
      play('coin');
      actions.toast({ kind: 'success', title: 'Specimen shared' });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        play('error');
        actions.toast({ kind: 'error', title: 'Sharing failed', body: 'Try copying the remix link instead.' });
      }
    } finally {
      setBusy(null);
    }
  };

  const body = !creature ? (
    <EmptyState title="Specimen not found" body="This organism is no longer in your collection." />
  ) : (
    <div className="show-layout">
      <SpecimenCardPreview creature={creature} reduced={state.settings.reducedMotion} />
      <div className="show-side">
        <div>
          <div className="eyebrow">Genome transmission</div>
          <h3 className="show-side-title">Share {creature.name}</h3>
          <p className="muted show-explain">Anyone can paste this code into WILDSHIFT to grow an exact copy and fuse it with their own organisms.</p>
        </div>
        <label className="show-code-field">
          <span className="eyebrow">Genome code</span>
          <input ref={inputRef} className="input show-code" readOnly value={code} onFocus={(e) => e.currentTarget.select()} aria-label="Genome code" />
        </label>
        <div className="show-actions">
          <button className="btn btn-primary btn-lg show-dl" style={{ '--c': ELEMENT_INFO[creature.genome.element].color } as CSSProperties} onClick={download} disabled={busy !== null}>
            {busy === 'png' ? <Loader2 size={18} className="show-spin" /> : <Download size={18} />}
            {busy === 'png' ? 'Rendering…' : 'Download PNG'}
          </button>
          <button className="btn" onClick={() => void copy(code, 'code')}>
            {copied === 'code' ? <Check size={16} /> : <Copy size={16} />}
            {copied === 'code' ? 'Copied' : 'Copy genome code'}
          </button>
          <button className="btn btn-ghost" onClick={() => void copy(link, 'link')}>
            {copied === 'link' ? <Check size={16} /> : <Link2 size={16} />}
            {copied === 'link' ? 'Copied' : 'Copy remix link'}
          </button>
          {canNativeShare && (
            <button className="btn btn-ghost" style={{ '--c': '#b6a1d6' } as CSSProperties} onClick={() => void share()} disabled={busy !== null}>
              {busy === 'share' ? <Loader2 size={16} className="show-spin" /> : <Share2 size={16} />}
              Share
            </button>
          )}
        </div>
        <p className="dim show-hint">Tip: tilt the card with your pointer. The PNG is 900×1260, ready for socials.</p>
      </div>
    </div>
  );

  return createPortal(
    <Modal open={open} onClose={close} title="Specimen showcase" wide className="show-modal">
      {body}
    </Modal>,
    document.body,
  );
}
