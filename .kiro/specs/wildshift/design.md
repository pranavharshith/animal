# WILDSHIFT — Design

## Stack
React 19 + TypeScript + Vite 8. Framer Motion for screen and reveal transitions.
Lucide for icons. All creature art is procedural SVG. Sounds are WebAudio synth.
No backend. State persists to `localStorage` key `wildshift.save.v1`.

## Module layout
```
src/
  engine/            pure, deterministic game logic (no React)
    rng.ts           mulberry32 PRNG, string hashing, pick/weighted helpers
    types.ts         all shared types (single source of truth)
    data.ts          catalogs: elements, environments, palettes, parts, mutations, achievements
    genetics.ts      wild genome generation, stats, rarity, species key
    naming.ts        syllable-based procedural names
    fusion.ts        fuse(a, b, seed) -> child creature + report
    behaviour.ts     tendencies, dominant personality, auto-action AI weights
    evolution.ts     eligibility, weighted mutation choice, anatomy transforms, change log
    expedition.ts    real-time encounter simulation (tick reducer) + reward calc
    genomeCode.ts    encode/decode share codes (base64url + checksum)
  state/
    save.ts          load/save/reset with schema version
    store.tsx        React context + reducer; every game action lives here
  audio/sfx.ts       synthesised sound effects + mute/volume
  render/
    CreatureSVG.tsx  modular anatomy renderer (anchors per body type)
    Backdrop.tsx     animated environment/ecosystem backgrounds
    card.ts          specimen card PNG export via canvas
  ui/                screens + shared components, each with its own CSS file
```

## Creature model
- `Genome` holds every visual and genetic trait (see `engine/types.ts`).
- `Creature` = genome + stage + tendencies + exposure + xp + history + metadata.
- Stats are derived (`computeStats`) from genome, stage, mutations and tendencies.
- Rarity is derived (`computeRarity`) from a score: rare genes + mutations + stage + anomaly flag.

## Determinism
- `genomeFromSeed(seed, opts)` always yields the same genome for the same seed and options.
- `fuse(a, b, seed)` is deterministic given its inputs; the seed comes from
  `hash(a.seed, b.seed, fusionCount)`.
- Share codes encode the full genome + stage + mutations, so import is exact.

## Rendering
SVG viewBox `0 0 200 200`. Each body type defines anchors:
head, back, tail, leg slots, belly line. Parts are drawn relative to anchors, so wings
always attach to the back and legs to the underside. Layers (back to front):
ground shadow, aura, tail, far limbs, far wing, body, pattern (clipped to body),
mutations on body, near limbs, near wing, head, crest, eyes, mouth, element particles.
Animation is CSS keyframes (transform only) for performance: breathing, blinking with a
per-seed delay, wing flap, tentacle sway, and a personality idle (aggressive lunge,
defensive sway, curious head tilt, agile hop, adaptive shimmer).

## Fusion rules
For each trait, inherit from A or B by weighted coin (ties broken by dominance of the
element pair). Colours blend in HSL with a hue drift. Proportions average with jitter.
Mutation chance 25% (+ potential). Anomaly chance 4%, or guaranteed when both parents carry
opposing elements (Ember+Frost, Tide+Volt, Bloom+Shadow) and a roll passes 20%.

## Behaviour and evolution
Tendencies are 0–100 per personality. Expedition logs shift them. The dominant tendency
drives auto-actions in combat and anatomy changes on evolution. Exposure per environment
adds weights to environment-specific mutations. Evolution thresholds: 80 XP (stage 2),
200 XP (stage 3); costs 2 / 4 Mutation Shards.

## Expedition
Two waves of wild organisms generated from the environment's element. Enemy loop:
idle → wind-up (telegraph ~0.9s) → strike. Player commands: ATTACK (cooldown), DODGE
(i-frames, perfect dodge charges SPECIAL), SPECIAL (charge 100, elemental multiplier).
If the player is idle for 1.6s, the creature acts on its own personality.
The simulation is a pure `tick(state, dt, input)` function rendered by the arena screen.

## Sharing
Code format `WS1.<base64url payload>.<checksum>`. Remix link `#g=<code>`.
PNG card drawn on a 900×1260 canvas: element gradient, creature SVG rasterised, text.
