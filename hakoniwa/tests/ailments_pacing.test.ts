// Pacing acceptance of the taint sicknesses (PK-M1-51; development_plan.md 4.2 "第一幕常规路线
// 的发病次数在设计范围内"): the act 1 regular route, measured headless over 20 seeds on the real
// engine (world, combat, doors, travel and ailments; the days pass as long time skips), and
// checked day by day against the pure dawn model (stepBody over the same hours and draws).
//
// The route is tests/fixtures/ailments_act1_regular_route.json: the act's weeks as day types
// over the atlas maps' canon grades, optional days at the regular share, and the intake of
// catalog_consumables_magitools.md 2.2 and 2.4 sized to the act 1 doors budget (about 15
// blockage, thousand_doors.md 6.2, so about 60 taint gained). Each atlas map is played on a
// shipped map of the same grade; the player's level follows the expected level of each week
// (progression 2.3: tier 1 from week 7), and the untreated hide is a real patterned item the
// player puts on and takes off. The design range (the packet's README, section 2):
//   - crystallisation never breaks out in act 1 (it is the mortal killer of the deep wastes);
//   - the spot is common but not certain: 25% to 90% of the seeds (the grey wolf hide is the
//     act's first lesson of 净, content_bible.md 1; a run that keeps clean avoids it), never
//     more than twice a run;
//   - the fever stays rare: at most 2 seeds of 20 (Oola is the only cure in acts 1 and 2),
//     never more than once a run;
//   - the gross taint of the act at most 20% over 60, so the doors budget holds (the lower
//     bound only checks the profile is not trivially mild; the intake was sized to the budget).

import { describe, expect, it } from 'vitest';
import type { Engine } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import { hashSeed, Rng } from '../src/core/rng';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR, TICKS_PER_GAME_MINUTE } from '../src/core/time';
import {
  type AilmentsConfig,
  clampTaint,
  freshBody,
  GRADES,
  type SedStage,
  stepBody,
  type WearGrade,
} from '../src/systems/ailments';
import { setLevel, tierForLevel, unitOf } from '../src/systems/combat';
import { addItem } from '../src/systems/inventory';
import { skipState } from '../src/systems/travel';
import { tagValue } from '../src/systems/world';
import { content, game, lastResult, TOWN, withCtx } from './ailments_harness';
import route from './fixtures/ailments_act1_regular_route.json';

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const CFG = content().ailmentsConfig as AilmentsConfig;
const GROSS_BUDGET = 60;

interface DayType {
  hours: Record<string, number>;
  field?: boolean;
}
interface Day {
  week: number;
  type: string;
  segments: { grade: number; hours: number }[];
  intake: number;
  /** the player's level that day (progression 2.3) */
  level: number;
  /** the untreated hide is worn that day */
  worn: boolean;
}

/** The untreated grey wolf hide of the route: a light-patterned chest piece. */
const HIDE = 'zz_untreated_hide';
const WEAR = route.wear.grade as WearGrade;

const DAY_TYPES = route.dayTypes as Record<string, DayType>;

/** Canon grade of an atlas map. */
function gradeOf(mapId: string): number {
  const m = content().atlas_maps?.find((a) => a.id === mapId);
  if (!m || typeof m.sediment !== 'number') throw new Error(`no atlas grade for ${mapId}`);
  return m.sediment;
}

/** The days of one seed's run: the week plans shuffled, the optional days drawn, the intake. */
function plan(seed: number): Day[] {
  const rng = new Rng({ s: hashSeed(seed, 'pacing.route') });
  const wear = rng.chance(route.wear.share);
  const days: Day[] = [];
  for (const w of route.weeks) {
    const types: string[] = [];
    for (const [t, n] of Object.entries(w.main)) for (let i = 0; i < n; i++) types.push(t);
    for (const [t, n] of Object.entries(w.optional ?? {}))
      for (let i = 0; i < n; i++)
        types.push(rng.chance(route.optionalShare) ? t : (w.fill as string));
    rng.shuffle(types);
    for (const type of types) {
      const def = DAY_TYPES[type] as DayType;
      let intake = 0;
      if (def.field) {
        if (rng.chance(route.food.chance))
          intake += rng.weighted(route.food.portions.map((p) => ({ w: p.w, v: p.taint })));
        if (w.week >= route.potions.fromWeek)
          intake += rng.int(0, route.potions.maxDoses) * route.potions.taint;
      }
      days.push({
        week: w.week,
        type,
        segments: Object.entries(def.hours).map(([m, hours]) => ({ grade: gradeOf(m), hours })),
        intake: Math.round(intake * 100) / 100,
        level: route.levels[w.week - 1] as number,
        worn: wear && w.week >= route.wear.fromWeek && w.week <= route.wear.toWeek,
      });
    }
  }
  return days;
}

interface Outcome {
  /** taint and stage after each dawn */
  days: { taint: number; stage: SedStage }[];
  onsets: Record<SedStage, number>;
  peak: number;
  gross: number;
}

function emptyOnsets(): Record<SedStage, number> {
  return { none: 0, spot: 0, fever: 0, crystal: 0 };
}

/** The pure dawn model over the plan, on the stream the engine uses. */
function model(seed: number, days: Day[]): Outcome {
  const rng = new Rng({ s: hashSeed(seed, 'sed.daily') });
  const body = freshBody();
  const out: Outcome = { days: [], onsets: emptyOnsets(), peak: 0, gross: 0 };
  days.forEach((d, i) => {
    body.taint = clampTaint(CFG, body.taint + d.intake);
    const hours = new Array<number>(GRADES).fill(0);
    for (const s of d.segments) hours[s.grade] = (hours[s.grade] ?? 0) + s.hours;
    body.hours = hours;
    const input = {
      day: i + 1,
      worn: d.worn ? [WEAR] : [],
      tier: tierForLevel(d.level),
      frail: false,
    };
    const r = stepBody(CFG, body, input, () => rng.next());
    if (r.onset) out.onsets[r.stage]++;
    out.gross += d.intake + Math.max(0, r.delta);
    out.peak = Math.max(out.peak, body.taint);
    out.days.push({ taint: body.taint, stage: body.stage });
  });
  return out;
}

/** A shipped map of each canon grade the route plays on, with a standing point. */
const STAND_IN: Record<number, string> = {
  0: 'inner_court',
  1: 'borderstone',
  2: 'seal_ruins',
  3: 'seal_ruins_depths',
};

/**
 * The shipped content with the stand-in maps emptied of spawns: the route measures exposure,
 * so no pack may fall on the sleeper and stop a skip (a hit interrupts it, 7.4).
 */
let quietContent: ContentMap | undefined;
function quiet(): ContentMap {
  const ids = new Set(Object.values(STAND_IN));
  const hide = {
    id: HIDE,
    name: HIDE,
    kind: 'armor',
    quality: 1,
    value: 1,
    desc: HIDE,
    slot: 'chest',
    sed: { grade: WEAR },
  };
  quietContent ??= {
    ...content(),
    maps: content().maps.map((m) => (ids.has(m.id) ? { ...m, spawns: [] } : m)),
    items: [...content().items, hide],
  } as ContentMap;
  return quietContent;
}

function spotOn(grade: number): { map: string; x: number; y: number } {
  const id = STAND_IN[grade];
  const map = quiet().maps.find((m) => m.id === id);
  const loc = map?.locations[0];
  if (!map || !loc || map.sediment !== grade) throw new Error(`no stand-in map for grade ${grade}`);
  return { map: map.id, x: loc.x + Math.floor(loc.w / 2), y: loc.y + Math.floor(loc.h / 2) };
}

/** Pass the time up to `target` exactly at `grade`, as one long skip. */
function spendUntil(g: Engine, grade: number, target: number): void {
  const at = spotOn(grade);
  g.queue('world.teleport', { entityId: 'player', mapId: at.map, x: at.x, y: at.y });
  // the move goes first: a map change in the skip's own tick would stop it (7.4)
  g.step(1);
  // a skip runs whole game minutes from the next tick; the last few ticks run one by one
  const minutes = Math.floor((target - (g.tick + 1)) / TICKS_PER_GAME_MINUTE);
  const hours = minutes / 60;
  g.queue('time.skip', { hours, kind: 'travel', mode: 'long' }, { type: 'script', script: 'pace' });
  g.step(1);
  let guard = Math.ceil(hours) + 10;
  while (skipState(g.world) && guard-- > 0) g.step(1);
  // only the minute's remainder is left; anything more means the skip was stopped
  if (target - g.tick >= TICKS_PER_GAME_MINUTE) throw new Error(`skip stopped at ${g.tick}`);
  if (g.tick < target) g.step(target - g.tick);
  if (g.tick !== target) throw new Error(`skip ended at ${g.tick}, not ${target}`);
}

/** The same plan on the real engine, the player standing where each segment says. */
function measure(seed: number, days: Day[]): Outcome {
  const g = game(TOWN, { seed, content: quiet() });
  const out: Outcome = { days: [], onsets: emptyOnsets(), peak: 0, gross: 0 };
  g.onEvents((evs) => {
    for (const e of evs) {
      if (e.kind === 'ailments.stage' && e.data.entityId === 'player' && e.data.cause === 'onset')
        out.onsets[e.data.stage]++;
      if (e.kind === 'ailments.daily' && e.data.entityId === 'player' && g.tick > dawn0) {
        out.days.push({ taint: e.data.taint, stage: e.data.stage });
        out.peak = Math.max(out.peak, e.data.taint);
        out.gross += Math.max(0, e.data.delta);
      }
    }
  });
  // the first full day starts at the second dawn (the first one is the start's own)
  const dawn0 = TICKS_PER_GAME_DAY;
  spendUntil(g, 1, dawn0);
  days.forEach((d, i) => {
    const prev = days[i - 1];
    if (!prev || prev.level !== d.level) {
      withCtx(g, (ctx) => {
        const u = unitOf(ctx.world, 'player');
        if (u) setLevel(ctx, u, d.level);
      });
      const e = g.world.slices.world.entities.player;
      if (!e || Number(tagValue(e, 'tier')) !== tierForLevel(d.level)) throw new Error('tier');
    }
    if (d.worn && !prev?.worn) {
      withCtx(g, (ctx) => {
        addItem(ctx, 'player', HIDE, 1);
      });
      g.queue('inventory.equip', { ownerId: 'player', itemId: HIDE });
      g.step(1);
      if (!lastResult(g, 'inventory.equip')?.ok) throw new Error('the hide would not go on');
    } else if (!d.worn && prev?.worn) {
      g.queue('inventory.unequip', { ownerId: 'player', slot: 'chest' });
      g.step(1);
    }
    if (d.intake > 0) {
      g.queue('ailments.taint', { amount: d.intake }, { type: 'script', script: 'pace' });
      out.gross += d.intake;
    }
    let hour = 0;
    for (const s of d.segments) {
      hour += s.hours;
      spendUntil(g, s.grade, dawn0 + i * TICKS_PER_GAME_DAY + hour * TICKS_PER_GAME_HOUR);
    }
  });
  return out;
}

describe('act 1 regular route: taint sickness onsets (20 seeds)', () => {
  it('stays inside the design range, and the engine matches the dawn model day by day', () => {
    const rows: Outcome[] = [];
    for (const seed of SEEDS) {
      const days = plan(seed);
      expect(days).toHaveLength(84);
      const engine = measure(seed, days);
      const pure = model(seed, days);
      expect(engine.days, `seed ${seed}`).toEqual(pure.days);
      expect(engine.onsets, `seed ${seed}`).toEqual(pure.onsets);
      rows.push(engine);
    }
    const spotSeeds = rows.filter((r) => r.onsets.spot > 0).length;
    const feverSeeds = rows.filter((r) => r.onsets.fever > 0).length;
    const gross = rows.reduce((s, r) => s + r.gross, 0) / rows.length;
    const peaks = rows.map((r) => Math.round(r.peak * 10) / 10).sort((a, b) => a - b);
    console.log(
      `[ailments act1 regular] spot onsets by seed ${rows.map((r) => r.onsets.spot).join(',')}; ` +
        `fever ${rows.map((r) => r.onsets.fever).join(',')}; crystal ${rows.map((r) => r.onsets.crystal).join(',')}; ` +
        `seeds with spot ${spotSeeds}/20, with fever ${feverSeeds}/20; mean gross taint ${gross.toFixed(1)}; ` +
        `peak taint min ${peaks[0]} median ${peaks[10]} max ${peaks[19]}`,
    );
    for (const [i, r] of rows.entries()) {
      expect(r.onsets.crystal, `seed ${SEEDS[i]} crystal`).toBe(0);
      expect(r.onsets.spot, `seed ${SEEDS[i]} spot`).toBeLessThanOrEqual(2);
      expect(r.onsets.fever, `seed ${SEEDS[i]} fever`).toBeLessThanOrEqual(1);
    }
    expect(spotSeeds).toBeGreaterThanOrEqual(5);
    expect(spotSeeds).toBeLessThanOrEqual(18);
    expect(feverSeeds).toBeLessThanOrEqual(2);
    expect(gross).toBeGreaterThanOrEqual(GROSS_BUDGET * 0.8);
    expect(gross).toBeLessThanOrEqual(GROSS_BUDGET * 1.2);
  }, 120000);
});
