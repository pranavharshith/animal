// Persistence: versioned LocalStorage save with safe fallbacks.
import { createCreature, speciesKey, starterGenomes } from '../engine/genetics';
import type { GameState } from '../engine/types';

export const SAVE_KEY = 'wildshift.save.v1';
export const SAVE_VERSION = 1;

export function newGame(): GameState {
  const [ga, gb] = starterGenomes();
  const a = createCreature(ga, 'starter', { name: 'Cindrel' });
  const b = createCreature(gb, 'starter', { name: 'Maruula' });
  a.favourite = true;
  return {
    version: SAVE_VERSION,
    creatures: [a, b],
    resources: { bio: 60, shards: 3, dxp: 0 },
    discovered: [speciesKey(ga), speciesKey(gb)],
    seenMutations: [],
    achievements: {},
    unlockedEnvs: ['ember_fields', 'abyssal_lake'],
    activeCreatureId: a.id,
    fusionCount: 0,
    dailyClaimed: null,
    settings: { muted: false, volume: 0.6, reducedMotion: false },
    createdAt: Date.now(),
  };
}

function isValid(s: unknown): s is GameState {
  if (!s || typeof s !== 'object') return false;
  const g = s as GameState;
  return g.version === SAVE_VERSION && Array.isArray(g.creatures) && g.creatures.length > 0 && !!g.resources && Array.isArray(g.discovered);
}

export function loadGame(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return newGame();
    const parsed: unknown = JSON.parse(raw);
    if (!isValid(parsed)) return newGame();
    const fresh = newGame();
    // Fill any fields added after the save was written.
    return {
      ...fresh,
      ...parsed,
      settings: { ...fresh.settings, ...parsed.settings },
      resources: { ...fresh.resources, ...parsed.resources },
    };
  } catch {
    return newGame();
  }
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked (private mode). The game keeps running in memory.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
