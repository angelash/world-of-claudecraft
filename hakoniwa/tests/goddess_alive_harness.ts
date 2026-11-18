// The act-1 measurement of the goddess brain and the director (builtin_ai.md 14.2 metric 8,
// 17.2; catalog_goddess_interventions.md 17.2; PK-M1-20): the narrative systems, the disputes
// runner and the act clock on the real content, with the named people of the act standing
// in their places (their faction and job tags: the believers the goddesses see) and a few
// hostile creatures in the wild (the dangers an omen may warn of), and a scripted player who
// spends the mornings in Borderstone, hunts the forest's edge in the afternoon, sleeps at
// the inn, does a deed every few days where people can see it, and uses Merca's coin now and
// then. The report counts what the player could perceive: metric 8 (what the built-in brain
// chose itself, the director's moves included) and the catalog's presence (every divine act
// seen), checks the density limits held and the must acts landed. Deterministic per seed.

import { buildContent } from '../src/content';
import { Engine, ok } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import { Rng } from '../src/core/rng';
import type { GameSystem, SystemContext } from '../src/core/system';
import { calendarAt, TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../src/core/time';
import { system as disputes } from '../src/systems/disputes';
import { beatReport, visibleCount } from '../src/systems/goddess';
import { personaOf } from '../src/systems/goddess/brain';
import { addItem } from '../src/systems/inventory';
import { mapById, spawnEntity } from '../src/systems/world';
import { NARRATIVE_SYSTEMS, narrativeContent, otherTeamsStub } from './narrative_harness';

declare module '../src/core/contracts' {
  interface CommandMap {
    'zz_galive.populate': Record<string, never>;
    'zz_galive.give': { item: string };
  }
}

export const TOWN = 'borderstone';
export const WILD = 'forest_edge';
/** The wild maps that get standing hostile creatures. */
const WILD_MAPS = ['forest_edge', 'seal_ruins', 'ash_waste'];

/** Places of a map to stand at (a location's centre, else the map's middle). */
function placeOf(content: ContentMap, mapId: string, loc?: string): { x: number; y: number } {
  const map = mapById(content, mapId);
  const l = map?.locations.find((x) => x.id === loc) ?? map?.locations[0];
  if (l) return { x: l.x + Math.floor(l.w / 2), y: l.y + Math.floor(l.h / 2) };
  return { x: Math.floor((map?.width ?? 2) / 2), y: Math.floor((map?.height ?? 2) / 2) };
}

/** The named people of the act in their places, and creatures in the wild. */
const population: GameSystem = {
  id: 'zz_galive',
  order: 998,
  commands: {
    'zz_galive.populate'(ctx: SystemContext) {
      // the npc pack's persona cards (table npcs)
      const personas = (ctx.content as unknown as { npcs?: unknown[] }).npcs ?? [];
      for (const p of personas) {
        const card = p as unknown as {
          id: string;
          name: string;
          map?: string;
          home?: string;
          faction?: string;
          tags?: string[];
        };
        if (!card.map || !mapById(ctx.content, card.map)) continue;
        const at = placeOf(ctx.content, card.map, card.home);
        spawnEntity(ctx, {
          kind: 'npc',
          name: card.name,
          ref: card.id,
          mapId: card.map,
          x: at.x,
          y: at.y,
          faction: 'town',
          appearance: { base: 'human', colors: ['#000000', '#000000', '#000000', '#000000'] },
          tags: ['npc', 'friendly', `faction:${card.faction ?? 'townsfolk'}`, ...(card.tags ?? [])],
        });
      }
      for (const mapId of WILD_MAPS) {
        if (!mapById(ctx.content, mapId)) continue;
        const at = placeOf(ctx.content, mapId);
        for (let i = 0; i < 3; i++)
          spawnEntity(ctx, {
            kind: 'monster',
            name: 'wolf',
            mapId,
            x: at.x,
            y: at.y,
            faction: 'wild',
            appearance: { base: 'beast', colors: ['#000000', '#000000', '#000000', '#000000'] },
            tags: ['monster', 'hostile'],
          });
      }
      return ok();
    },
    'zz_galive.give'(ctx, d) {
      addItem(ctx, ctx.world.slices.world.playerId, d.item, 1, 'test');
      return ok();
    },
  },
};

export const GODDESS_ALIVE_SYSTEMS: GameSystem[] = [
  ...NARRATIVE_SYSTEMS,
  disputes,
  otherTeamsStub,
  population,
];

let cachedContent: ContentMap | null = null;
function content(): ContentMap {
  cachedContent ??= narrativeContent();
  return cachedContent;
}

export interface GoddessAliveReport {
  seed: number;
  days: number;
  /** builtin_ai 14.2 metric 8: perceivable acts the brain chose (plan, schemes, director) */
  brain: number;
  /** catalog 17.2 presence: every perceivable divine act */
  presence: number;
  byOrigin: Record<string, number>;
  /** perceivable acts per goddess */
  byGoddess: Record<string, number>;
  /** perceivable acts by goddess, action and origin */
  byAction: Record<string, number>;
  /** the highest seven-day power on one map and on the player's map (catalog 1.3) */
  densityMax: number;
  densityPlayerMax: number;
  /** must acts that opened and did not land in full (missed, or still open at the end) */
  mustMissed: string[];
  /** must acts whose trigger never came in this run (the scenes are not played here) */
  mustUnopened: string[];
  /** act-1 power each goddess's plan and schemes spent */
  spent: Record<string, number>;
  /** goddesses whose plan spent past her act-1 budget (builtin_ai 8.4) */
  overBudget: string[];
  /** each goddess's power when the run ends (the act's end for a whole act) */
  endPower: Record<string, number>;
  /** goddesses below their act-1 end reserve when the run ends (catalog 5.0 and 17.2) */
  belowReserve: string[];
  /** covenant breaches in act 1 (catalog 17.2: none in acts 1 and 2) */
  breaches: number;
  /** a hash of the ledger, for the determinism check */
  ledgerHash: string;
  msPerDay: number;
}

/** Highest seven-day power sum of the brain's own acts per map, and on the player's map. */
function densityPeaks(
  ledger: { tick: number; mapId: string; power: number; origin?: string; seen?: boolean }[],
  playerMaps: Map<number, string>,
): { max: number; playerMax: number } {
  const own = ledger.filter((e) => e.origin !== 'beat' && e.power > 0);
  const week = 7 * TICKS_PER_GAME_DAY;
  let max = 0;
  let playerMax = 0;
  for (const e of own) {
    let sum = 0;
    let pm = 0;
    for (const f of own) {
      if (f.tick > e.tick || f.tick <= e.tick - week) continue;
      if (f.mapId === e.mapId) sum += f.power;
      if (playerMaps.get(f.tick) === f.mapId) pm += f.power;
    }
    max = Math.max(max, sum);
    playerMax = Math.max(playerMax, pm);
  }
  return { max, playerMax };
}

/** Run act 1 for `days` game days and read the report. */
export function runGoddessAlive(seed: number, days: number): GoddessAliveReport {
  const g = Engine.create(seed, content(), GODDESS_ALIVE_SYSTEMS, { aiMode: 'off' });
  const rng = new Rng({ s: seed * 4099 + 7 });
  // the prologue's coin and its terms (the prologue scenes write them)
  g.queue('flag.set', { key: 'act', value: 'act1' });
  g.queue('flag.set', { key: 'a1_wake_ruins', value: true });
  g.queue('flag.set', {
    key: 'p_merca_valuation',
    value: (['high', 'mid', 'low'] as const)[seed % 3] as string,
  });
  g.queue('flag.set', {
    key: 'p_coin_terms',
    value: (['interest_free', 'three_percent', 'first_free'] as const)[seed % 3] as string,
  });
  g.queue('zz_galive.populate', {});
  g.queue('zz_galive.give', { item: 'merca_coin' });
  g.step(2);
  const playerMaps = new Map<number, string>();
  g.onEvents((events, world) => {
    for (const e of events)
      if (e.kind === 'goddess.acted' || e.kind === 'director.move')
        playerMaps.set(
          e.tick,
          world.slices.world.entities[world.slices.world.playerId]?.mapId ?? '',
        );
  });
  const town = placeOf(g.content, TOWN, 'plaza');
  const wild = placeOf(g.content, WILD);
  const go = (mapId: string, at: { x: number; y: number }) =>
    g.queue('world.teleport', { entityId: 'player', mapId, x: at.x, y: at.y });
  const t0 = performance.now();
  const startDay = calendarAt(g.tick).dayIndex;
  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h++) {
      // keep the story's scenes out of the measurement (the player plays none here)
      g.world.slices.scenes.current = null;
      g.world.slices.scenes.queue = [];
      const hour = calendarAt(g.tick).hour;
      if (hour === 6) go(TOWN, town);
      if (hour === 12) go(WILD, wild);
      if (hour >= 12 && hour < 18 && rng.chance(0.5))
        g.queue('stub.kill', { kind: 'monster', mapId: WILD });
      if (hour === 18) go(TOWN, town);
      if (hour === 10 && rng.chance(0.4)) g.queue('stub.feat', { tier: 2 + rng.int(0, 1) });
      if (hour === 9 && rng.chance(0.2)) g.queue('goddess.coin', {});
      if (hour === 9 && rng.chance(0.1)) {
        const item = rng.pick(['otherworld_sweets', 'playing_cards', 'grain', 'honey']);
        g.queue('zz_galive.give', { item });
        g.queue('goddess.offer', { itemId: item, want: rng.chance(0.5) ? 'blessing' : 'intel' });
      }
      g.step(TICKS_PER_GAME_HOUR);
    }
    if (g.world.meta.flags.act !== 'act1') break;
  }
  const ms = performance.now() - t0;
  const slice = g.world.slices.goddess;
  const v = visibleCount(slice, 'act1');
  const byGoddess: Record<string, number> = {};
  const byAction: Record<string, number> = {};
  for (const e of slice.ledger) {
    if (e.act !== 'act1' || !e.seen) continue;
    byGoddess[e.goddess] = (byGoddess[e.goddess] ?? 0) + 1;
    const k = `${e.goddess}:${e.action}:${e.origin ?? ''}`;
    byAction[k] = (byAction[k] ?? 0) + 1;
  }
  const peaks = densityPeaks(slice.ledger, playerMaps);
  const beats = beatReport({ world: g.world, content: g.content }).filter(
    (b) => b.must && b.code.startsWith('DB-A1-'),
  );
  const mustMissed = beats
    .filter((b) => b.state === 'missed' || b.state === 'open')
    .map((b) => b.code);
  const mustUnopened = beats.filter((b) => b.state === 'waiting').map((b) => b.code);
  const spent: Record<string, number> = {};
  const overBudget: string[] = [];
  for (const [id, b] of Object.entries(slice.brains ?? {})) {
    const s = b.spent.act1 ?? 0;
    spent[id] = s;
    const budget = personaOf(g.content, id)?.acts.act1?.budget;
    if (budget !== undefined && s > budget) overBudget.push(`${id} ${s}/${budget}`);
  }
  const endPower: Record<string, number> = {};
  const belowReserve: string[] = [];
  for (const id of Object.keys(slice.goddesses).sort()) {
    const power = Math.round(slice.goddesses[id]?.power ?? 0);
    endPower[id] = power;
    const reserve = personaOf(g.content, id)?.acts.act1?.reserve;
    if (reserve !== undefined && power < reserve) belowReserve.push(`${id} ${power}/${reserve}`);
  }
  const breaches = slice.ledger.filter((e) => e.act === 'act1' && e.breach).length;
  let hash = 0;
  for (const e of slice.ledger) {
    const s = `${e.tick}:${e.goddess}:${e.action}:${e.mapId}:${e.power}`;
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  const elapsed = calendarAt(g.tick).dayIndex - startDay;
  return {
    seed,
    days: elapsed,
    brain: v.brain,
    presence: v.presence,
    byOrigin: v.byOrigin as Record<string, number>,
    byGoddess,
    byAction,
    densityMax: peaks.max,
    densityPlayerMax: peaks.playerMax,
    mustMissed,
    mustUnopened,
    spent,
    overBudget,
    endPower,
    belowReserve,
    breaches,
    ledgerHash: hash.toString(16),
    msPerDay: Math.round(ms / Math.max(1, elapsed)),
  };
}

/** The thresholds of the report (builtin_ai 14.2 metric 8 for act 1; catalog 17.2 and 1.3). */
export const GODDESS_ALIVE_THRESHOLDS = {
  /** metric 8, act 1: at least three */
  brain: 3,
  /** catalog 17.2 presence, act 1: at least eight */
  presence: 8,
  /** catalog 1.3: a map takes at most 1200 a week, the player's map 600 */
  density: 1200,
  densityPlayer: 600,
};

export { buildContent };
