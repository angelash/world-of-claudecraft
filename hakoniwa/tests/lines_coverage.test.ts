// Line pack coverage (builtin_ai.md 7.8, catalog_dialogue_lines.md 1.5) and the repetition
// rate (builtin_ai.md 14.1), over synthetic packs only: a complete pack of every speaker
// category passes, each required slot left out is reported on its own, the knower writes
// topic.gen_you instead of the unbelief tiers, short slots and packs warn, the bark pool's
// mood rule fires, and the repetition measure gives the value the suppression windows make.

import { describe, expect, it } from 'vitest';
import type { ContentMap } from '../src/core/contracts';
import {
  type CoverageFinding,
  coverageFindings,
  FIGHT_BARKS,
  joinAct,
  KNOWER_VERSIONS,
  type LineList,
  type LinePack,
  MIN_PACK_LINES,
  packCategory,
  packCoverage,
  packLineCount,
  REACT_CONVERSATION,
  REACT_CORE,
  REACT_ESCORT,
  REACT_NAMED,
  REACT_RECRUIT,
  REACT_TRADE,
  REPETITION_LIMITS,
  repetitionRate,
  type SpeakerInfo,
  speakerCategories,
  unregisteredCoverageKinds,
  type VersionedLines,
} from '../src/systems/dialogue/lines';
import { coverageGateFindings } from '../tools/content/validators/lines';

type Slots = Record<string, LineList | VersionedLines>;

/** n distinct lines with a tag (short enough for every family's limit). */
const ls = (tag: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${tag}${i}`);

const BANDS = ['cold', 'neutral', 'warm'];
const TIERS = ['deny', 'explain', 'waver'];

function pad(slots: Slots, min: number): Slots {
  const have = packLineCount({ id: 'x', slots });
  return have >= min ? slots : { ...slots, 'topic.lore_pad': { K0: ls('pad', min - have) } };
}

function namedSlots(): Slots {
  const s: Slots = {};
  for (const b of BANDS) s[`greet.${b}`] = ls(`g${b}`, 3);
  s.farewell = ls('bye', 3);
  for (const t of TIERS) s[`unbelief.${t}`] = ls(`u${t}`, 2);
  for (const k of REACT_NAMED) s[`react.${k}`] = ls(k, 2);
  s['topic.gen_self'] = { K0: ls('self', 2) };
  s['topic.gen_work'] = { K0: ls('work', 2) };
  s['topic.self_n1_dream'] = { K0: ls('dream', 2) };
  return s;
}

function coreSlots(reacts: readonly string[], activities: readonly string[]): Slots {
  const s: Slots = {};
  for (const b of BANDS)
    for (const p of ['day', 'night']) s[`greet.${b}.${p}`] = ls(`g${b}${p}`, 3);
  s.farewell = ls('bye', 3);
  for (const t of TIERS) s[`unbelief.${t}`] = ls(`u${t}`, 3);
  for (const k of reacts) s[`react.${k}`] = ls(k, 2);
  for (const t of ['gen_self', 'gen_work', 'self_k_a', 'place_k_b', 'event_k_c', 'lore_k_d'])
    s[`topic.${t}`] = { K1: ls(t, 2) };
  for (const a of activities) s[`bark.${a}`] = ls(`b${a}`, 2);
  return s;
}

const ACTIVITIES = ['work', 'eat', 'chat'];
const C_REACTS = [
  ...new Set([...REACT_CORE, ...REACT_CONVERSATION, ...REACT_TRADE, ...REACT_RECRUIT]),
];

function templateSlots(): Slots {
  const s: Slots = {};
  for (const b of BANDS) s[`greet.${b}`] = ls(`g${b}`, 2);
  s.farewell = ls('bye', 2);
  for (const t of TIERS) s[`unbelief.${t}`] = ls(`u${t}`, 2);
  s['bark.work'] = ls('bw', 4);
  s['topic.gen_work'] = { K0: ls('work', 2) };
  return s;
}

function goddessSlots(): Slots {
  const s: Slots = {};
  for (const b of BANDS) s[`greet.${b}.avatar`] = ls(`g${b}`, 3);
  s.farewell = ls('bye', 3);
  s['topic.gen_self'] = { prologue: ls('self', 2) };
  s['topic.gen_you'] = { prologue: ls('you', 2) };
  return s;
}

function poolLines(moods: Record<string, number>, plain: number): LineList {
  const out: LineList = [];
  for (const [m, n] of Object.entries(moods))
    for (let i = 0; i < n; i++)
      out.push(
        m === 'time'
          ? { zh: `t${i}`, when: 'hour >= 18 OR hour < 6' }
          : { zh: `${m}${i}`, mood: [m as never] },
      );
  for (let i = 0; i < plain; i++) out.push(`p${i}`);
  return out;
}

const CORE: SpeakerInfo = { category: 'K', activities: ACTIVITIES };
const COMPANION: SpeakerInfo = { category: 'C', activities: ACTIVITIES };

/** A complete pack of each category, padded to its total. */
const COMPLETE: Record<string, { pack: LinePack; info: SpeakerInfo }> = {
  G: {
    pack: { id: 'ln_g1', slots: pad(goddessSlots(), MIN_PACK_LINES.G) },
    info: { category: 'G' },
  },
  C: {
    pack: {
      id: 'ln_c1',
      slots: pad(
        {
          ...coreSlots(C_REACTS, ACTIVITIES),
          ...Object.fromEntries(FIGHT_BARKS.map((b) => [`bark.${b}`, ls(b, 2)])),
        },
        MIN_PACK_LINES.C,
      ),
    },
    info: COMPANION,
  },
  F: {
    pack: {
      id: 'ln_f1',
      slots: pad(
        {
          ...namedSlots(),
          ...Object.fromEntries(REACT_ESCORT.map((k) => [`react.${k}`, ls(k, 2)])),
          ...Object.fromEntries(FIGHT_BARKS.map((b) => [`bark.${b}`, ls(b, 2)])),
        },
        MIN_PACK_LINES.F,
      ),
    },
    info: { category: 'F' },
  },
  K: {
    pack: { id: 'ln_k1', slots: pad(coreSlots(REACT_CORE, ACTIVITIES), MIN_PACK_LINES.K) },
    info: CORE,
  },
  N: { pack: { id: 'ln_n1', slots: pad(namedSlots(), MIN_PACK_LINES.N) }, info: { category: 'N' } },
  T: {
    pack: { id: 'ln_tpl_t1', slots: pad(templateSlots(), MIN_PACK_LINES.T) },
    info: { category: 'T' },
  },
  B: {
    pack: {
      id: 'bark_town_daily',
      slots: { 'bark.crowd': poolLines({ worried: 3, happy: 3, time: 3 }, 21) },
    },
    info: { category: 'B' },
  },
};

const without = (pack: LinePack, slot: string): LinePack => {
  const slots = { ...pack.slots };
  delete slots[slot];
  return { ...pack, slots };
};
const errorsOf = (f: CoverageFinding[]) => f.filter((x) => x.level === 'error');
const warningsOf = (f: CoverageFinding[]) => f.filter((x) => x.level === 'warning');
const missing = (f: CoverageFinding[]) => errorsOf(f).map((x) => x.slot);

describe('coverage of a speaker pack (builtin_ai 7.8, catalog 1.5)', () => {
  it('passes a complete pack of every category, no errors and no warnings', () => {
    for (const [cat, { pack, info }] of Object.entries(COMPLETE))
      expect(packCoverage(pack, info), cat).toEqual([]);
  });

  it('names every reaction kind of its groups from the registered kinds', () => {
    expect(unregisteredCoverageKinds()).toEqual([]);
    expect(C_REACTS.length).toBe(42);
  });

  it('reports each required slot of a named person left out, one at a time', () => {
    const { pack, info } = COMPLETE.N as { pack: LinePack; info: SpeakerInfo };
    const required = [
      'greet.cold',
      'greet.neutral',
      'greet.warm',
      'farewell',
      ...TIERS.map((t) => `unbelief.${t}`),
      ...REACT_NAMED.map((k) => `react.${k}`),
      'topic.gen_self',
      'topic.gen_work',
    ];
    for (const slot of required)
      expect(missing(packCoverage(without(pack, slot), info)), slot).toEqual([slot]);
    // the own topic: nothing outside gen_ left
    expect(missing(packCoverage(without(pack, 'topic.self_n1_dream'), info))).toEqual([
      'topic.<own>',
    ]);
  });

  it('takes a band of a named person from both its day parts, not from one', () => {
    const { pack, info } = COMPLETE.N as { pack: LinePack; info: SpeakerInfo };
    const split = without(pack, 'greet.cold');
    split.slots['greet.cold.day'] = ls('d', 3);
    expect(missing(packCoverage(split, info))).toEqual(['greet.cold']);
    split.slots['greet.cold.night'] = ls('n', 3);
    expect(missing(packCoverage(split, info))).toEqual([]);
  });

  it('reports each required slot of a core person, day and night apart, and the activity barks', () => {
    const { pack, info } = COMPLETE.K as { pack: LinePack; info: SpeakerInfo };
    const required = [
      ...BANDS.flatMap((b) => [`greet.${b}.day`, `greet.${b}.night`]),
      'farewell',
      ...TIERS.map((t) => `unbelief.${t}`),
      ...REACT_CORE.map((k) => `react.${k}`),
      ...ACTIVITIES.map((a) => `bark.${a}`),
    ];
    for (const slot of required)
      expect(missing(packCoverage(without(pack, slot), info)), slot).toEqual([slot]);
    // a plain band greeting does not stand in for the day parts of a core person
    const plain = without(without(pack, 'greet.cold.day'), 'greet.cold.night');
    plain.slots['greet.cold'] = ls('c', 3);
    expect(missing(packCoverage(plain, info))).toEqual(['greet.cold.day', 'greet.cold.night']);
    // six versioned topics; an unversioned topic list does not count
    const fewer = without(without(pack, 'topic.lore_k_d'), 'topic.lore_pad');
    expect(missing(packCoverage(fewer, info))).toEqual(['topic.*']);
    fewer.slots['topic.lore_k_d'] = ls('plain', 2);
    expect(missing(packCoverage(fewer, info))).toEqual(['topic.*']);
    // no schedule known: no activity bark asked for
    expect(missing(packCoverage(without(pack, 'bark.work'), { category: 'K' }))).toEqual([]);
  });

  it('asks a main companion for the three reaction groups and the fight barks', () => {
    const { pack, info } = COMPLETE.C as { pack: LinePack; info: SpeakerInfo };
    for (const k of ['haggle_no', 'invite', 'nothing_more', 'saved'])
      expect(missing(packCoverage(without(pack, `react.${k}`), info)), k).toEqual([`react.${k}`]);
    for (const b of FIGHT_BARKS)
      expect(missing(packCoverage(without(pack, `bark.${b}`), info)), b).toEqual([`bark.${b}`]);
    // a core person is not asked for them
    const k = COMPLETE.K as { pack: LinePack; info: SpeakerInfo };
    expect(missing(packCoverage(without(k.pack, 'react.thanked'), k.info))).toEqual([
      'react.thanked',
    ]);
    expect(packCoverage(k.pack, k.info)).toEqual([]);
  });

  it('asks an escort companion for the recruit and gift reactions and the fight barks', () => {
    const { pack, info } = COMPLETE.F as { pack: LinePack; info: SpeakerInfo };
    for (const k of REACT_ESCORT)
      expect(missing(packCoverage(without(pack, `react.${k}`), info)), k).toEqual([`react.${k}`]);
    for (const b of FIGHT_BARKS)
      expect(missing(packCoverage(without(pack, `bark.${b}`), info)), b).toEqual([`bark.${b}`]);
  });

  it('reports each required slot of a template and of a goddess', () => {
    const t = COMPLETE.T as { pack: LinePack; info: SpeakerInfo };
    for (const slot of [
      'greet.cold',
      'greet.neutral',
      'greet.warm',
      'farewell',
      ...TIERS.map((x) => `unbelief.${x}`),
      'topic.gen_work',
    ])
      expect(missing(packCoverage(without(t.pack, slot), t.info)), slot).toEqual([slot]);
    expect(missing(packCoverage(without(t.pack, 'bark.work'), t.info))).toEqual(['bark.*']);
    // any bark context will do for a template
    const other = without(t.pack, 'bark.work');
    other.slots['bark.patrol'] = ls('p', 4);
    expect(missing(packCoverage(other, t.info))).toEqual([]);
    const g = COMPLETE.G as { pack: LinePack; info: SpeakerInfo };
    for (const slot of ['greet.cold.avatar', 'farewell', 'topic.gen_self', 'topic.gen_you'])
      expect(missing(packCoverage(without(g.pack, slot), g.info)), slot).toEqual([slot]);
    // every band on every channel she greets on; no channel at all is one error
    const coin = { ...g.pack, slots: { ...g.pack.slots, 'greet.neutral.coin': ls('c', 3) } };
    expect(missing(packCoverage(coin, g.info))).toEqual(['greet.cold.coin', 'greet.warm.coin']);
    let none = g.pack;
    for (const b of BANDS) none = without(none, `greet.${b}.avatar`);
    expect(missing(packCoverage(none, g.info))).toEqual(['greet.<band>.<channel>']);
    // a goddess is not asked for the unbelief tiers
    expect(missing(packCoverage(g.pack, g.info))).toEqual([]);
  });

  it('lets a knower write topic.gen_you in the cognition versions instead of unbelief', () => {
    const { pack, info } = COMPLETE.N as { pack: LinePack; info: SpeakerInfo };
    let knower = pack;
    for (const t of TIERS) knower = without(knower, `unbelief.${t}`);
    knower.slots['topic.gen_you'] = Object.fromEntries(KNOWER_VERSIONS.map((v) => [v, ls(v, 2)]));
    expect(errorsOf(packCoverage(knower, info))).toEqual([]);
    // two of the three versions are not enough
    knower.slots['topic.gen_you'] = { doubt: ls('d', 3), explaining: ls('e', 3) };
    expect(missing(packCoverage(knower, info))).toEqual(TIERS.map((t) => `unbelief.${t}`));
    // fewer lines than the three tiers would have: a warning
    knower.slots['topic.gen_you'] = Object.fromEntries(KNOWER_VERSIONS.map((v) => [v, ls(v, 1)]));
    expect(warningsOf(packCoverage(knower, info)).map((w) => w.slot)).toContain('topic.gen_you');
  });

  it('counts act overrides and skips holes', () => {
    const { pack, info } = COMPLETE.N as { pack: LinePack; info: SpeakerInfo };
    const moved = without(pack, 'farewell');
    moved.acts = { act1: { farewell: ls('a', 3) } };
    expect(missing(packCoverage(moved, info))).toEqual([]);
    const holes = { ...pack, slots: { ...pack.slots, farewell: [null, null, null] } };
    expect(missing(packCoverage(holes, info))).toEqual(['farewell']);
    expect(packLineCount({ id: 'x', slots: { a: ['x', null], b: { K0: ['y', null, 'z'] } } })).toBe(
      3,
    );
  });

  it('warns on a short slot and a short pack, naming the shortfall', () => {
    const { pack, info } = COMPLETE.N as { pack: LinePack; info: SpeakerInfo };
    const short = { ...pack, slots: { ...pack.slots, farewell: ls('b', 2) } };
    const f = packCoverage(short, info);
    expect(errorsOf(f)).toEqual([]);
    expect(warningsOf(f).map((w) => w.message)).toContain(
      'farewell has 2 of the 3 lines of category N',
    );
    const tiny = {
      id: 'ln_n1',
      slots: { ...namedSlots(), 'topic.self_n1_dream': { K0: ls('dream', 1) } },
    };
    expect(packLineCount(tiny)).toBe(29);
    expect(warningsOf(packCoverage(tiny, info)).map((w) => w.message)).toEqual([
      '29 lines, 1 short of the 30 of category N',
    ]);
    // the goddess total is a warning that names the shortfall
    const g = { id: 'ln_g1', slots: goddessSlots() };
    const gw = packCoverage(g, { category: 'G' });
    expect(errorsOf(gw)).toEqual([]);
    expect(gw.map((w) => w.message)).toEqual(['16 lines, 234 short of the 250 of category G']);
  });

  it('asks a bark pool for three mood or time preferences at a tenth each', () => {
    const { pack, info } = COMPLETE.B as { pack: LinePack; info: SpeakerInfo };
    expect(packCoverage(pack, info)).toEqual([]);
    const two = { ...pack, slots: { 'bark.crowd': poolLines({ worried: 3, happy: 3 }, 24) } };
    expect(missing(packCoverage(two, info))).toEqual(['mood']);
    // a preference under a tenth does not count
    const thin = {
      ...pack,
      slots: { 'bark.crowd': poolLines({ worried: 3, happy: 3, tired: 2 }, 22) },
    };
    expect(missing(packCoverage(thin, info))).toEqual(['mood']);
    // the time-of-day lines count as one preference
    const timed = { ...pack, slots: { 'bark.crowd': poolLines({ worried: 3, time: 6 }, 21) } };
    expect(missing(packCoverage(timed, info))).toEqual(['mood']);
    const short = {
      ...pack,
      slots: { 'bark.crowd': poolLines({ worried: 3, happy: 3, time: 3 }, 20) },
    };
    expect(packCoverage(short, info).map((w) => w.level)).toEqual(['warning']);
  });
});

describe('speaker categories from the content', () => {
  const content = {
    goddesses: [{ id: 'g1' }],
    companions: [
      { id: 'c1', tier: 'main' },
      { id: 'f1', tier: 'escort' },
      { id: 'late', tier: 'main', recruit: { when: 'a2_company_partner' } },
      { id: 'soon', tier: 'main', recruit: { when: 'a1_oola_fate == cleared' } },
    ],
    npcs: [
      { id: 'k1', core: true, schedule: 'work_day' },
      { id: 'n1', schedule: [{ act: 'wander' }, { act: 'sleep' }] },
      { id: 'late', core: true, schedule: 'work_day' },
      { id: 'c1', core: true, schedule: 'work_day' },
    ],
    npcSchedules: [
      {
        id: 'work_day',
        segments: [{ act: 'work' }, { act: 'eat' }, { act: 'sleep' }, { act: 'work' }],
      },
    ],
  };

  it('reads goddesses, companions by tier and join act, and personas by core', () => {
    const at1 = speakerCategories(content, { stage: 1 });
    expect(at1.get('g1')).toEqual({ category: 'G' });
    expect(at1.get('c1')).toEqual({ category: 'C', activities: ['work', 'eat'] });
    expect(at1.get('f1')).toEqual({ category: 'F', activities: undefined });
    expect(at1.get('soon')?.category).toBe('C');
    expect(at1.get('k1')).toEqual({ category: 'K', activities: ['work', 'eat'] });
    expect(at1.get('n1')).toEqual({ category: 'N', activities: ['wander'] });
    // a companion who joins in act 2 is a core person while act 1 is written
    expect(at1.get('late')?.category).toBe('K');
    expect(speakerCategories(content, { stage: 2 }).get('late')?.category).toBe('C');
    expect(joinAct(undefined)).toBe(0);
    expect(joinAct('a2_company_partner')).toBe(2);
    expect(joinAct('a1_oola_fate == cleared OR a2_company_partner')).toBe(2);
  });

  it('gives shared layers and unknown speakers no category', () => {
    const roster = speakerCategories(content, { stage: 1 });
    for (const id of ['ln_common', 'ln_party', 'ln_role_giver', 'ln_class_peasant', 'ln_zz'])
      expect(packCategory({ id }, roster), id).toBeNull();
    expect(packCategory({ id: 'ln_tpl_miner' }, roster)).toEqual({ category: 'T' });
    expect(packCategory({ id: 'bark_any' }, roster)).toEqual({ category: 'B' });
    expect(packCategory({ id: 'ln_x', speaker: 'k1' }, roster)?.category).toBe('K');
    expect(
      coverageFindings(
        [
          { id: 'ln_common', slots: {} },
          { id: 'ln_zz', slots: {} },
        ],
        roster,
      ),
    ).toEqual([]);
  });

  it('reaches the data gate as V8 findings of the line packs', () => {
    const findings = coverageGateFindings({
      ...content,
      linePacks: [
        // one line short of a named person's 30: a warning, no error
        { id: 'ln_n1', slots: { ...namedSlots(), 'topic.self_n1_dream': { K0: ['x'] } } },
        without(COMPLETE.K?.pack as LinePack, 'farewell'),
      ],
    } as unknown as ContentMap);
    expect(findings).toContainEqual({
      level: 'error',
      table: 'linePacks',
      row: 'ln_k1',
      path: 'farewell',
      message: 'linePacks:ln_k1 coverage: category K needs farewell in its own pack',
    });
    expect(findings.filter((f) => f.row === 'ln_n1').map((f) => f.level)).toEqual(['warning']);
  });
});

describe('repetition rate (builtin_ai 14.1)', () => {
  const pack: LinePack = {
    id: 'ln_r1',
    slots: {
      'greet.neutral.day': ls('day', 3),
      'greet.neutral.night': ls('night', 3),
      farewell: ls('bye', 3),
    },
  };
  const content = { linePacks: [pack] } as Pick<ContentMap, 'linePacks'>;

  it('pins the windows and caps of 14.1', () => {
    expect(REPETITION_LIMITS).toEqual({
      G: { span: 30, cap: 0.05 },
      C: { span: 40, cap: 0.1 },
      F: { span: 40, cap: 0.1 },
      K: { span: 20, cap: 0.1 },
      N: { span: 20, cap: 0.2 },
      T: { span: 10, cap: 0.25 },
    });
  });

  it('three lines a slot repeat: ten meetings of greeting and farewell give 0.2 over 10', () => {
    // the last five meetings: three night greetings (all distinct), two day greetings
    // (distinct), five farewells over three lines: 8 distinct of 10
    const r = repetitionRate(content, 'r1', {}, 10, { meetings: 10, reactions: [] });
    expect(r.said).toHaveLength(10);
    expect(r.rate).toBeCloseTo(0.2, 10);
    expect(r.gaps).toEqual([]);
  });

  it('is deterministic for a seed', () => {
    const a = repetitionRate(content, 'r1', {}, 20, { meetings: 12, reactions: [] });
    const b = repetitionRate(content, 'r1', {}, 20, { meetings: 12, reactions: [] });
    expect(a).toEqual(b);
  });

  it('never repeats a line inside its window while another is free', () => {
    const r = repetitionRate(content, 'r1', {}, 40, { meetings: 20, reactions: [] });
    const byes = r.said.filter((k) => k.includes('farewell'));
    expect(byes).toHaveLength(20);
    // daily farewells over three lines: any three in a row are distinct, so it cycles
    for (let i = 0; i + 3 <= byes.length; i++) expect(new Set(byes.slice(i, i + 3)).size).toBe(3);
    for (let i = 3; i < byes.length; i++) expect(byes[i]).toBe(byes[i - 3]);
    // ten farewells a week apart from ten lines: none comes back within the seven days
    const wide: LinePack = {
      id: 'ln_r2',
      slots: {
        'greet.neutral.day': ls('d', 1),
        'greet.neutral.night': ls('n', 1),
        farewell: ls('b', 10),
      },
    };
    const w = repetitionRate({ linePacks: [wide] }, 'r2', {}, 14, { meetings: 7, reactions: [] });
    expect(new Set(w.said.filter((k) => k.includes('farewell'))).size).toBe(7);
  });

  it('draws the reactions in turn, lists a slot nobody has, and reads conditions through holds', () => {
    const withReacts: LinePack = {
      ...pack,
      slots: {
        ...pack.slots,
        'react.thanked': ls('thx', 2),
        farewell: [...ls('bye', 2), { zh: 'late', when: 'act == act2' }],
      },
    };
    const r = repetitionRate({ linePacks: [withReacts] }, 'r1', {}, 30, {
      meetings: 4,
      reactions: ['thanked', 'insult'],
    });
    expect(r.gaps).toEqual(['react.insult']);
    expect(r.said.some((k) => k.includes('farewell.2'))).toBe(false);
    const open = repetitionRate({ linePacks: [withReacts] }, 'r1', {}, 30, {
      meetings: 4,
      reactions: ['thanked'],
      holds: () => true,
    });
    expect(open.said.some((k) => k.includes('farewell.2'))).toBe(true);
  });
});
