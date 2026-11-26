import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Info, Sparkles, Telescope, Trophy } from 'lucide-react';
import { useGame } from '../../state/store';
import './toasts.css';

const ICON = { info: Info, success: Sparkles, achievement: Trophy, discovery: Telescope, error: AlertTriangle };

export function Toasts() {
  const { toasts, actions } = useGame();
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <motion.button
              layout
              key={t.id}
              className={`toast toast-${t.kind}`}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              onClick={() => actions.dismissToast(t.id)}
            >
              <Icon size={18} />
              <span>
                <b>{t.title}</b>
                {t.body && <small>{t.body}</small>}
              </span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
