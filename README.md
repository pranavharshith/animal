# WILDSHIFT — The Living Evolution Lab

**Create a creature. Watch it learn. Discover what it becomes.**

A browser game about fusing procedurally generated organisms, sending them on short real-time
expeditions, and watching how they behave there reshape their bodies when they evolve.
Everything runs locally in the browser: no backend, no accounts, no AI APIs, no image assets.
Every creature is drawn as procedural SVG from its genome.

## Play

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## The loop (5 minutes)

1. **Fuse.** Pick two organisms in the Fusion Chamber and press FUSE. Genes are inherited per trait
   (body, head, wings/fins/shell, limbs, tail, pattern, eyes, mouth, element, colours), with a
   chance of novel traits, mutations and rare **Anomalies** (opposed elements raise the odds).
2. **Explore.** Send a creature into one of five environments and fight two waves of wild
   organisms with ATTACK / DODGE / SPECIAL (keys A, D, S). Dodge in the bright part of the
   telegraph bar to land a PERFECT dodge. If you stop giving commands, the creature acts on its
   own personality.
3. **Evolve.** How it fought (attacks, dodges, braces, investigations) shifts its five tendencies.
   The places it visited unlock environment-specific mutations. Evolution changes its anatomy
   and tells you *why* each change happened.
4. **Share.** Every creature has a genome code (`WS1-…`). Download a specimen card PNG, copy the
   code, or share a remix link (`#g=WS1-…`) that lets anyone grow an exact copy and fuse it with
   their own organisms.

## Screens

| Screen | Purpose |
| --- | --- |
| Home | Current specimen, PLAY, discovery progress, daily anomaly, recent discoveries |
| Lab | Fusion chamber with trait comparison and fusion reveal |
| Expedition | Environment select, real-time arena, rewards and behaviour drift |
| Archive | 36-species atlas (6 body plans × 6 elements), silhouettes for undiscovered |
| Sanctuary | Habitat where your favourite creatures wander |
| Collection | Resources, specimen library, achievements, mutation codex |

## Architecture

```
src/
  engine/      pure deterministic game logic (no React)
    rng.ts         seeded PRNG + hashing
    types.ts       shared types
    data.ts        elements, environments, palettes, mutations, achievements, labels
    genetics.ts    wild genomes, stats, rarity, species, starters, daily anomaly
    naming.ts      procedural names
    fusion.ts      genome recombination
    behaviour.ts   tendencies and personality auto-actions
    evolution.ts   experience-driven mutations and anatomy changes
    expedition.ts  enemy generation and reward resolution
    arena.ts       real-time combat simulation (pure tick function)
    genomeCode.ts  share-code encode/decode with checksum
  state/       LocalStorage persistence + React store (all game actions)
  render/      CreatureSVG (modular anatomy), Backdrop, specimen card PNG
  audio/       WebAudio synthesised sound effects
  ui/          screens, overlays, shared components
```

The spec this was built from lives in `.kiro/specs/wildshift/`.

Progress saves automatically to LocalStorage. Sound, volume, reduced motion and save reset are in
Settings (gear icon).
