// The tide night's tables, row by row (PK-M1-52; act1_borderstone.md 8.3 to 8.7): every row of
// the NPC action table (8.4) is picked by its own state and adds exactly what the table says;
// the striker's four cases (8.5); every rule and output of the settlement (8.6); the credit
// versions (8.7). Pure: the shipped night record of data/tide/nights.json, driven through the
// functions of src/systems/tide/rules.ts with a fixed flag map and scripted dice.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import type { FlagValue } from '../src/core/contracts';
import { evaluate, flagResolver } from '../src/systems/quests/conditions';
import {
  activeLines,
  callBonus,
  casualtyFactor,
  childrenShelter,
  civilianDeaths,
  creditVersion,
  damagedBuilding,
  gapOf,
  holders,
  legalRows,
  lineDefence,
  linePressure,
  namedFate,
  type PhaseInput,
  pickAll,
  pickRows,
  population,
  postedWitnesses,
  prosperityAfter,
  settlePhase,
  sharedLine,
  slopeDelayed,
  slopeFactor,
  surgeOutcome,
  survivalBand,
  trustChanges,
  weakestFace,
} from '../src/systems/tide/rules';
import type { ActorRowDef, LineDef, PhaseDef, TideNightDef } from '../src/systems/tide/types';

const CONTENT = buildContent();
const DEF = (CONTENT.tideNights ?? [])[0] as TideNightDef;

type Flags = Record<string, FlagValue>;

const holdsOf = (flags: Flags) => {
  const r = flagResolver(flags);
  return (expr: string) => evaluate(expr, r);
};
const phase = (id: string) => DEF.phases.find((p) => p.id === id) as PhaseDef;
const line = (id: string) => DEF.lines.find((l) => l.id === id) as LineDef;
const actor = (id: string) => {
  const a = DEF.actors.find((x) => x.id === id);
  if (!a) throw new Error(`no actor ${id}`);
  return a;
};
const never = () => false;

/** The row ids an actor acts on under a state (additive rows first). */
function picked(flags: Flags, who: string, dead: string[] = []): string[] {
  const p = pickAll(DEF, holdsOf(flags), (n) => dead.includes(n)).find((x) => x.actor.id === who);
  return p ? p.rows.map((r) => r.id) : [];
}

function input(
  flags: Flags,
  ph: string,
  playerLine: string | null = null,
  weakest?: string,
  dead: string[] = [],
): PhaseInput {
  return {
    def: DEF,
    phase: phase(ph),
    picks: pickAll(DEF, holdsOf(flags), (n) => dead.includes(n)),
    holds: holdsOf(flags),
    playerLine,
    weakest,
  };
}

/** What one actor adds to a line in a phase. */
function adds(flags: Flags, who: string, ph: string, on: string, playerLine: string | null = null) {
  return holders(input(flags, ph, playerLine), on)
    .filter((h) => h.actor.id === who)
    .reduce((s, h) => s + h.defence, 0);
}

const rowOf = (who: string, id: string) => actor(who).rows.find((r) => r.id === id) as ActorRowDef;

// a dead-quiet town: nobody named in the way of the row under test
const BASE: Flags = { act: 'act1', act_week: 10 };
const at = (extra: Flags): Flags => ({ ...BASE, ...extra });

describe('8.4 the action table, row by row', () => {
  // 巴托与民兵
  it('Barto: A1-S21 done (family safe) or Moss exposed: holds the north gate to dawn, +25', () => {
    const ways: Flags[] = [{ a1_barto_family_safe: true }, { a1_moss_exposed: true }];
    // the A1-M11 goal that pairs Barto with Seg is not Barto's own reason (a band taken on)
    expect(picked(at({ 'a1_tide_prep.barto_seg': true, 'trust.barto': 0 }), 'barto')).toEqual([
      'withdraw',
    ]);
    for (const f of ways) {
      expect(picked(at(f), 'barto')).toEqual(['hold']);
      for (const ph of ['wave1', 'wave2', 'surge'])
        expect(adds(at(f), 'barto', ph, 'north')).toBe(25);
    }
  });
  it('Barto: trust 50 or more: holds to the end of the second beat, then shelters the chapel', () => {
    const f = at({ 'trust.barto': 50 });
    expect(picked(f, 'barto')).toEqual(['chapel']);
    expect(adds(f, 'barto', 'wave1', 'north')).toBe(25);
    expect(adds(f, 'barto', 'wave2', 'north')).toBe(25);
    expect(adds(f, 'barto', 'surge', 'north')).toBe(0);
    expect(rowOf('barto', 'chapel').shelter).toBe('chapel');
  });
  it('Barto: otherwise leaves after the first wave, +10 in it only', () => {
    const f = at({ 'trust.barto': 49 });
    expect(picked(f, 'barto')).toEqual(['withdraw']);
    expect(adds(f, 'barto', 'wave1', 'north')).toBe(10);
    expect(adds(f, 'barto', 'wave2', 'north')).toBe(0);
  });

  // 德里斯
  it('Dris: won and convinced: north +10 beside Barto, and lives (a wound at most)', () => {
    const f = at({ a1_dris_face: 'won' });
    expect(picked(f, 'dris')).toEqual(['shoulder']);
    expect(adds(f, 'dris', 'wave2', 'north')).toBe(10);
    const row = rowOf('dris', 'shoulder');
    expect(namedFate(DEF, row, 'dris', 'wave2', 99, () => true).fate).toBe('injured');
    expect(namedFate(DEF, row, 'dris', 'wave2', 99, () => false).fate).toBeNull();
  });
  it('Dris: let win: the east fence +10, dies with 50% once the gap reaches 20', () => {
    const f = at({ a1_dris_face: 'yielded' });
    expect(picked(f, 'dris')).toEqual(['prove']);
    expect(adds(f, 'dris', 'wave1', 'east')).toBe(10);
    const row = rowOf('dris', 'prove');
    const asked: number[] = [];
    const roll = (p: number) => {
      asked.push(p);
      return true;
    };
    expect(namedFate(DEF, row, 'dris', 'wave1', 20, roll).fate).toBe('dead');
    expect(asked[0]).toBe(0.5);
    expect(namedFate(DEF, row, 'dris', 'wave1', 19, () => true).fate).toBeNull();
  });
  it('Dris: no dealings: off to the colossus for glory; dies if the player comes later', () => {
    const f = at({});
    expect(picked(f, 'dris')).toEqual(['glory']);
    expect(adds(f, 'dris', 'wave1', 'east') + adds(f, 'dris', 'wave1', 'north')).toBe(0);
    const rule = rowOf('dris', 'glory').fate?.diesWhen;
    expect(rule?.phase).toBe('colossus');
    expect(holdsOf(at({ a1_colossus_target: 'children' }))(rule?.when ?? '')).toBe(true);
    expect(holdsOf(at({ a1_colossus_target: 'player' }))(rule?.when ?? '')).toBe(false);
  });

  // 瑟格与独眼团
  it('Seg and the One-Eyes: taken on: the south gate +15 and the west field +10', () => {
    const f = at({ a1_oneeye_fate: 'absorbed' });
    expect(picked(f, 'oneeye')).toEqual(['absorbed']);
    for (const ph of ['wave1', 'wave2', 'surge']) {
      expect(adds(f, 'oneeye', ph, 'south')).toBe(15);
      expect(adds(f, 'oneeye', ph, 'west')).toBe(10);
    }
    expect(rowOf('oneeye', 'absorbed').prosperity).toBe(5);
  });
  it('Seg and the One-Eyes: active after the counter-bite: off to settle with Moss, no part', () => {
    const f = at({ a1_oneeye_fate: 'active', a1_seg_turned: true });
    expect(picked(f, 'oneeye')).toEqual(['turned']);
    expect(adds(f, 'oneeye', 'wave2', 'south')).toBe(0);
  });
  it('Seg and the One-Eyes: active (default): Viro raids the company warehouse, south -5', () => {
    const f = at({ a1_oneeye_fate: 'active', a1_viro_status: 'in_band' });
    expect(picked(f, 'oneeye')).toEqual(['raid']);
    expect(adds(f, 'oneeye', 'wave2', 'south')).toBe(-5);
    expect(adds(f, 'oneeye', 'wave1', 'south')).toBe(0);
    expect(rowOf('oneeye', 'raid').loss).toBe('company');
    // the band's raid follows Viro: lying low at week 8, or gone from the band, no raid
    const low = at({
      a1_oneeye_fate: 'active',
      'dispute.q_a1_d01_tax_and_bandits.choice.viro_raid': 'lie_low',
    });
    expect(picked(low, 'oneeye')).toEqual(['watch']);
    expect(
      picked(at({ a1_oneeye_fate: 'active', a1_viro_status: 'fled_wallenburg' }), 'oneeye'),
    ).toEqual(['watch']);
  });
  it('Seg and the One-Eyes: destroyed or scattered: nothing', () => {
    expect(picked(at({ a1_oneeye_fate: 'destroyed' }), 'oneeye')).toEqual([]);
    expect(picked(at({ a1_oneeye_fate: 'scattered' }), 'oneeye')).toEqual([]);
  });

  // 莫斯
  it('Moss in_power: flees south in the second beat with the strongbox, south -10', () => {
    const f = at({ a1_moss_fate: 'in_power' });
    expect(picked(f, 'moss')).toEqual(['flee']);
    expect(adds(f, 'moss', 'wave1', 'south')).toBe(0);
    expect(adds(f, 'moss', 'wave2', 'south')).toBe(-10);
    expect(adds(f, 'moss', 'surge', 'south')).toBe(-10);
    // staying put (the dispute's own decision) keeps him in town
    const stay = at({
      a1_moss_fate: 'in_power',
      'dispute.q_a1_d01_tax_and_bandits.choice.moss_cart': 'stay_put',
    });
    expect(picked(stay, 'moss')).toEqual(['stay']);
  });
  it('Moss puppet: hides in the manor cellar; arrested: shouts in the cell; no part', () => {
    expect(picked(at({ a1_moss_fate: 'puppet' }), 'moss')).toEqual(['cellar']);
    expect(picked(at({ a1_moss_fate: 'arrested' }), 'moss')).toEqual(['cell']);
    expect(adds(at({ a1_moss_fate: 'puppet' }), 'moss', 'wave2', 'south')).toBe(0);
  });

  // 奈拉
  it('Nera partner (or her stock opened in A1-M11): town casualties -20%', () => {
    for (const f of [
      at({ 'npc.nera.stance': 'partner' }),
      at({ 'a1_tide_prep.nera_stock': true }),
      at({ 'a1_tide_prep.nera_stock': true, 'npc.nera.stance': 'bought' }),
    ]) {
      expect(legalRows(actor('nera'), holdsOf(f)).map((r) => r.id)).toEqual(['partner']);
      expect(picked(f, 'nera')).toEqual(['partner']);
      expect(rowOf('nera', 'partner').casualty).toBe(0.8);
    }
  });
  it('Nera neutral: triple prices, credit to the orphanage: casualties -5%', () => {
    expect(picked(at({}), 'nera')).toEqual(['neutral']);
    expect(picked(at({ 'npc.nera.stance': 'neutral' }), 'nera')).toEqual(['neutral']);
    expect(rowOf('nera', 'neutral').casualty).toBe(0.95);
  });
  it('Nera bought: high prices; hostile: leaves by the south gate; no part', () => {
    expect(picked(at({ 'npc.nera.stance': 'bought' }), 'nera')).toEqual(['bought']);
    expect(picked(at({ 'npc.nera.stance': 'hostile' }), 'nera')).toEqual(['hostile']);
    expect(rowOf('nera', 'bought').casualty).toBeUndefined();
    expect(rowOf('nera', 'hostile').casualty).toBeUndefined();
  });

  // 卡西安
  it('Cassian in any case: rings the bell and opens the chapel to the people', () => {
    expect(picked(at({ a1_oola_fate: 'cleared' }), 'cassian')).toEqual(['bell']);
    expect(rowOf('cassian', 'bell').shelter).toBe('chapel');
  });
  it('Cassian, Oola held and doubt 1 or more: opens the cell himself; her part counts', () => {
    const f = at({ a1_oola_fate: 'convicted', 'npc.cassian.doubt': 1 });
    expect(picked(f, 'cassian')).toEqual(['bell', 'release']);
    expect(picked(f, 'oola')).toEqual(['free']);
  });
  it('Cassian, Oola held and doubt 0: refuses; Noi tries to free her alone', () => {
    const f = at({ a1_oola_fate: 'convicted', 'npc.cassian.doubt': 0 });
    expect(picked(f, 'cassian')).toEqual(['bell', 'refuse']);
    expect(rowOf('cassian', 'refuse').rescueAttempt).toBe(true);
    expect(picked(f, 'oola')).toEqual(['custody']);
  });

  // 欧拉
  it('Oola free: smokes out the sediment, tends the wounded: casualties -30%, spirits -10', () => {
    const f = at({ a1_oola_fate: 'cleared' });
    expect(picked(f, 'oola')).toEqual(['free']);
    expect(rowOf('oola', 'free').casualty).toBe(0.7);
    const surge = input(f, 'surge', null, 'west');
    expect(linePressure(surge, line('west'))).toBe(90);
  });
  it('Oola held: nothing (unless let out, or placed between the chapel and the fence)', () => {
    const f = at({ a1_oola_fate: 'convicted' });
    expect(picked(f, 'oola')).toEqual(['custody']);
    const placed = at({ a1_oola_fate: 'convicted', 'a1_tide_prep.oola_placed': true });
    expect(picked(placed, 'oola')).toEqual(['free']);
    const broke = at({ a1_oola_jailbroken: true, 'a1_tide_prep.oola_placed': true });
    expect(picked(broke, 'oola')).toEqual(['free']);
    expect(casualtyFactor(input(f, 'wave1').picks.filter((p) => p.actor.id === 'oola'))).toBe(1);
  });
  it('Oola fled to the woods: comes out by the east fence with the deer, +5, slope casualties -30%', () => {
    const f = at({ a1_oola_fate: 'fled', a1_forest_accord: 'partial' });
    expect(picked(f, 'oola')).toEqual(['forest']);
    expect(adds(f, 'oola', 'wave1', 'east')).toBe(5);
    expect(rowOf('oola', 'forest').slopeCasualty).toBe(0.7);
    // not while the forest accord is broken, not after the mob threw her out wounded
    expect(picked(at({ a1_oola_fate: 'fled', a1_forest_accord: 'broken' }), 'oola')).toEqual([]);
    expect(picked(at({ a1_oola_fate: 'fled', a1_oola_wounded: true }), 'oola')).toEqual([]);
  });

  // 加斯帕与伐木工
  it('Gaspar, accord restored: opens the east fence to the slope, +15', () => {
    const f = at({ a1_forest_accord: 'restored' });
    expect(picked(f, 'gaspar')).toEqual(['open']);
    expect(adds(f, 'gaspar', 'wave1', 'east')).toBe(15);
    expect(slopeDelayed(input(f, 'wave1'))).toBe(false);
  });
  it('Gaspar, partial: holds the fence (+15) but waits for an order: slope losses +50% in wave 1', () => {
    const f = at({ a1_forest_accord: 'partial', 'trust.shiya': 60 });
    expect(picked(f, 'gaspar')).toEqual(['wait']);
    expect(adds(f, 'gaspar', 'wave1', 'east')).toBe(15);
    expect(slopeDelayed(input(f, 'wave1'))).toBe(true);
    expect(slopeFactor(input(f, 'wave1'), line('east'))).toBe(1.5);
    // the player's order, the player at the fence, or Shiya with her family there opens it
    expect(
      slopeDelayed(
        input(
          at({ a1_forest_accord: 'partial', 'trust.shiya': 60, a1_east_gate_ordered: true }),
          'wave1',
        ),
      ),
    ).toBe(false);
    expect(slopeDelayed(input(f, 'wave1', 'east'))).toBe(false);
    expect(slopeDelayed(input(at({ a1_forest_accord: 'partial' }), 'wave1'))).toBe(false);
  });
  it('Gaspar, broken or the slope driven out: refuses by the curfew, +10, slope shut out', () => {
    for (const f of [
      at({ a1_forest_accord: 'broken' }),
      at({ a1_forest_accord: 'restored', a1_shiya_family: 'left' }),
    ]) {
      expect(picked(f, 'gaspar')).toEqual(['curfew']);
      expect(adds(f, 'gaspar', 'wave1', 'east')).toBe(10);
    }
  });

  // 葛恩、博罗与东坡猎户
  it('Gorn and the slope hunters let in: the east fence +20', () => {
    for (const f of [
      at({ a1_forest_accord: 'restored' }),
      at({ a1_forest_accord: 'partial' }),
      at({ a1_forest_accord: 'broken', 'a1_tide_prep.eastslope_in': true }),
    ]) {
      expect(picked(f, 'eastslope')).toEqual(['inside']);
      expect(adds(f, 'eastslope', 'wave1', 'east')).toBe(20);
      expect(activeLines(input(f, 'wave1')).map((l) => l.id)).not.toContain('slope');
    }
  });
  it('Gorn and the slope hunters shut out: hold the slope huts, settled alone (pressure 40, defence 20)', () => {
    const f = at({ a1_forest_accord: 'broken' });
    expect(picked(f, 'eastslope')).toEqual(['outside']);
    const i = input(f, 'wave1');
    expect(activeLines(i).map((l) => l.id)).toContain('slope');
    expect(lineDefence(i, line('slope'))).toBe(20);
    expect(linePressure(i, line('slope'))).toBe(40);
    // only in the first wave
    expect(activeLines(input(f, 'wave2')).map((l) => l.id)).not.toContain('slope');
    // and gone with the slope folk
    expect(picked(at({ a1_shiya_family: 'left' }), 'eastslope')).toEqual([]);
  });

  // 博罗
  it('Boro charges Black Ridge (east +5): covered (A1-S06 or the accord restored), he lives', () => {
    for (const f of [at({ a1_boro_calmed: true }), at({ a1_forest_accord: 'restored' })]) {
      expect(picked(f, 'boro')).toEqual(['covered']);
      expect(adds(f, 'boro', 'wave1', 'east')).toBe(5);
      const fate = namedFate(DEF, rowOf('boro', 'covered'), 'boro', 'wave1', 60, () => true);
      expect(fate.fate).not.toBe('dead');
    }
  });
  it('Boro charges alone: dies once the east gap reaches 10', () => {
    const f = at({ a1_forest_accord: 'broken' });
    expect(picked(f, 'boro')).toEqual(['alone']);
    const row = rowOf('boro', 'alone');
    expect(namedFate(DEF, row, 'boro', 'wave1', 10, never)).toEqual({
      fate: 'dead',
      cause: 'charge',
    });
    expect(namedFate(DEF, row, 'boro', 'wave1', 9, never).fate).toBeNull();
  });

  // 希雅
  it('Shiya, trust 40 or more: follows the player, +10 on the player line', () => {
    const f = at({ 'trust.shiya': 40 });
    expect(picked(f, 'shiya')).toEqual(['follow']);
    expect(adds(f, 'shiya', 'wave1', 'west', 'west')).toBe(10);
    expect(adds(f, 'shiya', 'wave1', 'west', null)).toBe(0);
  });
  it('Shiya, under 40: stays by her family, east +5', () => {
    const f = at({ 'trust.shiya': 39 });
    expect(picked(f, 'shiya')).toEqual(['family']);
    expect(adds(f, 'shiya', 'wave1', 'east')).toBe(5);
    expect(picked(at({ 'trust.shiya': 39, a1_shiya_family: 'left' }), 'shiya')).toEqual([]);
    // at 40 and up the family row is out of bounds for a chooser
    const high = legalRows(actor('shiya'), holdsOf(at({ 'trust.shiya': 70 })));
    expect(high.map((r) => r.id)).toEqual(['follow']);
  });

  // 罗恩
  it('Ron, trust 60 or more: stays and organizes the militia: +10 on his line, civilians -20%', () => {
    const f = at({ 'trust.ron': 60 });
    expect(picked(f, 'ron')).toEqual(['organize']);
    expect(adds(f, 'ron', 'wave2', 'north', 'north')).toBe(10);
    expect(rowOf('ron', 'organize').casualty).toBe(0.8);
  });
  it('Ron, under 60: runs for the south gate, sees the children, turns back: south +5 from beat 2', () => {
    const f = at({ 'trust.ron': 59 });
    expect(picked(f, 'ron')).toEqual(['turn_back']);
    expect(adds(f, 'ron', 'wave1', 'south')).toBe(0);
    expect(adds(f, 'ron', 'wave2', 'south')).toBe(5);
    expect(adds(f, 'ron', 'surge', 'south')).toBe(5);
  });

  // 布伦
  it('Bron, story level 2 or more: the old sword at the north gate, +5', () => {
    const f = at({ 'npc.bron.story_level': 2 });
    expect(picked(f, 'bron')).toEqual(['old_sword']);
    expect(adds(f, 'bron', 'wave1', 'north')).toBe(5);
  });
  it('Bron otherwise: keeps the guild stone house for the people there', () => {
    expect(picked(at({ 'npc.bron.story_level': 1 }), 'bron')).toEqual(['stone_house']);
    expect(rowOf('bron', 'stone_house').shelter).toBe('guild');
  });

  // 贝莎
  it('Bertha, Oola held, convicted, doubt 0: raises the mob in the chapel', () => {
    const f = at({ a1_oola_fate: 'convicted', 'npc.cassian.doubt': 0 });
    expect(picked(f, 'bertha')).toEqual(['mob']);
    expect(rowOf('bertha', 'mob').mob).toBe(true);
    expect(picked(at({ a1_oola_fate: 'convicted', 'npc.cassian.doubt': 1 }), 'bertha')).toEqual([]);
  });
  it('Bertha, Oola cleared: prays with Toby in the chapel, hands water to the wounded', () => {
    expect(picked(at({ a1_oola_fate: 'cleared' }), 'bertha')).toEqual(['pray']);
  });

  // 托马、埃德、杰德、维克、伊莎与格蕾塔、夜羽
  it('Toma in any case: rings all night, calls the weakest face: +10 moved there before the surge', () => {
    expect(picked(at({}), 'toma')).toEqual(['bell']);
    expect(callBonus(input(at({}), 'surge').picks)).toBe(10);
  });
  it('Ed in any case: stays at the graveyard (2 dregs rise there while it is unpurified)', () => {
    expect(picked(at({}), 'ed')).toEqual(['graveyard']);
    const grave = phase('wave2').waves?.find((w) => w.wave === 'mtide_lotha_rim_grave');
    expect(holdsOf(at({}))(grave?.when ?? '')).toBe(true);
    expect(holdsOf(at({ a1_graveyard_purified: true }))(grave?.when ?? '')).toBe(false);
    const wave = CONTENT.waves.find((w) => w.id === 'mtide_lotha_rim_grave');
    expect(wave?.groups).toEqual([{ monster: 'dian_dreg', count: 2 }]);
  });
  it('Jed, not exposed: deserts in the first wave, north -5', () => {
    expect(picked(at({}), 'jed')).toEqual(['desert']);
    expect(adds(at({}), 'jed', 'wave1', 'north')).toBe(-5);
    expect(picked(at({ a1_jed_exposed: true }), 'jed')).toEqual([]);
  });
  it('Vick in any case: hides with the ledger in the manor cellar', () => {
    expect(picked(at({}), 'vick')).toEqual(['cellar']);
  });
  it('Isa and Greta: move the orphans to the chapel, or to the mill once the orphanage has it', () => {
    expect(picked(at({}), 'orphans')).toEqual(['chapel']);
    expect(childrenShelter(input(at({}), 'colossus').picks)).toBe('chapel');
    expect(picked(at({ a1_mill_owner: 'orphanage' }), 'orphans')).toEqual(['mill']);
    expect(childrenShelter(input(at({ a1_mill_owner: 'orphanage' }), 'colossus').picks)).toBe(
      'mill',
    );
  });
  it('Yeyu in any case (bound): follows the player, +10 on the player line', () => {
    const f = at({ 'companion.yeyu.recruited': true });
    expect(picked(f, 'yeyu')).toEqual(['follow']);
    expect(adds(f, 'yeyu', 'wave2', 'north', 'north')).toBe(10);
  });

  it('the kernel filters a chooser: an out-of-bounds pick falls back to the first open row', () => {
    const barto = actor('barto');
    // trust 60 and the family safe: both conditioned rows are open, the "otherwise" row is not
    const both = holdsOf(at({ 'trust.barto': 60, a1_barto_family_safe: true }));
    expect(legalRows(barto, both).map((r) => r.id)).toEqual(['hold', 'chapel']);
    expect(pickRows(barto, both).map((r) => r.id)).toEqual(['hold']);
    expect(pickRows(barto, both, 'chapel').map((r) => r.id)).toEqual(['chapel']);
    expect(pickRows(barto, both, 'withdraw').map((r) => r.id)).toEqual(['hold']);
    // only the otherwise row when no condition holds
    const none = holdsOf(at({ 'trust.barto': 10 }));
    expect(legalRows(barto, none).map((r) => r.id)).toEqual(['withdraw']);
    expect(pickRows(barto, none, 'hold').map((r) => r.id)).toEqual(['withdraw']);
    // the table's conditions keep these actors' rows exclusive
    const states = [
      at({ 'trust.ron': 80, 'trust.shiya': 80 }),
      at({ a1_forest_accord: 'restored', a1_oola_fate: 'cleared' }),
      at({ a1_dris_face: 'won', a1_moss_fate: 'in_power', 'a1_tide_prep.nera_stock': true }),
    ];
    for (const f of states) {
      for (const who of [
        'ron',
        'shiya',
        'gaspar',
        'eastslope',
        'boro',
        'dris',
        'oola',
        'nera',
        'moss',
      ])
        expect(legalRows(actor(who), holdsOf(f)).length, who).toBeLessThanOrEqual(1);
    }
    // an additive row cannot be swapped out
    const cas = actor('cassian');
    expect(
      pickRows(cas, holdsOf(at({ a1_oola_fate: 'cleared' })), 'bell').map((r) => r.id),
    ).toEqual(['bell']);
  });
  it('a dead person sits the night out; a group fights on without its named leader', () => {
    expect(picked(at({}), 'jed', ['jed'])).toEqual([]);
    expect(picked(at({ 'trust.barto': 10 }), 'barto', ['barto'])).toEqual(['withdraw']);
  });
});

describe('8.3 lines and pressure', () => {
  it('base defences 20, 10, 15, 5; the repaired east fence +15', () => {
    const quiet = at({ a1_jed_exposed: true, 'trust.shiya': 0, a1_shiya_family: 'left' });
    const i = input(quiet, 'wave1');
    const base = (id: string) => line(id).base;
    expect([base('north'), base('east'), base('south'), base('west')]).toEqual([20, 10, 15, 5]);
    const fixed = input({ ...quiet, 'a1_tide_prep.east_fence': true }, 'wave1');
    expect(lineDefence(fixed, line('east')) - lineDefence(i, line('east'))).toBe(15);
  });
  it('pressure by phase: wave 1 20/60/0/15, beat 2 60/10/20/10 (+10 south while the graveyard is unpurified)', () => {
    const w1 = input(at({}), 'wave1');
    expect(['north', 'east', 'south', 'west'].map((l) => linePressure(w1, line(l)))).toEqual([
      20, 60, 0, 15,
    ]);
    const w2 = input(at({ a1_graveyard_purified: true }), 'wave2');
    expect(['north', 'east', 'south', 'west'].map((l) => linePressure(w2, line(l)))).toEqual([
      60, 10, 20, 10,
    ]);
    expect(linePressure(input(at({}), 'wave2'), line('south'))).toBe(30);
  });
  it('the blocked seep culvert takes 10 off the first wave', () => {
    expect(linePressure(input(at({ a1_culvert_sealed: true }), 'wave1'), line('east'))).toBe(50);
    expect(linePressure(input(at({ a1_culvert_sealed: true }), 'wave2'), line('east'))).toBe(10);
  });
  it('the player +40 on the line held; Yeyu, Shiya and Ron +10 each there; none in the surge', () => {
    const f = at({ 'companion.yeyu.recruited': true, 'trust.shiya': 50, 'trust.ron': 70 });
    const without = lineDefence(input(f, 'wave1', null), line('west'));
    expect(lineDefence(input(f, 'wave1', 'west'), line('west')) - without).toBe(70);
    expect(lineDefence(input(f, 'wave1', 'west'), line('west'), false) - without).toBe(30);
    // phases 3 and 4: the player is in the north district, the other lines rest on the NPCs
    expect(phase('surge').playerLines).toBeFalsy();
    expect(phase('colossus').settle).toBeFalsy();
  });
  it('gap = pressure - defence, never below 0', () => {
    expect(gapOf(60, 25)).toBe(35);
    expect(gapOf(20, 45)).toBe(0);
  });
});

describe('8.2 phase 4 and 8.5 the surge and the striker', () => {
  it('the surge presses only the weakest face, with 100; Toma moves 10 there first', () => {
    const f = at({ a1_jed_exposed: true });
    const i = input(f, 'surge');
    const w = weakestFace(i);
    expect(w).toBe('west');
    const out = surgeOutcome(i, true);
    expect(out.weakest).toBe('west');
    // west: base 5, Toma's call 10; pressure 100
    expect(out.gap).toBe(85);
    const s = input(f, 'surge', null, 'west');
    expect(linePressure(s, line('north'))).toBe(0);
    expect(lineDefence(s, line('west'))).toBe(15);
  });
  it('the weakest face is the lowest defence before the call (south with Moss gone and the raid)', () => {
    const f = at({
      a1_moss_fate: 'in_power',
      a1_oneeye_fate: 'active',
      a1_viro_status: 'in_band',
      'trust.ron': 70,
      'a1_tide_prep.east_fence': true,
    });
    // south: 15 - 10 (Moss's two guards) = 5; west 5; a tie keeps the table order: south
    expect(weakestFace(input(f, 'surge'))).toBe('south');
  });
  it('one cut: the face would lose (gap > 0): she strikes, its surge losses are zero', () => {
    const f = at({ a1_jed_exposed: true });
    const i = input(f, 'surge', null, 'west');
    const out = surgeOutcome(input(f, 'surge'), true);
    expect(out.struck).toBe(true);
    const res = settlePhase(i, () => true, never, [], true);
    const west = res.lines.find((l) => l.line === 'west');
    expect(west?.struck).toBe(true);
    expect(west?.deaths).toBe(0);
    expect(west?.damaged).toEqual([]);
    expect(res.fates).toEqual([]);
  });
  it('watching: the town held the face by itself (gap 0): she does not strike', () => {
    // west 5 + 15 (One-Eyes) + 10 call; Oola free: 90 pressure; the band and the call still short:
    const f = at({ a1_oneeye_fate: 'absorbed', a1_oola_fate: 'cleared' });
    const out = surgeOutcome(input(f, 'surge'), true);
    expect(out.gap).toBeGreaterThan(0);
    // a town with no face below 100 after the call: give west 90 more through a story mod
    const strong: TideNightDef = {
      ...DEF,
      mods: [
        ...(DEF.mods ?? []),
        { when: 'zz_wall', line: 'west', defence: 200 },
        { when: 'zz_wall', line: 'south', defence: 200 },
        { when: 'zz_wall', line: 'east', defence: 200 },
        { when: 'zz_wall', line: 'north', defence: 200 },
      ],
    };
    const held = surgeOutcome({ ...input({ ...f, zz_wall: true }, 'surge'), def: strong }, true);
    expect(held.gap).toBe(0);
    expect(held.struck).toBe(false);
  });
  it('after a strike the free drink waits for assessment 5 or more; below that she stays wary', () => {
    const ally = DEF.striker?.ally;
    expect(ally?.flag).toBe('a1_martha_drink');
    expect(holdsOf(at({ 'npc.martha.assessment': 5 }))(ally?.when ?? '')).toBe(true);
    expect(holdsOf(at({ 'npc.martha.assessment': 4 }))(ally?.when ?? '')).toBe(false);
    expect(DEF.striker?.revealed).toBe('npc.martha.revealed');
    expect(DEF.striker?.strike).toBe('a1_martha_strike');
  });
});

describe('8.6 the settlement, rule by rule', () => {
  it('rule 2: civilians = gap / 10 rounded down, times the town factors multiplied', () => {
    expect(civilianDeaths(39, 10, 1)).toBe(3);
    const f = at({ a1_oola_fate: 'cleared', 'npc.nera.stance': 'partner', 'trust.ron': 60 });
    const factor = casualtyFactor(input(f, 'wave1').picks);
    expect(factor).toBeCloseTo(0.7 * 0.8 * 0.8, 10);
    expect(civilianDeaths(50, 10, factor)).toBeCloseTo(5 * 0.448, 10);
  });
  it('rule 3: gap 20 or more: injury roll 50%; gap 40 or more: death roll 30% unless protected', () => {
    const row = rowOf('barto', 'hold');
    const asked: number[] = [];
    const yes = (p: number) => {
      asked.push(p);
      return true;
    };
    expect(namedFate(DEF, row, 'barto', 'wave2', 40, yes).fate).toBe('dead');
    expect(asked).toEqual([0.3]);
    asked.length = 0;
    expect(namedFate(DEF, row, 'barto', 'wave2', 39, yes).fate).toBe('injured');
    expect(asked).toEqual([0.5]);
    expect(namedFate(DEF, row, 'barto', 'wave2', 19, yes).fate).toBeNull();
    // the cross-act protected are only ever hurt
    const bron = rowOf('bron', 'old_sword');
    expect(namedFate(DEF, bron, 'bron', 'wave2', 80, () => true).fate).toBe('injured');
  });
  it('rule 4: gap 30 or more damages one building behind the line, the next one next time', () => {
    expect(damagedBuilding(line('north'), 30, 30, [])).toBe('orphanage');
    expect(damagedBuilding(line('north'), 30, 30, ['orphanage'])).toBe('guard_post');
    expect(damagedBuilding(line('north'), 29, 30, [])).toBeUndefined();
    expect(line('east').behind).toEqual(['lumberyard', 'herb_hut']);
    expect(line('south').behind).toEqual(['post_station', 'merchant_branch']);
    expect(line('west').behind).toEqual(['mill', 'farmhouse']);
  });
  it('rules 1 to 4 together: a phase settles each line and the named on it in table order', () => {
    // beat 2: north 20 + 5 (Bron) - 5 (Jed) vs 60, Barto gone: gap 40
    const f = at({ 'trust.barto': 0, 'npc.bron.story_level': 2 });
    const res = settlePhase(input(f, 'wave2'), () => true, never, []);
    const north = res.lines.find((l) => l.line === 'north');
    expect(north).toMatchObject({ defence: 20, pressure: 60, gap: 40 });
    expect(north?.deaths).toBeCloseTo(4 * 0.95, 10);
    expect(north?.damaged).toEqual(['orphanage']);
    // Bron is protected (hurt, never killed); Jed deserted (a post below 0): no roll for him
    expect(res.fates.map((x) => [x.npc, x.fate])).toEqual([['bron', 'injured']]);
  });
  it('outputs: survival bands 0 to 5 intact, 6 to 20 damaged, 21 up ravaged', () => {
    expect([0, 5, 6, 20, 21].map((n) => survivalBand(DEF, n))).toEqual([
      'intact',
      'intact',
      'damaged',
      'damaged',
      'ravaged',
    ]);
  });
  it('outputs: population about 800 less the dead, kept in 600 to 900', () => {
    expect(population(DEF, 12)).toBe(788);
    expect(population(DEF, 500)).toBe(600);
    // from the count the town has now (those who left before the night already gone)
    expect(population(DEF, 12, 760)).toBe(748);
  });
  it('outputs: prosperity 50, -5 a building, Nera +5, the band +5, Moss south -10 unless stopped', () => {
    const rows = [rowOf('nera', 'partner'), rowOf('oneeye', 'absorbed'), rowOf('moss', 'flee')];
    expect(prosperityAfter(DEF, undefined, 2, rows, holdsOf(at({})))).toBe(50 - 10 + 5 + 5 - 10);
    expect(
      prosperityAfter(DEF, undefined, 0, rows, holdsOf(at({ a1_moss_intercepted: true }))),
    ).toBe(60);
    expect(prosperityAfter(DEF, 40, 0, [], holdsOf(at({})))).toBe(40);
  });
  it('outputs: trust +15 on the shared line, +25 when the player saved them, -20 for leaving the children', () => {
    const shared = sharedLine(
      input(at({ 'trust.barto': 0, 'npc.bron.story_level': 2 }), 'wave2', 'north'),
    );
    // north without the player: 20 + 5 (Bron) - 5 (Jed) vs 60 = gap 40: saved; the deserter
    // shares nothing
    expect(shared.map((s) => s.npc).sort()).toEqual(['bron']);
    expect(shared.every((s) => s.saved)).toBe(true);
    const calm = sharedLine(
      input(
        at({ a1_barto_family_safe: true, a1_jed_exposed: true, a1_dris_face: 'won' }),
        'wave1',
        'north',
      ),
    );
    expect(calm.every((s) => !s.saved)).toBe(true);
    const out = trustChanges(
      DEF,
      [...shared, ...calm],
      holdsOf(at({ a1_colossus_target: 'children' })),
      never,
    );
    expect(out).toContainEqual({ npc: 'bron', amount: 25, reason: 'saved' });
    expect(out).toContainEqual({ npc: 'barto', amount: 15, reason: 'same_line' });
    for (const npc of ['isa', 'greta', 'noi', 'tess'])
      expect(out).toContainEqual({ npc, amount: -20, reason: 'left_children' });
    expect(trustChanges(DEF, [], holdsOf(at({ a1_colossus_target: 'player' })), never)).toEqual([]);
  });
  it('outputs: Toby dies at dawn untreated in stage three; Lin dies ill and untreated; else healthy', () => {
    const [toby, lin] = DEF.children ?? [];
    const h = (f: Flags) => holdsOf(at(f));
    expect(h({ 'sed_case.toby': 'crystal' })(toby?.dies ?? '')).toBe(true);
    expect(h({ 'sed_case.toby': 'crystal', a1_toby_state: 'recovered' })(toby?.dies ?? '')).toBe(
      false,
    );
    expect(h({ 'sed_case.toby': 'fever' })(toby?.dies ?? '')).toBe(false);
    expect(h({ 'sed_case.toby': 'crystal' })(toby?.diesLater ?? '')).toBe(true);
    expect(h({ 'sed_case.lin': 'fever' })(lin?.dies ?? '')).toBe(true);
    expect(h({ 'sed_case.lin': 'fever', a1_lin_state: 'recovered' })(lin?.dies ?? '')).toBe(false);
    // Lin's window of falling ill is week 9: healthy from week 10; an illness after an early
    // tide kills her at week 10 if untreated
    expect(h({})(lin?.healthy?.when ?? '')).toBe(true);
    expect(holdsOf({ act: 'act1', act_week: 9 })(lin?.healthy?.when ?? '')).toBe(false);
    const ill9 = holdsOf({ act: 'act1', act_week: 9, 'sed_case.lin': 'fever' });
    const ill10 = holdsOf({ act: 'act1', act_week: 10, 'sed_case.lin': 'fever' });
    expect(ill9(lin?.diesLater ?? '')).toBe(false);
    expect(ill10(lin?.diesLater ?? '')).toBe(true);
  });
  it('outputs: the children where they sheltered (the mill if the orphanage has it)', () => {
    const at0 = DEF.childrenAt ?? [];
    const pick = (f: Flags) => at0.find((c) => !c.when || holdsOf(at(f))(c.when))?.value;
    expect(pick({ a1_mill_owner: 'orphanage' })).toBe('mill');
    expect(pick({})).toBe('orphanage');
  });
});

describe('8.7 the credit', () => {
  const trust = (t: Record<string, number>) => (n: string) => t[n] ?? 0;
  it('"that F-rank drove the tide back": four named witnesses at trust 60 or more', () => {
    const v = creditVersion(
      DEF,
      ['ron', 'shiya', 'isa', 'greta'],
      trust({ ron: 60, shiya: 70, isa: 61, greta: 99 }),
      true,
      holdsOf(at({})),
    );
    expect(v?.id).toBe('player');
    expect(v?.tellers).toEqual(['ron', 'shiya', 'isa', 'greta']);
  });
  it('"Marsha cut the colossus down": she struck and fewer than four trusted witnesses', () => {
    const v = creditVersion(
      DEF,
      ['ron', 'shiya', 'isa'],
      trust({ ron: 90, shiya: 90, isa: 90 }),
      true,
      holdsOf(at({})),
    );
    expect(v?.id).toBe('martha');
    expect(v?.tellers).toEqual(['dora']);
  });
  it('"the light kept Borderstone": no strike, church suspicion 40 or more', () => {
    const v = creditVersion(DEF, [], trust({}), false, holdsOf(at({ church_suspicion: 40 })));
    expect(v?.id).toBe('light');
    expect(v?.tellers).toEqual(['bertha', 'cassian']);
  });
  it('"the colossus fell by itself": anything else', () => {
    const v = creditVersion(
      DEF,
      ['simon'],
      trust({ simon: 90 }),
      false,
      holdsOf(at({ church_suspicion: 39 })),
    );
    expect(v?.id).toBe('self_collapse');
  });
  it('witnesses: the posts at the north gate, the followers, the boss, and the chapel', () => {
    const f = at({ a1_dris_face: 'won', 'trust.shiya': 50, a1_barto_family_safe: true });
    const w = postedWitnesses(DEF, input(f, 'colossus').picks, 'colossus');
    expect(w).toEqual(
      expect.arrayContaining(['barto', 'dris', 'shiya', 'isa', 'greta', 'cassian']),
    );
    expect(w).not.toContain('toma');
  });
});
