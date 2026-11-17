// Implements the model of `ui_hud_focus` (ux_and_onboarding.md 5.2, an M2 element built early):
// the focus unit set with Shift and a click (or a long R3 on the pad), shown as a compact frame
// under the party frames: name, health, cast bar. The focus clears itself when the unit dies,
// leaves the player's map or is more than 60 m away. No focus: the frame hides (empty state);
// there is no error state. Pure; Node-tested. The painter is ./focus_frame.ts.

import type { Entity } from '../../systems/world/types';
import type { BarView, CastView } from '../view/adapters';

/** The focus clears beyond this distance (5.2: 60 m; one map unit is a metre). */
export const FOCUS_RANGE = 60;

export interface FocusInput {
  focusId: string | null;
  entity:
    | { alive: boolean; name: string; kind: Entity['kind']; mapId: string; x: number; y: number }
    | undefined;
  player: { mapId: string; x: number; y: number } | undefined;
  frame: { hp?: BarView; cast?: CastView | null; dead?: boolean } | null;
}

export interface FocusRow {
  id: string;
  name: string;
  kind: Entity['kind'];
  hp: BarView | null;
  cast: CastView | null;
}

export interface FocusResult {
  /** the focus must be cleared (dead, gone, another map, out of range) */
  clear: boolean;
  row: FocusRow | null;
}

export function focusModel(i: FocusInput): FocusResult {
  if (!i.focusId) return { clear: false, row: null };
  const e = i.entity;
  const p = i.player;
  const gone =
    !e?.alive ||
    !!i.frame?.dead ||
    !p ||
    e.mapId !== p.mapId ||
    Math.hypot(e.x - p.x, e.y - p.y) > FOCUS_RANGE;
  if (gone || !e) return { clear: true, row: null };
  return {
    clear: false,
    row: {
      id: i.focusId,
      name: e.name,
      kind: e.kind,
      hp: i.frame?.hp
        ? { value: Math.round(i.frame.hp.value), max: Math.round(i.frame.hp.max) }
        : null,
      cast: i.frame?.cast ? { name: i.frame.cast.name, progress: i.frame.cast.progress } : null,
    },
  };
}

/** The next focus after the focus action: the same unit again lets go, another takes over. */
export function toggleFocus(current: string | null, candidate: string | null): string | null {
  if (!candidate) return null;
  return candidate === current ? null : candidate;
}
