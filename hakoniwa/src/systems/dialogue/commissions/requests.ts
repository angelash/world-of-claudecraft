// Residents' requests and leaders' postings (quests_and_events.md 6.1, 6.2; builtin_ai.md
// 4.2 `giver`, 6.2 `gen_trouble`, 9.6; catalog_quests_acts1_3.md 2.5; PK-M1-19):
//
// - A resident with an unmet need that maps to a request template (escort, find,
//   investigate, letter, ...) asks the player for help in a conversation; the kernel turns
//   the plea into a personal commission on the board of their town, paid out of their own
//   purse (at most a fifth of what they can spare). A need that maps to nothing stays talk.
// - A town leader or official (a giver with a leader's tag) plans once a week (9.6: small
//   town leaders weekly): the intent menu weighs "post a commission" against "keep things
//   as they are"; posting instantiates one of the templates they give, within its ranges.
//
// The mapping and the menu are data (data/dialogue/commissions.json); the guild posts and
// pays (src/systems/guild post, take, settleDone).

import type { SystemContext } from '../../../core/system';
import { tr } from '../../../core/text';
import { calendarAt } from '../../../core/time';
import { actNo, boardDef, guildSlice, mayPost, post, take } from '../../guild';
import type { BoardDef, CommissionDef, Posting } from '../../guild/types';
import { addMemory } from '../../npc/memory';
import { personaById } from '../../npc/personas';
import { adjustRelation } from '../../npc/relations';
import type { NpcState } from '../../npc/types';
import { spendable } from '../../npc/wallet';
import { type RequestRules, unmetNeed } from './needs';

export interface LeaderRules {
  /** entity tags that make a giver a leader or an official */
  tags: string[];
  /** the planning beat: weekday (1 to 7) and hour */
  weekday: number;
  hour: number;
  /** utility of keeping things as they are (the baseline, 9.2) */
  keep: number;
  /** utility of posting: base + threat x (threat flag / 100) + room x (board has room) */
  post: { base: number; threat: number; room: number };
  /** the registered variable read as the region's threat (0 to 100) */
  threat: string;
}

export interface CommissionRules {
  requests: RequestRules;
  leaders: LeaderRules;
}

declare module '../../../core/contracts' {
  interface ContentMap {
    dialogueCommissions: CommissionRules;
  }
}

/** The board of a template nearest the giver: on the giver's home map, else the first. */
function boardFor(
  ctx: SystemContext,
  t: CommissionDef,
  homeMap: string | undefined,
): BoardDef | undefined {
  const boards = t.boards.map((id) => boardDef(ctx, id)).filter((b): b is BoardDef => !!b);
  return boards.find((b) => b.mapId === homeMap) ?? boards[0];
}

/** An open request of this giver still on a board or taken (one at a time). */
export function openRequestOf(ctx: SystemContext, giver: string): Posting | null {
  for (const p of Object.values(guildSlice(ctx.world).postings))
    if (p.personal && p.giver === giver && (p.state === 'posted' || p.state === 'accepted'))
      return p;
  return null;
}

/**
 * The request a person makes of the player now (6.2 step 3): their open one, or a new
 * personal commission for their unmet need; null when nothing maps (it stays talk).
 */
export function requestFrom(ctx: SystemContext, npcRef: string): Posting | null {
  const rules = ctx.content.dialogueCommissions?.requests;
  const st = ctx.world.slices.npc.npcs[npcRef];
  // a world without the guild has no boards to post on
  if (!rules || !st || st.resident || !ctx.world.slices.guild) return null;
  const open = openRequestOf(ctx, npcRef);
  if (open) return open.state === 'posted' ? open : null;
  const need = unmetNeed(rules, st);
  if (!need) return null;
  const cap = Math.floor(spendable(ctx, st) * rules.cap);
  if (cap < rules.minReward) return null;
  const home = personaById(ctx.content, npcRef)?.map;
  for (const id of rules.needs[need] ?? []) {
    const t = (ctx.content.commissions ?? []).find((c) => c.id === id);
    if (!t) continue;
    const board = boardFor(ctx, t, home);
    const s = guildSlice(ctx.world);
    if (!board || !s.boards[board.id]?.open) continue;
    if (!t.acts.includes(actNo(ctx))) continue;
    // the template's own limit stands (a request is the giver's own: one open per giver)
    if (t.limit !== undefined && (s.total[t.id] ?? 0) >= t.limit) continue;
    const p = post(ctx, board, t, { giver: npcRef, payCap: cap, personal: true });
    if (p) return p;
  }
  return null;
}

/**
 * A personal request was done (quests_and_events.md 6.2 step 4): the giver warms to the
 * player and remembers it (the favour of builtin_ai 5.5 "被帮助").
 */
export function requestDone(ctx: SystemContext, postingId: string): void {
  const p = ctx.world.slices.guild?.postings[postingId];
  if (!p?.personal || !p.giver || !ctx.world.slices.npc.npcs[p.giver]) return;
  adjustRelation(ctx, p.giver, 'player', REQUEST_THANKS, tr('sys.dialogue.request.thanks'));
  addMemory(ctx, p.giver, {
    text: tr('sys.dialogue.memory.request_done'),
    short: tr('sys.npc.memory.short.talk_player'),
    src: 'self',
    about: 'player',
    imp: 0.5,
    tag: 'helped',
  });
}

/** What a done request is worth to the giver's view of the player (5.5 helped). */
export const REQUEST_THANKS = { like: 5, trust: 5 };

/** The player takes a person's request in the conversation (no board, no rank gate). */
export function takeRequest(ctx: SystemContext, postingId: string): Posting | null {
  const p = guildSlice(ctx.world).postings[postingId];
  if (!p?.personal || p.state !== 'posted') return null;
  return take(ctx, postingId);
}

// ---------------------------------------------------------------------------
// Leaders and officials

/** Whether a person is a leader or an official who posts commissions (9.6). */
export function isLeader(ctx: SystemContext, npcRef: string): boolean {
  const rules = ctx.content.dialogueCommissions?.leaders;
  const p = personaById(ctx.content, npcRef);
  if (!rules || !p || !(p.roles ?? []).includes('giver')) return false;
  return p.tags.some((t) => rules.tags.includes(t));
}

/** The leader's intent menu (9.2, 9.6): post a commission or keep things as they are. */
export function leaderPostUtility(
  rules: LeaderRules,
  threat: number,
  room: boolean,
): { post: number; keep: number } {
  const w = rules.post;
  return {
    post: w.base + w.threat * Math.max(0, Math.min(1, threat / 100)) + (room ? w.room : 0),
    keep: rules.keep,
  };
}

/**
 * The weekly planning beat of the leaders (9.6): each one weighs posting one of the
 * templates they give (on a board where it may post now) against keeping things as they
 * are, and posts it when posting scores higher. Returns the postings made.
 */
export function leadersPlan(ctx: SystemContext): Posting[] {
  const rules = ctx.content.dialogueCommissions?.leaders;
  if (!rules || !ctx.world.slices.guild) return [];
  const cal = calendarAt(ctx.tick);
  if (cal.weekday !== rules.weekday || cal.hour !== rules.hour) return [];
  const threat = Number(ctx.flag(rules.threat) ?? 0) || 0;
  const out: Posting[] = [];
  for (const p of ctx.content.npcs ?? []) {
    const st = ctx.world.slices.npc.npcs[p.id];
    if (!st || st.gone || !isLeader(ctx, p.id)) continue;
    for (const t of ctx.content.commissions ?? []) {
      if (!(t.givers ?? []).includes(p.id)) continue;
      const board = boardFor(ctx, t, p.map);
      if (!board || !guildSlice(ctx.world).boards[board.id]?.open || !mayPost(ctx, board, t))
        continue;
      const up = Object.values(guildSlice(ctx.world).postings).filter(
        (x) => x.board === board.id && x.state === 'posted',
      ).length;
      // a full board takes nothing more
      if (up >= board.cap) continue;
      const u = leaderPostUtility(rules, threat, true);
      if (u.post <= u.keep) continue;
      const posted = post(ctx, board, t, { giver: p.id });
      if (posted) out.push(posted);
      break;
    }
  }
  return out;
}
