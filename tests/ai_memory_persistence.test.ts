import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { groundHeight } from '../src/sim/world';
import type { AiDecisionV1, AiJobContextV1, AiMemoryAuditRecord } from '../server/ai/ai_types';
import { cloneMemoryAudit } from '../server/ai/memory_audit';
import { AiLifeLayer, type AiMemoryPersistence } from '../server/ai/life_layer';
import type { AiProvider } from '../server/ai/ai_types';

class FakeMemoryDb implements AiMemoryPersistence {
  saved: AiMemoryAuditRecord[][] = [];
  loaded: AiMemoryAuditRecord[] = [];
  failSave = false;
  failPrune = false;
  pruneCount = 0;
  pruneCalls: { nowSeconds: number; batchSize?: number }[] = [];
  private blockPrune = false;
  private pruneResolvers: (() => void)[] = [];

  async saveRecords(records: readonly AiMemoryAuditRecord[]): Promise<void> {
    if (this.failSave) throw new Error('memory db offline');
    this.saved.push(records.map(cloneMemoryAudit));
  }

  async loadRecords(): Promise<AiMemoryAuditRecord[]> {
    return this.loaded.map(cloneMemoryAudit);
  }

  async pruneExpired(nowSeconds: number, batchSize?: number): Promise<number> {
    this.pruneCalls.push({ nowSeconds, batchSize });
    if (this.blockPrune) {
      await new Promise<void>((resolve) => this.pruneResolvers.push(resolve));
    }
    if (this.failPrune) throw new Error('memory prune offline');
    return this.pruneCount;
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
