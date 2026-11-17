// Door state transitions (thousand_doors.md 3.3) and the hint level of a shown door (3.2),
// shared by the system, the exclusion rules and the hint director.

import type { SystemContext } from '../../core/system';
import type { DoorStatus } from './types';

/** Move a door to `to` (emits doors.state); a door becoming openable ends the drought (17.4). */
export function setState(ctx: SystemContext, id: string, to: DoorStatus): void {
  const slice = ctx.world.slices.doors;
  const rt = slice.doors[id];
  if (!rt || rt.state === to) return;
  const from = rt.state;
  rt.state = to;
  rt.since = ctx.tick;
  if (to === 'openable' || to === 'opened') slice.drought = 0;
  ctx.emit('doors.state', { doorId: id, from, to });
}

/** Raise a door's hint level (it never falls) and show it if it was unseen. */
export function raiseHint(ctx: SystemContext, id: string, level: number): boolean {
  const rt = ctx.world.slices.doors.doors[id];
  if (!rt) return false;
  if (rt.state === 'locked' || rt.state === 'closed' || rt.state === 'opened') return false;
  const before = rt.hintLevel ?? 0;
  const to = Math.max(before, Math.min(4, level));
  if (to !== before) rt.hintLevel = to;
  if (rt.state === 'hidden') setState(ctx, id, 'hinted');
  return to !== before;
}
