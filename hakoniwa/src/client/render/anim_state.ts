// Per-entity animation state for the renderer. Animation is pure presentation
// (art_pipeline.md 3.4): the base loop comes from motion (walk while moving, idle
// otherwise), death plays once and holds when an entity stops being alive, and one-shot
// cues (attack, hit) are pushed by event mappers. The facing is kept in map axes and
// turned by the camera yaw only when a direction is shown (art_pipeline.md 3.5), so idle
// figures re-face correctly when the camera turns. Nothing here feeds back into the world.

import { screenFacing } from '../hd2d/view';
import {
  ANIM_SPECS,
  type AnimName,
  animDuration,
  type Dir,
  dirFromFacing,
  frameAt,
  WALK_TILES_PER_FRAME,
} from '../sprites/anim_spec';

export interface AnimInput {
  id: string;
  alive: boolean;
  facing: number;
  moving: boolean;
  /** cumulative distance walked, tiles */
  travelled: number;
  /** camera yaw in degrees (0 for the flat renderer) */
  yawDeg?: number;
}

export interface AnimSample {
  anim: AnimName;
  dir: Dir;
  frame: number;
}

interface State {
  /** last known facing in map axes; null until the entity first moves (shown face-on) */
  facing: number | null;
  oneShot: { anim: AnimName; start: number } | null;
  deathStart: number | null;
  /** phase offset so a crowd does not breathe in unison */
  phase: number;
}

function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0;
  return h % 880;
}

export class AnimTracker {
  private states = new Map<string, State>();

  private state(id: string, facing = 0): State {
    let s = this.states.get(id);
    if (!s) {
      // Facing 0 is the world default for entities that never moved: show them face-on.
      s = {
        facing: facing === 0 ? null : facing,
        oneShot: null,
        deathStart: null,
        phase: phaseOf(id),
      };
      this.states.set(id, s);
    }
    return s;
  }

  private dirOf(s: State, yawDeg: number): Dir {
    return s.facing === null ? 'down' : dirFromFacing(screenFacing(s.facing, yawDeg));
  }

  /** Queue a one-shot animation (attack or hit) starting now. */
  cue(id: string, anim: 'attack' | 'hit', nowMs: number): void {
    const s = this.state(id);
    if (s.deathStart !== null) return;
    s.oneShot = { anim, start: nowMs };
  }

  sample(input: AnimInput, nowMs: number): AnimSample {
    const s = this.state(input.id, input.facing);
    if (input.moving) s.facing = input.facing;
    const dir = this.dirOf(s, input.yawDeg ?? 0);
    if (!input.alive) {
      if (s.deathStart === null) s.deathStart = nowMs;
      return { anim: 'death', dir, frame: frameAt('death', nowMs - s.deathStart) };
    }
    s.deathStart = null;
    if (s.oneShot) {
      const elapsed = nowMs - s.oneShot.start;
      if (elapsed < animDuration(s.oneShot.anim)) {
        return { anim: s.oneShot.anim, dir, frame: frameAt(s.oneShot.anim, elapsed) };
      }
      s.oneShot = null;
    }
    if (input.moving) {
      const frames = ANIM_SPECS.walk.frames;
      const frame = Math.floor(input.travelled / WALK_TILES_PER_FRAME) % frames;
      return { anim: 'walk', dir, frame };
    }
    return { anim: 'idle', dir, frame: frameAt('idle', nowMs + s.phase) };
  }

  /** Drop state for entities no longer present. */
  retain(ids: Set<string>): void {
    for (const id of this.states.keys()) if (!ids.has(id)) this.states.delete(id);
  }
}
