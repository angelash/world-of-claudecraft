import { normalizeHostedPlayAutoInviteTargetPartySize } from '../../src/hosted_play_settings';
import { zoneAt } from '../../src/sim/data';
import { INTERACT_RANGE, type SimEvent } from '../../src/sim/types';
import {
  type AmbientPlayerBotBrainState,
  type AmbientPlayerBotBrainTickResult,
  ambientBrainSelfMaintenanceAllowedWhilePartyPaused,
  continueAmbientPlayerBotTravel,
  createAmbientPlayerBotBrainState,
  markAmbientPlayerBotBrainExternalProgress,
  tickAmbientPlayerBotBrain,
} from '../ambient_bots/brain';
import type { AmbientPlayerBotLlmCoordinator } from '../ambient_bots/llm_coordinator';
import {
  type AmbientPlayerBotPartyChatRuntimeState,
  createAmbientPlayerBotPartyChatRuntimeState,
  tickAmbientPlayerBotPartyChatShell,
} from '../ambient_bots/party_chat';
import { ambientPartyCoordinationIntentFromRunnerState } from '../ambient_bots/party_intent';
import {
  type AmbientPlayerBotSocialCommand,
  type AmbientPlayerBotSocialRuntimeState,
  createAmbientPlayerBotSocialRuntimeState,
  tickAmbientPlayerBotSocialShell,
} from '../ambient_bots/social';
import type { AmbientPlayerBotLlmConfig, AmbientPlayerBotRecord } from '../ambient_bots/types';
import type { AmbientPlayerBotLiveState } from '../ambient_bots/ws_client';
import { type HostedPlayActionLog, hostedPlayActionLogForResult } from './action_log';
import {
  cloneHostedPlayPendingReply,
  cloneHostedPlayPlan,
  createHostedPlayLlmState,
  type HostedPlayLlmState,
  hostedPlayLlmConfigFromEnv,
} from './llm';
import {
  createHostedPlayPartyState,
  type HostedPlayPartyState,
  tickHostedPlayPartyCoordinator,
} from './party';
import type {
  HostedPlayDebugCommand,
  HostedPlayDebugPoint,
  HostedPlayDebugSnapshot,
  HostedPlayDebugTravelGoal,
  HostedPlayPauseReason,
  HostedPlayPreferences,
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
const HOSTED_PLAY_LOCAL_ACTIVE_QUEST_MAX_LEADER_DISTANCE = 18;
const HOSTED_PLAY_RECOVERY_LOCAL_QUEST_MIN_HEALTH_RATIO = 0.9;
const HOSTED_PLAY_RECOVERY_RESTOCK_STABLE_HEALTH_RATIO = 0.9;
const HOSTED_PLAY_SIDE_WORK_TRAIN_LINK_RANGE = 10;
const HOSTED_PLAY_SIDE_WORK_MAX_LEADER_RANGE = 24;
const HOSTED_PLAY_OBJECT_PICKUP_RANGE = INTERACT_RANGE + 0.75;
const HOSTED_PLAY_OBJECT_PICKUP_MIN_SELF_HEALTH_RATIO = 0.72;
const HOSTED_PLAY_OBJECT_PICKUP_MIN_PARTY_HEALTH_RATIO = 0.65;
const HOSTED_PLAY_OBJECT_PICKUP_TRAIN_LINK_RANGE = 14;
const HOSTED_PLAY_OBJECT_PICKUP_MAX_LEADER_RANGE = 30;
const HOSTED_PLAY_RECOVERY_COMBAT_MIN_HEALTH_RATIO = 0.72;
const HOSTED_PLAY_RECOVERY_COMBAT_MIN_RESOURCE_RATIO = 0.25;

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
  lastPartyTravelGoal: AmbientPlayerBotBrainTickResult['travelGoal'] | null;
  lastEffectiveCommands: readonly Record<string, unknown>[];
  brainDrivePaused: boolean;
  partyState: HostedPlayPartyState;
  partyChatState: AmbientPlayerBotPartyChatRuntimeState;
  partyChatRunnerState: Record<string, unknown>;
  llmState: HostedPlayLlmState;
  actionLogAtMs: Record<string, number>;
}

interface HostedBrainDriveProgressSnapshot {
  lastProgressAtMs: number | null;
  lastX: number | null;
  lastZ: number | null;
  pathGoalKey: string | null;
  path: AmbientPlayerBotBrainState['path'];
  campIndex: number;
  stuckResets: number;
}

function hostedBrainDriveProgressSnapshot(
  state: AmbientPlayerBotBrainState,
): HostedBrainDriveProgressSnapshot {
  return {
    lastProgressAtMs: state.lastProgressAtMs,
    lastX: state.lastX,
    lastZ: state.lastZ,
    pathGoalKey: state.pathGoalKey,
    path: state.path.map((point) => ({ x: point.x, z: point.z })),
    campIndex: state.campIndex,
    stuckResets: state.stuckResets,
  };
}

function restoreHostedBrainDriveProgress(
  state: AmbientPlayerBotBrainState,
  snapshot: HostedBrainDriveProgressSnapshot,
): void {
  state.lastProgressAtMs = snapshot.lastProgressAtMs;
  state.lastX = snapshot.lastX;
  state.lastZ = snapshot.lastZ;
  state.pathGoalKey = snapshot.pathGoalKey;
  state.path = snapshot.path.map((point) => ({ x: point.x, z: point.z }));
  state.campIndex = snapshot.campIndex;
  state.stuckResets = snapshot.stuckResets;
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
    const mode = !online ? 'offline' : !entry ? 'disabled' : paused ? 'paused' : 'active';
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
      pauseUntilMs: paused ? (entry?.pauseUntilMs ?? null) : null,
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
          lastPartyTravelGoal: null,
          lastEffectiveCommands: [],
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
          lastPartyTravelGoal: null,
          lastEffectiveCommands: [],
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
    const decisionDue =
      entry.lastBrainResult === null ||
      entry.lastBrainAtMs === null ||
      runtimeAtMs - entry.lastBrainAtMs >= this.brainDecisionIntervalMs;
    if (!decisionDue) {
      if (entry.brainDrivePaused) {
        this.driveHostedPartyTravel(
          characterId,
          entry,
          liveState,
          entry.lastPartyTravelGoal,
          entry.objectiveId,
          entry.objectiveLabel,
          nowMs,
        );
      } else {
        this.driveHostedEntry(characterId, entry, liveState, entry.lastBrainResult, nowMs);
      }
      return;
    }
    const recentEvents = this.game.drainHostedPlayRecentEvents(characterId);

    const brainDriveProgressBeforeBrain = hostedBrainDriveProgressSnapshot(entry.brainState);
    const stuckResetsBeforeBrain = entry.brainState.stuckResets;
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
        objectiveDungeonId: result.objectiveDungeonId,
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
    const allowAmbientSelfMaintenanceBrain =
      partyResult.pauseBrainDrive &&
      !hostedLeaderMustHoldRegroup(partyResult.groupMode, liveState) &&
      hostedPartyCohesionStableForSideWork(liveState) &&
      ambientBrainSelfMaintenanceAllowedWhilePartyPaused({
        result,
        groupMode: partyResult.groupMode,
        liveState,
        maxTravelRange: HOSTED_PLAY_LOCAL_QUEST_OVERRIDE_RANGE,
      }) &&
      !hostedVendorSelfMaintenanceBlockedByPartyCombat(result.objectiveId, liveState);
    const allowRecoverySelfMaintenanceBrain =
      partyResult.pauseBrainDrive &&
      !hostedLeaderMustHoldRegroup(partyResult.groupMode, liveState) &&
      hostedRecoverySelfMaintenanceAllowedWhilePartyPaused(
        result,
        partyResult.groupMode,
        liveState,
      );
    const allowSelfMaintenanceBrain =
      partyResult.pauseBrainDrive &&
      (allowAmbientSelfMaintenanceBrain || allowRecoverySelfMaintenanceBrain);
    const allowCombatBrain =
      partyResult.pauseBrainDrive &&
      hostedCombatBrainAllowedWhilePartyPaused(
        result,
        partyResult.groupMode,
        liveState,
        partyResult.travelGoal ?? null,
      );
    const partyControlActive =
      partyResult.pauseBrainDrive && partyResult.groupMode !== 'brain' && !allowCombatBrain;
    entry.brainDrivePaused =
      partyResult.pauseBrainDrive &&
      !allowLocalQuestBrain &&
      !allowSelfMaintenanceBrain &&
      !allowCombatBrain;
    entry.lastPartyTravelGoal = entry.brainDrivePaused ? (partyResult.travelGoal ?? null) : null;
    const partyTravelDriveActive = entry.brainDrivePaused && !!partyResult.travelGoal;
    if (partyControlActive) {
      if (entry.brainDrivePaused) {
        restoreHostedBrainDriveProgress(entry.brainState, brainDriveProgressBeforeBrain);
      } else if (entry.brainState.stuckResets > stuckResetsBeforeBrain) {
        entry.brainState.stuckResets = stuckResetsBeforeBrain;
      }
      if (!partyTravelDriveActive) {
        markAmbientPlayerBotBrainExternalProgress(entry.brainState, liveState, nowMs, {
          preservePath: allowLocalQuestBrain || allowSelfMaintenanceBrain,
        });
      }
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
    const partyChatResult =
      entry.preferences.partyMode === 'follow_leader'
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

    const effectiveCommands: Record<string, unknown>[] = [];
    if (
      !allowLocalQuestBrain &&
      !allowCombatBrain &&
      partyResult.facing !== undefined &&
      Number.isFinite(partyResult.facing)
    ) {
      this.game.applyHostedPlayMoveInput(characterId, {}, partyResult.facing);
    }
    if (!allowLocalQuestBrain && !allowCombatBrain) {
      for (const command of partyResult.commands) {
        this.game.applyHostedPlayCommand(characterId, command);
        effectiveCommands.push(command);
      }
    }
    if (
      partyResult.pauseBrainDrive &&
      !allowLocalQuestBrain &&
      !allowSelfMaintenanceBrain &&
      !allowCombatBrain
    ) {
      this.driveHostedPartyTravel(
        characterId,
        entry,
        liveState,
        partyResult.travelGoal ?? null,
        result.objectiveId,
        result.objectiveLabel,
        nowMs,
      );
    } else {
      this.driveHostedEntry(characterId, entry, liveState, result, nowMs);
    }
    if (
      !partyResult.pauseBrainDrive ||
      allowLocalQuestBrain ||
      allowSelfMaintenanceBrain ||
      allowCombatBrain
    ) {
      for (const command of result.commands) {
        this.game.applyHostedPlayCommand(characterId, command);
        effectiveCommands.push(command);
      }
    } else {
      for (const command of hostedBrainCommandsAllowedWhilePartyPaused(
        result,
        partyResult.groupMode,
      )) {
        this.game.applyHostedPlayCommand(characterId, command);
        effectiveCommands.push(command);
      }
    }
    entry.lastEffectiveCommands = effectiveCommands;
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
    nowMs: number = this.nowMs(),
  ): void {
    if (!result || entry.brainDrivePaused) {
      this.game.clearHostedPlayControl(characterId);
      return;
    }
    const driveResult = result.travelGoal
      ? (continueAmbientPlayerBotTravel(
          liveState,
          entry.brainState,
          result.objectiveId,
          result.objectiveLabel,
          result.travelGoal,
          nowMs,
        ) ?? result)
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
    const planExpired =
      !entry.llmState.planRequestedAtMs ||
      entry.llmState.planRequestedAtMs <= nowMs - this.llmConfig.planCooldownMs;
    const planTtlExpired =
      entry.llmState.planRequestedAtMs !== null &&
      entry.llmState.plan !== null &&
      entry.llmState.planRequestedAtMs + entry.llmState.plan.ttlMs <= nowMs;
    if (
      entry.llmState.plan &&
      !planExpired &&
      !planTtlExpired &&
      entry.llmState.lastPlanObjectiveKey === objectiveKey
    ) {
      return;
    }
    entry.llmState.planPending = true;
    entry.llmState.planRequestedAtMs = nowMs;
    const priorPlan = entry.llmState.plan ? cloneHostedPlayPlan(entry.llmState.plan) : null;
    void this.llmCoordinator
      .decidePlan({
        bot,
        liveState,
        objectiveId,
        objectiveLabel,
        priorPlan,
        nowMs,
      })
      .then((result) => {
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
      })
      .catch((error) => {
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
      void this.llmCoordinator
        .decideSocial({
          bot,
          liveState,
          pendingReply: snapshot,
          plan: entry.llmState.plan ? cloneHostedPlayPlan(entry.llmState.plan) : null,
          nowMs,
        })
        .then((result) => {
          const liveEntry = this.entries.get(characterId);
          if (liveEntry !== entry) return;
          const pending = liveEntry.socialState.pendingReplies.find(
            (candidate) =>
              candidate.toName === snapshot.toName && candidate.revision === snapshot.revision,
          );
          if (pending) {
            pending.llmStatus =
              result.status === 'accepted' || result.status === 'cache_hit'
                ? 'ready'
                : result.status;
            if (
              (result.status === 'accepted' || result.status === 'cache_hit') &&
              result.decision
            ) {
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
        })
        .catch((error) => {
          const liveEntry = this.entries.get(characterId);
          if (liveEntry !== entry) return;
          const pending = liveEntry.socialState.pendingReplies.find(
            (candidate) =>
              candidate.toName === snapshot.toName && candidate.revision === snapshot.revision,
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

  private driveHostedPartyTravel(
    characterId: number,
    entry: HostedPlayEntry,
    liveState: AmbientPlayerBotLiveState,
    travelGoal: AmbientPlayerBotBrainTickResult['travelGoal'] | null,
    objectiveId: string,
    objectiveLabel: string,
    nowMs: number,
  ): void {
    if (!travelGoal) {
      this.game.clearHostedPlayControl(characterId);
      return;
    }
    const groupDrive = continueAmbientPlayerBotTravel(
      liveState,
      entry.brainState,
      objectiveId,
      objectiveLabel,
      travelGoal,
      nowMs,
    );
    if (groupDrive && hasHostedDrive(groupDrive.moveInput, groupDrive.facing)) {
      this.game.applyHostedPlayMoveInput(characterId, groupDrive.moveInput, groupDrive.facing);
    } else {
      this.game.clearHostedPlayControl(characterId);
    }
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
    commands: entry
      ? entry.lastEffectiveCommands
          .slice(0, HOSTED_PLAY_DEBUG_MAX_COMMANDS)
          .map(hostedPlayDebugCommand)
      : [],
    travelGoal: result?.travelGoal ? hostedPlayDebugTravelGoal(result.travelGoal) : null,
    brainState: {
      objectiveSinceMs: entry?.brainState.objectiveSinceMs ?? null,
      lastProgressAtMs: entry?.brainState.lastProgressAtMs ?? null,
      pathGoalKey: entry?.brainState.pathGoalKey ?? '',
      pathLength: entry?.brainState.path.length ?? 0,
      nextPathPoint: entry?.brainState.path[0]
        ? hostedPlayDebugPoint(entry.brainState.path[0])
        : null,
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
): readonly Record<string, unknown>[] {
  if (hostedRecoveryBrainAllowedWhilePartyPaused(result, groupMode)) {
    return result.commands.filter(isHostedRecoveryCommand);
  }
  return [];
}

function isHostedLocalQuestObjective(objectiveId: string): boolean {
  return objectiveId.startsWith('accept_') || objectiveId.startsWith('turnin_');
}

function hostedLocalQuestBrainAllowedWhilePartyPaused(
  result: AmbientPlayerBotBrainTickResult,
  groupMode: string,
  liveState: AmbientPlayerBotLiveState,
): boolean {
  if (hostedLeaderMustHoldRegroup(groupMode, liveState)) return false;
  const localGroupMode =
    groupMode === 'follow_leader' || groupMode === 'hold_regroup' || groupMode === 'prepare_party';
  const recoveryQuestIntakeMode = groupMode === 'assist_party' || groupMode === 'recover_party';
  if (!localGroupMode && !recoveryQuestIntakeMode) return false;
  if (hostedObjectPickupBrainAllowedWhilePartyPaused(result, groupMode, liveState)) {
    return true;
  }
  if (isHostedLocalQuestObjective(result.objectiveId)) {
    if (!hostedPartyCohesionStableForSideWork(liveState)) return false;
    if (
      localGroupMode &&
      hostedLeaderDistance(liveState) > HOSTED_PLAY_LOCAL_ACTIVE_QUEST_MAX_LEADER_DISTANCE
    ) {
      return false;
    }
    if (recoveryQuestIntakeMode) {
      if (hostedPartyHasCombatSignal(liveState)) return false;
      if (!hostedPartyHealthStableForRecoverySideWork(liveState)) return false;
      if (result.objectiveId.startsWith('accept_')) {
        if (!hostedSelfCanAcceptQuestDuringRecovery(liveState)) return false;
      } else if (result.objectiveId.startsWith('turnin_')) {
        if (!hostedSelfCanTurnInQuestDuringRecovery(liveState)) return false;
      } else {
        return false;
      }
    }
    return hostedLocalQuestTravelIsNearby(result, liveState);
  }
  if (result.objectiveId === 'loot') {
    if (!hostedPartyCohesionStableForSideWork(liveState)) return false;
    if (recoveryQuestIntakeMode) {
      if (hostedPartyHasCombatSignal(liveState)) return false;
      if (!hostedPartyHealthStableForRecoverySideWork(liveState)) return false;
      if (!hostedSelfIsHealthyForRecoveryQuestWork(liveState)) return false;
    }
    if (hostedLeaderDistance(liveState) > HOSTED_PLAY_LOCAL_ACTIVE_QUEST_MAX_LEADER_DISTANCE)
      return false;
    return hostedLocalQuestTravelIsNearby(result, liveState);
  }
  if (recoveryQuestIntakeMode) return false;
  if (!isHostedActiveQuestObjective(result)) return false;
  if (!hostedPartyCohesionStableForSideWork(liveState)) return false;
  if (hostedLeaderDistance(liveState) > HOSTED_PLAY_LOCAL_ACTIVE_QUEST_MAX_LEADER_DISTANCE)
    return false;
  return hostedLocalQuestTravelIsNearby(result, liveState);
}

function hostedObjectPickupBrainAllowedWhilePartyPaused(
  result: AmbientPlayerBotBrainTickResult,
  groupMode: string,
  liveState: AmbientPlayerBotLiveState,
): boolean {
  if (!result.objectiveId.startsWith('collect_')) return false;
  if (hostedLeaderMustHoldRegroup(groupMode, liveState)) return false;
  if (
    groupMode !== 'assist_party' &&
    groupMode !== 'recover_party' &&
    groupMode !== 'follow_leader' &&
    groupMode !== 'hold_regroup' &&
    groupMode !== 'prepare_party'
  ) {
    return false;
  }
  if (!hostedSelfHealthyForObjectPickup(liveState)) return false;
  if (hostedPartyHasObjectPickupHealthRisk(liveState)) return false;
  if (!hostedPartyCohesionStableForObjectPickup(liveState)) return false;
  return hostedLootableObjectNearSelf(liveState, HOSTED_PLAY_OBJECT_PICKUP_RANGE);
}

function hostedSelfHealthyForObjectPickup(liveState: AmbientPlayerBotLiveState): boolean {
  const self = liveState.self;
  if (!self) return false;
  if (self.dead === 1 || self.dead === true) return false;
  const hp = typeof self.hp === 'number' ? self.hp : 1;
  const maxHp = typeof self.mhp === 'number' ? self.mhp : 1;
  return maxHp <= 0 || hp / maxHp >= HOSTED_PLAY_OBJECT_PICKUP_MIN_SELF_HEALTH_RATIO;
}

function hostedPartyHasObjectPickupHealthRisk(liveState: AmbientPlayerBotLiveState): boolean {
  const self = liveState.self;
  if (!self) return true;
  const party = hostedRuntimePartyFromLiveState(liveState);
  const members =
    party?.members ??
    [hostedRuntimeMemberFromLive(self)].filter(
      (member): member is HostedRuntimePartyMember => member !== null,
    );
  if (members.length === 0) return true;
  return members.some((member) => {
    if (member.dead) return true;
    return (
      member.mhp > 0 && member.hp / member.mhp < HOSTED_PLAY_OBJECT_PICKUP_MIN_PARTY_HEALTH_RATIO
    );
  });
}

function hostedPartyCohesionStableForObjectPickup(liveState: AmbientPlayerBotLiveState): boolean {
  const party = hostedRuntimePartyFromLiveState(liveState);
  if (!party) return true;
  const leader = party.members.find((member) => member.pid === party.leader) ?? null;
  if (!leader || leader.dead) return false;
  const trainMembers = [leader, ...party.members.filter((member) => member.pid !== leader.pid)];
  let previous = trainMembers[0] ?? null;
  if (!previous) return false;
  for (const member of trainMembers.slice(1)) {
    if (member.dead) return false;
    if (
      hostedRuntimeMemberDistance(previous, member) > HOSTED_PLAY_OBJECT_PICKUP_TRAIN_LINK_RANGE
    ) {
      return false;
    }
    if (hostedRuntimeMemberDistance(leader, member) > HOSTED_PLAY_OBJECT_PICKUP_MAX_LEADER_RANGE) {
      return false;
    }
    previous = member;
  }
  return true;
}

function hostedLootableObjectNearSelf(
  liveState: AmbientPlayerBotLiveState,
  range: number,
): boolean {
  const selfX = typeof liveState.self?.x === 'number' ? liveState.self.x : null;
  const selfZ = typeof liveState.self?.z === 'number' ? liveState.self.z : null;
  if (selfX === null || selfZ === null) return false;
  for (const entity of liveState.entities.values()) {
    if (entity.k !== 'object' || (entity.loot !== 1 && entity.loot !== true)) continue;
    const x = readHostedRuntimeNumber(entity.x);
    const z = readHostedRuntimeNumber(entity.z);
    if (x === null || z === null) continue;
    if (Math.hypot(selfX - x, selfZ - z) <= range) return true;
  }
  return false;
}

function hostedSelfCanAcceptQuestDuringRecovery(liveState: AmbientPlayerBotLiveState): boolean {
  return hostedSelfIsHealthyForRecoveryQuestWork(liveState);
}

function hostedSelfCanTurnInQuestDuringRecovery(liveState: AmbientPlayerBotLiveState): boolean {
  return hostedSelfIsHealthyForRecoveryQuestWork(liveState);
}

function hostedSelfIsHealthyForRecoveryQuestWork(liveState: AmbientPlayerBotLiveState): boolean {
  const self = liveState.self;
  if (!self) return false;
  if (self.dead === 1 || self.dead === true) return false;
  const hp = typeof self.hp === 'number' ? self.hp : 1;
  const maxHp = typeof self.mhp === 'number' ? self.mhp : 1;
  return maxHp <= 0 || hp / maxHp >= HOSTED_PLAY_RECOVERY_LOCAL_QUEST_MIN_HEALTH_RATIO;
}

function isHostedActiveQuestObjective(result: AmbientPlayerBotBrainTickResult): boolean {
  return (
    !!result.objectiveQuestId &&
    result.objectiveId !== 'recover' &&
    result.objectiveId !== 'prepare_combat'
  );
}

function hostedRecoveryBrainAllowedWhilePartyPaused(
  result: AmbientPlayerBotBrainTickResult,
  groupMode: string,
): boolean {
  return (
    result.objectiveId === 'recover' &&
    (groupMode === 'assist_party' ||
      groupMode === 'prepare_party' ||
      groupMode === 'follow_leader' ||
      groupMode === 'hold_regroup' ||
      groupMode === 'heal_party' ||
      groupMode === 'buff_party' ||
      groupMode === 'recover_party')
  );
}

function hostedCombatBrainAllowedWhilePartyPaused(
  result: AmbientPlayerBotBrainTickResult,
  groupMode: string,
  liveState: AmbientPlayerBotLiveState,
  partyTravelGoal: AmbientPlayerBotBrainTickResult['travelGoal'] | null,
): boolean {
  if (result.objectiveId !== 'combat') return false;
  if (groupMode !== 'recover_party' && groupMode !== 'assist_party') return false;
  if (partyTravelGoal && hostedPartyTravelGoalShouldKeepBrainPaused(partyTravelGoal, liveState)) {
    return false;
  }
  return hostedPartyHasCombatSignal(liveState) && !hostedPartyRecoveryCombatUnsafe(liveState);
}

function hostedPartyTravelGoalShouldKeepBrainPaused(
  travelGoal: NonNullable<AmbientPlayerBotBrainTickResult['travelGoal']>,
  liveState: AmbientPlayerBotLiveState,
): boolean {
  if (
    !travelGoal.goalKey.startsWith('hosted-party-safe-retreat:') &&
    !travelGoal.goalKey.startsWith('hosted-party-safe-leash:') &&
    !travelGoal.goalKey.startsWith('hosted-party-retreat:') &&
    !travelGoal.goalKey.startsWith('hosted-party-density-retreat:') &&
    !travelGoal.goalKey.startsWith('hosted-party-recover:')
  ) {
    return false;
  }
  return !hostedSelfAtPartyTravelGoal(liveState, travelGoal);
}

function hostedSelfAtPartyTravelGoal(
  liveState: AmbientPlayerBotLiveState,
  travelGoal: NonNullable<AmbientPlayerBotBrainTickResult['travelGoal']>,
): boolean {
  const selfX = readHostedRuntimeNumber(liveState.self?.x);
  const selfZ = readHostedRuntimeNumber(liveState.self?.z);
  if (selfX === null || selfZ === null) return false;
  return (
    Math.hypot(travelGoal.target.x - selfX, travelGoal.target.z - selfZ) <=
    Math.max(0.5, travelGoal.arrivalRange)
  );
}

function isHostedRecoveryCommand(command: Record<string, unknown>): boolean {
  return command.cmd === 'use';
}

function hostedRecoverySelfMaintenanceAllowedWhilePartyPaused(
  result: AmbientPlayerBotBrainTickResult,
  groupMode: string,
  liveState: AmbientPlayerBotLiveState,
): boolean {
  if (groupMode !== 'recover_party' && groupMode !== 'assist_party') return false;
  if (!result.objectiveId.startsWith('restock_')) return false;
  if (!hostedPartyCohesionStableForSideWork(liveState)) return false;
  if (hostedPartyHasCombatSignal(liveState)) return false;
  if (hostedTravelGoalIsNearby(result, liveState, HOSTED_PLAY_LOCAL_QUEST_OVERRIDE_RANGE))
    return true;
  return (
    hostedSelfIsPartyLeader(liveState) && hostedPartyHealthStableForRecoverySideWork(liveState)
  );
}

function hostedVendorSelfMaintenanceBlockedByPartyCombat(
  objectiveId: string,
  liveState: AmbientPlayerBotLiveState,
): boolean {
  if (
    !objectiveId.startsWith('restock_') &&
    !objectiveId.startsWith('buy_') &&
    objectiveId !== 'sell_junk'
  ) {
    return false;
  }
  return hostedPartyHasCombatSignal(liveState);
}

function hostedTravelGoalIsNearby(
  result: AmbientPlayerBotBrainTickResult,
  liveState: AmbientPlayerBotLiveState,
  maxRange: number,
): boolean {
  if (!result.travelGoal) return true;
  const selfX = typeof liveState.self?.x === 'number' ? liveState.self.x : null;
  const selfZ = typeof liveState.self?.z === 'number' ? liveState.self.z : null;
  if (selfX === null || selfZ === null) return false;
  return (
    Math.hypot(result.travelGoal.target.x - selfX, result.travelGoal.target.z - selfZ) <= maxRange
  );
}

function hostedPartyHasCombatSignal(liveState: AmbientPlayerBotLiveState): boolean {
  const self = liveState.self;
  const selfId = typeof self?.id === 'number' ? self.id : null;
  const party = hostedRuntimePartyFromLiveState(liveState);
  const partyIds = new Set<number>(party ? party.members.map((member) => member.pid) : []);
  if (selfId !== null) partyIds.add(selfId);
  if (hostedCombatFlag(self?.cmb) || hostedCombatFlag(self?.inCombat)) return true;
  if (party?.members.some((member) => member.inCombat)) return true;
  for (const entity of liveState.entities.values()) {
    const entityId = typeof entity.id === 'number' ? entity.id : null;
    if (entity.k === 'player' && entityId !== null && partyIds.has(entityId)) {
      if (hostedCombatFlag(entity.cmb) || hostedCombatFlag(entity.inCombat)) return true;
    }
    if (entity.k !== 'mob' || entity.dead === 1 || entity.dead === true) continue;
    const aggroTargetId = typeof entity.aggro === 'number' ? entity.aggro : null;
    if (aggroTargetId !== null && partyIds.has(aggroTargetId)) return true;
  }
  return false;
}

function hostedCombatFlag(value: unknown): boolean {
  return value === true || value === 1;
}

function hostedPartyHealthStableForRecoverySideWork(liveState: AmbientPlayerBotLiveState): boolean {
  const self = liveState.self;
  if (!self) return false;
  const party = hostedRuntimePartyFromLiveState(liveState);
  const members =
    party?.members ??
    [hostedRuntimeMemberFromLive(self)].filter(
      (member): member is HostedRuntimePartyMember => member !== null,
    );
  if (members.length === 0) return false;
  return members.every((member) => {
    if (member.dead) return false;
    const hp = member.hp;
    const maxHp = member.mhp;
    return maxHp <= 0 || hp / maxHp >= HOSTED_PLAY_RECOVERY_RESTOCK_STABLE_HEALTH_RATIO;
  });
}

function hostedPartyCohesionStableForSideWork(liveState: AmbientPlayerBotLiveState): boolean {
  const party = hostedRuntimePartyFromLiveState(liveState);
  if (!party) return true;
  const leader = party.members.find((member) => member.pid === party.leader) ?? null;
  if (!leader || leader.dead) return false;
  const trainMembers = [leader, ...party.members.filter((member) => member.pid !== leader.pid)];
  let previous = trainMembers[0] ?? null;
  if (!previous) return false;
  for (const member of trainMembers.slice(1)) {
    if (member.dead) return false;
    if (hostedRuntimeMemberDistance(previous, member) > HOSTED_PLAY_SIDE_WORK_TRAIN_LINK_RANGE) {
      return false;
    }
    if (hostedRuntimeMemberDistance(leader, member) > HOSTED_PLAY_SIDE_WORK_MAX_LEADER_RANGE) {
      return false;
    }
    previous = member;
  }
  return true;
}

function hostedRuntimeMemberDistance(
  a: HostedRuntimePartyMember,
  b: HostedRuntimePartyMember,
): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function hostedLocalQuestTravelIsNearby(
  result: AmbientPlayerBotBrainTickResult,
  liveState: AmbientPlayerBotLiveState,
): boolean {
  if (!result.travelGoal) return true;
  const selfX = typeof liveState.self?.x === 'number' ? liveState.self.x : null;
  const selfZ = typeof liveState.self?.z === 'number' ? liveState.self.z : null;
  if (selfX === null || selfZ === null) return false;
  return (
    Math.hypot(result.travelGoal.target.x - selfX, result.travelGoal.target.z - selfZ) <=
    HOSTED_PLAY_LOCAL_QUEST_OVERRIDE_RANGE
  );
}

function hostedLeaderDistance(liveState: AmbientPlayerBotLiveState): number {
  const self = liveState.self;
  const party = hostedRuntimePartyFromLiveState(liveState);
  if (!self || !party) return 0;
  const selfId = typeof self.id === 'number' ? self.id : null;
  if (selfId === null || party.leader === selfId) return 0;
  const leader = party.members.find((member) => member.pid === party.leader) ?? null;
  const selfMember = party.members.find((member) => member.pid === selfId) ?? null;
  if (!leader || !selfMember) return 0;
  return Math.hypot(leader.x - selfMember.x, leader.z - selfMember.z);
}

function hostedLeaderMustHoldRegroup(
  groupMode: string,
  liveState: AmbientPlayerBotLiveState,
): boolean {
  return groupMode === 'hold_regroup' && hostedSelfIsPartyLeader(liveState);
}

function hostedSelfIsPartyLeader(liveState: AmbientPlayerBotLiveState): boolean {
  const self = liveState.self;
  const party = hostedRuntimePartyFromLiveState(liveState);
  return typeof self?.id === 'number' && !!party && party.leader === self.id;
}

interface HostedRuntimePartyMember {
  pid: number;
  cls: string | null;
  x: number;
  z: number;
  hp: number;
  mhp: number;
  res: number;
  mres: number;
  rtype: string | null;
  dead: boolean;
  inCombat: boolean;
}

function hostedPartyRecoveryCombatUnsafe(liveState: AmbientPlayerBotLiveState): boolean {
  const self = liveState.self;
  const party = hostedRuntimePartyFromLiveState(liveState);
  const members =
    party?.members ??
    [hostedRuntimeMemberFromLive(self)].filter(
      (member): member is HostedRuntimePartyMember => member !== null,
    );
  if (members.length === 0) return true;
  if (
    members.some(
      (member) =>
        member.dead ||
        hostedRuntimeHealthRatio(member) <= HOSTED_PLAY_RECOVERY_COMBAT_MIN_HEALTH_RATIO,
    )
  ) {
    return true;
  }
  const primaryResourceMember = hostedRuntimePrimaryResourceRecoveryMember(members);
  return primaryResourceMember
    ? hostedRuntimeMemberNeedsResourceRecovery(
        primaryResourceMember,
        HOSTED_PLAY_RECOVERY_COMBAT_MIN_RESOURCE_RATIO,
      )
    : false;
}

function hostedRuntimePrimaryResourceRecoveryMember(
  members: readonly HostedRuntimePartyMember[],
): HostedRuntimePartyMember | null {
  const healers = members.filter(
    (member) => !member.dead && hostedRuntimeClassCanHeal(member.cls) && member.rtype === 'mana',
  );
  return healers.find((member) => member.cls === 'priest') ?? healers[0] ?? null;
}

function hostedRuntimeClassCanHeal(cls: string | null): boolean {
  return cls === 'priest' || cls === 'paladin' || cls === 'shaman' || cls === 'druid';
}

function hostedRuntimeMemberNeedsResourceRecovery(
  member: HostedRuntimePartyMember,
  threshold: number,
): boolean {
  if (member.rtype !== 'mana') return false;
  if (member.mres <= 0) return false;
  return member.res / member.mres <= threshold;
}

function hostedRuntimeHealthRatio(member: HostedRuntimePartyMember): number {
  return member.mhp > 0 ? member.hp / member.mhp : 1;
}

function parseHostedRuntimeParty(
  value: unknown,
): { leader: number; members: HostedRuntimePartyMember[] } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as { leader?: unknown; members?: unknown };
  if (typeof record.leader !== 'number' || !Array.isArray(record.members)) return null;
  const members = record.members
    .map(hostedRuntimeMemberFromLive)
    .filter((member): member is HostedRuntimePartyMember => member !== null);
  return { leader: record.leader, members };
}

function hostedRuntimePartyFromLiveState(
  liveState: AmbientPlayerBotLiveState,
): { leader: number; members: HostedRuntimePartyMember[] } | null {
  const party = parseHostedRuntimeParty(liveState.self?.party);
  if (!party) return null;
  const liveMembers = hostedRuntimeLiveMembersById(liveState);
  return {
    leader: party.leader,
    members: party.members.map((member) =>
      mergeHostedRuntimeMemberFromLive(member, liveMembers.get(member.pid)),
    ),
  };
}

function hostedRuntimeLiveMembersById(
  liveState: AmbientPlayerBotLiveState,
): Map<number, Record<string, unknown>> {
  const members = new Map<number, Record<string, unknown>>();
  if (liveState.self && typeof liveState.self.id === 'number') {
    members.set(liveState.self.id, liveState.self);
  }
  for (const entity of liveState.entities.values()) {
    if (!entity || typeof entity !== 'object' || Array.isArray(entity)) continue;
    if (entity.k !== 'player') continue;
    const id = readHostedRuntimeNumber(entity.id);
    if (id !== null) members.set(id, entity);
  }
  return members;
}

function mergeHostedRuntimeMemberFromLive(
  member: HostedRuntimePartyMember,
  liveMember: Record<string, unknown> | undefined,
): HostedRuntimePartyMember {
  if (!liveMember) return member;
  return {
    ...member,
    cls: readHostedRuntimeString(liveMember.cls) ?? member.cls,
    x: readHostedRuntimeNumber(liveMember.x) ?? member.x,
    z: readHostedRuntimeNumber(liveMember.z) ?? member.z,
    hp: readHostedRuntimeNumber(liveMember.hp) ?? member.hp,
    mhp: readHostedRuntimeNumber(liveMember.mhp) ?? member.mhp,
    res: readHostedRuntimeNumber(liveMember.res) ?? member.res,
    mres: readHostedRuntimeNumber(liveMember.mres) ?? member.mres,
    rtype: readHostedRuntimeString(liveMember.rtype) ?? member.rtype,
    dead: 'dead' in liveMember ? hostedCombatFlag(liveMember.dead) : member.dead,
    inCombat:
      'inCombat' in liveMember || 'cmb' in liveMember
        ? hostedCombatFlag(liveMember.inCombat) || hostedCombatFlag(liveMember.cmb)
        : member.inCombat,
  };
}

function hostedRuntimeMemberFromLive(value: unknown): HostedRuntimePartyMember | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const member = value as Record<string, unknown>;
  const pid = readHostedRuntimeNumber(member.pid) ?? readHostedRuntimeNumber(member.id);
  const x = readHostedRuntimeNumber(member.x);
  const z = readHostedRuntimeNumber(member.z);
  if (pid === null || x === null || z === null) return null;
  return {
    pid,
    cls: readHostedRuntimeString(member.cls),
    x,
    z,
    hp: readHostedRuntimeNumber(member.hp) ?? 1,
    mhp: readHostedRuntimeNumber(member.mhp) ?? 1,
    res: readHostedRuntimeNumber(member.res) ?? 0,
    mres: readHostedRuntimeNumber(member.mres) ?? 0,
    rtype: readHostedRuntimeString(member.rtype),
    dead: hostedCombatFlag(member.dead),
    inCombat: hostedCombatFlag(member.inCombat) || hostedCombatFlag(member.cmb),
  };
}

function readHostedRuntimeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readHostedRuntimeString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
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
  const kind =
    typeof command.cmd === 'string'
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
  return atMs === null || !Number.isFinite(atMs) ? null : Math.max(0, Math.round(nowMs - atMs));
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
  const zoneId = zoneAt(liveState.self?.x ?? 0, liveState.self?.z ?? 0).id;
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
  return Array.isArray(names)
    ? names.filter((name): name is string => typeof name === 'string').length
    : 0;
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
