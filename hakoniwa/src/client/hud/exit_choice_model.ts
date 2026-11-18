// A city gate with several ways out (travel_and_exploration.md "远行出口"; map_briefs.md 12,
// PK-M1-16): one exit tile may carry more than one exit, for example "outside the walls" to
// the next field map and "travel" to the region map. The exits standing on the nearest
// exit's tile or right next to it are the gate's destinations; with two or more the prompt
// says so and the interact key asks where to go instead of leaving at once. Locked ways are
// listed but cannot be picked. Pure; Node-tested.

import type { ExitDef, MapDef } from '../../systems/world/types';
import { EXIT_REACH, exitOpen, nearestExit } from '../input/picking';

export interface ExitOption {
  id: string;
  label: string;
  open: boolean;
}

/** The destinations of the gate in reach (content order), or [] when no exit is in reach. */
export function gateExits(
  map: Pick<MapDef, 'exits'>,
  pos: { x: number; y: number },
  flagOn: (key: string) => boolean,
  reach = EXIT_REACH,
): ExitOption[] {
  const nearest = nearestExit(map as MapDef, pos, reach);
  if (!nearest) return [];
  const sameGate = (e: ExitDef) =>
    Math.abs(e.x - nearest.x) <= 1 &&
    Math.abs(e.y - nearest.y) <= 1 &&
    Math.hypot(e.x + 0.5 - pos.x, e.y + 0.5 - pos.y) <= reach + 1;
  return map.exits
    .filter(sameGate)
    .map((e) => ({ id: e.id, label: e.label, open: exitOpen(e, flagOn) }));
}

/** The prompt over the gate: one way (open or locked), or how many ways it has. */
export function gatePrompt(options: readonly ExitOption[]): {
  key: 'ui.hud.prompt.exit' | 'ui.hud.prompt.exit_locked' | 'ui.hud.prompt.exit_many';
  params: Record<string, string | number>;
} | null {
  const first = options[0];
  if (!first) return null;
  if (options.length === 1)
    return {
      key: first.open ? 'ui.hud.prompt.exit' : 'ui.hud.prompt.exit_locked',
      params: { label: first.label },
    };
  return { key: 'ui.hud.prompt.exit_many', params: { count: options.length } };
}

/** What the interact key does at a gate: leave by its one open way, ask, or nothing. */
export function gateAction(
  options: readonly ExitOption[],
): { kind: 'leave'; exitId: string } | { kind: 'ask' } | { kind: 'none' } {
  if (options.length === 0) return { kind: 'none' };
  if (options.length === 1) {
    const only = options[0] as ExitOption;
    return { kind: 'leave', exitId: only.id };
  }
  return { kind: 'ask' };
}

/** The option a number key (1 to 9) picks, if it names an open one. */
export function optionByNumber(options: readonly ExitOption[], n: number): ExitOption | null {
  const o = options[n - 1];
  return o?.open ? o : null;
}

/** Move a list cursor by `delta` over the open options, wrapping; -1 when none is open. */
export function moveCursor(options: readonly ExitOption[], from: number, delta: 1 | -1): number {
  const n = options.length;
  if (n === 0 || !options.some((o) => o.open)) return -1;
  let i = from;
  for (let step = 0; step < n; step++) {
    i = (((i + delta) % n) + n) % n;
    if (options[i]?.open) return i;
  }
  return -1;
}
