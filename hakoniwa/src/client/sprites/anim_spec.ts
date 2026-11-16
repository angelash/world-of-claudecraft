// Animation vocabulary (art_pipeline.md 3.4 and 3.5): four display directions (left is the
// mirror of right) and the animations of the action strips. A strip is one imported sheet
// (template chr_<strip>); its cells carry the animation names below, so a name here is the
// name the processed frame metadata uses. The mannequin and every equippable outfit have the
// 13 strips of ACTION_STRIPS (art_pipeline.md 3.3); main characters add thrust and their
// signature idle. `attack` is the generic swing a combat event cues without saying the
// weapon: it plays the melee strip on people and the attack row on creature sheets.
//
// The procedural placeholder draws five poses (idle, walk, attack, hit, death); every other
// animation borrows the nearest of them (proceduralPose), so the placeholder never needs a
// drawing per animation and the first five keep their first-round pixels. Pure.

export type Dir = 'down' | 'right' | 'up' | 'left';
export const DIRS: readonly Dir[] = ['down', 'right', 'up', 'left'];

/** The 13 action strips of the mannequin and equippable outfits (art_pipeline.md 3.3). */
export const ACTION_STRIPS = [
  'idle',
  'walk',
  'run',
  'attack_melee',
  'attack_ranged',
  'cast',
  'hit',
  'death',
  'combat_idle',
  'life_a',
  'life_b',
  'emote',
  'ride',
] as const;
/** Strips only main characters have (art_pipeline.md 3.4). */
export const MAIN_ONLY_STRIPS = ['attack_thrust', 'signature'] as const;
export type ActionStrip = (typeof ACTION_STRIPS)[number] | (typeof MAIN_ONLY_STRIPS)[number];

export const LIFE_A = ['sit', 'lie', 'work', 'carry'] as const;
export const LIFE_B = ['pray', 'talk', 'eat', 'read'] as const;
export const EMOTES = [
  'nod',
  'shake',
  'wave',
  'bow',
  'cheer',
  'slump',
  'angry',
  'startle',
] as const;

export type AnimName =
  | 'idle'
  | 'walk'
  | 'run'
  | 'attack'
  | 'melee'
  | 'thrust'
  | 'shoot'
  | 'cast'
  | 'cast_release'
  | 'channel'
  | 'hit'
  | 'block'
  | 'dodge'
  | 'death'
  | 'revive'
  | 'combat_idle'
  | 'stun'
  | (typeof LIFE_A)[number]
  | (typeof LIFE_B)[number]
  | (typeof EMOTES)[number]
  | 'signature'
  | 'ride_idle'
  | 'ride';

/** The five poses the procedural placeholder draws. */
export type ProceduralPose = 'idle' | 'walk' | 'attack' | 'hit' | 'death';

export interface AnimSpec {
  frames: number;
  /** per-frame duration in ms (distance-driven cycles advance by tiles instead) */
  frameMs: readonly number[];
  loop: boolean;
  /** the strip whose sheet holds the animation */
  strip: ActionStrip;
  /** the animation's name inside that strip's frame metadata (differs for borrowed frames) */
  sheetAnim: string;
  /** borrowed frames play backwards (revive is the death strip reversed) */
  reverse?: boolean;
  /** the placeholder pose standing in until art exists */
  pose: ProceduralPose;
}

const spec = (
  frames: number,
  ms: number | readonly number[],
  loop: boolean,
  strip: ActionStrip,
  pose: ProceduralPose,
  sheetAnim?: string,
  reverse?: boolean,
): Omit<AnimSpec, 'sheetAnim'> & { sheetAnim?: string } => ({
  frames,
  frameMs: typeof ms === 'number' ? Array.from({ length: frames }, () => ms) : ms,
  loop,
  strip,
  pose,
  ...(sheetAnim ? { sheetAnim } : {}),
  ...(reverse ? { reverse } : {}),
});

const RAW: Record<AnimName, ReturnType<typeof spec>> = {
  idle: spec(4, 220, true, 'idle', 'idle'),
  walk: spec(6, 100, true, 'walk', 'walk'),
  run: spec(6, 80, true, 'run', 'walk'),
  attack: spec(4, [80, 70, 90, 120], false, 'attack_melee', 'attack', 'melee'),
  melee: spec(4, [80, 70, 90, 120], false, 'attack_melee', 'attack'),
  thrust: spec(5, [80, 90, 70, 100, 120], false, 'attack_thrust', 'attack'),
  shoot: spec(6, [120, 140, 100, 60, 100, 120], false, 'attack_ranged', 'attack'),
  cast: spec(4, 150, true, 'cast', 'idle'),
  cast_release: spec(4, [80, 60, 100, 140], false, 'cast', 'attack'),
  channel: spec(4, 150, true, 'cast', 'idle', 'cast'),
  hit: spec(2, [80, 120], false, 'hit', 'hit'),
  block: spec(2, [80, 160], false, 'hit', 'hit'),
  dodge: spec(2, [70, 130], false, 'hit', 'hit'),
  death: spec(4, [100, 120, 140, 160], false, 'death', 'death'),
  revive: spec(4, 120, false, 'death', 'death', 'death', true),
  combat_idle: spec(4, 200, true, 'combat_idle', 'idle'),
  stun: spec(4, 160, true, 'combat_idle', 'idle'),
  sit: spec(2, 450, true, 'life_a', 'idle'),
  lie: spec(2, 450, true, 'life_a', 'idle'),
  work: spec(2, 450, true, 'life_a', 'idle'),
  carry: spec(2, 450, true, 'life_a', 'idle'),
  pray: spec(2, 450, true, 'life_b', 'idle'),
  talk: spec(2, 450, true, 'life_b', 'idle'),
  eat: spec(2, 450, true, 'life_b', 'idle'),
  read: spec(2, 450, true, 'life_b', 'idle'),
  nod: spec(2, 250, false, 'emote', 'idle'),
  shake: spec(2, 250, false, 'emote', 'idle'),
  wave: spec(2, 250, false, 'emote', 'idle'),
  bow: spec(2, 250, false, 'emote', 'idle'),
  cheer: spec(2, 250, false, 'emote', 'idle'),
  slump: spec(2, 250, false, 'emote', 'idle'),
  angry: spec(2, 250, false, 'emote', 'idle'),
  startle: spec(2, 250, false, 'emote', 'idle'),
  signature: spec(4, 220, true, 'signature', 'idle'),
  ride_idle: spec(2, 300, true, 'ride', 'idle'),
  ride: spec(4, 150, true, 'ride', 'walk'),
};

export const ANIM_SPECS: Readonly<Record<AnimName, AnimSpec>> = Object.fromEntries(
  Object.entries(RAW).map(([name, s]) => [name, { ...s, sheetAnim: s.sheetAnim ?? name }]),
) as Record<AnimName, AnimSpec>;

export const ANIMS: readonly AnimName[] = Object.keys(RAW) as AnimName[];

/** The animations the placeholder draws itself: one per procedural pose. */
export const PROCEDURAL_POSES: readonly ProceduralPose[] = [
  'idle',
  'walk',
  'attack',
  'hit',
  'death',
];

const POSE_FRAMES: Readonly<Record<ProceduralPose, number>> = {
  idle: 4,
  walk: 6,
  attack: 4,
  hit: 2,
  death: 4,
};

/** Walk frames advance by distance travelled (about 0.32 tiles per frame, 3.4). */
export const WALK_TILES_PER_FRAME = 0.32;
/** Run frames advance by distance too (about 0.5 tiles per frame, 3.4). */
export const RUN_TILES_PER_FRAME = 0.5;

export function animDuration(anim: AnimName): number {
  return ANIM_SPECS[anim].frameMs.reduce((a, b) => a + b, 0);
}

/** Frame index for a one-shot or looping timed animation at `elapsedMs`. */
export function frameAt(anim: AnimName, elapsedMs: number): number {
  const spec = ANIM_SPECS[anim];
  const total = animDuration(anim);
  let t = Math.max(0, elapsedMs);
  if (spec.loop) t %= total;
  else if (t >= total) return spec.frames - 1;
  for (let i = 0; i < spec.frames; i++) {
    const d = spec.frameMs[i] as number;
    if (t < d) return i;
    t -= d;
  }
  return spec.frames - 1;
}

/**
 * The placeholder pose and frame for an animation frame. The five poses map to themselves;
 * a borrowed pose plays reversed when the animation does, loops through the pose's frames
 * when the animation loops, and holds the pose's last frame otherwise.
 */
export function proceduralPose(
  anim: AnimName,
  frame: number,
): { pose: ProceduralPose; frame: number } {
  const s = ANIM_SPECS[anim];
  const n = POSE_FRAMES[s.pose];
  const f = Math.max(0, Math.min(s.frames - 1, Math.floor(frame)));
  const k = s.reverse ? s.frames - 1 - f : f;
  return { pose: s.pose, frame: s.loop ? k % n : Math.min(k, n - 1) };
}

/** The frame a strip shows for an animation frame (borrowed animations read reversed). */
export function stripFrame(anim: AnimName, frame: number): number {
  const s = ANIM_SPECS[anim];
  const f = Math.max(0, Math.min(s.frames - 1, Math.floor(frame)));
  return s.reverse ? s.frames - 1 - f : f;
}

/**
 * Quantise a world facing angle to a display direction. Facing follows the world
 * system: atan2(dy, dx) with +y pointing down the map (south).
 */
export function dirFromFacing(facing: number): Dir {
  const a = Math.atan2(Math.sin(facing), Math.cos(facing));
  const q = Math.PI / 4;
  if (a > -q && a <= q) return 'right';
  if (a > q && a <= 3 * q) return 'down';
  if (a > -3 * q && a <= -q) return 'up';
  return 'left';
}
