// The onboarding budgets of docs/40_design/onboarding_interaction.md 3 (B1 to B7), measured on
// the real kernel: the prologue played from a new game to the start of act 1 by a "direct"
// player (the way forward at every menu, straight to the exit touch point) and a "curious" one
// (every touch point and option tried once first). A player action is a choice, an input, a
// touch point used, a stance taken by standing, or an interface closed; lines are counted as
// `dialogue.line` events between them.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Engine } from '../src/core';
import { t } from '../src/shared_ui/i18n';
import { roamPoints, type SceneDef, sceneView } from '../src/systems/scenes';
import { narrativeGame } from './narrative_harness';

/** Character-setting menus are exempt from the width budget (B4). */
const CREATION_MENUS = new Set(['n1_opening', 'n3_mirror', 'n10_past']);
const OPENINGS = ['a', 'b', 'c', 'd'] as const;
type Opening = (typeof OPENINGS)[number];
type Style = 'direct' | 'curious';

interface Run {
  /** the transcript: line texts, and '>' entries where the player acted */
  log: string[];
  linesBeforeRoam: number;
  roamNodes: Set<string>;
  widest: { node: string; width: number };
  questions: number;
  /** the world's flags at the start of act 1 */
  flags: Record<string, unknown>;
}

/**
 * What a run picks besides its style: the stance (bench, press, step, cough, cough_near) and,
 * once each, a choice at a named node (a pause's noise or leave, the call's free question).
 */
interface Picks {
  stance?: string;
  once?: Record<string, string>;
  /** the text typed at a node's input (empty otherwise) */
  input?: Record<string, string>;
}

/** The way forward of the direct player at a node (the first visible option otherwise). */
const DIRECT: Record<string, readonly string[]> = {
  n1_a_hub: ['phone'],
  n1_b: ['clerk'],
  n1_b_hub: ['cat'],
  n1_c_hub: ['ward'],
  n1_d_hub: ['chair'],
  n2_door_hub: ['push'],
  n3_hub: ['mirror', 'wait'],
  n3_mirror: ['look_1'],
  n5_questions: ['begin'],
  n10_where: ['earth'],
  n10_earth_anchor: ['let'],
  n6_eluen_e6: ['let'],
  n11_coin_2: ['grip'],
  n13_fall: ['reach'],
};

function play(opening: Opening, style: Style, picks: Picks = {}): Run {
  const engine: Engine = narrativeGame({ stub: true });
  const run: Run = {
    log: [],
    linesBeforeRoam: -1,
    roamNodes: new Set(),
    widest: { node: '', width: 0 },
    questions: 0,
    flags: {},
  };
  const once = { ...picks.once };
  // count up to act 1: the act-1 opening scene starts in the same step the prologue ends
  let done = false;
  engine.onEvents((events) => {
    for (const e of events) {
      if (e.kind === 'scene.started' && (e.data as { sceneId: string }).sceneId === 'cut_a1_wake')
        done = true;
      if (e.kind === 'dialogue.line' && !done) run.log.push(t(e.data.text));
    }
  });
  const tried = new Set<string>();
  const act = (what: string) => run.log.push(`> ${what}`);
  /** Walk to a location of the open roam node's map (a teleport: the walk itself is not measured). */
  const walkTo = (location: string) => {
    const v = sceneView(engine.world, engine.content);
    const scene = engine.content.scenes.find((s) => s.id === v?.sceneId) as SceneDef;
    const node = scene.nodes.find((n) => n.id === v?.nodeId);
    const mapId = node?.roam?.mapId ?? '';
    const loc = engine.content.maps
      .find((m) => m.id === mapId)
      ?.locations.find((l) => l.id === location);
    if (!loc) throw new Error(`no location ${location} on ${mapId}`);
    engine.queue('world.teleport', {
      entityId: 'player',
      mapId,
      x: loc.x + loc.w / 2,
      y: loc.y + loc.h / 2,
    });
    engine.step(1);
  };
  for (let i = 0; i < 60_000; i++) {
    const v = sceneView(engine.world, engine.content);
    if (!v) {
      if (engine.world.meta.flags.act === 'act1') break;
      engine.step(1);
      continue;
    }
    if (v.sceneId === 'cut_a1_wake') break;
    const key = (id: string) => `${v.sceneId}/${v.nodeId}/${id}`;
    if (v.waiting === 'roam') {
      if (run.linesBeforeRoam < 0)
        run.linesBeforeRoam = run.log.filter((l) => !l.startsWith('>')).length;
      run.roamNodes.add(`${v.sceneId}/${v.nodeId}`);
      const points = roamPoints(engine.world, engine.content).filter((p) => !p.stand);
      const stands = roamPoints(engine.world, engine.content).filter((p) => p.stand);
      if (v.nodeId === 'n4_stance') {
        // the stance: the direct player stays on the bench, the curious one presses close; a
        // cough is a touch point used where it stands
        const stance = picks.stance ?? (style === 'curious' ? 'press' : 'bench');
        const c = v.choices.find((x) => x.id === stance);
        if (c?.at) walkTo(c.at);
        if (c && !c.stand && !c.hidden) {
          engine.queue('scenes.choose', { choiceId: stance });
          act(`roam ${stance}`);
          engine.step(1);
          continue;
        }
        void stands;
        act('stand');
        for (
          let k = 0;
          k < 20 * 60 && sceneView(engine.world, engine.content)?.nodeId === 'n4_stance';
          k++
        )
          engine.step(1);
        continue;
      }
      const want = DIRECT[v.nodeId] ?? [];
      const exits = points.filter((p) => p.timed || v.choices.find((c) => c.id === p.id)?.timeout);
      const pick =
        style === 'direct'
          ? (want.map((w) => points.find((p) => p.id === w)).find(Boolean) ??
            points[points.length - 1])
          : (points.find((p) => !tried.has(key(p.id)) && !exits.includes(p)) ??
            exits[0] ??
            points[0]);
      if (!pick) {
        engine.step(1);
        continue;
      }
      tried.add(key(pick.id));
      if (pick.location) walkTo(pick.location);
      engine.queue('scenes.choose', { choiceId: pick.id });
      act(`roam ${pick.id}`);
    } else if (v.waiting === 'choice' || v.waiting === 'court') {
      const open = v.choices.filter(
        (c) => c.id !== 'free' && c.id !== 'say_name' && c.id !== 'ask',
      );
      const pool = open.length ? open : v.choices;
      const listed = v.choices.filter((c) => !c.hidden).length;
      if (!CREATION_MENUS.has(v.nodeId) && listed > run.widest.width)
        run.widest = { node: `${v.sceneId}/${v.nodeId}`, width: listed };
      let pick: string | undefined;
      const forced = once[v.nodeId];
      if (forced && v.choices.some((c) => c.id === forced)) {
        pick = forced;
        delete once[v.nodeId];
      } else if (v.nodeId === 'n1_opening') pick = opening;
      else if (style === 'direct')
        pick = (DIRECT[v.nodeId] ?? []).find((w) => pool.some((c) => c.id === w)) ?? pool[0]?.id;
      else pick = pool.find((c) => !tried.has(key(c.id)))?.id ?? pool[0]?.id;
      if (!pick) throw new Error(`no choice at ${v.sceneId}/${v.nodeId}`);
      tried.add(key(pick));
      if (v.nodeId === 'n5_questions' && pick !== 'begin' && pick !== 'rename') run.questions++;
      engine.queue('scenes.choose', { choiceId: pick });
      act(`choose ${pick}`);
    } else if (v.waiting === 'input') {
      engine.queue('scenes.input', { text: picks.input?.[v.nodeId] ?? '' });
      act('input');
    } else if (v.waiting === 'advance') {
      engine.queue('scenes.advance', {});
    } else if (v.waiting === 'ui' && v.ui) {
      const cur = engine.world.slices.scenes.current;
      if (cur)
        engine.queue('scenes.ui_done', { runId: cur.runId, revision: cur.revision, ui: v.ui });
      act('ui');
    }
    engine.step(1);
  }
  if (engine.world.meta.flags.act !== 'act1')
    throw new Error(`prologue did not end (${style} ${opening})`);
  run.flags = { ...engine.world.meta.flags };
  return run;
}

const lines = (r: Run) => r.log.filter((l) => !l.startsWith('>'));

/** The longest stretch of lines with no player action in between (B2). */
function longestPassive(r: Run): { length: number; from: string } {
  let best = { length: 0, from: '' };
  let run = 0;
  let from = '';
  for (const l of r.log) {
    if (l.startsWith('>')) {
      run = 0;
      continue;
    }
    if (run === 0) from = l;
    run++;
    if (run > best.length) best = { length: run, from };
  }
  return best;
}

/** Whole-line stage directions said as narration (B6): "（……）". */
function stageLines(r: Run): string[] {
  return lines(r).filter((l) => l.startsWith('（') && l.endsWith('）'));
}

const runs = new Map<string, Run>();
function measured(opening: Opening, style: Style): Run {
  const k = `${opening}/${style}`;
  let r = runs.get(k);
  if (!r) {
    r = play(opening, style);
    runs.set(k, r);
  }
  return r;
}

describe('onboarding budgets (onboarding_interaction.md 3)', () => {
  it.each(OPENINGS)('B1: control within 6 lines of a new game (opening %s)', (o) => {
    expect(measured(o, 'direct').linesBeforeRoam).toBeGreaterThanOrEqual(0);
    expect(measured(o, 'direct').linesBeforeRoam).toBeLessThanOrEqual(6);
  });

  it.each(OPENINGS)('B2: no more than 10 lines without a player action (opening %s)', (o) => {
    for (const style of ['direct', 'curious'] as const) {
      const longest = longestPassive(measured(o, style));
      expect(longest.length, `${style}: from "${longest.from}"`).toBeLessThanOrEqual(10);
    }
  });

  it('B2: holds for every stance and every answer at the pauses between segments', () => {
    const variants: [string, Picks][] = [
      ['bench', { stance: 'bench' }],
      ['cough from three steps', { stance: 'cough' }],
      ['cough against the curtain', { stance: 'cough_near' }],
      ['three steps', { stance: 'step' }],
      ['against the curtain', { stance: 'press' }],
    ];
    for (const k of [1, 2, 3, 4]) {
      variants.push([
        `near, noise at pause ${k}`,
        { stance: 'press', once: { [`n4_p${k}`]: 'noise' } },
      ]);
      variants.push([
        `middle, noise at pause ${k}`,
        { stance: 'step', once: { [`n4_p${k}`]: 'noise' } },
      ]);
    }
    for (const k of [1, 2, 3, 4, 5])
      variants.push([
        `near, leave at pause ${k}`,
        { stance: 'press', once: { [`n4_p${k}`]: 'leave' } },
      ]);
    for (const [name, picks] of variants) {
      const longest = longestPassive(play('a', 'direct', picks));
      expect(longest.length, `${name}: from "${longest.from}"`).toBeLessThanOrEqual(10);
    }
  });

  it('keeps what was heard: leaving at the last pause keeps the tier act 1 recalls', () => {
    // the keys and the light come before the last pause; walking back there keeps level 3
    expect(
      play('a', 'direct', { stance: 'press', once: { n4_p5: 'leave' } }).flags.p_eavesdrop_level,
    ).toBe(3);
    // a noise before them lowers what can be heard (near to middle: the light is missed)
    expect(
      play('a', 'direct', { stance: 'press', once: { n4_p2: 'noise' } }).flags.p_eavesdrop_level,
    ).toBe(2);
    // never moving hears from the bench
    expect(play('a', 'direct', { stance: 'bench' }).flags.p_eavesdrop_level).toBe(0);
  });

  it.each(OPENINGS)('B3: the prologue fits its line budget (opening %s)', (o) => {
    expect(lines(measured(o, 'direct')).length).toBeLessThanOrEqual(140);
    expect(lines(measured(o, 'curious')).length).toBeLessThanOrEqual(190);
  });

  it('B4: no menu wider than 8 options (character-setting menus aside)', () => {
    for (const o of OPENINGS)
      for (const style of ['direct', 'curious'] as const) {
        const w = measured(o, style).widest;
        expect(w.width, w.node).toBeLessThanOrEqual(8);
      }
  });

  it('B5: at least three roam beats (the room, the antechamber, the stance)', () => {
    const nodes = measured('a', 'direct').roamNodes;
    expect(nodes.size).toBeGreaterThanOrEqual(3);
    expect([...nodes]).toEqual(
      expect.arrayContaining([
        'cut_p_earth/n1_a_hub',
        'cut_p_door_white/n3_hub',
        'cut_p_quarrel/n4_stance',
      ]),
    );
  });

  it.each(OPENINGS)('B6: at most 8 whole-line stage directions on the way (opening %s)', (o) => {
    expect(stageLines(measured(o, 'direct')).length).toBeLessThanOrEqual(8);
  });

  it('B7: the call takes three questions at most', () => {
    expect(measured('a', 'curious').questions).toBe(3);
  });

  it('B7: a free question costs one of the three, whether a rule sorts it or not', () => {
    // nothing sorts an empty question: the counted "other" answer
    expect(play('a', 'direct', { once: { n5_questions: 'ask' } }).flags.p_call_free_count).toBe(1);
    // the rule classifier sorts "where" into the written question, which counts once
    const sorted = play('a', 'direct', {
      once: { n5_questions: 'ask' },
      input: { n5_q_free: '这是哪里？你们是谁？' },
    });
    expect(sorted.log).toContain('神庭的候见厅。我们是照看你将要去的那座庭园的人。');
    expect(sorted.flags.p_call_free_count).toBe(1);
  });

  it('records the measurements (for the design doc)', () => {
    const rows = OPENINGS.flatMap((o) =>
      (['direct', 'curious'] as const).map((s) => {
        const r = measured(o, s);
        return `${o} ${s}: lines ${lines(r).length}, before control ${r.linesBeforeRoam}, longest ${longestPassive(r).length}, stage ${stageLines(r).length}, widest ${r.widest.width} (${r.widest.node})`;
      }),
    );
    // HK_ONBOARDING_REPORT=<dir> prints the table and writes each transcript there
    const dir = process.env.HK_ONBOARDING_REPORT;
    if (dir) {
      console.log(rows.join('\n'));
      for (const [k, r] of runs)
        writeFileSync(join(dir, `${k.replace('/', '_')}.txt`), r.log.join('\n'));
    }
    expect(rows.length).toBe(8);
  });
});
