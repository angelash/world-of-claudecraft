// Objective kinds of the quest model (PK-M1-58; quests_and_events.md 5; catalog_quests_acts1_3.md
// 1.3): deliver, escort, investigate, persuade, stealth, duel, follow, rescue, gather, craft,
// trade and accompany. Each reads kernel evidence only (an event a system emits, an entity's
// place, a world fact), never a model's say-so.
//
// Event contracts (declared here, emitted by their owners):
//   gather.done, craft.done   the gathering and crafting system (PK-M1-49; nothing emits them
//                             yet, the objectives are tested with synthetic events);
//   duel.ended                combat's non-lethal duel (no emitter yet);
//   stealth.detected          whoever sees the player sneaking (NPC perception, PK-M1-18;
//                             no emitter yet);
//   economy.traded            the economy system (exists).
// Movement: follow sends the NPC on its way with the NPC system's `npc.goto` command (a
// place on that person's map); escort, rescue and accompany need the person to walk with the
// player, which only companions do today (the party's follow order): the NPC-follows-player
// order is a gap for PK-M1-18 and PK-M1-15.

import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_MINUTE } from '../../core/time';
import { countItem, removeItem } from '../inventory';
import { playerEntity } from '../world';
import type { Entity } from '../world/types';
import { conditionHolds } from './effects';
import type { Objective, QuestDef, QuestProgress, QuestStage } from './types';

declare module '../../core/contracts' {
  interface EventMap {
    /** something was gathered (the gathering system, PK-M1-49) */
    'gather.done': {
      entityId: string;
      itemId: string;
      count: number;
      nodeId?: string;
      mapId?: string;
    };
    /** something was crafted (the crafting system, PK-M1-49) */
    'craft.done': {
      entityId: string;
      recipeId: string;
      itemId: string;
      count: number;
      quality?: number;
    };
    /** a non-lethal duel ended (combat); `opponentRef` is the opponent's content id */
    'duel.ended': { duelId: string; opponentRef: string; winner: 'player' | 'opponent' | 'draw' };
    /** an entity sneaking was seen (NPC perception, PK-M1-18) */
    'stealth.detected': { entityId: string; by?: string; mapId: string };
    /** an investigate objective found a clue */
    'quest.clue': { questId: string; objective: number; clue: string };
  }
}

type Of<T extends Objective['type']> = Extract<Objective, { type: T }>;

/** Default distances (tiles) for follow and accompany. */
export const FOLLOW_RANGE = 10;
export const ACCOMPANY_RANGE = 6;
/** How long a follow objective's npc.goto errand lasts unless the data says (game hours). */
export const FOLLOW_HOURS = 6;

/** What an objective needs, in the unit its progress counts. */
export function objectiveNeed(o: Objective): number {
  switch (o.type) {
    case 'investigate':
      return o.need ?? o.clues.length;
    case 'accompany':
      return o.minutes;
    case 'deliver':
    case 'trade':
      return o.count ?? 1;
    default:
      return 'count' in o && typeof o.count === 'number' ? o.count : 1;
  }
}

/** Progress of an objective as the log shows it (0 to need). */
export function objectiveProgress(o: Objective, q: QuestProgress, i: number): number {
  const need = objectiveNeed(o);
  if (q.met[i]) return need;
  switch (o.type) {
    case 'investigate':
      return Math.min(need, q.clues?.[String(i)]?.length ?? 0);
    case 'accompany':
      return Math.min(need, Math.floor((q.counts[i] ?? 0) / TICKS_PER_GAME_MINUTE));
    case 'escort':
    case 'rescue':
    case 'follow':
    case 'stealth':
    case 'persuade':
    case 'duel':
      // their counter holds a state (freed, following, spotted), not progress
      return 0;
    default:
      return Math.max(0, Math.min(need, q.counts[i] ?? 0));
  }
}

/** A failed optional objective keeps this counter: it stays unmet and is no longer polled. */
export const FAILED = -1;

/**
 * Whether a person is gone for good (the registry's npc.<id>.dead, or a companion whose state
 * is dead): what hangs on them can no longer happen. A companion going down in a fight is
 * not this (combat revives it).
 */
export function personGone(ctx: SystemContext, ref: string): boolean {
  const dead = ctx.flag(`npc.${ref}.dead`);
  return dead === true || dead === 1 || ctx.flag(`companion.${ref}.state`) === 'dead';
}

/** The living, visible entity of a content id (a companion's own entity wins over its NPC). */
export function entityByRef(world: SystemContext['world'], ref: string): Entity | undefined {
  let found: Entity | undefined;
  for (const e of Object.values(world.slices.world.entities)) {
    if (e.ref !== ref || !e.alive) continue;
    if (!e.hidden) return e;
    found ??= e;
  }
  return found;
}

/** Whether an entity stands on a map, inside a location (one tile of slack) when given. */
export function atPlace(
  ctx: SystemContext,
  e: Entity | undefined,
  mapId: string,
  location?: string,
): boolean {
  if (!e || e.mapId !== mapId) return false;
  if (!location) return true;
  const map = ctx.content.maps.find((m) => m.id === mapId);
  const loc = map?.locations.find((l) => l.id === location);
  if (!loc) return true;
  return (
    e.x >= loc.x - 1 && e.x <= loc.x + loc.w + 1 && e.y >= loc.y - 1 && e.y <= loc.y + loc.h + 1
  );
}

/** Whether two entities stand on the same map within `range` tiles. */
function near(a: Entity | undefined, b: Entity | undefined, range: number): boolean {
  return !!a && !!b && a.mapId === b.mapId && Math.hypot(a.x - b.x, a.y - b.y) <= range;
}

/** A poll's verdict on an objective: met now, failed now, or still open. */
export type PollResult = 'met' | 'fail' | 'open';

/** Polled objectives of the model (the event-driven ones answer 'open'). */
export function pollModelObjective(
  ctx: SystemContext,
  def: QuestDef,
  q: QuestProgress,
  o: Objective,
  i: number,
): PollResult {
  if (q.counts[i] === FAILED) return 'open';
  switch (o.type) {
    case 'escort':
    case 'rescue':
    case 'follow':
    case 'accompany':
    case 'duel':
      if (personGone(ctx, o.npc)) return 'fail';
      break;
    default:
      break;
  }
  switch (o.type) {
    case 'investigate':
      return pollClues(ctx, def, q, o, i);
    case 'accompany':
      return accompanied(o, q, i) ? 'met' : 'open';
    case 'escort':
      return atPlace(ctx, entityByRef(ctx.world, o.npc), o.mapId, o.location) ? 'met' : 'open';
    case 'rescue': {
      if (!q.counts[i] && o.when && conditionHolds(ctx, o.when)) q.counts[i] = 1;
      if (!q.counts[i]) return 'open';
      if (!o.mapId) return 'met';
      return atPlace(ctx, entityByRef(ctx.world, o.npc), o.mapId, o.location) ? 'met' : 'open';
    }
    case 'follow':
      return pollFollow(ctx, q, o, i);
    case 'stealth':
      return !q.counts[i] && atPlace(ctx, playerEntity(ctx.world), o.mapId, o.location)
        ? 'met'
        : 'open';
    default:
      return 'open';
  }
}

function pollClues(
  ctx: SystemContext,
  def: QuestDef,
  q: QuestProgress,
  o: Of<'investigate'>,
  i: number,
): PollResult {
  q.clues ??= {};
  const found = q.clues[String(i)] ?? [];
  for (const c of o.clues) {
    if (found.includes(c.id) || !conditionHolds(ctx, c.when)) continue;
    found.push(c.id);
    q.clues[String(i)] = found;
    ctx.emit('quest.clue', { questId: def.id, objective: i, clue: c.id });
  }
  return found.length >= objectiveNeed(o) ? 'met' : 'open';
}

function pollFollow(ctx: SystemContext, q: QuestProgress, o: Of<'follow'>, i: number): PollResult {
  const npc = entityByRef(ctx.world, o.npc);
  const p = playerEntity(ctx.world);
  const range = o.range ?? FOLLOW_RANGE;
  const close = near(npc, p, range);
  const arrived = atPlace(ctx, npc, o.mapId, o.location);
  if (q.counts[i]) {
    // following: losing the person (out of range, or they left the map) spoils it
    if (!close) {
      if (o.retry === false) return 'fail';
      q.counts[i] = 0;
      return 'open';
    }
    return arrived ? 'met' : 'open';
  }
  // the player has to join the person on the way: one who arrived alone left them behind
  if (arrived) return 'fail';
  if (close) q.counts[i] = 1;
  return 'open';
}

/** Send the people a stage's follow objectives lead on their way (npc.goto, NPC system). */
export function startStageObjectives(ctx: SystemContext, stage: QuestStage): void {
  for (const o of stage.objectives) {
    if (o.type !== 'follow') continue;
    ctx.dispatch(
      'npc.goto',
      { npcId: o.npc, locationId: o.location, hours: o.hours ?? FOLLOW_HOURS },
      { type: 'system', system: 'quests' },
    );
  }
}

// ---------------------------------------------------------------------------
// event matchers (the quests system calls them from its subscriptions)

/**
 * What a talk does to deliver, persuade and rescue objectives: 'met', 'moved' (the captive
 * was freed) or 'none'.
 */
export function onTalk(
  ctx: SystemContext,
  q: QuestProgress,
  o: Objective,
  i: number,
  npc: string,
): 'met' | 'moved' | 'none' {
  const pid = ctx.world.slices.world.playerId;
  switch (o.type) {
    case 'deliver': {
      const n = o.count ?? 1;
      if (o.npc !== npc || countItem(ctx.world, pid, o.item) < n) return 'none';
      if (o.consume !== false) removeItem(ctx, pid, o.item, n, 'quest');
      return 'met';
    }
    case 'persuade':
      return o.npc === npc && conditionHolds(ctx, o.when) ? 'met' : 'none';
    case 'rescue':
      if (o.npc !== npc || q.counts[i]) return 'none';
      q.counts[i] = 1;
      return 'moved';
    default:
      return 'none';
  }
}

/** Whether a trade by the player counts for a trade objective (and how many). */
export function tradeAmount(
  o: Objective,
  d: { marketId: string; itemId: string; qty: number; side: 'buy' | 'sell'; total: number },
): number {
  if (o.type !== 'trade') return 0;
  if (o.side && o.side !== d.side) return 0;
  if (o.item && o.item !== d.itemId) return 0;
  if (o.market && o.market !== d.marketId) return 0;
  if (o.price !== undefined && d.qty > 0) {
    const unit = d.total / d.qty;
    if (d.side === 'buy' ? unit > o.price : unit < o.price) return 0;
  }
  return Math.max(0, d.qty);
}

/** Whether a duel's end counts for a duel objective. */
export function duelCounts(o: Objective, d: { opponentRef: string; winner: string }): boolean {
  if (o.type !== 'duel' || o.npc !== d.opponentRef) return false;
  const want = o.outcome ?? 'win';
  if (want === 'any') return true;
  return want === 'win' ? d.winner === 'player' : d.winner === 'opponent';
}

/**
 * Whether a death fails an objective: the escortee, the captive, the guide or the companion
 * died; or the duel opponent was killed by the player's side (the duel was non-lethal).
 */
export function deathFails(o: Objective, ref: string | undefined, byPlayerSide: boolean): boolean {
  if (!ref) return false;
  switch (o.type) {
    case 'escort':
    case 'rescue':
    case 'follow':
    case 'accompany':
      return o.npc === ref;
    case 'duel':
      return o.npc === ref && byPlayerSide;
    default:
      return false;
  }
}

/** Add the time the player spent with an accompany objective's person since the last call. */
export function accrueTogether(ctx: SystemContext, q: QuestProgress, stage: QuestStage): boolean {
  const since = q.accrued ?? q.stageStartTick;
  q.accrued = ctx.tick;
  const dt = ctx.tick - since;
  if (dt <= 0) return false;
  let moved = false;
  const p = playerEntity(ctx.world);
  stage.objectives.forEach((o, i) => {
    if (o.type !== 'accompany' || q.met[i]) return;
    if (!near(p, entityByRef(ctx.world, o.npc), o.range ?? ACCOMPANY_RANGE)) return;
    q.counts[i] = (q.counts[i] ?? 0) + dt;
    moved = true;
  });
  return moved;
}

/** Whether an accompany objective has its time (polled after accrual). */
export function accompanied(o: Objective, q: QuestProgress, i: number): boolean {
  return o.type === 'accompany' && (q.counts[i] ?? 0) >= o.minutes * TICKS_PER_GAME_MINUTE;
}
