// Game store: React context exposing state + synchronous actions that return results.
/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { configureAudio, play } from '../audio/sfx';
import { ACHIEVEMENT_INFO, ENV_INFO, MUTATION_INFO } from '../engine/data';
import { canEvolve, evolve } from '../engine/evolution';
import { resolveExpedition, type ExpeditionOutcome } from '../engine/expedition';
import { fuse, fusionCost, fusionSeed } from '../engine/fusion';
import { createCreature, creatureRarity, dailyGenome, RARITY_RANK, shardsToEvolve, speciesKey, todayKey } from '../engine/genetics';
import { decodeGenome } from '../engine/genomeCode';
import { ACHIEVEMENTS, type AchievementId, type Creature, type EnvironmentId, type EvolutionResult, type ExpeditionLog, type FusionReport, type GameState, type Settings } from '../engine/types';
import { clearSave, loadGame, newGame, saveGame } from './save';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'achievement' | 'discovery' | 'error';
  title: string;
  body?: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface GameActions {
  setActive(id: string): void;
  fuse(aId: string, bId: string): Result<FusionReport>;
  evolve(id: string): Result<EvolutionResult>;
  completeExpedition(id: string, log: ExpeditionLog): Result<ExpeditionOutcome>;
  unlockEnv(env: EnvironmentId): Result<EnvironmentId>;
  toggleFavourite(id: string): void;
  rename(id: string, name: string): void;
  release(id: string): Result<string>;
  importCode(code: string): Result<Creature>;
  claimDaily(): Result<Creature>;
  updateSettings(patch: Partial<Settings>): void;
  resetSave(): void;
  toast(t: Omit<Toast, 'id'>): void;
  dismissToast(id: number): void;
}

interface Ctx {
  state: GameState;
  actions: GameActions;
  toasts: Toast[];
}

const GameContext = createContext<Ctx | null>(null);

/** Register discoveries/mutations for creatures entering the collection. */
function registerCreature(s: GameState, c: Creature): { state: GameState; newSpecies: boolean } {
  const key = speciesKey(c.genome);
  const newSpecies = !s.discovered.includes(key);
  const seen = new Set(s.seenMutations);
  for (const m of c.genome.mutations) seen.add(m);
  return {
    state: {
      ...s,
      discovered: newSpecies ? [...s.discovered, key] : s.discovered,
      seenMutations: [...seen],
    },
    newSpecies,
  };
}

function replaceCreature(s: GameState, c: Creature): GameState {
  return { ...s, creatures: s.creatures.map((x) => (x.id === c.id ? c : x)) };
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(() => loadGame());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const ref = useRef(state);
  ref.current = state;
  const toastId = useRef(1);

  useEffect(() => {
    saveGame(state);
  }, [state]);

  useEffect(() => {
    configureAudio(state.settings);
  }, [state.settings]);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = toastId.current++;
    setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.kind === 'achievement' ? 5200 : 3600);
  }, []);

  /** Commit state, then unlock any achievements earned by it. */
  const commit = useCallback(
    (next: GameState) => {
      const unlocked: AchievementId[] = [];
      const has = (id: AchievementId) => next.achievements[id] !== undefined;
      const checks: Record<AchievementId, boolean> = {
        first_fusion: next.fusionCount >= 1,
        first_mutation: next.seenMutations.length >= 1,
        first_evolution: next.creatures.some((c) => c.stage >= 2),
        five_discoveries: next.discovered.length >= 5,
        first_anomaly: next.creatures.some((c) => c.genome.anomaly),
        rare_organism: next.creatures.some((c) => RARITY_RANK[creatureRarity(c)] >= RARITY_RANK.rare),
      };
      let s = next;
      for (const id of ACHIEVEMENTS) {
        if (!has(id) && checks[id]) {
          unlocked.push(id);
          const r = ACHIEVEMENT_INFO[id].reward;
          s = {
            ...s,
            achievements: { ...s.achievements, [id]: Date.now() },
            resources: { bio: s.resources.bio + (r.bio ?? 0), shards: s.resources.shards + (r.shards ?? 0), dxp: s.resources.dxp + (r.dxp ?? 0) },
          };
        }
      }
      ref.current = s;
      setState(s);
      unlocked.forEach((id, i) => {
        const info = ACHIEVEMENT_INFO[id];
        const r = info.reward;
        const reward = [r.bio && `+${r.bio} Bio-energy`, r.shards && `+${r.shards} Shards`, r.dxp && `+${r.dxp} Discovery XP`].filter(Boolean).join(' · ');
        window.setTimeout(() => {
          play('achievement');
          toast({ kind: 'achievement', title: `Achievement: ${info.name}`, body: reward });
        }, 1200 + i * 900);
      });
    },
    [toast],
  );

  const actions = useMemo<GameActions>(
    () => ({
      setActive(id) {
        commit({ ...ref.current, activeCreatureId: id });
      },

      fuse(aId, bId) {
        const s = ref.current;
        const a = s.creatures.find((c) => c.id === aId);
        const b = s.creatures.find((c) => c.id === bId);
        if (!a || !b) return { ok: false, error: 'Select two organisms' };
        if (a.id === b.id) return { ok: false, error: 'Choose two different organisms' };
        const cost = fusionCost(a, b);
        if (s.resources.bio < cost) return { ok: false, error: `Fusion needs ${cost} Bio-energy` };
        const report = fuse(a, b, fusionSeed(a, b, s.fusionCount));
        let next: GameState = {
          ...s,
          creatures: [...s.creatures, report.child],
          resources: { ...s.resources, bio: s.resources.bio - cost, dxp: s.resources.dxp + 5 },
          fusionCount: s.fusionCount + 1,
          activeCreatureId: report.child.id,
        };
        const reg = registerCreature(next, report.child);
        next = reg.state;
        commit(next);
        if (reg.newSpecies) toast({ kind: 'discovery', title: 'New species recorded', body: `${report.child.name} added to the Field Archive` });
        return { ok: true, value: report };
      },

      evolve(id) {
        const s = ref.current;
        const c = s.creatures.find((x) => x.id === id);
        if (!c) return { ok: false, error: 'Creature not found' };
        const check = canEvolve(c, s.resources.shards);
        if (!check.ok) return { ok: false, error: check.reason };
        const result = evolve(c);
        let next = replaceCreature(s, result.after);
        next = { ...next, resources: { ...next.resources, shards: next.resources.shards - shardsToEvolve(c.stage), dxp: next.resources.dxp + 20 } };
        next = registerCreature(next, result.after).state;
        commit(next);
        return { ok: true, value: result };
      },

      completeExpedition(id, log) {
        const s = ref.current;
        const c = s.creatures.find((x) => x.id === id);
        if (!c) return { ok: false, error: 'Creature not found' };
        const outcome = resolveExpedition(c, log, s.discovered);
        const r = outcome.rewards;
        let next = replaceCreature(s, outcome.creature);
        next = { ...next, resources: { bio: next.resources.bio + r.bio, shards: next.resources.shards + r.shards, dxp: next.resources.dxp + r.dxp } };
        if (r.sample) {
          next = { ...next, creatures: [...next.creatures, r.sample] };
          next = registerCreature(next, r.sample).state;
        }
        commit(next);
        return { ok: true, value: outcome };
      },

      unlockEnv(env) {
        const s = ref.current;
        if (s.unlockedEnvs.includes(env)) return { ok: true, value: env };
        const cost = ENV_INFO[env].unlockDxp;
        if (s.resources.dxp < cost) return { ok: false, error: `Needs ${cost} Discovery XP` };
        commit({ ...s, unlockedEnvs: [...s.unlockedEnvs, env], resources: { ...s.resources, dxp: s.resources.dxp - cost } });
        toast({ kind: 'success', title: `${ENV_INFO[env].name} unlocked`, body: ENV_INFO[env].tagline });
        return { ok: true, value: env };
      },

      toggleFavourite(id) {
        const s = ref.current;
        commit({ ...s, creatures: s.creatures.map((c) => (c.id === id ? { ...c, favourite: !c.favourite } : c)) });
      },

      rename(id, name) {
        const clean = name.replace(/[^\p{L}\p{N} '-]/gu, '').trim().slice(0, 16);
        if (!clean) return;
        const s = ref.current;
        commit({ ...s, creatures: s.creatures.map((c) => (c.id === id ? { ...c, name: clean } : c)) });
      },

      release(id) {
        const s = ref.current;
        if (s.creatures.length <= 2) return { ok: false, error: 'Keep at least two organisms for fusion' };
        const c = s.creatures.find((x) => x.id === id);
        if (!c) return { ok: false, error: 'Creature not found' };
        const creatures = s.creatures.filter((x) => x.id !== id);
        const bio = 6 + c.stage * 6;
        commit({
          ...s,
          creatures,
          activeCreatureId: s.activeCreatureId === id ? creatures[0].id : s.activeCreatureId,
          resources: { ...s.resources, bio: s.resources.bio + bio },
        });
        return { ok: true, value: `${c.name} returned to the wild (+${bio} Bio-energy)` };
      },

      importCode(code) {
        try {
          const d = decodeGenome(code);
          const s = ref.current;
          const c = createCreature(d.genome, 'imported', { name: d.name, stage: d.stage });
          let next: GameState = { ...s, creatures: [...s.creatures, c] };
          const reg = registerCreature(next, c);
          next = reg.state;
          commit(next);
          if (reg.newSpecies) toast({ kind: 'discovery', title: 'New species recorded', body: `${c.name} added to the Field Archive` });
          return { ok: true, value: c };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : 'Invalid genome code' };
        }
      },

      claimDaily() {
        const s = ref.current;
        const key = todayKey();
        if (s.dailyClaimed === key) return { ok: false, error: 'Already captured today. A new anomaly appears tomorrow.' };
        const g = dailyGenome(key);
        const c = createCreature(g, 'daily');
        let next: GameState = { ...s, creatures: [...s.creatures, c], dailyClaimed: key };
        const reg = registerCreature(next, c);
        next = reg.state;
        commit(next);
        const m = g.mutations[0];
        toast({ kind: 'discovery', title: `Captured ${c.name}`, body: m ? `Carries ${MUTATION_INFO[m].name}` : undefined });
        return { ok: true, value: c };
      },

      updateSettings(patch) {
        const s = ref.current;
        commit({ ...s, settings: { ...s.settings, ...patch } });
      },

      resetSave() {
        clearSave();
        const fresh = newGame();
        ref.current = fresh;
        setState(fresh);
        toast({ kind: 'info', title: 'Save reset', body: 'A fresh lab awaits.' });
      },

      toast,

      dismissToast(id) {
        setToasts((ts) => ts.filter((t) => t.id !== id));
      },
    }),
    [commit, toast],
  );

  const value = useMemo(() => ({ state, actions, toasts }), [state, actions, toasts]);
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): Ctx {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}

export function useActiveCreature(): Creature {
  const { state } = useGame();
  return state.creatures.find((c) => c.id === state.activeCreatureId) ?? state.creatures[0];
}
