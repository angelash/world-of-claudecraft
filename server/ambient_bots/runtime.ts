import { zoneAt } from '../../src/sim/data';
import { accountForToken } from '../db';
import {
  createAmbientPlayerBotBrainState,
  tickAmbientPlayerBotBrain,
  type AmbientPlayerBotBrainState,
} from './brain';
import { ambientBotProfileById } from './profiles';
import {
  createAmbientPlayerBotSocialRuntimeState,
  tickAmbientPlayerBotSocialShell,
  type AmbientPlayerBotPendingReply,
  type AmbientPlayerBotSocialRuntimeState,
} from './social';
import type { AmbientCreateCharacterResult, AmbientPlayerBotApi } from './api_client';
import {
  AmbientPlayerBotLlmCoordinator,
  ambientPlayerBotLlmConfigFromEnv,
  type AmbientPlayerBotLlmConfig,
} from './llm_coordinator';
import type { AmbientBotPlanDecisionV1 } from './llm_types';
import { ambientBotAccountPassword, ambientBotAccountUsername, ambientBotCharacterName, ambientBotId } from './naming';
import type { AmbientBotPlanAction, AmbientPlayerBotRecord } from './types';
import { AmbientPlayerBotWsClient, type AmbientPlayerBotLiveState, type AmbientPlayerBotSocket } from './ws_client';

export interface AmbientPlayerBotRuntimeGame {
  replaceAmbientPlayerBotDirectory(records: readonly AmbientPlayerBotRecord[]): void;
  ambientPlayerBotDirectory(): AmbientPlayerBotRecord[];
  ambientPlayerBotRecord(botId: string): AmbientPlayerBotRecord | null;
  upsertAmbientPlayerBotRecord(record: AmbientPlayerBotRecord): void;
  fulfillAmbientPlayerBotProvision(requestId: string, record: AmbientPlayerBotRecord): void;
  setAmbientPlayerBotActionHandler(handler: ((actions: readonly AmbientBotPlanAction[]) => void) | null): void;
}

export interface AmbientPlayerBotRuntimeDb {
  listBots(): Promise<AmbientPlayerBotRecord[]>;
  saveBot(record: AmbientPlayerBotRecord): Promise<void>;
}

export interface AmbientPlayerBotRuntimeOptions {
  game: AmbientPlayerBotRuntimeGame;
  db: AmbientPlayerBotRuntimeDb;
  apiClient: AmbientPlayerBotApi;
  wsBaseUrl: string;
  llmCoordinator?: AmbientPlayerBotLlmCoordinator | null;
  llmConfig?: AmbientPlayerBotLlmConfig | null;
  brainIntervalMs?: number;
  webSocketFactory?: (url: string) => AmbientPlayerBotSocket;
  nowMs?: () => number;
  resolveAccountIdForToken?: (token: string) => Promise<number | null>;
  provisionReservationMs?: number;
  authTokenTtlMs?: number;
}

interface RunnerEntry {
  client: AmbientPlayerBotWsClient;
  brainState: AmbientPlayerBotBrainState;
  socialState: AmbientPlayerBotSocialRuntimeState;
  llmPlan: AmbientBotPlanDecisionV1 | null;
  llmPlanPending: boolean;
  llmPlanRequestedAtMs: number | null;
  llmLastPlanObjectiveKey: string | null;
  llmLastSocialAtByName: Record<string, number>;
  connected: boolean;
  intentionalClose: boolean;
}

export class AmbientPlayerBotRuntime {
  private readonly game: AmbientPlayerBotRuntimeGame;
  private readonly db: AmbientPlayerBotRuntimeDb;
  private readonly apiClient: AmbientPlayerBotApi;
  private readonly wsBaseUrl: string;
  private readonly llmCoordinator: AmbientPlayerBotLlmCoordinator | null;
  private readonly llmConfig: AmbientPlayerBotLlmConfig;
  private readonly brainIntervalMs: number;
  private readonly webSocketFactory?: (url: string) => AmbientPlayerBotSocket;
  private readonly nowMs: () => number;
  private readonly resolveAccountIdForToken: (token: string) => Promise<number | null>;
  private readonly provisionReservationMs: number;
  private readonly authTokenTtlMs: number;
  private readonly runners = new Map<string, RunnerEntry>();
  private actionQueue: Promise<void> = Promise.resolve();
  private brainInterval: NodeJS.Timeout | null = null;
  private started = false;
  private nameSequence = 0;

  constructor(options: AmbientPlayerBotRuntimeOptions) {
    this.game = options.game;
    this.db = options.db;
    this.apiClient = options.apiClient;
    this.wsBaseUrl = options.wsBaseUrl.replace(/\/+$/, '');
    this.llmCoordinator = options.llmCoordinator ?? null;
    this.llmConfig = options.llmConfig ?? ambientPlayerBotLlmConfigFromEnv();
    this.brainIntervalMs = options.brainIntervalMs ?? 250;
    this.webSocketFactory = options.webSocketFactory;
    this.nowMs = options.nowMs ?? (() => Date.now());
    this.resolveAccountIdForToken = options.resolveAccountIdForToken ?? accountForToken;
    this.provisionReservationMs = options.provisionReservationMs ?? 90_000;
    this.authTokenTtlMs = options.authTokenTtlMs ?? 7 * 24 * 3600 * 1000;
  }

  async start(): Promise<void> {
    if (this.started) return;
    const loaded = await this.db.listBots();
    const normalized = loaded.map((record) => normalizeBootRecord(record));
    this.game.replaceAmbientPlayerBotDirectory(normalized);
    for (const record of normalized) await this.db.saveBot(record);
    this.game.setAmbientPlayerBotActionHandler((actions) => {
      if (actions.length === 0) return;
      this.actionQueue = this.actionQueue
        .then(() => this.handleActions(actions))
        .catch((error) => console.error('ambient bot runtime action failed:', error));
    });
    if (this.llmConfig.enabled) this.llmCoordinator?.warmup();
    this.started = true;
    this.brainInterval = setInterval(() => {
      void this.runBrainLoop().catch((error) => console.error('ambient bot brain loop failed:', error));
    }, this.brainIntervalMs);
    this.brainInterval.unref?.();
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    if (this.brainInterval) {
      clearInterval(this.brainInterval);
      this.brainInterval = null;
    }
    this.game.setAmbientPlayerBotActionHandler(null);
    await this.actionQueue.catch(() => {});
    for (const entry of this.runners.values()) {
      entry.intentionalClose = true;
      entry.client.close();
    }
    this.runners.clear();
  }

  private async handleActions(actions: readonly AmbientBotPlanAction[]): Promise<void> {
    for (const action of actions) {
      if (!this.started) return;
      switch (action.type) {
        case 'provisionBot':
          await this.handleProvisionAction(action);
          break;
        case 'loginBot':
          await this.handleLoginAction(action.botId);
          break;
        case 'logoutBot':
          await this.handleLogoutAction(action.botId);
          break;
      }
    }
  }

  private async handleProvisionAction(action: Extract<AmbientBotPlanAction, { type: 'provisionBot' }>): Promise<void> {
    const profile = ambientBotProfileById(action.profileId);
    if (!profile) throw new Error(`unknown ambient bot profile: ${action.profileId}`);
    const botId = ambientBotId();
    const username = ambientBotAccountUsername(action.profileId);
    const password = ambientBotAccountPassword();
    const register = await this.apiClient.register(username, password);
    const accountId = await this.resolveAccountIdForToken(register.token);
    if (accountId === null) throw new Error('ambient bot register did not yield a valid account id');
    const character = await this.createCharacterWithRetry(register.token, action.class);
    const record: AmbientPlayerBotRecord = {
      botId,
      accountId,
      accountUsername: register.username,
      accountPassword: password,
      characterId: character.id,
      characterName: character.name,
      profileId: action.profileId,
      class: action.class,
      authToken: register.token,
      authTokenExpiresAtMs: this.nowMs() + this.authTokenTtlMs,
      lifecycleStatus: 'reserved',
      provisionState: 'ready',
      levelBand: { ...profile.levelBand },
      preferredZoneIds: [...profile.preferredZoneIds],
      lastKnownZoneId: action.zoneId,
      lastKnownLevel: profile.levelBand.min,
      lastKnownX: null,
      lastKnownZ: null,
      assignedClusterId: action.clusterId,
      assignedPlayerCharacterId: action.targetCharacterId,
      cooldownUntilMs: null,
      reservationUntilMs: this.nowMs() + this.provisionReservationMs,
      lastRunnerError: '',
      lastRunnerAtMs: null,
      plannerState: {},
      runnerState: {},
      socialState: {},
    };
    this.game.fulfillAmbientPlayerBotProvision(action.requestId, record);
    await this.db.saveBot(record);
    await this.connectBot(botId, false);
  }

  private async handleLoginAction(botId: string): Promise<void> {
    if (this.runners.has(botId)) return;
    await this.connectBot(botId, true);
  }

  private async handleLogoutAction(botId: string): Promise<void> {
    const entry = this.runners.get(botId);
    if (entry) {
      entry.intentionalClose = true;
      entry.client.close();
      this.runners.delete(botId);
    }
    const record = this.game.ambientPlayerBotRecord(botId);
    if (!record) return;
    record.lastRunnerAtMs = this.nowMs();
    record.runnerState = {};
    this.game.upsertAmbientPlayerBotRecord(record);
    await this.db.saveBot(record);
  }

  private async connectBot(botId: string, allowLoginRetry: boolean): Promise<void> {
    const record = this.game.ambientPlayerBotRecord(botId);
    if (!record || record.characterId === null) return;
    const authToken = await this.ensureAuthToken(record, allowLoginRetry);
    const client = new AmbientPlayerBotWsClient({
      wsBaseUrl: this.wsBaseUrl,
      ...(this.webSocketFactory ? { webSocketFactory: this.webSocketFactory } : {}),
      onSnapshot: (state) => {
        const live = this.game.ambientPlayerBotRecord(botId);
        if (!live || !state.self) return;
        live.lastKnownX = typeof state.self.x === 'number' ? state.self.x : live.lastKnownX;
        live.lastKnownZ = typeof state.self.z === 'number' ? state.self.z : live.lastKnownZ;
        live.lastKnownLevel = typeof state.self.lv === 'number' ? state.self.lv : live.lastKnownLevel;
        if (typeof state.self.z === 'number') live.lastKnownZoneId = zoneAt(state.self.z).id;
        live.lastRunnerAtMs = this.nowMs();
        live.runnerState = {
          ...live.runnerState,
          pid: state.pid,
          connected: true,
        };
        this.game.upsertAmbientPlayerBotRecord(live);
      },
      onClose: (error) => {
        const entry = this.runners.get(botId);
        if (!entry || entry.intentionalClose || !entry.connected) return;
        this.runners.delete(botId);
        void this.handleUnexpectedClose(botId, error);
      },
    });
    const entry: RunnerEntry = {
      client,
      brainState: createAmbientPlayerBotBrainState(),
      socialState: createAmbientPlayerBotSocialRuntimeState(),
      llmPlan: null,
      llmPlanPending: false,
      llmPlanRequestedAtMs: null,
      llmLastPlanObjectiveKey: null,
      llmLastSocialAtByName: {},
      connected: false,
      intentionalClose: false,
    };
    this.runners.set(botId, entry);
    try {
      await client.connect({ token: authToken, characterId: record.characterId });
      entry.connected = true;
      const connected = this.game.ambientPlayerBotRecord(botId);
      if (!connected) return;
      connected.authToken = authToken;
      connected.authTokenExpiresAtMs = this.nowMs() + this.authTokenTtlMs;
      connected.lifecycleStatus = 'online';
      connected.provisionState = 'ready';
      connected.lastRunnerError = '';
      connected.lastRunnerAtMs = this.nowMs();
      const state = client.state();
      const self = state.self;
      connected.runnerState = {
        ...connected.runnerState,
        pid: state.pid,
        connected: true,
      };
      if (typeof self?.x === 'number') connected.lastKnownX = self.x;
      if (typeof self?.z === 'number') {
        connected.lastKnownZ = self.z;
        connected.lastKnownZoneId = zoneAt(self.z).id;
      }
      if (typeof self?.lv === 'number') connected.lastKnownLevel = self.lv;
      this.game.upsertAmbientPlayerBotRecord(connected);
      await this.db.saveBot(connected);
    } catch (error) {
      this.runners.delete(botId);
      const failed = this.game.ambientPlayerBotRecord(botId);
      if (failed) {
        failed.lastRunnerError = error instanceof Error ? error.message : 'ambient bot connect failed';
        failed.lastRunnerAtMs = this.nowMs();
        failed.runnerState = {};
        this.game.upsertAmbientPlayerBotRecord(failed);
        await this.db.saveBot(failed);
      }
      throw error;
    }
  }

  private async createCharacterWithRetry(
    token: string,
    cls: AmbientPlayerBotRecord['class'],
  ): Promise<AmbientCreateCharacterResult> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = ambientBotCharacterName(cls, ++this.nameSequence);
      try {
        return await this.apiClient.createCharacter(token, candidate, cls);
      } catch (error) {
        lastError = error;
        if (!isRetryableCharacterCreateError(error)) throw error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('ambient bot character creation failed');
  }

  private async ensureAuthToken(record: AmbientPlayerBotRecord, allowLoginRetry: boolean): Promise<string> {
    if (record.authToken && (record.authTokenExpiresAtMs ?? 0) > this.nowMs() + 60_000) {
      return record.authToken;
    }
    if (!allowLoginRetry) return record.authToken;
    if (!record.accountUsername || !record.accountPassword) {
      throw new Error(`ambient bot ${record.botId} has no stored credentials`);
    }
    const login = await this.apiClient.login(record.accountUsername, record.accountPassword);
    const refreshed = this.game.ambientPlayerBotRecord(record.botId) ?? record;
    refreshed.authToken = login.token;
    refreshed.authTokenExpiresAtMs = this.nowMs() + this.authTokenTtlMs;
    refreshed.lastRunnerError = '';
    this.game.upsertAmbientPlayerBotRecord(refreshed);
    await this.db.saveBot(refreshed);
    return login.token;
  }

  private async handleUnexpectedClose(botId: string, error?: Error): Promise<void> {
    const record = this.game.ambientPlayerBotRecord(botId);
    if (!record) return;
    record.lifecycleStatus = 'ready';
    record.assignedClusterId = null;
    record.assignedPlayerCharacterId = null;
    record.reservationUntilMs = null;
    record.lastRunnerError = error?.message ?? '';
    record.lastRunnerAtMs = this.nowMs();
    record.runnerState = {};
    this.game.upsertAmbientPlayerBotRecord(record);
    await this.db.saveBot(record);
  }

  private async runBrainLoop(): Promise<void> {
    for (const [botId, entry] of this.runners) {
      if (!this.started || !entry.connected) continue;
      const record = this.game.ambientPlayerBotRecord(botId);
      if (!record) continue;
      try {
        const liveState = entry.client.state();
        if (!liveState.self) continue;
        const recentEvents = entry.client.drainEvents();
        const result = tickAmbientPlayerBotBrain({
          bot: record,
          liveState,
          nowMs: this.nowMs(),
        }, entry.brainState);
        for (const command of result.commands) entry.client.command(command);
        entry.client.input(result.moveInput, result.facing);
        const latest = this.game.ambientPlayerBotRecord(botId);
        if (!latest) continue;
        const socialResult = tickAmbientPlayerBotSocialShell({
          bot: latest,
          liveState,
          recentEvents,
          ambientBotNames: new Set(
            this.game.ambientPlayerBotDirectory().map((candidate) => candidate.characterName).filter(Boolean),
          ),
          llmPlan: entry.llmPlan,
          nowMs: this.nowMs(),
        }, entry.socialState);
        for (const command of socialResult.commands) {
          switch (command.type) {
            case 'chat':
              entry.client.command({ cmd: 'chat', text: command.text });
              break;
            case 'friendAdd':
              entry.client.command({ cmd: 'friend_add', name: command.name });
              break;
          }
        }
        const nextRunnerState = {
          ...latest.runnerState,
          pid: liveState.pid,
          connected: true,
          objective: result.objectiveId,
          objectiveLabel: result.objectiveLabel,
          campIndex: entry.brainState.campIndex,
          stuckResets: entry.brainState.stuckResets,
          ...(entry.llmPlan
            ? {
              llmPlanMode: entry.llmPlan.socialMode,
              llmPlanFocus: entry.llmPlan.focusLabel,
            }
            : {}),
          ...socialResult.runnerStatePatch,
        };
        let shouldPersist = false;
        if (!sameJsonRecord(latest.socialState, socialResult.socialState)) {
          latest.socialState = socialResult.socialState;
          shouldPersist = socialResult.shouldPersist;
        }
        if (!sameRunnerState(latest.runnerState, nextRunnerState)) {
          latest.runnerState = nextRunnerState;
        }
        if (!sameRunnerState(record.runnerState, latest.runnerState) || !sameJsonRecord(record.socialState, latest.socialState)) {
          this.game.upsertAmbientPlayerBotRecord(latest);
        }
        if (shouldPersist) {
          await this.db.saveBot(latest);
        }
        this.maybeQueuePlanDecision(botId, entry, latest, liveState, result.objectiveId, result.objectiveLabel);
        this.maybeQueueSocialDecisions(botId, entry, latest, liveState);
      } catch (error) {
        console.error(`ambient bot brain tick failed for ${botId}:`, error);
      }
    }
  }

  private maybeQueuePlanDecision(
    botId: string,
    entry: RunnerEntry,
    bot: AmbientPlayerBotRecord,
    liveState: AmbientPlayerBotLiveState,
    objectiveId: string,
    objectiveLabel: string,
  ): void {
    if (!this.llmCoordinator || !this.llmConfig.enabled) return;
    if (entry.llmPlanPending) return;
    const nowMs = this.nowMs();
    const objectiveKey = `${objectiveId}|${objectiveLabel}`;
    const planExpired = !entry.llmPlanRequestedAtMs
      || entry.llmPlanRequestedAtMs <= nowMs - this.llmConfig.planCooldownMs;
    const planTtlExpired = entry.llmPlanRequestedAtMs !== null
      && entry.llmPlan !== null
      && entry.llmPlanRequestedAtMs + entry.llmPlan.ttlMs <= nowMs;
    if (
      entry.llmPlan
      && !planExpired
      && !planTtlExpired
      && entry.llmLastPlanObjectiveKey === objectiveKey
    ) {
      return;
    }
    entry.llmPlanPending = true;
    entry.llmPlanRequestedAtMs = nowMs;
    const priorPlan = entry.llmPlan ? clonePlan(entry.llmPlan) : null;
    void this.llmCoordinator.decidePlan({
      bot,
      liveState,
      objectiveId,
      objectiveLabel,
      priorPlan,
      nowMs,
    }).then(async (result) => {
      const liveEntry = this.runners.get(botId);
      if (!liveEntry) return;
      liveEntry.llmPlanPending = false;
      liveEntry.llmLastPlanObjectiveKey = objectiveKey;
      if ((result.status === 'accepted' || result.status === 'cache_hit') && result.decision) {
        liveEntry.llmPlan = result.decision;
      }
      await this.persistLlmAudit(botId, {
        llmPlanStatus: result.status,
        llmPlanReason: result.audit.reason,
        llmPlanProvider: result.audit.provider,
        llmPlanLatencyMs: result.audit.latencyMs,
        llmPlanPrompt: result.audit.promptText,
        llmPlanRawOutput: result.audit.rawOutput,
        ...(liveEntry.llmPlan
          ? {
            llmPlanMode: liveEntry.llmPlan.socialMode,
            llmPlanFocus: liveEntry.llmPlan.focusLabel,
          }
          : {}),
      });
    }).catch(async (error) => {
      const liveEntry = this.runners.get(botId);
      if (liveEntry) liveEntry.llmPlanPending = false;
      await this.persistLlmAudit(botId, {
        llmPlanStatus: 'error',
        llmPlanReason: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private maybeQueueSocialDecisions(
    botId: string,
    entry: RunnerEntry,
    bot: AmbientPlayerBotRecord,
    liveState: AmbientPlayerBotLiveState,
  ): void {
    if (!this.llmCoordinator || !this.llmConfig.enabled) return;
    const nowMs = this.nowMs();
    for (const reply of entry.socialState.pendingReplies) {
      if (reply.llmStatus && reply.llmStatus !== 'idle') continue;
      const lastAt = entry.llmLastSocialAtByName[reply.toName] ?? Number.NEGATIVE_INFINITY;
      if (lastAt > nowMs - this.llmConfig.socialCooldownMs) {
        reply.llmStatus = 'disabled';
        continue;
      }
      reply.llmStatus = 'pending';
      reply.llmRequestedAtMs = nowMs;
      entry.llmLastSocialAtByName[reply.toName] = nowMs;
      const snapshot = clonePendingReply(reply);
      void this.llmCoordinator.decideSocial({
        bot,
        liveState,
        pendingReply: snapshot,
        plan: entry.llmPlan ? clonePlan(entry.llmPlan) : null,
        nowMs,
      }).then(async (result) => {
        const liveEntry = this.runners.get(botId);
        if (!liveEntry) return;
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
        await this.persistLlmAudit(botId, {
          llmSocialStatus: result.status,
          llmSocialReason: result.audit.reason,
          llmSocialProvider: result.audit.provider,
          llmSocialLatencyMs: result.audit.latencyMs,
          llmSocialTarget: snapshot.toName,
          llmSocialPrompt: result.audit.promptText,
          llmSocialRawOutput: result.audit.rawOutput,
        });
      }).catch(async (error) => {
        const liveEntry = this.runners.get(botId);
        const pending = liveEntry?.socialState.pendingReplies.find(
          (candidate) => candidate.toName === snapshot.toName && candidate.revision === snapshot.revision,
        );
        if (pending) pending.llmStatus = 'error';
        await this.persistLlmAudit(botId, {
          llmSocialStatus: 'error',
          llmSocialReason: error instanceof Error ? error.message : String(error),
          llmSocialTarget: snapshot.toName,
        });
      });
    }
  }

  private async persistLlmAudit(
    botId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const record = this.game.ambientPlayerBotRecord(botId);
    if (!record) return;
    record.runnerState = {
      ...record.runnerState,
      ...patch,
    };
    this.game.upsertAmbientPlayerBotRecord(record);
    await this.db.saveBot(record);
  }
}

function normalizeBootRecord(record: AmbientPlayerBotRecord): AmbientPlayerBotRecord {
  if (record.lifecycleStatus === 'online' || record.lifecycleStatus === 'reserved') {
    return {
      ...record,
      lifecycleStatus: 'ready',
      assignedClusterId: null,
      assignedPlayerCharacterId: null,
      reservationUntilMs: null,
      runnerState: {},
    };
  }
  return {
    ...record,
    runnerState: { ...record.runnerState },
  };
}

function isRetryableCharacterCreateError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /that name is taken|invalid character name/i.test(error.message);
}

function sameRunnerState(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);
  if (currentKeys.length !== nextKeys.length) return false;
  for (const key of nextKeys) {
    if (!Object.is(current[key], next[key])) return false;
  }
  return true;
}

function sameJsonRecord(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  return JSON.stringify(current) === JSON.stringify(next);
}

function clonePlan(value: AmbientBotPlanDecisionV1): AmbientBotPlanDecisionV1 {
  return {
    ...value,
    botRef: { ...value.botRef },
    audit: {
      shortReason: value.audit.shortReason,
      safetyNotes: [...value.audit.safetyNotes],
    },
  };
}

function clonePendingReply(value: AmbientPlayerBotPendingReply): AmbientPlayerBotPendingReply {
  return {
    ...value,
    ...(value.llmMemoryTags ? { llmMemoryTags: [...value.llmMemoryTags] } : {}),
  };
}
