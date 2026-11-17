// The absence variables of named people (thousand_doors.md 5.4: a key that leans on a
// person gives way to its substitute while the person is dead, gone, captured, turned
// hostile or at the spring). The NPC system keeps them: npc.<id>.dead on a death,
// npc.<id>.at_spring for seven game days after the death of a named general (the spring
// period of thousand_doors.md 10.1.1), npc.<id>.hostile as a mirror of the person's stance
// (./reactions.ts), and it reads npc.<id>.captured (written by the story) to take a
// captured person off the map.

import type { SystemContext } from '../../../core/system';
import { calendarAt } from '../../../core/time';
import { personaById } from '../personas';
import { ensureBrain, sortedNpcIds } from './state';

/** The spring period of a named general in game days (thousand_doors.md 10.1.1). */
export const SPRING_DAYS = 7;

/** A captured-flag key, for the presence sync. */
export function isCapturedFlag(key: string): boolean {
  return key.startsWith('npc.') && key.endsWith('.captured');
}

/** A named person died: the dead variable, and a general's soul goes to the spring. */
export function onPersonDied(ctx: SystemContext, npcId: string): void {
  const p = personaById(ctx.content, npcId);
  const st = ctx.world.slices.npc.npcs[npcId];
  if (!p || !st) return;
  if (!ctx.flag(`npc.${npcId}.dead`)) ctx.setFlag(`npc.${npcId}.dead`, true);
  if (p.roles?.includes('general')) {
    ensureBrain(st).springUntil = calendarAt(ctx.tick).dayIndex + SPRING_DAYS;
    ctx.setFlag(`npc.${npcId}.at_spring`, true);
  }
}

/** Daily: a spring period that ran out ends (the soul has crossed). */
export function endSpringPeriods(ctx: SystemContext): void {
  const day = calendarAt(ctx.tick).dayIndex;
  const slice = ctx.world.slices.npc;
  for (const id of sortedNpcIds(slice.npcs)) {
    const b = slice.npcs[id]?.brain;
    if (b?.springUntil === undefined || b.springUntil > day) continue;
    delete b.springUntil;
    if (ctx.flag(`npc.${id}.at_spring`)) ctx.setFlag(`npc.${id}.at_spring`, false);
  }
}
