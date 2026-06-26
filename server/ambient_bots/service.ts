import { DEFAULT_AMBIENT_BOT_PROFILES } from './profiles';
import type {
  AmbientBotPlanAction,
  AmbientBotProfile,
  AmbientHumanPresence,
  AmbientPlayerBotActionSnapshot,
  AmbientPlayerBotConfig,
  AmbientPlayerBotDiagnosticsSnapshot,
  AmbientPlayerBotDirectorySnapshot,
  AmbientPlayerBotMetricsSnapshot,
  AmbientPlayerBotRecord,
  AmbientPlayerClusterSnapshot,
} from './types';

interface WorkingCluster {
  clusterId: string;
  zoneId: string;
  centerX: number;
  centerZ: number;
  members: AmbientHumanPresence[];
  levelTotal: number;
  desiredBots: number;
}

interface PendingProvisionSlot {
  requestId: string;
  clusterId: string;
  expiresAtMs: number;
}

const DEFAULT_METRICS: AmbientPlayerBotMetricsSnapshot = {
  cycles: 0,
  humansObserved: 0,
  clustersObserved: 0,
  desiredBots: 0,
  assignedBots: 0,
  loginPlans: 0,
  provisionPlans: 0,
  logoutPlans: 0,
  lastRunAtMs: null,
  lastRunReason: 'not_started',
};

export class AmbientPlayerBotService {
  private readonly directory = new Map<string, AmbientPlayerBotRecord>();
  private readonly profiles: readonly AmbientBotProfile[];
  private readonly config: AmbientPlayerBotConfig;
  private readonly recentActions: AmbientPlayerBotActionSnapshot[] = [];
  private readonly pendingProvisionSlots: PendingProvisionSlot[] = [];
  private lastClusters: AmbientPlayerClusterSnapshot[] = [];
  private metrics: AmbientPlayerBotMetricsSnapshot = { ...DEFAULT_METRICS };
  private provisionSequence = 0;

  constructor(options: {
    config: AmbientPlayerBotConfig;
    profiles?: readonly AmbientBotProfile[];
  }) {
    this.config = { ...options.config };
    this.profiles = options.profiles ?? DEFAULT_AMBIENT_BOT_PROFILES;
  }

  schedulerIntervalMs(): number {
    return this.config.plannerIntervalMs;
  }

  replaceDirectory(records: readonly AmbientPlayerBotRecord[]): void {
    this.directory.clear();
    for (const record of records) this.directory.set(record.botId, cloneRecord(record));
  }

  directoryRecords(): AmbientPlayerBotRecord[] {
    return [...this.directory.values()].map(cloneRecord);
  }

  diagnosticsSnapshot(): AmbientPlayerBotDiagnosticsSnapshot {
    return {
      enabled: this.config.enabled,
      config: { ...this.config },
      metrics: { ...this.metrics },
      clusters: this.lastClusters.map((cluster) => ({
        ...cluster,
        memberCharacterIds: [...cluster.memberCharacterIds],
        assignedBotIds: [...cluster.assignedBotIds],
      })),
      recentActions: this.recentActions.map((action) => ({ ...action })),
      directory: this.directorySnapshot(),
    };
  }

  plan(input: {
    humans: readonly AmbientHumanPresence[];
    nowMs?: number;
  }): readonly AmbientBotPlanAction[] {
    const nowMs = input.nowMs ?? Date.now();
    this.metrics = {
      ...DEFAULT_METRICS,
      cycles: this.metrics.cycles + 1,
      lastRunAtMs: nowMs,
    };
    if (!this.config.enabled) {
      this.lastClusters = [];
      this.metrics.lastRunReason = 'disabled';
      return [];
    }
    this.sweepExpirations(nowMs);
    const humans = [...input.humans].sort(compareHumans);
    this.metrics.humansObserved = humans.length;
    const actions: AmbientBotPlanAction[] = [];
    const clusters = this.buildClusters(humans);
    const clusterMap = new Map(clusters.map((cluster) => [cluster.clusterId, cluster]));
    const assignedBotIdsByCluster = new Map<string, string[]>();
    const seenClassesByCluster = new Map<string, Set<AmbientPlayerBotRecord['class']>>();

    for (const bot of this.sortedDirectory()) {
      if (!bot.assignedClusterId) continue;
      const cluster = clusterMap.get(bot.assignedClusterId);
      if (!cluster) {
        this.releaseBot(bot, nowMs);
        actions.push({
          type: 'logoutBot',
          botId: bot.botId,
          reason: 'assigned cluster no longer exists',
        });
        continue;
      }
      if (this.shouldReleaseBot(bot, cluster)) {
        this.releaseBot(bot, nowMs);
        actions.push({
          type: 'logoutBot',
          botId: bot.botId,
          reason: 'assigned bot drifted beyond release radius',
        });
        continue;
      }
      pushMapValue(assignedBotIdsByCluster, cluster.clusterId, bot.botId);
      pushClass(seenClassesByCluster, cluster.clusterId, bot.class);
    }

    for (const cluster of clusters) {
      const pending = this.pendingProvisionSlots
        .filter((slot) => slot.clusterId === cluster.clusterId)
        .map((slot) => slot.requestId);
      let filled = (assignedBotIdsByCluster.get(cluster.clusterId) ?? []).length + pending.length;
      if (filled < cluster.desiredBots) {
        const candidates = this.matchExistingBots(cluster, nowMs);
        for (const bot of candidates) {
          if (filled >= cluster.desiredBots) break;
          bot.assignedClusterId = cluster.clusterId;
          bot.assignedPlayerCharacterId = cluster.members[0]?.characterId ?? null;
          if (bot.lifecycleStatus !== 'online') {
            bot.lifecycleStatus = 'reserved';
            bot.reservationUntilMs = nowMs + this.config.reservationMs;
            actions.push({
              type: 'loginBot',
              botId: bot.botId,
              clusterId: cluster.clusterId,
              zoneId: cluster.zoneId,
              targetCharacterId: cluster.members[0]?.characterId ?? 0,
              reason: 'matched ready bot to active human cluster',
            });
          }
          pushMapValue(assignedBotIdsByCluster, cluster.clusterId, bot.botId);
          pushClass(seenClassesByCluster, cluster.clusterId, bot.class);
          filled++;
        }
      }
      if (filled < cluster.desiredBots) {
        const picks = this.pickProvisionProfiles(
          cluster,
          cluster.desiredBots - filled,
          seenClassesByCluster.get(cluster.clusterId) ?? new Set(),
        );
        for (const profile of picks) {
          const requestId = `${cluster.clusterId}:req:${++this.provisionSequence}`;
          this.pendingProvisionSlots.push({
            requestId,
            clusterId: cluster.clusterId,
            expiresAtMs: nowMs + this.config.reservationMs,
          });
          actions.push({
            type: 'provisionBot',
            requestId,
            profileId: profile.profileId,
            class: profile.class,
            clusterId: cluster.clusterId,
            zoneId: cluster.zoneId,
            targetCharacterId: cluster.members[0]?.characterId ?? 0,
            reason: 'no suitable ready bot was available for this cluster',
          });
          pushClass(seenClassesByCluster, cluster.clusterId, profile.class);
          filled++;
          if (filled >= cluster.desiredBots) break;
        }
      }
    }

    this.lastClusters = clusters.map((cluster) => ({
      clusterId: cluster.clusterId,
      zoneId: cluster.zoneId,
      centerX: round2(cluster.centerX),
      centerZ: round2(cluster.centerZ),
      avgLevel: Math.round(cluster.levelTotal / Math.max(1, cluster.members.length)),
      memberCharacterIds: cluster.members.map((member) => member.characterId),
      desiredBots: cluster.desiredBots,
      assignedBotIds: [
        ...(assignedBotIdsByCluster.get(cluster.clusterId) ?? []),
        ...this.pendingProvisionSlots
          .filter((slot) => slot.clusterId === cluster.clusterId)
          .map((slot) => `pending:${slot.requestId}`),
      ],
    }));
    for (const action of actions) this.pushRecentAction(action, nowMs);
    this.metrics.clustersObserved = this.lastClusters.length;
    this.metrics.desiredBots = this.lastClusters.reduce((sum, cluster) => sum + cluster.desiredBots, 0);
    this.metrics.assignedBots = this.lastClusters.reduce((sum, cluster) => sum + cluster.assignedBotIds.length, 0);
    this.metrics.loginPlans = actions.filter((action) => action.type === 'loginBot').length;
    this.metrics.logoutPlans = actions.filter((action) => action.type === 'logoutBot').length;
    this.metrics.provisionPlans = actions.filter((action) => action.type === 'provisionBot').length;
    this.metrics.lastRunReason = humans.length === 0
      ? 'no_humans_online'
      : this.metrics.assignedBots >= this.metrics.desiredBots
        ? 'clusters_satisfied'
        : 'provision_or_login_required';
    return actions;
  }

  private buildClusters(humans: readonly AmbientHumanPresence[]): WorkingCluster[] {
    const clusters: WorkingCluster[] = [];
    for (const human of humans) {
      let found: WorkingCluster | null = null;
      for (const cluster of clusters) {
        if (cluster.zoneId !== human.zoneId) continue;
        if (distSq(cluster.centerX, cluster.centerZ, human.x, human.z) > this.config.clusterRadius ** 2) continue;
        found = cluster;
        break;
      }
      if (!found) {
        clusters.push({
          clusterId: `${human.zoneId}:${human.characterId}`,
          zoneId: human.zoneId,
          centerX: human.x,
          centerZ: human.z,
          members: [human],
          levelTotal: human.level,
          desiredBots: 0,
        });
        continue;
      }
      found.members.push(human);
      found.levelTotal += human.level;
      found.centerX = found.members.reduce((sum, member) => sum + member.x, 0) / found.members.length;
      found.centerZ = found.members.reduce((sum, member) => sum + member.z, 0) / found.members.length;
    }
    for (const cluster of clusters) {
      cluster.desiredBots = Math.min(
        this.config.maxBotsPerCluster,
        this.config.soloTargetBots
          + this.config.extraBotsPerAdditionalPlayer * Math.max(0, cluster.members.length - 1),
      );
    }
    return clusters.sort((a, b) => a.clusterId.localeCompare(b.clusterId));
  }

  private sortedDirectory(): AmbientPlayerBotRecord[] {
    return [...this.directory.values()].sort((a, b) => a.botId.localeCompare(b.botId));
  }

  private matchExistingBots(
    cluster: WorkingCluster,
    nowMs: number,
  ): AmbientPlayerBotRecord[] {
    return this.sortedDirectory()
      .filter((bot) => this.isEligibleForAssignment(bot, nowMs))
      .map((bot) => ({ bot, score: scoreBotForCluster(bot, cluster) }))
      .filter((entry) => entry.score > Number.NEGATIVE_INFINITY)
      .sort((a, b) => b.score - a.score || a.bot.botId.localeCompare(b.bot.botId))
      .map((entry) => entry.bot);
  }

  private pickProvisionProfiles(
    cluster: WorkingCluster,
    shortage: number,
    existingClasses: ReadonlySet<AmbientPlayerBotRecord['class']>,
  ): AmbientBotProfile[] {
    const scored = this.profiles
      .map((profile) => ({ profile, score: scoreProfileForCluster(profile, cluster, existingClasses) }))
      .sort((a, b) => b.score - a.score || a.profile.profileId.localeCompare(b.profile.profileId));
    const picks: AmbientBotProfile[] = [];
    const usedClasses = new Set(existingClasses);
    for (const entry of scored) {
      if (picks.length >= shortage || picks.length >= this.config.maxProvisionPerTick) break;
      if (usedClasses.has(entry.profile.class)) continue;
      picks.push(entry.profile);
      usedClasses.add(entry.profile.class);
    }
    if (picks.length >= shortage || picks.length >= this.config.maxProvisionPerTick) return picks;
    for (const entry of scored) {
      if (picks.length >= shortage || picks.length >= this.config.maxProvisionPerTick) break;
      if (picks.some((pick) => pick.profileId === entry.profile.profileId)) continue;
      picks.push(entry.profile);
    }
    return picks;
  }

  private isEligibleForAssignment(bot: AmbientPlayerBotRecord, nowMs: number): boolean {
    if (bot.provisionState !== 'ready') return false;
    if (bot.assignedClusterId !== null) return false;
    if (bot.lifecycleStatus === 'retired') return false;
    if (bot.lifecycleStatus === 'reserved' && (bot.reservationUntilMs ?? 0) > nowMs) return false;
    if (bot.lifecycleStatus === 'cooldown' && (bot.cooldownUntilMs ?? 0) > nowMs) return false;
    return true;
  }

  private shouldReleaseBot(bot: AmbientPlayerBotRecord, cluster: WorkingCluster): boolean {
    if (bot.lastKnownZoneId && bot.lastKnownZoneId !== cluster.zoneId) return true;
    if (bot.lastKnownX === null || bot.lastKnownZ === null) return false;
    return distSq(bot.lastKnownX, bot.lastKnownZ, cluster.centerX, cluster.centerZ) > this.config.releaseRadius ** 2;
  }

  private releaseBot(bot: AmbientPlayerBotRecord, nowMs: number): void {
    bot.assignedClusterId = null;
    bot.assignedPlayerCharacterId = null;
    bot.reservationUntilMs = null;
    if (bot.lifecycleStatus !== 'retired') {
      bot.lifecycleStatus = 'cooldown';
      bot.cooldownUntilMs = nowMs + this.config.cooldownMs;
    }
  }

  private sweepExpirations(nowMs: number): void {
    for (const bot of this.directory.values()) {
      if (bot.lifecycleStatus === 'reserved' && (bot.reservationUntilMs ?? 0) <= nowMs) {
        bot.lifecycleStatus = 'ready';
        bot.assignedClusterId = null;
        bot.assignedPlayerCharacterId = null;
        bot.reservationUntilMs = null;
      }
      if (bot.lifecycleStatus === 'cooldown' && (bot.cooldownUntilMs ?? 0) <= nowMs) {
        bot.lifecycleStatus = 'ready';
        bot.cooldownUntilMs = null;
      }
    }
    for (let i = this.pendingProvisionSlots.length - 1; i >= 0; i--) {
      if (this.pendingProvisionSlots[i].expiresAtMs <= nowMs) this.pendingProvisionSlots.splice(i, 1);
    }
  }

  private pushRecentAction(action: AmbientBotPlanAction, atMs: number): void {
    this.recentActions.unshift({ ...cloneAction(action), atMs });
    if (this.recentActions.length > this.config.recentActionLimit) {
      this.recentActions.length = this.config.recentActionLimit;
    }
  }

  private directorySnapshot(): AmbientPlayerBotDirectorySnapshot {
    const snapshot: AmbientPlayerBotDirectorySnapshot = {
      total: this.directory.size,
      ready: 0,
      reserved: 0,
      online: 0,
      cooldown: 0,
      retired: 0,
      provisionPending: this.pendingProvisionSlots.length,
      assigned: 0,
    };
    for (const bot of this.directory.values()) {
      if (bot.assignedClusterId) snapshot.assigned++;
      switch (bot.lifecycleStatus) {
        case 'ready':
          snapshot.ready++;
          break;
        case 'reserved':
          snapshot.reserved++;
          break;
        case 'online':
          snapshot.online++;
          break;
        case 'cooldown':
          snapshot.cooldown++;
          break;
        case 'retired':
          snapshot.retired++;
          break;
      }
    }
    return snapshot;
  }
}

function cloneRecord(record: AmbientPlayerBotRecord): AmbientPlayerBotRecord {
  return {
    ...record,
    levelBand: { ...record.levelBand },
    preferredZoneIds: [...record.preferredZoneIds],
    plannerState: { ...record.plannerState },
    socialState: { ...record.socialState },
  };
}

function cloneAction(action: AmbientBotPlanAction): AmbientBotPlanAction {
  return { ...action };
}

function compareHumans(a: AmbientHumanPresence, b: AmbientHumanPresence): number {
  return a.zoneId.localeCompare(b.zoneId)
    || a.x - b.x
    || a.z - b.z
    || a.characterId - b.characterId;
}

function scoreBotForCluster(
  bot: AmbientPlayerBotRecord,
  cluster: WorkingCluster,
): number {
  if (bot.provisionState !== 'ready') return Number.NEGATIVE_INFINITY;
  if (bot.lifecycleStatus === 'retired') return Number.NEGATIVE_INFINITY;
  const avgLevel = cluster.levelTotal / Math.max(1, cluster.members.length);
  let score = 0;
  if (bot.preferredZoneIds.includes(cluster.zoneId)) score += 60;
  else if (bot.preferredZoneIds.length === 0) score += 10;
  else score -= 20;
  if (bot.lastKnownZoneId === cluster.zoneId) score += 25;
  const levelDelta = distanceFromRange(avgLevel, bot.levelBand.min, bot.levelBand.max);
  score += 40 - levelDelta * 5;
  if (bot.accountId !== null && bot.characterId !== null) score += 10;
  if (bot.lifecycleStatus === 'ready') score += 10;
  if (bot.lifecycleStatus === 'online') score += 5;
  return score;
}

function scoreProfileForCluster(
  profile: AmbientBotProfile,
  cluster: WorkingCluster,
  existingClasses: ReadonlySet<AmbientPlayerBotRecord['class']>,
): number {
  const avgLevel = cluster.levelTotal / Math.max(1, cluster.members.length);
  let score = 0;
  if (profile.preferredZoneIds.includes(cluster.zoneId)) score += 70;
  else if (profile.preferredZoneIds.length === 0) score += 15;
  else score -= 15;
  score += 45 - distanceFromRange(avgLevel, profile.levelBand.min, profile.levelBand.max) * 5;
  if (!existingClasses.has(profile.class)) score += 12;
  if (profile.archetype === 'newcomer' && avgLevel <= 7) score += 6;
  if (profile.archetype === 'traveler' && cluster.members.length >= 2) score += 3;
  return score;
}

function distanceFromRange(value: number, min: number, max: number): number {
  if (value < min) return min - value;
  if (value > max) return value - max;
  return 0;
}

function pushMapValue(map: Map<string, string[]>, key: string, value: string): void {
  const current = map.get(key);
  if (current) current.push(value);
  else map.set(key, [value]);
}

function pushClass(
  map: Map<string, Set<AmbientPlayerBotRecord['class']>>,
  key: string,
  value: AmbientPlayerBotRecord['class'],
): void {
  const current = map.get(key);
  if (current) current.add(value);
  else map.set(key, new Set([value]));
}

function distSq(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
