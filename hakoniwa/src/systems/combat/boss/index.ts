// The boss mechanics library (combat_and_classes.md 10; 21.1 "首领四机制" turned into a
// library): a boss is a monster record plus mechanic entries the kernel interprets, one
// small module per mechanism, coordinated here. While a boss chases, each tick (in this
// order, the data order inside each): phases, adds, soft and hard enrage and the ramp,
// shields, breakable parts; once a second the queued casts and the non-combat resolutions.
// Its fight clock starts at the first chase tick. A reset (it went home) clears phases,
// adds, enrage, clocks, shields, marks and warnings, puts its arena objects back and opens
// its arena; it comes back at full health (monster_ai.ts). A boss that falls opens its arena,
// sends home the adds bound to it and takes its objects away.

import type { SystemContext } from '../../../core/system';
import { TICK_HZ } from '../../../core/time';
import { getEntity } from '../../world';
import { removeByOrigin } from '../auras';
import type { BossFight } from '../mech_types';
import { deriveStats } from '../stats';
import { cancelWarnings } from '../telegraph';
import type { MonsterMechanics, Unit } from '../types';
import { drainQueue } from './actions';
import { addsOf, addsOnBossDown, tickAdds } from './adds';
import { openArena, sealArena } from './arena';
import { tickEnrage } from './enrage';
import { BOSS_ORIGIN, mechOf } from './fight';
import { tickPhases } from './phases';
import { tickResolve } from './resolve';
import { tickShields } from './shields';
import { clearTerrain, restoreTerrain, tickParts } from './terrain';

export { runActions } from './actions';
export { addsOf, announceAdds } from './adds';
export { arenaSealed, oathBound, seals } from './arena';
export { DRAIN_BREAK, DRAIN_REACH, doorSeekPick, drainHolder, noteSeek } from './door_seek';
export { BERSERK, berserkAt } from './enrage';
export { BOSS_ORIGIN, fightOf, fightSeconds, mechOf } from './fight';
export { interruptibleNow } from './interrupt';
export { markOf, startMarks } from './marks';
export { markResolved, resolveBoss, resolvedFlag } from './resolve';
export {
  abilityHitShield,
  breakShield,
  raiseShield,
  STAGGER,
  shielded,
  shieldImmune,
  soakShield,
  staggerBoss,
} from './shields';
export {
  breakInteract,
  clearTerrain,
  INTERACT_REACH,
  placeTerrain,
  startInteract,
  terrainBroken,
  terrainOf,
  tickHazards,
  tickInteract,
} from './terrain';

/** Mechanics that need a fight clock: the boss library and the timed affixes. */
const FIGHT_KEYS: readonly (keyof MonsterMechanics)[] = [
  'phases',
  'summon',
  'adds',
  'enrage',
  'berserk',
  'ramp',
  'marks',
  'shields',
  'terrain',
  'resolve',
  'arena',
  'oathLock',
  'doorSeek',
  'breakableParts',
  'aoePulse',
  'stomp',
  'bigCast',
  'stoneskin',
  'aoeSlow',
  'charge',
  'desperateHeal',
];

/** Whether a monster's mechanics keep a fight clock. */
export function hasFight(m: MonsterMechanics | undefined): boolean {
  return !!m && FIGHT_KEYS.some((k) => m[k] !== undefined);
}

/** One chase tick of a boss's mechanics. */
export function tickBoss(ctx: SystemContext, u: Unit): void {
  const mm = mechOf(ctx, u);
  if (!mm || !u.ai || !getEntity(ctx.world, u.id) || !hasFight(mm.m)) return;
  if (!u.boss) u.boss = { start: ctx.tick };
  resumeBoss(ctx, u.boss);
  sealArena(ctx, u);
  const maxHp = deriveStats(ctx.world, ctx.content, u).maxHp;
  const phase = tickPhases(ctx, u, maxHp);
  tickAdds(ctx, u, maxHp);
  tickEnrage(ctx, u, maxHp);
  tickShields(ctx, u, maxHp, phase, addsOf(ctx, u).length > 0);
  tickParts(ctx, u, phase);
  if (ctx.tick % TICK_HZ === 0) {
    drainQueue(ctx, u);
    tickResolve(ctx, u, maxHp);
  }
}

/**
 * A boss with no foe left that does not go home (a wave member, 12.5): it stands where it
 * is and keeps its fight (phases passed, adds called, enrage, a cast and its warning under
 * way); only its arena opens until it finds a foe again (the next pull seals it anew). Once
 * it has healed back to full out of the fight, the brain resets it (`resetBoss`).
 */
export function pauseBoss(ctx: SystemContext, u: Unit): void {
  openArena(ctx, u);
  const fight = u.boss;
  if (!fight) return;
  // adds announced before the foe left are called off; their wave may come again
  for (const p of fight.pending ?? []) {
    fight.addsDone = (fight.addsDone ?? []).filter((i) => i !== p.wave);
    if (u.ai) u.ai.summoned = u.ai.summoned.filter((i) => i !== p.wave);
  }
  delete fight.pending;
  fight.pausedAt ??= ctx.tick;
}

/** A paused fight goes on: its clocks skip the time it stood still. */
function resumeBoss(ctx: SystemContext, fight: BossFight): void {
  const at = fight.pausedAt;
  if (at === undefined) return;
  delete fight.pausedAt;
  const idle = Math.max(0, ctx.tick - at);
  if (idle === 0) return;
  fight.start += idle;
  if (fight.untargetableUntil !== undefined) fight.untargetableUntil += idle;
  for (const k of Object.keys(fight.addsNext ?? {})) {
    if (fight.addsNext) fight.addsNext[k] = (fight.addsNext[k] ?? ctx.tick) + idle;
  }
  for (const k of Object.keys(fight.affixAt ?? {})) {
    if (fight.affixAt) fight.affixAt[k] = (fight.affixAt[k] ?? ctx.tick) + idle;
  }
  for (const st of Object.values(fight.shields ?? {})) {
    if (st.until !== undefined) st.until += idle;
  }
}

/** A boss reset (it went home, 10.1): its fight state goes and its arena is put back. */
export function resetBoss(ctx: SystemContext, u: Unit): void {
  const brain = u.ai;
  if (brain) {
    brain.phase = 0;
    brain.summoned = [];
    brain.enraged = false;
    brain.rampAt = 0;
  }
  u.phaseAbilities = undefined;
  // the phase, enrage, berserk and ramp auras go with the fight (they outlast the evade)
  removeByOrigin(ctx, u, BOSS_ORIGIN);
  cancelWarnings(ctx, u.id, false);
  openArena(ctx, u);
  restoreTerrain(ctx, u);
  if (u.boss) delete u.boss;
}

/** A boss fell: its arena opens, its bound adds go, its objects are taken away. */
export function bossDown(ctx: SystemContext, u: Unit): void {
  if (!mechOf(ctx, u)) return;
  openArena(ctx, u);
  addsOnBossDown(ctx, u);
  cancelWarnings(ctx, u.id, false);
  clearTerrain(ctx, u.id);
}
