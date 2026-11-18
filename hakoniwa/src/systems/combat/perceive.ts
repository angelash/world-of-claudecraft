// What monsters perceive of a target (combat_and_classes.md 12.2): they never read the
// player's level (the outsider has no page, 7), only the rank its presence shows: its rank
// as usual, the first mortal rank while it is veiled (the restraint door), its rank again
// when released. Beasts with instinct (beast, spider, burrower) will not pick a fight with
// something two ranks above them and run when it comes within 3 tiles; three ranks above,
// they run as soon as it enters their alert radius. Elders, rares and bosses, wave members
// and the instinctless (undead, sediment-born, constructs, fiends) are not swayed. People
// (humanoids) facing a presence two ranks up: those who can yield yield first, those who
// can flee flee first, the rest fight as usual. Against a target with a page the classic
// gray rule still holds (no fight picked with one far above its level). Pure.

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { getEntity } from '../world';
import { monsterDef } from './defs';
import { grayLevel } from './formulas';
import type { MobFamily, Unit } from './types';

/** Families with the instinct that reads presence (12.2). */
const INSTINCT: ReadonlySet<MobFamily> = new Set<MobFamily>(['beast', 'spider', 'burrower']);
/** A beast runs from a presence this close (tiles). */
export const SHY_RADIUS = 3;

/** The rank a unit's presence shows (12.2). */
export function seenTier(u: Unit): number {
  return u.presenceMode === 'veiled' ? 0 : u.tier;
}

/** Whether the target is the outsider: no page, no level to read. */
function pageless(world: World, t: Unit): boolean {
  return getEntity(world, t.id)?.kind === 'player';
}

/** How a monster's instinct reads a target: fight, keep off, or run (12.2). */
export function instinct(
  _world: World,
  content: ContentMap,
  u: Unit,
  t: Unit,
): 'fight' | 'avoid' | 'flee' | 'yield' {
  const mon = monsterDef(content, u.monsterId);
  if (!mon || u.waveId || (mon.rank ?? 'normal') !== 'normal') return 'fight';
  const gap = seenTier(t) - u.tier;
  if (INSTINCT.has(mon.family)) {
    if (gap >= 3) return 'flee';
    if (gap >= 2) return 'avoid';
    return 'fight';
  }
  if (mon.family === 'humanoid' && gap >= 2) {
    if (mon.mechanics?.yieldAtPct !== undefined) return 'yield';
    if (mon.mechanics?.flee !== undefined) return 'flee';
  }
  return 'fight';
}

/**
 * Whether a monster on watch picks a fight with this target (the scan): instinct for the
 * presence, the gray rule for targets with a page.
 */
export function willPick(world: World, content: ContentMap, u: Unit, t: Unit): boolean {
  if (u.side !== 'enemy') return true;
  const read = instinct(world, content, u, t);
  if (read === 'avoid' || read === 'flee') return false;
  const mon = monsterDef(content, u.monsterId);
  const elite = !!mon?.rank && mon.rank !== 'normal';
  if (elite || pageless(world, t)) return true;
  return grayLevel(t.level) < u.level;
}
