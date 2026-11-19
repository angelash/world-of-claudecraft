// What a reaction row does beyond its line (PK-M1-55; builtin_ai.md 5.6, the "其他后果" column):
// the accusation progress of a devout witness (row 2: "晚祷上报……指控进度 +1") and the omen
// step of a lawman's challenge (row 4: "进入审判或逮捕事件链的预兆步"). Each is a named
// consequence a row lists in its data (`then[0].params.consequence`), so adding one to a row is
// data; the effects are flags the registry lists:
//
// - `accuse`: church_suspicion rises by the row's amount (the church's case against the player,
//   0..100, registry 8.2). One devout person adds it once per game day: a witness who reports
//   at vespers reports once.
// - `omen`: the trial or arrest chain gets its omen step (builtin_ai 5.6 row 4, 8.6 "审判前先有
//   告示，逮捕前先有盘查"): `omen.<map>.law` is stamped with the tick (registry; its own family,
//   apart from a goddess's `omen.<map>`), for the chains that must have an omen before a P3 act.
//   Once per map per game day. No chain reads it yet (the arrest chain is a later package).
//
// Kept out of reactions.ts: that file decides the behaviour and the line; this one is the world
// state the behaviour leaves, which tests read without driving a whole onlooker.

import type { SystemContext } from '../../../core/system';
import { calendarAt } from '../../../core/time';

/** The consequences a reaction row may name (a closed set; the content check reads it). */
export const REACTION_CONSEQUENCES = ['accuse', 'omen'] as const;
export type ReactionConsequence = (typeof REACTION_CONSEQUENCES)[number];

/** Church suspicion one devout witness adds by default (registry 8.2 range 0..100). */
export const ACCUSE_STEP = 1;

/** The per-person and per-map day memo of the consequences already applied. */
function memo(ctx: SystemContext): Record<string, number> {
  const slice = ctx.world.slices.npc;
  slice.consequences ??= {};
  return slice.consequences;
}

/**
 * Apply a reaction row's consequence for one onlooker `npcId` who reacted on `mapId`. Returns
 * whether it changed the world (false when it already applied today, or the name is unknown).
 */
export function applyConsequence(
  ctx: SystemContext,
  name: string | undefined,
  npcId: string,
  mapId: string,
  amount?: number,
): boolean {
  if (!name || !(REACTION_CONSEQUENCES as readonly string[]).includes(name)) return false;
  const day = calendarAt(ctx.tick).dayIndex;
  const m = memo(ctx);
  const key = name === 'accuse' ? `accuse:${npcId}` : `omen:${mapId}`;
  if (m[key] === day) return false;
  m[key] = day;
  if (name === 'accuse') {
    const cur = Number(ctx.flag('church_suspicion') ?? 0) || 0;
    const step = Number.isFinite(amount) && (amount ?? 0) > 0 ? (amount as number) : ACCUSE_STEP;
    ctx.setFlag('church_suspicion', Math.max(0, Math.min(100, cur + step)));
  } else {
    ctx.setFlag(`omen.${mapId}.law`, ctx.tick);
  }
  ctx.emit('npc.consequence', { npcId, consequence: name as ReactionConsequence, mapId });
  return true;
}
