// PK-M1-34: the fourteen act-1 cutscenes of catalog_cutscenes.md 5 (`cut_a1_*`) as scene data.
// Ids, act, presentation (13.1) and skip summaries (13.9); a scene graph with no dangling jump
// where every node is reached from the start or a segment start; every scene played to its end
// with the first and with the last open choice; the self-requesting triggers (they fire at
// their place and stop once the scene wrote its flags); the combat barks of the interlude
// tables; and the requests other packages made: the trial already held (PK-M1-33 6), the
// A1-M01 path (PK-M1-33 7), D6 as a scene (PK-M1-33 8), the tide's dusk and mob writes and the
// dawn's attribution (PK-M1-52 6), and no direct seal writes (PK-M1-33 5). Kernel only, no model.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Engine, ok } from '../src/core';
import type { ContentMap, FlagValue } from '../src/core/contracts';
import type { GameSystem } from '../src/core/system';
import { TICKS_PER_GAME_HOUR } from '../src/core/time';
import { addItem, system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import {
  type Effect,
  evaluate,
  flagResolver,
  system as quests,
  registerCompute,
} from '../src/systems/quests';
import {
  type SceneDef,
  type SceneNode,
  STAGE_CAMERA_ANGLES,
  STAGE_CAMERA_MOVES,
  STAGE_LIGHT_PRESETS,
  STAGE_MOTIONS,
  STAGE_SHOT_SIZES,
  system as scenes,
  sceneView,
} from '../src/systems/scenes';
import { playerEntity, system as world } from '../src/systems/world';
import { narrativeContent, recordLines } from './narrative_harness';

declare module '../src/core/contracts' {
  interface CommandMap {
    'zz.a1_combat': {
      kind: 'wave_spawned' | 'wave_cleared' | 'boss_phase' | 'boss_defeated';
      ref: string;
      phase?: number;
    };
    'zz.a1_give': { item: string };
  }
}

const IDS = [
  'cut_a1_wake',
  'cut_a1_ash_glimpse',
  'cut_a1_raven',
  'cut_a1_yeyu_bound',
  'cut_a1_town',
  'cut_a1_guild',
  'cut_a1_talent',
  'cut_a1_trial',
  'cut_a1_yeyu_memory',
  'cut_a1_tide',
  'cut_a1_martha',
  'cut_a1_dream',
  'cut_a1_mark',
  'cut_a1_letter',
];
const OLD_IDS = [
  'act1_intro',
  'a1_ash_glimpse',
  'a1_yeyu_bound',
  'a1_guild_register',
  'a1_oola_trial',
  'a1_tide_dawn',
  'a1_dream',
  'a1_count_letter',
];

const base = narrativeContent();
/** No quests (their old scene requests and reach objectives stay out) and no act clock. */
const content = {
  ...base,
  quests: [],
  acts: base.acts.map((a) => ({ ...a, clock: undefined })),
} as ContentMap;

const scene = (id: string): SceneDef => {
  const s = content.scenes.find((x) => x.id === id);
  if (!s) throw new Error(`no scene ${id}`);
  return s;
};
const node = (sceneId: string, id: string): SceneNode => {
  const n = scene(sceneId).nodes.find((x) => x.id === id);
  if (!n) throw new Error(`no node ${sceneId}/${id}`);
  return n;
};

/** Stands in for the combat system: its wave and boss events on demand. */
const combatEvents: GameSystem = {
  id: 'zz_a1_combat',
  order: 21,
  commands: {
    'zz.a1_give'(ctx, d) {
      addItem(ctx, ctx.world.slices.world.playerId, d.item, 1);
      return ok();
    },
    'zz.a1_combat'(ctx, d) {
      if (d.kind === 'wave_spawned')
        ctx.emit('combat.wave_spawned', { waveId: d.ref, mapId: 'borderstone', count: 3 });
      else if (d.kind === 'wave_cleared')
        ctx.emit('combat.wave_cleared', { waveId: d.ref, mapId: 'borderstone' });
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

/** An act-1 world (no prologue): flags set after the first tick, the act clock off. */
function game(flags: Record<string, FlagValue> = {}): Engine {
  const g = Engine.create(1, content, [world, modifiers, inventory, quests, scenes, combatEvents], {
    aiMode: 'off',
  });
  g.world.meta.flags.act = 'act1';
  g.step(1);
  g.world.slices.scenes.current = null;
  g.world.slices.scenes.queue = [];
  Object.assign(g.world.meta.flags, flags);
  return g;
}

/** Put the player in the middle of a map location (or of the map). */
function place(g: Engine, mapId: string, location?: string): void {
  const map = g.content.maps.find((m) => m.id === mapId);
  if (!map) throw new Error(`no map ${mapId}`);
  const loc = location ? map.locations.find((l) => l.id === location) : undefined;
  if (location && !loc) throw new Error(`no location ${mapId}/${location}`);
  g.queue('world.teleport', {
    entityId: g.world.slices.world.playerId,
    mapId,
    x: loc ? loc.x + loc.w / 2 : map.width / 2,
    y: loc ? loc.y + loc.h / 2 : map.height / 2,
  });
  g.step(1);
}

type Pick = (nodeId: string, choices: string[]) => string;

/** The first open choice; a choice taken twice from the same node gives way to the next. */
function firstOpen(): Pick {
  const taken = new Map<string, number>();
  return (n, ids) => {
    const pick = ids.find((c) => (taken.get(`${n}/${c}`) ?? 0) < 2) ?? (ids[0] as string);
    taken.set(`${n}/${pick}`, (taken.get(`${n}/${pick}`) ?? 0) + 1);
    return pick;
  };
}

/** The last open choice, with the same guard. */
function lastOpen(): Pick {
  const taken = new Map<string, number>();
  return (n, ids) => {
    const rev = [...ids].reverse();
    const pick = rev.find((c) => (taken.get(`${n}/${c}`) ?? 0) < 2) ?? (rev[0] as string);
    taken.set(`${n}/${pick}`, (taken.get(`${n}/${pick}`) ?? 0) + 1);
    return pick;
  };
}

/** A scripted sequence of choice ids (by node), then the first open choice. */
function scripted(plan: Record<string, string[]>): Pick {
  const first = firstOpen();
  return (n, ids) => {
    const next = plan[n]?.[0];
    if (next && ids.includes(next)) {
      plan[n]?.shift();
      return next;
    }
    return first(n, ids);
  };
}

/** Play the scene now running (or `id`, started first) to its end; the nodes it waited on. */
function play(g: Engine, id: string, pick: Pick = firstOpen(), startIt = true): string[] {
  if (startIt) {
    g.queue('scenes.start', { sceneId: id });
    g.step(1);
  }
  const visited: string[] = [];
  for (let i = 0; i < 4000; i++) {
    const run = g.world.slices.scenes.current;
    if (!run || run.sceneId !== id) {
      if (g.world.slices.scenes.seen.includes(id)) return visited;
      throw new Error(`${id} is not playing (now ${run?.sceneId ?? 'nothing'})`);
    }
    const v = sceneView(g.world, g.content);
    if (!v) throw new Error('no view');
    if (visited[visited.length - 1] !== v.nodeId) visited.push(v.nodeId);
    if (v.waiting === 'choice') {
      const ids = v.choices.map((c) => c.id);
      g.queue('scenes.choose', { choiceId: pick(v.nodeId, ids) });
    } else if (v.waiting === 'input') g.queue('scenes.input', { text: '' });
    else if (v.waiting === 'advance') g.queue('scenes.advance', {});
    else if (v.waiting === 'ui' && v.ui)
      g.queue('scenes.ui_done', { runId: run.runId, revision: run.revision, ui: v.ui });
    g.step(1);
  }
  throw new Error(`${id} did not end`);
}

/** Every effect a scene can apply (nodes, choices, the end). */
function effectsOf(s: SceneDef): Effect[] {
  return [
    ...(s.onEnd ?? []),
    ...s.nodes.flatMap((n) => [
      ...(n.effects ?? []),
      ...(n.choices ?? []).flatMap((c) => c.effects ?? []),
    ]),
  ];
}

/** The skip summaries of catalog_cutscenes.md 13.9, read from the catalog itself. */
function catalogSummaries(): Record<string, string> {
  const md = readFileSync(
    join(__dirname, '..', 'docs', '40_design', 'content', 'catalog_cutscenes.md'),
    'utf8',
  );
  const section = md.slice(md.indexOf('### 13.9'), md.indexOf('### 13.10'));
  const out: Record<string, string> = {};
  for (const m of section.matchAll(/^\| `(cut_a1_\w+)` \| (.+) \|\r?$/gm))
    out[m[1] as string] = m[2] as string;
  return out;
}

// ---------------------------------------------------------------------------

describe('the fourteen act-1 scenes', () => {
  it('are the cut_a1_ ids with act, presentation and the catalog skip summary', () => {
    const summaries = catalogSummaries();
    expect(Object.keys(summaries).sort()).toEqual([...IDS].sort());
    const act1 = content.scenes.filter((s) => s.act === 'act1').map((s) => s.id);
    expect(act1.sort()).toEqual([...IDS].sort());
    for (const id of IDS) {
      const s = scene(id);
      expect(s.summary, id).toBe(summaries[id]);
      const theater = id === 'cut_a1_dream' || id === 'cut_a1_trial';
      expect(s.presentation, id).toBe(theater ? 'theater' : 'staged');
    }
    for (const old of OLD_IDS)
      expect(
        content.scenes.some((s) => s.id === old),
        old,
      ).toBe(false);
    // the chain: the prologue hands over to the wake, the dream to the mark
    expect(scene('cut_p_discard').then).toBe('cut_a1_wake');
    expect(scene('cut_a1_dream').then).toBe('cut_a1_mark');
    expect(effectsOf(scene('cut_a1_letter'))).toContainEqual({ type: 'act', act: 'act2' });
    expect(effectsOf(scene('cut_a1_tide'))).toContainEqual({
      type: 'scene',
      scene: 'cut_a1_martha',
    });
    // the two multi-part scenes and their markers
    expect(scene('cut_a1_wake').segments?.map((x) => x.id)).toEqual(['wake', 'first_door']);
    expect(scene('cut_a1_tide').segments?.map((x) => x.id)).toEqual([
      'dusk',
      'mob',
      'colossus',
      'core',
    ]);
    for (const id of ['cut_a1_wake', 'cut_a1_tide']) {
      const marked = scene(id).nodes.flatMap((n) => (n.segment ? [n.segment] : []));
      expect(marked, id).toEqual(scene(id).segments?.map((x) => x.id));
    }
  });

  it('reach every node from the start or a segment start, with no dangling jump', () => {
    for (const id of IDS) {
      const s = scene(id);
      const ids = new Set(s.nodes.map((n) => n.id));
      expect(ids.size, id).toBe(s.nodes.length);
      const targets = (n: SceneNode): string[] => [
        ...(n.next ? [n.next] : []),
        ...(n.branch ?? []).map((b) => b.to),
        ...(n.choices ?? []).flatMap((c) => (c.to ? [c.to] : [])),
        ...(n.input ? [n.input.to] : []),
        ...(n.input?.classify ? [n.input.classify.node] : []),
        // a present node's trial pieces that play a node of their own (PK-M1-55)
        ...(
          (n.present && content.trials.find((t) => t.id === n.present?.trial)?.pieces) ??
          []
        ).flatMap((p) => (p.to ? [p.to] : [])),
      ];
      for (const n of s.nodes)
        for (const t of targets(n)) expect(ids.has(t), `${id}/${n.id} -> ${t}`).toBe(true);
      const seen = new Set<string>();
      const queue = [s.start, ...s.nodes.flatMap((n) => (n.segment ? [n.id] : []))];
      while (queue.length) {
        const at = queue.shift() as string;
        if (seen.has(at)) continue;
        seen.add(at);
        const n = s.nodes.find((x) => x.id === at);
        if (n) queue.push(...targets(n));
      }
      for (const n of s.nodes) expect(seen.has(n.id), `${id}/${n.id} unreached`).toBe(true);
    }
  });

  it('name only registered speakers and write stage steps the player can run', () => {
    const known = new Set([
      'narrator',
      'player',
      ...content.goddesses.map((g) => g.id),
      ...content.sceneSpeakers.map((s) => s.id),
    ]);
    const timed = new Set(['camera', 'still', 'still_end', 'shake', 'music', 'caption']);
    for (const id of IDS) {
      const s = scene(id);
      const lines = s.nodes.flatMap((n) => [...(n.lines ?? []), ...(n.input?.reply ?? [])]);
      for (const b of s.barks ?? []) lines.push(...b.lines);
      for (const l of lines) {
        expect(known.has(l.speaker), `${id}: ${l.speaker}`).toBe(true);
        expect(l.name, `${id}: ${l.speaker}`).toBeUndefined();
      }
      for (const n of s.nodes) {
        for (const d of n.stage ?? []) {
          expect(d.at === undefined || (d.at >= 1 && d.at <= (n.lines?.length ?? 0))).toBe(true);
          if (d.op === 'camera') {
            if (d.angle) expect(STAGE_CAMERA_ANGLES).toContain(d.angle);
            if (d.size) expect(STAGE_SHOT_SIZES).toContain(d.size);
            if (d.move) expect(STAGE_CAMERA_MOVES).toContain(d.move);
            expect(d.angle ?? d.size ?? d.move, `${id}/${n.id}`).toBeDefined();
          }
          if (d.op === 'light') expect(STAGE_LIGHT_PRESETS).toContain(d.preset);
          if (d.op === 'motion')
            expect(
              (STAGE_MOTIONS as readonly string[]).includes(d.action) ||
                d.action.startsWith('art_chr_'),
            ).toBe(true);
          timed.delete(d.op);
        }
      }
    }
    // every kind of step the act uses most is there
    expect([...timed]).toEqual([]);
    // the three full-screen stills of act 1's live scenes (2.7), each taken down again or kept
    const stills = IDS.flatMap((id) =>
      scene(id).nodes.flatMap((n) =>
        (n.stage ?? []).flatMap((d) => (d.op === 'still' ? [`${id}:${d.id}`] : [])),
      ),
    );
    expect(stills.sort()).toEqual([
      'cut_a1_dream:art_bg_cut_a1_dream_court',
      'cut_a1_dream:art_bg_cut_a1_dream_door',
      'cut_a1_martha:art_bg_cut_a1_martha_light',
      'cut_a1_tide:art_bg_cut_a1_colossus',
    ]);
  });

  it('keep the word 澱 to Yeyu (D-030) and never write the door numbers', () => {
    for (const id of IDS) {
      const s = scene(id);
      const lines = s.nodes.flatMap((n) => [...(n.lines ?? []), ...(n.input?.reply ?? [])]);
      for (const b of s.barks ?? []) lines.push(...b.lines);
      for (const l of lines) if (l.text.includes('澱')) expect(l.speaker, l.text).toBe('yeyu');
      // and only once the player has heard the word from her: every such line is gated on the
      // term, except in the memory scene that teaches it (its own effect writes the term first)
      if (id !== 'cut_a1_yeyu_memory')
        for (const l of lines)
          if (l.text.includes('澱'))
            expect(l.when ?? '', `${id}: ${l.text}`).toMatch(/(^|\s)term\.dian_known/);
      const keys = effectsOf(s).flatMap((e) => ('key' in e ? [e.key] : []));
      for (const k of ['seal_looseness', 'seal_unrest', 'doors_opened', 'danger_doors_opened'])
        expect(keys, `${id} writes ${k}`).not.toContain(k);
    }
    // the act intros of acts 2 to 5 no longer write the looseness either (PK-M1-33 5)
    for (const id of ['act2_intro', 'act3_intro', 'act4_intro', 'act5_intro']) {
      const keys = effectsOf(scene(id)).flatMap((e) => ('key' in e ? [e.key] : []));
      expect(keys, id).not.toContain('seal_looseness');
    }
  });
});

// ---------------------------------------------------------------------------

/** Worlds that open the variants of each scene. */
const SETUPS: Record<string, Record<string, FlagValue>[]> = {
  cut_a1_wake: [{}, { 'door.awaken': true, p_earth_opening: 'c', p_asked_sixth_chair: true }],
  cut_a1_ash_glimpse: [
    {},
    { 'scene.cut_a1_ash_glimpse.seen': true, 'companion.yeyu.recruited': true },
  ],
  cut_a1_raven: [{}, { 'scene.cut_a1_raven.seen': true }],
  cut_a1_yeyu_bound: [{}, { p_reached_out: true }],
  cut_a1_town: [{}],
  cut_a1_guild: [{}, { a1_yeyu_bound: true, 'companion.yeyu.recruited': true }],
  cut_a1_talent: [
    {},
    {
      'companion.ron.recruited': true,
      'companion.shiya.recruited': true,
      a1_vouched: true,
      a1_vouch_by: 'bron',
      'boss.crystal_mother.defeated': true,
    },
  ],
  cut_a1_trial: [
    {},
    { a1_oola_jailbroken: true, a1_oola_fate: 'fled' },
    { a1_oola_bribed: true },
    {
      a1_tess_in_crowd: true,
      a1_spring_source_found: true,
      a1_isa_will_testify: true,
      a1_toma_will_testify: true,
      a1_grey_lamp_seen: true,
      'trust.greta': 70,
      'trust.bron': 90,
      'trust.oola': 40,
    },
    { a1_forest_accord: 'broken' },
  ],
  cut_a1_yeyu_memory: [
    { 'companion.yeyu.recruited': true },
    { a1_tide_omen: true, 'term.dian_known': true, p_eavesdrop_level: 3 },
  ],
  cut_a1_tide: [
    { a1_tide_night: true, a1_forest_accord: 'partial' },
    { a1_tide_stage: 2, a1_oola_fate: 'convicted', a1_tide_dusk_seen: true },
    {
      a1_tide_stage: 2,
      a1_oola_fate: 'convicted',
      a1_toby_state: 'recovered',
      'trust.isa': 70,
      a1_tide_dusk_seen: true,
    },
    {
      a1_tide_stage: 3,
      a1_colossus_target: 'children',
      'companion.yeyu.recruited': true,
      a1_tide_dusk_seen: true,
    },
    { a1_tide_stage: 4, a1_tide_dusk_seen: true, a1_tide_weakest: 'east' },
    { a1_tide_stage: 4, a1_tide_dusk_seen: true, 'door.vocation_druid': true },
  ],
  cut_a1_martha: [
    { a1_tide_gap_weakest: 12, a1_tide_weakest: 'north', a1_bs_survival: 'intact' },
    {
      a1_tide_gap_weakest: 0,
      a1_bs_survival: 'ravaged',
      a1_toby_state: 'dead',
      'npc.boro.dead': true,
      a1_tide_credit: 'light',
    },
  ],
  cut_a1_dream: [{ p_earth_opening: 'd', p_courtyard_object: 'bare_tree' }, { a1_ash_met: true }],
  cut_a1_mark: [
    {},
    {
      'companion.yeyu.recruited': true,
      a1_children_safe: true,
      'npc.bron.story_level': 3,
      'trust.bron': 50,
      a1_dream_bed: 'guild',
    },
  ],
  cut_a1_letter: [
    { a1_tide_credit: 'player', a1_moss_fate: 'arrested' },
    { 'companion.ron.recruited': true, 'companion.yeyu.recruited': true },
  ],
};

/**
 * Scripted runs (flags and the choices to take) that reach the variants the first and the last
 * open choice do not: together with SETUPS every node that shows something is played.
 */
const PLANS: Record<
  string,
  { flags: Record<string, FlagValue>; plan: Record<string, string[]>; items?: string[] }[]
> = {
  cut_a1_ash_glimpse: [{ flags: {}, plan: { choose: ['talk'], talk_1: ['talk_again'] } }],
  cut_a1_town: [{ flags: {}, plan: { tavern: ['catch'], catch: ['show_off'] } }],
  cut_a1_trial: [
    {
      flags: {
        a1_spring_source_found: true,
        a1_grey_lamp_seen: true,
        'trust.cassian': 70,
        a1_toby_state: 'recovered',
      },
      plan: { defense: ['debunk', 'debate', 'done'], debunk: ['drop'] },
    },
    {
      // the spring water presented as a piece (PK-M1-55): its reaction node plays
      flags: { a1_spring_source_found: true },
      items: ['north_spring_water'],
      plan: { defense: ['piece:spring_water', 'done'] },
    },
    { flags: { a1_oola_fate: 'convicted' }, plan: {} },
  ],
  cut_a1_martha: [
    {
      flags: {
        a1_tide_gap_weakest: 5,
        a1_tide_weakest: 'south',
        'npc.martha.assessment': 6,
        a1_toby_state: 'recovered',
        a1_bs_survival: 'damaged',
      },
      plan: {},
    },
  ],
  cut_a1_dream: [
    { flags: {}, plan: { ask: ['enough'], question: ['unsure'] } },
    { flags: {}, plan: { ask: ['enough'], question: ['dislike'] } },
  ],
  cut_a1_mark: [{ flags: { 'npc.bron.story_level': 1 }, plan: {} }],
  cut_a1_letter: [{ flags: { 'companion.ron.recruited': true }, plan: { answer: ['ron'] } }],
};

describe('each scene played', () => {
  for (const id of IDS) {
    it(`${id} ends with the first and with the last open choice, on real nodes only`, () => {
      const nodes = new Set(scene(id).nodes.map((n) => n.id));
      const reached = new Set<string>();
      const runs: [Record<string, FlagValue>, Pick, string[]][] = [];
      for (const flags of SETUPS[id] ?? [{}])
        runs.push([flags, firstOpen(), []], [flags, lastOpen(), []]);
      for (const p of PLANS[id] ?? []) runs.push([p.flags, scripted({ ...p.plan }), p.items ?? []]);
      for (const [flags, pick, items] of runs) {
        const g = game(flags);
        for (const item of items) g.queue('zz.a1_give', { item });
        if (items.length) g.step(1);
        const visited = play(g, id, pick);
        expect(visited.length, id).toBeGreaterThan(0);
        for (const n of visited) {
          expect(nodes.has(n), `${id}/${n}`).toBe(true);
          reached.add(n);
        }
        expect(g.world.meta.flags[`scene.${id}.seen`], id).toBe(true);
      }
      // every node that shows lines or waits for the player was played at least once
      const shows = scene(id).nodes.filter((n) => n.lines?.length || n.choices || n.input);
      expect(shows.filter((n) => !reached.has(n.id)).map((n) => n.id)).toEqual([]);
    });
  }

  it('the segment starts write what their triggers read', () => {
    const g = game({ 'door.awaken': true });
    expect(play(g, 'cut_a1_wake')).toContain('door_crack');
    expect(g.world.meta.flags.a1_first_door_seen).toBe(true);
    expect(g.world.meta.flags.a1_wake_ruins).toBeUndefined();
    const h = game();
    expect(play(h, 'cut_a1_wake')).not.toContain('door_crack');
    expect(h.world.meta.flags.a1_wake_ruins).toBe(true);
    expect(playerEntity(h.world)?.mapId).toBe('seal_ruins');
  });
});

// ---------------------------------------------------------------------------

describe('triggers', () => {
  /** A trigger's place: the player there, then a few ticks; the scene now playing. */
  const fire = (g: Engine, mapId?: string, location?: string): string | undefined => {
    if (mapId) place(g, mapId, location);
    g.step(3);
    return g.world.slices.scenes.current?.sceneId;
  };

  it('are only on the scenes no quest requests, with known places', () => {
    const triggered = IDS.filter((id) => scene(id).triggers?.length);
    expect(triggered.sort()).toEqual(
      [
        'cut_a1_wake',
        'cut_a1_ash_glimpse',
        'cut_a1_raven',
        'cut_a1_town',
        'cut_a1_talent',
        'cut_a1_yeyu_memory',
        'cut_a1_tide',
      ].sort(),
    );
    for (const id of triggered) {
      for (const t of scene(id).triggers ?? []) {
        if (!t.mapId) continue;
        const map = content.maps.find((m) => m.id === t.mapId);
        expect(map, `${id} ${t.mapId}`).toBeDefined();
        if (t.location)
          expect(
            map?.locations.some((l) => l.id === t.location),
            `${id} ${t.location}`,
          ).toBe(true);
      }
    }
    expect(scene('cut_a1_tide').triggers?.length).toBe(4);
    expect(scene('cut_a1_yeyu_memory').triggers?.length).toBe(2);
  });

  /**
   * Each trigger case: the flags that make it hold, its place, the segment it opens; after the
   * scene played its own writes make the condition false (checked on the condition itself and
   * by ticking at the place again).
   */
  const CASES: {
    name: string;
    /** the trigger's own place: map/location, map, or '' for anywhere */
    place: string;
    scene: string;
    flags: Record<string, FlagValue>;
    at: [string, string?];
    trigger: number;
    node: string;
  }[] = [
    {
      name: 'the first door',
      place: 'seal_ruins',
      scene: 'cut_a1_wake',
      flags: { 'door.awaken': true, 'scene.cut_a1_wake.seen': true, a1_wake_ruins: true },
      at: ['seal_ruins', 'corridor'],
      trigger: 0,
      node: 'door_crack',
    },
    {
      name: 'the ash chamber revisited',
      place: 'seal_ruins_depths/ash_chamber',
      scene: 'cut_a1_ash_glimpse',
      flags: { 'scene.cut_a1_ash_glimpse.seen': true, act_week: 3, a1_ash_met: true },
      at: ['seal_ruins_depths', 'ash_chamber'],
      trigger: 0,
      node: 'revisit',
    },
    {
      name: 'the raven on the first entry',
      place: 'seal_ruins_depths/nest_shaft',
      scene: 'cut_a1_raven',
      flags: { a1_ash_met: true },
      at: ['seal_ruins_depths', 'nest_shaft'],
      trigger: 0,
      node: 'climb',
    },
    {
      name: 'into the town',
      place: 'seal_ruins/shaft_top',
      scene: 'cut_a1_town',
      flags: { a1_yeyu_bound: true },
      at: ['seal_ruins', 'shaft_top'],
      trigger: 0,
      node: 'out',
    },
    {
      name: 'the door of seeing talent',
      place: '',
      scene: 'cut_a1_talent',
      flags: { 'door.talent_sight': true },
      at: ['borderstone', 'plaza'],
      trigger: 0,
      node: 'open',
    },
    {
      name: 'the culvert memory',
      place: 'seal_ruins_depths/seep_channel',
      scene: 'cut_a1_yeyu_memory',
      flags: { 'companion.yeyu.recruited': true, act_week: 6 },
      at: ['seal_ruins_depths', 'seep_channel'],
      trigger: 0,
      node: 'channel',
    },
    {
      // anywhere: the sunset finds the player in or out of town (PK-M1-52 6: dusk before stage 1)
      name: 'the tide at dusk',
      place: '',
      scene: 'cut_a1_tide',
      flags: { a1_tide_night: true, a1_tide_stage: 0 },
      at: ['borderstone', 'north_gate'],
      trigger: 0,
      node: 'dusk',
    },
    {
      name: 'the mob in the chapel',
      place: 'borderstone',
      scene: 'cut_a1_tide',
      flags: { a1_tide_stage: 2, a1_oola_fate: 'convicted', a1_tide_dusk_seen: true },
      at: ['borderstone', 'chapel'],
      trigger: 1,
      node: 'mob',
    },
    {
      name: 'the colossus',
      place: 'borderstone',
      scene: 'cut_a1_tide',
      flags: { a1_tide_stage: 3, a1_tide_dusk_seen: true, a1_colossus_target: 'player' },
      at: ['borderstone', 'north_gate'],
      trigger: 2,
      node: 'colossus',
    },
    {
      name: 'the core',
      place: 'borderstone',
      scene: 'cut_a1_tide',
      flags: { 'boss.dian_colossus.defeated': true, a1_tide_dusk_seen: true, a1_tide_stage: 4 },
      at: ['borderstone', 'north_gate'],
      trigger: 3,
      node: 'core',
    },
  ];

  for (const c of CASES) {
    it(`${c.name}: holds, and the scene's own writes turn it false`, () => {
      const t = scene(c.scene).triggers?.[c.trigger];
      if (!t) throw new Error('no trigger');
      const g = game(c.flags);
      const holds = () => evaluate(t.when, flagResolver(g.world.meta.flags));
      expect(holds()).toBe(true);
      expect([t.mapId, t.location].filter(Boolean).join('/')).toBe(c.place);
      expect(play(g, c.scene), c.name).toContain(c.node);
      expect(holds()).toBe(false);
    });

    it(`${c.name}: the runner requests it at its place, and not again`, () => {
      const t = scene(c.scene).triggers?.[c.trigger];
      if (!t) throw new Error('no trigger');
      const g = game(c.flags);
      // somewhere else on another map, nothing plays
      if (t.mapId) expect(fire(g, 'inner_court', 'court_arrival')).toBeUndefined();
      expect(fire(g, c.at[0], c.at[1])).toBe(c.scene);
      expect(play(g, c.scene, firstOpen(), false), c.name).toContain(c.node);
      g.world.slices.scenes.queue = [];
      if (g.world.slices.scenes.current?.sceneId === 'cut_a1_martha')
        play(g, 'cut_a1_martha', firstOpen(), false);
      expect(fire(g, c.at[0], c.at[1])).toBeUndefined();
    });
  }

  it('the bell tower memory holds at night only, and its scene turns it false', () => {
    const t = scene('cut_a1_yeyu_memory').triggers?.[1];
    if (!t) throw new Error('no trigger');
    expect([t.mapId, t.location]).toEqual(['borderstone', 'chapel']);
    const g = game({ a1_tide_omen: true, 'companion.yeyu.recruited': true });
    const at = (hour: number) => evaluate(t.when, flagResolver(g.world.meta.flags, { hour }));
    expect([at(12), at(19), at(20), at(23), at(3), at(4)]).toEqual([
      false,
      false,
      true,
      true,
      true,
      false,
    ]);
    expect(play(g, 'cut_a1_yeyu_memory')).toContain('tower');
    expect(g.world.meta.flags['term.dian_known']).toBe(true);
    expect(at(22)).toBe(false);
  });

  it('the bell tower memory: the runner waits for the night', () => {
    const g = game({ a1_tide_omen: true, 'companion.yeyu.recruited': true });
    expect(fire(g, 'borderstone', 'chapel')).toBeUndefined();
    g.step(TICKS_PER_GAME_HOUR * 14 + 20);
    place(g, 'borderstone', 'chapel');
    g.step(2);
    expect(g.world.slices.scenes.current?.sceneId).toBe('cut_a1_yeyu_memory');
    expect(play(g, 'cut_a1_yeyu_memory', firstOpen(), false)).toContain('tower');
    expect(fire(g, 'borderstone', 'chapel')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

describe('combat barks', () => {
  const ev = (
    g: Engine,
    kind: 'wave_spawned' | 'wave_cleared' | 'boss_phase' | 'boss_defeated',
    ref: string,
    phase?: number,
  ) => {
    g.queue('zz.a1_combat', { kind, ref, phase });
    g.step(1);
  };

  it('hang on real waves and bosses: the raven phases and the tide waves', () => {
    const waves = new Set(content.waves.map((w) => w.id));
    const bosses = new Set(content.monsters.map((m) => m.id));
    for (const id of ['cut_a1_raven', 'cut_a1_tide']) {
      for (const b of scene(id).barks ?? []) {
        const wave = b.on === 'wave_spawned' || b.on === 'wave_cleared';
        expect((wave ? waves : bosses).has(b.ref), `${id}/${b.id} ${b.ref}`).toBe(true);
      }
    }
    expect(scene('cut_a1_raven').barks?.map((b) => [b.on, b.ref, b.phase])).toEqual([
      ['boss_phase', 'guardian_raven', 1],
      ['boss_phase', 'guardian_raven', 2],
    ]);
    const refs = new Set(scene('cut_a1_tide').barks?.map((b) => b.ref));
    expect([...refs].sort()).toEqual(
      [
        'dian_colossus',
        'mtide_lotha_rim',
        'mtide_lotha_rim_colossus',
        'mtide_lotha_rim_undead',
      ].sort(),
    );
    const lines = (scene('cut_a1_tide').barks ?? []).reduce((a, b) => a + b.lines.length, 0);
    expect(lines).toBe(49);
  });

  it('say the raven lines on its phases, once', () => {
    const g = game();
    ev(g, 'boss_phase', 'guardian_raven', 1);
    ev(g, 'boss_phase', 'guardian_raven', 1);
    ev(g, 'boss_phase', 'guardian_raven', 2);
    expect(g.world.slices.scenes.barked).toEqual(['cut_a1_raven/takeoff', 'cut_a1_raven/shed']);
  });

  it('pick the tide lines the night table picks', () => {
    const g = game({
      a1_barto_family_safe: true,
      a1_dris_face: 'won',
      'trust.shiya': 50,
      'npc.nera.stance': 'partner',
      'companion.ron.recruited': true,
      'door.talent_sight': true,
      a1_jed_exposed: true,
      a1_shiya_family: 'left',
    });
    const said = recordLines(g);
    ev(g, 'wave_spawned', 'mtide_lotha_rim');
    const first = [...(g.world.slices.scenes.barked ?? [])];
    expect(first.sort()).toEqual(
      [
        'barto_hold',
        'dris_shoulder',
        'shiya_follow',
        'nera_partner',
        'isa_orphans',
        'ed_graveyard',
        'ron_organize',
      ]
        .map((b) => `cut_a1_tide/${b}`)
        .sort(),
    );
    // Nera's partner bark is three lines in order; Ron's second line needs the open door
    const nera = scene('cut_a1_tide').barks?.find((b) => b.id === 'nera_partner');
    expect(nera?.lines.map((l) => l.speaker)).toEqual(['nera', 'popo', 'nera']);
    const ron = scene('cut_a1_tide').barks?.find((b) => b.id === 'ron_organize');
    for (const l of [...(nera?.lines ?? []), ...(ron?.lines ?? [])])
      expect(said.map((s) => s.text)).toContain(l.text);
    // the first wave cleared: Barto held, so no withdrawal line
    ev(g, 'wave_cleared', 'mtide_lotha_rim');
    expect(g.world.slices.scenes.barked).not.toContain('cut_a1_tide/barto_withdraw');
    // the second wave: the magistrate runs, the priest lets Oola out
    Object.assign(g.world.meta.flags, {
      a1_moss_fate: 'in_power',
      a1_oola_fate: 'convicted',
      'npc.cassian.doubt': 1,
      'companion.yeyu.recruited': true,
      a1_oneeye_fate: 'absorbed',
    });
    ev(g, 'wave_spawned', 'mtide_lotha_rim_undead');
    const second = (g.world.slices.scenes.barked ?? []).filter((b) => !first.includes(b));
    expect(second.sort()).toEqual(
      ['moss_flee', 'cassian_release', 'yeyu_scout', 'seg_absorbed']
        .map((b) => `cut_a1_tide/${b}`)
        .sort(),
    );
    ev(g, 'wave_cleared', 'mtide_lotha_rim_undead');
    expect(g.world.slices.scenes.barked).toContain('cut_a1_tide/toma_bell');
    expect(g.world.slices.scenes.barked).not.toContain('cut_a1_tide/barto_retreat');
  });

  it('turn to the colossus: the children, the spirits twice, the core at its second phase', () => {
    const g = game({
      a1_tide_stage: 3,
      a1_colossus_target: 'children',
      'companion.yeyu.recruited': true,
    });
    ev(g, 'wave_spawned', 'mtide_lotha_rim_colossus');
    expect(g.world.slices.scenes.barked).toEqual(['cut_a1_tide/dris_glory']);
    ev(g, 'boss_phase', 'dian_colossus', 1);
    ev(g, 'boss_phase', 'dian_colossus', 2);
    const said = g.world.slices.scenes.barked ?? [];
    for (const b of ['dris_fallen', 'colossus_children', 'colossus_ashrain', 'colossus_core'])
      expect(said, b).toContain(`cut_a1_tide/${b}`);
    // a repeated bark is not kept in the once-only list; the others are said once
    expect(said).not.toContain('cut_a1_tide/colossus_spirits');
    expect(new Set(said).size).toBe(said.length);
  });

  it('stay silent when the night table picks another row', () => {
    const g = game({ 'trust.barto': 10, a1_dris_face: 'yielded', 'npc.nera.stance': 'hostile' });
    ev(g, 'wave_spawned', 'mtide_lotha_rim');
    ev(g, 'wave_cleared', 'mtide_lotha_rim');
    const said = g.world.slices.scenes.barked ?? [];
    for (const b of ['dris_prove', 'nera_hostile', 'barto_withdraw'])
      expect(said).toContain(`cut_a1_tide/${b}`);
    for (const b of ['barto_hold', 'barto_chapel', 'dris_shoulder', 'nera_partner', 'ron_organize'])
      expect(said).not.toContain(`cut_a1_tide/${b}`);
  });
});

// ---------------------------------------------------------------------------

describe('requests of the other packages', () => {
  it('the trial already held plays the short version (PK-M1-33 6)', () => {
    const held: Record<string, FlagValue>[] = [
      { a1_oola_fate: 'convicted' },
      { 'dispute.q_a1_d02_witch_trial.choice.cassian_verdict': 'convict' },
    ];
    for (const flags of held) {
      const g = game(flags);
      const visited = play(g, 'cut_a1_trial');
      expect(visited[0]).toBe('held');
      expect(visited).not.toContain('square');
      expect(visited).toContain('report');
    }
    // a jailbreak keeps its own short version, a fresh trial the full one
    expect(play(game({ a1_oola_jailbroken: true, a1_oola_fate: 'fled' }), 'cut_a1_trial')[0]).toBe(
      'empty',
    );
    expect(play(game(), 'cut_a1_trial')[0]).toBe('square');
  });

  it('the ash chamber writes the A1-M01 path (PK-M1-33 7)', () => {
    const path = (plan: Record<string, string[]>) => {
      const g = game();
      play(g, 'cut_a1_ash_glimpse', scripted(plan));
      return g.world.meta.flags['quest.q_a1_m01_fall.path'];
    };
    expect(path({ choose: ['pass'] })).toBe('bowed');
    expect(path({ choose: ['talk'], talk_1: ['pass'] })).toBe('spoke');
    expect(path({ choose: ['talk'], talk_1: ['talk_again'] })).toBe('spoke');
    expect(path({ choose: ['attack'] })).toBe('struck');
    expect(path({ choose: ['talk'], talk_1: ['attack'] })).toBe('struck');
  });

  it('D6 is the scene: Yeyu says the word first, then it is known (PK-M1-33 8)', () => {
    const g = game({ 'companion.yeyu.recruited': true });
    const said = recordLines(g);
    play(g, 'cut_a1_yeyu_memory');
    expect(g.world.meta.flags['term.dian_known']).toBe(true);
    const firstTime = (node('cut_a1_yeyu_memory', 'channel').lines ?? []).filter(
      (l) => l.when === 'NOT term.dian_known',
    );
    expect(firstTime.length).toBe(2);
    for (const l of firstTime) expect(said.map((s) => s.text)).toContain(l.text);
    // heard before (S14): only the "again" line
    const h = game({ 'companion.yeyu.recruited': true, 'term.dian_known': true });
    const heard = recordLines(h);
    play(h, 'cut_a1_yeyu_memory');
    for (const l of firstTime) expect(heard.map((s) => s.text)).not.toContain(l.text);
  });

  it('the dusk writes the post and the east gate order before the first wave (PK-M1-52)', () => {
    const g = game({ a1_tide_night: true, a1_forest_accord: 'partial' });
    play(g, 'cut_a1_tide', scripted({ east_order: ['order'], deploy: ['east'] }));
    const f = g.world.meta.flags;
    expect([f.a1_tide_post, f.a1_east_gate_ordered, f.a1_tide_dusk_seen]).toEqual([
      'east',
      true,
      true,
    ]);
    expect(playerEntity(g.world)?.mapId).toBe('borderstone');
    const h = game({ a1_tide_night: true });
    play(h, 'cut_a1_tide', scripted({ deploy: ['free'] }));
    expect(h.world.meta.flags.a1_tide_post).toBe('free');
    expect(h.world.meta.flags.a1_east_gate_ordered).toBeUndefined();
  });

  it('the mob writes how it ended and whether the player left the post (PK-M1-52)', () => {
    const mob = { a1_tide_stage: 2, a1_oola_fate: 'convicted' };
    const rush = game(mob);
    play(rush, 'cut_a1_tide', scripted({ mob: ['rush'] }));
    expect(rush.world.meta.flags.a1_bertha_mob).toBe('player');
    expect(rush.world.meta.flags.a1_tide_left_post).toBe(true);
    expect(rush.world.meta.flags.a1_mob_seen).toBe(true);
    const isa = game({ ...mob, 'trust.isa': 60 });
    play(isa, 'cut_a1_tide', scripted({ mob: ['hold'] }));
    expect(isa.world.meta.flags.a1_bertha_mob).toBe('isa');
    expect(isa.world.meta.flags.a1_tide_left_post).toBeUndefined();
    const dragged = game(mob);
    play(dragged, 'cut_a1_tide', scripted({ mob: ['hold'] }));
    const f = dragged.world.meta.flags;
    expect([f.a1_bertha_mob, f.a1_oola_fate, f.a1_oola_wounded]).toEqual(['dragged', 'fled', true]);
    // a doubting priest: no mob segment, the dusk plays instead
    const doubt = game({ ...mob, 'npc.cassian.doubt': 1 });
    expect(play(doubt, 'cut_a1_tide')).not.toContain('mob');
  });

  it('the core hands over to the dawn, which settles the credit with the tide (PK-M1-52)', () => {
    let calls = 0;
    registerCompute('tide_attribution', (ctx) => {
      calls++;
      ctx.setFlag('a1_tide_credit', 'martha');
    });
    const g = game({
      a1_tide_stage: 4,
      a1_tide_dusk_seen: true,
      a1_tide_weakest: 'west',
      a1_tide_gap_weakest: 8,
    });
    play(g, 'cut_a1_tide', scripted({ choose_core: ['grasp'] }));
    const f = g.world.meta.flags;
    expect([f.a1_core_choice, f.a1_core_choice_made, f['trust.yeyu']]).toEqual([
      'grasp',
      true,
      -20,
    ]);
    expect(g.world.slices.scenes.current?.sceneId).toBe('cut_a1_martha');
    expect(calls).toBe(0);
    play(g, 'cut_a1_martha', firstOpen(), false);
    expect(calls).toBe(1);
    expect([f.a1_tide_credit, f.a1_martha_strike, f['npc.martha.revealed']]).toEqual([
      'martha',
      true,
      true,
    ]);
    const attribution = node('cut_a1_martha', 'attribution').effects ?? [];
    expect(attribution).toContainEqual({ type: 'compute', fn: 'tide_attribution' });
  });

  it('the tide: dusk plays first wherever the player is; the core reads stage 4', () => {
    // a later stage reached while the dusk is unseen (the night skipped in sleep): dusk first,
    // so a1_tide_post and a1_east_gate_ordered are written before any other segment
    const g = game({ a1_tide_night: true, a1_tide_stage: 3 });
    place(g, 'inner_court', 'court_arrival');
    g.step(2);
    expect(g.world.slices.scenes.current?.sceneId).toBe('cut_a1_tide');
    expect(g.world.slices.scenes.current?.nodeId).toBe('dusk');
    // the colossus fell by any of the tide's ways: stage 4 opens the core, not one boss flag
    const route = node('cut_a1_tide', 'route');
    expect(route.branch?.[0]).toEqual({ when: 'NOT a1_tide_dusk_seen', to: 'dusk' });
    expect(route.branch?.some((b) => b.when.includes('boss.dian_colossus'))).toBe(false);
    expect(
      scene('cut_a1_tide').triggers?.find((t) => t.when.includes('a1_core_choice_made'))?.when,
    ).toBe('a1_tide_stage >= 4 AND NOT a1_core_choice_made');
  });

  it('the trial report: a bribed release is unresolved, never cleared (registry 8.8)', () => {
    for (const [flags, want] of [
      [{ a1_oola_fate: 'cleared', a1_oola_bribed: true }, 'unresolved'],
      [{ a1_oola_fate: 'cleared' }, 'cleared'],
      [{ a1_oola_fate: 'convicted' }, 'convicted'],
    ] as const) {
      const g = game({ ...flags });
      g.queue('scenes.start', { sceneId: 'cut_a1_trial' });
      g.step(1);
      play(g, 'cut_a1_trial', firstOpen(), false);
      expect(g.world.meta.flags.a1_cassian_report, JSON.stringify(flags)).toBe(want);
    }
  });

  it('the dream: a free answer sorts into the enum, the words go to their own text flag', () => {
    const af = node('cut_a1_dream', 'answer_free');
    expect(af.input?.storeAs).toBe('a1_janu_dream_words');
    expect(af.input?.classify).toEqual({
      node: 'question',
      choices: ['like', 'unsure', 'dislike'],
      fallback: 'unsure',
      settle: true,
    });
    // no effect of the dream writes free text into the enum
    for (const n of scene('cut_a1_dream').nodes) {
      expect(n.input?.storeAs, n.id).not.toBe('a1_janu_dream_answer');
      for (const c of n.choices ?? [])
        for (const e of c.effects ?? [])
          if (e.type === 'flag' && e.key === 'a1_janu_dream_answer')
            expect(['like', 'unsure', 'dislike']).toContain(e.value);
    }
    // played without a model, the free answer settles on the fallback's value
    const g = game({ a1_beast_tide_cleared: true });
    play(g, 'cut_a1_dream', scripted({ ask: ['enough'], question: ['free_answer'] }));
    expect(g.world.meta.flags.a1_janu_dream_answer).toBe('unsure');
  });

  it('the wake shows the six sigils as the lore page H03', () => {
    const sigils = node('cut_a1_wake', 'sigils').effects ?? [];
    expect(sigils).toContainEqual({ type: 'item', item: 'lore_h03' });
    // reading is the inventory's mirror (registry: writer inventory), never a content write
    expect(sigils.some((e) => e.type === 'flag' && e.key.startsWith('read.'))).toBe(false);
  });
});
