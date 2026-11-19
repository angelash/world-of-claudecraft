// Scripted speakers (PK-M1-29; catalog_dialogue_lines_act1.md 0 item 4): Ash in act 1
// says only the lines written in his own pack, on every dialogue path. Free text, a topic
// and a reaction resolve inside ln_ash alone; the shared rule templates give him nothing;
// the npc.dialogue model is never asked to word his answer. From act 2 the chain opens.

import { describe, expect, it } from 'vitest';
import { validateNpcContent } from '../src/content/packs/npc';
import type { ContentMap } from '../src/core/contracts';
import { createGame } from '../src/game/create';
import { chainPackIds, slotSources } from '../src/systems/dialogue/lines/packs';
import { answer, farewell, greeting } from '../src/systems/dialogue/replies';
import { isScripted } from '../src/systems/dialogue/scripted';
import { speak, speakerLayers } from '../src/systems/dialogue/speak';
import { getEntity } from '../src/systems/world';
import { FULL, game, keyOf, runInTick, setFlags } from './dialogue_topics_harness';

const ASH_OWN = /^c\.line_packs\.ln_ash\./;

describe('a scripted speaker (Ash in act 1)', () => {
  it('reads the card: scripted in act 1 only', () => {
    expect(FULL.npcs.find((p) => p.id === 'ash')?.scripted).toEqual(['act1']);
    expect(isScripted(FULL, 'ash', 'act1')).toBe(true);
    expect(isScripted(FULL, 'ash', 'act2')).toBe(false);
    expect(isScripted(FULL, 'ash', undefined)).toBe(false);
    expect(isScripted(FULL, 'ron', 'act1')).toBe(false);
  });

  it('keeps the fallback chain to his own pack in act 1, the whole chain after', () => {
    expect(chainPackIds('ash', { ownOnly: true })).toEqual(['ln_ash']);
    const g = game();
    setFlags(g, { act: 'act1' });
    runInTick(g, (ctx) => {
      expect(ctx.flag('act')).toBe('act1');
      expect(speakerLayers(ctx, 'ash')).toEqual({ ownOnly: true });
      // react.joke is written for nobody in ln_ash: in act 1 nothing stands in for it
      expect(slotSources(ctx.content, 'ash', 'react.joke', speakerLayers(ctx, 'ash')).length).toBe(
        0,
      );
      expect(speak(ctx, { speaker: 'ash', slot: 'react.joke' })).toBeNull();
      // a slot he does write still comes from him
      expect(speak(ctx, { speaker: 'ash', slot: 'react.insult' })?.packId).toBe('ln_ash');
    });
    const h = game();
    h.queue('flag.set', { key: 'act', value: 'act2' });
    h.step(1);
    runInTick(h, (ctx) => {
      expect(speakerLayers(ctx, 'ash').ownOnly).toBeUndefined();
      expect(speak(ctx, { speaker: 'ash', slot: 'react.joke' })?.packId).not.toBe('ln_ash');
    });
  });

  it('answers free text from his own pack or not at all, whatever is asked', () => {
    const g = game();
    setFlags(g, { act: 'act1' });
    const asks = [
      '你好',
      '你是谁？',
      '你是做什么的？',
      '遗迹里的神纹是什么？',
      '讲个笑话',
      '最近有什么新鲜事？',
      '我来自别的世界',
      '你这个老骨头',
    ];
    runInTick(g, (ctx) => {
      for (const q of asks) {
        // always one of his own written lines: an answer he has, else his written evasion
        expect(keyOf(answer(ctx, 'ash', q).line), q).toMatch(ASH_OWN);
      }
    });
  });

  it('never asks the model to word his reply (the fixture Ash, model tier on)', () => {
    const g = createGame({ content: FULL, seed: 3, aiMode: 'external', flagPolicy: 'off' });
    g.queue('flag.set', { key: 'act', value: 'act1' });
    g.step(1);
    const ash = getEntity(g.world, 'fixture_ash');
    if (!ash) throw new Error('no ash fixture');
    g.queue('world.teleport', { entityId: 'player', mapId: ash.mapId, x: ash.x + 1, y: ash.y });
    g.step(1);
    g.queue('dialogue.talk', { npcId: 'fixture_ash' });
    g.step(1);
    g.queue('dialogue.say', { text: '你是谁？' });
    g.step(2);
    const asked = g
      .takeAiRequests()
      .filter((r) => r.role === 'npc.dialogue' && r.agentId === 'ash');
    expect(asked).toEqual([]);
    // the reply that went out is one of his own written lines
    const said = g.world.recent.filter((e) => e.kind === 'dialogue.line').at(-1);
    expect(keyOf(said?.kind === 'dialogue.line' ? said.data.text : undefined)).toMatch(ASH_OWN);
  });

  it('greets and parts with his written act-1 lines, first meeting included', () => {
    const g = game();
    setFlags(g, { act: 'act1' });
    runInTick(g, (ctx) => {
      expect(keyOf(greeting(ctx, 'ash', true))).toMatch(/^c\.line_packs\.ln_ash\.acts\.act1\./);
      expect(keyOf(greeting(ctx, 'ash', false))).toMatch(/^c\.line_packs\.ln_ash\.acts\.act1\./);
      expect(keyOf(farewell(ctx, 'ash'))).toMatch(/^c\.line_packs\.ln_ash\.acts\.act1\.farewell\./);
      // free text reads the act override too (7.3 step 1)
      expect(keyOf(answer(ctx, 'ash', '你好').line)).toMatch(/\.acts\.act1\.greet_neutral\./);
    });
  });

  it('refuses a scripted act that is no act', () => {
    const npcs = FULL.npcs.map((p) => (p.id === 'ash' ? { ...p, scripted: ['act9'] } : p));
    expect(validateNpcContent({ ...FULL, npcs } as ContentMap)).toContainEqual(
      'npc ash: scripted act act9 is not an act',
    );
  });
});
