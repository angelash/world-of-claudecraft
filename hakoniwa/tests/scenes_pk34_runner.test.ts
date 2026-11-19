// PK-M1-34: the scene-runner additions routed from the prologue (PK-M1-27's requests) and the
// act-1 cutscenes' needs. Each behaviour on a small fixture scene, with a negative case:
// - triggers: a scene requests itself at its place while its act plays, and stops once its own
//   write turns the condition false; it never cuts into a running scene;
// - stage timing: `when` drops a directive, `at` is renumbered against the lines shown;
// - classification: `settle` applies the sorted choice's effects only and goes on to the input's
//   own destination; a classified pick is not a scene.choice (the backlog); a spent `once`
//   fallback is never taken again (no loop); an input with no answerer still asks a model;
// - the brief: a model answer that misses a meaning key or says a forbidden word is replaced by
//   the written reply; the written anchors are said after it; extracted values are filtered;
// - re-choosing the opening: the cleared quests go back to unstarted, the player's name and
//   look back to the defaults.

import { describe, expect, it } from 'vitest';
import { Engine } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import {
  briefKept,
  extractValues,
  type SceneDef,
  sceneView,
  triggeredScene,
  visibleStage,
} from '../src/systems/scenes';
import { DEFAULT_PLAYER_APPEARANCE, playerEntity } from '../src/systems/world';
import { NARRATIVE_SYSTEMS, narrativeContent, recordLines } from './narrative_harness';

function withScenes(scenes: SceneDef[], aiMode: 'off' | 'external' = 'off'): Engine {
  const content = narrativeContent();
  const c = {
    ...content,
    // no act-1 cutscene triggers or quests in the way of the fixtures
    scenes: [...content.scenes.filter((s) => !s.triggers?.length), ...scenes],
    quests: [],
  } as ContentMap;
  return Engine.create(1, c, [...NARRATIVE_SYSTEMS], { aiMode });
}

/** The prologue put aside, the act set, flags applied. */
function ready(g: Engine, flags: Record<string, string | number | boolean> = {}): void {
  g.step(1);
  g.world.slices.scenes.current = null;
  g.world.slices.scenes.queue = [];
  Object.assign(g.world.meta.flags, { act: 'act1', ...flags });
}

function start(g: Engine, sceneId: string): void {
  g.queue('scenes.start', { sceneId });
  g.step(1);
}

function view(g: Engine) {
  const v = sceneView(g.world, g.content);
  if (!v) throw new Error('no scene');
  return v;
}

function placeAt(g: Engine, mapId: string, location: string): void {
  const map = g.content.maps.find((m) => m.id === mapId);
  const loc = map?.locations.find((l) => l.id === location);
  if (!map || !loc) throw new Error(`no ${mapId}/${location}`);
  g.queue('world.teleport', {
    entityId: g.world.slices.world.playerId,
    mapId,
    x: loc.x + loc.w / 2,
    y: loc.y + loc.h / 2,
  });
  g.step(1);
}

// ---------------------------------------------------------------------------

describe('triggers', () => {
  const self: SceneDef = {
    id: 'zz_self',
    title: 't',
    act: 'act1',
    start: 'a',
    nodes: [
      {
        id: 'a',
        lines: [{ speaker: 'narrator', text: '一' }],
        effects: [{ type: 'flag', key: 'zz_self_done', value: true }],
      },
    ],
    triggers: [{ when: 'zz_go AND NOT zz_self_done', mapId: 'borderstone', location: 'plaza' }],
  };

  it('requests the scene at its place while the condition holds, once', () => {
    const g = withScenes([self]);
    ready(g, { zz_go: true });
    // elsewhere: nothing
    placeAt(g, 'borderstone', 'chapel');
    g.step(2);
    expect(g.world.slices.scenes.current).toBeNull();
    placeAt(g, 'borderstone', 'plaza');
    g.step(1);
    expect(g.world.slices.scenes.current?.sceneId).toBe('zz_self');
    g.queue('scenes.advance', {});
    g.step(2);
    // the scene's own write turned the trigger false: it does not play again
    expect(g.world.meta.flags.zz_self_done).toBe(true);
    g.step(5);
    expect(g.world.slices.scenes.current).toBeNull();
  });

  it('waits for the act and for nothing else to play', () => {
    const g = withScenes([self]);
    ready(g, { zz_go: true, act: 'act2' });
    placeAt(g, 'borderstone', 'plaza');
    g.step(2);
    expect(g.world.slices.scenes.current).toBeNull();
    // the right act, but another scene plays: the trigger does not cut in
    g.world.meta.flags.act = 'act1';
    const other: SceneDef = {
      id: 'zz_other',
      title: 'o',
      start: 'a',
      nodes: [{ id: 'a', lines: [{ speaker: 'narrator', text: '他' }] }],
    };
    g.content.scenes.push(other);
    start(g, 'zz_other');
    g.step(3);
    expect(g.world.slices.scenes.current?.sceneId).toBe('zz_other');
    expect(g.world.slices.scenes.queue).not.toContain('zz_self');
    g.queue('scenes.advance', {});
    g.step(2);
    expect(g.world.slices.scenes.current?.sceneId).toBe('zz_self');
  });

  it('triggeredScene is null when the condition fails', () => {
    const g = withScenes([self]);
    ready(g, { zz_go: false });
    placeAt(g, 'borderstone', 'plaza');
    const ctx = { world: g.world, content: g.content, flag: (k: string) => g.world.meta.flags[k] };
    expect(triggeredScene(ctx as never)).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('stage timing', () => {
  const holds = (expr: string | undefined) => expr === undefined || expr === 'yes';

  it('drops a directive whose condition fails and keeps the order', () => {
    const out = visibleStage(
      [
        { op: 'sfx', id: 'sfx_a' },
        { op: 'sfx', id: 'sfx_b', when: 'no' },
        { op: 'sfx', id: 'sfx_c', when: 'yes' },
      ],
      [true],
      holds,
    );
    expect(out.map((d) => (d as { id: string }).id)).toEqual(['sfx_a', 'sfx_c']);
  });

  it('renumbers `at` against the lines shown, moving past a hidden line', () => {
    // written lines 0, 1 (hidden), 2; directives at 1, 2 and after the last line
    const out = visibleStage(
      [
        { op: 'sfx', id: 'at1', at: 1 },
        { op: 'sfx', id: 'at2', at: 2 },
        { op: 'sfx', id: 'end', at: 3 },
        { op: 'sfx', id: 'zero', at: 0 },
      ],
      [true, false, true],
      holds,
    );
    expect(out).toEqual([
      // written line 1 is hidden: its directive waits for the next shown line (shown index 1)
      { op: 'sfx', id: 'at1', at: 1 },
      { op: 'sfx', id: 'at2', at: 1 },
      // after the last line: once the two shown lines are read
      { op: 'sfx', id: 'end', at: 2 },
      // at 0 is "as the node is entered": no `at`
      { op: 'sfx', id: 'zero' },
    ]);
  });

  it('the view hands the client the mapped steps', () => {
    const s: SceneDef = {
      id: 'zz_stage',
      title: 's',
      start: 'a',
      nodes: [
        {
          id: 'a',
          lines: [
            { speaker: 'narrator', text: '一' },
            { speaker: 'narrator', text: '二', when: 'zz_hidden' },
            { speaker: 'narrator', text: '三' },
          ],
          stage: [
            { op: 'transition', kind: 'door_wipe', at: 2 },
            { op: 'still', id: 'art_bg_cut_a1_letter', when: 'zz_hidden' },
          ],
        },
      ],
    };
    const g = withScenes([s]);
    ready(g);
    start(g, 'zz_stage');
    expect(view(g).stage).toEqual([{ op: 'transition', kind: 'door_wipe', at: 1 }]);
  });
});

// ---------------------------------------------------------------------------

describe('classification', () => {
  /** An input sorted into `pick`'s choices; `settle` decides the second semantics. */
  const sorter = (settle: boolean): SceneDef => ({
    id: 'zz_sort',
    title: 's',
    start: 'ask',
    nodes: [
      {
        id: 'ask',
        input: {
          prompt: '说',
          to: 'after',
          classify: { node: 'pick', choices: ['a', 'b'], fallback: 'a', settle },
          reply: [{ speaker: 'narrator', text: '记下了。' }],
        },
      },
      {
        id: 'pick',
        choices: [
          {
            id: 'a',
            label: '甲',
            to: 'a_reaction',
            effects: [{ type: 'flag', key: 'zz_a', value: true }],
          },
          { id: 'b', label: '乙', to: 'a_reaction' },
        ],
      },
      { id: 'a_reaction', lines: [{ speaker: 'narrator', text: '写定的反应' }], next: 'after' },
      { id: 'after', lines: [{ speaker: 'narrator', text: '之后' }] },
    ],
  });

  it('settle: the effects of the sorted choice apply, then the input goes on to its own to', () => {
    const g = withScenes([sorter(true)]);
    ready(g);
    const lines = recordLines(g);
    start(g, 'zz_sort');
    g.queue('scenes.input', { text: '随便说点' });
    g.step(2);
    expect(g.world.meta.flags.zz_a).toBe(true);
    expect(view(g).nodeId).toBe('after');
    // the written reaction of the choice the player never picked does not play
    expect(lines.some((l) => l.text === '写定的反应')).toBe(false);
    // and it is not a choice the player made: no scene.choice in the backlog
    expect(g.world.recent.some((e) => e.kind === 'scene.choice')).toBe(false);
    expect(g.world.recent.some((e) => e.kind === 'scene.classified')).toBe(true);
  });

  it('without settle the sorted choice is taken (its reaction plays), still no scene.choice', () => {
    const g = withScenes([sorter(false)]);
    ready(g);
    const lines = recordLines(g);
    start(g, 'zz_sort');
    g.queue('scenes.input', { text: '随便说点' });
    g.step(2);
    expect(lines.some((l) => l.text === '写定的反应')).toBe(true);
    expect(g.world.recent.some((e) => e.kind === 'scene.choice')).toBe(false);
  });

  it('a spent `once` fallback is not taken again: the input goes on to its destination', () => {
    // the dream's question menu: `why` once, then free questions must not loop back into it
    const loop: SceneDef = {
      id: 'zz_loop',
      title: 'l',
      start: 'ask',
      nodes: [
        {
          id: 'ask',
          choices: [
            { id: 'why', label: '为什么', to: 'a_why', once: true },
            { id: 'free', label: '自己问', to: 'free' },
            { id: 'enough', label: '不问了', to: 'end' },
          ],
        },
        { id: 'a_why', lines: [{ speaker: 'narrator', text: '一扇一扇来' }], next: 'ask' },
        {
          id: 'free',
          input: {
            prompt: '问',
            to: 'ask',
            classify: { node: 'ask', choices: ['why'], fallback: 'why' },
            reply: [{ speaker: 'narrator', text: '下次再说' }],
          },
        },
        { id: 'end', lines: [{ speaker: 'narrator', text: '完' }] },
      ],
    };
    const g = withScenes([loop]);
    ready(g);
    start(g, 'zz_loop');
    g.queue('scenes.choose', { choiceId: 'free' });
    g.step(1);
    g.queue('scenes.input', { text: '你是谁' });
    // a classifying input asks a sorter even with no answerer: the written fallback lands a tick
    // later (with the AI off, the request's fallback runs on the next tick)
    g.step(3);
    // the fallback `why` was open: taken once
    expect(view(g).nodeId).toBe('a_why');
    g.queue('scenes.advance', {});
    g.step(1);
    expect(view(g).choices.map((c) => c.id)).toEqual(['free', 'enough']);
    g.queue('scenes.choose', { choiceId: 'free' });
    g.step(1);
    g.queue('scenes.input', { text: '再问' });
    g.step(3);
    // `why` is spent: the written reply stands and the input returns to the menu, not a_why
    expect(view(g).nodeId).toBe('ask');
  });

  it('an input with no answerer still asks a model to sort it (scene.improv, the narrator)', () => {
    const s = sorter(true);
    const g = withScenes([s], 'external');
    ready(g);
    start(g, 'zz_sort');
    g.takeAiRequests();
    g.queue('scenes.input', { text: '随便说点' });
    g.step(1);
    const [req] = g.takeAiRequests();
    expect(req?.agentId).toBe('narrator');
    expect(req?.role).toBe('scene.improv');
    expect(req?.purpose).toBe('classify_answer');
  });
});

// ---------------------------------------------------------------------------

describe('the improvisation brief', () => {
  it('briefKept checks the literal tokens: one `must` phrase, no `never` word', () => {
    const check = { check: { must: ['守门', '别急'], never: ['封印'] } };
    expect(briefKept(check, [{ text: '我是守 门的。' }])).toBe(true);
    expect(briefKept(check, [{ text: '别急。' }])).toBe(true);
    // no must phrase
    expect(briefKept(check, [{ text: '你好。' }])).toBe(false);
    // a must phrase and a never word
    expect(briefKept(check, [{ text: '守门的人，封印要松了。' }])).toBe(false);
    // no check: anything passes (the prose brief is for the model only)
    expect(briefKept(undefined, [{ text: '' }])).toBe(true);
    expect(briefKept({ check: { never: ['第六'] } }, [{ text: '随便' }])).toBe(true);
  });

  it('extractValues: listed keys and allowed values only, in the node order', () => {
    const x = [
      { key: 'zz_object', values: ['lamp', 'bare_tree'] },
      { key: 'zz_past', values: ['whitecoat'] },
    ];
    expect(
      extractValues(x, { zz_past: 'whitecoat', zz_object: 'lamp', act: 'act6', other: 'x' }),
    ).toEqual([
      ['zz_object', 'lamp'],
      ['zz_past', 'whitecoat'],
    ]);
    expect(extractValues(x, { zz_object: 'sword' })).toEqual([]);
    expect(extractValues(undefined, { zz_object: 'lamp' })).toEqual([]);
  });

  const briefed: SceneDef = {
    id: 'zz_brief',
    title: 'b',
    start: 'ask',
    nodes: [
      {
        id: 'ask',
        input: {
          prompt: '问',
          to: 'after',
          agentId: 'eluen',
          improv: {
            meaningKeys: ['合乎规格'],
            forbidden: ['不说第六司'],
            check: { must: ['规格'], never: ['第六'] },
          },
          anchor: [{ speaker: 'eluen', text: '上面从来不看过程。' }],
          extract: [{ key: 'zz_past', values: ['whitecoat', 'podium'] }],
          reply: [
            { speaker: 'eluen', text: '合乎规格的部分，光收下了。' },
            { speaker: 'eluen', text: '这一句只在条件成立时说。', when: 'zz_never' },
          ],
        },
      },
      { id: 'after', lines: [{ speaker: 'narrator', text: '之后' }] },
    ],
  };

  /** One model answer: its lines, extracted values, and whether it claims to be written. */
  function answer(
    g: Engine,
    text: string,
    opts: { values?: Record<string, string>; written?: boolean; name?: string } = {},
  ): void {
    g.queue('scenes.input', { text: '我想说' });
    g.step(1);
    const [req] = g.takeAiRequests();
    if (!req) throw new Error('no request');
    const extra = (req.context as { extra: Record<string, unknown> }).extra;
    expect(extra.brief).toMatchObject({ check: { must: ['规格'], never: ['第六'] } });
    g.resolveAi(req.id, {
      type: 'proposal',
      commands: [
        {
          kind: 'scenes.resolve',
          data: {
            runId: extra.runId as number,
            revision: req.revision,
            lines: [{ speaker: 'eluen', text, name: opts.name }],
            values: opts.values,
            written: opts.written,
          },
          source: { type: 'player' },
        },
      ],
    });
    g.step(1);
  }

  it('an answer that passes is said as model text, then the written anchor', () => {
    const g = withScenes([briefed], 'external');
    ready(g);
    const lines = recordLines(g);
    start(g, 'zz_brief');
    g.takeAiRequests();
    answer(g, '不合规格。', { values: { zz_past: 'podium', act: 'act6' } });
    const said = lines.map((l) => l.text);
    expect(said).toContain('不合规格。');
    expect(said.indexOf('上面从来不看过程。')).toBeGreaterThan(said.indexOf('不合规格。'));
    // only the node's own key, only an allowed value
    expect(g.world.meta.flags.zz_past).toBe('podium');
    expect(g.world.meta.flags.act).toBe('act1');
    expect(view(g).nodeId).toBe('after');
  });

  it('an answer that fails the check: the written reply (its conditions read), no extraction', () => {
    for (const bad of ['随便吧。', '规格之外，还有第六位。']) {
      const g = withScenes([briefed], 'external');
      ready(g);
      const lines = recordLines(g);
      start(g, 'zz_brief');
      g.takeAiRequests();
      answer(g, bad, { values: { zz_past: 'podium' } });
      const said = lines.map((l) => l.text);
      expect(said, bad).not.toContain(bad);
      expect(said, bad).toContain('合乎规格的部分，光收下了。');
      // the conditional reply line whose condition fails stays out
      expect(said, bad).not.toContain('这一句只在条件成立时说。');
      expect(g.world.meta.flags.zz_past, bad).toBeUndefined();
      expect(g.world.recent.some((e) => e.kind === 'scene.improv_refused')).toBe(true);
    }
  });

  it('a model cannot claim its answer is written: the check, the mark and the name still apply', () => {
    const g = withScenes([briefed], 'external');
    ready(g);
    const lines = recordLines(g);
    start(g, 'zz_brief');
    g.takeAiRequests();
    // a forbidden word, claimed as written, under a borrowed display name
    answer(g, '规格之外，还有第六位。', { written: true, name: '旁白' });
    const said = lines.map((l) => l.text);
    expect(said).not.toContain('规格之外，还有第六位。');
    expect(said).toContain('合乎规格的部分，光收下了。');
  });

  it('the written anchors are said once per run, also on the no-model path', () => {
    const loop: SceneDef = {
      id: 'zz_anchor',
      title: 'a',
      start: 'ask',
      nodes: [
        {
          id: 'ask',
          input: {
            prompt: '问',
            to: 'ask',
            anchor: [{ speaker: 'eluen', text: '上面从来不看过程。' }],
            reply: [{ speaker: 'eluen', text: '嗯。' }],
          },
        },
      ],
    };
    const g = withScenes([loop], 'off');
    ready(g);
    const lines = recordLines(g);
    start(g, 'zz_anchor');
    g.queue('scenes.input', { text: '一' });
    g.step(2);
    g.queue('scenes.input', { text: '二' });
    g.step(2);
    expect(lines.filter((l) => l.text === '上面从来不看过程。')).toHaveLength(1);
  });

  it('a sorter with no answerer: its choice counts, its words do not', () => {
    const sort: SceneDef = {
      id: 'zz_sorter',
      title: 's',
      start: 'ask',
      nodes: [
        {
          id: 'ask',
          input: {
            prompt: '说',
            to: 'after',
            classify: { node: 'pick', choices: ['a', 'b'], fallback: 'a', settle: true },
            reply: [{ speaker: 'narrator', text: '写定的回复' }],
          },
        },
        {
          id: 'pick',
          choices: [
            { id: 'a', label: '甲', effects: [{ type: 'flag', key: 'zz_a', value: true }] },
            { id: 'b', label: '乙', effects: [{ type: 'flag', key: 'zz_b', value: true }] },
          ],
        },
        { id: 'after', lines: [{ speaker: 'narrator', text: '之后' }] },
      ],
    };
    const g = withScenes([sort], 'external');
    ready(g);
    const lines = recordLines(g);
    start(g, 'zz_sorter');
    g.takeAiRequests();
    g.queue('scenes.input', { text: '随便说点' });
    g.step(1);
    const [req] = g.takeAiRequests();
    if (!req) throw new Error('no request');
    const extra = (req.context as { extra: Record<string, unknown> }).extra;
    g.resolveAi(req.id, {
      type: 'proposal',
      commands: [
        {
          kind: 'scenes.resolve',
          data: {
            runId: extra.runId as number,
            revision: req.revision,
            lines: [{ speaker: 'narrator', text: '模型自己编的话' }],
            choiceId: 'b',
          },
          source: { type: 'player' },
        },
      ],
    });
    g.step(1);
    const said = lines.map((l) => l.text);
    expect(said).not.toContain('模型自己编的话');
    expect(said).toContain('写定的回复');
    expect(g.world.meta.flags.zz_b).toBe(true);
    expect(g.world.meta.flags.zz_a).toBeUndefined();
    expect(view(g).nodeId).toBe('after');
  });
});

// ---------------------------------------------------------------------------

describe('re-choosing the opening', () => {
  const opening: SceneDef = {
    id: 'zz_open',
    title: 'o',
    start: 'a',
    nodes: [
      {
        id: 'a',
        effects: [
          { type: 'flag', key: 'zz_p_mark', value: true },
          { type: 'quest', quest: 'q_p_m01_last_moment' },
        ],
        lines: [{ speaker: 'narrator', text: '开场' }],
      },
    ],
    restart: { scene: 'zz_open', clear: ['zz_p_*', 'quest.q_p_*'], resetPlayer: true },
  };

  it('puts the cleared quests back to unstarted and the player back to the defaults', () => {
    const content = narrativeContent();
    const c = { ...content, scenes: [...content.scenes, opening] } as ContentMap;
    const g = Engine.create(1, c, [...NARRATIVE_SYSTEMS], { aiMode: 'off' });
    ready(g);
    start(g, 'zz_open');
    expect(g.world.slices.quests.quests.q_p_m01_last_moment).toBeDefined();
    const pid = g.world.slices.world.playerId;
    g.queue('flag.set', { key: 'player.name', value: '旧名字' });
    g.step(1);
    const p = playerEntity(g.world);
    if (!p) throw new Error('no player');
    p.appearance = { base: 'elf', colors: ['#000000'] };
    expect(playerEntity(g.world)?.name).toBe('旧名字');
    g.queue('scenes.restart', {});
    g.step(1);
    // the quest the cleared flag stood for: back to unstarted, then started again by the replay
    const q = g.world.slices.quests.quests.q_p_m01_last_moment;
    expect(q?.startedTick).toBe(g.tick);
    expect(g.world.slices.quests.order.filter((id) => id === 'q_p_m01_last_moment').length).toBe(1);
    const after = g.world.slices.world.entities[pid];
    expect(after?.name).toBe('?');
    expect(after?.appearance).toEqual(DEFAULT_PLAYER_APPEARANCE);
  });

  it('without resetPlayer the name and look stand', () => {
    const content = narrativeContent();
    const keep = { ...opening, id: 'zz_keep', restart: { scene: 'zz_keep', clear: ['zz_p_*'] } };
    const c = { ...content, scenes: [...content.scenes, keep] } as ContentMap;
    const g = Engine.create(1, c, [...NARRATIVE_SYSTEMS], { aiMode: 'off' });
    ready(g);
    start(g, 'zz_keep');
    g.queue('flag.set', { key: 'player.name', value: '旧名字' });
    g.step(1);
    g.queue('scenes.restart', {});
    g.step(1);
    expect(playerEntity(g.world)?.name).toBe('旧名字');
  });
});
