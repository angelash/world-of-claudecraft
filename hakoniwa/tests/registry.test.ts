// The world-state variable registry (docs/40_design/world_state_registry.md, PK-M0-27):
// the generator (tools/registry/parse.ts) and the freshness of data/registry/vars.json,
// the run-time resolver and the flag guard, the loader, the fourteen content rules of
// section 9.3 one by one, and the zero-alias guard over data/ and src/.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { canonEdits, canonicalizeContent } from '../src/content/registry_canon';
import { collectFlagUses } from '../src/content/registry_refs';
import { nameProblem, registryProblems } from '../src/content/registry_rules';
import type { ContentMap, FlagValue } from '../src/core/contracts';
import { defaultRegistry, FlagRegistry } from '../src/core/registry';
import type { RegistryData, VarDef } from '../src/core/registry/types';
import type { GameSystem } from '../src/core/system';
import { indexCode, stripComments } from '../src/editor/quests/flag_index';
import { createGame } from '../src/game/create';
import { defaultFlagPolicy, guardSystems, UnregisteredFlagError } from '../src/game/flag_guard';
import { evaluate, flagResolver, rewriteCondition } from '../src/systems/quests/conditions';
import { PARSE_OPTIONS } from '../tools/registry/options';
import {
  alignValueAliases,
  expandRanges,
  formatRegistry,
  parseConversion,
  parseRegistry,
} from '../tools/registry/parse';

const ROOT = join(__dirname, '..');
const DOC = readFileSync(join(ROOT, 'docs/40_design/world_state_registry.md'), 'utf8');
const registry = defaultRegistry();

// ---------------------------------------------------------------------------
// Generator

describe('registry generator (tools/registry/parse.ts)', () => {
  it('data/registry/vars.json is the current output of the document (rerun is stable)', () => {
    const a = formatRegistry(parseRegistry(DOC, PARSE_OPTIONS).data);
    const b = formatRegistry(parseRegistry(DOC, PARSE_OPTIONS).data);
    expect(a).toBe(b);
    const file = readFileSync(join(ROOT, 'data/registry/vars.json'), 'utf8').replace(/\r\n/g, '\n');
    expect(file).toBe(a);
  });

  it('sorts names and families and every alias, writer and reader list', () => {
    const { data } = parseRegistry(DOC, PARSE_OPTIONS);
    const sorted = (xs: string[]) => [...xs].sort();
    expect(data.vars.map((v) => v.name)).toEqual(sorted(data.vars.map((v) => v.name)));
    expect(data.families.map((v) => v.name)).toEqual(sorted(data.families.map((v) => v.name)));
    for (const v of [...data.vars, ...data.families]) {
      expect(v.aliases, v.name).toEqual(sorted(v.aliases));
      expect(v.writers, v.name).toEqual(sorted(v.writers));
    }
  });

  it('reads a section 8 table, a family, aliases, value aliases and a conversion', () => {
    const md = [
      '## 6. 编号',
      '### 6.2 现有',
      '| 现有 ID | 设计编号 | 规范数据编号 |',
      '| --- | --- | --- |',
      '| `a1_m01_fall` | A1-M01 | `q_a1_m01_fall` |',
      '## 7. 对照',
      '### 7.4 量纲',
      '| 读到的写法 | 规范名 | 说明 |',
      '| --- | --- | --- |',
      '| `front_<线>` | `front.<线>` | 族 |',
      '| `hero_rel_<人>`（-100 到 100） | `trust.<人物 ID>`（0 到 100） | 信任 = (关系 + 100) ÷ 2，换算 |',
      '### 7.6 枚举值',
      '| 变量 | 规范值 | 值别名 |',
      '| --- | --- | --- |',
      '| `front.*` | `held`、`lost` | 守住、失守 |',
      '## 8. 总表',
      '### 8.2 全局量',
      '| 规范名 | 别名 | 类型 | 范围或取值 | 首次写入 | 读取处 |',
      '| --- | --- | --- | --- | --- | --- |',
      '| `seal_looseness` | `door_seal`、`SEAL` | 小数 | 0 到 100，半分 | 开门（doors） | 结局 |',
      '### 8.3 剧情标记',
      '| 规范名 | 别名 | 首次写入 | 读取处 |',
      '| --- | --- | --- | --- |',
      '| `a1_ash_met` | `met_ash` | A1-M01（`q`） | `s1` |',
      '### 8.5 族',
      '| 规范名 | 别名 | 类型 | 键与取值 | 首次写入 | 读取处 |',
      '| --- | --- | --- | --- | --- | --- |',
      '| `trust.<人>` | `bond.<人>` | 整数 | 人物 ID；0 到 100 | 任务效果（`q`） | 门钥 |',
      '| `front.<线>` | 无 | 枚举 | `north`、`east`；`held`、`lost` | 结算 | 结局 |',
    ].join('\n');
    const { data } = parseRegistry(md);
    const seal = data.vars.find((v) => v.name === 'seal_looseness') as VarDef;
    expect(seal).toMatchObject({ kind: 'num', scope: 'global', range: [0, 100], step: 0.5 });
    expect(seal.aliases).toEqual(['SEAL', 'door_seal']);
    expect(seal.writers).toContain('doors');
    const met = data.vars.find((v) => v.name === 'a1_ash_met') as VarDef;
    expect(met).toMatchObject({ kind: 'flag', scope: 'act_flag', act: 1, monotone: true });
    expect(met.aliases).toEqual(['met_ash']);
    expect(met.writers).toContain('content');
    const front = data.families.find((f) => f.name === 'front.<front>');
    expect(front?.slots).toEqual([{ name: 'front', domain: 'front', keys: ['north', 'east'] }]);
    expect(front?.values).toEqual(['held', 'lost']);
    expect(front?.aliases).toEqual(['front_<front>']);
    expect(data.families.find((f) => f.name === 'trust.<npc>')?.aliases).toEqual(['bond.<npc>']);
    expect(data.valueAliases['front.*']).toEqual({ 失守: 'lost', 守住: 'held' });
    expect(data.conversions).toEqual([
      { from: 'hero_rel_<npc>', to: 'trust.<npc>', scale: 0.5, offset: 50 },
    ]);
    expect(data.questIds).toEqual({ a1_m01_fall: 'q_a1_m01_fall' });
  });

  it('expands ranges, aligns value aliases and parses conversion formulas', () => {
    expect(expandRanges('`R01` 到 `R03`、`x`')).toEqual(['R01', 'R02', 'R03', 'x']);
    expect(expandRanges('`act1` 到 `act3`')).toEqual(['act1', 'act2', 'act3']);
    expect(alignValueAliases(['a', 'b'], '`A`、`B`')).toEqual({ A: 'a', B: 'b' });
    expect(alignValueAliases(['x', 'y'], '一；二、`two`')).toEqual({ 一: 'x', 二: 'y', two: 'y' });
    expect(alignValueAliases(['self_collapse'], '`collapse` 即 `self_collapse`')).toEqual({
      collapse: 'self_collapse',
    });
    expect(parseConversion('关系 = 好感 × 25')).toEqual({ scale: 25, offset: 0 });
    expect(parseConversion('声望 = 信任 × 2 - 100')).toEqual({ scale: 2, offset: -100 });
    expect(parseConversion('信任 = 50 + 档 × 15')).toEqual({ scale: 15, offset: 50 });
    expect(parseConversion('同量纲')).toBeNull();
  });

  it('registers the variables of this round (feature flags, doors, maps, warfare, goddess catalogue)', () => {
    for (const name of [
      'feature.board',
      'feature.sight',
      'feature.messenger',
      'term.dian_known',
      'a3_ash_warning_doors',
      'door_rank',
      'seal_points',
      'seal_stage',
      'blockage',
      'door_fatigue',
      'act.4.entered',
      'a1_ruins_gate_cleared',
      'a1_mine_cleared',
      'a3_reedpond_resonance',
      'a2_castle_well_open',
      'a3_bonefield_result',
      'a3_deer_ford_result',
      'a3_second_front',
      'a4_boundary_war',
      'ring_node.R03',
      'eluen_fear',
      'merca_stake',
      'hostility.valda.act3.count',
    ]) {
      expect(registry.isRegistered(name), name).toBe(true);
    }
    // the old spellings of the same things are aliases
    expect(registry.canonical('a1_dian_term_heard')).toBe('term.dian_known');
    expect(registry.canonical('seal_looseness_known')).toBe('a3_ash_warning_doors');
    expect(registry.canonical('castle_well_open')).toBe('a2_castle_well_open');
  });
});

// ---------------------------------------------------------------------------
// Run time

describe('run-time resolver (src/core/registry)', () => {
  it('resolves canonical names, family members, aliases, keys and quest ids', () => {
    expect(registry.resolve('seal_looseness')).toMatchObject({
      name: 'seal_looseness',
      alias: false,
    });
    expect(registry.resolve('trust.oola')).toMatchObject({ name: 'trust.oola', alias: false });
    expect(registry.resolve('trust.ola')).toMatchObject({ name: 'trust.oola', alias: true });
    expect(registry.resolve('door_seal')).toMatchObject({ name: 'seal_looseness', alias: true });
    expect(registry.resolve('verdict_eluen')).toMatchObject({ name: 'verdict.eluen', alias: true });
    expect(registry.resolve('front_north')).toMatchObject({ name: 'front.north', alias: true });
    expect(registry.resolve('prologue.earth_opening')?.name).toBe('p_earth_opening');
    expect(registry.resolve('evidence.oracle_text')?.name).toBe('evidence.E15');
    expect(registry.resolve('quest.a1_m05_hunt')?.name).toBe('quest.q_a1_m04_hunt');
    expect(registry.resolve('quest.a1_m05')?.name).toBe('quest.q_a1_m04_hunt');
    expect(registry.resolve('no_such_flag')).toBeNull();
    expect(registry.resolve('front.west')).toBeNull();
  });

  it('converts numeric aliases and reads condition aliases', () => {
    const favor = registry.resolve('merca_favor');
    expect(favor?.name).toBe('goddess.merca.relation');
    expect(favor && registry.canonicalWrite(favor, 2)).toBe(50);
    expect(favor && registry.aliasView(favor, 75)).toBe(3);
    expect(registry.resolve('bond.shiya.40')?.condition).toBe('trust.shiya >= 40');
  });

  it('maps value aliases (and yes or no to booleans) and keeps defaults', () => {
    expect(registry.canonicalValue('a5_purge_route', 'gods')).toBe('god');
    expect(registry.canonicalValue('a5_purge_route', '众生')).toBe('people');
    expect(registry.canonicalValue('verdict.eluen', 'willing')).toBe('voluntary');
    expect(registry.canonicalValue('a4_night_pact', '是')).toBe(true);
    expect(registry.canonicalValue('p_courtyard_object', '一盏台灯')).toBe('lamp');
    expect(registry.valueLabel('p_courtyard_object', 'lamp')).toBe('一盏台灯');
    expect(registry.defaultOf('continent')).toBe(70);
    expect(registry.defaultOf('a1_ash_met')).toBe(false);
    expect(registry.defaultOf('a1_oola_fate')).toBeUndefined();
  });

  it('the condition resolver reads aliases, defaults and derived quantities', () => {
    const ev = (expr: string, flags: Record<string, FlagValue>) =>
      evaluate(expr, flagResolver(flags));
    expect(ev('door_seal >= 10', { seal_looseness: 12 })).toBe(true);
    expect(ev('merca_favor >= 2', { 'goddess.merca.relation': 50 })).toBe(true);
    expect(ev('merca_favor >= 2', { 'goddess.merca.relation': 25 })).toBe(false);
    expect(ev('bond.yeyu.40', { 'trust.yeyu': 41 })).toBe(true);
    expect(ev('continent >= 70', {})).toBe(true);
    const lies = {
      'lie_exposed.eluen': true,
      'lie_exposed.valda': true,
      'lie_exposed.merca': true,
      'lie_exposed.sylvie': true,
      'lie_exposed.moira': true,
    };
    expect(ev('a4_lies_exposed >= 5', lies)).toBe(true);
    expect(ev('a4_lies_exposed >= 5', { ...lies, a4_lies_exposed: 2 })).toBe(false);
  });

  it('rewrites variables and enum literals of a condition in place', () => {
    const rename = (v: string) => registry.canonical(v);
    const lit = (v: string, x: string) => String(registry.canonicalValue(v, x));
    expect(rewriteCondition('purge_route == gods AND NOT met_ash', rename, lit)).toBe(
      'a5_purge_route == god AND NOT a1_ash_met',
    );
    expect(rewriteCondition("prologue.earth_opening IN (A, 'B')", rename, lit)).toBe(
      "p_earth_opening IN (a, 'b')",
    );
    expect(rewriteCondition('COUNT(door_seal >= 3, act_index >= 2) >= 1', rename, lit)).toBe(
      'COUNT(seal_looseness >= 3, act >= 2) >= 1',
    );
    expect(rewriteCondition('a1_oola_fate=convicted', rename, lit)).toBe('a1_oola_fate=convicted');
  });
});

describe('flag guard on the systems (src/game/flag_guard.ts)', () => {
  const writer = (key: string, value: FlagValue): GameSystem => ({
    id: 'writer',
    order: 0,
    init(ctx) {
      ctx.setFlag(key, value);
    },
  });

  it('tests run as a development build (unregistered writes throw by default)', () => {
    expect(defaultFlagPolicy()).toBe('throw');
  });

  it('throws on a write of an unregistered name in a development build', () => {
    expect(() =>
      createGame({ systems: [writer('not_in_registry', true)], flagPolicy: 'throw' }),
    ).toThrow(UnregisteredFlagError);
  });

  it('logs and writes in a release build', () => {
    const logs: string[] = [];
    const systems = guardSystems([writer('not_in_registry', 1)], registry, 'log', (m) =>
      logs.push(m),
    );
    const g = createGame({ systems, flagPolicy: 'log' });
    expect(g.world.meta.flags.not_in_registry).toBe(1);
    expect(logs).toEqual([
      'system writer wrote world flag not_in_registry, which the variable registry does not list',
    ]);
  });

  it('writes and reads through aliases on the canonical flag (with conversion)', () => {
    const seen: (FlagValue | undefined)[] = [];
    const sys: GameSystem = {
      id: 'aliases',
      order: 0,
      init(ctx) {
        ctx.setFlag('door_seal', 7);
        ctx.setFlag('merca_favor', 2);
        ctx.setFlag('purge_route', 'gods');
        seen.push(ctx.flag('SEAL'), ctx.flag('merca_favor'), ctx.flag('a5_purge_route'));
      },
    };
    const g = createGame({ systems: [sys], flagPolicy: 'throw' });
    const f = g.world.meta.flags;
    expect(f.seal_looseness).toBe(7);
    expect(f['goddess.merca.relation']).toBe(50);
    expect(f.a5_purge_route).toBe('god');
    expect(f.door_seal).toBeUndefined();
    expect(seen).toEqual([7, 2, 'god']);
  });

  it('the shipped systems write only registered names over a game day', () => {
    const g = createGame({ seed: 3, flagPolicy: 'throw' });
    expect(() => g.step(20 * 60 * 24)).not.toThrow();
    for (const key of Object.keys(g.world.meta.flags)) {
      expect(registry.isCanonical(key), key).toBe(true);
    }
  });
});

describe('loader (src/content/registry_canon.ts)', () => {
  it('loads a legacy table with canonical names, values and quest ids', () => {
    const legacy = {
      quests: [
        {
          id: 'a1_m05_hunt',
          act: 'act1',
          trigger: 'quest.a1_m04_register == done AND NOT met_ash',
          stages: [],
          rewards: [
            { type: 'flag', key: 'purge_route', value: 'gods' },
            { type: 'quest', quest: 'a1_m06_grey_wolf' },
          ],
        },
      ],
    } as unknown as ContentMap;
    const { content, edits } = canonicalizeContent(legacy, registry);
    const q = (content as unknown as { quests: Record<string, unknown>[] }).quests[0] as Record<
      string,
      unknown
    >;
    expect(q.id).toBe('q_a1_m04_hunt');
    expect(q.trigger).toBe('quest.q_a1_m03_register == done AND NOT a1_ash_met');
    expect(q.rewards).toEqual([
      { type: 'flag', key: 'a5_purge_route', value: 'god' },
      { type: 'quest', quest: 'q_a1_m05_grey_wolf' },
    ]);
    expect(edits.length).toBe(5);
    // the input is not changed
    expect((legacy as unknown as { quests: { id: string }[] }).quests[0]?.id).toBe('a1_m05_hunt');
  });

  it('the shipped content loads unchanged', () => {
    expect(canonicalizeContent(buildContent(), registry).edits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The fourteen rules of section 9.3, each with a case that breaks it

const MINI: RegistryData = {
  version: 1,
  source: 'test',
  vars: [
    v({ name: 'a1_x', kind: 'flag', scope: 'act_flag', act: 1, aliases: ['old_x'] }),
    v({ name: 'a2_y', kind: 'enum', scope: 'act_exit', act: 2, values: ['a', 'b'] }),
    v({ name: 'cnt', kind: 'int', range: [0, 10] }),
    v({ name: 'deriv', kind: 'int', derive: 'COUNT(a1_x)' }),
    v({ name: 'mirror.thing', kind: 'flag', scope: 'mirror', writers: ['quests'] }),
    v({ name: 'set_v', kind: 'set' }),
    v({ name: 'sys_only', kind: 'int', writers: ['strategy'] }),
    v({ name: 'shown', kind: 'enum', visibility: 'player', values: ['on'] }),
    v({ name: 'quiet', kind: 'int', writers: [], readers: [] }),
  ],
  families: [
    {
      ...v({ name: 'trust.<npc>', kind: 'int', scope: 'family', range: [0, 100] }),
      slots: [{ name: 'npc', domain: 'npc', keys: null }],
    },
  ],
  valueAliases: { a2_y: { 甲: 'a' } },
  conversions: [],
  patternAliases: [],
  keyAliases: {},
  questIds: {},
  keyDomains: { npc: 'npcs#id' },
};

function v(o: Partial<VarDef> & { name: string; kind: VarDef['kind'] }): VarDef {
  return {
    scope: 'global',
    range: null,
    step: null,
    default: null,
    values: null,
    aliases: [],
    writers: ['content'],
    readers: ['content'],
    derive: null,
    monotone: o.kind === 'flag',
    act: null,
    visibility: 'hidden',
    ai: 'ledger',
    label: `var.${o.name}`,
    source: 'test',
    ...o,
  };
}

const mini = new FlagRegistry(MINI);

function rules(tables: Record<string, unknown>, milestone = 0): string[] {
  const content = { npcs: [{ id: 'ola' }], ...tables } as unknown as ContentMap;
  return registryProblems(content, mini, { milestone }).map(
    (p) => `${p.level}:${p.rule}:${p.message}`,
  );
}

function quest(act: string, rewards: unknown[], trigger?: string) {
  return { quests: [{ id: 'q', act, trigger, stages: [], rewards }] };
}

const has = (list: string[], prefix: string) => list.some((l) => l.startsWith(prefix));

describe('section 9.3 rules (src/content/registry_rules.ts)', () => {
  it('passes a clean table', () => {
    const errors = rules(
      quest('act1', [{ type: 'flag', key: 'a1_x', value: true }], 'cnt >= 2'),
    ).filter((l) => l.startsWith('error'));
    expect(errors).toEqual([]);
  });

  it('rule 1: every name read or written resolves', () => {
    expect(has(rules(quest('act1', [], 'nope')), 'error:1:')).toBe(true);
    expect(has(rules({ waves: [{ id: 'w', endOnFlag: 'nope' }] }), 'error:1:')).toBe(true);
    expect(has(rules({ npcs: [{ id: 'ola', trustKey: 'nope.x' }] }), 'error:1:')).toBe(true);
  });

  it('rule 2: family keys belong to their domain', () => {
    expect(has(rules(quest('act1', [], 'trust.nobody >= 1')), 'error:2:')).toBe(true);
    expect(has(rules(quest('act1', [], 'trust.ola >= 1')), 'error:2:')).toBe(false);
  });

  it('rule 3: an alias warns until M2 and is an error from M2', () => {
    const t = quest('act1', [{ type: 'flag', key: 'old_x', value: true }]);
    expect(has(rules(t), 'warning:3:')).toBe(true);
    expect(has(rules(t, 2), 'error:3:')).toBe(true);
  });

  it('rule 4: conditions parse, enum literals, IN items and HAS on sets', () => {
    expect(has(rules(quest('act2', [], 'a2_y = a')), 'error:4:')).toBe(true);
    expect(has(rules(quest('act2', [], 'a2_y == c')), 'error:4:')).toBe(true);
    expect(has(rules(quest('act2', [], 'a2_y IN (a, z)')), 'error:4:')).toBe(true);
    expect(has(rules(quest('act2', [], 'cnt HAS a')), 'error:4:')).toBe(true);
    expect(has(rules(quest('act2', [], 'set_v HAS a AND a2_y IN (a, b)')), 'error:4:')).toBe(false);
  });

  it('rule 5: written values match the kind and range; add and append by kind', () => {
    expect(has(rules(quest('act1', [{ type: 'flag', key: 'cnt', value: 11 }])), 'error:5:')).toBe(
      true,
    );
    expect(has(rules(quest('act1', [{ type: 'flag', key: 'cnt', value: 'x' }])), 'error:5:')).toBe(
      true,
    );
    expect(has(rules(quest('act2', [{ type: 'flag', key: 'a2_y', value: 'c' }])), 'error:5:')).toBe(
      true,
    );
    expect(has(rules(quest('act1', [{ type: 'add', key: 'set_v', amount: 1 }])), 'error:5:')).toBe(
      true,
    );
    expect(
      has(rules(quest('act1', [{ type: 'append', key: 'cnt', value: 'x' }])), 'error:5:'),
    ).toBe(true);
  });

  it('rule 6: a story flag is never written false', () => {
    expect(
      has(rules(quest('act1', [{ type: 'flag', key: 'a1_x', value: false }])), 'error:6:'),
    ).toBe(true);
  });

  it('rule 7: act-prefixed quantities are read from their act on and written in their act', () => {
    expect(has(rules(quest('act1', [], 'a2_y == a')), 'error:7:')).toBe(true);
    expect(has(rules(quest('act3', [], 'a2_y == a')), 'error:7:')).toBe(false);
    expect(has(rules(quest('act3', [{ type: 'flag', key: 'a2_y', value: 'a' }])), 'error:7:')).toBe(
      true,
    );
  });

  it('rule 8: content writes only what lists content, never a system mirror', () => {
    expect(
      has(rules(quest('act1', [{ type: 'flag', key: 'mirror.thing', value: true }])), 'error:8:'),
    ).toBe(true);
    expect(
      has(rules(quest('act1', [{ type: 'add', key: 'sys_only', amount: 1 }])), 'error:8:'),
    ).toBe(true);
  });

  it('rule 9: derived quantities are never written', () => {
    expect(has(rules(quest('act1', [{ type: 'flag', key: 'deriv', value: 1 }])), 'error:9:')).toBe(
      true,
    );
  });

  it('rule 10: a registered variable without writer or reader is reported', () => {
    expect(
      rules({}).filter((l) => l.startsWith('warning:10:') && l.includes('quiet')),
    ).toHaveLength(2);
  });

  it('rule 11: visible enum values need a text key', () => {
    expect(has(rules({}), 'warning:11:registry: no text key var.shown.on')).toBe(true);
    const content = { npcs: [] } as unknown as ContentMap;
    const withKey = registryProblems(content, mini, { textKeys: new Set(['var.shown.on']) });
    expect(withKey.some((p) => p.rule === 11)).toBe(false);
  });

  it('rule 12: no Chinese enum values in data', () => {
    expect(
      has(rules(quest('act2', [{ type: 'flag', key: 'a2_y', value: '甲' }])), 'error:12:'),
    ).toBe(true);
    expect(has(rules(quest('act2', [], "a2_y == '甲'")), 'error:12:')).toBe(true);
  });

  it('rule 13: ledger clues and terms unlock on registered names only', () => {
    expect(has(rules({ lore: [{ id: 'l', unlock: 'nope' }] }), 'error:13:')).toBe(true);
    expect(has(rules({ terms: [{ id: 't', unlock: 'a1_x' }] }), 'error:13:')).toBe(false);
  });

  it('rule 14: names have the section 2.1 form and length', () => {
    expect(nameProblem('a1_x')).toBeNull();
    expect(nameProblem('evidence.E07')).toBeNull();
    expect(nameProblem('Bad.name')).not.toBeNull();
    expect(nameProblem('a.b.c.d.e')).not.toBeNull();
    expect(nameProblem(`a${'x'.repeat(64)}`)).not.toBeNull();
  });

  it('the shipped content passes every error rule, and its door keys and gates are reads', () => {
    const content = buildContent();
    const problems = registryProblems(content, registry);
    expect(
      problems.filter((p) => p.level === 'error').map((p) => `${p.rule}: ${p.message}`),
    ).toEqual([]);
    expect(problems.filter((p) => p.rule === 3)).toEqual([]);
    const uses = collectFlagUses(content).uses;
    expect(uses.some((u) => u.table === 'doors' && u.via === 'door key' && u.kind === 'read')).toBe(
      true,
    );
    expect(uses.some((u) => u.via === 'hideWhen' && u.name === 'a1_oola_fate')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Zero aliases in data/ and src/ (section 10 steps 2 and 3)

function files(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p, ext));
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

const DATA_TABLES: Record<string, string> = {
  'doors/doors.json': 'doors',
  'quests/quests.json': 'quests',
};

describe('zero aliases in data/ (migration batch content_base_registry_01)', () => {
  const dataFiles = files(join(ROOT, 'data'), '.json')
    .map((f) => relative(join(ROOT, 'data'), f).replace(/\\/g, '/'))
    .filter((f) => !/^(registry|llm|audio)\//.test(f));

  it('every data file is at canonical names, values and quest ids', () => {
    const edits: string[] = [];
    for (const rel of dataFiles) {
      const json = JSON.parse(readFileSync(join(ROOT, 'data', rel), 'utf8'));
      for (const e of canonEdits(DATA_TABLES[rel] ?? rel, json, registry)) {
        edits.push(`${rel} ${e.path.join('.')}: ${e.from} -> ${e.to}`);
      }
    }
    expect(edits).toEqual([]);
  });

  it('text slots {flag:...} and door keys name canonical variables', () => {
    const bad: string[] = [];
    for (const rel of dataFiles) {
      const text = readFileSync(join(ROOT, 'data', rel), 'utf8');
      for (const m of text.matchAll(/\{flag:([A-Za-z0-9_.:-]+)\}/g)) {
        if (!registry.isCanonical(m[1] as string)) bad.push(`${rel}: {flag:${m[1]}}`);
      }
    }
    for (const u of collectFlagUses(buildContent()).uses) {
      if (!registry.isCanonical(u.name)) bad.push(`${u.table}:${u.row} ${u.path}: ${u.name}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('zero aliases in src/ (flag literals of the code)', () => {
  /**
   * Flag-name literals of a source file: setFlag, flag reads, flag.set and flags[...]
   * (editor flag index), flags.x dot reads, and the keys a flag.changed handler checks.
   */
  function codeKeys(file: string, source: string): { key: string; where: string }[] {
    const out = indexCode(file, source)
      .filter((r) => !/^\*+$/.test(r.key) && /^[A-Za-z_][A-Za-z0-9_.*-]*$/.test(r.key))
      .map((r) => ({ key: r.key, where: `${file} ${r.where}` }));
    const src = stripComments(source);
    const line = (i: number) => src.slice(0, i).split('\n').length;
    const push = (key: string, i: number) => out.push({ key, where: `${file} line ${line(i)}` });
    const NOT_FLAGS = new Set(['some', 'every', 'length', 'filter', 'map', 'find', 'includes']);
    for (const m of src.matchAll(/\bflags\??\.([a-z_][a-z0-9_]*)\b/g)) {
      if (!NOT_FLAGS.has(m[1] as string)) push(m[1] as string, m.index ?? 0);
    }
    if (src.includes("'flag.changed'")) {
      for (const m of src.matchAll(/\b(?:data\.key|key)\s*===\s*'([^']+)'/g)) {
        push(m[1] as string, m.index ?? 0);
      }
      for (const m of src.matchAll(/\b(?:data\.key|k|key)\.startsWith\('([^']+)'\)/g)) {
        push(`${m[1]}*`, m.index ?? 0);
      }
    }
    return out;
  }

  const SEG = /[.]/;
  /** Literal parts of a key and a family pattern agree segment by segment ('*' and slots match any). */
  function unifies(key: string, pattern: string, prefix: boolean): boolean {
    const ks = key.split(SEG);
    const ps = pattern.replace(/<[^<>]+>/g, '*').split(SEG);
    if (prefix ? ks.length > ps.length : ks.length !== ps.length) return false;
    return ks.every(
      (k, i) =>
        k === '*' || ps[i] === '*' || k === ps[i] || (prefix && i === ks.length - 1 && k === ''),
    );
  }

  /** Is a code key (`*` for a templated part) a canonical name or a canonical family member? */
  function canonicalKey(key: string): boolean {
    const prefix = key.endsWith('.*') && !key.slice(0, -2).includes('*');
    const probe = key.replace(/\*/g, 'x');
    const r = registry.resolve(probe);
    if (r) return !r.alias;
    if (!key.includes('*')) return false;
    const stem = prefix ? key.slice(0, -1) : key;
    // an alias spelling (exact or pattern) with this shape is not canonical
    for (const def of [...registry.data.vars, ...registry.data.families]) {
      for (const a of def.aliases) {
        const alias = a.split('=')[0] as string;
        if (alias.includes('<') && unifies(stem, alias, prefix)) return false;
      }
    }
    return [...registry.data.vars, ...registry.data.families].some((d) =>
      unifies(stem, d.name, prefix),
    );
  }

  it('src/systems, src/game, src/content, src/client and src/core write and read canonical names only', () => {
    const bad: string[] = [];
    for (const dir of ['src/systems', 'src/game', 'src/content', 'src/client', 'src/core']) {
      for (const f of files(join(ROOT, dir), '.ts')) {
        const rel = relative(ROOT, f).replace(/\\/g, '/');
        if (rel.startsWith('src/core/registry/') || rel.startsWith('src/core/save/')) continue;
        for (const { key, where } of codeKeys(rel, readFileSync(f, 'utf8'))) {
          if (!canonicalKey(key)) bad.push(`${where}: ${key}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('the scanner sees writes, reads, dot reads, key checks and templates', () => {
    const src = [
      "ctx.setFlag('door_seal', 1);",
      "ctx.flag('a1_ash_met');",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
      'ctx.setFlag(`verdict_${g}`, v);',
      'const x = flags.purge_route;',
      "on: { 'flag.changed'(ctx, e) { const key = e.data.key;",
      "if (key === 'slg.nation_founded') go();",
      "if (e.data.key.startsWith('npc.focus.')) go();",
      "if (e.data.key.startsWith('companion.')) sync(); } }",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
      'ctx.setFlag(`goddess.${id}.${field}`, v);',
    ].join('\n');
    const keys = codeKeys('x.ts', src).map((k) => k.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'door_seal',
        'a1_ash_met',
        'verdict_*',
        'purge_route',
        'slg.nation_founded',
        'npc.focus.*',
        'companion.*',
        'goddess.*.*',
      ]),
    );
    expect(keys.filter((k) => canonicalKey(k)).sort()).toEqual([
      'a1_ash_met',
      'companion.*',
      'goddess.*.*',
    ]);
  });
});
