// Static content catalogs: elements, environments, palettes, mutations, labels.
import type {
  AchievementId,
  BackType,
  BodyType,
  Element,
  EnvironmentId,
  EyeType,
  HSL,
  HeadType,
  LimbType,
  MouthType,
  MutationId,
  PatternType,
  Personality,
  Rarity,
  TailType,
  TextureType,
} from './types';

export interface ElementInfo {
  id: Element;
  name: string;
  glyph: string;
  color: string; // main glow
  color2: string; // secondary glow
  dark: string; // deep background tone
  strongAgainst: Element;
  description: string;
}

export const ELEMENT_INFO: Record<Element, ElementInfo> = {
  ember: {
    id: 'ember',
    name: 'Ember',
    glyph: '✦',
    color: '#ff7a3d',
    color2: '#ffd166',
    dark: '#2a0d06',
    strongAgainst: 'bloom',
    description: 'Molten metabolism. Hits harder the longer a fight lasts.',
  },
  tide: {
    id: 'tide',
    name: 'Tide',
    glyph: '≈',
    color: '#3dd6ff',
    color2: '#7b8cff',
    dark: '#03182a',
    strongAgainst: 'ember',
    description: 'Pressure-born. Recovers vigor between waves.',
  },
  bloom: {
    id: 'bloom',
    name: 'Bloom',
    glyph: '❀',
    color: '#7dff8a',
    color2: '#e4ff6b',
    dark: '#06200f',
    strongAgainst: 'volt',
    description: 'Photosynthetic tissue. Regrows a little every strike.',
  },
  volt: {
    id: 'volt',
    name: 'Volt',
    glyph: 'ϟ',
    color: '#ffe14d',
    color2: '#b388ff',
    dark: '#1d1606',
    strongAgainst: 'tide',
    description: 'Charged nerves. Specials build faster.',
  },
  frost: {
    id: 'frost',
    name: 'Frost',
    glyph: '❄',
    color: '#a8f0ff',
    color2: '#e8f7ff',
    dark: '#071a24',
    strongAgainst: 'shadow',
    description: 'Crystalline hide. Shrugs off part of every hit.',
  },
  shadow: {
    id: 'shadow',
    name: 'Shadow',
    glyph: '◐',
    color: '#c77dff',
    color2: '#ff5fa2',
    dark: '#12061f',
    strongAgainst: 'frost',
    description: 'Light-eating membranes. Dodges are easier to land.',
  },
};

/** Opposing element pairs that can spark anomalies when fused. */
export const OPPOSED: Array<[Element, Element]> = [
  ['ember', 'frost'],
  ['tide', 'volt'],
  ['bloom', 'shadow'],
];

export function elementMultiplier(attacker: Element, defender: Element): number {
  if (ELEMENT_INFO[attacker].strongAgainst === defender) return 1.5;
  if (ELEMENT_INFO[defender].strongAgainst === attacker) return 0.75;
  return 1;
}

export interface EnvironmentInfo {
  id: EnvironmentId;
  name: string;
  element: Element;
  tagline: string;
  sky: [string, string, string];
  ground: string;
  glow: string;
  unlockDxp: number;
  /** Mutations this environment nudges toward. */
  mutations: MutationId[];
  adaptation: string;
}

export const ENV_INFO: Record<EnvironmentId, EnvironmentInfo> = {
  ember_fields: {
    id: 'ember_fields',
    name: 'Ember Fields',
    element: 'ember',
    tagline: 'Volcanic terraces and singing crystals',
    sky: ['#1a0604', '#4a1408', '#8a2c0c'],
    ground: '#2b0f08',
    glow: '#ff7a3d',
    unlockDxp: 0,
    mutations: ['heat_cracks', 'element_tail', 'crystal_crown'],
    adaptation: 'heat-resistant hide',
  },
  abyssal_lake: {
    id: 'abyssal_lake',
    name: 'Abyssal Lake',
    element: 'tide',
    tagline: 'A drowned forest under crushing dark water',
    sky: ['#010812', '#04203a', '#0a4a6a'],
    ground: '#031a2a',
    glow: '#3dd6ff',
    unlockDxp: 0,
    mutations: ['abyssal_fins', 'glow_markings', 'sensor_stalks'],
    adaptation: 'pressure-adapted fins',
  },
  verdant_wilds: {
    id: 'verdant_wilds',
    name: 'Verdant Wilds',
    element: 'bloom',
    tagline: 'Carnivorous canopies and walking spores',
    sky: ['#031008', '#0b2e17', '#1d5a2a'],
    ground: '#0a2412',
    glow: '#7dff8a',
    unlockDxp: 60,
    mutations: ['leaf_mane', 'extra_limbs', 'shell_plates'],
    adaptation: 'photosynthetic mane',
  },
  stormlands: {
    id: 'stormlands',
    name: 'Stormlands',
    element: 'volt',
    tagline: 'Floating islands torn by endless lightning',
    sky: ['#07061a', '#1d1a44', '#3c3474'],
    ground: '#1a1838',
    glow: '#ffe14d',
    unlockDxp: 140,
    mutations: ['storm_coils', 'great_wings', 'element_tail'],
    adaptation: 'conductive coils',
  },
  hollow_night: {
    id: 'hollow_night',
    name: 'Hollow Night',
    element: 'shadow',
    tagline: 'A sunless hollow lit only by living things',
    sky: ['#030108', '#110622', '#24103e'],
    ground: '#0c0418',
    glow: '#c77dff',
    unlockDxp: 240,
    mutations: ['shadow_wisps', 'third_eye', 'glow_markings'],
    adaptation: 'light-drinking wisps',
  },
};

export interface Palette {
  name: string;
  primary: HSL;
  secondary: HSL;
  accent: HSL;
}

/** 8 base palettes for wild organisms. Fusion blends between them freely. */
export const PALETTES: Palette[] = [
  { name: 'Magma Moth', primary: { h: 14, s: 82, l: 52 }, secondary: { h: 40, s: 90, l: 62 }, accent: { h: 52, s: 100, l: 70 } },
  { name: 'Reef Ghost', primary: { h: 192, s: 75, l: 50 }, secondary: { h: 228, s: 60, l: 58 }, accent: { h: 170, s: 90, l: 70 } },
  { name: 'Moss Lantern', primary: { h: 128, s: 55, l: 45 }, secondary: { h: 78, s: 70, l: 55 }, accent: { h: 58, s: 95, l: 66 } },
  { name: 'Static Plum', primary: { h: 268, s: 55, l: 52 }, secondary: { h: 48, s: 95, l: 58 }, accent: { h: 300, s: 80, l: 70 } },
  { name: 'Glacier Pearl', primary: { h: 196, s: 45, l: 78 }, secondary: { h: 214, s: 40, l: 60 }, accent: { h: 180, s: 80, l: 85 } },
  { name: 'Velvet Eclipse', primary: { h: 284, s: 45, l: 30 }, secondary: { h: 330, s: 75, l: 55 }, accent: { h: 270, s: 90, l: 72 } },
  { name: 'Coral Dusk', primary: { h: 350, s: 70, l: 60 }, secondary: { h: 20, s: 80, l: 70 }, accent: { h: 190, s: 85, l: 65 } },
  { name: 'Sulfur Bloom', primary: { h: 60, s: 70, l: 55 }, secondary: { h: 100, s: 50, l: 40 }, accent: { h: 30, s: 100, l: 60 } },
];

/** Element-preferred palette indices for wild generation. */
export const ELEMENT_PALETTES: Record<Element, number[]> = {
  ember: [0, 6, 7],
  tide: [1, 4, 6],
  bloom: [2, 7, 1],
  volt: [3, 7, 0],
  frost: [4, 1, 5],
  shadow: [5, 3, 6],
};

export interface MutationInfo {
  id: MutationId;
  name: string;
  description: string;
  rarity: number; // contribution to rarity score
  element?: Element;
}

export const MUTATION_INFO: Record<MutationId, MutationInfo> = {
  shell_plates: { id: 'shell_plates', name: 'Shell Plates', description: 'Overlapping armour plates grow along the spine.', rarity: 2 },
  extra_limbs: { id: 'extra_limbs', name: 'Extra Limbs', description: 'An additional pair of limbs sprouts from the flank.', rarity: 2 },
  glow_markings: { id: 'glow_markings', name: 'Glow Markings', description: 'Bioluminescent runes pulse beneath the skin.', rarity: 1 },
  great_wings: { id: 'great_wings', name: 'Great Wings', description: 'Wings stretch to twice their span.', rarity: 3 },
  element_tail: { id: 'element_tail', name: 'Elemental Tail', description: 'The tail tip ignites with raw elemental energy.', rarity: 2 },
  sensor_stalks: { id: 'sensor_stalks', name: 'Sensor Stalks', description: 'Twin feelers that taste the air for danger.', rarity: 1 },
  crystal_crown: { id: 'crystal_crown', name: 'Crystal Crown', description: 'A ring of living crystal erupts from the skull.', rarity: 3 },
  heat_cracks: { id: 'heat_cracks', name: 'Heat Cracks', description: 'Glowing fissures vent excess heat.', rarity: 2, element: 'ember' },
  abyssal_fins: { id: 'abyssal_fins', name: 'Abyssal Fins', description: 'Translucent fins evolved for crushing depths.', rarity: 2, element: 'tide' },
  leaf_mane: { id: 'leaf_mane', name: 'Leaf Mane', description: 'A mane of photosynthetic fronds.', rarity: 2, element: 'bloom' },
  storm_coils: { id: 'storm_coils', name: 'Storm Coils', description: 'Copper-bright coils store static charge.', rarity: 2, element: 'volt' },
  shadow_wisps: { id: 'shadow_wisps', name: 'Shadow Wisps', description: 'Trailing wisps that drink the light.', rarity: 3, element: 'shadow' },
  frost_spikes: { id: 'frost_spikes', name: 'Frost Spikes', description: 'Ice spines crystallise along the back.', rarity: 2, element: 'frost' },
  third_eye: { id: 'third_eye', name: 'Third Eye', description: 'A vertical eye opens on the brow.', rarity: 3 },
};

export interface PersonalityInfo {
  id: Personality;
  name: string;
  color: string;
  verb: string;
  description: string;
}

export const PERSONALITY_INFO: Record<Personality, PersonalityInfo> = {
  aggressive: { id: 'aggressive', name: 'Aggressive', color: '#ff5d5d', verb: 'lunges', description: 'Strikes first, thinks later.' },
  defensive: { id: 'defensive', name: 'Defensive', color: '#5da9ff', verb: 'braces', description: 'Endures what others flee from.' },
  curious: { id: 'curious', name: 'Curious', color: '#ffd35d', verb: 'investigates', description: 'Pokes at everything unknown.' },
  agile: { id: 'agile', name: 'Agile', color: '#5dffb4', verb: 'darts', description: 'Never where you expect it.' },
  adaptive: { id: 'adaptive', name: 'Adaptive', color: '#d78bff', verb: 'mimics', description: 'Becomes what the world demands.' },
};

export const RARITY_INFO: Record<Rarity, { name: string; color: string; glow: string }> = {
  common: { name: 'Common', color: '#b9c6d3', glow: 'rgba(185,198,211,0.35)' },
  unusual: { name: 'Unusual', color: '#6dff9e', glow: 'rgba(109,255,158,0.4)' },
  rare: { name: 'Rare', color: '#5ec8ff', glow: 'rgba(94,200,255,0.45)' },
  exotic: { name: 'Exotic', color: '#d58cff', glow: 'rgba(213,140,255,0.5)' },
  anomaly: { name: 'Anomaly', color: '#ff4fd8', glow: 'rgba(255,79,216,0.6)' },
};

export const ACHIEVEMENT_INFO: Record<AchievementId, { name: string; description: string; reward: { bio?: number; shards?: number; dxp?: number } }> = {
  first_fusion: { name: 'First Fusion', description: 'Fuse two organisms into something new.', reward: { shards: 2 } },
  first_mutation: { name: 'First Mutation', description: 'Witness a genetic mutation.', reward: { bio: 20 } },
  first_evolution: { name: 'First Evolution', description: 'Evolve a creature to its next form.', reward: { dxp: 40 } },
  five_discoveries: { name: 'Five Discoveries', description: 'Record five species in the Field Archive.', reward: { bio: 30 } },
  first_anomaly: { name: 'First Anomaly', description: 'Create or find an Anomaly organism.', reward: { shards: 4 } },
  rare_organism: { name: 'Rare Organism', description: 'Own a creature of Rare rarity or higher.', reward: { shards: 2 } },
};

// Human labels for genes.
export const BODY_LABEL: Record<BodyType, string> = {
  orb: 'Orbital',
  serpent: 'Serpentine',
  quadruped: 'Quadruped',
  avian: 'Avian',
  arthropod: 'Arthropod',
  jelly: 'Medusoid',
};
export const HEAD_LABEL: Record<HeadType, string> = {
  round: 'Dome',
  beak: 'Beaked',
  snout: 'Snouted',
  crest: 'Crested',
  horns: 'Horned',
  antennae: 'Antennate',
  frill: 'Frilled',
  visor: 'Visored',
};
export const BACK_LABEL: Record<BackType, string> = {
  none: 'Bare',
  membrane_wings: 'Membrane Wings',
  insect_wings: 'Gossamer Wings',
  dorsal_fin: 'Dorsal Fin',
  spines: 'Spines',
  shell: 'Carapace',
};
export const LIMB_LABEL: Record<LimbType, string> = {
  none: 'Limbless',
  stout: 'Stout Legs',
  spindly: 'Spindle Legs',
  tentacles: 'Tentacles',
  fins: 'Paddle Fins',
};
export const TAIL_LABEL: Record<TailType, string> = {
  none: 'No Tail',
  whip: 'Whip Tail',
  fan: 'Fan Tail',
  club: 'Club Tail',
  plume: 'Plume Tail',
};
export const PATTERN_LABEL: Record<PatternType, string> = {
  gradient: 'Gradient',
  spots: 'Spotted',
  stripes: 'Striped',
  rings: 'Ringed',
  scales: 'Scaled',
  veins: 'Veined',
  speckles: 'Speckled',
  chevrons: 'Chevroned',
};
export const TEXTURE_LABEL: Record<TextureType, string> = {
  smooth: 'Smooth',
  furry: 'Furred',
  scaly: 'Scaly',
  glassy: 'Glassy',
  rough: 'Rough',
};
export const EYE_LABEL: Record<EyeType, string> = {
  pair: 'Paired Eyes',
  single: 'Cyclopic',
  triple: 'Triocular',
  cluster: 'Eye Cluster',
  slit: 'Slit Eyes',
};
export const MOUTH_LABEL: Record<MouthType, string> = {
  smile: 'Soft Mouth',
  fangs: 'Fanged',
  tiny: 'Pinhole',
  mandibles: 'Mandibles',
  grin: 'Wide Grin',
};

/** Gene rarity weights: higher is rarer (used for wild generation + rarity score). */
export const GENE_RARITY: Partial<Record<string, number>> = {
  'body:jelly': 1,
  'body:arthropod': 1,
  'head:visor': 1,
  'head:frill': 1,
  'back:insect_wings': 1,
  'back:shell': 1,
  'limbs:tentacles': 1,
  'tail:plume': 1,
  'eyes:triple': 1,
  'eyes:cluster': 1,
  'pattern:veins': 1,
  'texture:glassy': 1,
};

export function hsl(c: HSL, dl = 0, ds = 0, alpha = 1): string {
  const l = Math.max(0, Math.min(100, c.l + dl));
  const s = Math.max(0, Math.min(100, c.s + ds));
  return alpha >= 1 ? `hsl(${c.h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)` : `hsl(${c.h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}% / ${alpha})`;
}
