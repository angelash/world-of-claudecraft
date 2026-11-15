// Animation vocabulary for procedural sprites: four display directions (left is the
// mirror of right, art_pipeline.md 3.5) and the compressed frame set of 3.4
// (idle, walk, attack, hit, death). Pure.

export type Dir = 'down' | 'right' | 'up' | 'left';
export const DIRS: readonly Dir[] = ['down', 'right', 'up', 'left'];

export type AnimName = 'idle' | 'walk' | 'attack' | 'hit' | 'death';
export const ANIMS: readonly AnimName[] = ['idle', 'walk', 'attack', 'hit', 'death'];

export interface AnimSpec {
  frames: number;
  /** per-frame duration in ms (walk advances by distance instead, see walkTilesPerFrame) */
  frameMs: readonly number[];
  loop: boolean;
}

export const ANIM_SPECS: Record<AnimName, AnimSpec> = {
  idle: { frames: 4, frameMs: [220, 220, 220, 220], loop: true },
  walk: { frames: 6, frameMs: [100, 100, 100, 100, 100, 100], loop: true },
  attack: { frames: 4, frameMs: [80, 70, 90, 120], loop: false },
  hit: { frames: 2, frameMs: [80, 120], loop: false },
  death: { frames: 4, frameMs: [100, 120, 140, 160], loop: false },
};

/** Walk frames advance by distance travelled (about 0.3 yards per frame, 3.4). */
export const WALK_TILES_PER_FRAME = 0.32;

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
