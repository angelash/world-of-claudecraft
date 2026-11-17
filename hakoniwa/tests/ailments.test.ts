// The ailments system (PK-M1-51; progression_and_pacing.md 9, 10; act1_borderstone.md 7.2):
// exposure by the local sediment, the dawn check and its onset curve, the self-heal and the
// cures, the player's crystallisation as blockage, the injuries, the flag mirrors, the time
// skip (a long skip settles the same days as ticking through them), the town's sediment
// track and the children's cases, and the data and save checks.

import { describe, expect, it } from 'vitest';
import { validateAilments } from '../src/content/packs/ailments';
import type { ContentMap } from '../src/core/contracts';
import { TICKS_PER_GAME_DAY } from '../src/core/time';
import {
  type AilmentsConfig,
  ailmentGauge,
  bodyAuraStage,
  caseStageNow,
  crystalBlockage,
  cureBody,
  cureSteps,
  exposureDelta,
  freshBody,
  GRADES,
  onsetChance,
  onsetFactor,
  playerInjuryValue,
  type Sufferer,
  stageDef,
  stepBody,
  storyFlags,
  validateAilmentsSlice,
  wearDelta,
  weeklyChange,
} from '../src/systems/ailments';
import { unitOf } from '../src/systems/combat';
import { addItem } from '../src/systems/inventory';
import { WAKE_HOUR } from '../src/systems/travel';
import {
  body,
  COURT,
  content,
  DEPTHS,
  events,
  flags,
  game,
  lastResult,
  SPRING,
  skipHours,
  TOWN,
  teleport,
  withCtx,
  withHotSpot,
} from './ailments_harness';

const CFG = content().ailmentsConfig as AilmentsConfig;
const DAY = 24;

function hoursAt(grade: number, n = DAY): number[] {
  const h = new Array<number>(GRADES).fill(0);
  h[grade] = n;
  return h;
}

/** A body with the given taint and stage. */
function sick(taint: number, stage: Sufferer['stage'] = 'none'): Sufferer {
  return { ...freshBody(), taint, stage };
}

const NO = { day: 10, worn: [], tier: 0, frail: false };

/** Script-sourced command, the way the story and the kernel give them. */
const SCRIPT = { type: 'script', script: 'test' } as const;

function auras(g: ReturnType<typeof game>): string[] {
  return (unitOf(g.world, 'player')?.auras ?? []).map((a) => a.id);
}

/** Put the player's body in a state directly (test setup only). */
function setBody(g: ReturnType<typeof game>, patch: Partial<Sufferer>): void {
  withCtx(g, (ctx) => {
    const s = ctx.world.slices.ailments;
    const b = s.bodies.player ?? freshBody();
    s.bodies.player = { ...b, ...patch };
  });
}

// ---------------------------------------------------------------------------

describe('taint arithmetic (progression 9.1, 9.2)', () => {
  it('a whole day at each canon grade drifts by the design rate', () => {
    expect(CFG.perGrade).toEqual([-2, -0.3, 0.2, 1, 3, 10, 10]);
    const rates = [-2, -0.3, 0.2, 1, 3, 10, 10];
    for (let g = 0; g < GRADES; g++)
      expect(exposureDelta(CFG, hoursAt(g))).toBeCloseTo(rates[g] as number, 10);
    // half a day at the depths and half in the court
    const mixed = new Array<number>(GRADES).fill(0);
    mixed[3] = 12;
    mixed[0] = 12;
    expect(exposureDelta(CFG, mixed)).toBeCloseTo(-0.5, 10);
  });

  it('a purified pattern shrinks the gains in sediment, never the drift down', () => {
    expect(exposureDelta(CFG, hoursAt(3), 0.2)).toBeCloseTo(0.8, 10);
    expect(exposureDelta(CFG, hoursAt(4), 0.3)).toBeCloseTo(2.1, 10);
    expect(exposureDelta(CFG, hoursAt(1), 0.3)).toBeCloseTo(-0.3, 10);
    expect(exposureDelta(CFG, hoursAt(0), 0.3)).toBeCloseTo(-2, 10);
  });

  it('patterned gear adds a point per 10, 5 and 2 days a piece', () => {
    expect(wearDelta(CFG, ['light'])).toBeCloseTo(0.1, 10);
    expect(wearDelta(CFG, ['mid'])).toBeCloseTo(0.2, 10);
    expect(wearDelta(CFG, ['heavy', 'heavy'])).toBeCloseTo(1, 10);
    expect(wearDelta(CFG, [])).toBe(0);
  });

  it('the daily onset chances are the table of 9.2', () => {
    const spot = stageDef(CFG, 'spot');
    const fever = stageDef(CFG, 'fever');
    const crystal = stageDef(CFG, 'crystal');
    if (!spot || !fever || !crystal) throw new Error('stages missing');
    const rows: [number, number, number, number][] = [
      [19, 0, 0, 0],
      [20, 0.005, 0, 0],
      [30, 0.055, 0, 0],
      [45, 0.13, 0.006, 0],
      [60, 0.15, 0.096, 0],
      [75, 0.15, 0.186, 0.01],
      [90, 0.15, 0.2, 0.16],
    ];
    for (const [t, s, f, c] of rows) {
      expect(onsetChance(spot, t), `spot ${t}`).toBeCloseTo(s, 10);
      expect(onsetChance(fever, t), `fever ${t}`).toBeCloseTo(f, 10);
      expect(onsetChance(crystal, t), `crystal ${t}`).toBeCloseTo(c, 10);
    }
  });

  it('each rank above the first mortal rank takes 30% off; the frail take half again', () => {
    expect(onsetFactor(CFG, 0, false)).toBe(1);
    expect(onsetFactor(CFG, 1, false)).toBeCloseTo(0.7, 10);
    expect(onsetFactor(CFG, 3, false)).toBeCloseTo(0.343, 10);
    expect(onsetFactor(CFG, 0, true)).toBeCloseTo(1.5, 10);
    expect(onsetFactor(CFG, 2, true)).toBeCloseTo(0.735, 10);
  });
});

describe('the dawn check of one body', () => {
  it('rolls only for the next stage, and draws only when its chance is above 0', () => {
    const cases: [Sufferer, number][] = [
      [sick(10), 0], // under 20: no spot chance
      [sick(30, 'spot'), 0], // spot held, fever needs 45
      [sick(50, 'spot'), 1], // fever roll
      [sick(30), 1], // spot roll
      [sick(99, 'crystal'), 0], // nothing past crystal
    ];
    for (const [b, draws] of cases) {
      let n = 0;
      stepBody(CFG, b, NO, () => {
        n++;
        return 0.999;
      });
      expect(n, `${b.stage} at ${b.taint}`).toBe(draws);
    }
  });

  it('falls ill when the roll is under the chance, one stage a day', () => {
    const b = sick(60, 'spot');
    const r = stepBody(CFG, b, NO, () => 0.095);
    expect(r).toMatchObject({ from: 'spot', stage: 'fever', onset: true });
    expect(b.since).toBe(NO.day);
    const c = sick(60, 'spot');
    expect(stepBody(CFG, c, NO, () => 0.097).stage).toBe('spot');
    // even a roll of 0 moves only one stage
    const d = sick(95);
    expect(stepBody(CFG, d, NO, () => 0).stage).toBe('spot');
  });

  it('the day exposure goes on before the roll and the hour counts reset', () => {
    const b = sick(19.5);
    b.hours = hoursAt(3);
    let p = -1;
    const r = stepBody(CFG, b, NO, () => {
      p = 1;
      return 0.999;
    });
    expect(r.taint).toBe(20.5);
    expect(r.delta).toBe(1);
    expect(p).toBe(1);
    expect(b.hours.every((h) => h === 0)).toBe(true);
  });

  it('the spot heals after three dawns under 15; a rise above resets the count', () => {
    const b = sick(16, 'spot');
    b.hours = hoursAt(0, 12); // -1: 15, not under
    stepBody(CFG, b, { ...NO, day: 1 }, () => 0.999);
    expect(b.low).toBe(-1);
    b.hours = hoursAt(0, 12); // 14
    stepBody(CFG, b, { ...NO, day: 2 }, () => 0.999);
    expect(b.low).toBe(2);
    stepBody(CFG, b, { ...NO, day: 3 }, () => 0.999);
    stepBody(CFG, b, { ...NO, day: 4 }, () => 0.999);
    expect(b.stage).toBe('spot');
    const r = stepBody(CFG, b, { ...NO, day: 5 }, () => 0.999);
    expect(r).toMatchObject({ from: 'spot', stage: 'none', healed: true });
    // a climb back over the line restarts the count
    const c = sick(14, 'spot');
    stepBody(CFG, c, { ...NO, day: 1 }, () => 0.999);
    c.taint = 15;
    stepBody(CFG, c, { ...NO, day: 2 }, () => 0.999);
    expect(c.low).toBe(-1);
  });

  it('fever and crystallisation never heal by themselves', () => {
    for (const stage of ['fever', 'crystal'] as const) {
      const b = sick(0, stage);
      for (let day = 1; day < 30; day++) stepBody(CFG, b, { ...NO, day }, () => 0.999);
      expect(b.stage).toBe(stage);
    }
  });

  it('a cure item treats only the stages it names', () => {
    expect(cureSteps(undefined, 'fever')).toBe(1);
    expect(cureSteps({ treats: ['spot'] }, 'fever')).toBe(0);
    expect(cureSteps({ treats: ['spot'] }, 'spot')).toBe(1);
    expect(cureSteps({ treats: ['crystal'], down: 1 }, 'crystal')).toBe(1);
    expect(cureSteps({ down: 'all' }, 'crystal')).toBe(3);
    expect(cureSteps({}, 'none')).toBe(0);
  });

  it('a cure brings the stage down, never below healthy', () => {
    const b = sick(50, 'crystal');
    expect(cureBody(b, 1, 3)).toBe('crystal');
    expect(b.stage).toBe('fever');
    cureBody(b, 5, 4);
    expect(b).toMatchObject({ stage: 'none', since: -1 });
  });

  it("the player's crystallisation leaves the body at fever and blocks the door", () => {
    expect(bodyAuraStage(CFG, 'crystal', true)).toBe('fever');
    expect(bodyAuraStage(CFG, 'crystal', false)).toBe('crystal');
    expect(bodyAuraStage(CFG, 'spot', true)).toBe('spot');
    const day = {
      delta: 0,
      taint: 80,
      from: 'fever',
      stage: 'crystal',
      onset: true,
      healed: false,
    } as const;
    expect(crystalBlockage(CFG, day)).toBe(10);
    expect(crystalBlockage(CFG, { ...day, from: 'crystal', onset: false })).toBe(2);
    expect(crystalBlockage(CFG, { ...day, stage: 'fever' })).toBe(0);
  });

  it('the player injury mirror shows a limb above a light wound', () => {
    expect(playerInjuryValue(CFG, [])).toBe('none');
    expect(playerInjuryValue(CFG, ['light'])).toBe('minor');
    expect(playerInjuryValue(CFG, ['light', 'maimed_leg'])).toBe('limb');
  });
});

// ---------------------------------------------------------------------------

describe('exposure in the game', () => {
  it('a day at the dense depths adds one point; the mirror shows it rounded down', () => {
    const g = game(DEPTHS);
    skipHours(g, DAY);
    expect(body(g)?.taint).toBe(1);
    expect(flags(g)['player.taint']).toBe(1);
    const daily = events(g, 'ailments.daily').filter((e) => e.data.entityId === 'player');
    expect(daily.at(-1)?.data).toMatchObject({ taint: 1, delta: 1, stage: 'none' });
  });

  it('a hot spot on a location counts instead of the map grade (sedimentAt)', () => {
    const hot = withHotSpot('borderstone', 'north_spring', 4);
    const atSpring = game(SPRING, { content: hot });
    const inTown = game(TOWN, { content: hot });
    for (const g of [atSpring, inTown]) g.queue('ailments.taint', { amount: 10 }, SCRIPT);
    skipHours(atSpring, DAY);
    skipHours(inTown, DAY);
    expect(body(atSpring)?.taint).toBe(13); // deep: +3
    expect(body(inTown)?.taint).toBe(9.7); // the town around it stays thin: -0.3
  });

  it('the clear inner court washes two points a day; taint never goes under 0', () => {
    const g = game(COURT);
    g.queue('ailments.taint', { amount: 5 }, SCRIPT);
    skipHours(g, DAY);
    expect(body(g)?.taint).toBe(3);
    skipHours(g, 2 * DAY);
    expect(body(g)?.taint).toBe(0);
  });

  it('the hours split between places count each at its own grade', () => {
    const g = game(COURT);
    g.queue('ailments.taint', { amount: 10 }, SCRIPT);
    skipHours(g, 12);
    teleport(g, DEPTHS);
    skipHours(g, 12);
    // 12 hours of court (-1) and 12 of depths (+0.5) at the dawn between
    const daily = events(g, 'ailments.daily').filter((e) => e.data.entityId === 'player');
    expect(daily.at(-1)?.data.delta).toBe(-0.5);
  });

  it('only the dawn check moves the taint; the hours before it only count', () => {
    const g = game(DEPTHS);
    skipHours(g, 20);
    expect(body(g)?.taint).toBe(0);
    expect(body(g)?.hours[3]).toBe(20);
  });
});

describe('sickness in the game', () => {
  it('an onset puts the state aura on, the mirror and the event follow', () => {
    const g = game(DEPTHS, { seed: 5 });
    g.queue('ailments.taint', { amount: 60 }, SCRIPT);
    g.step(1);
    let days = 0;
    while (body(g)?.stage === 'none' && days++ < 40) skipHours(g, DAY);
    expect(body(g)?.stage).toBe('spot');
    expect(auras(g)).toContain('aur_st_sed_spot');
    expect(flags(g)['player.sed_stage']).toBe('spot');
    const ev = events(g, 'ailments.stage').at(-1)?.data;
    expect(ev).toMatchObject({ entityId: 'player', from: 'none', stage: 'spot', cause: 'onset' });
  });

  it('a cure that names no whole number of stages is refused and changes nothing', () => {
    const g = game(TOWN);
    setBody(g, { taint: 30, stage: 'fever', since: 0 });
    for (const stages of [0, Number.NaN, 'x' as unknown as number]) {
      g.queue('ailments.cure', { stages }, SCRIPT);
      g.step(1);
      expect(lastResult(g, 'ailments.cure')?.ok).toBe(false);
    }
    expect(body(g)?.stage).toBe('fever');
  });

  it('the spot heals by itself in game: the aura comes off and the event says so', () => {
    const g = game(COURT);
    setBody(g, { taint: 14, stage: 'spot', since: 0 });
    skipHours(g, DAY);
    expect(auras(g)).toContain('aur_st_sed_spot');
    skipHours(g, 3 * DAY);
    expect(body(g)?.stage).toBe('none');
    expect(auras(g)).not.toContain('aur_st_sed_spot');
    expect(events(g, 'ailments.stage').at(-1)?.data).toMatchObject({
      from: 'spot',
      stage: 'none',
      cause: 'self_heal',
    });
  });

  it('two taint changes in one tick keep the fraction (a stale mirror event is ignored)', () => {
    const g = game(TOWN);
    g.queue('ailments.taint', { amount: 10.6 }, SCRIPT);
    g.queue('ailments.taint', { amount: 0.7 }, SCRIPT);
    g.step(2);
    expect(body(g)?.taint).toBe(11.3);
    expect(flags(g)['player.taint']).toBe(11);
  });

  it('a cure from the story takes the aura off; a player-sourced cure is refused', () => {
    const g = game(TOWN);
    setBody(g, { taint: 30, stage: 'fever', since: 0 });
    g.queue('ailments.cure', {}, { type: 'player' });
    g.step(1);
    expect(lastResult(g, 'ailments.cure')?.ok).toBe(false);
    g.queue('ailments.cure', {}, SCRIPT);
    g.step(1);
    expect(body(g)?.stage).toBe('spot');
    g.queue('ailments.cure', { stages: 3 }, SCRIPT);
    g.step(1);
    expect(body(g)?.stage).toBe('none');
    expect(auras(g).filter((a) => a.startsWith('aur_st_sed_'))).toEqual([]);
    expect(flags(g)['player.sed_stage']).toBe('none');
    expect(events(g, 'ailments.stage').at(-1)?.data.cause).toBe('cure');
    g.queue('ailments.cure', {}, SCRIPT);
    g.step(1);
    expect(lastResult(g, 'ailments.cure')?.ok).toBe(false);
  });

  it('consumables read their own definition: a dose of taint, a cure for named stages', () => {
    const base = content();
    const item = (id: string, use: Record<string, unknown>) => ({
      id,
      name: id,
      kind: 'consumable',
      quality: 1,
      value: 1,
      desc: id,
      use,
    });
    const items = [
      item('zz_potion', { effect: 'heal', amount: 90, taint: 0.2 }),
      item('zz_salve', { effect: 'sed_cure', amount: -8, sed: { treats: ['spot'] } }),
      item('zz_draught', { effect: 'sed_cure', amount: -12, sed: { treats: ['fever'] } }),
    ];
    const g = game(TOWN, { content: { ...base, items: [...base.items, ...items] } as ContentMap });
    setBody(g, { taint: 50, stage: 'fever', since: 0 });
    const use = (itemId: string, effect: string, amount: number) =>
      withCtx(g, (ctx) => ctx.emit('item.used', { ownerId: 'player', itemId, effect, amount }));
    use('zz_potion', 'heal', 90);
    expect(body(g)?.taint).toBe(50.2);
    use('zz_salve', 'sed_cure', -8);
    expect(body(g)).toMatchObject({ taint: 42.2, stage: 'fever' });
    use('zz_draught', 'sed_cure', -12);
    expect(body(g)).toMatchObject({ taint: 30.2, stage: 'spot' });
    use('zz_salve', 'sed_cure', -8);
    expect(body(g)).toMatchObject({ taint: 22.2, stage: 'none' });
    // a cure taken before its timer ran out does nothing but leave the poison's taint
    setBody(g, { stage: 'fever', since: 0 });
    withCtx(g, (ctx) =>
      ctx.emit('item.used', {
        ownerId: 'player',
        itemId: 'zz_draught',
        effect: 'sed_cure',
        amount: -12,
        early: true,
      }),
    );
    expect(body(g)).toMatchObject({ taint: 22.2 + CFG.earlyTaint, stage: 'fever' });
    expect(CFG.earlyTaint).toBe(2);
  });

  it('consumables: the taint effect adds or takes taint, sed_cure brings a stage down', () => {
    const g = game(TOWN);
    setBody(g, { taint: 20, stage: 'spot', since: 0 });
    withCtx(g, (ctx) => {
      ctx.emit('item.used', { ownerId: 'player', itemId: 'x', effect: 'taint', amount: -8 });
      ctx.emit('item.used', { ownerId: 'player', itemId: 'y', effect: 'sed_cure' });
    });
    expect(body(g)).toMatchObject({ taint: 12, stage: 'none' });
    expect(flags(g)['player.taint']).toBe(12);
  });

  it('a written player.taint becomes the body taint, and the doors take a quarter as blockage', () => {
    const g = game(TOWN);
    g.queue('flag.set', { key: 'player.taint', value: 40 });
    g.step(2);
    expect(body(g)?.taint).toBe(40);
    expect(flags(g).blockage).toBe(10);
    // the mirror the system writes itself does not loop back
    skipHours(g, DAY);
    expect(body(g)?.taint).toBe(39.7);
    expect(flags(g)['player.taint']).toBe(39);
  });

  it("the player's crystallisation adds 10 blockage on its day and 2 every later dawn", () => {
    const g = game(TOWN, { seed: 3 });
    // the taint goes on through the port first, so its blockage is booked before the count
    g.queue('ailments.taint', { amount: 95 }, SCRIPT);
    g.step(1);
    setBody(g, { stage: 'fever', since: 0 });
    let days = 0;
    let before = 0;
    while (body(g)?.stage === 'fever' && days++ < 60) {
      before = Number(flags(g).blockage ?? 0);
      skipHours(g, DAY);
    }
    expect(body(g)?.stage).toBe('crystal');
    // the town is thin: the taint falls, so the doors add nothing for it
    expect(Number(flags(g).blockage) - before).toBe(10);
    expect(flags(g)['player.sed_stage']).toBe('crystal');
    // the body keeps the fever's aura; the crystal works on the door
    expect(auras(g)).toContain('aur_st_sed_fever');
    expect(auras(g)).not.toContain('aur_st_sed_crystal');
    const now = Number(flags(g).blockage);
    skipHours(g, DAY);
    expect(Number(flags(g).blockage) - now).toBe(2);
  });

  it('a state aura the unit lost is put back at the next dawn', () => {
    const g = game(TOWN);
    setBody(g, { taint: 30, stage: 'spot', since: 0 });
    skipHours(g, DAY);
    expect(auras(g)).toContain('aur_st_sed_spot');
  });
});

describe('worn gear in game (catalog_equipment 2.6)', () => {
  const coat = (id: string, sed: Record<string, unknown>) => ({
    id,
    name: id,
    kind: 'armor',
    quality: 1,
    value: 1,
    desc: id,
    slot: 'chest',
    sed,
  });
  const dressed = (itemId: string) => {
    const base = content();
    const items = [
      coat('zz_wolf_coat', { grade: 'heavy' }),
      coat('zz_washed_coat', { grade: 'mid', purified: true }),
    ];
    const g = game(DEPTHS, {
      content: { ...base, items: [...base.items, ...items] } as ContentMap,
    });
    withCtx(g, (ctx) => {
      addItem(ctx, 'player', itemId, 1);
    });
    g.queue('inventory.equip', { ownerId: 'player', itemId });
    g.step(1);
    expect(lastResult(g, 'inventory.equip')?.ok, itemId).toBe(true);
    return g;
  };

  it('an unpurified patterned piece adds its wear at every dawn', () => {
    const g = dressed('zz_wolf_coat');
    skipHours(g, DAY);
    // a day at the dense depths (+1) and a heavy piece (+0.5)
    expect(body(g)?.taint).toBe(1.5);
  });

  it('a purified piece takes its share off the gain instead', () => {
    const g = dressed('zz_washed_coat');
    skipHours(g, DAY);
    expect(body(g)?.taint).toBe(0.8);
  });
});

describe('bodies besides the player', () => {
  const monster = (g: ReturnType<typeof game>) => {
    const ids = Object.values(g.world.slices.world.entities)
      .filter((e) => e.kind === 'monster' && e.alive)
      .map((e) => e.id)
      .sort();
    const id = ids[0];
    if (!id) throw new Error('no monster in the world');
    return id;
  };

  it('take every injury, roll a relapse with a backlash on their own stream, and drop when healthy', () => {
    const g = game(DEPTHS, { seed: 4 });
    const id = monster(g);
    g.queue('ailments.injure', { entityId: id, kind: 'backlash' }, SCRIPT);
    g.step(1);
    expect(lastResult(g, 'ailments.injure')?.ok).toBe(true);
    expect(body(g, id)?.injuries.map((i) => i.kind)).toContain('backlash');
    expect(g.world.rng['sed.injury']).toBeDefined();
    expect(flags(g)['player.injury']).toBeUndefined();
    // in the clear court its body drifts back to nothing and is no longer tracked
    g.queue('world.teleport', { entityId: id, mapId: COURT.map, x: COURT.x, y: COURT.y });
    g.queue('ailments.heal', { entityId: id }, SCRIPT);
    g.step(1);
    expect(body(g, id)?.injuries).toEqual([]);
    skipHours(g, DAY);
    expect(body(g, id)).toBeUndefined();
  });

  it('a crystallised body other than the player is due after the crystal days', () => {
    const g = game(TOWN, { seed: 4 });
    const id = monster(g);
    withCtx(g, (ctx) => {
      ctx.world.slices.ailments.bodies[id] = {
        ...freshBody(),
        taint: 80,
        stage: 'crystal',
        since: 1 - CFG.crystalDays,
      };
    });
    skipHours(g, DAY);
    const due = events(g, 'ailments.crystal_due');
    expect(due.map((e) => e.data)).toEqual([{ entityId: id, days: CFG.crystalDays }]);
  });
});

describe('injuries (progression 10)', () => {
  it('a light wound lowers the mirror to minor and heals by itself after three days', () => {
    const g = game(TOWN);
    g.queue('ailments.injure', { kind: 'light' }, SCRIPT);
    g.step(1);
    expect(auras(g)).toContain('aur_st_injury_light');
    expect(flags(g)['player.injury']).toBe('minor');
    skipHours(g, 3 * DAY - 2);
    expect(body(g)?.injuries.map((i) => i.kind)).toEqual(['light']);
    skipHours(g, 3);
    expect(body(g)?.injuries).toEqual([]);
    expect(auras(g)).not.toContain('aur_st_injury_light');
    expect(flags(g)['player.injury']).toBe('none');
    expect(events(g, 'ailments.injury').map((e) => e.data.op)).toEqual(['added', 'healed']);
  });

  it('a maimed limb lasts until it is treated, and shows as limb', () => {
    const g = game(TOWN);
    g.queue('ailments.injure', { kind: 'maimed_leg' }, SCRIPT);
    g.queue('ailments.injure', { kind: 'light' }, SCRIPT);
    g.step(1);
    expect(flags(g)['player.injury']).toBe('limb');
    skipHours(g, 10 * DAY);
    expect(body(g)?.injuries.map((i) => i.kind)).toEqual(['maimed_leg']);
    g.queue('ailments.heal', { kind: 'maimed_leg' }, SCRIPT);
    g.step(1);
    expect(body(g)?.injuries).toEqual([]);
    expect(flags(g)['player.injury']).toBe('none');
  });

  it('the player only takes the light wound and the maimed limbs', () => {
    const g = game(TOWN);
    for (const kind of ['backlash', 'relapse'] as const) {
      g.queue('ailments.injure', { kind }, SCRIPT);
      g.step(1);
      expect(lastResult(g, 'ailments.injure')?.ok, kind).toBe(false);
    }
    g.queue('ailments.injure', { kind: 'light' }, { type: 'player' });
    g.step(1);
    expect(lastResult(g, 'ailments.injure')?.ok).toBe(false);
    expect(body(g)?.injuries ?? []).toEqual([]);
  });

  it('being remade in the court heals every injury and keeps the taint', () => {
    const g = game(TOWN);
    g.queue('ailments.taint', { amount: 25 }, SCRIPT);
    g.queue('ailments.injure', { kind: 'maimed_arm' }, SCRIPT);
    g.step(1);
    withCtx(g, (ctx) => {
      ctx.emit('combat.player_returned', {
        fromMap: 'borderstone',
        x: 1,
        y: 1,
        toMap: 'inner_court',
        toX: 1,
        toY: 1,
        innerCourt: true,
        moneyLost: 0,
        fatigueMinutes: 0,
      } as never);
    });
    expect(body(g)?.injuries).toEqual([]);
    expect(body(g)?.taint).toBe(25);
    expect(flags(g)['player.injury']).toBe('none');
  });
});

describe('time skip', () => {
  it('a long skip settles the same dawn, rolls and injuries as ticking through the hours', () => {
    const seen = new Map<object, { tick: number; kind: string; data: unknown }[]>();
    const setup = () => {
      const g = game(DEPTHS, { seed: 21 });
      const log: { tick: number; kind: string; data: unknown }[] = [];
      seen.set(g, log);
      g.onEvents((evs) => {
        for (const e of evs)
          if (e.kind.startsWith('ailments.'))
            log.push({ tick: e.tick, kind: e.kind, data: e.data });
      });
      setBody(g, { taint: 70, stage: 'spot', since: 0 });
      g.queue('ailments.injure', { kind: 'light', days: 0.5 }, SCRIPT);
      g.step(1);
      return g;
    };
    const ticked = setup();
    const skipped = setup();
    const start = ticked.tick;
    expect(skipped.tick).toBe(start);
    skipHours(skipped, 30);
    ticked.step(skipped.tick - start);
    expect(ticked.tick).toBe(skipped.tick);
    expect(body(skipped)).toEqual(body(ticked));
    // the dawn rolled for the fever (taint 71 with the spot): the stream moved in both
    expect(skipped.world.rng['sed.daily']).toBeDefined();
    expect(skipped.world.rng['sed.daily']).toEqual(ticked.world.rng['sed.daily']);
    const log = seen.get(ticked) ?? [];
    expect(seen.get(skipped)).toEqual(log);
    // the window held a dawn with its roll and the injury's end
    expect(log.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['ailments.daily', 'ailments.injury']),
    );
    expect(flags(skipped)['player.taint']).toBe(flags(ticked)['player.taint']);
  }, 30000);
});

// ---------------------------------------------------------------------------

describe("the town's sediment track and the children (act 1 7.2)", () => {
  const week = (g: ReturnType<typeof game>, n: number) => {
    g.queue('flag.set', { key: 'act_week', value: n });
    g.step(2);
  };

  it('starts at 15 in week 1 and rises 8 a week while the spring runs', () => {
    const g = game(TOWN);
    week(g, 1);
    expect(flags(g).a1_town_dian).toBe(15);
    week(g, 2);
    expect(flags(g).a1_town_dian).toBe(23);
    week(g, 4); // two weeks at once
    expect(flags(g).a1_town_dian).toBe(39);
  });

  it('a blocked culvert slows it to 3 a week, a boarded spring stops it; writes stay', () => {
    const g = game(TOWN);
    week(g, 1);
    g.queue('flag.set', { key: 'a1_culvert_sealed', value: true });
    g.queue('flag.set', { key: 'a1_town_dian', value: 5 }); // the quest's -20 and more
    g.step(2);
    week(g, 2);
    expect(flags(g).a1_town_dian).toBe(8);
    g.queue('flag.set', { key: 'a1_north_spring_boarded', value: true });
    g.step(2);
    week(g, 3);
    expect(flags(g).a1_town_dian).toBe(8);
    expect(weeklyChange(content().sedimentTracks[0] as never, () => false)).toBe(8);
  });

  it('the track only runs in its act', () => {
    const g = game(TOWN);
    g.queue('flag.set', { key: 'act', value: 'act2' });
    g.step(2);
    week(g, 1);
    week(g, 3);
    expect(flags(g).a1_town_dian).toBeUndefined();
  });

  it('Milo falls ill at the fall and worsens in week 2', () => {
    const g = game(TOWN);
    g.step(1);
    expect(flags(g)['sed_case.milo']).toBe('fever');
    week(g, 2);
    expect(flags(g)['sed_case.milo']).toBe('crystal');
  });

  it('Toby falls in week 6 and turns grave after week 8 unless he is cured', () => {
    const g = game(TOWN);
    week(g, 5);
    expect(flags(g)['sed_case.toby']).toBeUndefined();
    week(g, 6);
    expect(flags(g)['sed_case.toby']).toBe('fever');
    week(g, 9);
    expect(flags(g)['sed_case.toby']).toBe('crystal');
    const saved = game(TOWN);
    week(saved, 6);
    saved.queue('flag.set', { key: 'a1_toby_state', value: 'recovered' });
    saved.step(2);
    expect(flags(saved)['sed_case.toby']).toBe('cured');
    week(saved, 9);
    expect(flags(saved)['sed_case.toby']).toBe('cured');
    const ev = events(saved, 'ailments.case').filter((e) => e.data.caseId === 'toby');
    expect(ev.map((e) => e.data.stage)).toEqual(['fever', 'cured']);
  });

  it('Lin falls ill in week 9 only when the town is at 60 and the orphanage drinks the spring', () => {
    const run = (mill: boolean) => {
      const g = game(TOWN);
      week(g, 1);
      week(g, 8); // 15 + 7 x 8 = 71
      if (mill) {
        g.queue('flag.set', { key: 'a1_mill_owner', value: 'orphanage' });
        g.step(2);
      }
      week(g, 9);
      return g;
    };
    const lin = run(false);
    expect(flags(lin).a1_town_dian).toBe(79);
    expect(flags(lin)['sed_case.lin']).toBe('fever');
    expect(flags(run(true))['sed_case.lin']).toBeUndefined();
  });

  it('only the flags the hooks read wake them', () => {
    const watched = storyFlags(content());
    for (const name of ['act', 'act_week', 'a1_town_dian', 'a1_culvert_sealed', 'a1_toby_state'])
      expect(watched.has(name), name).toBe(true);
    expect(watched.has('blockage')).toBe(false);
    expect(watched.has('sed_case.toby')).toBe(false);
    const g = game(TOWN);
    g.step(2);
    expect(g.world.slices.ailments.dirty).toBe(false);
    g.queue('flag.set', { key: 'seal_unrest', value: 12 });
    g.step(1);
    expect(g.world.slices.ailments.dirty).toBe(false);
  });

  it('a cure counts only once the case fell ill, and nothing moves back', () => {
    const def = {
      id: 'k',
      act: 'act1',
      steps: [{ when: 'a', stage: 'fever' as const }],
      cure: { when: 'c' },
    };
    const holds = (set: string[]) => (w: string) => set.includes(w);
    expect(caseStageNow(def, 'none', holds(['c']))).toBe('none');
    // a cure that already holds when the case falls ill settles in the same pass
    expect(caseStageNow(def, 'none', holds(['a', 'c']))).toBe('cured');
    expect(caseStageNow(def, 'none', holds(['a']))).toBe('fever');
    expect(caseStageNow(def, 'fever', holds(['c']))).toBe('cured');
    expect(caseStageNow(def, 'cured', holds(['a']))).toBe('cured');
  });
});

describe('data, save and gauge', () => {
  it('the shipped ailments data is valid', () => {
    expect(validateAilments(content())).toEqual([]);
  });

  it('the validator catches a missing aura, misordered stages and an unknown variable', () => {
    const base = content();
    const cfg = structuredClone(base.ailmentsConfig);
    cfg.stages = [cfg.stages[1], cfg.stages[0], cfg.stages[2]] as typeof cfg.stages;
    (cfg.injuries[0] as { aura: string }).aura = 'aur_nope';
    const tracks = [{ ...base.sedimentTracks[0], var: 'no_such_var' }] as never;
    const cases = [{ id: 'x', act: 'act1', steps: [{ when: 'act ==', stage: 'fever' }] }] as never;
    const problems = validateAilments({
      ...base,
      ailmentsConfig: cfg,
      sedimentTracks: tracks,
      sedCases: cases,
    } as ContentMap);
    expect(problems.some((p) => p.includes('stages must be'))).toBe(true);
    expect(problems.some((p) => p.includes('unknown aura aur_nope'))).toBe(true);
    expect(problems.some((p) => p.includes('no_such_var is not registered'))).toBe(true);
    expect(problems.some((p) => p.startsWith('sedCases x step 0'))).toBe(true);
  });

  it('every stage and injury aura is a permanent, undispellable state', () => {
    const auras = new Map(content().auras.map((a) => [a.id, a]));
    const ids = [...CFG.stages.map((s) => s.aura), ...CFG.injuries.map((i) => i.aura)];
    expect(ids).toHaveLength(8);
    for (const id of ids) {
      const a = auras.get(id);
      expect(a, id).toBeDefined();
      expect(a?.duration, id).toBe(0);
      expect(a?.dispellable, id).toBe(false);
      expect(a?.kind, id).toBe('debuff');
    }
  });

  it('the slice of a running game passes the save check; a broken one does not', () => {
    const g = game(DEPTHS);
    g.queue('ailments.injure', { kind: 'light' }, SCRIPT);
    skipHours(g, DAY);
    expect(validateAilmentsSlice(g.world.slices.ailments)).toEqual([]);
    expect(validateAilmentsSlice(undefined)).toEqual([]);
    const bad = structuredClone(g.world.slices.ailments) as unknown as Record<string, unknown>;
    (bad.bodies as Record<string, Record<string, unknown>>).player.stage = 'grey';
    bad.checked = 'x';
    expect(validateAilmentsSlice(bad)).toEqual([
      'ailments.bodies.player.stage is unknown',
      'ailments.checked is not a day',
    ]);
  });

  it('the dawn check is the hour a sleeper wakes ("或睡醒时", 9.2)', () => {
    expect(CFG.checkHour).toBe(WAKE_HOUR);
  });

  it('the gauge view shows the taint, the thresholds, the stage and the injuries', () => {
    const g = game(TOWN);
    setBody(g, { taint: 47.25, stage: 'spot', since: 0 });
    g.queue('ailments.injure', { kind: 'light' }, SCRIPT);
    g.step(1);
    const view = ailmentGauge(g.world, g.content);
    expect(view).toMatchObject({
      taint: 47.3,
      max: 100,
      thresholds: [20, 45, 75],
      stage: 'spot',
      blocking: false,
    });
    expect(view?.injuries.map((i) => i.kind)).toEqual(['light']);
    expect(view?.injuries[0]?.until).toBe(g.tick + 3 * TICKS_PER_GAME_DAY);
    expect(ailmentGauge(g.world, {} as ContentMap)).toBeNull();
  });
});
