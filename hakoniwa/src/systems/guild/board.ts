// Guild registration, ranks and the commission boards (PK-M1-47; catalog_quests_acts1_3.md
// 2; society.md 3; ux_and_onboarding.md 6.3.7). The player registers (by the story's
// condition or at the counter), takes postings within the rank gate, and the guild pays and
// records each completed commission, counts defaults, and promotes when a rank needs no
// examination. Boards are topped up at every calendar week start from the templates that
// may post there; every draw goes through the board's own named stream, so the same seed and
// the same commands give the same postings. Writes only the guild slice and its flags
// (guild_rank, guild.*, cmm_count.<template>); quests run the instances through the
// quests system's instance seam.

import { contentRef, contentText } from '../../core/content_key';
import type { SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import { calendarAt, TICKS_PER_GAME_DAY, weekIndexOf } from '../../core/time';
import { addMoney, holdingOf, spendMoney } from '../inventory';
import { applyModifiers as modifierValue, registerModifier } from '../modifiers';
import { npcsOnMap } from '../npc/queries';
import { isInParty } from '../party/view';
import { currentActId } from '../quests/act_order';
import { actIndex } from '../quests/conditions';
import { conditionHolds } from '../quests/effects';
import { addQuestInstance, dropQuestInstance, questDefOf } from '../quests/instances';
import { matchesQuestNpc } from '../quests/npc_matches';
import { atPlace } from '../quests/objectives';
import { isClosed } from '../quests/outcomes';
import { startQuest } from '../quests/progress';
import { playerEntity } from '../world';
import { tagValue } from '../world/ports';
import { commissionXp, defaultPenalty, guildCut, postingPay } from './formulas';
import { instanceId, instanceQuest } from './instance';
import {
  autoPromotes,
  gateIndex,
  isRank,
  nextRankDef,
  promotionNeeds,
  rankIndex,
  rankNeeded,
} from './ranks';
import { guildSlice } from './slice';
import type {
  BoardDef,
  BoardState,
  CommissionDef,
  CommissionKind,
  GuildConfig,
  GuildRank,
  GuildSlice,
  MemberRecord,
  ModifierWrite,
  Posting,
  RankChange,
} from './types';

declare module '../../core/contracts' {
  interface EventMap {
    /** the player registered with the guild (society.md 3.4) */
    'guild.registered': { rank: GuildRank };
    /** the player's rank changed (promotion, practical recognition, or the story) */
    'guild.promoted': { rank: GuildRank; how: RankChange['how'] };
    'guild.posted': {
      postingId: string;
      templateId: string;
      boardId: string;
      rank: GuildRank;
      emergency: boolean;
    };
    'guild.accepted': { postingId: string; templateId: string };
    /** a commission was settled: pay to the player and the experience it gave */
    'guild.commission_done': { postingId: string; templateId: string; pay: number; xp: number };
    /** a taken commission was abandoned or ran out: a default on the record */
    'guild.commission_defaulted': {
      postingId: string;
      templateId: string;
      outcome: 'failed' | 'expired';
      penalty: number;
    };
  }
}

// ---------------------------------------------------------------------------
// Reads

export function guildConfig(ctx: { content: { guildConfig?: GuildConfig } }): GuildConfig | null {
  return ctx.content.guildConfig ?? null;
}

export function today(ctx: { tick: number }): number {
  return calendarAt(ctx.tick).dayIndex;
}

export function actNo(ctx: SystemContext): number {
  return actIndex(currentActId(ctx));
}

export function boardDef(ctx: SystemContext, id: string): BoardDef | undefined {
  return (ctx.content.guildBoards ?? []).find((b) => b.id === id);
}

export function commissionDef(
  content: { commissions?: CommissionDef[] },
  id: string,
): CommissionDef | undefined {
  return (content.commissions ?? []).find((c) => c.id === id);
}

/** The player's rank (the flag guild_rank), or null before registration. */
export function playerRank(ctx: { flag(key: string): unknown }): GuildRank | null {
  const v = ctx.flag('guild_rank');
  return isRank(v) ? v : null;
}

/** The player's level: the combat tag, else the level the quests system last heard, else 1. */
export function playerLevel(ctx: SystemContext): number {
  const p = playerEntity(ctx.world);
  const tag = p ? Number(tagValue(p, 'lvl')) : Number.NaN;
  if (Number.isFinite(tag) && tag >= 1) return tag;
  return Math.max(1, ctx.world.slices.quests?.level ?? 1);
}

/** Ranks of the guild's adventurers in the player's party (who may lead it). */
export function partyRanks(ctx: SystemContext, cfg: GuildConfig): GuildRank[] {
  return cfg.adventurers.filter((a) => isInParty(ctx.world, a.id)).map((a) => a.rank);
}

function setCount(ctx: SystemContext, key: string, value: number): void {
  if (Number(ctx.flag(key) ?? 0) !== value) ctx.setFlag(key, value);
}

// ---------------------------------------------------------------------------
// Registration and ranks

function newMember(ctx: SystemContext, rank: GuildRank, how: RankChange['how']): MemberRecord {
  return {
    rank,
    registeredTick: ctx.tick,
    done: {},
    defaults: 0,
    merit: 0,
    history: [{ tick: ctx.tick, rank, how }],
  };
}

/**
 * Register the player at the lowest rank. At the counter (`fee` true) the registration fee is
 * due and a player who cannot pay is refused; the story's registration (A1-M03) settles the
 * fee inside its own quest money (the bounty that covers it, catalog 5.2), so it charges
 * nothing here. Returns false when already registered or the fee is missing.
 */
export function register(ctx: SystemContext, fee: boolean): boolean {
  const cfg = guildConfig(ctx);
  const s = guildSlice(ctx.world);
  if (!cfg || playerRank(ctx) || s.member) return false;
  const playerId = ctx.world.slices.world.playerId;
  if (fee && cfg.registration.fee > 0 && !spendMoney(ctx, playerId, cfg.registration.fee, 'guild'))
    return false;
  const rank = (cfg.ranks[0]?.id ?? 'f') as GuildRank;
  s.member = newMember(ctx, rank, 'register');
  ctx.setFlag('guild_rank', rank);
  ctx.emit('guild.registered', { rank });
  return true;
}

/** Set the player's rank (and the practical mark), recording how. */
export function setRank(ctx: SystemContext, rank: GuildRank, how: RankChange['how']): void {
  const s = guildSlice(ctx.world);
  if (!s.member) s.member = newMember(ctx, rank, how);
  else {
    s.member.rank = rank;
    s.member.history.push({ tick: ctx.tick, rank, how });
  }
  if (how === 'practical') ctx.setFlag('guild.practical', true);
  ctx.setFlag('guild_rank', rank);
  ctx.emit('guild.promoted', { rank, how });
}

/**
 * The flag guild_rank written by someone else: the record follows the flag, which stays the
 * one truth of the rank. Written before any record (A1-M03 writes `guild_rank = f`), it is
 * the registration; written over a record (an exam scene), a promotion by the story.
 */
export function followRankFlag(ctx: SystemContext): void {
  const rank = playerRank(ctx);
  const s = guildSlice(ctx.world);
  if (!rank || s.member?.rank === rank) return;
  if (!s.member) {
    s.member = newMember(ctx, rank, 'register');
    ctx.emit('guild.registered', { rank });
    return;
  }
  s.member.rank = rank;
  s.member.history.push({ tick: ctx.tick, rank, how: 'story' });
  ctx.emit('guild.promoted', { rank, how: 'story' });
}

/** Promote while the next rank needs no examination and every requirement holds. */
export function autoPromote(ctx: SystemContext): void {
  const cfg = guildConfig(ctx);
  const s = guildSlice(ctx.world);
  if (!cfg || !s.member) return;
  for (let i = 0; i < cfg.ranks.length; i++) {
    const next = nextRankDef(cfg, s.member.rank);
    if (!next) return;
    if (!autoPromotes(next, promotionNeeds(next, s.member, cfg.registration.cardLevel))) return;
    setRank(ctx, next.id, 'auto');
  }
}

/** The story's registration and the automatic promotions (when something they read moved). */
export function settleMember(ctx: SystemContext): void {
  const cfg = guildConfig(ctx);
  if (!cfg) return;
  followRankFlag(ctx);
  const when = cfg.registration.when;
  if (when && !playerRank(ctx) && conditionHolds(ctx, when)) register(ctx, false);
  autoPromote(ctx);
}

// ---------------------------------------------------------------------------
// Week and boards

/** Reset the week's counts at a new calendar week, and drop instances past retention. */
export function settleWeek(ctx: SystemContext): void {
  const cfg = guildConfig(ctx);
  const s = guildSlice(ctx.world);
  const week = weekIndexOf(today(ctx));
  if (!cfg || s.week === week) return;
  s.week = week;
  for (const t of Object.keys(s.weekly).sort()) {
    setCount(ctx, `cmm_count.${t}`, 0);
  }
  s.weekly = {};
  const keepFrom = today(ctx) - cfg.keepWeeks * 7;
  for (const p of Object.values(s.postings)) {
    if (p.state === 'posted' || p.state === 'accepted') continue;
    if ((p.closedDay ?? 0) > keepFrom) continue;
    dropQuestInstance(ctx, p.id);
    delete s.postings[p.id];
  }
}

/** Whether a template may post on a board now (acts, rank, limit, cooldown, story, window). */
export function mayPost(ctx: SystemContext, board: BoardDef, t: CommissionDef): boolean {
  const s = guildSlice(ctx.world);
  if (!t.boards.includes(board.id) || !board.ranks.includes(t.rank)) return false;
  if (!t.acts.includes(actNo(ctx))) return false;
  if (t.limit !== undefined && (s.total[t.id] ?? 0) >= t.limit) return false;
  if ((s.cooldown[t.id] ?? -1) > today(ctx)) return false;
  if (t.firstIn && !isClosed(ctx.world.slices.quests.quests[t.firstIn]?.status)) return false;
  const w = t.weekWindow;
  if (w) {
    const week = Number(ctx.flag('act_week') ?? 0);
    if (week < (w.from ?? 1) || (w.to !== undefined && week > w.to)) return false;
  }
  if (t.when && !conditionHolds(ctx, t.when)) return false;
  for (const p of Object.values(s.postings))
    if (p.board === board.id && p.template === t.id && p.state === 'posted') return false;
  return true;
}

/**
 * Whether an active event pays this template as urgent on this board (its `hooks.urgent`,
 * on the boards of its maps).
 */
export function urgentNow(ctx: SystemContext, templateId: string, board: BoardDef): boolean {
  const s = guildSlice(ctx.world);
  for (const a of s.events.active) {
    const def = (ctx.content.dynamicEvents ?? []).find((e) => e.id === a.template);
    if (!def?.hooks?.urgent?.includes(templateId)) continue;
    if (def.maps.length === 0 || def.maps.includes(board.mapId)) return true;
  }
  return false;
}

/** Extra postings active events grant a board at refill, with the kinds they are drawn from. */
function boardBonus(
  ctx: SystemContext,
  board: BoardDef,
): { n: number; kinds?: CommissionKind[] }[] {
  const s = guildSlice(ctx.world);
  const out: { n: number; kinds?: CommissionKind[] }[] = [];
  for (const a of s.events.active) {
    const def = (ctx.content.dynamicEvents ?? []).find((e) => e.id === a.template);
    const b = def?.hooks?.board;
    if (!b || b.bonus <= 0) continue;
    if (def.maps.length > 0 && !def.maps.includes(board.mapId)) continue;
    out.push({ n: b.bonus, kinds: b.kinds });
  }
  return out;
}

/** Who posts (PK-M1-19): a named giver instead of the draw, a reward cap, a personal request. */
export interface PostOptions {
  emergency?: boolean;
  untilDay?: number;
  /** the person posting it (a leader's intent, a resident's request); skips the giver draw */
  giver?: string;
  /** the reward at most this (a resident pays out of their purse) */
  payCap?: number;
  /** a resident's own request: paid by the giver, no guild cut */
  personal?: boolean;
}

/**
 * Put a posting of a template on a board, drawing its parameters from the board's stream in a
 * fixed order (giver, place, goal, days). Emergencies skip the board's gates.
 */
export function post(
  ctx: SystemContext,
  board: BoardDef,
  t: CommissionDef,
  opts: PostOptions = {},
): Posting | null {
  const cfg = guildConfig(ctx);
  if (!cfg) return null;
  const s = guildSlice(ctx.world);
  const rng = ctx.rng(`guild.board.${board.id}`);
  const giver =
    opts.giver !== undefined
      ? opts.giver
      : t.givers && t.givers.length > 0
        ? rng.pick(t.givers)
        : null;
  const place = rng.pick(t.places);
  let target: string | undefined;
  let item: string | undefined;
  let count: number | undefined;
  let recipient: string | undefined;
  const g = t.goal;
  if (g.type === 'kill') {
    target = rng.pick(g.targets);
    count = rng.int(g.count[0], g.count[1]);
  } else if (g.type === 'deliver') {
    item = rng.pick(g.items);
    count = rng.int(g.count[0], g.count[1]);
  } else if (g.type === 'talk') {
    const to = g.to.filter((x) => x !== giver);
    recipient = rng.pick(to.length > 0 ? to : g.to);
  } else if (g.type === 'escort') {
    const people = g.people.flatMap((ref) => {
      if (ctx.content.npcs?.some((n) => n.id === ref)) return [ref];
      if (!ctx.world.slices.npc) return [];
      return npcsOnMap(ctx.world, ctx.content, board.mapId)
        .filter((n) => !n.gone && matchesQuestNpc(ctx.content, ref, n.id))
        .map((n) => n.id);
    });
    if (people.length === 0) return null;
    recipient = rng.pick(people);
  }
  const days = rng.int(t.days[0], t.days[1]);
  const serial = (s.serial[t.rank] ?? 0) + 1;
  s.serial[t.rank] = serial;
  const { id, display } = instanceId(t.rank, serial);
  const urgent = urgentNow(ctx, t.id, board);
  const pay = t.bounty
    ? Math.round(
        t.bounty.base +
          t.bounty.perRumor *
            Math.max(
              0,
              Math.min(
                t.bounty.maxRumor,
                modifierValue(ctx.world, 'monster', `rumor:${target}`, 0),
              ),
            ),
      )
    : postingPay(cfg, t, urgent);
  const reward = opts.payCap !== undefined ? Math.max(0, Math.min(pay, opts.payCap)) : pay;
  const day = today(ctx);
  const p: Posting = {
    id,
    display,
    template: t.id,
    board: board.id,
    rank: t.rank,
    giver,
    place: { ...place },
    days,
    reward,
    cut: board.cut && !opts.personal ? guildCut(cfg, reward) : 0,
    urgent,
    emergency: !!opts.emergency,
    postedDay: day,
    untilDay: opts.untilDay ?? day + Math.max(1, board.postWeeks) * 7 - 1,
    state: 'posted',
  };
  if (target !== undefined) p.target = target;
  if (item !== undefined) p.item = item;
  if (count !== undefined) p.count = count;
  if (recipient !== undefined) p.recipient = recipient;
  if (opts.personal) p.personal = true;
  s.postings[id] = p;
  ctx.emit('guild.posted', {
    postingId: id,
    templateId: t.id,
    boardId: board.id,
    rank: t.rank,
    emergency: p.emergency,
  });
  return p;
}

function withdraw(ctx: SystemContext, p: Posting): void {
  const s = guildSlice(ctx.world);
  p.state = 'withdrawn';
  p.closedDay = today(ctx);
  const t = commissionDef(ctx.content, p.template);
  if (t?.cooldownDays) s.cooldown[t.id] = today(ctx) + t.cooldownDays;
}

/** Postings of a board in a state. */
export function boardPostings(s: GuildSlice, boardId: string, state: Posting['state']): Posting[] {
  return Object.values(s.postings).filter((p) => p.board === boardId && p.state === state);
}

/**
 * Top a board up for the week: stale postings come down, then the board is filled up to the
 * week's target (the refill range, capped) plus the extra postings active events grant.
 */
export function refill(ctx: SystemContext, board: BoardDef): void {
  const s = guildSlice(ctx.world);
  const day = today(ctx);
  for (const p of boardPostings(s, board.id, 'posted')) if (p.untilDay < day) withdraw(ctx, p);
  const rng = ctx.rng(`guild.board.${board.id}`);
  const target = Math.min(board.cap, rng.int(board.refill[0], board.refill[1]));
  const draws: (CommissionKind[] | undefined)[] = [];
  const up = boardPostings(s, board.id, 'posted').length;
  for (let i = up; i < target; i++) draws.push(undefined);
  for (const b of boardBonus(ctx, board)) for (let i = 0; i < b.n; i++) draws.push(b.kinds ?? []);
  for (const kinds of draws) {
    const pool = (ctx.content.commissions ?? []).filter(
      (t) => mayPost(ctx, board, t) && (!kinds || kinds.length === 0 || kinds.includes(t.kind)),
    );
    if (pool.length === 0) continue;
    const t = rng.weighted(pool.map((x) => ({ w: x.weight ?? 1, v: x })));
    post(ctx, board, t);
  }
}

/** Whether a board's open state no longer matches the act (the act just changed). */
export function boardsStale(ctx: SystemContext): boolean {
  const s = guildSlice(ctx.world);
  const act = actNo(ctx);
  return (ctx.content.guildBoards ?? []).some(
    (b) => b.acts.includes(act) !== (s.boards[b.id]?.open ?? false),
  );
}

/** Open, close and top up the boards (hourly; a board fills once per calendar week). */
export function settleBoards(ctx: SystemContext): void {
  const s = guildSlice(ctx.world);
  const week = weekIndexOf(today(ctx));
  const act = actNo(ctx);
  for (const board of ctx.content.guildBoards ?? []) {
    s.boards[board.id] ??= { week: -1, open: false };
    const st = s.boards[board.id] as BoardState;
    const open = board.acts.includes(act);
    if (!open) {
      if (st.open) for (const p of boardPostings(s, board.id, 'posted')) withdraw(ctx, p);
      st.open = false;
      continue;
    }
    st.open = true;
    for (const p of boardPostings(s, board.id, 'posted'))
      if (p.untilDay < today(ctx)) withdraw(ctx, p);
    if (st.week === week) continue;
    st.week = week;
    refill(ctx, board);
  }
}

/**
 * Emergency postings of a template (an event's hook): on every open board of the event's
 * maps that carries it, unless one of it is already up there; they stay up until `untilDay`
 * (the event's day). Emergencies skip the board's other gates (cap, acts, window).
 */
export function postEmergency(
  ctx: SystemContext,
  templateId: string,
  maps: readonly string[],
  untilDay: number,
): Posting[] {
  const s = guildSlice(ctx.world);
  const t = commissionDef(ctx.content, templateId);
  if (!t) return [];
  if (t.limit !== undefined && (s.total[t.id] ?? 0) >= t.limit) return [];
  const out: Posting[] = [];
  for (const board of ctx.content.guildBoards ?? []) {
    if (!s.boards[board.id]?.open || !t.boards.includes(board.id)) continue;
    if (maps.length > 0 && !maps.includes(board.mapId)) continue;
    if (boardPostings(s, board.id, 'posted').some((p) => p.template === t.id)) continue;
    const p = post(ctx, board, t, { emergency: true, untilDay: Math.max(today(ctx), untilDay) });
    if (p) out.push(p);
  }
  return out;
}

/**
 * Re-price the untaken postings when an event with urgent pay lands or ends: urgent while an
 * active event makes its template urgent on its board (catalog 5.6 "期间"), plain again after.
 */
export function repriceUrgent(ctx: SystemContext): void {
  const cfg = guildConfig(ctx);
  const s = guildSlice(ctx.world);
  if (!cfg) return;
  for (const p of Object.values(s.postings)) {
    if (p.state !== 'posted') continue;
    const t = commissionDef(ctx.content, p.template);
    const board = boardDef(ctx, p.board);
    if (!t || !board) continue;
    const urgent = urgentNow(ctx, t.id, board);
    if (urgent === p.urgent) continue;
    p.urgent = urgent;
    p.reward = postingPay(cfg, t, urgent);
    p.cut = board.cut ? guildCut(cfg, p.reward) : 0;
  }
}

// ---------------------------------------------------------------------------
// Taking, turning in, walking away

export type BoardRefusal =
  | { code: 'no_config' }
  | { code: 'not_registered' }
  | { code: 'no_posting' }
  | { code: 'taken' }
  | { code: 'gone' }
  | { code: 'far' }
  | { code: 'rank'; need: GuildRank }
  | { code: 'full'; max: number };

/** Why the player could not take a posting now, or null when they could. */
export function takeRefusal(
  ctx: SystemContext,
  postingId: string,
  atBoard: boolean,
): BoardRefusal | null {
  const cfg = guildConfig(ctx);
  if (!cfg) return { code: 'no_config' };
  const own = playerRank(ctx);
  if (!own) return { code: 'not_registered' };
  const s = guildSlice(ctx.world);
  const p = s.postings[postingId];
  const board = p ? boardDef(ctx, p.board) : undefined;
  if (!p || !board) return { code: 'no_posting' };
  if (p.state === 'accepted' || p.state === 'done') return { code: 'taken' };
  if (p.state !== 'posted') return { code: 'gone' };
  if (p.untilDay < today(ctx) || !s.boards[board.id]?.open) return { code: 'gone' };
  if (!atBoard) return { code: 'far' };
  if (rankIndex(p.rank) > gateIndex(own, partyRanks(ctx, cfg), board.reach, board.lone))
    return { code: 'rank', need: rankNeeded(p.rank, board.reach, board.lone) };
  const held = Object.values(s.postings).filter((x) => x.state === 'accepted').length;
  if (held >= cfg.maxAccepted) return { code: 'full', max: cfg.maxAccepted };
  return null;
}

/** Take a posting: its instance quest is built, registered with the quests system and started. */
export function take(ctx: SystemContext, postingId: string): Posting | null {
  const cfg = guildConfig(ctx);
  const s = guildSlice(ctx.world);
  const p = s.postings[postingId];
  const t = p ? commissionDef(ctx.content, p.template) : undefined;
  const board = p ? boardDef(ctx, p.board) : undefined;
  if (!cfg || !p || !t || !board || p.state !== 'posted') return null;
  const day = today(ctx);
  // the days count the day it is taken: a one-day letter is due by tonight
  const deadline = day + Math.max(1, p.days) - 1;
  // a resident's own request is turned in to the person who asked (PK-M1-19)
  const turnIn = p.personal && p.giver ? p.giver : board.receptionist;
  const def = instanceQuest(t, p, { act: currentActId(ctx), turnIn, deadline });
  if (!addQuestInstance(ctx, def)) return null;
  p.state = 'accepted';
  p.acceptedDay = day;
  p.deadline = deadline;
  startQuest(ctx, def.id);
  ctx.emit('guild.accepted', { postingId: p.id, templateId: t.id });
  return p;
}

/** The player stands at a board: inside its place (the board's window opens there). */
export function atBoard(ctx: SystemContext, board: BoardDef | undefined): boolean {
  return !!board && atPlace(ctx, playerEntity(ctx.world), board.mapId, board.location);
}

/** Title of a posting's template as a text parameter. */
export function postingTitle(ctx: SystemContext, p: Posting) {
  return contentText('commissions', commissionDef(ctx.content, p.template), p.display, 'title');
}

/** A taken posting's quest, when it is still in the quests system. */
export function postingQuest(ctx: SystemContext, p: Posting) {
  const def = questDefOf(ctx, p.id);
  const q = ctx.world.slices.quests.quests[p.id];
  return def && q ? { def, q } : null;
}

// ---------------------------------------------------------------------------
// Settlement

/** Register the modifiers of a commission or an event, each for its days (D-013). */
export function applyModifiers(
  ctx: SystemContext,
  source: string,
  mods: readonly ModifierWrite[] | undefined,
  note: ReturnType<typeof contentRef>,
): void {
  for (const m of mods ?? []) {
    registerModifier(ctx, {
      target: m.target,
      key: m.key,
      ...(m.factor !== undefined ? { factor: m.factor } : {}),
      ...(m.add !== undefined ? { add: m.add } : {}),
      untilTick: ctx.tick + Math.max(1, m.days) * TICKS_PER_GAME_DAY,
      source,
      visibility: m.visibility ?? 'hidden',
      note,
      stackGroup: source,
    });
  }
}

/** Count one completed instance of a template on the record (the week's count, totals, rank). */
function countCompletion(ctx: SystemContext, t: CommissionDef): number {
  const s = guildSlice(ctx.world);
  const earlier = s.weekly[t.id] ?? 0;
  s.weekly[t.id] = earlier + 1;
  s.total[t.id] = (s.total[t.id] ?? 0) + 1;
  setCount(ctx, `cmm_count.${t.id}`, earlier + 1);
  if (s.member) {
    s.member.done[t.rank] = (s.member.done[t.rank] ?? 0) + 1;
    s.member.merit += Math.max(0, t.merit ?? 0);
    const done = Object.values(s.member.done).reduce((a, b) => a + (b ?? 0), 0);
    setCount(ctx, 'guild.done', done);
    if (t.merit) setCount(ctx, 'guild.merit', s.member.merit);
  }
  s.dirty = true;
  return earlier;
}

/**
 * A commission's quest completed: the client's pay to the player, the experience (decayed by
 * the week's count, none past the zero difference), the record, the modifiers, the books.
 */
export function settleDone(ctx: SystemContext, questId: string): void {
  const cfg = guildConfig(ctx);
  const s = guildSlice(ctx.world);
  const p = s.postings[questId];
  if (!cfg || !p || p.state !== 'accepted') return;
  const t = commissionDef(ctx.content, p.template);
  p.state = 'done';
  p.closedDay = today(ctx);
  if (!t) return;
  // a personal request is no guild work: it adds nothing to the member's record
  const earlier = p.personal ? 0 : countCompletion(ctx, t);
  const playerId = ctx.world.slices.world.playerId;
  // a resident's own request is paid out of the giver's purse (what they still have)
  const pay = p.personal ? personalPay(ctx, p) : p.reward;
  addMoney(ctx, playerId, pay, 'commission');
  const xp = commissionXp(cfg, t, playerLevel(ctx), earlier);
  // quest experience (progression 3.1): the act's catch-up applies to it like to any quest
  if (xp > 0) ctx.emit('xp.awarded', { entityId: playerId, amount: xp, reason: `quest:${t.id}` });
  applyModifiers(ctx, t.id, t.modifiers, contentRef('commissions', t.id, 'title'));
  s.ledger.cut += p.cut;
  if (!p.personal) s.ledger.paid += p.reward;
  if (t.cooldownDays) s.cooldown[t.id] = today(ctx) + t.cooldownDays;
  ctx.emit('guild.commission_done', { postingId: p.id, templateId: t.id, pay, xp });
}

/** The giver of a personal request pays the reward from their purse, at most what they hold. */
function personalPay(ctx: SystemContext, p: Posting): number {
  const entityId = p.giver ? ctx.world.slices.npc?.npcs[p.giver]?.entityId : undefined;
  if (!entityId) return 0;
  const paid = Math.min(p.reward, holdingOf(ctx.world, entityId).money);
  if (paid > 0) spendMoney(ctx, entityId, paid, 'commission');
  return paid;
}

/** A taken commission failed (walked away) or ran out: a default on the record. */
export function settleDefault(
  ctx: SystemContext,
  questId: string,
  outcome: 'failed' | 'expired',
): void {
  const cfg = guildConfig(ctx);
  const s = guildSlice(ctx.world);
  const p = s.postings[questId];
  if (!cfg || !p || p.state !== 'accepted') return;
  p.state = outcome;
  p.closedDay = today(ctx);
  const t = commissionDef(ctx.content, p.template);
  if (t?.cooldownDays) s.cooldown[t.id] = today(ctx) + t.cooldownDays;
  if (s.member && !p.personal) {
    s.member.defaults += 1;
    setCount(ctx, 'guild.defaults', s.member.defaults);
  }
  // the penalty is due to the client; the player pays what they have
  const playerId = ctx.world.slices.world.playerId;
  const penalty = Math.min(defaultPenalty(cfg, p.reward), holdingOf(ctx.world, playerId).money);
  if (penalty > 0) addMoney(ctx, playerId, -penalty, 'commission');
  ctx.emit('guild.commission_defaulted', {
    postingId: p.id,
    templateId: p.template,
    outcome,
    penalty,
  });
}

/**
 * A quest that holds templates' first instances completed (A1-M04): each such template counts
 * one completed instance, once, with no pay and no experience (the quest paid).
 */
export function settleFirstIn(ctx: SystemContext, questId: string): void {
  const s = guildSlice(ctx.world);
  for (const t of ctx.content.commissions ?? []) {
    if (t.firstIn !== questId || s.firstDone.includes(t.id)) continue;
    s.firstDone.push(t.id);
    countCompletion(ctx, t);
  }
}

/** The player-facing reason of a board refusal. */
export function refusalText(r: BoardRefusal) {
  switch (r.code) {
    case 'no_config':
    case 'no_posting':
      return tr('sys.guild.reject.no_posting');
    case 'not_registered':
      return tr('sys.guild.reject.not_registered');
    case 'taken':
      return tr('sys.guild.reject.taken');
    case 'gone':
      return tr('sys.guild.reject.gone');
    case 'far':
      return tr('sys.guild.reject.far');
    case 'rank':
      return tr('sys.guild.reject.rank', { rank: tr(`sys.guild.rank.${r.need}`) });
    case 'full':
      return tr('sys.guild.reject.full', { max: r.max });
  }
}
