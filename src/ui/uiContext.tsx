// UI navigation + global overlays (evolution reveal, specimen detail, showcase card).
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react';

export type Screen = 'home' | 'lab' | 'expedition' | 'archive' | 'sanctuary' | 'collection';

export interface UIApi {
  screen: Screen;
  go(screen: Screen): void;
  /** Open the full-screen evolution sequence for a creature (it must be eligible). */
  openEvolution(creatureId: string): void;
  /** Open the specimen detail sheet. */
  openCreature(creatureId: string): void;
  /** Open the shareable specimen card / genome sharing modal. */
  openShowcase(creatureId: string): void;
  /** Open the import-genome modal, optionally prefilled. */
  openImport(code?: string): void;
  /** Open settings (sound, reset). */
  openSettings(): void;
}

export const UIContext = createContext<UIApi | null>(null);

export function useUI(): UIApi {
  const v = useContext(UIContext);
  if (!v) throw new Error('useUI must be used within UIContext');
  return v;
}
