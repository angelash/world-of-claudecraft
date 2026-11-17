// The act-1 "alive" measurement of the NPC brain (builtin_ai.md 14.2 and 17; PK-M1-18): the
// social systems on the real kernel with a scripted player who lives in Borderstone (walks
// the town by day, talks with people and answers those who come up, performs a deed every
// few days where people can see it, sleeps at the inn), and collectors that read the
// metrics off the event stream and the slices: approaches, schedule deviation, NPC
// interactions and quarrels, NPC-to-NPC relation records, rumor reach in town and to the
// next town, cognition arcs (and leaps without evidence), memory recall in conversations.
// Deterministic: the player's choices come from its own seeded stream.

import type { ContentPack } from '../src/content/pack';
import { pack as cognitionPack } from '../src/content/packs/cognition';
import { pack as dialoguePack } from '../src/content/packs/dialogue';
import { pack as economyPack } from '../src/content/packs/economy';
import { pack as inventoryPack } from '../src/content/packs/inventory';
import { pack as npcPack } from '../src/content/packs/npc';
import { pack as worldPack } from '../src/content/packs/world';
import { Engine, ok } from '../src/core';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import { Rng } from '../src/core/rng';
import type { GameSystem, SystemContext } from '../src/core/system';
import {
  calendarAt,
  TICKS_PER_GAME_DAY,
  TICKS_PER_GAME_HOUR,
  TICKS_PER_GAME_MINUTE,
  tickAtDay,
} from '../src/core/time';
import { system as cognition } from '../src/systems/cognition';
import { isAccepted } from '../src/systems/cognition/params';
import { system as dialogue } from '../src/systems/dialogue';
import { system as economy } from '../src/systems/economy';
import { system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { system as npc, npcEntityId } from '../src/systems/npc';
import { getEntity, mapById, system as world } from '../src/systems/world';

declare module '../src/core/contracts' {
  interface CommandMap {
    'zz_alive.feat': { kind: string; tier: number; targetRef?: string };
  }
}

export const TOWN = 'borderstone';
export const NEIGHBOUR = 'wallenburg';

function merge(packs: ContentPack[]): ContentMap {
  const out: Record<string, unknown> = {};
  for (const p of packs)
    for (const [k, v] of Object.entries(p.tables)) {
      const prev = out[k];
      out[k] = Array.isArray(prev) && Array.isArray(v) ? [...prev, ...v] : v;
    }
  return out as unknown as ContentMap;
}

export const ALIVE_CONTENT = merge([
  worldPack,
  inventoryPack,
  npcPack,
  cognitionPack,
  dialoguePack,
  economyPack,
]);

/** A deed the scripted player performs where people see it (combat would emit it). */
const featProbe: GameSystem = {
  id: 'zz_alive',
  order: 99,
  commands: {
    'zz_alive.feat'(ctx: SystemContext, d) {
      const p = getEntity(ctx.world, ctx.world.slices.world.playerId);
      if (!p) return ok();
      const target = d.targetRef ? npcEntityId(d.targetRef) : undefined;
      ctx.emit('feat.performed', {
        actorId: p.id,
        kind: d.kind,
        tier: d.tier,
        mapId: p.mapId,
        x: p.x,
        y: p.y,
        targetId: target,
        targetRef: d.targetRef,
      });
      return ok();
    },
  },
};

export const ALIVE_SYSTEMS = [
  world,
  inventory,
  modifiers,
  npc,
  dialogue,
  cognition,
  economy,
  featProbe,
];

/** Places the player walks between by day (social places of Borderstone). */
const WALK = ['plaza', 'guild', 'drunk_moon', 'salt_market', 'chapel', 'plaza_well', 'bakery'];
const DEEDS: { kind: string; tier: number; target?: boolean }[] = [
  { kind: 'elite_kill', tier: 3 },
  { kind: 'kill', tier: 2 },
  { kind: 'rescue', tier: 3, target: true },
  { kind: 'heal', tier: 2, target: true },
  { kind: 'spell', tier: 3 },
  { kind: 'build', tier: 2 },
];

export interface AliveReport {
  seed: number;
  days: number;
  /** 1: approaches per game day spent in town */
  approachesPerDay: number;
  /** 2: executed segments off the template over all executed segments of named townsfolk */
  deviation: number;
  /** 3: NPC interactions per town per day, and the quarrel share */
  interactionsPerDay: number;
  quarrelShare: number;
  /** 4: NPC-to-NPC relation records per town per day */
  relationRecordsPerDay: number;
  /** 5: share of named townsfolk holding a deed's rumor 2 days on; days to the next town */
  rumorReach: number;
  neighbourDays: number[];
  /** 6: complete cognition arcs (doubt, misreading, evidence, leap) and leaps without evidence */
  arcs: number;
  leapsWithoutEvidence: number;
  /** 9: share of conversations with a named L1 person that recalled a memory or a diary entry */
  recallShare: number;
  /** 10: weeks of a market with at least one price change, of all market weeks; longest stock-out (days) */
  priceWeeks: number;
  longestStockout: number;
  /** anti-metric: named people stuck off their schedule for over two game days */
  stuck: number;
  /** the brain's work per evaluation, for the performance budget */
  msPerDay: number;
}

interface Talk {
  npcRef: string;
  /** ticks still to wait before the next step */
  wait: number;
  step: 'open' | 'chat' | 'bye';
}

/** Run the scripted player in Borderstone for `days` game days. */
export function runAlive(
  seed: number,
  days: number,
  debug?: { transitions?: Map<string, string[]> },
): AliveReport {
  const g = Engine.create(seed, ALIVE_CONTENT, ALIVE_SYSTEMS, { aiMode: 'off' });
  const rng = new Rng({ s: seed * 7919 + 13 });
  const events: AnyWorldEvent[] = [];
  const counts = {
    approaches: 0,
    interactions: 0,
    quarrels: 0,
    sessions: 0,
    recalled: 0,
  };
  const neighbourDays: number[] = [];
  const lastFree = new Map<string, number>();
  const stuckIds = new Set<string>();
  const featRumors: { rumor: string; tick: number; checked: boolean; reached: boolean }[] = [];
  const reachShares: number[] = [];
  const transitions = debug?.transitions ?? new Map<string, string[]>();
  let leapsWithoutEvidence = 0;
  const relSeen = new Set<string>();
  let relRecords = 0;
  const deviation = { segs: 0, off: 0 };
  const sampled = new Set<string>();
  let pendingTalk: Talk | null = null;
  const approached: string[] = [];
  const named = (id: string) => {
    const st = g.world.slices.npc.npcs[id];
    return !!st && !st.resident;
  };
  g.onEvents((evs) => {
    for (const e of evs) {
      if (e.kind === 'npc.approached' && e.data.mapId === TOWN) {
        counts.approaches++;
        approached.push(e.data.npcId);
      } else if (e.kind === 'npc.interaction' && e.data.mapId === TOWN) {
        counts.interactions++;
        if (e.data.kind === 'quarrel') counts.quarrels++;
      } else if (e.kind === 'dialogue.closed') {
        const ref = getEntity(g.world, e.data.npcId)?.ref;
        if (ref && named(ref)) {
          counts.sessions++;
          if (e.data.recalled) counts.recalled++;
        }
      } else if (e.kind === 'cognition.belief_changed' && e.data.subjectId === 'player') {
        // the states the observer passed through, in order (one event may span two)
        const list = transitions.get(e.data.observerId) ?? [];
        if (list.at(-1) !== e.data.from) list.push(e.data.from);
        list.push(e.data.to);
        transitions.set(e.data.observerId, list);
        if (isAccepted(e.data.to) && !isAccepted(e.data.from)) {
          // a leap needs evidence behind it (3.5): something seen, a benefit, or what people
          // told (the classes that believe tales, children and remnants)
          const b = g.world.slices.cognition.beliefs[e.data.observerId]?.player;
          if (!b?.evidence.some((x) => x.weight > 0)) leapsWithoutEvidence++;
        }
      } else if (e.kind === 'feat.performed' && e.data.mapId === TOWN) {
        events.push(e);
      }
    }
  });
  const townsfolk = () =>
    Object.values(g.world.slices.npc.npcs).filter(
      (s) => !s.resident && !s.gone && s.mapId === TOWN,
    );
  const sampleRelations = () => {
    for (const [id, mind] of Object.entries(g.world.slices.npc.minds)) {
      if (g.world.slices.npc.npcs[id]?.mapId !== TOWN) continue;
      for (const r of mind.relLog) {
        if (r.to === 'player') continue;
        const k = `${id}:${r.tick}:${r.to}`;
        if (relSeen.has(k)) continue;
        relSeen.add(k);
        relRecords++;
      }
    }
  };
  // metric 10: per market, the days a price moved and the stock-outs in a row
  const priceDays = new Map<string, Set<number>>();
  const lastMult = new Map<string, number>();
  const outRun = new Map<string, number>();
  const stocked = new Set<string>();
  let longestStockout = 0;
  const sampleMarkets = (day: number) => {
    const markets = g.world.slices.economy?.markets ?? {};
    for (const [mid, m] of Object.entries(markets)) {
      for (const [item, good] of Object.entries(m.goods)) {
        const key = `${mid}/${item}`;
        const before = lastMult.get(key);
        if (before !== undefined && before !== good.mult) {
          const set = priceDays.get(mid) ?? new Set<number>();
          set.add(day);
          priceDays.set(mid, set);
        }
        lastMult.set(key, good.mult);
        // goods with no supply until the player makes them (the company's new goods) start
        // at nothing: only a good that had stock and lost it is a stock-out
        if (!stocked.has(key) && good.stock > 0) stocked.add(key);
        if (!stocked.has(key)) continue;
        const run = good.stock <= 0 ? (outRun.get(key) ?? 0) + 1 : 0;
        outRun.set(key, run);
        longestStockout = Math.max(longestStockout, run);
      }
    }
  };
  const sampleDeviation = () => {
    for (const st of townsfolk()) {
      const last = st.brain?.dayLog.last;
      if (!last || sampled.has(`${st.id}:${last.day}`)) continue;
      sampled.add(`${st.id}:${last.day}`);
      deviation.segs += last.segs;
      deviation.off += last.offSegs;
    }
  };
  const go = (place: string) => {
    const loc = mapById(g.content, TOWN)?.locations.find((l) => l.id === place);
    if (!loc) return;
    g.queue('world.teleport', {
      entityId: 'player',
      mapId: TOWN,
      x: loc.x + rng.int(0, Math.max(0, loc.w - 1)) + 0.5,
      y: loc.y + rng.int(0, Math.max(0, loc.h - 1)) + 0.5,
    });
  };
  // into town on the first morning
  g.step(1);
  go('plaza');
  g.step(1);
  const start = performance.now();
  const start0 = g.tick;
  const end = tickAtDay(days, 0, 1);
  let nextDeedDay = 1;
  let lastDay = calendarAt(g.tick).dayIndex;
  while (g.tick < end) {
    const cal = calendarAt(g.tick);
    if (cal.dayIndex !== lastDay) {
      lastDay = cal.dayIndex;
      sampleDeviation();
      sampleMarkets(cal.dayIndex);
    }
    const awake = cal.hour >= 8 && cal.hour < 21;
    // the conversation under way
    const talk = pendingTalk as Talk | null;
    if (talk) {
      if (talk.wait > 0) talk.wait--;
      else if (talk.step === 'open') {
        g.queue('dialogue.talk', { npcId: npcEntityId(talk.npcRef) });
        pendingTalk = { npcRef: talk.npcRef, step: 'chat', wait: 40 };
      } else if (talk.step === 'chat') {
        if (g.world.slices.dialogue.session) g.queue('dialogue.choose', { optionId: 'chat' });
        pendingTalk = { npcRef: talk.npcRef, step: 'bye', wait: 60 };
      } else {
        if (g.world.slices.dialogue.session) g.queue('dialogue.choose', { optionId: 'bye' });
        pendingTalk = null;
      }
    } else if (awake && approached.length > 0) {
      // answer whoever came up (walk over and talk)
      const ref = approached.shift() as string;
      const e = getEntity(g.world, npcEntityId(ref));
      if (e && e.mapId === TOWN) {
        g.queue('world.teleport', { entityId: 'player', mapId: TOWN, x: e.x + 0.6, y: e.y });
        pendingTalk = { npcRef: ref, step: 'open', wait: 2 };
      }
    } else if (awake && cal.minute === 0 && g.tick % TICKS_PER_GAME_MINUTE === 0) {
      // each daylight hour: walk somewhere, now and then talk to someone there
      go(rng.pick(WALK));
      if (rng.chance(0.6)) {
        g.step(2);
        const p = getEntity(g.world, 'player');
        const near = townsfolk()
          .map((s) => getEntity(g.world, s.entityId))
          .filter((x) => !!x && !!p && Math.hypot(x.x - p.x, x.y - p.y) < 6)
          .sort((a, b) => ((a?.id ?? '') < (b?.id ?? '') ? -1 : 1));
        const who = near.length > 0 ? rng.pick(near) : undefined;
        if (who?.ref) {
          g.queue('world.teleport', { entityId: 'player', mapId: TOWN, x: who.x + 0.6, y: who.y });
          pendingTalk = { npcRef: who.ref, step: 'open', wait: 2 };
        }
      }
      // a deed every two or three days, mid-afternoon, at a place the player goes by day
      if (cal.dayIndex >= nextDeedDay && cal.hour === 15) {
        go(rng.pick(WALK));
        g.step(2);
        const deed = rng.pick(DEEDS);
        const target = deed.target
          ? rng.pick(townsfolk().filter((s) => s.activity !== 'sleep')).id
          : undefined;
        const before = new Set(Object.keys(g.world.slices.cognition.rumors));
        g.queue('zz_alive.feat', { kind: deed.kind, tier: deed.tier, targetRef: target });
        g.step(1);
        for (const id of Object.keys(g.world.slices.cognition.rumors))
          if (!before.has(id))
            featRumors.push({ rumor: id, tick: g.tick, checked: false, reached: false });
        nextDeedDay = cal.dayIndex + rng.int(2, 3);
      }
    } else if (!awake && cal.minute === 0 && cal.hour === 21) {
      go('drunk_moon');
    }
    g.step(1);
    if (g.tick % TICKS_PER_GAME_HOUR === 0) {
      sampleRelations();
      // a named person held off the plain day (script, duty, initiative or social layers, a
      // talk that never closes, a walk that never arrives) without a single free hour on the
      // schedule or need layers for two game days counts as stuck
      for (const s of Object.values(g.world.slices.npc.npcs)) {
        if (s.resident || s.gone) continue;
        const layer = s.brain?.layer ?? 'schedule';
        const free = (layer === 'schedule' || layer === 'need') && !s.transit && !s.talking;
        if (free) lastFree.set(s.id, g.tick);
        else if (g.tick - (lastFree.get(s.id) ?? start0) > 2 * TICKS_PER_GAME_DAY)
          stuckIds.add(s.id);
      }
      const cog = g.world.slices.cognition;
      for (const f of featRumors) {
        const holders = (map: string) =>
          Object.values(g.world.slices.npc.npcs).filter(
            (s) =>
              !s.resident &&
              !s.gone &&
              s.mapId === map &&
              cog.holdings[s.id]?.some((h) => h.rumor === f.rumor),
          ).length;
        if (!f.checked && g.tick - f.tick >= 2 * TICKS_PER_GAME_DAY) {
          f.checked = true;
          const all = townsfolk().length;
          reachShares.push(all === 0 ? 0 : holders(TOWN) / all);
        }
        if (!f.reached && holders(NEIGHBOUR) > 0) {
          f.reached = true;
          neighbourDays.push((g.tick - f.tick) / TICKS_PER_GAME_DAY);
        }
      }
    }
  }
  const ms = performance.now() - start;
  sampleDeviation();
  // complete arcs (builtin_ai.md 14.2 metric 6): disbelief and a misreading (explaining),
  // then, on later evidence, a leap past it (wavering or acceptance); each observer counts
  // once per arc, an arc ending in a leap
  let arcs = 0;
  for (const list of transitions.values()) {
    let misread = false;
    for (const s of list) {
      if (s === 'explaining') misread = true;
      else if (misread && (s === 'wavering' || isAccepted(s))) {
        arcs++;
        misread = false;
      }
    }
  }
  const stuck = stuckIds.size;
  // a market week counts when a price moved on one of its days
  let marketWeeks = 0;
  let movedWeeks = 0;
  for (const mid of Object.keys(g.world.slices.economy?.markets ?? {})) {
    for (let w = 0; w * 7 < days; w++) {
      marketWeeks++;
      const set = priceDays.get(mid);
      if (set && [...set].some((d) => d >= w * 7 && d < (w + 1) * 7)) movedWeeks++;
    }
  }
  const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
  return {
    seed,
    days,
    approachesPerDay: counts.approaches / days,
    deviation: deviation.segs === 0 ? 0 : deviation.off / deviation.segs,
    interactionsPerDay: counts.interactions / days,
    quarrelShare: counts.interactions === 0 ? 0 : counts.quarrels / counts.interactions,
    relationRecordsPerDay: relRecords / days,
    rumorReach: avg(reachShares),
    neighbourDays,
    arcs,
    leapsWithoutEvidence,
    recallShare: counts.sessions === 0 ? 0 : counts.recalled / counts.sessions,
    priceWeeks: marketWeeks === 0 ? 0 : movedWeeks / marketWeeks,
    longestStockout,
    stuck,
    msPerDay: ms / days,
  };
}

/**
 * The median of a list (0 when empty): the neighbour-town delay is read as a median, since a
 * rumor that only reaches the next town late, when it is cold and seldom told, would drag a
 * mean far past the typical two to four days.
 */
export function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1
    ? (s[mid] as number)
    : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** The act-1 thresholds of builtin_ai.md 14.2 the brain answers for (per seed or as means). */
export const ALIVE_THRESHOLDS = {
  approachesPerDay: 3,
  deviation: [0.15, 0.4] as const,
  interactionsPerDay: 10,
  quarrelShare: 0.2,
  relationRecordsPerDay: 5,
  rumorReach: 0.5,
  neighbourDays: [2, 4] as const,
  /** complete arcs per 12 game weeks */
  arcsPer12Weeks: 4,
  recallShare: 0.2,
};

/** The failures of a report against the thresholds (scale 1 for means, 0.7 per seed: 17.2). */
export function aliveFailures(
  r: AliveReport,
  scale = 1,
  full = true,
  opts: { arcs?: boolean } = {},
): string[] {
  const t = ALIVE_THRESHOLDS;
  const out: string[] = [];
  const below = (name: string, v: number, min: number) => {
    if (v < min * scale) out.push(`${name} ${v.toFixed(3)} < ${(min * scale).toFixed(3)}`);
  };
  below('approaches/day', r.approachesPerDay, t.approachesPerDay);
  if (r.deviation < t.deviation[0] * scale || r.deviation > t.deviation[1] / scale)
    out.push(`deviation ${r.deviation.toFixed(3)} outside ${t.deviation.join('..')}`);
  below('interactions/day', r.interactionsPerDay, t.interactionsPerDay);
  if (r.quarrelShare > t.quarrelShare) out.push(`quarrels ${r.quarrelShare.toFixed(3)} > 0.2`);
  below('relation records/day', r.relationRecordsPerDay, t.relationRecordsPerDay);
  below('rumor reach', r.rumorReach, t.rumorReach);
  below('recall', r.recallShare, t.recallShare);
  if (r.leapsWithoutEvidence > 0) out.push(`${r.leapsWithoutEvidence} leaps without evidence`);
  if (r.stuck > 0) out.push(`${r.stuck} stuck`);
  if (full) {
    if (opts.arcs !== false) below('arcs per 12 weeks', (r.arcs * 84) / r.days, t.arcsPer12Weeks);
    const med = median(r.neighbourDays);
    if (r.neighbourDays.length === 0 || med < t.neighbourDays[0] || med > t.neighbourDays[1])
      out.push(`next town in ${med.toFixed(2)} days (median of ${r.neighbourDays.length} rumors)`);
  }
  return out;
}
