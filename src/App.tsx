// App shell: top bar, navigation, screen routing, global overlays, toasts, remix-link import.
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, Compass, Dna, FlaskConical, Home, Leaf, Settings, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { play } from './audio/sfx';
import { useGame } from './state/store';
import { Backdrop, type BackdropKind } from './render/Backdrop';
import { ResourceBar } from './ui/components/ResourceBar';
import { Toasts } from './ui/components/Toasts';
import { SettingsModal } from './ui/components/SettingsModal';
import CreatureDetail from './ui/overlays/CreatureDetail';
import EvolutionReveal from './ui/overlays/EvolutionReveal';
import ImportModal from './ui/overlays/ImportModal';
import ShowcaseModal from './ui/overlays/ShowcaseModal';
import ArchiveScreen from './ui/screens/ArchiveScreen';
import CollectionScreen from './ui/screens/CollectionScreen';
import ExpeditionScreen from './ui/screens/ExpeditionScreen';
import HomeScreen from './ui/screens/HomeScreen';
import LabScreen from './ui/screens/LabScreen';
import SanctuaryScreen from './ui/screens/SanctuaryScreen';
import { UIContext, type Screen, type UIApi } from './ui/uiContext';
import './app.css';

const NAV: Array<{ id: Screen; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'lab', label: 'Lab', icon: FlaskConical },
  { id: 'expedition', label: 'Expedition', icon: Compass },
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'sanctuary', label: 'Sanctuary', icon: Leaf },
  { id: 'collection', label: 'Collection', icon: Dna },
];

export default function App() {
  const { state, actions } = useGame();
  const [screen, setScreen] = useState<Screen>('home');
  const [evolveId, setEvolveId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showcaseId, setShowcaseId] = useState<string | null>(null);
  const [importCode, setImportCode] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backdrop, setBackdrop] = useState<BackdropKind>('lab');

  // Remix links: #g=WS1-...
  useEffect(() => {
    const check = () => {
      const m = location.hash.match(/g=(WS1-[A-Za-z0-9_-]+)/);
      if (m) {
        setImportCode(m[1]);
        history.replaceState(null, '', location.pathname + location.search);
      }
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, []);

  const go = useCallback((s: Screen) => {
    play('click');
    setScreen(s);
    if (s !== 'expedition') setBackdrop(s === 'sanctuary' ? 'verdant_wilds' : 'lab');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const ui = useMemo<UIApi>(
    () => ({
      screen,
      go,
      openEvolution: (id) => {
        setDetailId(null);
        setEvolveId(id);
      },
      openCreature: (id) => setDetailId(id),
      openShowcase: (id) => setShowcaseId(id),
      openImport: (code) => setImportCode(code ?? ''),
      openSettings: () => setSettingsOpen(true),
    }),
    [screen, go],
  );

  // Screens can request a themed backdrop via a custom event (expedition environments).
  useEffect(() => {
    const onBd = (e: Event) => setBackdrop(((e as CustomEvent<BackdropKind>).detail ?? 'lab') as BackdropKind);
    window.addEventListener('wildshift:backdrop', onBd);
    return () => window.removeEventListener('wildshift:backdrop', onBd);
  }, []);


  const reduced = state.settings.reducedMotion;
  const Current = { home: HomeScreen, lab: LabScreen, expedition: ExpeditionScreen, archive: ArchiveScreen, sanctuary: SanctuaryScreen, collection: CollectionScreen }[screen];

  return (
    <UIContext.Provider value={ui}>
      <div className={`app ${reduced ? 'reduced-motion' : ''}`}>
        <Backdrop kind={backdrop} />
        <header className="topbar">
          <button className="brand" onClick={() => go('home')} aria-label="WILDSHIFT home">
            <span className="brand-mark" aria-hidden>
              <svg viewBox="0 0 32 32" width="30" height="30">
                <defs>
                  <radialGradient id="bm" cx="40%" cy="35%" r="70%">
                    <stop offset="0" stopColor="#b6fff0" />
                    <stop offset="0.6" stopColor="#2bf0c0" />
                    <stop offset="1" stopColor="#0a5a6a" />
                  </radialGradient>
                </defs>
                <path d="M6 20c0-7 4.5-12 10-12s10 5 10 12c0 3-2 5-5 5H11c-3 0-5-2-5-5z" fill="url(#bm)" />
                <circle cx="12.5" cy="17" r="2.6" fill="#fff" />
                <circle cx="19.5" cy="17" r="2.6" fill="#fff" />
                <circle cx="13" cy="17.4" r="1.2" fill="#061018" />
                <circle cx="20" cy="17.4" r="1.2" fill="#061018" />
              </svg>
            </span>
            <span className="brand-text">
              <b>WILDSHIFT</b>
              <small>Living Evolution Lab</small>
            </span>
          </button>
          <nav className="topnav" aria-label="Main">
            {NAV.map((n) => (
              <button key={n.id} className={`topnav-item ${screen === n.id ? 'active' : ''}`} onClick={() => go(n.id)} aria-current={screen === n.id ? 'page' : undefined}>
                <n.icon size={16} />
                {n.label}
              </button>
            ))}
          </nav>
          <div className="topbar-right">
            <ResourceBar resources={state.resources} />
            <button
              className="btn btn-ghost btn-icon"
              aria-label={state.settings.muted ? 'Unmute' : 'Mute'}
              onClick={() => {
                actions.updateSettings({ muted: !state.settings.muted });
                if (state.settings.muted) setTimeout(() => play('click'), 30);
              }}
            >
              {state.settings.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <button className="btn btn-ghost btn-icon" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
              <Settings size={18} />
            </button>
          </div>
        </header>

        <main className="main">
          <AnimatePresence mode="wait">
            <motion.div
              key={screen}
              className="screen"
              initial={{ opacity: 0, y: reduced ? 0 : 14 }}
              animate={{ opacity: 1, y: 0, transitionEnd: { transform: 'none' } }}
              exit={{ opacity: 0, y: reduced ? 0 : -10 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
            >
              <Current />
            </motion.div>
          </AnimatePresence>
        </main>

        <nav className="bottomnav" aria-label="Main mobile">
          {NAV.map((n) => (
            <button key={n.id} className={`bottomnav-item ${screen === n.id ? 'active' : ''}`} onClick={() => go(n.id)} aria-current={screen === n.id ? 'page' : undefined}>
              <n.icon size={20} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>

        <Toasts />
        {detailId && <CreatureDetail creatureId={detailId} onClose={() => setDetailId(null)} />}
        {showcaseId && <ShowcaseModal creatureId={showcaseId} onClose={() => setShowcaseId(null)} />}
        {importCode !== null && <ImportModal initialCode={importCode} onClose={() => setImportCode(null)} />}
        {evolveId && <EvolutionReveal creatureId={evolveId} onClose={() => setEvolveId(null)} />}
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </UIContext.Provider>
  );
}
