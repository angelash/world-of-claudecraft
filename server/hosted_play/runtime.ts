import {
  createAmbientPlayerBotBrainState,
  tickAmbientPlayerBotBrain,
  type AmbientPlayerBotBrainState,
} from '../ambient_bots/brain';
import type { AmbientPlayerBotRecord } from '../ambient_bots/types';
import type { AmbientPlayerBotLiveState } from '../ambient_bots/ws_client';
import type {
  HostedPlayPauseReason,
  HostedPlaySessionInfo,
  HostedPlayStatusSnapshot,
} from './types';

const HOSTED_PLAY_BRAIN_INTERVAL_MS = 250;
const HOSTED_PLAY_MANUAL_PAUSE_MS = 10_000;

interface HostedPlayEntry {
  characterId: number;
  characterName: string;
  playerClass: HostedPlaySessionInfo['playerClass'];
  enabledAtMs: number;
  pauseUntilMs: number | null;
  pauseReason: HostedPlayPauseReason;
  objectiveId: string;
  objectiveLabel: string;
  lastError: string;
  lastAutomationAtMs: number | null;
  brainState: AmbientPlayerBotBrainState;
}

export interface HostedPlayRuntimeGame {
  setHostedPlayInputObserver(
    handler: ((characterId: number, kind: 'input' | 'command') => void) | null,
  ): void;
  hostedPlaySessionInfo(characterId: number): HostedPlaySessionInfo | null;
  buildHostedPlayLiveState(characterId: number): AmbientPlayerBotLiveState | null;
  applyHostedPlayMoveInput(
    characterId: number,
    moveInput: Record<string, unknown>,
    facing?: number,
  ): boolean;
  applyHostedPlayCommand(characterId: number, command: Record<string, unknown>): boolean;
  clearHostedPlayControl(characterId: number): void;
  noteHostedPlayActivity(characterId: number): void;
}

export interface HostedPlayRuntimeOptions {
  game: HostedPlayRuntimeGame;
  brainIntervalMs?: number;
  manualPauseMs?: number;
  nowMs?: () => number;
}

export class HostedPlayRuntime {
  private readonly game: HostedPlayRuntimeGame;
  private readonly brainIntervalMs: number;
  private readonly manualPauseMs: number;
  private readonly nowMs: () => number;
  private readonly entries = new Map<number, HostedPlayEntry>();
  private interval: NodeJS.Timeout | null = null;
  private started = false;

  constructor(options: HostedPlayRuntimeOptions) {
    this.game = options.game;
    this.brainIntervalMs = options.brainIntervalMs ?? HOSTED_PLAY_BRAIN_INTERVAL_MS;
    this.manualPauseMs = options.manualPauseMs ?? HOSTED_PLAY_MANUAL_PAUSE_MS;
    this.nowMs = options.nowMs ?? (() => Date.now());
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.game.setHostedPlayInputObserver((characterId, kind) => {
      this.handleManualActivity(characterId, kind);
    });
    this.interval = setInterval(() => {
      this.tick();
    }, this.brainIntervalMs);
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.game.setHostedPlayInputObserver(null);
    for (const characterId of this.entries.keys()) {
      this.game.clearHostedPlayControl(characterId);
    }
    this.entries.clear();
  }

  status(characterId: number): HostedPlayStatusSnapshot {
    const nowMs = this.nowMs();
    const info = this.game.hostedPlaySessionInfo(characterId);
    const entry = this.entries.get(characterId) ?? null;
    const paused = !!entry && entry.pauseUntilMs !== null && entry.pauseUntilMs > nowMs;
    const online = info !== null;
    const enabled = online && entry !== null;
    const mode = !online
      ? 'offline'
      : !entry
      ? 'disabled'
      : paused
      ? 'paused'
      : 'active';
    return {
      characterId,
      characterName: info?.characterName ?? entry?.characterName ?? '',
      playerClass: info?.playerClass ?? entry?.playerClass ?? null,
      online,
      enabled,
      active: mode === 'active',
      paused,
      mode,
      objectiveId: entry?.objectiveId ?? '',
      objectiveLabel: entry?.objectiveLabel ?? '',
      pauseReason: entry?.pauseReason ?? '',
      pauseUntilMs: paused ? entry?.pauseUntilMs ?? null : null,
      pauseSecondsRemaining:
        paused && entry?.pauseUntilMs
          ? Math.max(0, Math.ceil((entry.pauseUntilMs - nowMs) / 1000))
          : 0,
      lastError: entry?.lastError ?? '',
      lastAutomationAtMs: entry?.lastAutomationAtMs ?? null,
    };
  }

  enable(characterId: number): HostedPlayStatusSnapshot {
    const info = this.game.hostedPlaySessionInfo(characterId);
    if (!info) throw new Error('character is not currently online');
    const existing = this.entries.get(characterId);
    const entry: HostedPlayEntry = existing
      ? {
          ...existing,
          characterName: info.characterName,
          playerClass: info.playerClass,
          pauseUntilMs: null,
          pauseReason: '',
          lastError: '',
        }
      : {
          characterId,
          characterName: info.characterName,
          playerClass: info.playerClass,
          enabledAtMs: this.nowMs(),
          pauseUntilMs: null,
          pauseReason: '',
          objectiveId: '',
          objectiveLabel: '',
          lastError: '',
          lastAutomationAtMs: null,
          brainState: createAmbientPlayerBotBrainState(),
        };
    this.entries.set(characterId, entry);
    this.game.clearHostedPlayControl(characterId);
    return this.status(characterId);
  }

  disable(characterId: number): HostedPlayStatusSnapshot {
    this.entries.delete(characterId);
    this.game.clearHostedPlayControl(characterId);
    return this.status(characterId);
  }

  private handleManualActivity(characterId: number, kind: 'input' | 'command'): void {
    const entry = this.entries.get(characterId);
    if (!entry) return;
    entry.pauseUntilMs = this.nowMs() + this.manualPauseMs;
    entry.pauseReason = kind === 'command' ? 'manual_command' : 'manual_input';
    this.game.clearHostedPlayControl(characterId);
  }

  private tick(): void {
    for (const [characterId, entry] of [...this.entries.entries()]) {
      try {
        this.tickEntry(characterId, entry);
      } catch (err) {
        entry.lastError = err instanceof Error ? err.message : String(err);
        entry.pauseUntilMs = this.nowMs() + this.manualPauseMs;
        entry.pauseReason = 'runtime_error';
        this.game.clearHostedPlayControl(characterId);
      }
    }
  }

  private tickEntry(characterId: number, entry: HostedPlayEntry): void {
    const info = this.game.hostedPlaySessionInfo(characterId);
    if (!info) {
      this.entries.delete(characterId);
      return;
    }
    entry.characterName = info.characterName;
    entry.playerClass = info.playerClass;

    const nowMs = this.nowMs();
    if (entry.pauseUntilMs !== null && entry.pauseUntilMs > nowMs) return;
    if (entry.pauseUntilMs !== null && entry.pauseUntilMs <= nowMs) {
      entry.pauseUntilMs = null;
      entry.pauseReason = '';
      entry.lastError = '';
    }

    const liveState = this.game.buildHostedPlayLiveState(characterId);
    if (!liveState) {
      this.entries.delete(characterId);
      return;
    }
    this.game.noteHostedPlayActivity(characterId);

    const result = tickAmbientPlayerBotBrain(
      {
        bot: hostedPlayBotRecord(info),
        liveState,
        nowMs,
      },
      entry.brainState,
    );
    entry.objectiveId = result.objectiveId;
    entry.objectiveLabel = result.objectiveLabel;
    entry.lastError = '';

    if (hasHostedDrive(result.moveInput, result.facing)) {
      this.game.applyHostedPlayMoveInput(characterId, result.moveInput, result.facing);
    } else {
      this.game.clearHostedPlayControl(characterId);
    }
    for (const command of result.commands) {
      this.game.applyHostedPlayCommand(characterId, command);
    }
    entry.lastAutomationAtMs = nowMs;
  }
}

function hostedPlayBotRecord(info: HostedPlaySessionInfo): AmbientPlayerBotRecord {
  return {
    botId: `hosted:${info.characterId}`,
    accountId: null,
    accountUsername: '',
    accountPassword: '',
    characterId: info.characterId,
    characterName: info.characterName,
    profileId: `hosted_${info.playerClass}`,
    class: info.playerClass,
    authToken: '',
    authTokenExpiresAtMs: null,
    lifecycleStatus: 'online',
    provisionState: 'ready',
    levelBand: { min: 1, max: 60 },
    preferredZoneIds: [],
    lastKnownZoneId: '',
    lastKnownLevel: 1,
    lastKnownX: null,
    lastKnownZ: null,
    assignedClusterId: null,
    assignedPlayerCharacterId: info.characterId,
    cooldownUntilMs: null,
    reservationUntilMs: null,
    lastRunnerError: '',
    lastRunnerAtMs: null,
    plannerState: {},
    runnerState: {},
    socialState: {},
  };
}

function hasHostedDrive(moveInput: Record<string, unknown>, facing?: number): boolean {
  if (facing !== undefined && Number.isFinite(facing)) return true;
  return Object.values(moveInput).some((value) => value === 1 || value === true);
}
