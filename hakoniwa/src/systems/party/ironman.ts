// The ironman switch (companions_and_party.md 11.4; D-073): chosen on the new-game page and
// written as the built-in variable `ironman` on the first tick; after that it can only be
// turned off, and off is for good. The party keeps the decision: the first write of the
// variable decides it; a later write that would turn it back on is put back to off.

import type { FlagValue } from '../../core/contracts';
import type { SystemContext } from '../../core/system';

const truthy = (v: FlagValue | undefined) => v === true || v === 1 || v === 'true';

/** The variable `ironman` was written (flag.changed). */
export function ironmanWritten(ctx: SystemContext, value: FlagValue): void {
  const slice = ctx.world.slices.party;
  const on = truthy(value);
  if (slice.ironman === undefined) {
    slice.ironman = on ? 'on' : 'off';
    ctx.emit('party.ironman', { op: slice.ironman });
    return;
  }
  if (slice.ironman === 'on' && !on) {
    slice.ironman = 'off';
    ctx.emit('party.ironman', { op: 'off' });
    return;
  }
  if (slice.ironman === 'off' && on) {
    ctx.setFlag('ironman', false);
    ctx.emit('party.ironman', { op: 'refused' });
  }
}

/** Turn ironman off for good (the command). False when it is not on. */
export function ironmanOff(ctx: SystemContext): boolean {
  const slice = ctx.world.slices.party;
  if (slice.ironman !== 'on' && !truthy(ctx.flag('ironman'))) return false;
  slice.ironman = 'off';
  if (ctx.flag('ironman') !== false) ctx.setFlag('ironman', false);
  ctx.emit('party.ironman', { op: 'off' });
  return true;
}

/**
 * Whether the run is ironman now: the party's record, or the variable itself on a save from
 * before the party kept the record.
 */
export function ironmanOn(world: {
  slices: { party?: { ironman?: 'on' | 'off' } };
  meta: { flags: Record<string, FlagValue> };
}): boolean {
  const kept = world.slices.party?.ironman;
  return kept ? kept === 'on' : truthy(world.meta.flags.ironman);
}
