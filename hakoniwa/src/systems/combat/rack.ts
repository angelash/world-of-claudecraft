// The outsider's skill rack (技架, combat_and_classes.md 7; catalog_abilities_talents.md
// 4.3): the outsider uses only the active abilities on the rack, 8 slots at levels 1 to 9,
// 12 to 19, 16 to 34, 20 to 49 and 24 from 50. The rack fills itself as the doors grant
// abilities and as levels widen it; the player changes it out of combat, never in combat.
// Other units (companions, people, monsters) have no rack. The outsider is the vocation
// whose pools all come from doors (ClassDef.resource null).

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { classDef } from './defs';
import { skillRackSize } from './formulas';
import type { Unit } from './types';
import { inCombat, knownAbilities } from './units';

/** Whether a unit uses a skill rack (the outsider). */
export function usesRack(content: ContentMap, u: Unit): boolean {
  const cls = classDef(content, u.classId);
  return !!cls && cls.resource === null;
}

/** Slots of a unit's rack at its level. */
export function rackCapacity(u: Unit): number {
  return skillRackSize(u.level);
}

/** Whether an ability may be used now as far as the rack goes (no rack: always). */
export function onRack(u: Unit, abilityId: string): boolean {
  return !u.rack || u.rack.includes(abilityId);
}

/**
 * Keep the rack in line with what the unit knows: forget abilities it lost, then fill the
 * free slots with known abilities not yet on it, in the order the unit learned them. Starts
 * the rack of an outsider that has none (a fresh unit, a save from before the rack).
 */
export function syncRack(content: ContentMap, u: Unit): void {
  if (!usesRack(content, u)) return;
  const known = knownAbilities(content, u);
  const kept = (u.rack ?? []).filter((id) => known.includes(id));
  const off = u.rackOff ?? [];
  const cap = rackCapacity(u);
  for (const id of known) {
    if (kept.length >= cap) break;
    if (!kept.includes(id) && !off.includes(id)) kept.push(id);
  }
  u.rack = kept.slice(0, Math.max(cap, 0));
  if (u.rackOff) {
    u.rackOff = u.rackOff.filter((id) => known.includes(id));
    if (u.rackOff.length === 0) delete u.rackOff;
  }
}

export type RackResult = { ok: true } | { ok: false; code: string };

/** Put an ability on the rack or take it off (out of combat only). */
export function setRacked(
  world: World,
  content: ContentMap,
  u: Unit,
  abilityId: string,
  on: boolean,
): RackResult {
  if (!usesRack(content, u)) return { ok: false, code: 'no_rack' };
  if (inCombat(world, u)) return { ok: false, code: 'in_combat' };
  const rack = u.rack ?? [];
  if (!knownAbilities(content, u).includes(abilityId)) return { ok: false, code: 'unknown' };
  if (!on) {
    u.rack = rack.filter((id) => id !== abilityId);
    // taken off by hand: the rack does not refill it on its own
    if (!(u.rackOff ?? []).includes(abilityId)) u.rackOff = [...(u.rackOff ?? []), abilityId];
    return { ok: true };
  }
  if (!rack.includes(abilityId)) {
    if (rack.length >= rackCapacity(u)) return { ok: false, code: 'rack_full' };
    u.rack = [...rack, abilityId];
  }
  if (u.rackOff) {
    u.rackOff = u.rackOff.filter((id) => id !== abilityId);
    if (u.rackOff.length === 0) delete u.rackOff;
  }
  return { ok: true };
}
