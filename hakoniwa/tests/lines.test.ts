// Line packs (builtin_ai.md 7; PK-M0-25, 19 step 2): the fallback chain, the selector's
// filters, weights, tie and draw rules, repetition suppression, the ln_common migration of
// the former rule templates, the content text keys against the extractor, and the line
// pack checks of the data gate (V8) on violating fixtures.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { LEGACY_DIGESTS, validateDialogueContent } from '../src/content/packs/dialogue';
import type { ContentMap } from '../src/core/contracts';
import { Rng } from '../src/core/rng';
import { type TextParam, tr } from '../src/core/text';
import { extractContentText } from '../src/shared_ui/content_text';
import { formatText, SOURCE_TABLE, t } from '../src/shared_ui/i18n';
import { firstLine, linesFor as legacyLinesFor, pickLine } from '../src/systems/dialogue';
import {
  CJK as CJK_TEST,
  candidateWeight,
  chainPackIds,
  fill,
  fillSlotsOf,
  LINE_HISTORY_CAP,
  type LineHistory,
  type LinePack,
  legacyLines,
  lineKey,
  newLineHistory,
  recordLine,
  resolveSlot,
  type SelectContext,
  selectLine,
  sliceDigest,
  slotChain,
  slotProblem,
  slotSources,
  suppressionDays,
  type VersionBy,
  versionCandidates,
  versionProblem,
} from '../src/systems/dialogue/lines';
import { evaluate } from '../src/systems/quests/conditions';
import { linePackFindings } from '../tools/content/validators/lines';
import originalCognitionLines from './fixtures/legacy_cognition_lines.json';
import originalTemplates from './fixtures/legacy_dialogue_templates.json';

const CONTENT = buildContent();
const content = (packs: LinePack[]) => ({ linePacks: packs }) as Pick<ContentMap, 'linePacks'>;
const rng = (s = 3) => new Rng({ s });
const ctx = (over: Partial<SelectContext> = {}): SelectContext => ({
  holds: (w) => evaluate(w, () => undefined),
  dayIndex: 10,
  ...over,
});

// ---------------------------------------------------------------------------
// a small chain: own pack, role, template, class, common

const PACKS: LinePack[] = [
  {
    id: 'ln_ron',
    speaker: 'ron',
    slots: {
      'greet.warm': ['ron warm'],
      'topic.gen_self': { K1: ['ron self K1'] },
    },
    acts: { act2: { 'greet.warm': ['ron warm act2'] } },
  },
  { id: 'ln_role_vendor', slots: { 'topic.gen_shop': ['vendor shop'], farewell: ['vendor bye'] } },
  { id: 'ln_tpl_porter', slots: { farewell: ['porter bye'], 'bark.work': ['porter work'] } },
  { id: 'ln_class_adventurer', slots: { 'bark.work': ['adv work'], greet: ['adv greet'] } },
  {
    id: 'ln_common',
    slots: { greet: ['common greet'], 'bark.work': ['common work'], 'bark.eat': ['common eat'] },
  },
];
const C = content(PACKS);
const LAYERS = { roles: ['vendor'], template: 'porter', socialClass: 'adventurer' };

describe('the fallback chain (builtin_ai 7.3)', () => {
  it('orders own pack, roles, template, class, common', () => {
    expect(chainPackIds('ron', LAYERS)).toEqual([
      'ln_ron',
      'ln_role_vendor',
      'ln_tpl_porter',
      'ln_class_adventurer',
      'ln_common',
    ]);
    expect(chainPackIds('x')).toEqual(['ln_x', 'ln_common']);
  });

  it('step 1: the act override wins inside its act', () => {
    expect(resolveSlot(C, 'ron', 'greet.warm', { act: 'act2' })).toMatchObject({
      packId: 'ln_ron',
      act: 'act2',
      lines: ['ron warm act2'],
    });
    expect(resolveSlot(C, 'ron', 'greet.warm', { act: 'act3' })?.lines).toEqual(['ron warm']);
  });

  it('step 3: shortens the slot name inside a pack before leaving it', () => {
    expect(slotChain('greet.warm.night')).toEqual(['greet.warm.night', 'greet.warm', 'greet']);
    expect(resolveSlot(C, 'ron', 'greet.warm.night')).toMatchObject({
      packId: 'ln_ron',
      slot: 'greet.warm',
    });
    // nothing in ron's pack under greet.cold or greet: the class layer's greet wins
    expect(resolveSlot(C, 'ron', 'greet.cold', LAYERS)).toMatchObject({
      packId: 'ln_class_adventurer',
      slot: 'greet',
    });
  });

  it('steps 4 to 7: role, then template, then class, then common', () => {
    expect(resolveSlot(C, 'ron', 'topic.gen_shop', LAYERS)?.packId).toBe('ln_role_vendor');
    expect(resolveSlot(C, 'ron', 'farewell', LAYERS)?.packId).toBe('ln_role_vendor');
    expect(resolveSlot(C, 'ron', 'farewell', { template: 'porter' })?.packId).toBe('ln_tpl_porter');
    expect(resolveSlot(C, 'ron', 'bark.work', { socialClass: 'adventurer' })?.packId).toBe(
      'ln_class_adventurer',
    );
    expect(resolveSlot(C, 'ron', 'bark.eat', LAYERS)?.packId).toBe('ln_common');
    expect(slotSources(C, 'ron', 'bark.work', LAYERS).map((s) => s.packId)).toEqual([
      'ln_tpl_porter',
      'ln_class_adventurer',
      'ln_common',
    ]);
  });

  it('step 8: nothing anywhere is null; a version must be asked for', () => {
    expect(resolveSlot(C, 'ron', 'react.insult', LAYERS)).toBeNull();
    expect(resolveSlot(C, 'ron', 'topic.gen_self')).toBeNull();
    expect(resolveSlot(C, 'ron', 'topic.gen_self', { version: 'K1' })).toMatchObject({
      version: 'K1',
      lines: ['ron self K1'],
    });
    expect(resolveSlot(C, 'ron', 'topic.gen_self', { version: 'K2' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('the selector (builtin_ai 7.4)', () => {
  const sel = (
    packs: LinePack[],
    slot: string,
    c: Partial<SelectContext> = {},
    h?: LineHistory,
    o = {},
  ) => selectLine(content(packs), 'ann', slot, ctx(c), rng(), h, o);
  const common = (lines: unknown[]): LinePack[] => [
    { id: 'ln_common', slots: { farewell: lines as LinePack['slots'][string] } },
  ];

  it('filters by when, first meeting, session and strict mood and place', () => {
    const packs = common([
      { zh: 'a', when: 'never_set' },
      { zh: 'b', first: true },
      { zh: 'c', mood: ['angry'], strict: true },
      { zh: 'd', place: ['tavern'], strict: true },
      'e',
    ]);
    expect(sel(packs, 'farewell')?.entry.zh).toBe('e');
    const key = (i: number) => lineKey('ln_common', 'farewell', i, { entry: i < 4 });
    expect(sel(packs, 'farewell', { saidThisSession: new Set([key(4)]) })).toBeNull();
    expect(
      sel(packs, 'farewell', { firstMeeting: true, saidThisSession: new Set([key(4)]) })?.entry.zh,
    ).toBe('b');
    expect(
      sel(packs, 'farewell', { mood: 'angry', saidThisSession: new Set([key(4)]) })?.entry.zh,
    ).toBe('c');
    expect(
      sel(packs, 'farewell', { place: 'tavern', saidThisSession: new Set([key(4)]) })?.entry.zh,
    ).toBe('d');
    expect(
      sel(packs, 'farewell', {
        holds: (w) => w === 'never_set',
        saidThisSession: new Set([key(4)]),
      })?.entry.zh,
    ).toBe('a');
  });

  it('a filtered-out level gives way to the next level of the chain', () => {
    const packs: LinePack[] = [
      { id: 'ln_ann', slots: { farewell: [{ zh: 'own', when: 'never_set' }] } },
      { id: 'ln_common', slots: { farewell: ['common'] } },
    ];
    expect(sel(packs, 'farewell')).toMatchObject({ packId: 'ln_common', entry: { zh: 'common' } });
  });

  it('weights: mood x2, place x1.5, time x1.3, freshness up to x2', () => {
    // a 2:1 mood preference shows in the draw frequencies
    const packs = common([{ zh: 'mood', mood: ['happy'] }, 'plain']);
    const n = { mood: 0, plain: 0 } as Record<string, number>;
    const r = rng(9);
    for (let i = 0; i < 3000; i++) {
      const s = selectLine(content(packs), 'ann', 'farewell', ctx({ mood: 'happy' }), r, undefined);
      n[s?.entry.zh as string]++;
    }
    expect((n.mood as number) / (n.plain as number)).toBeGreaterThan(1.7);
    expect((n.mood as number) / (n.plain as number)).toBeLessThan(2.3);
  });

  it('draws once from the named stream; one candidate draws nothing; same state, same line', () => {
    const packs = common(['a', 'b', 'c']);
    const st = { s: 21 };
    const one = selectLine(
      content(common(['only'])),
      'ann',
      'farewell',
      ctx(),
      new Rng(st),
      undefined,
    );
    expect(one?.draw).toBe(-1);
    expect(st.s).toBe(21);
    const a = selectLine(content(packs), 'ann', 'farewell', ctx(), rng(5), undefined);
    const b = selectLine(content(packs), 'ann', 'farewell', ctx(), rng(5), undefined);
    expect(a).toEqual(b);
    expect(a?.draw).toBeGreaterThanOrEqual(0);
  });

  it('topics rotate in order (7.7) without drawing', () => {
    const packs: LinePack[] = [
      { id: 'ln_common', slots: { 'topic.gen_work': { K0: ['one', 'two', 'three'] } } },
    ];
    const said = new Set<string>();
    const order: string[] = [];
    for (let i = 0; i < 3; i++) {
      const s = sel(packs, 'topic.gen_work', { saidThisSession: said }, undefined, {
        version: 'K0',
        rotate: true,
      });
      order.push(s?.entry.zh as string);
      said.add(s?.key as string);
      expect(s?.draw).toBe(-1);
    }
    expect(order).toEqual(['one', 'two', 'three']);
  });
});

describe('repetition suppression (builtin_ai 7.7)', () => {
  const packs: LinePack[] = [{ id: 'ln_common', slots: { greet: ['a', 'b'] } }];
  const keyOf = (i: number) => lineKey('ln_common', 'greet', i);

  it('a line said within the window is not chosen again', () => {
    const h = newLineHistory();
    recordLine(h, keyOf(0), 10);
    for (let s = 1; s < 30; s++) {
      const r = selectLine(content(packs), 'x', 'greet', ctx({ dayIndex: 16 }), rng(s), h, {
        suppressDays: suppressionDays('greet'),
      });
      expect(r?.entry.zh).toBe('b');
    }
    // after seven days it is back in the draw
    const seen = new Set<string>();
    for (let s = 1; s < 60; s++)
      seen.add(
        selectLine(content(packs), 'x', 'greet', ctx({ dayIndex: 17 }), rng(s), h, {
          suppressDays: 7,
        })?.entry.zh as string,
      );
    expect([...seen].sort()).toEqual(['a', 'b']);
  });

  it('when every line is suppressed, the oldest comes back first, before the next level', () => {
    const h = newLineHistory();
    recordLine(h, keyOf(1), 9);
    recordLine(h, keyOf(0), 10);
    const withCommon: LinePack[] = [
      { id: 'ln_x', slots: { greet: ['a', 'b'] } },
      { id: 'ln_common', slots: { greet: ['z'] } },
    ];
    const own = (i: number) => lineKey('ln_x', 'greet', i);
    const hx = newLineHistory();
    recordLine(hx, own(1), 9);
    recordLine(hx, own(0), 10);
    expect(
      selectLine(content(withCommon), 'x', 'greet', ctx({ dayIndex: 11 }), rng(), hx, {
        suppressDays: 7,
      })?.entry.zh,
    ).toBe('b');
    expect(
      selectLine(content(packs), 'x', 'greet', ctx({ dayIndex: 11 }), rng(), h, { suppressDays: 7 })
        ?.entry.zh,
    ).toBe('b');
  });

  it('keeps the newest 64 keys per pair, re-saying a line moves it to the end', () => {
    const h = newLineHistory();
    for (let i = 0; i < LINE_HISTORY_CAP + 5; i++) recordLine(h, `k${i}`, i);
    expect(h.order.length).toBe(LINE_HISTORY_CAP);
    expect(h.lastSaid.k0).toBeUndefined();
    expect(h.order[0]).toBe('k5');
    recordLine(h, 'k5', 100);
    expect(h.order.at(-1)).toBe('k5');
    expect(h.lastSaid.k5).toBe(100);
    expect(suppressionDays('bark.work')).toBe(3);
    expect(suppressionDays('react.insult')).toBe(7);
    expect(suppressionDays('topic.gen_work')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('ln_common migration (catalog_dialogue_lines 4.14)', () => {
  const ORIGINAL = [...originalTemplates, ...originalCognitionLines] as {
    id: string;
    lines: string[];
  }[];
  const legacy = Object.keys(CONTENT.legacyLines.keys);

  it('every former template key reads exactly its old lines, in order, from the packs', () => {
    expect(legacy.length).toBe(134);
    expect(new Set(legacy)).toEqual(new Set(ORIGINAL.map((o) => o.id)));
    for (const o of ORIGINAL)
      expect(
        legacyLines(CONTENT, o.id).map((l) => l.zh),
        o.id,
      ).toEqual(o.lines);
    // the shorter-key fallback still works (an unknown feat reads feat)
    expect(legacyLinesFor(CONTENT, 'feat.unknown_kind')).toEqual(['做了件了不得的事']);
    // the pinned digests are those of the original files
    for (const o of ORIGINAL) expect(LEGACY_DIGESTS[o.id], o.id).toBe(sliceDigest(o.lines));
  });

  it('places the lines as catalog 4.14 says, in the slot grammar', () => {
    const at = (k: string) => CONTENT.legacyLines.keys[k];
    expect(at('greet.first')).toMatchObject({ slot: 'greet.neutral' });
    expect(at('opinion.unaware')).toMatchObject({ slot: 'topic.gen_you', version: 'unaware' });
    expect(at('opinion.explaining.miracle')).toMatchObject({ slot: 'unbelief.explain.miracle' });
    expect(at('react.explain.gadget')).toMatchObject({ slot: 'unbelief.explain.gadget' });
    expect(at('appraise.crystal')).toMatchObject({
      pack: 'ln_lina',
      slot: 'react.identity_pageless',
    });
    expect(at('appraise.clergy')).toMatchObject({
      pack: 'ln_class_clergy',
      slot: 'react.identity_pageless',
    });
    const common = CONTENT.linePacks.find((p) => p.id === 'ln_common') as LinePack;
    const neutral = common.slots['greet.neutral'] as unknown[];
    // indexes 2 and 3 hold the first-meeting lines; later lines are only appended (7.1)
    expect(neutral.slice(2, 4)).toEqual([
      { zh: '头一回见啊，{player}。', first: true },
      { zh: '{player}？没见过你。新来的吧。', first: true },
    ]);
    // Lina's crystal lines are hers alone: nobody else falls back to them
    expect(resolveSlot(CONTENT, 'ron', 'react.identity_pageless')).toBeNull();
    expect(resolveSlot(CONTENT, 'lina', 'react.identity_pageless')?.packId).toBe('ln_lina');
    for (const pack of CONTENT.linePacks)
      for (const slot of Object.keys(pack.slots)) expect(slotProblem(slot), slot).toBeNull();
    expect(linePackFindings(CONTENT.linePacks).filter((f) => f.level === 'error')).toEqual([]);
  });

  it('the content check catches an edit that changes what an old key says', () => {
    const common = CONTENT.linePacks.find((p) => p.id === 'ln_common') as LinePack;
    const farewell = common.slots.farewell as string[];
    const withFarewell = (lines: unknown[]) =>
      ({
        ...CONTENT,
        linePacks: CONTENT.linePacks.map((p) =>
          p.id === 'ln_common' ? { ...p, slots: { ...p.slots, farewell: lines } } : p,
        ),
      }) as unknown as ContentMap;
    expect(validateDialogueContent(CONTENT)).toEqual([]);
    expect(validateDialogueContent(withFarewell(['回头见。', ...farewell])).join()).toContain(
      'legacy line key bye',
    );
    expect(validateDialogueContent(withFarewell([null, farewell[1]])).join()).toContain(
      'legacy line key bye',
    );
  });

  it('a picked line renders to the old sentence with the old draws (personas, kernel words)', () => {
    const lookup = extractContentText(CONTENT).table;
    const render = (v: unknown) =>
      formatText(v as never, { table: SOURCE_TABLE, lang: 'zh-Hans', content: (k) => lookup[k] });
    const picked = pickLine(CONTENT, 'rumor.none', {}, rng(1));
    expect(picked).toMatchObject({ key: expect.stringMatching(/^c\.line_packs\.ln_common\./) });
    expect(['最近没听到什么新鲜事。', '我可不爱嚼舌根。']).toContain(render(picked));
    const personas = (CONTENT.npcs ?? []).filter((p) => p.lines || p.voice.catchphrases.length > 0);
    const varSets: Record<string, TextParam>[] = [
      { player: '阁下', place: '酒馆', other: '玛莎', rumor: '有人打倒了狼' },
      { player: tr('sys.dialogue.address.sir'), place: tr('sys.dialogue.place.here') },
      {},
    ];
    let checked = 0;
    for (const k of legacy)
      for (const vars of varSets)
        for (const persona of [undefined, ...personas])
          for (let s = 1; s < 3; s++) {
            const own = persona?.lines?.[k];
            const lines = own ?? legacyLines(CONTENT, k).map((l) => l.zh);
            if (lines.length === 0) continue;
            const st = { s };
            const got = pickLine(CONTENT, k, vars, new Rng(st), persona);
            // the old voice, replayed: the same draws and the same filled sentence
            const ref = { s };
            const rr = new Rng(ref);
            const c =
              persona && persona.voice.catchphrases.length > 0
                ? rr.pick(persona.voice.catchphrases)
                : '';
            const want = fill(rr.pick(lines), { catch: c, ...vars }, true);
            expect(render(got), k).toBe(render(want));
            expect(st.s, `${k} draws`).toBe(ref.s);
            checked++;
          }
    expect(checked).toBeGreaterThan(5000);
  });

  it('phrase parts (feats, rumor fragments) are content keys too', () => {
    expect(firstLine(CONTENT, 'feat.kill')).toEqual({
      key: lineKey('ln_common', 'feat.kill', 0),
    });
    expect(firstLine(CONTENT, 'nothing.here')).toBe('');
  });

  it('every line key, base and act override, is the extracted content key of its text', () => {
    const table = extractContentText(CONTENT).table;
    const packs = [
      ...CONTENT.linePacks,
      {
        id: 'ln_probe',
        slots: { 'greet.warm.night': ['好。', { zh: '嗯。', w: 2 }, null, '三'] },
        acts: {
          act2: {
            farewell: ['回头。', { zh: '走。', mood: ['calm'] }],
            'topic.gen_you': { doubt: ['就你？'], K1: [null, '是。'] },
          },
        },
      },
    ] as LinePack[];
    // the runtime lookup keys every string (allStrings); the generated table only CJK text
    const probe = extractContentText({ linePacks: packs }, { allStrings: true }).table;
    let n = 0;
    for (const pack of packs) {
      const scopes: [string | undefined, LinePack['slots']][] = [
        [undefined, pack.slots],
        ...Object.entries(pack.acts ?? {}),
      ];
      for (const [act, slots] of scopes)
        for (const [slot, entry] of Object.entries(slots)) {
          const lists: [string | undefined, unknown[]][] = Array.isArray(entry)
            ? [[undefined, entry]]
            : Object.entries(entry);
          for (const [version, list] of lists)
            list.forEach((line, i) => {
              if (line === null) return;
              const zh = typeof line === 'string' ? line : (line as { zh: string }).zh;
              const key = lineKey(pack.id, slot, i, {
                act,
                version,
                entry: typeof line !== 'string',
              });
              expect(probe[key], key).toBe(zh);
              if (pack.id !== 'ln_probe' && CJK_TEST.test(zh)) expect(table[key], key).toBe(zh);
              n++;
            });
        }
    }
    expect(n).toBeGreaterThan(170);
    expect(t({ key: 'c.nope' })).toBe('c.nope');
  });
});

describe('selector rules from the review', () => {
  it('voids a line whose fill slot cannot be filled (builtin_ai 7.9)', () => {
    const packs: LinePack[] = [
      { id: 'ln_common', slots: { farewell: ['{catch}', '慢走，{player}。', '回头见。'] } },
    ];
    for (let s = 1; s < 40; s++) {
      const r = selectLine(
        content(packs),
        'x',
        'farewell',
        ctx({ unfillable: new Set(['catch', 'player']) }),
        rng(s),
        undefined,
      );
      expect(r?.entry.zh).toBe('回头见。');
    }
  });

  it('skips a deleted line (null) and keeps the later indexes', () => {
    const packs: LinePack[] = [{ id: 'ln_common', slots: { farewell: [null, '回头见。'] } }];
    const r = selectLine(content(packs), 'x', 'farewell', ctx(), rng(), undefined);
    expect(r).toMatchObject({ index: 1, key: lineKey('ln_common', 'farewell', 1) });
    const empty: LinePack[] = [{ id: 'ln_common', slots: { farewell: [null] } }];
    expect(resolveSlot(content(empty), 'x', 'farewell')).toBeNull();
  });

  it('falls back across topic versions as 7.3 says', () => {
    expect(versionCandidates('K3', 'knowledge')).toEqual(['K3', 'K2', 'K1', 'K0']);
    expect(versionCandidates('act3', 'act')).toEqual(['act3', 'act2', 'act1', 'prologue']);
    expect(versionCandidates('worship', 'cognition')).toEqual([
      'worship',
      'accepted',
      'wavering',
      'explaining',
      'doubt',
      'unaware',
    ]);
    expect(versionCandidates('explaining', 'cognition').slice(0, 3)).toEqual([
      'explaining',
      'doubt',
      'wavering',
    ]);
    expect(versionCandidates('mis', 'knowledge')).toEqual(['mis']);
    const packs: LinePack[] = [
      { id: 'ln_common', slots: { 'topic.gen_work': { K0: ['零'], K1: ['一'], mis: ['误'] } } },
    ];
    const at = (version: string, versionBy?: VersionBy) =>
      resolveSlot(content(packs), 'x', 'topic.gen_work', { version, versionBy })?.lines;
    expect(at('K4', 'knowledge')).toEqual(['一']);
    expect(at('K4')).toBeUndefined();
    expect(at('K0', 'knowledge')).toEqual(['零']);
  });

  it('weights: time-of-day lines get the time bonus, place and freshness multiply', () => {
    const c = (entry: { zh: string; when?: string; place?: string[] }) => ({
      packId: 'p',
      slot: 's',
      index: 0,
      key: 'k',
      entry,
    });
    expect(candidateWeight(c({ zh: '夜里好。', when: 'hour >= 18' }), ctx(), 0)).toBeCloseTo(2.6);
    expect(candidateWeight(c({ zh: '平常。' }), ctx(), 0)).toBeCloseTo(2);
    expect(
      candidateWeight(c({ zh: '你。', place: ['tavern'] }), ctx({ place: 'tavern' }), 10),
    ).toBeCloseTo(1.5);
    expect(candidateWeight(c({ zh: '久违。' }), ctx({ dayIndex: 15 }), 10)).toBeCloseTo(1.5);
  });

  it('accepts a tpl_ id for the resident template layer', () => {
    expect(chainPackIds('x', { template: 'tpl_porter' })).toContain('ln_tpl_porter');
    expect(chainPackIds('x', { template: 'porter' })).toContain('ln_tpl_porter');
  });
});

// ---------------------------------------------------------------------------
describe('line pack checks in the data gate (V8, builtin_ai 7.10)', () => {
  const errs = (packs: LinePack[]) =>
    linePackFindings(packs)
      .filter((f) => f.level === 'error')
      .map((f) => f.message);
  const one = (slots: LinePack['slots'], extra: Partial<LinePack> = {}) =>
    errs([{ id: 'ln_test', slots, ...extra }]);

  it('accepts a well-formed pack', () => {
    expect(
      one(
        {
          'greet.warm.night': ['来啦，{player}。'],
          'topic.gen_you': { doubt: ['就你？'], K1: ['嗯。'] },
          'topic.court_just': { justify: ['我有理由。'] },
          'react.switch.luck': ['那就是运气。'],
          'bark.vendor_call': [{ zh: '来看看！', mood: ['happy'], place: ['market'], w: 2 }],
          'quest.q_a1_m01_fall.offer': ['帮个忙？'],
          'mem.gift.folk': ['{who}送了我{item}。'],
        },
        { acts: { act2: { farewell: ['回头见。'] } } },
      ),
    ).toEqual([]);
  });

  it('reports a slot outside the grammar, a bad version and an unknown act', () => {
    const e = one(
      {
        'greet.lukewarm': ['嗯。'],
        'react.dance': ['嗯。'],
        'bark.dance': ['嗯。'],
        'quest.q_x.celebrate': ['嗯。'],
        'topic.weather': ['嗯。'],
        'topic.gen_you': { sleepy: ['嗯。'] },
        'unbelief.maybe': ['嗯。'],
        whisper: ['嗯。'],
      },
      { acts: { act9: { farewell: ['嗯。'] } } },
    ).join('\n');
    for (const want of [
      'greet band lukewarm',
      'react kind dance is not registered',
      'bark context dance is not registered',
      'quest stage celebrate',
      'topic id weather has no registered prefix',
      'version sleepy of topic.gen_you',
      'unbelief tier maybe',
      'unknown slot family whisper',
      'unknown act act9',
    ])
      expect(e).toContain(want);
  });

  it('reports bad line fields and values', () => {
    // malformed on purpose: the data gate reads raw JSON, not the typed shape
    const farewell = [
      { zh: '走吧。', mood: ['grumpy'] },
      { zh: '走吧。', place: ['moon'] },
      { zh: '走吧。', strict: true },
      { zh: '走吧。', w: 0 },
      { zh: '走吧。', when: '' },
      { zh: '走吧。', color: 'red' },
      { when: 'x' },
      '   ',
    ] as unknown as LinePack['slots'][string];
    const e = one({ farewell }).join('\n');
    for (const want of [
      'mood grumpy is not one of',
      'place moon is not a place kind',
      'strict without mood or place',
      'w must be a positive number',
      'when must be a non-empty condition',
      'unknown line field color',
      'a line is a string or an object with zh',
      'empty line',
    ])
      expect(e).toContain(want);
  });

  it('reports fill slots outside 7.9, overlong lines and forbidden characters', () => {
    const dash = String.fromCodePoint(0x2014);
    const e = one({
      greet: ['你好，{nickname}。', '长'.repeat(31), `好${dash}的`],
      'topic.gen_work': { K0: ['话'.repeat(81)] },
      'doc.notice.tax': ['文'.repeat(160)],
    }).join('\n');
    expect(e).toContain('fill slot {nickname}');
    expect(e).toContain('31 characters, over the greet limit 30');
    expect(e).toContain('81 characters, over the topic limit 80');
    expect(e).not.toContain('over the doc limit');
    expect(e).toContain('forbidden character U+2014');
    // placeholders do not count toward the length
    expect(one({ greet: [`${'长'.repeat(29)}{player}`] })).toEqual([]);
  });

  it('reports a bad pack id and an empty slot; warns on a line in three or more packs', () => {
    expect(errs([{ id: 'common', slots: {} }]).join()).toContain('ln_<name> or bark_<pool>');
    expect(one({ farewell: [] }).join()).toContain('slot farewell has no lines');
    expect(one({ farewell: [null] }).join()).toContain('slot farewell has no lines');
    // a deleted line (null) among live ones is fine
    expect(one({ farewell: [null, '回头见。'] })).toEqual([]);
    const same = ['ln_a', 'ln_b', 'ln_c'].map((id) => ({
      id,
      slots: { farewell: ['慢走。'] },
    }));
    const all = linePackFindings(same);
    expect(all.filter((f) => f.level === 'error')).toEqual([]);
    expect(
      all
        .filter((f) => f.level === 'warning')
        .map((f) => f.message)
        .join(),
    ).toContain('is in 3 packs');
    expect(linePackFindings(same.slice(0, 2)).filter((f) => f.level === 'warning')).toEqual([]);
  });

  it('reports versions off topics, party lines outside ln_party, odd placeholders, the tech term', () => {
    const e = errs([
      {
        id: 'ln_common',
        slots: {
          'greet.warm': { K1: ['你好。'] } as never,
          'party.camp_01': ['走吧。'],
          farewell: ['回头见，{ player }。', '{num, number}个。', '{Player}。'],
          'bark.work': [`这${String.fromCodePoint(0x6fb1)}真重。`],
        },
      },
    ]).join('\n');
    expect(e).toContain('only topic slots are split into versions');
    expect(e).toContain('party slots live only in ln_party');
    expect(e).toContain('placeholder { player } is not a fill slot');
    expect(e).toContain('placeholder {num, number} is not a fill slot');
    expect(e).toContain('placeholder {Player} is not a fill slot');
    expect(e).toContain('a shared layer says the folk terms only');
    // a speaker's own pack may say it, and ln_party holds party lines
    expect(
      errs([
        {
          id: 'ln_yeyu',
          speaker: 'yeyu',
          slots: { 'bark.work': [`${String.fromCodePoint(0x6fb1)}。`] },
        },
        { id: 'ln_party', slots: { 'party.camp_01': ['走吧。'] } },
      ]),
    ).toEqual([]);
  });

  it('lets a goddess pack register her own reaction kinds, nobody else', () => {
    const goddessPack = {
      id: 'ln_merca',
      speaker: 'merca',
      slots: { 'react.coin_first': ['好。'] },
    };
    expect(linePackFindings([goddessPack], { goddesses: new Set(['merca']) })).toEqual([]);
    expect(
      linePackFindings([goddessPack], { goddesses: new Set() })
        .map((f) => f.message)
        .join(),
    ).toContain('react kind coin_first is not registered');
  });

  it('grammar helpers: fill slots in order, version rules', () => {
    expect(fillSlotsOf('{player}在{place}，{player}')).toEqual(['player', 'place']);
    expect(versionProblem('topic.gen_you', 'worship')).toBeNull();
    expect(versionProblem('topic.court_fact', 'deny')).toBeNull();
    expect(versionProblem('topic.gen_work', 'deny')).toContain('deny');
  });
});

describe('V8 runs the line pack checks', () => {
  it('a violating pack in the content fails V8 through runValidators', async () => {
    const { runValidators } = await import('../tools/content/validators');
    const bad = {
      ...(CONTENT as unknown as Record<string, unknown>),
      linePacks: [...CONTENT.linePacks, { id: 'ln_bad', slots: { 'greet.lukewarm': ['嗯。'] } }],
    } as unknown as ContentMap;
    const [v8] = runValidators({ content: bad, packs: [], files: new Map(), milestone: 0 }, ['V8']);
    expect(v8?.ok).toBe(false);
    expect(v8?.findings.map((f) => f.message).join()).toContain('linePacks:ln_bad');
    const [good] = runValidators({ content: CONTENT, packs: [], files: new Map(), milestone: 0 }, [
      'V8',
    ]);
    expect(good?.findings.filter((f) => f.table === 'linePacks' && f.level === 'error')).toEqual(
      [],
    );
  });
});
