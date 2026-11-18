// The fight-scoped state of a boss (combat_and_classes.md 10.1): its clock runs from the
// first chase, and a reset (the boss went home) drops all of it. Lines a boss speaks are
// content text keys of its monster record (D-087), so the client renders them in the active
// language. Pure helpers over the unit.

import { contentRef } from '../../../core/content_key';
import type { SystemContext } from '../../../core/system';
import { TICK_HZ } from '../../../core/time';
import { getEntity } from '../../world';
import { monsterDef, secs } from '../defs';
import type { BossFight } from '../mech_types';
import type { MonsterDef, MonsterMechanics, Unit } from '../types';

/** The origin of the auras the library lays on a boss (phase, enrage, berserk, ramp). */
export const BOSS_ORIGIN = 'boss';

/** The boss's fight state, opened at its first chase tick. */
export function fightOf(ctx: SystemContext, u: Unit): BossFight {
  if (!u.boss) u.boss = { start: ctx.tick };
  return u.boss;
}

/** Whole seconds since the fight began (0 when no fight is open). */
export function fightSeconds(ctx: SystemContext, u: Unit): number {
  return u.boss ? (ctx.tick - u.boss.start) / TICK_HZ : 0;
}

/** Whether `atSec` seconds into the fight have passed. */
export function pastSec(ctx: SystemContext, u: Unit, atSec: number): boolean {
  return !!u.boss && ctx.tick - u.boss.start >= secs(atSec);
}

/** The monster record and mechanics of a unit (or of a monster id). */
export function mechOf(
  ctx: { content: SystemContext['content'] },
  u: Pick<Unit, 'monsterId'>,
): { mon: MonsterDef; m: MonsterMechanics } | undefined {
  const mon = monsterDef(ctx.content, u.monsterId);
  return mon?.mechanics ? { mon, m: mon.mechanics } : undefined;
}

/**
 * Speak a line of the boss's data: the text key of the record field at `path` (the field
 * path in the record, e.g. `mechanics.phases.1.say`) when the text is there.
 */
export function bossSay(
  ctx: SystemContext,
  u: Unit,
  mon: MonsterDef,
  path: string,
  text: string | undefined,
): void {
  const e = getEntity(ctx.world, u.id);
  if (!text || !e) return;
  ctx.emit('dialogue.line', {
    speakerId: u.id,
    speakerName: e.name,
    text: contentRef('monsters', mon.id, path),
    kind: 'say',
  });
}

/** Health fraction of a unit. */
export function healthFrac(u: Unit, maxHp: number): number {
  return u.hp / Math.max(1, maxHp);
}
