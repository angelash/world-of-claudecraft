// PK-M1-27 (content batch content_prologue_scenes_01): the prologue as the seven cut_p_
// scenes of catalog_cutscenes.md 4 and the prologue quests of catalog_quests_acts1_3.md 4.
// The chain from the opening act into act 1, the re-choice of the opening (P1 to P6 only), the
// five interview rounds with a model (multi-turn, how each round ended, a classification that
// settles only the category), the anchor nodes, and both tiers played to the end with every
// anchor of prologue_antechamber.md 6 said once and in the arc's order.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Engine } from '../src/core';
import type { FlagValue } from '../src/core/contracts';
import { tSource } from '../src/shared_ui/i18n';
import type { QuestDef } from '../src/systems/quests';
import { type SceneDef, type SceneNode, sceneView } from '../src/systems/scenes';
import { DEFAULT_PLAYER_APPEARANCE } from '../src/systems/world';
import { narrativeContent, narrativeGame, playScene, recordLines } from './narrative_harness';

const content = narrativeContent();
const SCENES = [
  'cut_p_earth',
  'cut_p_door_white',
  'cut_p_quarrel',
  'cut_p_call',
  'cut_p_interview',
  'cut_p_judgement',
  'cut_p_discard',
];
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

/** The anchors of the default no-model path (prologue 6), in the order the arc says them. */
const ANCHORS: [string, string][] = [
  ['eluen', '那种连神都没有的荒地？'],
  ['eluen', '这不合规格。'],
  ['moira', '规格外……我的书里，没有你那一页。有意思。'],
  ['eluen', '距离审定只剩两年，我没有时间浪费在瑕疵品上。'],
  ['valda', '哈！你也有看走眼的时候？上一次你这么慌，还是那件事的时候吧？'],
  ['merca', '……上面在看吗？'],
  ['eluen', '上面从来不看过程。'],
  ['merca', '这枚硬币先赊给你。客人，生意要做长久。'],
  ['merca', '反正上面那位只看结果。'],
  ['moira', '放心，这一章才刚开始。'],
  ['eluen', '去吧，庭间之隙会替我处理你。'],
  ['sylvie', '……别相信我们任何一个。包括我。'],
  ['door_voice', '接住你了。'],
];

/** The flash of A09 (ledger 4: the hall's light flickers and all five look up). */
const FLASH = '大厅的光闪了一下。五位女神同时抬头，望向没有天花板的上方。';

/** The skip summaries of catalog_cutscenes.md 13.9, read from the catalog itself. */
function catalogSummaries(): Record<string, string> {
  const md = readFileSync(
    join(__dirname, '..', 'docs', '40_design', 'content', 'catalog_cutscenes.md'),
    'utf8',
  );
  const section = md.slice(md.indexOf('### 13.9'), md.indexOf('### 13.10'));
  const out: Record<string, string> = {};
  for (const m of section.matchAll(/^\| `(cut_p_\w+)` \| (.+) \|\r?$/gm))
    out[m[1] as string] = m[2] as string;
  expect(Object.keys(out).length).toBe(7);
  return out;
}

/** Every anchor once, by its speaker, and in the order of ANCHORS. */
function expectAnchorsInOrder(lines: { text: string; speakerId: string }[]): void {
  let last = -1;
  for (const [speaker, text] of ANCHORS) {
    const hits = lines.flatMap((l, i) => (l.text.includes(text) ? [i] : []));
    expect(hits.length, text).toBe(1);
    const at = hits[0] as number;
    expect(lines[at]?.speakerId, text).toBe(speaker);
    expect(at, text).toBeGreaterThan(last);
    last = at;
  }
}

const PROLOGUE_QUESTS = [
  'q_p_m01_last_moment',
  'q_p_m02_antechamber',
  'q_p_m03_interview',
  'q_p_m04_out_of_spec',
  'q_p_m05_caught',
  'q_p_s01_sixth_chair',
  'q_p_s02_next_door',
];

/** The five rounds: the question node, its free answer, the settlement node and the close. */
const ROUNDS = [
  { g: 'eluen', node: 'n6_eluen', free: 'n6_eluen_free', close: 'n6_eluen_close', fb: 'e4' },
  { g: 'valda', node: 'n7_valda', free: 'n7_valda_free', close: 'n7_valda_close', fb: 'v6' },
  { g: 'merca', node: 'n8_merca', free: 'n8_merca_free', close: 'n8_ledger', fb: 'm4' },
  { g: 'sylvie', node: 'n9_sylvie', free: 'n9_sylvie_free', close: 'n9_close', fb: 's3' },
  { g: 'moira', node: 'n10_moira', free: 'n10_moira_free', close: 'n10_past', fb: 'o4' },
];

describe('the seven prologue scenes', () => {
  it('chain from the opening act into act 1, each with its presentation and skip summary', () => {
    const prologue = content.acts.find((a) => a.id === 'prologue');
    expect(prologue?.introScene).toBe('cut_p_earth');
    expect(content.scenes.some((s) => s.id === 'prologue')).toBe(false);
    for (let i = 0; i < SCENES.length; i++) {
      const s = scene(SCENES[i] as string);
      expect(s.act).toBe('prologue');
      expect(s.summary, s.id).toBe(catalogSummaries()[s.id]);
      expect(s.presentation, s.id).toBe(s.id === 'cut_p_interview' ? 'theater' : 'staged');
      if (i < SCENES.length - 1) expect(s.then).toBe(SCENES[i + 1]);
    }
    // the last scene hands over to act 1 (PK-M1-34): it chains into act 1's first cutscene and
    // changes the act; the act's own request of that intro is dropped while it already plays
    const last = scene('cut_p_discard');
    expect(last.then).toBe('cut_a1_wake');
    expect(content.acts.find((a) => a.id === 'act1')?.introScene).toBe(last.then);
    expect(last.onEnd).toEqual([{ type: 'act', act: 'act1' }]);
    // the interview and the judgement are staged in the interview hall
    expect([scene('cut_p_interview').mapId, scene('cut_p_interview').location]).toEqual([
      'divine_court',
      'interview_hall',
    ]);
    // the spirit mirror offers the real mirror first, the six snapshots after it
    expect(node('cut_p_door_white', 'n3_mirror').choices?.map((c) => c.id)).toEqual([
      'creator',
      'look_1',
      'look_2',
      'look_3',
      'look_4',
      'look_5',
      'look_6',
    ]);
  });

  it('offers the re-choice of the opening from P1 to P6 only, resetting quests and player', () => {
    for (const id of SCENES.slice(0, 4)) {
      const r = scene(id).restart;
      expect(r?.scene, id).toBe('cut_p_earth');
      expect(r?.until, id).toBeUndefined();
      // the prologue quests and the player's name and look go back too (PK-M1-34, plan row)
      expect(r?.clear, id).toEqual(['p_*', 'scene.cut_p_*', 'quest.q_p_*']);
      expect(r?.resetPlayer, id).toBe(true);
      expect(r?.take, id).toEqual([
        'relic_badge',
        'relic_receipt',
        'relic_mint',
        'relic_key',
        'number_tag_five',
      ]);
    }
    for (const id of SCENES.slice(4)) expect(scene(id).restart, id).toBeUndefined();
  });

  it('gives each interview round a multi-turn answer that records how it ended', () => {
    for (const r of ROUNDS) {
      const input = node('cut_p_interview', r.free).input;
      expect(input?.agentId).toBe(r.g);
      expect(input?.role).toBe('goddess.dialogue');
      expect(input?.storeAs).toBe(`p_free.${r.g}`);
      expect(input?.turns).toEqual({ soft: 6, hard: 10, storeAs: `p_round_end.${r.g}` });
      expect(input?.to).toBe(r.close);
      // the model's category settles only that category's effects, then the round's close
      const main = node('cut_p_interview', r.node);
      const settle = node('cut_p_interview', `${r.node}_ai`);
      expect(input?.classify?.node).toBe(settle.id);
      expect(input?.classify?.fallback).toBe(r.fb);
      const cats = (main.choices ?? []).filter((c) => c.id !== 'free' && c.id !== 'say_name');
      expect(input?.classify?.choices).toEqual(cats.map((c) => c.id));
      expect(settle.choices?.map((c) => c.id)).toEqual(cats.map((c) => c.id));
      for (const c of cats) {
        const s = settle.choices?.find((x) => x.id === c.id);
        expect(s?.effects, `${r.node}/${c.id}`).toEqual(c.effects);
        // the runner logs a classified pick like a chosen one: it reads as the written option
        expect(s?.label).toBe(c.label);
        expect(s?.to).toBe(r.close);
      }
      // nothing leads into the settlement node: it only names the categories
      for (const n of scene('cut_p_interview').nodes) {
        expect(n.next).not.toBe(settle.id);
        for (const c of n.choices ?? []) expect(c.to).not.toBe(settle.id);
      }
    }
    // the earth anchor of E6 is written by the reaction node, so the model tier's E6 (a joke
    // that never named the earth) does not write it
    expect(node('cut_p_interview', 'n6_eluen_e6').effects).toEqual([
      { type: 'flag', key: 'p_earth_anchor_trigger', value: 'player' },
    ]);
  });

  it('marks the nodes that hold an anchor line, and no other', () => {
    const anchorText = [...ANCHORS.map(([, t]) => t), '地球？那种连神都没有的荒地？', FLASH];
    for (const id of SCENES)
      for (const n of scene(id).nodes) {
        const holds = (n.lines ?? []).some((l) => anchorText.some((t) => l.text.includes(t)));
        expect(!!n.anchor, `${id}/${n.id}`).toBe(holds);
      }
    // every anchor stands in some anchor node
    for (const [, text] of ANCHORS) {
      const where = SCENES.flatMap((id) =>
        scene(id).nodes.filter((n) => n.anchor && n.lines?.some((l) => l.text.includes(text))),
      );
      expect(where.length, text).toBeGreaterThan(0);
    }
  });
});

describe('the prologue played', () => {
  it('without a model: every scene, every anchor once and in order, every prologue quest', () => {
    const g = narrativeGame({ stub: false });
    const lines = recordLines(g);
    // lines and quest starts in one sequence, to see when each quest begins
    const order: string[] = [];
    g.onEvents((events) => {
      for (const e of events) {
        if (e.kind === 'quest.started') order.push(`quest:${e.data.questId}`);
        if (e.kind === 'dialogue.line') order.push(`line:${tSource(e.data.text)}`);
      }
    });
    g.step(1);
    expect(sceneView(g.world, g.content)?.sceneId).toBe('cut_p_earth');
    playScene(g);
    g.step(5);
    for (const id of SCENES) expect(g.world.slices.scenes.seen, id).toContain(id);
    expectAnchorsInOrder(lines);
    const f = g.world.meta.flags;
    expect(f.act).toBe('act1');
    expect(f.p_caught).toBe(true);
    expect(f.p_last_words).toBe('back');
    expect(f.p_unsent_words).toBe('（没有回）');
    expect(f['p_free.last_words']).toBeUndefined();
    // without a model no round ran with turns
    for (const r of ROUNDS) expect(f[`p_round_end.${r.g}`], r.g).toBeUndefined();
    // the default path listens at the wall and asks about the empty chair
    for (const id of PROLOGUE_QUESTS) expect(f[`quest.${id}`], id).toBe('done');
    // the two quests named after anchors begin only once those anchors were said
    const at = (key: string) => order.findIndex((x) => x.startsWith(key));
    expect(at('quest:q_p_m04_out_of_spec')).toBeGreaterThan(at(`line:${FLASH}`));
    expect(at('quest:q_p_m04_out_of_spec')).toBeGreaterThan(at('line:这不合规格。'));
    expect(at('quest:q_p_m05_caught')).toBeGreaterThan(at('line:接住你了。'));
    expect(at('quest:q_p_m01_last_moment')).toBeGreaterThanOrEqual(0);
    const kinds = new Map(content.quests.map((q: QuestDef) => [q.id, q.kind]));
    expect(PROLOGUE_QUESTS.map((id) => kinds.get(id))).toEqual([
      'main',
      'main',
      'main',
      'main',
      'main',
      'explore',
      'explore',
    ]);
  });

  it('with a model: each round closes as the goddess says, the category settles, the end is the same', () => {
    const g = narrativeGame({ stub: false, aiMode: 'external' });
    const lines = recordLines(g);
    // the model's category per round: the second one (not the written fallback)
    const PICK: Record<string, string> = {
      n6_eluen_ai: 'e2',
      n7_valda_ai: 'v1',
      n8_merca_ai: 'm2',
      n9_sylvie_ai: 's4',
      n10_moira_ai: 'o5',
    };
    const answer = () => {
      for (const r of g.takeAiRequests()) {
        const extra = (r.context as { extra?: Record<string, unknown> }).extra ?? {};
        if (!r.allowed.includes('scenes.resolve') || extra.runId === undefined) {
          g.resolveAi(r.id, { type: 'decline', reason: 'test' });
          continue;
        }
        const into = ((extra.classifyInto as { id: string }[] | undefined) ?? []).map((c) => c.id);
        const run = g.world.slices.scenes.current;
        const classify = run
          ? g.content.scenes
              .find((s) => s.id === run.sceneId)
              ?.nodes.find((n) => n.id === run.nodeId)?.input?.classify
          : undefined;
        const choiceId =
          (classify && PICK[classify.node]) ?? (into.includes('notes') ? 'notes' : undefined);
        g.resolveAi(r.id, {
          type: 'proposal',
          commands: [
            {
              kind: 'scenes.resolve',
              data: {
                runId: Number(extra.runId),
                revision: r.revision,
                lines: [{ speaker: r.agentId, text: '模型的回答。' }],
                choiceId,
                // the second turn closes the round
                done: Number(extra.turn ?? 1) >= 2,
              },
              source: { type: 'player' },
            },
          ],
        });
      }
    };
    g.step(1);
    for (let i = 0; i < 3000 && g.world.meta.flags.act !== 'act1'; i++) {
      answer();
      const v = sceneView(g.world, g.content);
      if (v?.waiting === 'choice') {
        const free = v.choices.find((c) => c.id === 'free');
        g.queue('scenes.choose', { choiceId: (free ?? v.choices[0])?.id ?? '' });
      } else if (v?.waiting === 'input') g.queue('scenes.input', { text: '我想想。' });
      else if (v?.waiting === 'advance') g.queue('scenes.advance', {});
      else if (v?.waiting === 'ui' && v.ui)
        g.queue('scenes.ui_done', { runId: v.runId, revision: v.revision, ui: v.ui });
      g.step(1);
    }
    const f = g.world.meta.flags as Record<string, FlagValue>;
    expect(f.act).toBe('act1');
    expectAnchorsInOrder(lines);
    for (const r of ROUNDS) {
      expect(f[`p_round_end.${r.g}`], r.g).toBe('closed');
      expect(f[`p_free.${r.g}`], r.g).toBe('我想想。');
    }
    expect(String(f.p_answers).split(',')).toEqual(['E2', 'V1', 'M2', 'S4', 'O5']);
    // the categories' written reactions and follow-ups stay unsaid with a model
    for (const text of ['光还没量过你，你倒先替自己量好了。', '会还价！我就知道今天不会白来。'])
      expect(lines.some((l) => l.text === text)).toBe(false);
    // each settled category still counts: E2's memory tag, M2's high value, S4's open window
    expect(g.world.slices.goddess.goddesses.eluen?.memoryTags).toContain('自负');
    expect(f.p_merca_valuation).toBe('high');
    expect(f.p_courtyard_object).toBe('open_window');
    expect(f.p_past_life_door).toBe('notes');
    // a free last sentence: `free`, its words kept and echoed
    expect(f.p_last_words).toBe('free');
    expect(f['p_free.last_words']).toBe('我想想。');
    expect(lines.some((l) => l.speakerId === 'player' && l.text === '我想想。')).toBe(true);
    expect(f.p_call_free_count).toBe(3);
  });

  it('with a model that never closes a round: the hard cap ends it and Moira knocks', () => {
    const g = narrativeGame({ stub: false, aiMode: 'external' });
    const lines = recordLines(g);
    g.step(1);
    for (let i = 0; i < 3000 && !g.world.meta.flags['p_round_end.eluen']; i++) {
      for (const r of g.takeAiRequests()) {
        const extra = (r.context as { extra?: Record<string, unknown> }).extra ?? {};
        if (!r.allowed.includes('scenes.resolve') || extra.runId === undefined) {
          g.resolveAi(r.id, { type: 'decline', reason: 'test' });
          continue;
        }
        g.resolveAi(r.id, {
          type: 'proposal',
          commands: [
            {
              kind: 'scenes.resolve',
              data: {
                runId: Number(extra.runId),
                revision: r.revision,
                lines: [{ speaker: r.agentId, text: '还没完。' }],
                done: false,
              },
              source: { type: 'player' },
            },
          ],
        });
      }
      const v = sceneView(g.world, g.content);
      if (v?.waiting === 'choice') {
        const free = v.choices.find((c) => c.id === 'free');
        // the call's free questions are skipped here: straight to the interview
        const ask = v.nodeId === 'n5_questions' ? v.choices.find((c) => c.id === 'begin') : null;
        g.queue('scenes.choose', { choiceId: (ask ?? free ?? v.choices[0])?.id ?? '' });
      } else if (v?.waiting === 'input') g.queue('scenes.input', { text: '再想想。' });
      else if (v?.waiting === 'advance') g.queue('scenes.advance', {});
      else if (v?.waiting === 'ui' && v.ui)
        g.queue('scenes.ui_done', { runId: v.runId, revision: v.revision, ui: v.ui });
      g.step(1);
    }
    expect(g.world.meta.flags['p_round_end.eluen']).toBe('hard');
    // ten player turns, the opening answer kept; the written fallback category settles
    expect(lines.filter((l) => l.text === '还没完。').length).toBe(10);
    expect(g.world.meta.flags['p_free.eluen']).toBe('再想想。');
    expect(String(g.world.meta.flags.p_answers)).toBe('E4');
    expect(
      lines.some((l) => l.speakerId === 'moira' && l.text === '（用笔杆敲了敲桌面）下一位。'),
    ).toBe(true);
    // her written closing line belongs to the no-model tier: with a model the round itself closes
    expect(lines.some((l) => l.text === '够了。剩下的，光会替我看。')).toBe(false);
  });

  it('forgets the name, the look and the prologue quests when the opening is chosen again', () => {
    const g = narrativeGame({ stub: false });
    g.step(1);
    const step = (e: Engine) => {
      const v = sceneView(e.world, e.content);
      if (!v) throw new Error('no scene');
      if (v.waiting === 'input')
        e.queue('scenes.input', { text: v.input?.prompt.includes('名字') ? '阿门' : '' });
      else if (v.waiting === 'ui' && v.ui)
        e.queue('scenes.ui_done', { runId: v.runId, revision: v.revision, ui: v.ui });
      else if (v.waiting === 'choice')
        e.queue('scenes.choose', { choiceId: v.choices[0]?.id ?? '' });
      else e.queue('scenes.advance', {});
      e.step(1);
    };
    for (let i = 0; i < 400 && sceneView(g.world, g.content)?.nodeId !== 'n5_questions'; i++)
      step(g);
    expect(sceneView(g.world, g.content)?.sceneId).toBe('cut_p_call');
    expect(g.world.meta.flags['player.name']).toBe('阿门');
    expect(sceneView(g.world, g.content)?.restartable).toBe(true);
    g.queue('scenes.restart', {});
    g.step(1);
    const v = sceneView(g.world, g.content);
    expect([v?.sceneId, v?.nodeId]).toEqual(['cut_p_earth', 'n1_opening']);
    // the prologue's own flags and the seen flags of its scenes are gone
    expect(g.world.meta.flags.p_earth_opening).toBeUndefined();
    expect(g.world.meta.flags.p_mirror_done).toBeUndefined();
    expect(g.world.meta.flags['scene.cut_p_quarrel.seen']).toBeUndefined();
    expect(g.world.slices.scenes.seen).not.toContain('cut_p_door_white');
    // the name and the look: flag and entity agree, both back to the defaults (the call asks
    // the name again; the mirror asks the look again)
    expect(g.world.meta.flags['player.name']).toBeUndefined();
    expect(g.world.meta.flags.p_appearance).toBeUndefined();
    const player = g.world.slices.world.entities[g.world.slices.world.playerId];
    expect(player?.name).toBe('?');
    expect(player?.appearance).toEqual(DEFAULT_PLAYER_APPEARANCE);
    // the prologue quests: only what the replayed opening has started again, nothing of the
    // stages the dropped run had reached
    const started = Object.keys(g.world.slices.quests.quests).filter((id) => id.startsWith('q_p_'));
    for (const id of started) expect(g.world.slices.quests.quests[id]?.stage, id).toBe(0);
    // a stage flag exists only for a quest the replay started again, and names its first stage
    for (const k of Object.keys(g.world.meta.flags).filter((x) =>
      /^quest\.q_p_[a-z0-9_]+\.stage$/.test(x),
    )) {
      const id = k.slice('quest.'.length, -'.stage'.length);
      expect(started, k).toContain(id);
      expect(g.world.meta.flags[k], k).toBe(
        g.content.quests.find((q) => q.id === id)?.stages[0]?.id,
      );
    }
  });
});
