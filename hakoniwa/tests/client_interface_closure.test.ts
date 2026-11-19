import { describe, expect, it } from 'vitest';
import {
  banterPanelData,
  banterReplyCommand,
  companionAutoCommand,
  companionInteractionData,
  courtPanelData,
  courtStorageCommand,
} from '../src/client/adapters/interface_closure';
import { defaultSettings } from '../src/client/app/settings_schema';
import { StorySignals } from '../src/client/app/tut_signals';
import { firstRunPatch } from '../src/client/screens/first_run_model';
import { latestTitleSlot } from '../src/client/screens/title_model';
import { titleCamera } from '../src/client/screens/title_scene_model';
import { createGameView } from '../src/client/view/game_view';
import { difficultyCommands } from '../src/client/windows/settings/run_settings_model';
import { createGame } from '../src/game/create';

describe('court and companion interaction adapters', () => {
  it('reads the court without revealing it before the door opens or changing the world', () => {
    const game = createGame({ flagPolicy: 'off' });
    const view = createGameView(game);
    expect(courtPanelData(view)).toBeNull();
    game.world.meta.flags['feature.inner_court'] = true;
    const before = JSON.stringify(game.world);
    const panel = courtPanelData(view);
    expect(panel?.cases.length).toBeGreaterThan(0);
    expect(panel?.inside).toBe(false);
    expect(JSON.stringify(game.world)).toBe(before);
  });

  it('returns no command for an invalid inventory quantity', () => {
    for (const count of [-1, 0, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(courtStorageCommand('court', 'piece', 'deposit', count)).toEqual([]);
    }
  });

  it('gives a player-set stance back through the real command handler', () => {
    const game = createGame({ flagPolicy: 'off' });
    const view = createGameView(game);
    const id = 'yeyu';
    game.queue('flag.set', { key: `companion.${id}.recruited`, value: true });
    game.step(1);
    game.queue('party.order', { companionId: id, order: 'passive' });
    game.step(1);
    expect(companionInteractionData(view).find((c) => c.id === id)?.manual).toBe(true);
    for (const c of companionAutoCommand(id, true)) game.queue(c.kind, c.data as never);
    game.step(1);
    expect(companionInteractionData(view).find((c) => c.id === id)?.manual).toBe(false);
  });

  it('never offers a reply for an exchange that has already ended', () => {
    const game = createGame({ flagPolicy: 'off' });
    const view = createGameView(game);
    expect(banterPanelData(view)).toBeNull();
    expect(banterReplyCommand('ended', -1)).toEqual([]);
    game.world.slices.party.banter = {
      played: {},
      running: { id: 'unwritten', line: 0, next: 10, kind: 'travel', replyUntil: 1 },
    };
    game.step(2);
    expect(banterPanelData(view)?.options ?? []).toEqual([]);
  });

  it('changes the run difficulty through the same command the combat system validates', () => {
    const game = createGame({ flagPolicy: 'off' });
    const view = createGameView(game);
    expect(difficultyCommands(view, 'legend')).toEqual([]);
    for (const c of difficultyCommands(view, 'hard')) game.queue(c.kind, c.data as never);
    game.step(1);
    expect(view.flag('difficulty')).toBe('hard');
    const player = game.world.slices.combat.units[view.playerId()];
    if (!player) throw new Error('missing player');
    player.combatUntil = game.world.meta.tick + 100;
    expect(difficultyCommands(view, 'story')).toEqual([]);
    game.world.meta.flags.difficulty = 'legend';
    expect(difficultyCommands(view, 'standard')).toEqual([]);
  });
});

describe('first-run choices and the read-only title', () => {
  it('skipping a page discards its tentative changes and leaves other pages alone', () => {
    const draft = defaultSettings('sync');
    draft.accessibility.textScale = 1.3;
    draft.accessibility.colorMode = 'high_contrast';
    const skipped = firstRunPatch('language', draft, true);
    expect(skipped.accessibility?.textScale).toBe(1);
    expect(skipped.accessibility?.colorMode).toBe('high_contrast');
    expect(firstRunPatch('language', draft, false).accessibility?.textScale).toBe(1.3);
    expect(firstRunPatch('ai', draft, true)).toEqual({});
  });

  it('keeps damaged saves reachable without pretending they were read', () => {
    expect(latestTitleSlot({}, { quick: 'corrupt' })).toEqual({
      slot: 'quick',
      meta: null,
      problem: 'corrupt',
    });
    expect(latestTitleSlot({}, {})).toBeNull();
  });

  it('freezes all title camera motion for calm, touch and flat presentation', () => {
    expect(titleCamera(0, 40, false)).toEqual({ widthScale: 1, offsetX: 0 });
    expect(titleCamera(12_200, 40, false)).toEqual({ widthScale: 1, offsetX: 0 });
    expect(titleCamera(0, 40, true).widthScale).toBe(1.6);
    expect(titleCamera(2200, 40, true).widthScale).toBe(1);
    expect(titleCamera(12_200, 40, true).offsetX).toBeCloseTo(1);
    expect(titleCamera(12_200, 40, true, 1000).offsetX).toBe(0);
  });
});

describe('the act-1 evidence tutorial', () => {
  it('recognises the held trial pieces as evidence, without treating other choices as evidence', () => {
    const signals = new StorySignals();
    const probe = {
      act: 'act1',
      waiting: 'choice',
      keyed: false,
      keyChoice: false,
      listen: null,
      shop: false,
      deadline: false,
      choiceIds: ['piece:case_note', 'next_witness'],
    };
    expect(signals.update(probe).has('evidence_prompt')).toBe(true);
    expect(signals.update({ ...probe, choiceIds: ['next_witness'] }).has('evidence_shown')).toBe(
      true,
    );
    expect(signals.update({ ...probe, choiceIds: ['next_witness'] }).has('evidence_prompt')).toBe(
      false,
    );
  });
});
