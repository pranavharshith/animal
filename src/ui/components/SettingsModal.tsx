import { RotateCcw, Upload, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import { play } from '../../audio/sfx';
import { useGame } from '../../state/store';
import { useUI } from '../uiContext';
import { Modal } from './common';

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, actions } = useGame();
  const ui = useUI();
  const [confirm, setConfirm] = useState(false);
  const s = state.settings;
  return (
    <Modal open={open} onClose={() => { setConfirm(false); onClose(); }} title="Lab Settings">
      <div style={{ display: 'grid', gap: 18 }}>
        <section style={{ display: 'grid', gap: 10 }}>
          <div className="eyebrow">Sound</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-icon" onClick={() => actions.updateSettings({ muted: !s.muted })} aria-label={s.muted ? 'Unmute' : 'Mute'}>
              {s.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.volume}
              aria-label="Volume"
              style={{ flex: 1, accentColor: 'var(--bio)' }}
              onChange={(e) => actions.updateSettings({ volume: Number(e.target.value), muted: false })}
              onPointerUp={() => play('select')}
            />
            <span className="dim" style={{ width: 40, textAlign: 'right' }}>{Math.round(s.volume * 100)}%</span>
          </div>
        </section>
        <section style={{ display: 'grid', gap: 10 }}>
          <div className="eyebrow">Motion</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={s.reducedMotion} onChange={(e) => actions.updateSettings({ reducedMotion: e.target.checked })} style={{ accentColor: 'var(--bio)', width: 18, height: 18 }} />
            Reduce motion (calmer creature and background animations)
          </label>
        </section>
        <section style={{ display: 'grid', gap: 10 }}>
          <div className="eyebrow">Genomes</div>
          <button className="btn btn-ghost" onClick={() => { onClose(); ui.openImport(); }}>
            <Upload size={16} /> Import a genome code
          </button>
        </section>
        <section style={{ display: 'grid', gap: 10 }}>
          <div className="eyebrow">Save data</div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Progress saves automatically in this browser. {state.creatures.length} organisms, {state.discovered.length} species recorded.
          </p>
          {!confirm ? (
            <button className="btn btn-ghost" style={{ ['--c' as string]: 'var(--danger)' }} onClick={() => setConfirm(true)}>
              <RotateCcw size={16} /> Reset save
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: 'var(--danger)', fontSize: 13 }}>This deletes every creature. Are you sure?</span>
              <button className="btn btn-primary btn-sm" style={{ ['--c' as string]: 'var(--danger)' }} onClick={() => { actions.resetSave(); setConfirm(false); onClose(); ui.go('home'); }}>
                Yes, reset
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>Cancel</button>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
