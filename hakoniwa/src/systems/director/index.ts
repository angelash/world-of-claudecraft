// Narrative director (phase 75): Moira's fate channel (goddess_gm.md 8, D-035; builtin_ai.md
// 13); the goddess is the one with the fate_director role in data/goddess/goddesses.json.
// Every game hour the tension meter takes a sample of six inputs and the rule table decides
// the move: a must reveal that is due, nothing while the player is busy, a written
// coincidence (catalog 4), a respite when things are too hard for too long, a coincidence
// when they are too quiet, an open reveal, a dynamic event of the right direction, the
// comedy throttle. Moves come from a written menu, serve only the player's experience,
// never change combat results, never deliver locked lore, and each leaves a fate thread in
// the miracle ledger as Moira's quiet work.

import { firstMatch, markFired, newRuleMemory, type RuleMemory } from '../../core/brain/rules';
import type { GameSystem, SystemContext } from '../../core/system';
import { calendarAt, TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../../core/time';
import { dueCoincidence } from '../goddess/beats';
import { creditLimit, ledger, offeringRules } from '../goddess/offerings';
import { holdingOf } from '../inventory';
import { playerBusy } from '../npc/brain/initiative';
import { actClockState, beatOf } from '../quests/act_clock';
import { currentActId } from '../quests/act_order';
import { actDef } from '../quests/acts';
import { actIndex } from '../quests/conditions';
import { conditionHolds } from '../quests/effects';
import { playerEntity } from '../world';
import {
  anyUndelivered,
  type DirectorDeliveryDef,
  deliveryProblems,
  deliveryText,
  dueDelivery,
  markDelivered,
  openDelivery,
  REVEAL_GAP,
  trackDeliveries,
} from './deliveries';
import {
  type DirectorItemDef,
  ITEM_NEEDS,
  ITEM_RELATES,
  itemOpen,
  landItem,
  type MenuFacts,
  pickItem,
  placeOf,
  playerHurt,
} from './menu';
import {
  condHolds,
  type DirectorPredicate,
  type DirectorRuleRow,
  directorRuleProblems,
} from './rules';
import {
  type BeatBands,
  bandFor,
  COINCIDENCE_COOL_HOURS,
  type DirectorMove,
  HIGH_HOURS,
  LOW_HOURS,
  RESPITE_COOL_HOURS,
  rawTension,
  smooth,
} from './tension';

export * from './coverage';
export * from './deliveries';
export * from './menu';
export * from './rules';
export * from './tension';

export interface DirectorSlice {
  tension: number;
  /** counters for the current hour */
  kills: number;
  deaths: number;
  threats: number;
  hoursLow: number;
  hoursHigh: number;
  lastCoincidenceTick: number;
  lastRespiteTick: number;
  /** item id -> tick it was last used */
  used: Record<string, number>;
  history: { tick: number; move: Exclude<DirectorMove, null>; item: string }[];
  /** the rule table's firing memory (cooldowns, once a day, the coverage report) */
  rules?: RuleMemory;
  /** delivery id -> tick its lore unlocked */
  unlockedAt?: Record<string, number>;
  /** deliveries handed over */
  delivered?: string[];
  /** tick of the last major reveal (a delivery) */
  lastReveal?: number;
  /** tick of the last door opened (a story beat for the stagnation input) */
  lastDoorTick?: number;
  /** the comedy throttle put this map in the background for this day */
  background?: { mapId: string; day: number };
  /** coincidences the meter opened (not written ones, not deliveries), per act */
  freeCoincidences?: Record<string, number>;
}

/** An act's limits on the director (data/goddess/director_acts.json). */
export interface DirectorActDef {
  act: string;
  /** coincidences the meter may open in the act besides the written ones (absent: no limit) */
  freeCoincidences?: number;
  /** target bands by the act clock's beat id (goddess_gm.md 8.2) */
  bands?: BeatBands;
  /** where the limit comes from (designer's note, not shown) */
  note?: string;
}

declare module '../../core/contracts' {
  interface WorldSlices {
    director: DirectorSlice;
  }
  interface ContentMap {
    directorMenu: DirectorItemDef[];
    /** the director's rule table (data/goddess/director_rules.json) */
    directorRules: DirectorRuleRow[];
    /** what the director may hand over of the reveal ledger (data/goddess/director_deliveries.json) */
    directorDeliveries: DirectorDeliveryDef[];
    /** per-act limits of the director (data/goddess/director_acts.json) */
    directorActs: DirectorActDef[];
  }
  interface EventMap {
    'director.move': { move: 'coincidence' | 'respite'; itemId: string; tension: number };
    /** a rule row fired (builtin_ai 13.2) */
    'director.rule': { rowId: string };
    /** a reveal-ledger entry was handed over */
    'director.delivered': { deliveryId: string; lore: string; must: boolean };
    /** the beat delay asks the event kernel to push its pending event back */
    'director.delay': { hours: number; itemId: string };
  }
}

const HISTORY_LIMIT = 50;
/** Escalation flags the social input reads (disputes runner: dispute.<id>.escalation). */
const ESCALATION = (id: string) => `dispute.${id}.escalation`;
/** Severity of a dynamic event as a threat count (quests_and_events.md 3.8). */
const SEVERITY_THREAT: Record<string, number> = { minor: 0, moderate: 1, severe: 2, crisis: 3 };
/** Money that reads as no money pressure (20 silver, in copper). */
const MONEY_EASY = 2000;
/** Usable items that read as no supply pressure. */
const SUPPLIES_EASY = 3;

function hoursSince(ctx: SystemContext, tick: number): number {
  return (ctx.tick - tick) / TICKS_PER_GAME_HOUR;
}

function slice(ctx: SystemContext): DirectorSlice {
  return ctx.world.slices.director;
}

/** Highest escalation (0 to 3) of the running disputes of the current act. */
function escalationNow(ctx: SystemContext): number {
  const act = currentActId(ctx);
  let top = 0;
  for (const d of ctx.content.disputes ?? []) {
    if (d.act !== act) continue;
    const v = Number(ctx.flag(ESCALATION(d.id)) ?? 0);
    if (v > top) top = v;
  }
  return top;
}

/** Resource pressure 0..1: money, usable supplies, a debt past its credit. */
function resourceNow(ctx: SystemContext): number {
  const id = ctx.world.slices.world.playerId;
  if (!ctx.world.slices.inventory) return 0;
  const h = holdingOf(ctx.world, id);
  const money = 1 - Math.min(1, h.money / MONEY_EASY);
  let usable = 0;
  for (const [itemId, n] of Object.entries(h.items)) {
    if (n <= 0) continue;
    const def = (ctx.content.items ?? []).find((i) => i.id === itemId);
    if (def?.use) usable += n;
  }
  const supply = 1 - Math.min(1, usable / SUPPLIES_EASY);
  const credit = creditLimit(offeringRules(ctx.content), ctx.flag('p_merca_valuation'));
  const debt = ctx.flag('merca_ledger') !== undefined && ledger(ctx) < -credit ? 1 : 0;
  return 0.5 * money + 0.3 * supply + 0.2 * debt;
}

/** Divine power spent on the player's map in the last game day (the miracle ledger). */
function divineNow(ctx: SystemContext, mapId: string): number {
  const book = ctx.world.slices.goddess?.ledger ?? [];
  const since = ctx.tick - TICKS_PER_GAME_DAY;
  let sum = 0;
  for (let i = book.length - 1; i >= 0; i--) {
    const e = book[i];
    if (!e || e.tick < since) break;
    if (e.mapId === mapId) sum += e.power;
  }
  return sum;
}

/** The act clock's beat id now (landing, dark, climax, pull-back), if the act has beats. */
function beatNow(ctx: SystemContext): string | undefined {
  const st = actClockState(ctx.world);
  const clock = actDef(ctx.content, currentActId(ctx))?.clock;
  return st ? (beatOf(clock, st.week)?.id ?? undefined) : undefined;
}

/** Whether a friend of the player (trust 40 or more) is in the world (13.2 旧识路过). */
function friendNear(ctx: SystemContext): boolean {
  for (const [k, v] of Object.entries(ctx.world.meta.flags))
    if (k.startsWith('trust.') && typeof v === 'number' && v >= 40) return true;
  return false;
}

/** Whether a side quest of the act is open to take (its trigger holds, not started). */
function openQuest(ctx: SystemContext): boolean {
  const act = currentActId(ctx);
  const q = ctx.world.slices.quests;
  for (const def of ctx.content.quests ?? []) {
    if (def.act !== act || def.kind !== 'side' || q?.quests[def.id]) continue;
    if (!def.trigger || conditionHolds(ctx, def.trigger)) return true;
  }
  return false;
}

/** A pending event of the guild's kernel not yet announced (the beat delay's target). */
function pendingEvent(ctx: SystemContext): string | null {
  const ev = (
    ctx.world.slices as {
      guild?: { events?: { pending?: { template: string; announced: boolean }[] } };
    }
  ).guild?.events?.pending;
  const p = (ev ?? []).find((x) => !x.announced);
  return p?.template ?? null;
}

/** The facts the menu and the rules read this hour. */
function factsNow(ctx: SystemContext): MenuFacts {
  const s = slice(ctx);
  const mapId = playerEntity(ctx.world)?.mapId ?? '';
  const place = placeOf(ctx, mapId);
  const restMap = place.town || ctx.content.maps.find((m) => m.id === mapId)?.respawn === 'door';
  return {
    tension: s.tension,
    band: bandFor(
      currentActId(ctx),
      beatNow(ctx),
      restMap,
      (ctx.content.directorActs ?? []).find((a) => a.act === currentActId(ctx))?.bands,
    ),
    mapId,
    outdoor: place.outdoor,
    wild: place.wild,
    friendNear: friendNear(ctx),
    dispute: escalationNow(ctx) >= 1,
    pendingEvent: pendingEvent(ctx),
    hurt: playerHurt(ctx),
    lowSupply: resourceNow(ctx) >= 0.5,
    openQuest: openQuest(ctx),
    undelivered: anyUndelivered(ctx, s),
  };
}

/**
 * Items the guild's kernel offers (dynamic event templates sent to the director), less the
 * ones a written act holds for its own time (catalog 4: DB-A1-02's item lands by row 3).
 */
function eventItems(ctx: SystemContext): DirectorItemDef[] {
  const ids = new Set((ctx.content.dynamicEvents ?? []).map((e) => e.id));
  const held = heldItems(ctx);
  return (ctx.content.directorMenu ?? []).filter((i) => ids.has(i.id) && !held.has(i.id));
}

/** Menu items a written coincidence holds for its own time (catalog 4: DB-A1-02). */
function heldItems(ctx: SystemContext): Set<string> {
  const act = currentActId(ctx);
  return new Set(
    (ctx.content.divineBeats ?? []).flatMap((b) => (b.item && b.act === act ? [b.item] : [])),
  );
}

/** The comedy throttle: a comedy bit already played on the player's map today. */
function comedyToday(ctx: SystemContext, mapId: string): boolean {
  const cog = (
    ctx.world.slices as { cognition?: { comedy?: Record<string, { day: number; count: number }> } }
  ).cognition?.comedy;
  if (!cog || !mapId) return false;
  const day = calendarAt(ctx.tick).dayIndex;
  const bg = slice(ctx).background;
  if (bg && bg.mapId === mapId && bg.day === day) return false;
  return Object.entries(cog).some(
    ([k, c]) => k.startsWith(`${mapId}/`) && c.day === day && c.count >= 1,
  );
}

/** Land an item as a move and keep the director's books. */
export function applyMove(
  ctx: SystemContext,
  move: Exclude<DirectorMove, null>,
  item: DirectorItemDef,
  opts: Parameters<typeof landItem>[2] = {},
): void {
  const s = slice(ctx);
  const bg = s.background;
  const mapId = playerEntity(ctx.world)?.mapId ?? '';
  const quiet = !!bg && bg.mapId === mapId && bg.day === calendarAt(ctx.tick).dayIndex;
  landItem(ctx, item, { ...opts, quiet: opts.quiet ?? quiet });
  s.used[item.id] = ctx.tick;
  if (move === 'coincidence' && !opts.narration && (opts.origin ?? 'director') === 'director') {
    const act = currentActId(ctx);
    s.freeCoincidences ??= {};
    s.freeCoincidences[act] = (s.freeCoincidences[act] ?? 0) + 1;
  }
  if (move === 'coincidence') {
    s.lastCoincidenceTick = ctx.tick;
    ctx.setFlag('fate_threads', Number(ctx.flag('fate_threads') ?? 0) + 1);
  } else s.lastRespiteTick = ctx.tick;
  s.history.push({ tick: ctx.tick, move, item: item.id });
  if (s.history.length > HISTORY_LIMIT) s.history.shift();
  ctx.emit('director.move', { move, itemId: item.id, tension: s.tension });
}

function itemById(ctx: SystemContext, id: string): DirectorItemDef | undefined {
  return (ctx.content.directorMenu ?? []).find((i) => i.id === id);
}

/** Whether the meter may still open a coincidence in this act (director_acts.json). */
function freeCoincidenceLeft(ctx: SystemContext): boolean {
  const act = currentActId(ctx);
  const cap = (ctx.content.directorActs ?? []).find((a) => a.act === act)?.freeCoincidences;
  return cap === undefined || (slice(ctx).freeCoincidences?.[act] ?? 0) < cap;
}

/** Run the move a rule row names. */
function runMove(ctx: SystemContext, row: DirectorRuleRow, f: MenuFacts): void {
  const s = slice(ctx);
  for (const step of row.then) {
    switch (step.action) {
      case 'deliver': {
        const d = step.params?.must === 'true' ? dueDelivery(ctx, s) : openDelivery(ctx, s);
        const item = d ? itemById(ctx, d.item) : undefined;
        if (!d || !item) break;
        applyMove(ctx, item.kind, item, { narration: deliveryText(d) });
        markDelivered(ctx, s, d);
        break;
      }
      case 'beat': {
        const due = dueCoincidence(ctx);
        const item = due ? itemById(ctx, due.item) : undefined;
        if (item) applyMove(ctx, item.kind, item, { origin: 'beat' });
        break;
      }
      case 'open': {
        const move = step.params?.move === 'respite' ? 'respite' : 'coincidence';
        // a written act's item waits for its own time (row 3)
        const held = heldItems(ctx);
        const item = pickItem(ctx, move, f, s.used, (i) => !held.has(i.id));
        if (item) applyMove(ctx, move, item);
        if (move === 'coincidence') s.hoursLow = 0;
        else s.hoursHigh = 0;
        break;
      }
      case 'event': {
        const move = f.tension < f.band.low ? 'coincidence' : 'respite';
        const ids = new Set(eventItems(ctx).map((i) => i.id));
        const item = pickItem(ctx, move, f, s.used, (i) => ids.has(i.id));
        if (item) applyMove(ctx, move, item);
        break;
      }
      case 'background':
        s.background = { mapId: f.mapId, day: calendarAt(ctx.tick).dayIndex };
        break;
      default:
        break;
    }
  }
}

function hourly(ctx: SystemContext): void {
  const s = slice(ctx);
  const act = currentActId(ctx);
  const idx = actIndex(act);
  const player = playerEntity(ctx.world);
  const gaze = Math.max(
    0,
    ...Object.values(ctx.world.slices.goddess?.goddesses ?? {}).map((g) => g.gaze),
  );
  const beat = Math.max(
    ctx.world.slices.quests?.lastBeatTick ?? 0,
    s.lastReveal ?? 0,
    s.lastDoorTick ?? 0,
  );
  const raw = rawTension({
    kills: s.kills,
    deaths: s.deaths,
    threats: s.threats,
    gaze,
    hoursSinceBeat: hoursSince(ctx, beat),
    escalation: escalationNow(ctx),
    resource: resourceNow(ctx),
    divinePower: divineNow(ctx, player?.mapId ?? ''),
  });
  s.tension = smooth(s.tension, raw);
  s.kills = 0;
  s.deaths = 0;
  s.threats = 0;
  ctx.setFlag('director.tension', Math.round(s.tension));
  if (Number.isNaN(idx) || idx < 1 || idx > 5) return;
  trackDeliveries(ctx, s);
  const f = factsNow(ctx);
  s.hoursLow = s.tension < f.band.low ? s.hoursLow + 1 : 0;
  s.hoursHigh = s.tension > f.band.high ? s.hoursHigh + 1 : 0;
  s.rules ??= newRuleMemory();
  const mem = s.rules;
  const memo = new Map<DirectorPredicate, boolean>();
  const has = (p: DirectorPredicate): boolean => {
    const hit = memo.get(p);
    if (hit !== undefined) return hit;
    const v = predicate(ctx, p, f);
    memo.set(p, v);
    return v;
  };
  const rows = (ctx.content.directorRules ?? []).filter(
    (r) => (r.when ?? '').trim() !== '' || condHolds(r.cond, has),
  );
  const row = firstMatch(
    rows,
    {
      tick: ctx.tick,
      act,
      holds: (when, r) => conditionHolds(ctx, when) && condHolds((r as DirectorRuleRow).cond, has),
    },
    mem,
  ) as DirectorRuleRow | null;
  if (!row) return;
  markFired(row, { tick: ctx.tick, act }, mem);
  ctx.emit('director.rule', { rowId: row.id });
  runMove(ctx, row, f);
}

function predicate(ctx: SystemContext, p: DirectorPredicate, f: MenuFacts): boolean {
  const s = slice(ctx);
  switch (p) {
    case 'due_delivery':
      return dueDelivery(ctx, s) !== null && !!itemById(ctx, dueDelivery(ctx, s)?.item ?? '');
    case 'player_busy':
      return playerBusy(ctx);
    case 'beat_due':
      return dueCoincidence(ctx) !== null;
    case 'high_long':
      return s.hoursHigh >= HIGH_HOURS;
    case 'respite_cool':
      return hoursSince(ctx, s.lastRespiteTick) >= RESPITE_COOL_HOURS;
    case 'low_long':
      return s.hoursLow >= LOW_HOURS;
    case 'coincidence_cool':
      return hoursSince(ctx, s.lastCoincidenceTick) >= COINCIDENCE_COOL_HOURS;
    case 'coincidence_free':
      return freeCoincidenceLeft(ctx);
    case 'open_delivery':
      return openDelivery(ctx, s) !== null;
    case 'reveal_gap':
      return s.lastReveal === undefined || ctx.tick - s.lastReveal >= REVEAL_GAP;
    case 'events_eligible': {
      // several offered events at once while the meter is out of its band: the one that
      // closes the gap (13.2 row 7)
      if (f.tension >= f.band.low && f.tension <= f.band.high) return false;
      const open = eventItems(ctx).filter((i) => itemOpen(ctx, i, f, s.used));
      const want = f.tension < f.band.low ? 'coincidence' : 'respite';
      if (
        want === 'coincidence' &&
        (!freeCoincidenceLeft(ctx) ||
          hoursSince(ctx, s.lastCoincidenceTick) < COINCIDENCE_COOL_HOURS)
      )
        return false;
      return open.length >= 2 && open.some((i) => i.kind === want);
    }
    case 'comedy_repeat':
      return comedyToday(ctx, f.mapId);
  }
}

/** Load-time problems of the director's tables (menu needs, rules, deliveries). */
export function directorProblems(content: {
  directorMenu?: readonly DirectorItemDef[];
  directorRules?: readonly DirectorRuleRow[];
  directorDeliveries?: readonly DirectorDeliveryDef[];
  lore?: { id: string; unlock: string }[];
}): string[] {
  const out: string[] = [...directorRuleProblems(content.directorRules ?? [])];
  for (const i of content.directorMenu ?? []) {
    for (const n of i.needs ?? [])
      if (!(ITEM_NEEDS as readonly string[]).includes(n))
        out.push(`director ${i.id}: unknown need ${n}`);
    if (i.relates && !(ITEM_RELATES as readonly string[]).includes(i.relates))
      out.push(`director ${i.id}: unknown relates ${i.relates}`);
  }
  out.push(...deliveryProblems(content as Parameters<typeof deliveryProblems>[0]));
  return out;
}

export const system: GameSystem = {
  id: 'director',
  order: 75,

  init(ctx) {
    ctx.world.slices.director = {
      tension: 30,
      kills: 0,
      deaths: 0,
      threats: 0,
      hoursLow: 0,
      hoursHigh: 0,
      lastCoincidenceTick: 0,
      lastRespiteTick: 0,
      used: {},
      history: [],
    };
  },

  on: {
    'world.hour'(ctx) {
      hourly(ctx);
    },
    'entity.died'(ctx, e) {
      const s = slice(ctx);
      const player = playerEntity(ctx.world);
      if (e.data.id === ctx.world.slices.world.playerId) {
        s.deaths++;
        return;
      }
      if (player && e.data.mapId === player.mapId && e.data.kind === 'monster') s.kills++;
    },
    'flag.changed'(ctx, e) {
      if (e.data.key.startsWith('combat.wave.') && e.data.value === 'go') slice(ctx).threats++;
    },
    'goddess.acted'(ctx, e) {
      const player = playerEntity(ctx.world);
      const a = (ctx.content.divineActions ?? []).find((x) => x.id === e.data.action);
      if (player && e.data.mapId === player.mapId && a?.hostile) slice(ctx).threats++;
    },
    'dynamic_event.landed'(ctx, e) {
      const player = playerEntity(ctx.world);
      if (!player || (e.data.mapId && e.data.mapId !== player.mapId)) return;
      slice(ctx).threats += SEVERITY_THREAT[e.data.severity] ?? 0;
    },
    'door.opened'(ctx) {
      slice(ctx).lastDoorTick = ctx.tick;
    },
  },
};
