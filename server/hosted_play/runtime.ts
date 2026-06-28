import {
  continueAmbientPlayerBotTravel,
  createAmbientPlayerBotBrainState,
  tickAmbientPlayerBotBrain,
  type AmbientPlayerBotBrainState,
  type AmbientPlayerBotBrainTickResult,
} from '../ambient_bots/brain';
import { AmbientPlayerBotLlmCoordinator } from '../ambient_bots/llm_coordinator';
import {
  createAmbientPlayerBotSocialRuntimeState,
  tickAmbientPlayerBotSocialShell,
  type AmbientPlayerBotSocialCommand,
  type AmbientPlayerBotSocialRuntimeState,
} from '../ambient_bots/social';
import type { AmbientPlayerBotLlmConfig, AmbientPlayerBotRecord } from '../ambient_bots/types';
import type { AmbientPlayerBotLiveState } from '../ambient_bots/ws_client';
import { zoneAt } from '../../src/sim/data';
import type { SimEvent } from '../../src/sim/types';
import {
  createHostedPlayPartyState,
  tickHostedPlayPartyCoordinator,
  type HostedPlayPartyState,
} from './party';
import {
  cloneHostedPlayPendingReply,
  cloneHostedPlayPlan,
  createHostedPlayLlmState,
  hostedPlayLlmConfigFromEnv,
  type HostedPlayLlmState,
} from './llm';
import type {
  HostedPlayPreferences,
  HostedPlayPauseReason,
  HostedPlaySessionInfo,
  HostedPlayStatusSnapshot,
} from './types';
import { defaultHostedPlayPreferences } from './types';

const HOSTED_PLAY_BRAIN_INTERVAL_MS = 250;
const HOSTED_PLAY_DRIVE_INTERVAL_MS = 50;
const HOSTED_PLAY_ERROR_PAUSE_MS = 10_000;

interface HostedPlayEntry {
  characterId: number;
  characterName: string;
  playerClass: HostedPlaySessionInfo['playerClass'];
  enabledAtMs: number;
  preferences: HostedPlayPreferences;
  pauseUntilMs: number | null;
  pauseReason: HostedPlayPauseReason;
  objectiveId: string;
  objectiveLabel: string;
  lastError: string;
  lastAutomationAtMs: number | null;
  groupMode: HostedPlayStatusSnapshot['groupMode'];
  groupLeaderName: string;
  groupLeaderDistance: number;
  socialMemory: Record<string, unknown>;
  socialState: AmbientPlayerBotSocialRuntimeState;
  lastWhisperFrom: string;
  lastSocialAction: string;
  brainState: AmbientPlayerBotBrainState;
  lastBrainAtMs: number | null;
  lastBrainResult: AmbientPlayerBotBrainTickResult | null;
  brainDrivePaused: boolean;
  partyState: HostedPlayPartyState;
  llmState: HostedPlayLlmState;
}

export interface HostedPlayRuntimeGame {
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
  setHostedPlayObserved(characterId: number, observed: boolean): void;
  drainHostedPlayRecentEvents(characterId: number): SimEvent[];
  ambientPlayerBotNames(): string[];
}

export interface HostedPlayRuntimeOptions {
  game: HostedPlayRuntimeGame;
  llmCoordinator?: AmbientPlayerBotLlmCoordinator | null;
  llmConfig?: AmbientPlayerBotLlmConfig | null;
  brainIntervalMs?: number;
  errorPauseMs?: number;
  nowMs?: () => number;
}

export class HostedPlayRuntime {
  private readonly game: HostedPlayRuntimeGame;
  private readonly llmCoordinator: AmbientPlayerBotLlmCoordinator | null;
  private readonly llmConfig: AmbientPlayerBotLlmConfig;
  private readonly llmEnabled: boolean;
  private readonly brainDecisionIntervalMs: number;
  private readonly loopIntervalMs: number;
  private readonly errorPauseMs: number;
  private readonly nowMs: () => number;
  private readonly entries = new Map<number, HostedPlayEntry>();
  private interval: NodeJS.Timeout | null = null;
  private started = false;

  constructor(options: HostedPlayRuntimeOptions) {
    this.game = options.game;
    this.llmCoordinator = options.llmCoordinator ?? null;
    this.llmConfig = options.llmConfig ?? hostedPlayLlmConfigFromEnv();
    this.llmEnabled = this.llmConfig.enabled && this.llmCoordinator !== null;
    this.brainDecisionIntervalMs = options.brainIntervalMs ?? HOSTED_PLAY_BRAIN_INTERVAL_MS;
    this.loopIntervalMs = Math.min(this.brainDecisionIntervalMs, HOSTED_PLAY_DRIVE_INTERVAL_MS);
    this.errorPauseMs = options.errorPauseMs ?? HOSTED_PLAY_ERROR_PAUSE_MS;
    this.nowMs = options.nowMs ?? (() => Date.now());
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.interval = setInterval(() => {
      this.tick();
    }, this.loopIntervalMs);
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    for (const characterId of this.entries.keys()) {
      this.game.setHostedPlayObserved(characterId, false);
      this.game.clearHostedPlayControl(characterId);
    }
    this.entries.clear();
  }

  status(characterId: number): HostedPlayStatusSnapshot {
    const nowMs = this.nowMs();
    const info = this.game.hostedPlaySessionInfo(characterId);
    const entry = this.entries.get(characterId) ?? null;
    const preferences = entry?.preferences ?? defaultHostedPlayPreferences();
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
      resumeOnLogin: preferences.resumeOnLogin,
      partyMode: preferences.partyMode,
      groupMode: entry?.groupMode ?? '',
      groupLeaderName: entry?.groupLeaderName ?? '',
      groupLeaderDistance: entry?.groupLeaderDistance ?? 0,
      socialPendingReplies: entry?.socialState.pendingReplies.length ?? 0,
      socialFriends: socialNameCount(entry?.socialMemory, 'friendNames'),
      socialBlocks: socialNameCount(entry?.socialMemory, 'blockNames'),
      lastWhisperFrom: entry?.lastWhisperFrom ?? '',
      lastSocialAction: entry?.lastSocialAction ?? '',
      llmEnabled: entry?.llmState.enabled ?? this.llmEnabled,
      llmPlanPending: entry?.llmState.planPending ?? false,
      llmPlanMode: entry?.llmState.plan?.socialMode ?? '',
      llmPlanFocus: entry?.llmState.plan?.focusLabel ?? entry?.llmState.planFocus ?? '',
      llmPlanStatus: entry?.llmState.planStatus ?? '',
      llmPlanReason: entry?.llmState.planReason ?? '',
      llmSocialStatus: entry?.llmState.socialStatus ?? '',
      llmSocialReason: entry?.llmState.socialReason ?? '',
      llmSocialTarget: entry?.llmState.socialTarget ?? '',
    };
  }

  enable(
    characterId: number,
    preferences: HostedPlayPreferences = defaultHostedPlayPreferences(),
  ): HostedPlayStatusSnapshot {
    const info = this.game.hostedPlaySessionInfo(characterId);
    if (!info) throw new Error('character is not currently online');
    const existing = this.entries.get(characterId);
    const entry: HostedPlayEntry = existing
      ? {
          ...existing,
          characterName: info.characterName,
          playerClass: info.playerClass,
          preferences: { ...preferences },
          pauseUntilMs: null,
          pauseReason: '',
          lastError: '',
          lastBrainAtMs: null,
          lastBrainResult: null,
          brainDrivePaused: false,
        }
      : {
          characterId,
          characterName: info.characterName,
          playerClass: info.playerClass,
          enabledAtMs: this.nowMs(),
          preferences: { ...preferences },
          pauseUntilMs: null,
          pauseReason: '',
          objectiveId: '',
          objectiveLabel: '',
          lastError: '',
          lastAutomationAtMs: null,
          groupMode: '',
          groupLeaderName: '',
          groupLeaderDistance: 0,
          socialMemory: {},
          socialState: createAmbientPlayerBotSocialRuntimeState(),
          lastWhisperFrom: '',
          lastSocialAction: '',
          brainState: createAmbientPlayerBotBrainState(),
          lastBrainAtMs: null,
          lastBrainResult: null,
          brainDrivePaused: false,
          partyState: createHostedPlayPartyState(),
          llmState: createHostedPlayLlmState(this.llmEnabled ? this.llmConfig : null),
        };
    this.entries.set(characterId, entry);
    this.game.setHostedPlayObserved(characterId, true);
    this.game.clearHostedPlayControl(characterId);
    return this.status(characterId);
  }

  updatePreferences(
    characterId: number,
    preferences: HostedPlayPreferences,
  ): HostedPlayStatusSnapshot {
    const entry = this.entries.get(characterId);
    if (entry) {
      entry.preferences = { ...preferences };
    }
    return this.status(characterId);
  }

  disable(characterId: number): HostedPlayStatusSnapshot {
    this.game.setHostedPlayObserved(characterId, false);
    this.entries.delete(characterId);
    this.game.clearHostedPlayControl(characterId);
    return this.status(characterId);
  }

  private tick(): void {
    for (const [characterId, entry] of [...this.entries.entries()]) {
      try {
        this.tickEntry(characterId, entry);
      } catch (err) {
        entry.lastError = err instanceof Error ? err.message : String(err);
        entry.pauseUntilMs = this.nowMs() + this.errorPauseMs;
        entry.pauseReason = 'runtime_error';
        this.game.clearHostedPlayControl(characterId);
      }
    }
  }

  private tickEntry(characterId: number, entry: HostedPlayEntry): void {
    const info = this.game.hostedPlaySessionInfo(characterId);
    if (!info) {
      this.game.setHostedPlayObserved(characterId, false);
      this.entries.delete(characterId);
      return;
    }
    entry.characterName = info.characterName;
    entry.playerClass = info.playerClass;

    const nowMs = this.nowMs();
    const runtimeAtMs = nowMs;
    if (entry.pauseUntilMs !== null && entry.pauseUntilMs > nowMs) return;
    if (entry.pauseUntilMs !== null && entry.pauseUntilMs <= nowMs) {
      entry.pauseUntilMs = null;
      entry.pauseReason = '';
      entry.lastError = '';
    }

    const liveState = this.game.buildHostedPlayLiveState(characterId);
    if (!liveState) {
      this.game.setHostedPlayObserved(characterId, false);
      this.entries.delete(characterId);
      return;
    }
    if (!liveState.self) {
      this.game.setHostedPlayObserved(characterId, false);
      this.entries.delete(characterId);
      return;
    }
    this.game.noteHostedPlayActivity(characterId);
    const decisionDue = entry.lastBrainResult === null
      || entry.lastBrainAtMs === null
      || runtimeAtMs - entry.lastBrainAtMs >= this.brainDecisionIntervalMs;
    if (!decisionDue) {
      this.driveHostedEntry(characterId, entry, liveState);
      return;
    }
    const recentEvents = this.game.drainHostedPlayRecentEvents(characterId);

    const result = tickAmbientPlayerBotBrain(
      {
        bot: hostedPlayBotRecord(info, liveState, entry),
        liveState,
        nowMs,
      },
      entry.brainState,
    );
    entry.lastBrainAtMs = runtimeAtMs;
    entry.lastBrainResult = result;
    entry.objectiveId = result.objectiveId;
    entry.objectiveLabel = result.objectiveLabel;
    entry.lastError = '';

    const partyResult = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveState.self,
        partyMode: entry.preferences.partyMode,
        nowMs,
      },
      entry.partyState,
    );
    entry.groupMode = partyResult.groupMode;
    entry.groupLeaderName = partyResult.groupLeaderName;
    entry.groupLeaderDistance = partyResult.groupLeaderDistance;
    entry.brainDrivePaused = partyResult.pauseBrainDrive;

    const socialResult = tickAmbientPlayerBotSocialShell(
      {
        bot: hostedPlayBotRecord(info, liveState, entry),
        liveState,
        recentEvents,
        ambientBotNames: new Set(this.game.ambientPlayerBotNames()),
        llmPlan: entry.llmState.plan,
        nowMs,
      },
      entry.socialState,
    );
    entry.socialMemory = socialResult.socialState;
    const lastWhisperFrom = socialResult.runnerStatePatch.lastWhisperFrom;
    if (typeof lastWhisperFrom === 'string') entry.lastWhisperFrom = lastWhisperFrom;
    const lastSocialAction = socialResult.runnerStatePatch.lastSocialAction;
    if (typeof lastSocialAction === 'string') entry.lastSocialAction = lastSocialAction;

    for (const command of partyResult.commands) {
      this.game.applyHostedPlayCommand(characterId, command);
    }
    if (partyResult.pauseBrainDrive) {
      this.game.clearHostedPlayControl(characterId);
    } else {
      this.driveHostedEntry(characterId, entry, liveState, result);
    }
    if (!partyResult.pauseBrainDrive) {
      for (const command of result.commands) {
        this.game.applyHostedPlayCommand(characterId, command);
      }
    }
    for (const command of socialResult.commands) {
      this.applyHostedPlaySocialCommand(characterId, command);
    }
    if (this.llmEnabled && this.llmCoordinator) {
      const bot = hostedPlayBotRecord(info, liveState, entry);
      this.maybeQueuePlanDecision(
        characterId,
        entry,
        bot,
        liveState,
        result.objectiveId,
        result.objectiveLabel,
      );
      this.maybeQueueSocialDecisions(characterId, entry, bot, liveState);
    } else {
      for (const reply of entry.socialState.pendingReplies) {
        if (!reply.llmStatus || reply.llmStatus === 'idle') reply.llmStatus = 'disabled';
      }
    }
    entry.lastAutomationAtMs = nowMs;
  }

  private driveHostedEntry(
    characterId: number,
    entry: HostedPlayEntry,
    liveState: AmbientPlayerBotLiveState,
    result: AmbientPlayerBotBrainTickResult | null = entry.lastBrainResult,
  ): void {
    if (!result || entry.brainDrivePaused) {
      this.game.clearHostedPlayControl(characterId);
      return;
    }
    const driveResult = result.travelGoal
      ? continueAmbientPlayerBotTravel(
          liveState,
          entry.brainState,
          result.objectiveId,
          result.objectiveLabel,
          result.travelGoal,
        ) ?? result
      : result;
    if (hasHostedDrive(driveResult.moveInput, driveResult.facing)) {
      this.game.applyHostedPlayMoveInput(characterId, driveResult.moveInput, driveResult.facing);
    } else {
      this.game.clearHostedPlayControl(characterId);
    }
  }

  private applyHostedPlaySocialCommand(
    characterId: number,
    command: AmbientPlayerBotSocialCommand,
  ): void {
    switch (command.type) {
      case 'chat':
        this.game.applyHostedPlayCommand(characterId, { cmd: 'chat', text: command.text });
        break;
      case 'friendAdd':
        this.game.applyHostedPlayCommand(characterId, { cmd: 'friend_add', name: command.name });
        break;
    }
  }

  private maybeQueuePlanDecision(
    characterId: number,
    entry: HostedPlayEntry,
    bot: AmbientPlayerBotRecord,
    liveState: AmbientPlayerBotLiveState,
    objectiveId: string,
    objectiveLabel: string,
  ): void {
    if (!this.llmCoordinator || !entry.llmState.enabled) return;
    if (entry.llmState.planPending) return;
    const nowMs = this.nowMs();
    const objectiveKey = `${objectiveId}|${objectiveLabel}`;
    const planExpired = !entry.llmState.planRequestedAtMs
      || entry.llmState.planRequestedAtMs <= nowMs - this.llmConfig.planCooldownMs;
    const planTtlExpired = entry.llmState.planRequestedAtMs !== null
      && entry.llmState.plan !== null
      && entry.llmState.planRequestedAtMs + entry.llmState.plan.ttlMs <= nowMs;
    if (
      entry.llmState.plan
      && !planExpired
      && !planTtlExpired
      && entry.llmState.lastPlanObjectiveKey === objectiveKey
    ) {
      return;
    }
    entry.llmState.planPending = true;
    entry.llmState.planRequestedAtMs = nowMs;
    const priorPlan = entry.llmState.plan ? cloneHostedPlayPlan(entry.llmState.plan) : null;
    void this.llmCoordinator.decidePlan({
      bot,
      liveState,
      objectiveId,
      objectiveLabel,
      priorPlan,
      nowMs,
    }).then((result) => {
      const liveEntry = this.entries.get(characterId);
      if (liveEntry !== entry) return;
      liveEntry.llmState.planPending = false;
      liveEntry.llmState.lastPlanObjectiveKey = objectiveKey;
      liveEntry.llmState.planStatus = result.status;
      liveEntry.llmState.planReason = result.audit.reason;
      liveEntry.llmState.planProvider = result.audit.provider;
      if ((result.status === 'accepted' || result.status === 'cache_hit') && result.decision) {
        liveEntry.llmState.plan = cloneHostedPlayPlan(result.decision);
        liveEntry.llmState.planFocus = result.decision.focusLabel;
      }
    }).catch((error) => {
      const liveEntry = this.entries.get(characterId);
      if (liveEntry !== entry) return;
      liveEntry.llmState.planPending = false;
      liveEntry.llmState.planStatus = 'error';
      liveEntry.llmState.planReason = error instanceof Error ? error.message : String(error);
    });
  }

  private maybeQueueSocialDecisions(
    characterId: number,
    entry: HostedPlayEntry,
    bot: AmbientPlayerBotRecord,
    liveState: AmbientPlayerBotLiveState,
  ): void {
    if (!this.llmCoordinator || !entry.llmState.enabled) return;
    const nowMs = this.nowMs();
    for (const reply of entry.socialState.pendingReplies) {
      if (reply.llmStatus && reply.llmStatus !== 'idle') continue;
      const lastAt = entry.llmState.lastSocialAtByName[reply.toName] ?? Number.NEGATIVE_INFINITY;
      if (lastAt > nowMs - this.llmConfig.socialCooldownMs) {
        reply.llmStatus = 'disabled';
        continue;
      }
      reply.llmStatus = 'pending';
      reply.llmRequestedAtMs = nowMs;
      entry.llmState.lastSocialAtByName[reply.toName] = nowMs;
      const snapshot = cloneHostedPlayPendingReply(reply);
      void this.llmCoordinator.decideSocial({
        bot,
        liveState,
        pendingReply: snapshot,
        plan: entry.llmState.plan ? cloneHostedPlayPlan(entry.llmState.plan) : null,
        nowMs,
      }).then((result) => {
        const liveEntry = this.entries.get(characterId);
        if (liveEntry !== entry) return;
        const pending = liveEntry.socialState.pendingReplies.find(
          (candidate) => candidate.toName === snapshot.toName && candidate.revision === snapshot.revision,
        );
        if (pending) {
          pending.llmStatus = result.status === 'accepted' || result.status === 'cache_hit'
            ? 'ready'
            : result.status;
          if ((result.status === 'accepted' || result.status === 'cache_hit') && result.decision) {
            pending.llmReplyText = result.decision.replyText;
            pending.llmFriendAction = result.decision.friendAction;
            pending.llmPresenceEmote = result.decision.presenceEmote;
            pending.llmMemoryTags = [...result.decision.memoryTags];
          }
        }
        liveEntry.llmState.socialStatus = result.status;
        liveEntry.llmState.socialReason = result.audit.reason;
        liveEntry.llmState.socialTarget = snapshot.toName;
        liveEntry.llmState.socialProvider = result.audit.provider;
      }).catch((error) => {
        const liveEntry = this.entries.get(characterId);
        if (liveEntry !== entry) return;
        const pending = liveEntry.socialState.pendingReplies.find(
          (candidate) => candidate.toName === snapshot.toName && candidate.revision === snapshot.revision,
        );
        if (pending) pending.llmStatus = 'error';
        liveEntry.llmState.socialStatus = 'error';
        liveEntry.llmState.socialReason = error instanceof Error ? error.message : String(error);
        liveEntry.llmState.socialTarget = snapshot.toName;
      });
    }
  }
}

function hostedPlayBotRecord(
  info: HostedPlaySessionInfo,
  liveState: AmbientPlayerBotLiveState,
  entry: HostedPlayEntry,
): AmbientPlayerBotRecord {
  const zoneId = zoneAt(liveState.self?.z ?? 0).id;
  return {
    botId: `hosted:${info.characterId}`,
    accountId: null,
    accountUsername: '',
    accountPassword: '',
    characterId: info.characterId,
    characterName: info.characterName,
    profileId: `${zoneId}_${info.playerClass}_quester`,
    class: info.playerClass,
    authToken: '',
    authTokenExpiresAtMs: null,
    lifecycleStatus: 'online',
    provisionState: 'ready',
    levelBand: { min: 1, max: 60 },
    preferredZoneIds: [zoneId],
    lastKnownZoneId: zoneId,
    lastKnownLevel: liveState.self?.lv ?? 1,
    lastKnownX: liveState.self?.x ?? null,
    lastKnownZ: liveState.self?.z ?? null,
    assignedClusterId: null,
    assignedPlayerCharacterId: info.characterId,
    cooldownUntilMs: null,
    reservationUntilMs: null,
    lastRunnerError: entry.lastError,
    lastRunnerAtMs: entry.lastAutomationAtMs,
    plannerState: {},
    runnerState: {
      objective: entry.objectiveId,
      objectiveLabel: entry.objectiveLabel,
      llmPlanMode: entry.llmState.plan?.socialMode ?? '',
      llmPlanFocus: entry.llmState.plan?.focusLabel ?? entry.llmState.planFocus,
    },
    socialState: entry.socialMemory,
  };
}

function hasHostedDrive(moveInput: Record<string, unknown>, facing?: number): boolean {
  if (facing !== undefined && Number.isFinite(facing)) return true;
  return Object.values(moveInput).some((value) => value === 1 || value === true);
}

function socialNameCount(
  value: Record<string, unknown> | undefined,
  key: 'friendNames' | 'blockNames',
): number {
  const names = value?.[key];
  return Array.isArray(names) ? names.filter((name): name is string => typeof name === 'string').length : 0;
}
