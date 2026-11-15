// Quest graph: the flag write and read index over data and source code, and the
// reachability analysis (reachable, stuck, unreachable, flags nobody writes).

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { loadCodeSources } from '../src/editor/quests/code_sources';
import {
  buildFlagIndex,
  effectWrites,
  type FlagRef,
  indexCode,
  indexData,
  isDynamic,
  keyMatches,
} from '../src/editor/quests/flag_index';
import { buildQuestGraph } from '../src/editor/quests/quest_graph';
import { staticDataFiles } from '../src/editor/state/static_data';
import { createGame } from '../src/game/create';
import type { ActDef, QuestDef } from '../src/systems/quests';

/** "${" for source-code fixtures (a plain string with it trips the template lint). */
const I = '$' + '{';

describe('effect writes', () => {
  it('maps the narrative effect vocabulary to the flags it writes', () => {
    expect(effectWrites({ type: 'flag', key: 'a', value: 3 })).toEqual([{ key: 'a', value: 3 }]);
    expect(effectWrites({ type: 'add', key: 'b', amount: 1 })).toEqual([{ key: 'b' }]);
    expect(effectWrites({ type: 'feature', feature: 'company' })).toEqual([
      { key: 'feature.company', value: true },
    ]);
    expect(effectWrites({ type: 'companion', id: 'shiya' })).toEqual([
      { key: 'companion.shiya.recruited', value: true },
    ]);
    expect(effectWrites({ type: 'wave', wave: 'w1' })).toEqual([
      { key: 'combat.wave.w1', value: 'go' },
    ]);
    expect(effectWrites({ type: 'act', act: 'act2' })).toEqual([{ key: 'act', value: 'act2' }]);
    expect(effectWrites({ type: 'quest', quest: 'q9' })).toEqual([
      { key: 'quest.q9', value: 'active' },
    ]);
    expect(effectWrites({ type: 'item', item: 'x' })).toEqual([]);
  });
});

describe('data index', () => {
  const quests = [
    {
      id: 'q1',
      trigger: 'act == act1',
      onStart: [{ type: 'flag', key: 'started', value: true }],
      stages: [
        {
          id: 's1',
          objectives: [
            { type: 'scene', scene: 'intro', label: 'watch' },
            { type: 'flag', when: 'door_open', label: 'wait' },
          ],
          onComplete: [{ type: 'add', key: 'seal', amount: 5, when: 'act >= act1' }],
        },
      ],
      rewards: [{ type: 'quest', quest: 'q2' }],
    },
  ];

  it('scopes writes to the quest and stage and records condition reads', () => {
    const refs = indexData('quests/quests.json', quests);
    const writes = refs.filter((r) => r.kind === 'write');
    expect(writes.map((w) => [w.key, w.quest, w.stage])).toEqual([
      ['started', 'q1', -1],
      ['seal', 'q1', 0],
      ['quest.q2', 'q1', 1],
    ]);
    const reads = refs.filter((r) => r.kind === 'read').map((r) => `${r.key}@${r.via}`);
    expect(reads).toEqual(['act@trigger', 'door_open@when', 'act@when']);
  });

  it('does not treat objectives as effects', () => {
    const refs = indexData('quests/quests.json', quests);
    expect(refs.some((r) => r.key === 'scene.pending')).toBe(false);
  });

  it('reads requiresFlags and flag fields outside effects', () => {
    const refs = indexData('world/maps.json', [
      { exits: [{ id: 'e', requiresFlags: ['gate_open'] }] },
      { bondFlags: [{ flag: 'fate', equals: 'x' }] },
    ]);
    expect(refs.map((r) => `${r.kind}:${r.key}`)).toEqual(['read:gate_open', 'read:fate']);
  });

  it('records scene storeAs answers and { flag: { key } } items as writes', () => {
    const refs = indexData('scenes/p.json', [
      { type: 'input', storeAs: 'player.name' },
      { id: 'm', flag: { key: 'director.lost_item', value: true } },
    ]);
    expect(refs.map((r) => `${r.kind}:${r.key}:${String(r.value)}`)).toEqual([
      'write:player.name:undefined',
      'write:director.lost_item:true',
    ]);
  });

  it('skips unparsable conditions', () => {
    expect(indexData('a.json', [{ when: '== broken ==' }])).toEqual([]);
  });
});

describe('code index', () => {
  const src = [
    "ctx.setFlag('act', to);",
    `ctx.setFlag(\`boss.${I}mon.id}.defeated\`, true);`,
    'ctx.setFlag(key, true);',
    "setFlag(ctx, 'plain_fn', 1);",
    "// ctx.setFlag('commented_out', 1);",
    "/* ctx.setFlag('block_comment', 1); */",
    "ctx.dispatch('flag.set', { key: 'dispatched', value: 2 });",
    "if (ctx.flag('read_me')) world.meta.flags['read_too'];",
  ].join('\n');

  it('finds literal, templated and dynamic writes, and reads, with lines', () => {
    const refs = indexCode('systems/x/index.ts', src);
    const writes = refs.filter((r) => r.kind === 'write');
    expect(writes.map((w) => w.key).sort()).toEqual([
      '*',
      'act',
      'boss.*.defeated',
      'dispatched',
      'plain_fn',
    ]);
    expect(writes.find((w) => w.key === 'boss.*.defeated')?.where).toBe('line 2');
    expect(refs.some((r) => r.key === 'commented_out' || r.key === 'block_comment')).toBe(false);
    expect(refs.filter((r) => r.kind === 'read').map((r) => r.key)).toEqual([
      'read_me',
      'read_too',
    ]);
  });

  it('finds computed flag sets written by a setFlag loop, and only then', () => {
    const computed = [
      'function settle(flags) {',
      '  const out = {};',
      '  out.held_unaided = 3;',
      `  out[\`review.${I}c.id}\`] = 'self';`,
      "  if (out.x == 1) out.janu_act = 'seal';",
      '  return out;',
      '}',
      'function write(ctx, out) {',
      '  for (const k of Object.keys(out).sort()) ctx.setFlag(k, out[k]);',
      '}',
    ].join('\n');
    const keys = indexCode('systems/quests/endings.ts', computed)
      .filter((r) => r.via === 'computed')
      .map((r) => r.key);
    expect(keys).toEqual(['held_unaided', 'janu_act', 'review.*']);
    const noLoop = computed.replace('ctx.setFlag(k, out[k])', 'console.info(k)');
    expect(indexCode('a.ts', noLoop).filter((r) => r.via === 'computed')).toEqual([]);
  });

  it('matches patterns but never lets dynamic writes cover a key', () => {
    expect(keyMatches('boss.*.defeated', 'boss.dian_colossus.defeated')).toBe(true);
    expect(keyMatches('boss.*.defeated', 'boss.defeated')).toBe(false);
    expect(keyMatches('door.*', 'door.pact')).toBe(true);
    expect(keyMatches('*', 'anything')).toBe(false);
    expect(isDynamic('*')).toBe(true);
    expect(keyMatches('act', 'act')).toBe(true);
  });
});

function q(id: string, trigger: string, extra: Partial<QuestDef> = {}): QuestDef {
  return {
    id,
    act: 'act1',
    kind: 'main',
    title: id,
    desc: '',
    trigger,
    stages: [{ id: 's', desc: '', objectives: [{ type: 'talk', npc: 'x', label: 'talk' }] }],
    ...extra,
  };
}

const ACTS: ActDef[] = [
  { id: 'act1', index: 1, title: 'A1' },
  { id: 'act2', index: 2, title: 'A2' },
  { id: 'act9', index: 9, title: 'A9' },
];

describe('quest graph', () => {
  const quests: QuestDef[] = [
    q('a', 'act == act1', {
      rewards: [
        { type: 'flag', key: 'x', value: true },
        { type: 'act', act: 'act2' },
      ],
    }),
    q('b', 'x', {}),
    q('c', 'never_written == 1'),
    q('d', 'quest.a == done', {
      stages: [
        { id: 's', desc: '', objectives: [{ type: 'flag', when: 'y >= 3', label: 'wait y' }] },
      ],
    }),
    q('e', "mode == 'b'"),
    q('f', 'x OR nothing_at_all'),
    q('g', 'boss.k.defeated'),
    q('h', 'quest.e == done'),
  ];
  const index: FlagRef[] = [
    ...indexData('quests/quests.json', quests),
    ...indexData('scenes/s.json', [{ type: 'flag', key: 'mode', value: 'a' }]),
    ...indexCode('systems/combat/rewards.ts', `ctx.setFlag(\`boss.${I}id}.defeated\`, true);`),
  ];
  const g = buildQuestGraph({ quests, acts: ACTS, index, initialFlags: { act: 'act1' } });

  it('marks quests reachable through writers, quest status and patterns', () => {
    expect(g.verdicts.a?.state).toBe('reachable');
    expect(g.verdicts.b?.state).toBe('reachable');
    expect(g.verdicts.f?.state).toBe('reachable');
    expect(g.verdicts.g?.state).toBe('reachable');
  });

  it('marks a quest whose trigger needs an unwritten flag unreachable, naming it', () => {
    expect(g.verdicts.c).toMatchObject({
      state: 'unreachable',
      blockers: ['never_written'],
      unwritten: ['never_written'],
    });
  });

  it('marks a value nobody writes as unreachable without an unwritten flag', () => {
    expect(g.verdicts.e).toMatchObject({ state: 'unreachable', unwritten: [] });
    expect(g.verdicts.h?.state).toBe('unreachable');
  });

  it('marks a quest whose flag objective cannot hold as stuck at that stage', () => {
    expect(g.verdicts.d).toMatchObject({
      state: 'stuck',
      stage: 0,
      blockers: ['y'],
      unwritten: ['y'],
    });
  });

  it('lists flags read but never written, and acts nobody switches to', () => {
    const keys = g.noWriter.map((f) => f.key);
    expect(keys).toContain('never_written');
    expect(keys).toContain('y');
    expect(keys).not.toContain('x');
    expect(keys).not.toContain('act');
    expect(g.unreachableActs).toEqual(['act9']);
  });

  it('draws edges from writers to trigger readers and for quest status', () => {
    expect(g.edges).toContainEqual({ from: 'a', to: 'b', via: 'x' });
    expect(g.edges).toContainEqual({ from: 'a', to: 'd', via: 'quest.a' });
    expect(g.edges).toContainEqual({ from: 'e', to: 'h', via: 'quest.e' });
  });
});

describe('real content', () => {
  it('indexes all data and system sources and analyses every quest', async () => {
    const sources = await loadCodeSources();
    expect(Object.keys(sources).some((k) => k.startsWith('systems/quests/'))).toBe(true);
    const index = buildFlagIndex(new Map(Object.entries(staticDataFiles())), sources);
    expect(index.some((r) => r.origin === 'code' && r.key === 'act')).toBe(true);
    expect(index.some((r) => r.origin === 'data' && r.quest)).toBe(true);
    const content = buildContent();
    const initialFlags = { ...createGame({ aiMode: 'off', content }).world.meta.flags };
    const g = buildQuestGraph({ quests: content.quests, acts: content.acts, index, initialFlags });
    expect(Object.keys(g.verdicts)).toHaveLength(content.quests.length);
    expect(g.quests.every((x) => x.badConditions.length === 0)).toBe(true);
  });
});
