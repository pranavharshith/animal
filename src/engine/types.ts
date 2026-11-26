// Shared game types. Single source of truth for engine, state and UI.

export const ELEMENTS = ['ember', 'tide', 'bloom', 'volt', 'frost', 'shadow'] as const;
export type Element = (typeof ELEMENTS)[number];

export const PERSONALITIES = ['aggressive', 'defensive', 'curious', 'agile', 'adaptive'] as const;
export type Personality = (typeof PERSONALITIES)[number];

export const ENVIRONMENTS = ['ember_fields', 'abyssal_lake', 'verdant_wilds', 'stormlands', 'hollow_night'] as const;
export type EnvironmentId = (typeof ENVIRONMENTS)[number];

export const BODIES = ['orb', 'serpent', 'quadruped', 'avian', 'arthropod', 'jelly'] as const;
export type BodyType = (typeof BODIES)[number];

export const HEADS = ['round', 'beak', 'snout', 'crest', 'horns', 'antennae', 'frill', 'visor'] as const;
export type HeadType = (typeof HEADS)[number];

/** Dorsal (back) appendage. */
export const BACKS = ['none', 'membrane_wings', 'insect_wings', 'dorsal_fin', 'spines', 'shell'] as const;
export type BackType = (typeof BACKS)[number];

/** Locomotion appendage. */
export const LIMBS = ['none', 'stout', 'spindly', 'tentacles', 'fins'] as const;
export type LimbType = (typeof LIMBS)[number];

export const TAILS = ['none', 'whip', 'fan', 'club', 'plume'] as const;
export type TailType = (typeof TAILS)[number];

export const PATTERNS = ['gradient', 'spots', 'stripes', 'rings', 'scales', 'veins', 'speckles', 'chevrons'] as const;
export type PatternType = (typeof PATTERNS)[number];

export const TEXTURES = ['smooth', 'furry', 'scaly', 'glassy', 'rough'] as const;
export type TextureType = (typeof TEXTURES)[number];

export const EYES = ['pair', 'single', 'triple', 'cluster', 'slit'] as const;
export type EyeType = (typeof EYES)[number];

export const MOUTHS = ['smile', 'fangs', 'tiny', 'mandibles', 'grin'] as const;
export type MouthType = (typeof MOUTHS)[number];

export const MUTATIONS = [
  'shell_plates',
  'extra_limbs',
  'glow_markings',
  'great_wings',
  'element_tail',
  'sensor_stalks',
  'crystal_crown',
  'heat_cracks',
  'abyssal_fins',
  'leaf_mane',
  'storm_coils',
  'shadow_wisps',
  'frost_spikes',
  'third_eye',
] as const;
export type MutationId = (typeof MUTATIONS)[number];

export const RARITIES = ['common', 'unusual', 'rare', 'exotic', 'anomaly'] as const;
export type Rarity = (typeof RARITIES)[number];

export type Stage = 1 | 2 | 3;

export interface HSL {
  h: number; // 0..360
  s: number; // 0..100
  l: number; // 0..100
}

export interface Genome {
  seed: number;
  body: BodyType;
  head: HeadType;
  back: BackType;
  limbs: LimbType;
  /** Number of visible leg/fin/tentacle pairs: 1..3 */
  limbPairs: number;
  tail: TailType;
  pattern: PatternType;
  texture: TextureType;
  eyes: EyeType;
  mouth: MouthType;
  primary: HSL;
  secondary: HSL;
  accent: HSL;
  element: Element;
  /** Starting personality bias. */
  personality: Personality;
  /** Overall scale 0.85..1.15 */
  size: number;
  /** Body width / height multipliers 0.85..1.2 */
  girth: number;
  height: number;
  /** Head scale 0.8..1.25 */
  headScale: number;
  /** Organic asymmetry -1..1 */
  asym: number;
  /** Evolution potential 1..5 */
  potential: number;
  /** Mutations carried in the genome (inherited or acquired). */
  mutations: MutationId[];
  /** Anomaly organisms have shifted, impossible genetics. */
  anomaly: boolean;
}

export type Tendencies = Record<Personality, number>; // 0..100 each
export type Exposure = Record<EnvironmentId, number>; // expeditions run per environment

export type CreatureOrigin = 'starter' | 'wild' | 'fusion' | 'imported' | 'daily';

export interface HistoryEvent {
  at: number;
  kind: 'born' | 'fusion' | 'expedition' | 'evolution' | 'mutation' | 'import';
  text: string;
}

export interface Creature {
  id: string;
  name: string;
  genome: Genome;
  stage: Stage;
  generation: number;
  parentNames?: [string, string];
  tendencies: Tendencies;
  exposure: Exposure;
  /** Evolution XP accumulated toward next stage. */
  xp: number;
  expeditions: number;
  wins: number;
  origin: CreatureOrigin;
  originEnv?: EnvironmentId;
  favourite: boolean;
  bornAt: number;
  history: HistoryEvent[];
}

export interface Stats {
  vigor: number; // max HP
  power: number; // attack damage
  guard: number; // damage reduction
  speed: number; // cooldown + dodge window
  focus: number; // special charge rate
}

export interface Resources {
  bio: number; // Bio-energy: fusion
  shards: number; // Mutation shards: evolution / mutations
  dxp: number; // Discovery XP: unlocks environments
}

export const ACHIEVEMENTS = [
  'first_fusion',
  'first_mutation',
  'first_evolution',
  'five_discoveries',
  'first_anomaly',
  'rare_organism',
] as const;
export type AchievementId = (typeof ACHIEVEMENTS)[number];

export interface Settings {
  muted: boolean;
  volume: number; // 0..1
  reducedMotion: boolean;
}

export interface GameState {
  version: number;
  creatures: Creature[];
  resources: Resources;
  /** species keys `${body}:${element}` discovered */
  discovered: string[];
  /** mutation ids ever seen */
  seenMutations: MutationId[];
  achievements: Partial<Record<AchievementId, number>>;
  unlockedEnvs: EnvironmentId[];
  activeCreatureId: string | null;
  fusionCount: number;
  dailyClaimed: string | null; // YYYY-MM-DD
  settings: Settings;
  createdAt: number;
}

/** Summary of an expedition run, produced by the arena and consumed by the store. */
export interface ExpeditionLog {
  env: EnvironmentId;
  won: boolean;
  defeated: number; // enemies defeated
  attacks: number;
  dodges: number;
  perfectDodges: number;
  specials: number;
  hitsTaken: number;
  braces: number; // defensive auto-actions
  investigations: number; // curious auto-actions
  lowHpSurvived: boolean;
  durationSec: number;
  /** Genomes of defeated wild organisms (sample candidates). */
  defeatedGenomes: Genome[];
}

export interface ExpeditionRewards {
  xp: number;
  bio: number;
  shards: number;
  dxp: number;
  sample: Creature | null;
  tendencyDelta: Partial<Tendencies>;
  newDiscoveries: string[];
}

export interface EvolutionChange {
  label: string;
  reason: string;
}

export interface EvolutionResult {
  before: Creature;
  after: Creature;
  changes: EvolutionChange[];
}

export interface FusionReport {
  child: Creature;
  inherited: Array<{ trait: string; from: 'A' | 'B' | 'blend' | 'mutation'; value: string }>;
  mutation: MutationId | null;
  anomaly: boolean;
}
