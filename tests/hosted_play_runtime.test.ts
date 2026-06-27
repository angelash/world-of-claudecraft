import { describe, expect, it, vi } from 'vitest';

import type { AmbientPlayerBotLiveState } from '../server/ambient_bots/ws_client';
import { HostedPlayRuntime, type HostedPlayRuntimeGame } from '../server/hosted_play/runtime';

function liveState(overrides: Partial<AmbientPlayerBotLiveState['self']> = {}): AmbientPlayerBotLiveState {
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
      ...overrides,
    },
    entities: new Map(),
    social: null,
  };
}

function fakeGame(state: AmbientPlayerBotLiveState | null): HostedPlayRuntimeGame & {
  observer: ((characterId: number, kind: 'input' | 'command') => void) | null;
  commands: Record<string, unknown>[];
  moveInputs: Array<{ moveInput: Record<string, unknown>; facing?: number }>;
  clearCount: number;
  activityCount: number;
} {
  let observer: ((characterId: number, kind: 'input' | 'command') => void) | null = null;
  const commands: Record<string, unknown>[] = [];
  const moveInputs: Array<{ moveInput: Record<string, unknown>; facing?: number }> = [];
  let clearCount = 0;
  let activityCount = 0;
  return {
    get observer() {
      return observer;
    },
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
    setHostedPlayInputObserver(handler) {
      observer = handler;
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

  it('pauses hosted play after manual player activity and clears held input', async () => {
    const game = fakeGame(liveState({ hp: 0 }));
    const runtime = new HostedPlayRuntime({
      game,
      nowMs: () => 20_000,
    });
    await runtime.start();
    runtime.enable(7);
    game.observer?.(7, 'input');
    (runtime as any).tick();

    expect(game.commands).toHaveLength(0);
    expect(runtime.status(7)).toMatchObject({
      paused: true,
      mode: 'paused',
      pauseReason: 'manual_input',
    });
    expect(game.clearCount).toBeGreaterThan(0);

    await runtime.stop();
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
});
