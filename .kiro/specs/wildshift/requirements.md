# WILDSHIFT: The Living Evolution Lab — Requirements

## Vision
Create a creature. Watch it learn. Discover what it becomes.
A browser-only, single-player game about fusing procedurally generated organisms,
sending them on short expeditions, and watching their behaviour reshape their anatomy.

## Success criterion
A new player can create, evolve and share a unique creature in under five minutes,
without reading instructions.

## Functional requirements

### R1 Procedural creatures
- R1.1 Every creature has a deterministic genome produced from a 32-bit seed.
- R1.2 Genome fields: body, head, appendages, limb count, texture, primary/secondary/accent
  colour, pattern, eyes, mouth, element, personality, proportions, evolution potential.
- R1.3 Asset library minimums: 6 bodies, 10 appendages, 8 heads, 8 patterns, 8 palettes,
  6 element effects, 5 eye and 5 mouth configurations.
- R1.4 Anatomy is anchored: wings attach to the back, legs to the underside, head to the neck.
- R1.5 Every creature breathes, blinks, moves, and has a personality-specific idle animation.
- R1.6 Rendering is local SVG. No image APIs.

### R2 Fusion
- R2.1 Player picks two parents in the Fusion Chamber; their traits are shown side by side.
- R2.2 FUSE costs Bio-energy, combines genes per trait (inherit A, inherit B, or blend),
  may introduce a mutation, and may produce an Anomaly.
- R2.3 The child gets a procedurally generated name, rarity, stats, and a new seed.
- R2.4 A multi-stage reveal animation shows parents → genetic merge → new creature.

### R3 Behaviour & evolution
- R3.1 Five personalities: aggressive, defensive, curious, agile, adaptive, stored as tendencies.
- R3.2 Expedition actions shift tendencies (attacks → aggressive, dodges → agile, surviving at
  low HP → defensive, discoveries/new environments → curious, varied environments → adaptive).
- R3.3 Environments accumulate exposure on the creature.
- R3.4 With enough Evolution XP and Mutation Shards a creature evolves (stage 1 → 2 → 3).
- R3.5 Evolution selects mutations by weighted score from tendencies, exposure and element,
  and visibly changes anatomy.
- R3.6 Evolution reveal: dim, energy build-up, silhouette morph, burst, before/after,
  list of what changed and why.

### R4 Elements & environments
- R4.1 Elements: Ember, Tide, Bloom, Volt, Frost, Shadow, each with colours, FX, advantages.
- R4.2 Environments: Ember Fields, Abyssal Lake, Verdant Wilds, Stormlands, Hollow Night.
  Later environments unlock with Discovery XP.

### R5 Expedition
- R5.1 Pick a creature and an environment; fight two wild organisms in a small animated arena.
- R5.2 Commands: ATTACK, DODGE, SPECIAL. Enemies telegraph attacks. Creature acts on its own
  personality when the player is idle.
- R5.3 Encounter lasts roughly 20–40 seconds.
- R5.4 Rewards: Evolution XP, Bio-energy, Mutation Shards, Discovery XP, chance of a genetic sample.

### R6 Field Archive
- R6.1 Species atlas (body × element = 36 species). Undiscovered entries are silhouettes.
- R6.2 Entry detail: art, name, stage, element, rarity, genes, mutations, discovery environment.
- R6.3 Discovery percentage.
- R6.4 Rarity tiers: Common, Unusual, Rare, Exotic, Anomaly, computed from genetics.

### R7 Sharing
- R7.1 Each creature has a reproducible genome code (with checksum).
- R7.2 Copy code, import code, remix an imported creature with your own.
- R7.3 Download a premium specimen card as PNG.
- R7.4 Native share (navigator.share) when available; remix link `#g=<code>` opens import.

### R8 Interface
- R8.1 Screens: Home, Lab, Expedition, Archive, Sanctuary, Collection.
- R8.2 Bioluminescent alien nature × biological lab: dark, glass panels, glow, particles.
- R8.3 Responsive desktop and mobile.

### R9 Progression
- R9.1 Resources: Bio-energy, Mutation Shards, Discovery XP.
- R9.2 Two starter creatures plus enough resources for the first fusion.
- R9.3 Achievements: First Fusion, First Mutation, First Evolution, Five Discoveries,
  First Anomaly, Rare Organism.
- R9.4 Daily Anomaly: one claimable date-seeded specimen per day.

### R10 Technical
- R10.1 React + TypeScript + Vite, CSS, SVG, Framer Motion, Lucide.
- R10.2 LocalStorage save, survives refresh, reset option, versioned schema.
- R10.3 Mute and volume controls; sounds synthesised with WebAudio (no audio files).
- R10.4 No backend, no auth, no external AI.
