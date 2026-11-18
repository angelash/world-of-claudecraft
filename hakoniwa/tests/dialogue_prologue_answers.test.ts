// The prologue's branch dialogue tree without a model (builtin_ai.md 1.4, 6.7; prologue_
// antechamber.md 4.8 and 7; PK-M1-19): a free answer in an interview round is sorted into
// the round's category by rule instead of the input's fixed fallback, and a free question in
// the call scene goes to the prologue topic that answers it. Pure rules, the content check,
// and the scene runner with the model off (the scene data's free choices opened in a
// fixture copy: the shipped prologue still gates them on a model, PK-M1-27's data).

import { describe, expect, it } from 'vitest';
import { Engine } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import type { SystemContext } from '../src/core/system';
import '../src/systems/dialogue';
import {
  classifyAnswer,
  prologueAnswerProblems,
  roundOf,
} from '../src/systems/dialogue/prologue/answers';
import { prologueAnswer } from '../src/systems/dialogue/prologue/port';
import { type SceneDef, sceneView } from '../src/systems/scenes';
import { ruleAnswer } from '../src/systems/scenes/answer_port';
import { NARRATIVE_SYSTEMS, narrativeContent } from './narrative_harness';

const CONTENT = narrativeContent();
const data = CONTENT.prologueAnswers;

/** A stand-in context: the classifier reads only the content and the flags. */
const ctxOf = (content: ContentMap): SystemContext =>
  ({ content, flag: () => undefined }) as unknown as SystemContext;

function pick(node: string, text: string, scene = 'cut_p_interview'): string | null {
  const round = roundOf(data, scene, node);
  const open = Object.keys(round?.choices ?? {});
  return prologueAnswer(ctxOf(CONTENT), { sceneId: scene, nodeId: node, text, choices: open });
}

describe('rules of the interview rounds (prologue 4.8)', () => {
  it('passes its content check, and reports a round on an input without a classify node', () => {
    expect(prologueAnswerProblems(data, CONTENT.scenes)).toEqual([]);
    const bad = {
      ...data,
      rounds: [{ scene: 'cut_p_interview', node: 'n6_eluen', choices: { zz: {} } }],
      questions: [{ scene: 'cut_p_call', node: 'n5_nowhere' }],
    };
    expect(prologueAnswerProblems(bad, CONTENT.scenes)).toEqual([
      'prologue answers cut_p_interview/n6_eluen: no input with a classify node',
      'prologue questions cut_p_call/n5_nowhere: no such node',
    ]);
  });

  it('sorts a free answer into each round category', () => {
    expect(pick('n6_eluen_free', '我不确定自己配不配，但只要给我机会，我会努力学。')).toBe('e1');
    expect(pick('n6_eluen_free', '因为我比他们四个都强，当然值得。')).toBe('e2');
    expect(pick('n6_eluen_free', '我又没求着你们选我。')).toBe('e3');
    expect(pick('n6_eluen_free', '说实话，我不知道。')).toBe('e4');
    expect(pick('n6_eluen_free', '能见到您是我的荣幸，我愿意追随您。')).toBe('e5');
    expect(pick('n6_eluen_free', '在地球上，面试官会先自我介绍的。')).toBe('e6');
    expect(pick('n7_valda_free', '输过，被打趴下了，后来又爬起来了。')).toBe('v1');
    expect(pick('n7_valda_free', '我从来没输过。')).toBe('v2');
    expect(pick('n7_valda_free', '你呢？你输过吗？')).toBe('v5');
    expect(pick('n7_valda_free', '……')).toBe('v6');
    expect(pick('n8_merca_free', '我会做饭，还懂一些手艺。')).toBe('m1');
    expect(pick('n8_merca_free', '你先开个价吧。')).toBe('m2');
    expect(pick('n8_merca_free', '我什么都没有。')).toBe('m4');
    expect(pick('n9_sylvie_free', '我想我妈妈。')).toBe('s1');
    expect(pick('n9_sylvie_free', '想念那种没有神管的自由日子。')).toBe('s4');
    expect(pick('n10_moira_free', '从我推开那扇门开始。')).toBe('o2');
    expect(pick('n10_moira_free', '还没开始，就从这一页开始。')).toBe('o5');
    expect(pick('n10_past_free', '我是个程序员，天天写代码。')).toBe('abacus');
    expect(pick('n10_past_free', '我是护士，在医院上班。')).toBe('whitecoat');
    expect(pick('n10_past_free', '我当老师，在讲台上讲课。')).toBe('podium');
    expect(pick('n11_free', '凭什么！', 'cut_p_judgement')).toBe('r1');
    expect(pick('n11_free', '求你们再看一次。', 'cut_p_judgement')).toBe('r3');
  });

  it('leaves an answer no rule sorts to the scene, and only picks open choices', () => {
    expect(pick('n6_eluen_free', '今天天气不错。')).toBeNull();
    const round = roundOf(data, 'cut_p_interview', 'n6_eluen_free');
    if (!round) throw new Error('no round');
    // e2 closed: the strong answer falls to nothing rather than to a closed choice
    expect(classifyAnswer(data, round, ['我很强'], null, ['e1', 'e3'])).toBeNull();
    expect(classifyAnswer(data, round, ['我很强'], null, ['e2'])).toBe('e2');
    // the scene port drops a pick outside the open choices
    expect(
      ruleAnswer(ctxOf(CONTENT), {
        sceneId: 'cut_p_interview',
        nodeId: 'n6_eluen_free',
        text: '我很强',
        choices: ['e1'],
      }),
    ).toBeNull();
  });

  it('maps a free question in the call scene to the prologue topic that answers it', () => {
    const q = (
      text: string,
      choices = [
        'where',
        'world',
        'review',
        'thing',
        'above',
        'five',
        'neighbors',
        'home',
        'chair',
      ],
    ) =>
      prologueAnswer(ctxOf(CONTENT), { sceneId: 'cut_p_call', nodeId: 'n5_q_free', text, choices });
    expect(q('这到底是什么地方？')).toBe('where');
    expect(q('那个世界叫什么名字？')).toBe('world');
    expect(q('审定到底是什么？')).toBe('review');
    expect(q('我为什么是五号？')).toBe('five');
    expect(q('我还能回家吗？')).toBe('home');
    expect(q('那把空着的椅子是谁的？')).toBe('chair');
    // an asked-already question (its once choice gone) is not picked again
    expect(q('那把空着的椅子是谁的？', ['where'])).toBeNull();
    expect(q('你们晚饭吃什么？')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// through the scene runner, model off

/** The shipped prologue with its free inputs open without a model (PK-M1-27 request). */
function openFreeInput(): ContentMap {
  const scenes = CONTENT.scenes.map((s) => {
    if (s.id !== 'cut_p_interview' && s.id !== 'cut_p_call') return s;
    const copy = JSON.parse(JSON.stringify(s)) as SceneDef;
    for (const n of copy.nodes) {
      for (const c of n.choices ?? []) if (c.id === 'free' || c.id === 'ask') delete c.when;
      if (n.id === 'n5_q_free' && n.input)
        n.input.classify = {
          node: 'n5_questions',
          choices: [
            'where',
            'world',
            'review',
            'thing',
            'above',
            'five',
            'neighbors',
            'home',
            'chair',
          ],
        };
    }
    return copy;
  });
  return { ...CONTENT, scenes } as ContentMap;
}

function run(content: ContentMap): Engine {
  return Engine.create(20261115, content, NARRATIVE_SYSTEMS, { aiMode: 'off' });
}

/** Step the scene: advance lines until it waits for a choice or an input. */
function settle(g: Engine): void {
  for (let i = 0; i < 400; i++) {
    const v = sceneView(g.world, g.content);
    if (!v || v.waiting === 'choice' || v.waiting === 'input') return;
    if (v.waiting === 'advance') g.queue('scenes.advance', {});
    g.step(1);
  }
}

describe('the interview through the runner, no model', () => {
  it('a free answer to Eluen settles as the category the rules give', () => {
    const g = run(openFreeInput());
    g.queue('scenes.start', { sceneId: 'cut_p_interview' });
    g.step(1);
    settle(g);
    expect(sceneView(g.world, g.content)?.nodeId).toBe('n6_eluen');
    g.queue('scenes.choose', { choiceId: 'free' });
    g.step(1);
    settle(g);
    expect(sceneView(g.world, g.content)?.waiting).toBe('input');
    g.queue('scenes.input', { text: '因为我比他们四个都强。' });
    g.step(3);
    settle(g);
    const f = g.world.meta.flags;
    expect(f['p_free.eluen']).toBe('因为我比他们四个都强。');
    expect(String(f.p_answers)).toContain('E2');
  });

  it('an answer no rule sorts keeps the round fallback', () => {
    const g = run(openFreeInput());
    g.queue('scenes.start', { sceneId: 'cut_p_interview' });
    g.step(1);
    settle(g);
    g.queue('scenes.choose', { choiceId: 'free' });
    g.step(1);
    settle(g);
    g.queue('scenes.input', { text: '今天天气不错。' });
    g.step(3);
    settle(g);
    expect(String(g.world.meta.flags.p_answers)).toContain('E4');
  });

  it('a free question in the call scene is answered by its topic scene node', () => {
    const g = run(openFreeInput());
    g.queue('scenes.start', { sceneId: 'cut_p_call' });
    g.step(1);
    for (let i = 0; i < 60; i++) {
      settle(g);
      const v = sceneView(g.world, g.content);
      if (v?.nodeId === 'n5_questions') break;
      if (v?.waiting === 'input') g.queue('scenes.input', { text: '小林' });
      else if (v?.waiting === 'choice')
        g.queue('scenes.choose', { choiceId: v.choices[0]?.id ?? '' });
      g.step(1);
    }
    expect(sceneView(g.world, g.content)?.nodeId).toBe('n5_questions');
    g.queue('scenes.choose', { choiceId: 'ask' });
    g.step(1);
    settle(g);
    g.queue('scenes.input', { text: '那把空着的椅子是谁的？' });
    g.step(3);
    // the chair question's own answer plays, and its effect sets the flag (topic place_sixth_chair)
    expect(g.world.meta.flags.p_asked_sixth_chair).toBe(true);
    expect(sceneView(g.world, g.content)?.nodeId).toMatch(/^n5_q_chair/);
  });
});
