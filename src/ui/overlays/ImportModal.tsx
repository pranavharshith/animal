// Import a shared genome: paste a WS1 code or remix link, preview it live, then grow it in the lab.
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ClipboardPaste, Dna, Eye, FlaskConical, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { play } from '../../audio/sfx';
import { BACK_LABEL, BODY_LABEL, ELEMENT_INFO, EYE_LABEL, HEAD_LABEL, LIMB_LABEL, MUTATION_INFO, PATTERN_LABEL, RARITY_INFO, TAIL_LABEL, TEXTURE_LABEL } from '../../engine/data';
import { computeRarity } from '../../engine/genetics';
import { decodeGenome, type DecodedGenome } from '../../engine/genomeCode';
import type { Creature } from '../../engine/types';
import { CreatureSVG } from '../../render/CreatureSVG';
import { useGame } from '../../state/store';
import { ElementBadge, Modal, RarityBadge, StagePips } from '../components/common';
import { useUI } from '../uiContext';
import './import.css';

type Decode = { kind: 'empty' } | { kind: 'ok'; data: DecodedGenome; code: string } | { kind: 'error'; message: string };

function friendly(message: string): string {
  if (/checksum/i.test(message)) return 'This code looks damaged: a character may be missing or mistyped. Copy it again from the source.';
  if (/too short/i.test(message)) return 'This code is incomplete. Make sure you copied the whole thing.';
  if (/unknown genes/i.test(message)) return 'This code contains genes this lab does not recognise.';
  if (/not a wildshift/i.test(message)) return 'That is not a WILDSHIFT genome. Codes start with “WS1-”.';
  return 'This genome could not be read. Check that the code was copied completely.';
}

function decode(input: string): Decode {
  if (!input.trim()) return { kind: 'empty' };
  try {
    const data = decodeGenome(input);
    const code = input.match(/WS1-[A-Za-z0-9_-]+/)?.[0] ?? input.trim();
    return { kind: 'ok', data, code };
  } catch (e) {
    return { kind: 'error', message: friendly(e instanceof Error ? e.message : '') };
  }
}

export default function ImportModal({ initialCode, onClose }: { initialCode: string; onClose: () => void }) {
  const { state, actions } = useGame();
  const ui = useUI();
  const [open, setOpen] = useState(true);
  const [text, setText] = useState(initialCode);
  const [imported, setImported] = useState<Creature | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const reduced = state.settings.reducedMotion;

  const result = useMemo(() => decode(text), [text]);
  const canPaste = typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const close = useCallback(
    (after?: () => void) => {
      setOpen(false);
      closeTimer.current = window.setTimeout(() => {
        onClose();
        after?.();
      }, 240);
    },
    [onClose],
  );
  const dismiss = useCallback(() => close(), [close]);

  const owned = useMemo(() => {
    if (result.kind !== 'ok') return false;
    const g = result.data.genome;
    return state.creatures.some((c) => c.genome.seed === g.seed && c.name === result.data.name && c.genome.element === g.element);
  }, [result, state.creatures]);

  const paste = async () => {
    setPasteError(null);
    try {
      if (!navigator.clipboard?.readText) throw new Error('unavailable');
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) {
        setPasteError('Your clipboard is empty.');
        return;
      }
      play('click');
      setText(clip.trim());
    } catch {
      setPasteError('Clipboard access was blocked. Paste the code manually with Ctrl/Cmd + V.');
    }
  };

  const doImport = () => {
    if (result.kind !== 'ok') return;
    const r = actions.importCode(result.code);
    if (r.ok) {
      play('reveal');
      setImported(r.value);
    } else {
      play('error');
      actions.toast({ kind: 'error', title: 'Import failed', body: friendly(r.error) });
    }
  };

  const remix = () => {
    if (!imported) return;
    actions.setActive(imported.id);
    close(() => ui.go('lab'));
  };

  const view = () => {
    if (!imported) return;
    const id = imported.id;
    close(() => ui.openCreature(id));
  };

  return createPortal(
    <Modal open={open} onClose={dismiss} title={imported ? 'Specimen reconstructed' : 'Import genome'} className="imp-modal">
      <AnimatePresence mode="wait" initial={false}>
        {imported ? (
          <motion.div key="done" className="imp-success" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <SuccessView creature={imported} reduced={reduced} />
            <div className="imp-actions">
              <button className="btn btn-primary btn-lg" onClick={remix} style={{ '--c': ELEMENT_INFO[imported.genome.element].color } as CSSProperties}>
                <FlaskConical size={18} />
                Remix in Lab
              </button>
              <button className="btn btn-ghost" onClick={view}>
                <Eye size={16} />
                View specimen
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="form" className="imp-form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }}>
            <p className="muted imp-lead">Paste a genome code or remix link someone shared with you. The lab will grow an exact copy you can fuse with your own organisms.</p>
            <div className="imp-input-wrap">
              <textarea
                className={`input imp-textarea ${result.kind === 'error' ? 'is-error' : ''} ${result.kind === 'ok' ? 'is-ok' : ''}`}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setPasteError(null);
                }}
                placeholder="WS1-… or https://…#g=WS1-…"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                rows={3}
                aria-label="Genome code or remix link"
                aria-invalid={result.kind === 'error'}
                autoFocus={!initialCode}
              />
              {canPaste && (
                <button type="button" className="btn btn-sm btn-ghost imp-paste" onClick={() => void paste()}>
                  <ClipboardPaste size={14} />
                  Paste from clipboard
                </button>
              )}
            </div>
            {pasteError && <p className="imp-note">{pasteError}</p>}

            <div className="imp-preview-slot" aria-live="polite">
              {result.kind === 'empty' && (
                <div className="imp-placeholder">
                  <Dna size={28} />
                  <span>Awaiting genome sequence…</span>
                </div>
              )}
              {result.kind === 'error' && (
                <div className="imp-error" role="alert">
                  <AlertTriangle size={18} />
                  <span>{result.message}</span>
                </div>
              )}
              {result.kind === 'ok' && <Preview data={result.data} reduced={reduced} owned={owned} />}
            </div>

            <div className="imp-actions">
              <button
                className="btn btn-primary btn-lg"
                disabled={result.kind !== 'ok'}
                onClick={doImport}
                style={result.kind === 'ok' ? ({ '--c': ELEMENT_INFO[result.data.genome.element].color } as CSSProperties) : undefined}
              >
                <Sparkles size={18} />
                Import specimen
              </button>
              <button className="btn btn-ghost" onClick={dismiss}>
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>,
    document.body,
  );
}

function Preview({ data, reduced, owned }: { data: DecodedGenome; reduced: boolean; owned: boolean }) {
  const g = data.genome;
  const el = ELEMENT_INFO[g.element];
  const rarity = computeRarity(g, data.stage);
  const genes: Array<[string, string]> = [
    ['Body', BODY_LABEL[g.body]],
    ['Head', HEAD_LABEL[g.head]],
    ['Back', BACK_LABEL[g.back]],
    ['Limbs', g.limbs === 'none' ? LIMB_LABEL.none : `${LIMB_LABEL[g.limbs]} ×${g.limbPairs}`],
    ['Tail', TAIL_LABEL[g.tail]],
    ['Skin', `${PATTERN_LABEL[g.pattern]} · ${TEXTURE_LABEL[g.texture]}`],
    ['Eyes', EYE_LABEL[g.eyes]],
  ];
  return (
    <motion.div
      key={`${g.seed}-${data.name}-${data.stage}`}
      className="imp-preview"
      style={{ '--el': el.color, '--rar': RARITY_INFO[rarity].color } as CSSProperties}
      initial={{ opacity: 0, y: reduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="imp-art">
        <CreatureSVG genome={g} stage={data.stage} size={170} animated={!reduced} />
      </div>
      <div className="imp-info">
        <div className="eyebrow">Decoded specimen</div>
        <h4 className="imp-name">{data.name}</h4>
        <div className="imp-badges">
          <ElementBadge element={g.element} small />
          <RarityBadge rarity={rarity} small />
          <span className="chip chip-sm">
            <StagePips stage={data.stage} /> Stage {data.stage}
          </span>
        </div>
        <dl className="imp-genes">
          {genes.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {g.mutations.length > 0 && (
          <div className="imp-muts">
            {g.mutations.map((m) => (
              <span key={m} className="chip chip-sm" title={MUTATION_INFO[m].description}>
                {MUTATION_INFO[m].name}
              </span>
            ))}
          </div>
        )}
        {owned && <p className="imp-note">You already have a specimen with this genome. Importing grows a second copy.</p>}
      </div>
    </motion.div>
  );
}

function SuccessView({ creature, reduced }: { creature: Creature; reduced: boolean }) {
  const el = ELEMENT_INFO[creature.genome.element];
  const rarity = computeRarity(creature.genome, creature.stage);
  return (
    <div className="imp-hero" style={{ '--el': el.color, '--rar': RARITY_INFO[rarity].color } as CSSProperties}>
      <div className="imp-hero-art">
        <span className="imp-burst" aria-hidden />
        <motion.div initial={{ scale: reduced ? 1 : 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 180, damping: 16, delay: 0.1 }}>
          <CreatureSVG genome={creature.genome} stage={creature.stage} size={210} animated={!reduced} />
        </motion.div>
      </div>
      <h4 className="imp-name">{creature.name}</h4>
      <div className="imp-badges center">
        <ElementBadge element={creature.genome.element} small />
        <RarityBadge rarity={rarity} small />
        <StagePips stage={creature.stage} />
      </div>
      <p className="muted imp-lead center">
        {creature.name} has joined your collection. Fuse it with one of your own organisms to create something neither of you could grow alone.
      </p>
    </div>
  );
}
