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

  async saveRecords(records: readonly AiMemoryAuditRecord[]): Promise<void> {
    if (this.failSave) throw new Error('memory db offline');
    this.saved.push(records.map(cloneMemoryAudit));
  }

  async loadRecords(): Promise<AiMemoryAuditRecord[]> {
    return this.loaded.map(cloneMemoryAudit);
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
});
