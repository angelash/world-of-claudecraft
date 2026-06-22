import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { groundHeight } from '../src/sim/world';
import type { AiDecisionV1, AiJobContextV1, AiMemoryAuditRecord } from '../server/ai/ai_types';
import { cloneMemoryAudit } from '../server/ai/memory_audit';
import { AiLifeLayer, type AiMemoryPersistence, type AiMemoryPersistenceQuery } from '../server/ai/life_layer';
import type { AiProvider } from '../server/ai/ai_types';

class FakeMemoryDb implements AiMemoryPersistence {
  saved: AiMemoryAuditRecord[][] = [];
  loaded: AiMemoryAuditRecord[] = [];
  loadCalls: AiMemoryPersistenceQuery[] = [];
  failSave = false;
  failPrune = false;
  failClear = false;
  pruneCount = 0;
  pruneCalls: { nowSeconds: number; batchSize?: number }[] = [];
  clearCount = 0;
  clearCalls = 0;
  private blockPrune = false;
  private pruneResolvers: (() => void)[] = [];

  async saveRecords(records: readonly AiMemoryAuditRecord[]): Promise<void> {
    if (this.failSave) throw new Error('memory db offline');
    this.saved.push(records.map(cloneMemoryAudit));
  }

  async loadRecords(query: AiMemoryPersistenceQuery): Promise<AiMemoryAuditRecord[]> {
    this.loadCalls.push({ ...query });
    const sceneId = query.sceneId ?? '';
    const zoneId = query.zoneId ?? '';
    const kinds = query.kinds && query.kinds.length > 0 ? new Set(query.kinds) : null;
    const limit = Math.max(1, Math.min(100, Math.floor(query.limit ?? 20)));
    return this.loaded
      .filter((record) => {
        if (record.sourcePlayerEntityId !== query.sourcePlayerEntityId) return false;
        if (kinds && !kinds.has(record.kind)) return false;
        if (record.expiresAt !== undefined && record.expiresAt <= query.nowSeconds) return false;
        if (!sceneId && !zoneId) return true;
        if (sceneId && record.sceneId === sceneId) return true;
        return Boolean(zoneId && record.scope === 'region' && record.zoneId === zoneId);
      })
      .sort((a, b) => b.salience - a.salience || (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, limit)
      .map(cloneMemoryAudit);
  }

  async pruneExpired(nowSeconds: number, batchSize?: number): Promise<number> {
    this.pruneCalls.push({ nowSeconds, batchSize });
    if (this.blockPrune) {
      await new Promise<void>((resolve) => this.pruneResolvers.push(resolve));
    }
    if (this.failPrune) throw new Error('memory prune offline');
    return this.pruneCount;
  }

  async clearRecords(): Promise<number> {
    this.clearCalls++;
    if (this.failClear) throw new Error('memory clear offline');
    this.saved = [];
    this.loaded = [];
    return this.clearCount;
  }

  holdPrune(): void {
    this.blockPrune = true;
  }

  releasePrune(): void {
    this.blockPrune = false;
    this.pruneResolvers.splice(0).forEach((resolve) => resolve());
  }
}

function teleportNear(sim: Sim, pid: number, targetId: number): void {
  const player = sim.entities.get(pid)!;
  const target = sim.entities.get(targetId)!;
  player.pos.x = target.pos.x + 1;
  player.pos.z = target.pos.z;
  player.pos.y = groundHeight(player.pos.x, player.pos.z, sim.cfg.seed);
  player.prevPos = { ...player.pos };
  sim.grid.update(player);
  sim.playerGrid.update(player);
}

function makeSim(): { sim: Sim; pid: number; npcId: number; wolfId: number } {
  const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
  const pid = sim.addPlayer('warrior', 'Ari');
  const npc = [...sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric')!;
  const wolf = [...sim.entities.values()].find((entity) => entity.templateId === 'forest_wolf')!;
  teleportNear(sim, pid, npc.id);
  return { sim, pid, npcId: npc.id, wolfId: wolf.id };
}

const persistedSignal: AiMemoryAuditRecord = {
  kind: 'rumor',
  refId: 'persisted-rumor-1',
  scope: 'region',
  sceneId: 'eastbrook_forge',
  zoneId: 'eastbrook_vale',
  sourcePlayerEntityId: 1,
  itemId: 'redbrook_blade',
  subjectKind: 'item',
  lineIds: ['hudChrome.aiSpeech.itemInterestInspect'],
  salience: 0.8,
  createdAt: 3,
  expiresAt: 90,
  reason: 'persistedFixture',
};

function persistedDirectorSignal(playerEntityId: number): AiMemoryAuditRecord {
  return {
    kind: 'worldDirectorState',
    refId: 'persisted-director-covetous',
    scope: 'region',
    sceneId: 'eastbrook_forge',
    zoneId: 'eastbrook_vale',
    sourcePlayerEntityId: playerEntityId,
    itemId: 'redbrook_blade',
    subjectKind: 'item',
    lineIds: ['hudChrome.aiSpeech.worldDirectorCovetous'],
    salience: 0.72,
    createdAt: 12,
    expiresAt: 160,
    reason: 'persistedRestart:covetous:npcTopicShift',
  };
}

function aiSpeechLineIds(events: readonly unknown[]): string[] {
  return events
    .map((event) => {
      if (!event || typeof event !== 'object') return null;
      const speech = (event as { type?: string; speech?: { mode?: string; lineId?: string } }).speech;
      return (event as { type?: string }).type === 'aiSpeech' && speech?.mode === 'lineId'
        ? speech.lineId ?? null
        : null;
    })
    .filter((lineId): lineId is string => lineId !== null);
}

describe('AI memory persistence integration', () => {
  it('persists item-discard memory writes without delaying local AI speech delivery', async () => {
    const { sim, pid, wolfId } = makeSim();
    teleportNear(sim, pid, wolfId);
    const db = new FakeMemoryDb();
    const layer = new AiLifeLayer({ enabled: true, memoryDb: db });
    const delivered: unknown[] = [];

    layer.handleItemDiscarded({ sim, pid, itemId: 'roasted_boar', count: 1, deliver: (events) => delivered.push(...events) });
    expect(delivered).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.itemInterestApproach' }),
    }));

    await layer.flushMemoryWrites();

    const saved = db.saved.flat();
    expect(saved).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'worldTrace', itemId: 'roasted_boar' }),
      expect.objectContaining({ kind: 'worldDirectorState', itemId: 'roasted_boar' }),
      expect.objectContaining({ kind: 'rumor', itemId: 'roasted_boar' }),
    ]));
    expect(layer.memoryPersistenceDiagnostics()).toMatchObject({ pending: 0, errors: [] });
    expect(layer.runtimeMetrics()).toMatchObject({
      localReactions: 1,
      memoryWritesQueued: 3,
      memoryFlushFailures: 0,
    });
  });

  it('feeds persisted memory signals into Codex job context for NPC interactions', async () => {
    const { sim, pid, npcId } = makeSim();
    const db = new FakeMemoryDb();
    db.loaded = [persistedSignal];
    const provider: AiProvider = {
      async decide(context: AiJobContextV1): Promise<AiDecisionV1> {
        expect(context.memorySignals).toContainEqual(expect.objectContaining({
          kind: 'rumor',
          refId: 'persisted-rumor-1',
          reason: 'persistedFixture',
        }));
        return {
          schemaVersion: 1,
          jobId: context.jobId,
          entityRef: { kind: context.entity.kind, entityId: context.entity.entityId, templateId: context.entity.templateId },
          ttlMs: 5000,
          confidence: 1,
          speech: [{ mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }],
          intents: [{ type: 'commentOnScene' }],
          audit: { shortReason: 'uses persisted memory signal', usedPlayerInput: false, safetyNotes: [] },
        };
      },
    };
    const layer = new AiLifeLayer({ enabled: true, provider, memoryDb: db });

    await layer.handleNpcInteraction({ sim, pid, npcId, locale: 'en', deliver: () => {} });
    await layer.flushMemoryWrites();

    expect(db.saved.flat()).toContainEqual(expect.objectContaining({ kind: 'npcInteraction' }));
  });

  it('feeds persisted director signals into object inspection context after a fresh life layer starts', async () => {
    const { sim, pid } = makeSim();
    const object = [...sim.entities.values()].find((entity) => entity.kind === 'object' && entity.objectItemId === 'gravecaller_sigil')!;
    teleportNear(sim, pid, object.id);
    const db = new FakeMemoryDb();
    db.loaded = [
      persistedDirectorSignal(pid),
      { ...persistedDirectorSignal(pid + 1), refId: 'other-player-director', sourcePlayerEntityId: pid + 1 },
      { ...persistedDirectorSignal(pid), refId: 'expired-director', expiresAt: 0, salience: 1 },
    ];
    const calls: AiJobContextV1[] = [];
    const provider: AiProvider = {
      async decide(context: AiJobContextV1): Promise<AiDecisionV1> {
        calls.push(context);
        expect(context.memorySignals).toContainEqual(expect.objectContaining({
          kind: 'worldDirectorState',
          refId: 'persisted-director-covetous',
          itemId: 'redbrook_blade',
        }));
        expect(context.memorySignals?.some((signal) => signal.refId === 'other-player-director')).toBe(false);
        expect(context.memorySignals?.some((signal) => signal.refId === 'expired-director')).toBe(false);
        expect(context.recentObservations).toContain('persistedMemory:worldDirectorState:region:redbrook_blade');
        expect(context.directorProposals).toContainEqual(expect.objectContaining({
          proposalId: 'persisted-director-covetous:persisted-proposal',
          intent: 'nudgeNpcRumor',
          targetRef: 'redbrook_blade',
          suggestedLineId: 'hudChrome.aiSpeech.worldDirectorCovetous',
          safetyNotes: expect.arrayContaining(['presentationOnly', 'noQuestMutation']),
        }));
        return {
          schemaVersion: 1,
          jobId: context.jobId,
          entityRef: { kind: context.entity.kind, entityId: context.entity.entityId, templateId: context.entity.templateId },
          ttlMs: 5000,
          confidence: 1,
          speech: [{ mode: 'lineId', lineId: 'hudChrome.aiSpeech.objectInspectGrave' }],
          intents: [{ type: 'inspectObject', lineId: 'hudChrome.aiSpeech.objectInspectGrave' }],
          audit: { shortReason: 'uses restored director memory', usedPlayerInput: false, safetyNotes: [] },
        };
      },
    };
    const layer = new AiLifeLayer({ enabled: true, provider, memoryDb: db });
    const delivered: unknown[] = [];
    const beforeQuestLog = JSON.stringify([...sim.meta(pid)!.questLog]);
    const beforeDone = JSON.stringify([...sim.meta(pid)!.questsDone]);

    await layer.handleObjectInspection({ sim, pid, objectId: object.id, locale: 'en', deliver: (events) => delivered.push(...events) });

    expect(calls).toHaveLength(1);
    expect(db.loadCalls).toContainEqual(expect.objectContaining({
      sourcePlayerEntityId: pid,
      zoneId: 'eastbrook_vale',
      limit: 8,
    }));
    expect(delivered).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speakerId: object.id,
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.objectInspectGrave' }),
    }));
    expect(JSON.stringify([...sim.meta(pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...sim.meta(pid)!.questsDone])).toBe(beforeDone);
  });

  it('restores persisted director region echoes during scene inspection without active in-memory director state', async () => {
    const { sim, pid, npcId } = makeSim();
    teleportNear(sim, pid, npcId);
    const db = new FakeMemoryDb();
    db.loaded = [persistedDirectorSignal(pid)];
    const layer = new AiLifeLayer({ enabled: true, memoryDb: db });
    const delivered: unknown[] = [];
    const beforeQuestLog = JSON.stringify([...sim.meta(pid)!.questLog]);
    const beforeDone = JSON.stringify([...sim.meta(pid)!.questsDone]);

    await layer.handleSceneInspection({ sim, pid, locale: 'en', deliver: (events) => delivered.push(...events) });

    expect(delivered).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speakerId: pid,
      speech: expect.objectContaining({
        lineId: 'hudChrome.aiSpeech.worldDirectorCovetous',
        values: expect.objectContaining({
          itemId: 'redbrook_blade',
          directorMood: 'covetous',
          directorHeat: 72,
        }),
      }),
      reaction: expect.objectContaining({
        kind: 'inspect',
        targetItemId: 'redbrook_blade',
        sceneTags: expect.arrayContaining(['director:covetous', 'persistedMemory']),
      }),
      pid,
    }));
    expect(layer.diagnostics()).toContainEqual(expect.objectContaining({
      status: 'local_reaction',
      intents: expect.arrayContaining(['readPersistedWorldDirectorState']),
    }));
    expect(JSON.stringify([...sim.meta(pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...sim.meta(pid)!.questsDone])).toBe(beforeDone);
  });

  it('keeps gameplay feedback flowing when persistence is temporarily unavailable', async () => {
    const { sim, pid, wolfId } = makeSim();
    teleportNear(sim, pid, wolfId);
    const db = new FakeMemoryDb();
    db.failSave = true;
    const layer = new AiLifeLayer({ enabled: true, memoryDb: db });
    const delivered: unknown[] = [];

    layer.handleItemDiscarded({ sim, pid, itemId: 'roasted_boar', count: 1, deliver: (events) => delivered.push(...events) });
    await layer.flushMemoryWrites();

    expect(delivered.length).toBeGreaterThan(0);
    expect(layer.memoryPersistenceDiagnostics()).toMatchObject({
      pending: expect.any(Number),
      errors: ['memory db offline'],
    });
    expect(layer.memoryPersistenceDiagnostics().pending).toBeGreaterThan(0);
    expect(layer.runtimeMetrics()).toMatchObject({
      localReactions: 1,
      memoryWritesQueued: 3,
      memoryFlushFailures: 1,
      lastMemoryPersistenceError: 'memory db offline',
    });
  });

  it('prunes expired persisted records with bounded overlap diagnostics', async () => {
    const db = new FakeMemoryDb();
    db.pruneCount = 7;
    const layer = new AiLifeLayer({ enabled: true, memoryDb: db });

    await expect(layer.pruneExpiredMemory(123, 25)).resolves.toBe(7);

    expect(db.pruneCalls).toEqual([{ nowSeconds: 123, batchSize: 25 }]);
    expect(layer.memoryPersistenceDiagnostics()).toMatchObject({
      pruning: false,
      lastPruneDeleted: 7,
      errors: [],
    });
    expect(layer.runtimeMetrics()).toMatchObject({
      memoryPruneRuns: 1,
      memoryPruneDeleted: 7,
      memoryPruneFailures: 0,
      lastMemoryPruneDeleted: 7,
    });
  });

  it('coalesces overlapping prune attempts into one database call', async () => {
    const db = new FakeMemoryDb();
    db.pruneCount = 3;
    db.holdPrune();
    const layer = new AiLifeLayer({ enabled: true, memoryDb: db });

    const first = layer.pruneExpiredMemory(200, 50);
    const second = layer.pruneExpiredMemory(250, 50);
    await Promise.resolve();

    expect(db.pruneCalls).toEqual([{ nowSeconds: 200, batchSize: 50 }]);
    expect(layer.memoryPersistenceDiagnostics()).toMatchObject({ pruning: true });

    db.releasePrune();
    await expect(first).resolves.toBe(3);
    await expect(second).resolves.toBe(3);

    expect(db.pruneCalls).toHaveLength(1);
    expect(layer.memoryPersistenceDiagnostics()).toMatchObject({ pruning: false });
    expect(layer.runtimeMetrics()).toMatchObject({
      memoryPruneRuns: 1,
      memoryPruneDeleted: 3,
      memoryPruneFailures: 0,
    });
  });

  it('clears volatile overlays and persisted audit records as one admin memory operation', async () => {
    const { sim, pid, wolfId } = makeSim();
    teleportNear(sim, pid, wolfId);
    const db = new FakeMemoryDb();
    db.clearCount = 4;
    const layer = new AiLifeLayer({ enabled: true, memoryDb: db });
    const delivered: unknown[] = [];

    layer.handleItemDiscarded({ sim, pid, itemId: 'roasted_boar', count: 1, deliver: (events) => delivered.push(...events) });
    await layer.flushMemoryWrites();

    expect(delivered.length).toBeGreaterThan(0);
    expect(layer.memoryDiagnostics().rumors.length).toBeGreaterThan(0);
    const result = await layer.clearMemory(sim.time);

    expect(db.clearCalls).toBe(1);
    expect(result.persistedMemoryRecords).toBe(4);
    expect(result.rumors).toBeGreaterThan(0);
    expect(result.worldTraces).toBeGreaterThan(0);
    expect(result.worldDirectorStates).toBeGreaterThan(0);
    expect(result.totalCleared).toBeGreaterThanOrEqual(result.persistedMemoryRecords + result.rumors + result.worldTraces + result.worldDirectorStates);
    expect(layer.memoryDiagnostics()).toEqual({ npcMemories: [], rumors: [] });
    expect(layer.worldTraceDiagnostics()).toEqual([]);
    expect(layer.worldDirectorDiagnostics()).toEqual([]);
    expect(layer.diagnostics()).toEqual([]);
    expect(layer.memoryPersistenceDiagnostics()).toMatchObject({ pending: 0, errors: [] });
  });

  it('prevents restart-style persisted memory echoes after an admin clear', async () => {
    const { sim, pid, wolfId } = makeSim();
    teleportNear(sim, pid, wolfId);
    const db = new FakeMemoryDb();
    const firstLayer = new AiLifeLayer({ enabled: true, memoryDb: db });
    const discardedEvents: unknown[] = [];

    firstLayer.handleItemDiscarded({ sim, pid, itemId: 'roasted_boar', count: 1, deliver: (events) => discardedEvents.push(...events) });
    await firstLayer.flushMemoryWrites();
    db.loaded = db.saved.flat().map(cloneMemoryAudit);

    const restartedLayer = new AiLifeLayer({ enabled: true, memoryDb: db });
    const beforeQuestLog = JSON.stringify([...sim.meta(pid)!.questLog]);
    const beforeDone = JSON.stringify([...sim.meta(pid)!.questsDone]);
    const restoredEvents: unknown[] = [];
    await restartedLayer.handleSceneInspection({ sim, pid, locale: 'en', deliver: (events) => restoredEvents.push(...events) });

    expect(discardedEvents.length).toBeGreaterThan(0);
    expect(aiSpeechLineIds(restoredEvents)).toContain('hudChrome.aiSpeech.worldDirectorHungry');
    expect(JSON.stringify([...sim.meta(pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...sim.meta(pid)!.questsDone])).toBe(beforeDone);

    db.clearCount = db.loaded.length;
    const clearResult = await restartedLayer.clearMemory(sim.time);
    expect(clearResult.persistedMemoryRecords).toBeGreaterThan(0);

    const clearedRestartLayer = new AiLifeLayer({ enabled: true, memoryDb: db });
    const afterClearEvents: unknown[] = [];
    await clearedRestartLayer.handleSceneInspection({ sim, pid, locale: 'en', deliver: (events) => afterClearEvents.push(...events) });

    expect(aiSpeechLineIds(afterClearEvents)).not.toContain('hudChrome.aiSpeech.worldDirectorHungry');
    expect(JSON.stringify([...sim.meta(pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...sim.meta(pid)!.questsDone])).toBe(beforeDone);
  });

  it('surfaces persisted clear failures instead of claiming restart-safe memory removal', async () => {
    const db = new FakeMemoryDb();
    db.failClear = true;
    const layer = new AiLifeLayer({ enabled: true, memoryDb: db });

    await expect(layer.clearMemory(10)).rejects.toThrow('memory clear offline');

    expect(db.clearCalls).toBe(1);
    expect(layer.memoryPersistenceDiagnostics().errors[0]).toBe('memory clear offline');
    expect(layer.runtimeMetrics()).toMatchObject({
      lastMemoryPersistenceError: 'memory clear offline',
    });
  });

  it('records prune failures without throwing or dropping queued writes', async () => {
    const { sim, pid, wolfId } = makeSim();
    teleportNear(sim, pid, wolfId);
    const db = new FakeMemoryDb();
    db.failSave = true;
    db.failPrune = true;
    const layer = new AiLifeLayer({ enabled: true, memoryDb: db });
    layer.handleItemDiscarded({ sim, pid, itemId: 'roasted_boar', count: 1, deliver: () => {} });

    await expect(layer.pruneExpiredMemory(500, 100)).resolves.toBe(0);
    await layer.flushMemoryWrites();

    const diagnostics = layer.memoryPersistenceDiagnostics();
    expect(diagnostics).toMatchObject({
      pending: expect.any(Number),
      pruning: false,
    });
    expect(diagnostics.errors.slice(0, 2)).toEqual(['memory db offline', 'memory prune offline']);
    expect(layer.memoryPersistenceDiagnostics().pending).toBeGreaterThan(0);
    const metrics = layer.runtimeMetrics();
    expect(metrics).toMatchObject({
      memoryPruneFailures: 1,
      lastMemoryPruneError: 'memory prune offline',
      lastMemoryPersistenceError: 'memory db offline',
    });
    expect(metrics.memoryFlushFailures).toBeGreaterThanOrEqual(1);
  });
});
