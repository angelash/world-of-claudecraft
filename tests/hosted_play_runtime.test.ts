import { describe, expect, it, vi } from 'vitest';

import type { AmbientPlayerBotLiveState } from '../server/ambient_bots/ws_client';
import { HostedPlayRuntime, type HostedPlayRuntimeGame } from '../server/hosted_play/runtime';
import type { SimEvent } from '../src/sim/types';

function liveState(input: (
  Partial<AmbientPlayerBotLiveState['self']> & {
    entities?: Array<Record<string, unknown>>;
    social?: AmbientPlayerBotLiveState['social'];
  }
) = {}): AmbientPlayerBotLiveState {
  const hasExtendedShape = 'entities' in input || 'social' in input;
  const selfOverrides = hasExtendedShape
    ? Object.fromEntries(
        Object.entries(input).filter(([key]) => key !== 'entities' && key !== 'social'),
      )
    : input;
  return {
    pid: 11,
    seed: 20061,
    self: {
      id: 11,
      x: 0,
      y: 0,
      z: 0,
      lv: 5,
      hp: 90,
      mhp: 100,
      res: 0,
      mres: 100,
      rtype: 'mana',
      target: null,
      auto: false,
      gcd: 0,
      cast: null,
      eat: null,
      drk: null,
      inv: [],
      qlog: [],
      qdone: [],
      cds: {},
      tal: null,
      ...selfOverrides,
    },
    entities: new Map(
      (hasExtendedShape ? input.entities ?? [] : []).map((entity) => [Number(entity.id), entity] as const),
    ),
    social: hasExtendedShape ? input.social ?? null : null,
  };
}

function fakeGame(
  state: AmbientPlayerBotLiveState | null,
  options: {
    recentEvents?: SimEvent[];
    ambientBotNames?: string[];
  } = {},
): HostedPlayRuntimeGame & {
  commands: Record<string, unknown>[];
  moveInputs: Array<{ moveInput: Record<string, unknown>; facing?: number }>;
  clearCount: number;
  activityCount: number;
  observed: boolean;
} {
  const commands: Record<string, unknown>[] = [];
  const moveInputs: Array<{ moveInput: Record<string, unknown>; facing?: number }> = [];
  let clearCount = 0;
  let activityCount = 0;
  let observed = false;
  let recentEvents = [...(options.recentEvents ?? [])];
  return {
    get commands() {
      return commands;
    },
    get moveInputs() {
      return moveInputs;
    },
    get clearCount() {
      return clearCount;
    },
    get activityCount() {
      return activityCount;
    },
    get observed() {
      return observed;
    },
    hostedPlaySessionInfo(characterId) {
      return state
        ? {
            characterId,
            characterName: 'Hero',
            playerClass: 'warrior',
          }
        : null;
    },
    buildHostedPlayLiveState() {
      return state;
    },
    applyHostedPlayMoveInput(_characterId, moveInput, facing) {
      moveInputs.push({ moveInput, facing });
      return true;
    },
    applyHostedPlayCommand(_characterId, command) {
      commands.push(command);
      return true;
    },
    clearHostedPlayControl() {
      clearCount++;
    },
    noteHostedPlayActivity() {
      activityCount++;
    },
    setHostedPlayObserved(_characterId, nextObserved) {
      observed = nextObserved;
      if (!nextObserved) recentEvents = [];
    },
    drainHostedPlayRecentEvents() {
      if (!observed || recentEvents.length === 0) return [];
      const drained = [...recentEvents];
      recentEvents = [];
      return drained;
    },
    ambientPlayerBotNames() {
      return [...(options.ambientBotNames ?? [])];
    },
  };
}

describe('HostedPlayRuntime', () => {
  it('rejects enabling hosted play for an offline character', () => {
    const runtime = new HostedPlayRuntime({
      game: fakeGame(null),
    });
    expect(() => runtime.enable(7)).toThrow('character is not currently online');
  });

  it('reuses the ambient brain to issue live commands for the hosted character', () => {
    const game = fakeGame(liveState({ hp: 0 }));
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 10_000,
    });

    runtime.enable(7);
    (runtime as any).tick();

    expect(game.commands).toContainEqual({ cmd: 'release' });
    expect(runtime.status(7)).toMatchObject({
      online: true,
      enabled: true,
      active: true,
      objectiveId: 'release',
      objectiveLabel: 'Releasing spirit',
    });
    expect(game.activityCount).toBe(1);
  });

  it('tracks persisted preferences and pauses the hosted brain for party follow', () => {
    const game = fakeGame(liveState({
      id: 102,
      x: 1518,
      z: -1200,
      party: {
        leader: 101,
        raid: false,
        members: [
          { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 1500, z: -1200, dead: 0, inCombat: 0, group: 1 },
          { pid: 102, name: 'Hero', cls: 'warrior', level: 12, hp: 100, mhp: 100, res: 0, mres: 100, rtype: 'mana', x: 1518, z: -1200, dead: 0, inCombat: 0, group: 1 },
        ],
      },
    }));
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7, {
      resumeOnLogin: true,
      partyMode: 'follow_leader',
    });
    (runtime as any).tick();

    expect(game.commands).toEqual([{ cmd: 'chat', text: '/follow Branoraaa' }]);
    expect(game.moveInputs).toHaveLength(0);
    expect(runtime.status(7)).toMatchObject({
      resumeOnLogin: true,
      partyMode: 'follow_leader',
      groupMode: 'follow_leader',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 18,
    });
  });

  it('keeps driving travel between full brain decisions', () => {
    let nowMs = 20_000;
    const state = liveState({
      x: 0,
      z: 0,
      entities: [
        { id: 201, k: 'npc', tid: 'marshal_redbrook', x: 20, z: 0, lv: 1 },
      ],
    });
    const game = fakeGame(state);
    const runtime = new HostedPlayRuntime({
      game,
      brainIntervalMs: 250,
      nowMs: () => nowMs,
    });

    runtime.enable(7);
    (runtime as any).tick();
    nowMs += 50;
    state.self!.x = 3;
    (runtime as any).tick();

    expect(game.commands).toEqual([]);
    expect(game.moveInputs).toHaveLength(2);
    expect(game.moveInputs.every((input) => input.moveInput.f === 1)).toBe(true);
    expect(game.moveInputs.every((input) => typeof input.facing === 'number')).toBe(true);
    const status = runtime.status(7);
    expect(status.debug).toMatchObject({
      objectiveId: status.objectiveId,
      objectiveLabel: status.objectiveLabel,
      lastBrainAgeMs: 50,
      moveInput: { f: 1 },
      brainState: {
        pathLength: expect.any(Number),
        stuckResets: expect.any(Number),
      },
    });
    expect(status.debug.travelGoal).toMatchObject({
      target: { x: 20, z: 0 },
    });
  });

  it('pauses hosted play after runtime errors and clears held input', () => {
    const game = fakeGame(liveState());
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 20_000,
    });
    runtime.enable(7);
    game.buildHostedPlayLiveState = () => {
      throw new Error('hosted brain failed');
    };

    (runtime as any).tick();

    expect(runtime.status(7)).toMatchObject({
      paused: true,
      mode: 'paused',
      pauseReason: 'runtime_error',
    });
    expect(game.clearCount).toBeGreaterThan(0);
  });

  it('disables hosted play cleanly', () => {
    const game = fakeGame(liveState());
    const runtime = new HostedPlayRuntime({
      game,
    });

    runtime.enable(7);
    expect(runtime.disable(7)).toMatchObject({
      online: true,
      enabled: false,
      mode: 'disabled',
    });
    expect(game.clearCount).toBeGreaterThan(0);
  });

  it('tracks blocked whisper senders without issuing a reply', () => {
    const game = fakeGame(liveState({
      social: {
        friends: [],
        blocks: [{ id: 201, name: 'Aleph' }],
        guild: null,
      },
    }), {
      recentEvents: [{
        type: 'chat',
        fromPid: 201,
        from: 'Aleph',
        text: 'hey there',
        channel: 'whisper',
        pid: 11,
      }],
    });
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 5_000,
    });

    runtime.enable(7);
    (runtime as any).tick();

    expect(game.commands).toEqual([]);
    expect(runtime.status(7)).toMatchObject({
      socialPendingReplies: 0,
      socialBlocks: 1,
      lastWhisperFrom: 'Aleph',
    });
  });
});
