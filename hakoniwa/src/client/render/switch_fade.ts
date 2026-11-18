// Switch tiles on screen (map_briefs.md 1.10; PK-M1-16's `liveMap` is the seam): the
// kernel changes walkability the moment a switch's flag condition flips; the renderers draw
// the live map (the content map with closed switches painted in) and fade the change: for
// SWITCH_FADE_MS the old picture dissolves out and the new one in, only over the
// rectangles of the switches that changed. The fader keeps the closed set of the map the
// player is on, and restarts without a fade on a map change. Pure; Node-tested.

import type { FlagValue } from '../../core/contracts';
import { evaluate, flagResolver } from '../../systems/quests/conditions';
import { closedSwitches, switchedMap } from '../../systems/world/switches';
import type { MapDef, Rect } from '../../systems/world/types';

/** How long an opening or closing switch takes to fade on screen. */
export const SWITCH_FADE_MS = 800;

/** The live map and the key of its closed set ('' when no switch is closed). */
export function liveMapOf(
  map: MapDef,
  flags: Readonly<Record<string, FlagValue>>,
): { map: MapDef; closed: string[]; key: string } {
  if (!map.switches?.length) return { map, closed: [], key: '' };
  const resolve = flagResolver(flags as Record<string, FlagValue>);
  const closed = closedSwitches(map, (c) => evaluate(c, resolve));
  return { map: switchedMap(map, closed), closed, key: closed.join(',') };
}

export interface SwitchFadeState {
  /** the switches that changed in the fade now running */
  rects: Rect[];
  /** 0..1 */
  t: number;
}

export class SwitchFader {
  private mapId = '';
  private closed: string[] = [];
  private fade: { rects: Rect[]; start: number } | null = null;

  /**
   * Feed the closed set of the player's map each frame. Returns true when the set changed on
   * the same map (the renderer must take the new live map and start fading).
   */
  update(map: MapDef, closed: readonly string[], nowMs: number): boolean {
    if (map.id !== this.mapId) {
      this.mapId = map.id;
      this.closed = [...closed];
      this.fade = null;
      return false;
    }
    const before = new Set(this.closed);
    const after = new Set(closed);
    const changed = (map.switches ?? []).filter((s) => before.has(s.id) !== after.has(s.id));
    if (changed.length === 0) return false;
    this.closed = [...closed];
    // a change during a fade restarts it over every rectangle still in motion
    const rects = changed.map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h }));
    if (this.fade && nowMs - this.fade.start < SWITCH_FADE_MS) rects.push(...this.fade.rects);
    this.fade = { rects, start: nowMs };
    return true;
  }

  /** The fade now running, or null once it has finished. */
  state(nowMs: number): SwitchFadeState | null {
    if (!this.fade) return null;
    const t = (nowMs - this.fade.start) / SWITCH_FADE_MS;
    if (t >= 1) {
      this.fade = null;
      return null;
    }
    return { rects: this.fade.rects, t: Math.max(0, t) };
  }
}
