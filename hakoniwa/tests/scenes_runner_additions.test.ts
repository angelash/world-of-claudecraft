// The scene runner additions of PK-M1-54 (catalog_cutscenes.md 13.6): interfaces opened by
// `ui` effects, multi-turn inputs with soft and hard caps, timed and keyed choices, segment
// markers, combat barks on wave and boss events, re-choosing the prologue opening, and the
// scene view reading conditions through the narrative resolver (calendar terms) as the runner
// does. Kernel only; the client side is in tests/client_prologue_stage.test.ts.

import { describe, expect, it } from 'vitest';
import { sceneProblems } from '../src/content/packs/scenes';
import { Engine, ok, worldHash } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import type { GameSystem } from '../src/core/system';
import { TICK_HZ } from '../src/core/time';
import { countItem } from '../src/systems/inventory';
import {
  checkCreatorResult,
  flagMatches,
  roundEnd,
  type SceneDef,
  type SceneRun,
  sceneView,
} from '../src/systems/scenes';
import { playerEntity } from '../src/systems/world';
import { NARRATIVE_SYSTEMS, narrativeContent, recordLines } from './narrative_harness';

declare module '../src/core/contracts' {
  interface CommandMap {
    'zz.combat_event': {
      kind: 'wave_spawned' | 'wave_cleared' | 'boss_phase' | 'boss_defeated';
      ref: string;
      phase?: number;
    };
  }
}

/** Stands in for the combat system: emits its wave and boss events on demand. */
const combatEvents: GameSystem = {
  id: 'zz_combat_events',
  order: 21,
  commands: {
    'zz.combat_event'(ctx, d) {
      if (d.kind === 'wave_spawned')
        ctx.emit('combat.wave_spawned', { waveId: d.ref, mapId: 'm', count: 3 });
      else if (d.kind === 'wave_cleared')
        ctx.emit('combat.wave_cleared', { waveId: d.ref, mapId: 'm' });
      else if (d.kind === 'boss_phase')
        ctx.emit('combat.boss_phase', {
          entityId: 'b1',
          bossId: d.ref,
          phase: d.phase ?? 1,
          name: 'p',
        });
      else ctx.emit('combat.boss_defeated', { entityId: 'b1', bossId: d.ref, yielded: false });
      return ok();
    },
  },
};

function withScenes(
  scenes: SceneDef[],
  aiMode: 'off' | 'external' = 'off',
  opts: { noPrologue?: boolean } = {},
): Engine {
  const content = narrativeContent();
  // the prologue is the seven cut_p_ scenes (PK-M1-27)
  const base = opts.noPrologue
    ? content.scenes.filter((s) => !s.id.startsWith('cut_p_'))
    : content.scenes;
  const c = { ...content, scenes: [...base, ...scenes] } as ContentMap;
  return Engine.create(1, c, [...NARRATIVE_SYSTEMS, combatEvents], { aiMode });
}

/** The run now (read through a function so a test's earlier reset does not narrow it). */
function runOf(g: Engine): SceneRun {
  const run = g.world.slices.scenes.current;
  if (!run) throw new Error('no run');
  return run;
}

function view(g: Engine) {
  const v = sceneView(g.world, g.content);
  if (!v) throw new Error('no scene');
  return v;
}

/** Start a fixture scene once the prologue has been put aside. */
function start(g: Engine, sceneId: string): void {
  g.step(1);
  g.world.slices.scenes.current = null;
  g.world.slices.scenes.queue = [];
  g.queue('scenes.start', { sceneId });
  g.step(1);
}

const CREATOR_RESULT = {
  appearance: {
    base: 'human',
    colors: ['#2f5d50', '#a47c52', '#c99169', '#4a2f1d'],
    doll: {
      body: 'h',
      outfit: 'art_doll_res_earth_casual',
      head: 'art_doll_head_base_h',
      hair: 'art_doll_head_hair_long_straight',
    },
  },
  // the mirror's own look string (src/client/hud/creator/creator_look.ts encodeLook)
  look: 'v1;sx=f;b=h;ey=2;mo=1;sk=3;ha=long_straight;hc=2;ou=earth_casual;pa=3',
};

// ---------------------------------------------------------------------------

describe('ui effect', () => {
  const mirror: SceneDef = {
    id: 'zz_mirror',
    title: 'mirror',
    start: 'a',
    nodes: [
      {
        id: 'a',
        lines: [{ speaker: 'narrator', text: '镜子。' }],
        choices: [
          {
            id: 'creator',
            label: '照镜子',
            effects: [
              { type: 'ui', ui: 'ui_mode_creator', storeAs: 'zz_look' },
              { type: 'flag', key: 'zz_mirror_done', value: true },
            ],
            to: 'b',
          },
        ],
      },
      { id: 'b', lines: [{ speaker: 'narrator', text: '是你。' }], end: true },
      {
        id: 'own',
        effects: [{ type: 'ui', ui: 'ui_mode_credits' }],
        lines: [{ speaker: 'narrator', text: '片尾。' }],
        branch: [{ when: 'zz_branch', to: 'b' }],
        next: 'c',
      },
      { id: 'c', lines: [{ speaker: 'narrator', text: '另一边。' }], end: true },
    ],
  };
  const credits: SceneDef = { ...mirror, id: 'zz_credits', start: 'own' };

  it('waits for the interface a choice opens, applies its result and goes to the choice target', () => {
    const g = withScenes([mirror]);
    start(g, 'zz_mirror');
    g.queue('scenes.choose', { choiceId: 'creator' });
    g.step(1);
    let v = view(g);
    expect(v.waiting).toBe('ui');
    expect(v.ui).toBe('ui_mode_creator');
    // the choice's other effects applied at once
    expect(g.world.meta.flags.zz_mirror_done).toBe(true);
    const run = g.world.slices.scenes.current;
    if (!run) throw new Error('no run');
    // a stale revision or another interface is refused
    g.queue('scenes.ui_done', {
      runId: run.runId,
      revision: run.revision - 1,
      ui: 'ui_mode_creator',
    });
    g.queue('scenes.ui_done', { runId: run.runId, revision: run.revision, ui: 'ui_pop_deja' });
    g.step(1);
    expect(view(g).waiting).toBe('ui');
    g.queue('scenes.ui_done', {
      runId: run.runId,
      revision: run.revision,
      ui: 'ui_mode_creator',
      result: CREATOR_RESULT,
    });
    g.step(1);
    v = view(g);
    expect(v.nodeId).toBe('b');
    expect(v.ui).toBeNull();
    expect(g.world.meta.flags.zz_look).toBe(CREATOR_RESULT.look);
    const p = playerEntity(g.world);
    expect(p?.appearance.colors).toEqual(CREATOR_RESULT.appearance.colors);
    expect(p?.appearance.doll?.hair).toBe('art_doll_head_hair_long_straight');
  });

  it('refuses a result outside the creator rules and writes nothing', () => {
    const g = withScenes([mirror]);
    start(g, 'zz_mirror');
    g.queue('scenes.choose', { choiceId: 'creator' });
    g.step(1);
    const before = structuredClone(playerEntity(g.world)?.appearance);
    const run = g.world.slices.scenes.current;
    if (!run) throw new Error('no run');
    for (const bad of [
      { ...CREATOR_RESULT, appearance: { ...CREATOR_RESULT.appearance, base: 'wolf' } },
      { ...CREATOR_RESULT, appearance: { ...CREATOR_RESULT.appearance, colors: ['red'] } },
      { ...CREATOR_RESULT, look: 'x'.repeat(400) },
      {
        ...CREATOR_RESULT,
        appearance: { ...CREATOR_RESULT.appearance, doll: { body: 'giant' } },
      },
    ]) {
      g.queue('scenes.ui_done', {
        runId: run.runId,
        revision: run.revision,
        ui: 'ui_mode_creator',
        result: bad,
      });
    }
    g.step(1);
    expect(view(g).waiting).toBe('ui');
    expect(playerEntity(g.world)?.appearance).toEqual(before);
    expect(g.world.meta.flags.zz_look).toBeUndefined();
    expect(checkCreatorResult(CREATOR_RESULT).ok).toBe(true);
  });

  it('closing without a result keeps the appearance and goes on', () => {
    const g = withScenes([mirror]);
    start(g, 'zz_mirror');
    g.queue('scenes.choose', { choiceId: 'creator' });
    g.step(1);
    const before = structuredClone(playerEntity(g.world)?.appearance);
    const run = g.world.slices.scenes.current;
    if (!run) throw new Error('no run');
    g.queue('scenes.ui_done', { runId: run.runId, revision: run.revision, ui: 'ui_mode_creator' });
    g.step(1);
    expect(view(g).nodeId).toBe('b');
    expect(playerEntity(g.world)?.appearance).toEqual(before);
  });

  it("a node's own ui effect opens after its lines; its branches decide once it closes", () => {
    for (const branch of [false, true]) {
      const g = withScenes([credits]);
      g.step(1);
      g.world.meta.flags.zz_branch = branch;
      g.world.slices.scenes.current = null;
      g.queue('scenes.start', { sceneId: 'zz_credits' });
      g.step(1);
      const v = view(g);
      expect(v.waiting).toBe('ui');
      expect(v.ui).toBe('ui_mode_credits');
      expect(v.lines.map((l) => l.text)).toEqual(['片尾。']);
      const run = runOf(g);
      g.queue('scenes.ui_done', {
        runId: run.runId,
        revision: run.revision,
        ui: 'ui_mode_credits',
      });
      g.step(1);
      // straight to the destination: the branch, else next (the lines were read already)
      expect(view(g).nodeId).toBe(branch ? 'b' : 'c');
    }
  });
});

// ---------------------------------------------------------------------------

describe('timed and keyed choices', () => {
  const fall: SceneDef = {
    id: 'zz_fall',
    title: 'fall',
    start: 'fall',
    nodes: [
      {
        id: 'fall',
        lines: [{ speaker: 'narrator', text: '纯黑。' }],
        choices: [
          {
            id: 'reach',
            label: '伸手',
            key: 'reach_out',
            hidden: true,
            effects: [{ type: 'flag', key: 'zz_reached', value: true }],
            to: 'caught',
          },
          { id: 'still', label: '（什么也不做）', timeout: 2, hidden: true, to: 'caught' },
        ],
      },
      { id: 'caught', lines: [{ speaker: 'door_voice', text: '接住你了。' }], end: true },
    ],
  };

  it('lists hidden, keyed and timed choices in the view for the client to place', () => {
    const g = withScenes([fall]);
    start(g, 'zz_fall');
    const v = view(g);
    expect(v.waiting).toBe('choice');
    expect(v.choices).toEqual([
      {
        id: 'reach',
        label: '伸手',
        hint: undefined,
        confirm: undefined,
        hidden: true,
        key: 'reach_out',
      },
      {
        id: 'still',
        label: '（什么也不做）',
        hint: undefined,
        confirm: undefined,
        hidden: true,
        timeout: 2,
      },
    ]);
  });

  it('picks the timed choice when the time runs out, counted in ticks', () => {
    const g = withScenes([fall]);
    start(g, 'zz_fall');
    g.step(2 * TICK_HZ - 2);
    expect(view(g).nodeId).toBe('fall');
    g.step(2);
    expect(view(g).nodeId).toBe('caught');
    expect(g.world.meta.flags.zz_reached).toBeUndefined();
  });

  it('a pick before the time runs out cancels the timer', () => {
    const g = withScenes([fall]);
    start(g, 'zz_fall');
    g.step(10);
    g.queue('scenes.choose', { choiceId: 'reach' });
    g.step(1);
    expect(view(g).nodeId).toBe('caught');
    expect(g.world.meta.flags.zz_reached).toBe(true);
    expect(g.world.slices.scenes.current?.timed).toBeUndefined();
  });

  it('replays the timeout identically', () => {
    // no prologue: the fixture starts by command alone, so the log holds the whole run
    const g = withScenes([fall], 'off', { noPrologue: true });
    g.step(1);
    g.queue('scenes.start', { sceneId: 'zz_fall' });
    g.step(3 * TICK_HZ);
    expect(view(g).nodeId).toBe('caught');
    const r = Engine.replay(1, g.content, g.systems, g.world.log, { aiMode: 'off' });
    r.step(g.tick);
    expect(worldHash(r.world)).toBe(worldHash(g.world));
  });

  it('the prologue fall writes p_reached_out only when the player reaches out', () => {
    const scenes = narrativeContent().scenes;
    const discard = scenes.find((s) => s.id === 'cut_p_discard');
    const fallNode = discard?.nodes.find((n) => n.id === 'n13_fall');
    const reach = fallNode?.choices?.find((c) => c.id === 'reach');
    const still = fallNode?.choices?.find((c) => c.id === 'still');
    expect(reach?.key).toBe('reach_out');
    expect(reach?.effects).toEqual([{ type: 'flag', key: 'p_reached_out', value: true }]);
    expect(still?.timeout).toBe(30);
    expect(still?.effects ?? []).toEqual([]);
    for (const pick of ['reach', 'wait'] as const) {
      const g = withScenes([]);
      start(g, 'cut_p_discard');
      // jump the discard run to the floor giving way, then advance into the fall
      runOf(g).nodeId = 'n12_drop_4';
      runOf(g).waiting = 'advance';
      g.queue('scenes.advance', {});
      g.step(1);
      expect(view(g).nodeId).toBe('n13_fall');
      if (pick === 'reach') g.queue('scenes.choose', { choiceId: 'reach' });
      g.step(pick === 'reach' ? 1 : 30 * TICK_HZ + 1);
      expect(view(g).nodeId).toBe('n13_caught');
      expect(g.world.meta.flags.p_reached_out).toBe(pick === 'reach' ? true : undefined);
    }
  });
});

// ---------------------------------------------------------------------------

describe('multi-turn input', () => {
  it('ends a round as closed, soft or hard', () => {
    const t = { soft: 6, hard: 10 };
    expect(roundEnd(t, 1, true)).toBe('closed');
    expect(roundEnd(t, 5, false)).toBeNull();
    expect(roundEnd(t, 6, false)).toBeNull();
    expect(roundEnd(t, 6, true)).toBe('soft');
    expect(roundEnd(t, 9, true)).toBe('soft');
    expect(roundEnd(t, 10, false)).toBe('hard');
    expect(roundEnd(t, 10, true)).toBe('hard');
  });

  const talk: SceneDef = {
    id: 'zz_talk',
    title: 'talk',
    start: 'ask',
    nodes: [
      {
        id: 'ask',
        lines: [{ speaker: 'eluen', text: '你凭什么？' }],
        input: {
          prompt: '回答',
          to: 'after',
          agentId: 'eluen',
          reply: [{ speaker: 'eluen', text: '记下了。' }],
          turns: { soft: 2, hard: 3, storeAs: 'zz_round_end' },
        },
      },
      { id: 'after', lines: [{ speaker: 'narrator', text: '下一位。' }], end: true },
    ],
  };

  /** One player turn and the model's answer (done or not); returns the request's extra. */
  function turn(g: Engine, done: boolean): Record<string, unknown> {
    g.queue('scenes.input', { text: '因为我能。' });
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
            lines: [{ speaker: 'eluen', text: '再说一遍。' }],
            done,
          },
          source: { type: 'player' },
        },
      ],
    });
    g.step(1);
    return extra;
  }

  it('keeps the input open until the answerer closes the round (closed before the soft cap)', () => {
    const g = withScenes([talk], 'external');
    start(g, 'zz_talk');
    const first = turn(g, false);
    expect(first.turn).toBe(1);
    expect(first.wrapUp).toBe(false);
    expect(view(g).waiting).toBe('input');
    expect(view(g).nodeId).toBe('ask');
    expect(g.world.meta.flags.zz_round_end).toBeUndefined();
    // closed before the soft cap? turn 2 is the soft cap here: closing there is "soft"
    const second = turn(g, true);
    expect(second.turn).toBe(2);
    expect(second.wrapUp).toBe(true);
    expect(view(g).nodeId).toBe('after');
    expect(g.world.meta.flags.zz_round_end).toBe('soft');
  });

  it('a first reply that closes the round is "closed"', () => {
    const g = withScenes([talk], 'external');
    start(g, 'zz_talk');
    turn(g, true);
    expect(view(g).nodeId).toBe('after');
    expect(g.world.meta.flags.zz_round_end).toBe('closed');
  });

  it('the runner ends the round at the hard cap', () => {
    const g = withScenes([talk], 'external');
    start(g, 'zz_talk');
    turn(g, false);
    turn(g, false);
    expect(view(g).waiting).toBe('input');
    const third = turn(g, false);
    expect(third.hardCap).toBe(3);
    expect(view(g).nodeId).toBe('after');
    expect(g.world.meta.flags.zz_round_end).toBe('hard');
  });

  it('without a model the written reply closes the round at once', () => {
    const g = withScenes([talk], 'off');
    const lines = recordLines(g);
    start(g, 'zz_talk');
    g.queue('scenes.input', { text: '因为我能。' });
    g.step(3);
    expect(view(g).nodeId).toBe('after');
    expect(g.world.meta.flags.zz_round_end).toBe('closed');
    expect(lines.some((l) => l.text === '记下了。')).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('segments, barks and the view resolver', () => {
  const tide: SceneDef = {
    id: 'zz_tide',
    title: 'tide',
    summary: '整场的梗概',
    start: 'gate',
    segments: [{ id: 'dusk', summary: '黄昏段的梗概' }, { id: 'colossus' }],
    nodes: [
      {
        id: 'gate',
        branch: [{ when: "zz_tide_beat == 'colossus'", to: 'colossus' }],
        next: 'dusk',
      },
      { id: 'dusk', segment: 'dusk', lines: [{ speaker: 'narrator', text: '黄昏。' }], end: true },
      {
        id: 'colossus',
        segment: 'colossus',
        lines: [{ speaker: 'narrator', text: '巨像。' }],
        choices: [
          { id: 'day', label: '白天才有', when: 'hour == 6', to: 'fin' },
          { id: 'always', label: '总有', to: 'fin' },
        ],
      },
      { id: 'fin', end: true },
    ],
    barks: [
      {
        id: 'w1',
        on: 'wave_spawned',
        ref: 'zz_wave',
        lines: [{ speaker: 'narrator', text: '第一波来了。' }],
      },
      {
        id: 'w1_again',
        on: 'wave_cleared',
        ref: 'zz_wave',
        repeat: true,
        lines: [{ speaker: 'narrator', text: '又退了。' }],
      },
      {
        id: 'p2',
        on: 'boss_phase',
        ref: 'zz_boss',
        phase: 2,
        lines: [{ speaker: 'narrator', text: '它飞起来了。' }],
      },
      {
        id: 'gated',
        on: 'boss_defeated',
        ref: 'zz_boss',
        when: 'zz_saw_it',
        lines: [{ speaker: 'narrator', text: '它倒下了。' }],
      },
    ],
  };

  it('marks segments and shows the segment summary', () => {
    const g = withScenes([tide]);
    const events: string[] = [];
    g.onEvents((evs) => {
      for (const e of evs) if (e.kind === 'scene.segment') events.push(e.data.segment);
    });
    g.step(1);
    g.world.meta.flags.zz_tide_beat = 'colossus';
    g.world.slices.scenes.current = null;
    g.queue('scenes.start', { sceneId: 'zz_tide' });
    g.step(1);
    const v = view(g);
    expect(v.segment).toBe('colossus');
    // a segment without its own summary shows the scene's
    expect(v.segmentSummary).toBe('整场的梗概');
    expect(events).toEqual(['colossus']);
    g.world.meta.flags.zz_tide_beat = 'dusk';
    g.world.slices.scenes.current = null;
    g.queue('scenes.start', { sceneId: 'zz_tide' });
    g.step(1);
    expect(view(g).segmentSummary).toBe('黄昏段的梗概');
  });

  it('the view reads calendar terms the way the runner does', () => {
    const g = withScenes([tide]);
    g.step(1);
    g.world.meta.flags.zz_tide_beat = 'colossus';
    g.world.slices.scenes.current = null;
    g.queue('scenes.start', { sceneId: 'zz_tide' });
    g.step(1);
    // the world opens at 06:00: `hour == 6` holds for the runner and for the view
    expect(view(g).choices.map((c) => c.id)).toEqual(['day', 'always']);
    g.queue('scenes.choose', { choiceId: 'day' });
    g.step(1);
    expect(g.world.slices.scenes.current).toBeNull();
  });

  it('says combat barks on wave and boss events, once unless repeated', () => {
    const g = withScenes([tide]);
    const lines = recordLines(g);
    g.step(1);
    const fire = (
      kind: 'wave_spawned' | 'wave_cleared' | 'boss_phase' | 'boss_defeated',
      ref: string,
      phase?: number,
    ) => {
      g.queue('zz.combat_event', { kind, ref, phase });
      g.step(1);
    };
    fire('wave_spawned', 'zz_wave');
    fire('wave_spawned', 'zz_wave');
    fire('wave_cleared', 'zz_wave');
    fire('wave_cleared', 'zz_wave');
    fire('wave_spawned', 'other_wave');
    fire('boss_phase', 'zz_boss', 1);
    fire('boss_phase', 'zz_boss', 2);
    fire('boss_defeated', 'zz_boss');
    const said = lines.map((l) => l.text);
    expect(said.filter((t) => t === '第一波来了。').length).toBe(1);
    expect(said.filter((t) => t === '又退了。').length).toBe(2);
    expect(said.filter((t) => t === '它飞起来了。').length).toBe(1);
    // its condition did not hold: not said, and not used up
    expect(said.includes('它倒下了。')).toBe(false);
    expect(g.world.slices.scenes.barked).toEqual(['zz_tide/w1', 'zz_tide/p2']);
    g.world.meta.flags.zz_saw_it = true;
    fire('boss_defeated', 'zz_boss');
    expect(lines.map((l) => l.text).includes('它倒下了。')).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('re-choosing the prologue opening', () => {
  it('matches flags by exact name and by prefix', () => {
    expect(flagMatches('p_earth_opening', ['p_*'])).toBe(true);
    expect(flagMatches('player.name', ['p_*'])).toBe(false);
    expect(flagMatches('scene.x.seen', ['scene.x.seen'])).toBe(true);
  });

  it('clears the prologue flags, takes the relic and the number tag back and plays the opening again', () => {
    const g = withScenes([]);
    g.step(1);
    expect(view(g).restartable).toBe(true);
    const pick = (choiceId: string) => {
      g.queue('scenes.choose', { choiceId });
      g.step(1);
    };
    // advance (and leave inputs empty) until the run stands on `node`
    const on = (node: string) => {
      for (let i = 0; i < 20 && view(g).nodeId !== node; i++) {
        g.queue(view(g).waiting === 'input' ? 'scenes.input' : 'scenes.advance', { text: '' });
        g.step(1);
      }
      expect(view(g).nodeId).toBe(node);
    };
    // the opening (the last train) with its unsent reply, then the door of the next scene
    pick('a');
    on('n1_a_hub');
    pick('phone');
    on('n2_door_hub');
    expect(view(g).sceneId).toBe('cut_p_door_white');
    pick('push');
    on('n3_hub');
    expect(g.world.meta.flags.p_earth_opening).toBe('a');
    expect(g.world.meta.flags.p_unsent_words).toBe('（没有回）');
    expect(countItem(g.world, 'player', 'relic_badge')).toBe(1);
    expect(countItem(g.world, 'player', 'number_tag_five')).toBe(1);
    expect(view(g).restartable).toBe(true);
    g.queue('scenes.restart', {});
    g.step(1);
    const v = view(g);
    expect([v.sceneId, v.nodeId]).toEqual(['cut_p_earth', 'n1_opening']);
    expect(g.world.meta.flags.p_earth_opening).toBeUndefined();
    expect(g.world.meta.flags.p_unsent_words).toBeUndefined();
    expect(g.world.meta.flags['p_hint.pact']).toBeUndefined();
    // the opening scene counts as unseen again (its seen flag is in the clear list)
    expect(g.world.meta.flags['scene.cut_p_earth.seen']).toBeUndefined();
    expect(g.world.slices.scenes.seen).not.toContain('cut_p_earth');
    // the opening node writes its own start value again
    expect(g.world.meta.flags.p_door_attempts_refused).toBe(0);
    expect(countItem(g.world, 'player', 'relic_badge')).toBe(0);
    expect(countItem(g.world, 'player', 'number_tag_five')).toBe(0);
    // a different opening this time
    g.queue('scenes.choose', { choiceId: 'd' });
    g.step(1);
    expect(g.world.meta.flags.p_earth_opening).toBe('d');
    expect(countItem(g.world, 'player', 'relic_key')).toBe(1);
  });

  it('is gone once the interview begins', () => {
    const g = withScenes([]);
    start(g, 'cut_p_call');
    // the call offers it to the end; the interview scene that follows has none
    expect(view(g).restartable).toBe(true);
    runOf(g).nodeId = 'n5_begin';
    runOf(g).waiting = 'advance';
    g.queue('scenes.advance', {});
    g.step(1);
    expect([view(g).sceneId, view(g).nodeId]).toEqual(['cut_p_interview', 'n6_intro']);
    expect(view(g).restartable).toBe(false);
    g.queue('scenes.restart', {});
    g.step(1);
    expect([view(g).sceneId, view(g).nodeId]).toEqual(['cut_p_interview', 'n6_intro']);
  });
});

// ---------------------------------------------------------------------------

describe('review hardening', () => {
  it('refuses doll fields the mirror never sets, overlong ones, and a doll without a body', () => {
    const doll = CREATOR_RESULT.appearance.doll;
    const with_ = (d: Record<string, unknown>) => ({
      ...CREATOR_RESULT,
      appearance: { ...CREATOR_RESULT.appearance, doll: d },
    });
    expect(checkCreatorResult(with_({ ...doll })).ok).toBe(true);
    expect(checkCreatorResult(with_({ ...doll, mainHand: 'art_doll_held_sword' })).ok).toBe(false);
    expect(checkCreatorResult(with_({ ...doll, junk: 'x' })).ok).toBe(false);
    expect(checkCreatorResult(with_({ ...doll, hair: `art_doll_${'a'.repeat(80)}` })).ok).toBe(
      false,
    );
    expect(checkCreatorResult(with_({ hair: doll.hair })).ok).toBe(false);
    expect(checkCreatorResult(with_({ ...doll, hair: 'not an id' })).ok).toBe(false);
  });

  const talk: SceneDef = {
    id: 'zz_talk2',
    title: 'talk',
    start: 'ask',
    nodes: [
      {
        id: 'ask',
        input: {
          prompt: '回答',
          to: 'after',
          agentId: 'eluen',
          storeAs: 'zz_answer',
          reply: [{ speaker: 'eluen', text: '记下了。' }],
          turns: { soft: 3, hard: 4, storeAs: 'zz_round' },
        },
      },
      { id: 'after', end: true },
    ],
  };

  it('keeps the opening answer of a round and refuses an empty turn in the middle', () => {
    const g = withScenes([talk], 'external');
    start(g, 'zz_talk2');
    const say = (text: string, done: boolean) => {
      g.queue('scenes.input', { text });
      g.step(1);
      const [req] = g.takeAiRequests();
      if (!req) return;
      const extra = (req.context as { extra: Record<string, unknown> }).extra;
      g.resolveAi(req.id, {
        type: 'proposal',
        commands: [
          {
            kind: 'scenes.resolve',
            data: {
              runId: extra.runId as number,
              revision: req.revision,
              lines: [{ speaker: 'eluen', text: '嗯。' }],
              done,
            },
            source: { type: 'player' },
          },
        ],
      });
      g.step(1);
    };
    say('第一句', false);
    expect(g.world.meta.flags.zz_answer).toBe('第一句');
    // an empty line mid-round is refused: the round goes on, nothing is overwritten
    g.queue('scenes.input', { text: '   ' });
    g.step(1);
    expect(g.takeAiRequests()).toEqual([]);
    expect(view(g).waiting).toBe('input');
    expect(g.world.meta.flags.zz_answer).toBe('第一句');
    say('第二句', true);
    expect(g.world.meta.flags.zz_answer).toBe('第一句');
    expect(g.world.meta.flags.zz_round).toBe('closed');
    expect(g.world.slices.scenes.current).toBeNull();
  });

  it('tells a goddess answerer how to close the round', () => {
    const g = withScenes([talk], 'external');
    start(g, 'zz_talk2');
    g.queue('scenes.input', { text: '第一句' });
    g.step(1);
    const [req] = g.takeAiRequests();
    if (!req) throw new Error('no request');
    const commands = (req.context as { commands?: Record<string, unknown> }).commands ?? {};
    expect(Object.keys(commands)).toContain('scenes.resolve');
  });

  it('keeps scenes others queued when the opening is chosen again', () => {
    const g = withScenes([]);
    g.step(1);
    g.queue('flag.set', { key: 'scene.pending', value: 'a1_tide_dawn' });
    g.step(1);
    expect(g.world.slices.scenes.queue).toContain('a1_tide_dawn');
    const events: string[][] = [];
    g.onEvents((evs) => {
      for (const e of evs) if (e.kind === 'scene.restarted') events.push(e.data.cleared);
    });
    g.queue('scenes.restart', {});
    g.step(1);
    expect(g.world.slices.scenes.queue).toContain('a1_tide_dawn');
    expect(events.length).toBe(1);
    expect(events[0]).toContain('p_door_attempts_refused');
  });

  it('the validator names every broken rule of the new fields', () => {
    const content = narrativeContent();
    const broken: SceneDef = {
      id: 'zz_broken',
      title: 'broken',
      start: 'a',
      segments: [{ id: 'nowhere' }],
      restart: { scene: 'zz_missing', clear: [], take: ['zz_no_item'], until: 'zz_no_segment' },
      barks: [
        { id: 'b', on: 'wave_spawned', ref: 'zz_no_wave', phase: 2, lines: [] },
        { id: 'b', on: 'nonsense' as never, ref: '', lines: [{ speaker: 'n', text: 'x' }] },
      ],
      nodes: [
        {
          id: 'a',
          effects: [{ type: 'ui', ui: 'ui_mode_nothing' as never }],
          stage: [
            { op: 'listen', flag: '' },
            { op: 'door', flag: 'f', cap: 0 },
          ],
          choices: [
            { id: 'c1', label: 'x', timeout: -1 },
            { id: 'c2', label: 'x', key: 'reach_ot' },
            { id: 'c3', label: 'x', hidden: true },
          ],
          input: { prompt: 'p', to: 'a', turns: { soft: 3, hard: 2 } },
        },
      ],
    };
    const problems = sceneProblems(broken, { ...content, scenes: [...content.scenes, broken] });
    for (const want of [
      'unknown interface ui_mode_nothing',
      'stage listen names no flag',
      'stage door cap must be a whole number >= 1',
      'choice c1 timeout must be seconds >= 0',
      'choice c2 key reach_ot is not a keyed action',
      'hidden choice c3 has neither a key nor a timeout',
      'input turns need whole soft >= 1 and hard >= soft',
      'input turns need an answerer (agentId)',
      'segment nowhere has no marker node',
      'duplicate bark b',
      'unknown wave zz_no_wave',
      'phase only applies to boss_phase',
      'has no lines',
      'unknown trigger nonsense',
      'names no boss',
      'restart -> unknown scene zz_missing',
      'restart clears no flags',
      'restart until unknown segment zz_no_segment',
      'restart takes unknown item zz_no_item',
    ]) {
      expect(
        problems.some((p) => p.includes(want)),
        `${want} in ${problems.join(' | ')}`,
      ).toBe(true);
    }
    // the shipped scenes pass the new rules
    for (const s of content.scenes) expect(sceneProblems(s, content), s.id).toEqual([]);
  });
});
