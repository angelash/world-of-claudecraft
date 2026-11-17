// Exclusion (互斥, thousand_doors.md 9.1): when a door opens, every other door sharing one of
// its groups reacts by its own entry's mode. `lock` locks it for good; `actLock` locks it
// only when the opening falls in the entry's act, and the door returns to unseen once the
// act reaches `until` (X2: the abyss door's act 1 version against the shapeshift door,
// back from act 3); `forceClose` closes an open door (the close settlement runs) and locks
// an unopened one; `vanish` locks it out of sight. A `source` entry (the one-way groups X9
// and X12) sets the group off and is never touched itself. `freeze` (X7, the accepted page) and
// `rack` (X13, the school rack) are later batches: the validator accepts them, the open
// leaves them alone.

import type { SystemContext } from '../../core/system';
import { actNumber } from './keys';
import type { DoorDef, DoorStatus, ExclusiveEntry } from './types';

export interface ExclusionHooks {
  setState(ctx: SystemContext, id: string, to: DoorStatus): void;
  close(ctx: SystemContext, door: DoorDef): void;
}

function entryFor(door: DoorDef, group: string): ExclusiveEntry | undefined {
  return door.exclusive?.find((e) => e.group === group);
}

/** Apply the exclusion of every group of `opened` to the other doors (9.1). */
export function applyExclusion(ctx: SystemContext, opened: DoorDef, hooks: ExclusionHooks): void {
  const groups = (opened.exclusive ?? []).map((e) => e.group);
  if (groups.length === 0) return;
  const slice = ctx.world.slices.doors;
  const act = actNumber(ctx.flag('act'));
  for (const other of ctx.content.doors ?? []) {
    if (other.id === opened.id) continue;
    for (const group of groups) {
      const entry = entryFor(other, group);
      const rt = slice.doors[other.id];
      if (!entry || !rt || entry.source) continue;
      const st = rt.state;
      if (st === 'locked' || st === 'closed') continue;
      switch (entry.mode) {
        case 'lock':
        case 'vanish':
          if (st !== 'opened') hooks.setState(ctx, other.id, 'locked');
          break;
        case 'actLock':
          if (st !== 'opened' && (entry.act === undefined || entry.act === act)) {
            hooks.setState(ctx, other.id, 'locked');
            const lockedRt = slice.doors[other.id];
            if (lockedRt) lockedRt.lockedUntil = entry.until ?? (entry.act ?? act) + 1;
          }
          break;
        case 'forceClose':
          if (st === 'opened') hooks.close(ctx, other);
          else hooks.setState(ctx, other.id, 'locked');
          break;
        default:
          break;
      }
    }
  }
}

/** An act lock whose time has come returns its door to unseen (keys judged again). */
export function liftActLocks(ctx: SystemContext, setState: ExclusionHooks['setState']): void {
  const slice = ctx.world.slices.doors;
  const act = actNumber(ctx.flag('act'));
  for (const door of ctx.content.doors ?? []) {
    const rt = slice.doors[door.id];
    if (rt?.state !== 'locked' || rt.lockedUntil === undefined || act < rt.lockedUntil) continue;
    delete rt.lockedUntil;
    setState(ctx, door.id, 'hidden');
  }
}
