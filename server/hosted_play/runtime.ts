import {
  ambientBrainSelfMaintenanceAllowedWhilePartyPaused,
  continueAmbientPlayerBotTravel,
  createAmbientPlayerBotBrainState,
  markAmbientPlayerBotBrainExternalProgress,
  tickAmbientPlayerBotBrain,
  type AmbientPlayerBotBrainState,
  type AmbientPlayerBotBrainTickResult,
} from '../ambient_bots/brain';
import { AmbientPlayerBotLlmCoordinator } from '../ambient_bots/llm_coordinator';
import {
  createAmbientPlayerBotPartyChatRuntimeState,
  tickAmbientPlayerBotPartyChatShell,
  type AmbientPlayerBotPartyChatRuntimeState,
} from '../ambient_bots/party_chat';
import { ambientPartyCoordinationIntentFromRunnerState } from '../ambient_bots/party_intent';
import {
  createAmbientPlayerBotSocialRuntimeState,
  tickAmbientPlayerBotSocialShell,
  type AmbientPlayerBotSocialCommand,
  type AmbientPlayerBotSocialRuntimeState,
} from '../ambient_bots/social';
import type { AmbientPlayerBotLlmConfig, AmbientPlayerBotRecord } from '../ambient_bots/types';
import type { AmbientPlayerBotLiveState } from '../ambient_bots/ws_client';
import { normalizeHostedPlayAutoInviteTargetPartySize } from '../../src/hosted_play_settings';
import { zoneAt } from '../../src/sim/data';
import type { SimEvent } from '../../src/sim/types';
import {
  createHostedPlayPartyState,
  tickHostedPlayPartyCoordinator,
  type HostedPlayPartyState,
} from './party';
import {
  hostedPlayActionLogForResult,
  type HostedPlayActionLog,
} from './action_log';
import {
  cloneHostedPlayPendingReply,
  cloneHostedPlayPlan,
  createHostedPlayLlmState,
  hostedPlayLlmConfigFromEnv,
  type HostedPlayLlmState,
} from './llm';
import type {
  HostedPlayDebugCommand,
  HostedPlayDebugPoint,
  HostedPlayDebugSnapshot,
  HostedPlayDebugTravelGoal,
  HostedPlayPreferences,
  HostedPlayPauseReason,
  HostedPlaySessionInfo,
  HostedPlayStatusSnapshot,
} from './types';
import { defaultHostedPlayPreferences } from './types';

const HOSTED_PLAY_BRAIN_INTERVAL_MS = 250;
const HOSTED_PLAY_DRIVE_INTERVAL_MS = 50;
const HOSTED_PLAY_ERROR_PAUSE_MS = 10_000;
const HOSTED_PLAY_DEBUG_MAX_COMMANDS = 8;
const HOSTED_PLAY_DEBUG_MAX_PENDING_REPLIES = 6;
const HOSTED_PLAY_DEBUG_MAX_COMMAND_JSON_CHARS = 1_200;
const HOSTED_PLAY_DEBUG_MAX_TEXT_CHARS = 240;
const HOSTED_PLAY_LOCAL_QUEST_OVERRIDE_RANGE = 24;

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
  partyChatState: AmbientPlayerBotPartyChatRuntimeState;
  partyChatRunnerState: Record<string, unknown>;
  llmState: HostedPlayLlmState;
  actionLogAtMs: Record<string, number>;
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
  sendHostedPlayActionLog(characterId: number, text: string): void;
  ambientPlayerBotDirectory(): AmbientPlayerBotRecord[];
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
      actionLogEnabled: preferences.actionLogEnabled,
      autoInviteNearbyPlayers: preferences.autoInviteNearbyPlayers,
      autoInviteNearbyTargetPartySize: preferences.autoInviteNearbyTargetPartySize,
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
      debug: hostedPlayDebugSnapshot(entry, nowMs, this.llmEnabled),
    };
  }

  enable(
    characterId: number,
    preferences: HostedPlayPreferences = defaultHostedPlayPreferences(),
  ): HostedPlayStatusSnapshot {
    const info = this.game.hostedPlaySessionInfo(characterId);
    if (!info) throw new Error('character is not currently online');
    const existing = this.entries.get(characterId);
    const normalizedPreferences = hostedPlayPreferencesWithDefaults(preferences);
    const entry: HostedPlayEntry = existing
      ? {
          ...existing,
          characterName: info.characterName,
          playerClass: info.playerClass,
          preferences: normalizedPreferences,
          pauseUntilMs: null,
          pauseReason: '',
          lastError: '',
          lastBrainAtMs: null,
          lastBrainResult: null,
          brainDrivePaused: false,
          partyChatState: createAmbientPlayerBotPartyChatRuntimeState(),
          partyChatRunnerState: {},
          actionLogAtMs: {},
        }
      : {
          characterId,
          characterName: info.characterName,
          playerClass: info.playerClass,
          enabledAtMs: this.nowMs(),
          preferences: normalizedPreferences,
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
          partyChatState: createAmbientPlayerBotPartyChatRuntimeState(),
          partyChatRunnerState: {},
          llmState: createHostedPlayLlmState(this.llmEnabled ? this.llmConfig : null),
          actionLogAtMs: {},
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
      entry.preferences = hostedPlayPreferencesWithDefaults(preferences);
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
    this.maybeSendHostedPlayActionLog(characterId, entry, result, nowMs);

    const partyResult = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveState.self,
        entities: liveState.entities.values(),
        recentEvents,
        playerClass: info.playerClass,
        partyMode: entry.preferences.partyMode,
        autoInviteNearbyPlayers: entry.preferences.autoInviteNearbyPlayers,
        autoInviteNearbyTargetPartySize: entry.preferences.autoInviteNearbyTargetPartySize,
        objectiveSuggestedPartySize: result.objectiveSuggestedPartySize ?? 0,
        partyIntent: ambientPartyCoordinationIntentFromRunnerState(entry.partyChatRunnerState),
        ambientDirectory: this.game.ambientPlayerBotDirectory(),
        nowMs,
      },
      entry.partyState,
    );
    entry.groupMode = partyResult.groupMode;
    entry.groupLeaderName = partyResult.groupLeaderName;
    entry.groupLeaderDistance = partyResult.groupLeaderDistance;
    const allowLocalQuestBrain = hostedLocalQuestBrainAllowedWhilePartyPaused(
      result,
      partyResult.groupMode,
      liveState,
    );
    const allowSelfMaintenanceBrain = partyResult.pauseBrainDrive
      && ambientBrainSelfMaintenanceAllowedWhilePartyPaused({
        result,
        groupMode: partyResult.groupMode,
        liveState,
        maxTravelRange: HOSTED_PLAY_LOCAL_QUEST_OVERRIDE_RANGE,
      });
    entry.brainDrivePaused = partyResult.pauseBrainDrive && !allowLocalQuestBrain && !allowSelfMaintenanceBrain;
    if (entry.brainDrivePaused && !partyResult.travelGoal) {
      markAmbientPlayerBotBrainExternalProgress(entry.brainState, liveState, nowMs);
    }

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
    const partyChatResult = entry.preferences.partyMode === 'follow_leader'
      ? tickAmbientPlayerBotPartyChatShell(
        {
          bot: hostedPlayBotRecord(info, liveState, entry),
          liveState,
          recentEvents,
          ambientBotNames: new Set(this.game.ambientPlayerBotNames()),
          llmPlan: entry.llmState.plan,
          objectiveId: result.objectiveId,
          objectiveLabel: result.objectiveLabel,
          objectiveQuestId: result.objectiveQuestId,
          objectiveDungeonId: result.objectiveDungeonId,
          groupMode: entry.groupMode,
          nowMs,
        },
        entry.partyChatState,
      )
      : { commands: [], runnerStatePatch: {} };
    entry.partyChatRunnerState = { ...partyChatResult.runnerStatePatch };

    if (!allowLocalQuestBrain) {
      for (const command of partyResult.commands) {
        this.game.applyHostedPlayCommand(characterId, command);
      }
    }
    if (partyResult.pauseBrainDrive && !allowLocalQuestBrain) {
      if (partyResult.travelGoal) {
        const groupDrive = continueAmbientPlayerBotTravel(
          liveState,
          entry.brainState,
          result.objectiveId,
          result.objectiveLabel,
          partyResult.travelGoal,
        );
        if (groupDrive && hasHostedDrive(groupDrive.moveInput, groupDrive.facing)) {
          this.game.applyHostedPlayMoveInput(characterId, groupDrive.moveInput, groupDrive.facing);
        } else {
          this.game.clearHostedPlayControl(characterId);
        }
      } else {
        this.game.clearHostedPlayControl(characterId);
      }
    } else {
      this.driveHostedEntry(characterId, entry, liveState, result);
    }
    if (!partyResult.pauseBrainDrive || allowLocalQuestBrain || allowSelfMaintenanceBrain) {
      for (const command of result.commands) {
        this.game.applyHostedPlayCommand(characterId, command);
      }
    } else {
      for (const command of hostedBrainCommandsAllowedWhilePartyPaused(
        result,
        partyResult.groupMode,
        liveState,
      )) {
        this.game.applyHostedPlayCommand(characterId, command);
      }
    }
    for (const command of socialResult.commands) {
      this.applyHostedPlaySocialCommand(characterId, command);
    }
    for (const command of partyChatResult.commands) {
      if (command.type === 'chat') {
        this.game.applyHostedPlayCommand(characterId, { cmd: 'chat', text: command.text });
      }
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
      liveEntry.llmState.planLatencyMs = result.audit.latencyMs;
      liveEntry.llmState.planPrompt = result.audit.promptText;
      liveEntry.llmState.planRawOutput = result.audit.rawOutput;
      liveEntry.llmState.planPromptChars = result.audit.promptChars;
      liveEntry.llmState.planRawOutputChars = result.audit.rawOutputChars;
      liveEntry.llmState.planCacheHit = result.audit.cacheHit;
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
      liveEntry.llmState.planProvider = '';
      liveEntry.llmState.planLatencyMs = null;
      liveEntry.llmState.planRawOutput = '';
      liveEntry.llmState.planRawOutputChars = 0;
      liveEntry.llmState.planCacheHit = false;
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
        liveEntry.llmState.socialLatencyMs = result.audit.latencyMs;
        liveEntry.llmState.socialPrompt = result.audit.promptText;
        liveEntry.llmState.socialRawOutput = result.audit.rawOutput;
        liveEntry.llmState.socialPromptChars = result.audit.promptChars;
        liveEntry.llmState.socialRawOutputChars = result.audit.rawOutputChars;
        liveEntry.llmState.socialCacheHit = result.audit.cacheHit;
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
        liveEntry.llmState.socialProvider = '';
        liveEntry.llmState.socialLatencyMs = null;
        liveEntry.llmState.socialRawOutput = '';
        liveEntry.llmState.socialRawOutputChars = 0;
        liveEntry.llmState.socialCacheHit = false;
      });
    }
  }

  private maybeSendHostedPlayActionLog(
    characterId: number,
    entry: HostedPlayEntry,
    result: AmbientPlayerBotBrainTickResult,
    nowMs: number,
  ): void {
    if (!entry.preferences.actionLogEnabled) return;
    const actionLog = hostedPlayActionLogForResult(result);
    if (!actionLog || !hostedPlayActionLogDue(entry, actionLog, nowMs)) return;
    entry.actionLogAtMs[actionLog.key] = nowMs;
    this.game.sendHostedPlayActionLog(characterId, actionLog.text);
  }
}

function hostedPlayDebugSnapshot(
  entry: HostedPlayEntry | null,
  nowMs: number,
  llmEnabled: boolean,
): HostedPlayDebugSnapshot {
  const result = entry?.lastBrainResult ?? null;
  const facing = result?.facing;
  return {
    lastBrainAtMs: entry?.lastBrainAtMs ?? null,
    lastBrainAgeMs: ageMs(entry?.lastBrainAtMs ?? null, nowMs),
    lastAutomationAtMs: entry?.lastAutomationAtMs ?? null,
    lastAutomationAgeMs: ageMs(entry?.lastAutomationAtMs ?? null, nowMs),
    brainDrivePaused: entry?.brainDrivePaused ?? false,
    objectiveId: result?.objectiveId ?? entry?.objectiveId ?? '',
    objectiveLabel: result?.objectiveLabel ?? entry?.objectiveLabel ?? '',
    objectiveQuestId: result?.objectiveQuestId ?? '',
    objectiveDungeonId: result?.objectiveDungeonId ?? '',
    objectiveSuggestedPartySize: result?.objectiveSuggestedPartySize ?? 0,
    moveInput: result ? { ...result.moveInput } : {},
    facing: typeof facing === 'number' && Number.isFinite(facing) ? roundDebugNumber(facing) : null,
    commands: result
      ? result.commands.slice(0, HOSTED_PLAY_DEBUG_MAX_COMMANDS).map(hostedPlayDebugCommand)
      : [],
    travelGoal: result?.travelGoal ? hostedPlayDebugTravelGoal(result.travelGoal) : null,
    brainState: {
      objectiveSinceMs: entry?.brainState.objectiveSinceMs ?? null,
      lastProgressAtMs: entry?.brainState.lastProgressAtMs ?? null,
      pathGoalKey: entry?.brainState.pathGoalKey ?? '',
      pathLength: entry?.brainState.path.length ?? 0,
      nextPathPoint: entry?.brainState.path[0] ? hostedPlayDebugPoint(entry.brainState.path[0]) : null,
      campIndex: entry?.brainState.campIndex ?? 0,
      noTargetSinceMs: entry?.brainState.noTargetSinceMs ?? null,
      stuckResets: entry?.brainState.stuckResets ?? 0,
      lastCommandAtMs: hostedPlayCommandAges(entry?.brainState.lastCommandAtMs ?? {}, nowMs),
    },
    party: {
      groupMode: entry?.groupMode ?? '',
      groupLeaderName: entry?.groupLeaderName ?? '',
      groupLeaderDistance: roundDebugNumber(entry?.groupLeaderDistance ?? 0),
      brainDrivePaused: entry?.brainDrivePaused ?? false,
      partyRole: readDebugString(entry?.partyChatRunnerState, 'partyRole'),
      partyDuty: readDebugString(entry?.partyChatRunnerState, 'partyDuty'),
      intentKind: readDebugString(entry?.partyChatRunnerState, 'partyIntentKind'),
      intentBehavior: readDebugString(entry?.partyChatRunnerState, 'partyIntentBehavior'),
      intentSummary: readDebugString(entry?.partyChatRunnerState, 'partyIntentSummary'),
      intentTargetName: readDebugString(entry?.partyChatRunnerState, 'partyIntentTargetName'),
      lastPartyChatAction: readDebugString(entry?.partyChatRunnerState, 'lastPartyChatAction'),
    },
    social: {
      pendingReplies: (entry?.socialState.pendingReplies ?? [])
        .slice(0, HOSTED_PLAY_DEBUG_MAX_PENDING_REPLIES)
        .map((reply) => ({
          toName: reply.toName,
          incomingText: truncateDebugText(reply.incomingText),
          fallbackText: truncateDebugText(reply.fallbackText),
          dueInMs: Math.max(0, Math.round(reply.dueAtMs - nowMs)),
          askedForFriend: reply.askedForFriend,
          revision: reply.revision,
          llmStatus: reply.llmStatus ?? '',
          llmReplyText: truncateDebugText(reply.llmReplyText ?? ''),
          llmFriendAction: reply.llmFriendAction ?? '',
          llmPresenceEmote: reply.llmPresenceEmote ?? '',
          llmRequestedAgoMs: ageMs(reply.llmRequestedAtMs ?? null, nowMs),
        })),
    },
    llm: {
      enabled: entry?.llmState.enabled ?? llmEnabled,
      planPending: entry?.llmState.planPending ?? false,
      planStatus: entry?.llmState.planStatus ?? '',
      planReason: entry?.llmState.planReason ?? '',
      planProvider: entry?.llmState.planProvider ?? '',
      planLatencyMs: entry?.llmState.planLatencyMs ?? null,
      planPrompt: entry?.llmState.planPrompt ?? '',
      planRawOutput: entry?.llmState.planRawOutput ?? '',
      planPromptChars: entry?.llmState.planPromptChars ?? 0,
      planRawOutputChars: entry?.llmState.planRawOutputChars ?? 0,
      planCacheHit: entry?.llmState.planCacheHit ?? false,
      planMode: entry?.llmState.plan?.socialMode ?? '',
      planFocus: entry?.llmState.plan?.focusLabel ?? entry?.llmState.planFocus ?? '',
      socialStatus: entry?.llmState.socialStatus ?? '',
      socialReason: entry?.llmState.socialReason ?? '',
      socialTarget: entry?.llmState.socialTarget ?? '',
      socialProvider: entry?.llmState.socialProvider ?? '',
      socialLatencyMs: entry?.llmState.socialLatencyMs ?? null,
      socialPrompt: entry?.llmState.socialPrompt ?? '',
      socialRawOutput: entry?.llmState.socialRawOutput ?? '',
      socialPromptChars: entry?.llmState.socialPromptChars ?? 0,
      socialRawOutputChars: entry?.llmState.socialRawOutputChars ?? 0,
      socialCacheHit: entry?.llmState.socialCacheHit ?? false,
    },
    lastError: entry?.lastError ?? '',
  };
}

function hostedBrainCommandsAllowedWhilePartyPaused(
  result: AmbientPlayerBotBrainTickResult,
  groupMode: string,
  liveState: AmbientPlayerBotLiveState,
): readonly Record<string, unknown>[] {
  if (!hostedLocalQuestBrainAllowedWhilePartyPaused(result, groupMode, liveState)) return [];
  return result.commands.filter(isHostedLocalQuestCommand);
}

function isHostedLocalQuestObjective(objectiveId: string): boolean {
  return objectiveId.startsWith('accept_') || objectiveId.startsWith('turnin_');
}

function hostedLocalQuestBrainAllowedWhilePartyPaused(
  result: AmbientPlayerBotBrainTickResult,
  groupMode: string,
  liveState: AmbientPlayerBotLiveState,
): boolean {
  if (!isHostedLocalQuestObjective(result.objectiveId)) return false;
  const localGroupMode = groupMode === 'follow_leader'
    || groupMode === 'hold_regroup'
    || groupMode === 'prepare_party';
  if (!localGroupMode) return false;
  if (!result.travelGoal) return true;
  const selfX = typeof liveState.self?.x === 'number' ? liveState.self.x : null;
  const selfZ = typeof liveState.self?.z === 'number' ? liveState.self.z : null;
  if (selfX === null || selfZ === null) return false;
  return Math.hypot(result.travelGoal.target.x - selfX, result.travelGoal.target.z - selfZ)
    <= HOSTED_PLAY_LOCAL_QUEST_OVERRIDE_RANGE;
}

function isHostedLocalQuestCommand(command: Record<string, unknown>): boolean {
  const kind = command.cmd;
  return kind === 'target' || kind === 'interact';
}

function hostedPlayDebugTravelGoal(
  goal: NonNullable<AmbientPlayerBotBrainTickResult['travelGoal']>,
): HostedPlayDebugTravelGoal {
  return {
    target: hostedPlayDebugPoint(goal.target),
    arrivalRange: roundDebugNumber(goal.arrivalRange),
    goalKey: goal.goalKey,
  };
}

function hostedPlayDebugPoint(point: HostedPlayDebugPoint): HostedPlayDebugPoint {
  return {
    x: roundDebugNumber(point.x),
    z: roundDebugNumber(point.z),
  };
}

function hostedPlayDebugCommand(command: Record<string, unknown>): HostedPlayDebugCommand {
  const payloadJson = truncateDebugText(
    stringifyDebugPayload(command),
    HOSTED_PLAY_DEBUG_MAX_COMMAND_JSON_CHARS,
  );
  const kind = typeof command.cmd === 'string'
    ? command.cmd
    : typeof command.type === 'string'
    ? command.type
    : payloadJson;
  return {
    summary: truncateDebugText(kind, HOSTED_PLAY_DEBUG_MAX_TEXT_CHARS),
    payloadJson,
  };
}

function hostedPlayCommandAges(
  lastCommandAtMs: Record<string, number>,
  nowMs: number,
): HostedPlayDebugSnapshot['brainState']['lastCommandAtMs'] {
  return Object.entries(lastCommandAtMs)
    .filter(([, atMs]) => Number.isFinite(atMs))
    .map(([key, atMs]) => ({
      key,
      atMs,
      ageMs: Math.max(0, Math.round(nowMs - atMs)),
    }))
    .sort((a, b) => b.atMs - a.atMs || a.key.localeCompare(b.key))
    .slice(0, HOSTED_PLAY_DEBUG_MAX_COMMANDS);
}

function ageMs(atMs: number | null, nowMs: number): number | null {
  return atMs === null || !Number.isFinite(atMs)
    ? null
    : Math.max(0, Math.round(nowMs - atMs));
}

function roundDebugNumber(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function stringifyDebugPayload(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '{"unserializable":true}';
  }
}

function truncateDebugText(value: string, maxChars = HOSTED_PLAY_DEBUG_MAX_TEXT_CHARS): string {
  return value.length > maxChars ? `${value.slice(0, Math.max(0, maxChars - 3))}...` : value;
}

function readDebugString(value: Record<string, unknown> | undefined, key: string): string {
  const field = value?.[key];
  return typeof field === 'string' ? truncateDebugText(field) : '';
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
      ...entry.partyChatRunnerState,
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

function hostedPlayPreferencesWithDefaults(
  preferences: HostedPlayPreferences,
): HostedPlayPreferences {
  const defaults = defaultHostedPlayPreferences();
  return {
    resumeOnLogin: preferences.resumeOnLogin,
    partyMode: preferences.partyMode,
    actionLogEnabled: preferences.actionLogEnabled ?? defaults.actionLogEnabled,
    autoInviteNearbyPlayers:
      preferences.autoInviteNearbyPlayers ?? defaults.autoInviteNearbyPlayers,
    autoInviteNearbyTargetPartySize: normalizeHostedPlayAutoInviteTargetPartySize(
      preferences.autoInviteNearbyTargetPartySize ?? defaults.autoInviteNearbyTargetPartySize,
    ),
  };
}

function hostedPlayActionLogDue(
  entry: HostedPlayEntry,
  actionLog: HostedPlayActionLog,
  nowMs: number,
): boolean {
  const lastAtMs = entry.actionLogAtMs[actionLog.key];
  return lastAtMs === undefined || lastAtMs <= nowMs - actionLog.cooldownMs;
}
