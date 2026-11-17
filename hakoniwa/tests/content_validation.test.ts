// The content pipeline (release_engineering.md 7.1 to 7.4; PK-M0-28, RE-24): the validators
// V1 to V10 are green on the shipped data, and every validator fails on a fixture that
// breaks its rule; the catalog extraction, the mappings against the real catalogs, and the
// batch staging, diff, overlay and promotion text. The command line tool
// (tools/content/validate.ts) runs exactly these validators over the same input.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { valuesAt } from '../src/content/paths';
import { collectRefs, danglingRefs } from '../src/content/references';
import type { ContentMap } from '../src/core/contracts';
import {
  applyBatch,
  BATCH_NAME,
  batchDiff,
  batchProblems,
  batchRecord,
  isToolingFile,
  openTodo,
  overlayContent,
  readIndex,
  reportMarkdown,
  type StagedBatch,
  targetProblems,
  withIndexEntry,
} from '../tools/content/catalog/batch';
import { extract, findTable, mappingProblems } from '../tools/content/catalog/mapping';
import { parseTables, rowId, splitRow } from '../tools/content/catalog/markdown';
import { copper, displayName, plain } from '../tools/content/catalog/parsers';
import { appendRecordsText, promotionWrites, quoteArg } from '../tools/content/import_cli';
import { loadValidationInput, ROOT } from '../tools/content/inputs';
import { MAPPINGS, mappingById } from '../tools/content/mappings';
import { familyLayer, firstAct, levels, loot } from '../tools/content/mappings/bestiary';
import { dianSources } from '../tools/content/mappings/gathering_crafting';
import {
  allOk,
  formatReport,
  runValidators,
  VALIDATORS,
  type ValidationInput,
  type ValidatorId,
} from '../tools/content/validators';
import { earliestActs } from '../tools/content/validators/acts';
import { assetFindings, assetStems } from '../tools/content/validators/assets';
import {
  balanceFindings,
  materialTiers,
  questXp,
  summonOnlyMonsters,
  tierForLevel,
} from '../tools/content/validators/balance';
import { ledgerFindings, worldWhere } from '../tools/content/validators/ledger';
import { nameFindings } from '../tools/content/validators/names';
import { namespaceFindings, namespaceOf } from '../tools/content/validators/namespace';
import { reachFindings } from '../tools/content/validators/reach';
import { appearanceFindings, schemaFindings } from '../tools/content/validators/schema';
import { textFindings } from '../tools/content/validators/text';
import { milestoneIndex } from '../tools/content/validators/types';

type Row = Record<string, unknown>;

let real: ValidationInput;

beforeAll(() => {
  real = loadValidationInput({ milestone: 0 });
}, 120_000);

/** The real input with tables replaced or extended (a shallow content copy). */
function withTables(
  patch: Record<string, unknown[]>,
  base: ValidationInput = real,
): ValidationInput {
  const content = { ...(base.content as unknown as Record<string, unknown>) };
  for (const [table, rows] of Object.entries(patch)) content[table] = rows;
  return { ...base, content: content as unknown as ContentMap };
}

function rows(input: ValidationInput, table: string): Row[] {
  return (input.content as unknown as Record<string, Row[]>)[table] ?? [];
}

function run(id: ValidatorId, input: ValidationInput) {
  const v = VALIDATORS.find((x) => x.id === id);
  if (!v) throw new Error(id);
  return v.run(input);
}

const errors = (fs: { level: string; message: string }[]) =>
  fs.filter((f) => f.level === 'error').map((f) => f.message);
const warnings = (fs: { level: string; message: string }[]) =>
  fs.filter((f) => f.level === 'warning').map((f) => f.message);

describe('validators on the shipped data', () => {
  it('runs the ten layers in order', () => {
    expect(VALIDATORS.map((v) => v.id)).toEqual([
      'V1',
      'V2',
      'V3',
      'V4',
      'V5',
      'V6',
      'V7',
      'V8',
      'V9',
      'V10',
    ]);
  });

  it('V1 to V10 are all green at M0', () => {
    const results = runValidators(real);
    const failing = results.filter((r) => !r.ok);
    expect(failing.map((r) => formatReport([r]).join('\n'))).toEqual([]);
    expect(allOk(results)).toBe(true);
  }, 120_000);

  it('loads the data without the tooling directories', () => {
    expect([...real.files.keys()].some(isToolingFile)).toBe(false);
    expect(real.files.has('combat/items.json')).toBe(true);
    expect(real.codeSources && Object.keys(real.codeSources).length).toBeGreaterThan(50);
  });
});

describe('V1 schema', () => {
  it('reports a duplicate id and a pack rule', () => {
    const items = rows(real, 'items');
    const dup = withTables({ items: [...items, { ...(items[0] as Row) }] });
    expect(errors(run('V1', dup)).some((m) => m.includes('duplicate id'))).toBe(true);
    const bad = withTables({ items: [...items, { ...(items[0] as Row), id: 'x_bad', value: -1 }] });
    expect(errors(run('V1', bad)).some((m) => m.includes('negative value'))).toBe(true);
  });

  it('applies the pack schemas row by row', () => {
    const schema = real.packs.flatMap((p) => p.schemas ?? []).find((s) => s.table === 'items');
    if (!schema) throw new Error('no item schema');
    const files = new Map([[schema.file, [{ id: 'x_item', kind: 'nope', quality: 9 }]]]);
    const msgs = schemaFindings([schema], files).map((f) => f.message);
    expect(msgs.some((m) => m.includes('name: required value missing'))).toBe(true);
    expect(msgs.some((m) => m.includes('kind: value not in'))).toBe(true);
    expect(msgs.some((m) => m.includes('quality: 9 outside 0 to 5'))).toBe(true);
  });

  it('shape-checks every appearance with the world system rules', () => {
    const monsters = rows(real, 'monsters');
    expect(appearanceFindings(real.content)).toEqual([]);
    const m = monsters[0] as Row;
    const bad = withTables({
      monsters: [
        ...monsters,
        { ...m, id: 'x_mon', appearance: { sheet: 'art_por_x', portrait: 'not an id' } },
      ],
    });
    const msgs = errors(appearanceFindings(bad.content));
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toContain("sheet 'art_por_x' should start with");
    expect(msgs[1]).toContain('is not an asset id');
    expect(errors(run('V1', bad)).some((x) => x.includes('monsters x_mon'))).toBe(true);
  });
});

describe('V2 references', () => {
  it('finds every declared reference field and a dangling one', () => {
    expect(danglingRefs(real.content)).toEqual([]);
    expect(collectRefs(real.content).length).toBeGreaterThan(1000);
    const monsters = rows(real, 'monsters');
    const bad = withTables({
      monsters: [
        ...monsters,
        { ...(monsters[0] as Row), id: 'x_mon', loot: [{ itemId: 'nope', chance: 1 }] },
      ],
    });
    expect(errors(run('V2', bad))).toEqual([
      "monsters:x_mon loot[0].itemId: no items row has id 'nope'",
    ]);
  });

  it('follows ability and aura references: companion avoid lists, hit and phase auras, item auras', () => {
    const monsters = rows(real, 'monsters');
    const companions = rows(real, 'companions');
    const items = rows(real, 'items');
    const bad = withTables({
      monsters: [
        ...monsters,
        {
          ...(monsters[0] as Row),
          id: 'x_mon',
          loot: [],
          mechanics: {
            onHit: [{ aura: 'aur_x_none', chance: 1 }],
            phases: [{ belowPct: 0.5, name: 'x', aura: 'aur_y_none' }],
          },
        },
      ],
      companions: [...companions, { ...(companions[0] as Row), id: 'x_comp', avoid: ['fear'] }],
      items: [
        ...items,
        { ...(items[0] as Row), id: 'x_item', use: { effect: 'aura', ability: 'well_fed' } },
      ],
    });
    expect(errors(run('V2', bad)).sort()).toEqual([
      "companions:x_comp avoid[0]: no abilities row has id 'fear'",
      "items:x_item use.ability: no auras row has id 'well_fed'",
      "monsters:x_mon mechanics.onHit[0].aura: no auras row has id 'aur_x_none'",
      "monsters:x_mon mechanics.phases[0].aura: no auras row has id 'aur_y_none'",
    ]);
  });

  it('checks kill objectives, speakers and scene line speakers without a name label', () => {
    const quests = rows(real, 'quests');
    const scenes = rows(real, 'scenes');
    const q = quests[0] as Row;
    const s = scenes[0] as Row;
    const bad = withTables({
      quests: [
        ...quests,
        {
          ...q,
          id: 'q_x_refs',
          onStart: [{ type: 'say', speaker: 'nobody_x', text: 'x' }],
          stages: [{ objectives: [{ type: 'kill', ref: 'no_beast_x', count: 1 }] }],
        },
      ],
      scenes: [
        ...scenes,
        {
          ...s,
          id: 'x_scene',
          nodes: [
            {
              id: 'n',
              lines: [
                { speaker: 'ghost_x', text: 'a' },
                { speaker: 'passer_x', name: '路人', text: 'b' },
              ],
            },
          ],
        },
      ],
    });
    const msgs = errors(run('V2', bad));
    expect(msgs).toContain(
      "quests:q_x_refs stages[0].objectives[0].ref: no monsters or waves row has id 'no_beast_x'",
    );
    expect(msgs.some((m) => m.startsWith('quests:q_x_refs onStart[0].speaker:'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('scenes:x_scene nodes[0].lines[0].speaker:'))).toBe(true);
    expect(msgs.some((m) => m.includes('passer_x'))).toBe(false);
  });

  it('addresses nested fields, object wildcards and leaves', () => {
    const row = {
      a: [{ b: 'x' }, { b: 'y' }],
      m: { p: ['1'], q: ['2', '3'] },
      d: { e: { f: 'z' } },
    };
    expect(valuesAt(row, 'a[].b').map((v) => `${v.path}=${v.value}`)).toEqual([
      'a[0].b=x',
      'a[1].b=y',
    ]);
    expect(valuesAt(row, 'm.*[]').map((v) => v.path)).toEqual(['m.p[0]', 'm.q[0]', 'm.q[1]']);
    expect(valuesAt(row, 'd.**')).toEqual([{ path: 'd.e.f', value: 'z' }]);
    expect(valuesAt(row, 'missing.x')).toEqual([]);
  });
});

describe('V3 namespaces', () => {
  it('picks the longest prefix', () => {
    expect(namespaceOf('pet_retainer_x')?.prefix).toBe('pet_');
    expect(namespaceOf('src_pale_1')?.tables).toEqual(['items']);
    expect(namespaceOf('grey_wolf')).toBeUndefined();
  });

  it('reports a prefix in the wrong table, an unprefixed strict id and a kind collision', () => {
    const items = rows(real, 'items');
    const quests = rows(real, 'quests');
    const npcs = rows(real, 'npcs');
    const bad = withTables({
      items: [...items, { ...(items[0] as Row), id: 'q_not_an_item' }],
      quests: [...quests, { ...(quests[0] as Row), id: 'a_quest_without_prefix' }],
      npcs: [...npcs, { ...(npcs[0] as Row), id: 'grey_wolf' }],
    });
    const msgs = errors(run('V3', bad));
    expect(msgs.some((m) => m.startsWith('items:q_not_an_item: prefix q_ belongs to'))).toBe(true);
    expect(msgs).toContain('quests:a_quest_without_prefix: every quests id carries q_');
    expect(
      msgs.some((m) => m.startsWith('grey_wolf: one id names several kinds (monster, person)')),
    ).toBe(true);
  });

  it('keeps abilities and auras on their own numbering and takes a contract fiend template', () => {
    const abilities = rows(real, 'abilities');
    const auras = rows(real, 'auras');
    const monsters = rows(real, 'monsters');
    const bad = withTables({
      abilities: [...abilities, { ...(abilities[0] as Row), id: 'heroic_strike' }],
      auras: [...auras, { ...(auras[0] as Row), id: 'rend' }],
      monsters: [...monsters, { ...(monsters[0] as Row), id: 'fiend_x_template' }],
    });
    const msgs = errors(run('V3', bad));
    expect(msgs).toContain('abilities:heroic_strike: every abilities id carries sk_');
    expect(msgs).toContain('auras:rend: every auras id carries aur_');
    expect(msgs.filter((m) => m.includes('fiend_x_template'))).toEqual([]);
    expect(rows(real, 'monsters').some((m) => m.id === 'fiend_colossus_remnant')).toBe(true);
  });

  it('keeps the place codes shared and reports a stale legacy entry', () => {
    expect(namespaceFindings(real)).toEqual([]);
    const stale = namespaceFindings(real, {
      legacy: [{ table: 'items', id: 'gone_item', reason: 'x' }],
    }).map((f) => f.message);
    expect(stale.some((m) => m.includes('items:gone_item no longer exists'))).toBe(true);
    // a legacy id outside the list is a finding again
    expect(errors(namespaceFindings(real, { legacy: [] })).length).toBeGreaterThan(0);
  });
});

describe('V4 variable registry', () => {
  it('reports an unregistered flag in a condition', () => {
    const quests = rows(real, 'quests');
    const bad = withTables({
      quests: [
        ...quests,
        { ...(quests[0] as Row), id: 'q_x_test', trigger: 'zz_unregistered_flag' },
      ],
    });
    expect(
      errors(run('V4', bad)).some((m) => m.includes('zz_unregistered_flag is not registered')),
    ).toBe(true);
  });
});

describe('V5 reveal ledger', () => {
  const monster = (desc: string): Row => ({
    ...(rows(real, 'monsters')[0] as Row),
    id: 'x_mon',
    desc,
  });

  it('blocks a forbidden term at the earliest act the text is visible', () => {
    const bad = withTables({ monsters: [...rows(real, 'monsters'), monster('雅努的使者')] });
    const msgs = errors(ledgerFindings(bad, []));
    expect(msgs.some((m) => m.startsWith('monsters:x_mon desc: 雅努 still locked in act1'))).toBe(
      true,
    );
  });

  it('warns on a lore keyword, not blocks', () => {
    const bad = withTables({ monsters: [...rows(real, 'monsters'), monster('它的牙一模一样')] });
    const fs = ledgerFindings(bad, []).filter((f) => f.row === 'x_mon');
    expect(fs.map((f) => f.level)).toEqual(['warning']);
  });

  it('honours a reviewed hit until its milestone, then blocks; a stale entry is an error', () => {
    const bad = withTables({ monsters: [...rows(real, 'monsters'), monster('雅努的使者')] });
    const reviewed = [
      { table: 'monsters', row: 'x_mon', path: 'desc', term: '雅努', until: 'M1', reason: 'test' },
    ];
    const at0 = ledgerFindings({ ...bad, milestone: 0 }, reviewed).filter((f) => f.row === 'x_mon');
    expect(at0.map((f) => f.level)).toEqual(['warning']);
    const at1 = ledgerFindings({ ...bad, milestone: 1 }, reviewed).filter((f) => f.row === 'x_mon');
    expect(at1.map((f) => f.level)).toEqual(['error']);
    const stale = errors(ledgerFindings(real, [...reviewed]));
    expect(stale.some((m) => m.includes('matches no hit'))).toBe(true);
  });

  it('judges a revealed name once its condition holds, and acts from tables and references', () => {
    const w = worldWhere({ meta: { flags: { act: 'act1' } } }, 'a2_faceless_projection');
    expect(w.meta.flags.a2_faceless_projection).toBe(true);
    const acts = earliestActs(real.content);
    expect(acts.of('epilogue', 'rel_god_janu')).toBe(7);
    expect(acts.of('scenes', 'cut_p_earth')).toBe(0);
    expect(acts.of('monsters', 'faceless_king')).toBeGreaterThanOrEqual(5);
  });
});

describe('V6 numeric bands', () => {
  it('blocks a level outside the act band and a wrong tier', () => {
    const monsters = rows(real, 'monsters');
    const base = monsters[0] as Row;
    const bad = withTables({
      monsters: [
        ...monsters,
        { ...base, id: 'x_low', act: 'act1', minLevel: 20, maxLevel: 22 },
        { ...base, id: 'x_tier', act: 'act2', minLevel: 16, maxLevel: 18, tier: 'T3' },
        { ...base, id: 'x_boss', act: 'act1', minLevel: 19, maxLevel: 20, rank: 'boss' },
      ],
    });
    const msgs = errors(balanceFindings(bad));
    expect(msgs).toContain('monsters:x_low: level 20 to 22 outside act 1 band 1 to 15');
    expect(msgs).toContain('monsters:x_tier: tier T3 is content level 20 to 34, row is 16 to 18');
    expect(msgs.some((m) => m.startsWith('monsters:x_boss'))).toBe(false);
  });

  it('warns on a material price off its tier band', () => {
    const items = rows(real, 'items');
    const bad = withTables({
      items: [
        ...items,
        { id: 'part_fang_t1', name: 'x', kind: 'material', quality: 1, value: 900, desc: 'x' },
      ],
    });
    expect(warnings(balanceFindings(bad))).toContain(
      'items:part_fang_t1: value 900 outside the T1 material band 2 to 20 copper',
    );
    expect(materialTiers('src_pale_2')).toEqual([3, 4]);
    expect(tierForLevel(35)).toBe(4);
  });

  it('judges monsters at the act the content places them: warns at M0, blocks from M1', () => {
    const inferred = <F extends { message: string }>(fs: F[]) =>
      fs.filter((f) => f.message.includes('act inferred'));
    // the PK-M0-29 rescale left every placed monster of the real data inside its band
    expect(inferred(balanceFindings(real))).toEqual([]);
    expect(errors(balanceFindings({ ...real, milestone: 1 }))).toEqual([]);
    // a monster of an act 1 map (wandering_bones, ash_waste) moved out of the act 1 band
    const deep = (patch: Row) =>
      withTables({
        monsters: rows(real, 'monsters').map((m) =>
          m.id === 'wandering_bones' ? { ...m, minLevel: 30, maxLevel: 34, ...patch } : m,
        ),
      });
    const at0 = inferred(balanceFindings(deep({})));
    expect(at0.map((f) => [f.row, f.level])).toEqual([['wandering_bones', 'warning']]);
    expect(errors(balanceFindings({ ...deep({}), milestone: 1 }))).toEqual([
      'monsters:wandering_bones: level 30 to 34 outside act 1 band 1 to 15 (act inferred from where the content places it)',
    ]);
    // the bestiary act a row declares wins over the inference (and blocks at once)
    expect(errors(balanceFindings({ ...deep({ act: 'act3' }), milestone: 1 }))).toEqual([]);
    expect(errors(balanceFindings(deep({ act: 'act2' })))).toEqual([
      'monsters:wandering_bones: level 30 to 34 outside act 2 band 15 to 30',
    ]);
  });

  it('leaves a monster only summons place to its summoner level (a warlock imp)', () => {
    expect(summonOnlyMonsters(real.content).has('contract_imp')).toBe(true);
    expect(summonOnlyMonsters(real.content).has('dian_spirit')).toBe(false);
    expect(errors(balanceFindings({ ...real, milestone: 1 })).join('\n')).not.toContain(
      'contract_imp',
    );
    expect(
      balanceFindings(real).some(
        (f) =>
          f.level === 'info' &&
          f.message.includes('only summons place') &&
          f.message.includes('contract_imp'),
      ),
    ).toBe(true);
    // placed by a map as well, the same row is judged again
    const placed = withTables({
      maps: rows(real, 'maps').map((m) =>
        m.id === 'forest_edge'
          ? {
              ...m,
              spawns: [
                ...((m.spawns as unknown[]) ?? []),
                { id: 'x_imp', kind: 'monster', ref: 'contract_imp', x: 1, y: 1 },
              ],
            }
          : m,
      ),
    });
    expect(summonOnlyMonsters(placed.content).has('contract_imp')).toBe(false);
    expect(errors(balanceFindings({ ...placed, milestone: 1 })).join('\n')).toContain(
      'monsters:contract_imp: level 1 to 60 outside act 1 band',
    );
  });

  it('counts every xp effect of a quest: start, stages and rewards', () => {
    expect(
      questXp({
        onStart: [{ type: 'xp', amount: 5 }],
        stages: [
          { onEnter: [{ type: 'xp', amount: 10 }], onComplete: [{ type: 'xp', amount: 20 }] },
          { onComplete: [{ type: 'flag', key: 'x', value: true }] },
        ],
        rewards: [
          { type: 'money', amount: 999 },
          { type: 'xp', amount: 40 },
        ],
      }),
    ).toBe(75);
    // the rescaled act 1 main line of progression 18.1 (q_a1_m07_spring is data side)
    const act1 = rows(real, 'quests').filter((q) => q.act === 'act1' && q.kind === 'main');
    expect(act1.reduce((s, q) => s + questXp(q), 0)).toBe(21190);
  });
});

describe('V7 asset references', () => {
  const withArt = (milestone: number): ValidationInput => ({
    ...real,
    files: new Map([
      ...real.files,
      ['x/test.json', [{ id: 'x_item', icon: 'art_ico_item_nothing_here', cue: 'sfx_none_x' }]],
    ]),
    milestone,
  });
  const mine = (input: ValidationInput) =>
    assetFindings(input).filter((f) => f.file === 'x/test.json');

  it('checks asset ids in every data file: warns before M4, blocks from M4', () => {
    expect(mine(withArt(0)).map((f) => f.level)).toEqual(['warning', 'warning']);
    expect(mine(withArt(4)).map((f) => f.level)).toEqual(['error', 'error']);
    expect(mine(withArt(0))[0]?.message).toBe(
      'x/test.json [0].icon: asset art_ico_item_nothing_here is not in the requirement list',
    );
  });

  it('accepts a sheet subject one segment short, not a shorter stem', () => {
    const stems = assetStems(['art_mon_dian_rat_d']);
    expect(stems.has('art_mon_dian_rat')).toBe(true);
    expect(stems.has('art_mon_dian')).toBe(false);
  });

  it('reports rows without art and a missing requirement list', () => {
    const monsters = rows(real, 'monsters');
    const bad = withTables({
      monsters: [...monsters, { ...(monsters[0] as Row), id: 'x_no_art' }],
    });
    const count = (input: ValidationInput) =>
      Number(/^monsters: (\d+) of/.exec(warnings(assetFindings(input)).join('\n'))?.[1] ?? 0);
    expect(count(bad)).toBe(count(real) + 1);
    expect(assetFindings({ ...real, assetIds: undefined }).map((f) => f.level)).toEqual([
      'warning',
    ]);
  });
});

describe('V8 text', () => {
  it('reports an empty text, an overlong name and a forbidden character', () => {
    const items = rows(real, 'items');
    const base = items[0] as Row;
    const bad = withTables({
      items: [
        ...items,
        { ...base, id: 'x_empty', desc: '  ' },
        { ...base, id: 'x_long', name: '名'.repeat(21) },
      ],
    });
    const msgs = errors(textFindings({ ...bad, files: new Map() }));
    expect(msgs).toContain('items:x_empty desc: empty player text');
    expect(msgs).toContain('items:x_long name: 21 characters, over the name limit 20');
    const dash = String.fromCodePoint(0x2014);
    const files = new Map([['x/test.json', [{ id: 'x', text: `a${dash}b` }]]]);
    expect(
      errors(textFindings({ content: real.content, files })).some((m) => m.includes('U+2014')),
    ).toBe(true);
  });

  it('accepts the declared blank texts (the narrator, a wordless revelation)', () => {
    expect(errors(run('V8', real))).toEqual([]);
  });
});

describe('V9 reachability', () => {
  it('reports a quest nothing can start and a missing ending scene', () => {
    const quests = rows(real, 'quests');
    const scenes = rows(real, 'scenes');
    const bad = withTables({
      quests: [
        ...quests,
        { ...(quests[0] as Row), id: 'q_x_orphan', trigger: 'a1_never_written_flag_x' },
      ],
      scenes: scenes.filter((s) => s.id !== 'ending_maker'),
    });
    const msgs = errors(reachFindings(bad));
    expect(msgs.some((m) => m.startsWith('quests:q_x_orphan: unreachable'))).toBe(true);
    expect(msgs).toContain('ending maker: no scene ending_maker');
  }, 60_000);

  it('warns on missing ending routes before M3 and blocks from M3', () => {
    expect(
      warnings(reachFindings(real)).filter((m) => m.includes('no autoplayer route')).length,
    ).toBe(9);
    const at3 = errors(reachFindings({ ...real, milestone: 3 }));
    expect(at3.filter((m) => m.includes('no autoplayer route')).length).toBe(9);
  }, 60_000);
});

describe('V10 proper nouns', () => {
  const names = [
    { category: 'woc.zones', blockingFrom: 0, names: ['Eastbrook', '东溪谷'] },
    { category: 'woc.skills', blockingFrom: 0, names: ['英勇打击'] },
  ];
  const files = new Map<string, unknown>([
    ['x/a.json', [{ id: 'a', name: '来自东溪谷的人', desc: 'Welcome to Eastbrook Vale' }]],
    ['x/b.json', [{ id: 'heroic_strike', name: '英勇打击' }]],
  ]);

  it('blocks a main-project name in any category', () => {
    expect(errors(nameFindings({ files, milestone: 0, names }, []))).toHaveLength(3);
  });

  it('waives a reviewed hit until its milestone; a stale entry is an error', () => {
    const reviewed = [{ file: 'x/b.json', name: '英勇打击', until: 'M1', reason: 'test' }];
    const at0 = nameFindings({ files, milestone: 0, names }, reviewed);
    expect(errors(at0)).toHaveLength(2);
    expect(warnings(at0)).toHaveLength(1);
    expect(warnings(at0)[0]).toContain("x/b.json [0].name: woc.skills name '英勇打击'; reviewed");
    expect(errors(nameFindings({ files, milestone: 1, names }, reviewed))).toHaveLength(3);
    const stale = [{ file: 'x/none.json', name: '英勇打击', until: 'M1', reason: 'test' }];
    expect(errors(nameFindings({ files: new Map(), milestone: 0, names }, stale))).toEqual([
      "names_reviewed.json: x/none.json '英勇打击' matches no hit (remove the stale entry)",
    ]);
  });

  it('the shipped data hits no main-project or known-work name, now or from M1', () => {
    // the first-round skill names were renamed with the sk_ numbering (PK-M1-26)
    expect(nameFindings({ ...real, milestone: 0 })).toEqual([]);
    expect(nameFindings({ ...real, milestone: 1 })).toEqual([]);
  });

  it('matches Latin names on word boundaries and skips identifiers', () => {
    const plain = new Map<string, unknown>([
      ['x/c.json', { a: 'Eastbrookish', b: 'eastbrook_vale' }],
    ]);
    expect(nameFindings({ files: plain, milestone: 0, names }, [])).toEqual([]);
    const ui = nameFindings(
      { files: new Map(), milestone: 0, names, uiText: { k: 'Eastbrook!' } },
      [],
    );
    expect(errors(ui)).toEqual(["ui text k: woc.zones name 'Eastbrook'"]);
  });
});

describe('catalog extraction', () => {
  it('splits rows with code spans and escaped pipes', () => {
    expect(splitRow('| `a|b` | x \\| y | z |')).toEqual(['`a|b`', 'x | y', 'z']);
    const tables = parseTables(
      '# H\n\n## 1.2 T\n\n| ID | 名 |\n| --- | --- |\n| `x_a` | 甲 |\n| 无 | 乙 |\n',
    );
    expect(tables).toHaveLength(1);
    expect(tables[0]?.headingPath).toEqual(['H', '1.2 T']);
    expect(tables[0]?.rows.map(rowId)).toEqual(['x_a', null]);
  });

  it('parses prices, names and designer notes', () => {
    expect(copper('60 铜（教会收购 80 铜）')).toBe(60);
    expect(copper('2.2 银')).toBe(220);
    expect(copper('1,500 铜')).toBe(1500);
    expect(copper('有价无市')).toBeUndefined();
    expect(copper('1 银 20 铜')).toBe(120);
    expect(copper('1 金 50 银')).toBe(15000);
    // a word outside the parenthesis means the author reads the cell
    expect(copper('8 铜收购（药铺零售 30 铜）')).toBeUndefined();
    expect(displayName('铁矿石（已有）')).toBe('铁矿石');
    expect(plain('苍白【真相】不能说。可以说')).toBe('苍白可以说');
  });

  it('extracts the sediment sources of the gathering catalog', () => {
    const md = readFileSync(join(ROOT, dianSources.catalog), 'utf8');
    const ex = extract(md, dianSources, ['src_pale_1', 'src_hollow_1']);
    expect(ex.records).toEqual([
      {
        id: 'src_pale_1',
        name: '瓷骨屑',
        kind: 'material',
        quality: 1,
        value: 60,
        desc: '苍白、薄，像碎瓷',
        tags: ['tainted'],
      },
      {
        id: 'src_hollow_1',
        name: '空隙骨',
        kind: 'material',
        quality: 1,
        value: 50,
        desc: '有门形空洞的骨',
        tags: ['tainted'],
      },
    ]);
    expect(new Set(ex.unmapped.map((u) => u.column))).toEqual(
      new Set(['档', '典型来源地带', '去处', '价值', '备注']),
    );
    expect(ex.todo).toEqual([]);
    expect(() => extract(md, dianSources, ['src_nope_9'])).not.toThrow();
    expect(extract(md, dianSources, ['src_nope_9']).missing).toEqual(['src_nope_9']);
  });

  it('every mapping is consistent and finds its table in its catalog', () => {
    const cache = new Map<string, string>();
    for (const m of MAPPINGS) {
      expect(mappingProblems(m), m.id).toEqual([]);
      const md = cache.get(m.catalog) ?? readFileSync(join(ROOT, m.catalog), 'utf8');
      cache.set(m.catalog, md);
      const table = findTable(parseTables(md), m);
      expect(typeof table === 'string' ? table : 'found', m.id).toBe('found');
    }
    expect(mappingById('gathering.dian_sources')).toBe(dianSources);
  });

  it('maps bestiary cells: levels, family and layer, first act, drops', () => {
    expect(levels('1到3')).toEqual([1, 3]);
    expect(levels('21')).toEqual([21, 21]);
    expect(familyLayer('beast E')).toEqual({ family: 'beast', rank: 'elite' });
    expect(familyLayer('humanoid N（混族）')).toEqual({ family: 'humanoid' });
    expect(firstAct('瓦伦河谷与边石镇南田（一）')).toBe('act1');
    expect(firstAct('锈岭矿口（一到二）')).toBe('act1');
    expect(loot('`hide` 70%、`part_meat_t1` 80%、晶1 40%、`src_hollow_1` 10%')).toEqual([
      { itemId: 'hide', chance: 0.7 },
      { itemId: 'part_meat_t1', chance: 0.8 },
      { itemId: 'dian_shard', chance: 0.4 },
      { itemId: 'src_hollow_1', chance: 0.1 },
    ]);
    // counts, upgrades and notes leave the whole cell to the author
    expect(loot('`mat_thick_hide` 两份、`part_fang_t2` 60%')).toBeUndefined();
    expect(loot('晶2 60%（10% 升晶3）')).toBeUndefined();
    const lotha = mappingById('bestiary.lotha');
    if (!lotha) throw new Error('no lotha mapping');
    const md = readFileSync(join(ROOT, lotha.catalog), 'utf8');
    const ex = extract(md, lotha, ['field_hare']);
    expect(ex.records[0]).toMatchObject({
      id: 'field_hare',
      name: '田野兔',
      family: 'beast',
      minLevel: 1,
      maxLevel: 3,
      act: 'act1',
      faction: 'monster',
    });
    expect(ex.todo.map((t) => t.field).sort()).toEqual(['aggroRadius', 'desc', 'leash']);
  });
});

describe('content batches', () => {
  const batch = (records: Row[]): StagedBatch => ({
    batch: 'content_test_items_01',
    status: 'staged',
    scope: 'test',
    depends: [],
    parts: [
      {
        mapping: 'gathering.dian_sources',
        catalog: 'x',
        section: '3.8',
        target: { file: 'combat/items.json', table: 'items' },
        records,
        unmapped: [],
        todo: [],
      },
    ],
    steps: [{ step: 1, name: 'scope', at: '2026-11-16' }],
  });
  const fresh: Row = {
    id: 'src_test_1',
    name: '测',
    kind: 'material',
    quality: 1,
    value: 50,
    desc: '测。',
    tags: ['tainted'],
  };

  it('names, structure and the index', () => {
    expect(BATCH_NAME.test('content_act1_items_01')).toBe(true);
    expect(BATCH_NAME.test('act1_items')).toBe(false);
    expect(batchProblems(batch([fresh]))).toEqual([]);
    expect(batchProblems({ batch: 'x', parts: [] })).toEqual(['bad batch name', 'no parts']);
    const idx = withIndexEntry(readIndex(undefined), { batch: 'b', status: 'staged', file: 'f' });
    expect(withIndexEntry(idx, { batch: 'b', status: 'promoted', file: 'g' }).batches).toEqual([
      { batch: 'b', status: 'promoted', file: 'g' },
    ]);
  });

  it('diffs, overlays and applies a batch without touching other files', () => {
    const existing = rows(real, 'items').find((r) => r.id === 'dian_shard') as Row;
    const b = batch([fresh, { ...existing, value: 16 }]);
    const diff = batchDiff(b, real.files);
    expect(diff[0]?.added).toEqual(['src_test_1']);
    expect(diff[0]?.changed).toEqual([{ id: 'dian_shard', fields: ['value'] }]);
    const files = applyBatch(real.files, b);
    expect(files.get('economy/items.json')).toBe(real.files.get('economy/items.json'));
    const content = overlayContent(real.content, real.files, b);
    const items = (content as unknown as { items: Row[] }).items;
    expect(items.find((r) => r.id === 'src_test_1')).toEqual(fresh);
    expect(items.filter((r) => r.id === 'dian_shard')).toHaveLength(1);
    expect(items.find((r) => r.id === 'dian_shard')?.value).toBe(16);
    const record = batchRecord({ ...b, status: 'promoted' }, diff);
    expect(record.added).toEqual(['src_test_1']);
    expect(reportMarkdown(record, diff)).toContain('added: src_test_1');
  });

  it('lists the required fields still open', () => {
    const b = batch([{ id: 'src_test_1', name: '测', value: 1 }]);
    expect(openTodo(b, (m) => mappingById(m)?.required ?? [])).toEqual([
      { id: 'src_test_1', field: 'desc', reason: 'required field not filled' },
    ]);
  });

  it('validates as if promoted', () => {
    const b = batch([{ ...fresh, desc: '' }]);
    const input = loadValidationInput({ milestone: 0, batch: b });
    const results = runValidators(input, ['V1', 'V8']);
    expect(results.find((r) => r.id === 'V8')?.ok).toBe(false);
  }, 60_000);

  it('appends records to an array file as text, keeping its blank lines', () => {
    const text = '[\n  { "id": "a" },\n\n  { "id": "b" }\n]\n';
    // new rows take the data files' row style (one field per line, the editor's formatJson)
    expect(appendRecordsText(text, [{ id: 'c', n: 1 }])).toBe(
      '[\n  { "id": "a" },\n\n  { "id": "b" },\n  {\n    "id": "c",\n    "n": 1\n  }\n]\n',
    );
    expect(appendRecordsText('[]\n', [{ id: 'c' }])).toBe('[\n  {\n    "id": "c"\n  }\n]\n');
    expect(appendRecordsText('{ "items": [] }', [{ id: 'c' }])).toBeNull();
  });

  it('folds parts on one file in order, the same in overlay, files and diff', () => {
    const existing = rows(real, 'items').find((r) => r.id === 'dian_shard') as Row;
    const two: StagedBatch = {
      ...batch([fresh, { id: 'dian_shard', value: 16 }]),
      parts: [
        { ...batch([fresh, { id: 'dian_shard', value: 16 }]).parts[0] },
        {
          ...batch([]).parts[0],
          mapping: 'gathering.materials_3_4',
          records: [{ id: 'dian_shard', desc: '新的描述。' }],
        },
      ] as StagedBatch['parts'],
    };
    const files = applyBatch(real.files, two);
    const fileRows = files.get('combat/items.json') as Row[];
    const inFile = fileRows.find((r) => r.id === 'dian_shard');
    // both parts apply; fields no record carries stay (merge, not replace)
    expect(inFile).toEqual({ ...existing, value: 16, desc: '新的描述。' });
    expect(fileRows.filter((r) => r.id === 'src_test_1')).toHaveLength(1);
    const content = overlayContent(real.content, real.files, two);
    const inContent = (content as unknown as { items: Row[] }).items.find(
      (r) => r.id === 'dian_shard',
    );
    expect(inContent).toEqual(inFile);
    const diff = batchDiff(two, real.files);
    expect(diff).toHaveLength(1);
    expect(diff[0]?.added).toEqual(['src_test_1']);
    expect(diff[0]?.changed).toEqual([{ id: 'dian_shard', fields: ['value', 'desc'] }]);
  });

  it('checks targets: a file no pack loads, a single-row file, an id living elsewhere', () => {
    const schemas = real.packs
      .flatMap((p) => p.schemas ?? [])
      .map((s) => ({ file: s.file, table: s.table, idField: s.idField }));
    expect(targetProblems(batch([fresh]), real.files, schemas)).toEqual([]);
    const stray = batch([fresh]);
    stray.parts[0] = {
      ...(stray.parts[0] as StagedBatch['parts'][0]),
      target: { file: 'combat/stray.json', table: 'items' },
    };
    expect(targetProblems(stray, real.files, schemas)).toEqual([
      'combat/stray.json: no content pack loads it into table items',
    ]);
    const elsewhere = batch([{ ...fresh, id: 'grain' }]);
    expect(targetProblems(elsewhere, real.files, schemas)).toEqual([
      'items:grain already lives in economy/items.json; update it there',
    ]);
    const single = batch([{ id: 'x_map' }]);
    single.parts[0] = {
      ...(single.parts[0] as StagedBatch['parts'][0]),
      target: { file: 'combat/maps/seal_ruins.json', table: 'maps' },
    };
    expect(targetProblems(single, real.files, schemas)).toContain(
      'combat/maps/seal_ruins.json: a single-row file only takes its own row seal_ruins',
    );
    expect(batchProblems({ ...batch([fresh, fresh]) })).toEqual([
      'part 0: record src_test_1 appears twice',
    ]);
    expect(batchProblems(stray)).toEqual([]);
    const tooling = batch([fresh]);
    tooling.parts[0] = {
      ...(tooling.parts[0] as StagedBatch['parts'][0]),
      target: { file: '_staging/x.json', table: 'items' },
    };
    expect(batchProblems(tooling)).toEqual([
      'part 0: target _staging/x.json is not a data file path',
    ]);
  });

  it('promotion writes: append to an array file, keep a keyed file keyed, skip a done file', () => {
    const keyed = { version: 1, items: [{ id: 'a', name: 'A' }] };
    const b = batch([{ id: 'b', name: 'B' }]);
    b.parts[0] = {
      ...(b.parts[0] as StagedBatch['parts'][0]),
      target: { file: 'k/keyed.json', table: 'items' },
    };
    const files = new Map<string, unknown>([['k/keyed.json', keyed]]);
    const writes = promotionWrites(b, files, () => JSON.stringify(keyed));
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]?.text ?? '')).toEqual({
      version: 1,
      items: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
    const arr = [{ id: 'a' }];
    const text = '[\n  {\n    "id": "a"\n  }\n]\n';
    const b2 = batch([{ id: 'b' }]);
    b2.parts[0] = {
      ...(b2.parts[0] as StagedBatch['parts'][0]),
      target: { file: 'k/arr.json', table: 'items' },
    };
    const w2 = promotionWrites(b2, new Map([['k/arr.json', arr]]), () => text);
    expect(w2[0]?.text).toBe('[\n  {\n    "id": "a"\n  },\n  {\n    "id": "b"\n  }\n]\n');
    // already promoted: nothing to write
    expect(
      promotionWrites(b2, new Map([['k/arr.json', [{ id: 'a' }, { id: 'b' }]]]), () => text),
    ).toEqual([]);
  });

  it('records commands as typed', () => {
    expect(quoteArg('--batch')).toBe('--batch');
    expect(quoteArg('a b')).toBe('"a b"');
    expect(milestoneIndex('m2')).toBe(2);
    expect(() => milestoneIndex('M9')).toThrow();
  });
});
