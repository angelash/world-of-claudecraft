// Care of the hurt (progression_and_pacing.md 10.1, 10.3; companions_and_party.md 8.4, 11.3;
// world_state_registry.md 8.5 `npc.<id>.injury`):
// - a companion's grave injury shows as `npc.<id>.injury = major` while it rests and goes
//   back to `none` when it is back (the party is one of the variable's writers);
// - a grave injury written from outside (the tide night writes `major` for a named person
//   hurt on a line) sends a companion walking with the party off as a story grave injury;
//   anyone else (a named person, a companion not in the field) is well again after the
//   care days (2 game days, the rest base of 10.1), when the party writes `none`;
// - a light wound heals after a night's sleep in a bed once it has been treated (10.1:
//   "在床上睡一夜并接受治疗"): healed by anyone after the wound began;
// - visiting a resting companion is +1 bond, once per grave injury (8.4).

import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import { healInjury, readAilments } from '../ailments';
import { addBond } from './bond';
import { partyConfig } from './config';
import { atBed, atRestPlace } from './places';
import { fieldMembers, sortedMembers, stateOf } from './roster';
import type { Member } from './types';
import { fall } from './wounds';

const INJURY = /^npc\.([a-z0-9_]+)\.injury$/;
const MAJOR = 'major';
const NONE = 'none';
function injuryKey(id: string): string {
  return `npc.${id}.injury`;
}

function setInjury(ctx: SystemContext, id: string, value: string): void {
  if (ctx.flag(injuryKey(id)) !== value) ctx.setFlag(injuryKey(id), value);
}

/** A member went off gravely hurt: the injury shows as major. */
export function onWounded(ctx: SystemContext, companionId: string): void {
  const m = ctx.world.slices.party.members[companionId];
  if (!m || m.pet || m.temp) return;
  setInjury(ctx, companionId, MAJOR);
}

/** A member is back from its rest: the injury is gone. */
export function onRecovered(ctx: SystemContext, companionId: string): void {
  const m = ctx.world.slices.party.members[companionId];
  if (!m || m.pet || m.temp) return;
  if (ctx.flag(injuryKey(companionId)) === MAJOR) setInjury(ctx, companionId, NONE);
}

/**
 * Someone wrote `npc.<id>.injury`. A major injury on a companion in the field is a story
 * grave injury; on anyone else it starts the care clock. Writes of the party itself (a
 * resting member's mirror) change nothing.
 */
export function onInjuryFlag(ctx: SystemContext, key: string, value: unknown): void {
  const hit = INJURY.exec(key);
  if (!hit) return;
  const id = hit[1] as string;
  const slice = ctx.world.slices.party;
  if (value !== MAJOR) {
    if (slice.care?.[id] !== undefined) delete slice.care[id];
    return;
  }
  const m = slice.members[id];
  if (m && !m.temp && !m.pet) {
    const s = stateOf(m);
    if (s === 'resting') return;
    if (s === 'party' || s === 'waiting') {
      fall(ctx, m, 'story');
      return;
    }
  }
  if (slice.care?.[id] !== undefined) return;
  const days = partyConfig(ctx.content).care?.npcDays ?? partyConfig(ctx.content).rest.baseDays;
  slice.care = { ...slice.care, [id]: ctx.tick + days * TICKS_PER_GAME_DAY };
}

/** Once a game second: named people whose care is over are well again. */
export function tickCare(ctx: SystemContext): void {
  const care = ctx.world.slices.party.care;
  if (!care) return;
  for (const id of Object.keys(care).sort()) {
    const until = care[id] as number;
    if (ctx.tick < until) continue;
    delete care[id];
    // a companion resting on its own clock keeps the injury until it is back
    const m = ctx.world.slices.party.members[id];
    if (m && stateOf(m) === 'resting') continue;
    if (ctx.flag(injuryKey(id)) === MAJOR) setInjury(ctx, id, NONE);
  }
  if (Object.keys(care).length === 0) delete ctx.world.slices.party.care;
}

/** A heal landed on a member: the light wound counts as treated from now. */
export function noteTreated(ctx: SystemContext, m: Member): void {
  m.treated = ctx.tick;
}

/** The least hours of sleep that count as a night (10.1 "在床上睡一夜并接受治疗"). */
export const NIGHT_HOURS = 4;

/** A night's sleep ended: a treated light wound heals in a bed (10.1). */
export function onSlept(ctx: SystemContext, hours: number): void {
  // a night's sleep, not an hour's nap: the wound heals only after a real night (10.1)
  if (hours < NIGHT_HOURS || !atBed(ctx)) return;
  const bodies = readAilments(ctx.world)?.bodies;
  for (const m of fieldMembers(ctx.world)) {
    if (m.treated === undefined) continue;
    const light = bodies?.[m.entityId]?.injuries.find((i) => i.kind === 'light');
    if (!light || light.since > m.treated) continue;
    healInjury(ctx, m.entityId, 'light');
    delete m.treated;
  }
}

/**
 * The player visits a resting companion (8.4: +1 bond, daily, once per grave injury).
 * Returns a refusal code or null.
 */
export function visit(ctx: SystemContext, companionId: string): string | null {
  const m = ctx.world.slices.party.members[companionId];
  if (!m || m.temp || m.pet) return 'no_companion';
  if (stateOf(m) !== 'resting') return 'not_resting';
  // the visit happens where it rests (11.3): the inner court, else the nearest clinic
  if (!atRestPlace(ctx)) return 'far_from_rest';
  const wound = m.wounds?.at(-1);
  if (wound === undefined || m.visited === wound) return 'visited';
  m.visited = wound;
  addBond(ctx, m, 1, 'visit');
  return null;
}

/** Members resting now (for the view and the tests). */
export function restingMembers(ctx: SystemContext): Member[] {
  return sortedMembers(ctx.world).filter((m) => stateOf(m) === 'resting');
}
