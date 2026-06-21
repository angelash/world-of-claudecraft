import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { Sim } from '../src/sim/sim';
import { groundHeight } from '../src/sim/world';
import type { AiMemoryAuditRecord } from '../server/ai/ai_types';
import type { SimEvent } from '../src/sim/types';

type AiMemoryDbModule = typeof import('../server/ai_memory_db');
type LifeLayerModule = typeof import('../server/ai/life_layer');

const LONGRUN_ENABLED = process.env.AI_MEMORY_PG_LONGRUN === '1';
const describeLongrun = LONGRUN_ENABLED ? describe : describe.skip;

let previousRealmName: string | undefined;
let pool: Pool | null = null;
let realm = '';
let PgAiMemoryDb: AiMemoryDbModule['PgAiMemoryDb'];
let AiLifeLayer: LifeLayerModule['AiLifeLayer'];
let db: InstanceType<AiMemoryDbModule['PgAiMemoryDb']>;

function loadEnvFiles(): void {
  try {
    process.loadEnvFile?.();
  } catch {
    // The long-run test can be driven entirely by the ambient env.
  }
  try {
    process.loadEnvFile?.('.env.local');
  } catch {
    // Optional local override.
  }
}

function makeRealmName(): string {
  const suffix = Date.now().toString(36).slice(-8);
  return `AiPg${suffix}`;
}

function teleport(sim: Sim, pid: number, x: number, z: number): void {
  const player = sim.entities.get(pid);
  if (!player) throw new Error(`missing player ${pid}`);
  player.pos.x = x;
  player.pos.z = z;
  player.pos.y = groundHeight(x, z, sim.cfg.seed);
  player.prevPos = { ...player.pos };
  sim.grid.update(player);
  sim.playerGrid.update(player);
}

function teleportNearTemplate(sim: Sim, pid: number, templateId: string): void {
  const target = [...sim.entities.values()].find((entity) => entity.templateId === templateId);
  if (!target) throw new Error(`missing template ${templateId}`);
  teleport(sim, pid, target.pos.x + 1, target.pos.z);
}

function advance(sim: Sim, seconds: number): void {
  for (let i = 0; i < seconds * 20; i++) sim.tick();
}

function questState(sim: Sim, pid: number): string {
  const meta = sim.meta(pid);
  if (!meta) throw new Error(`missing meta for ${pid}`);
  return JSON.stringify({
    log: [...meta.questLog],
    done: [...meta.questsDone],
  });
}

function aiSpeechLineIds(events: readonly unknown[]): string[] {
  return events
    .map((event) => {
      if (!event || typeof event !== 'object') return null;
      const candidate = event as { type?: string; speech?: { mode?: string; lineId?: string } };
      return candidate.type === 'aiSpeech' && candidate.speech?.mode === 'lineId'
        ? candidate.speech.lineId ?? null
        : null;
    })
    .filter((lineId): lineId is string => lineId !== null);
}

async function realmRowCount(kind?: AiMemoryAuditRecord['kind']): Promise<number> {
  if (!pool) throw new Error('Postgres pool not initialized');
  const res = kind
    ? await pool.query('SELECT COUNT(*)::int AS count FROM ai_memory_records WHERE realm = $1 AND kind = $2', [realm, kind])
    : await pool.query('SELECT COUNT(*)::int AS count FROM ai_memory_records WHERE realm = $1', [realm]);
  return Number(res.rows[0]?.count ?? 0);
}

async function discardAndFlush(input: {
  layer: InstanceType<LifeLayerModule['AiLifeLayer']>;
  sim: Sim;
  pid: number;
  itemId: string;
  delivered: SimEvent[];
}): Promise<void> {
  await input.layer.handleItemDiscarded({
    sim: input.sim,
    pid: input.pid,
    itemId: input.itemId,
    count: 1,
    deliver: (events) => input.delivered.push(...events),
  });
  await input.layer.flushMemoryWrites();
}

describeLongrun('AI memory real Postgres long-run', () => {
  beforeAll(async () => {
    loadEnvFiles();
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required when AI_MEMORY_PG_LONGRUN=1');
    }

    previousRealmName = process.env.REALM_NAME;
    process.env.REALM_NAME = makeRealmName();
    await vi.resetModules();

    const dbModule = await import('../server/ai_memory_db');
    const lifeLayerModule = await import('../server/ai/life_layer');
    const realmModule = await import('../server/realm');
    PgAiMemoryDb = dbModule.PgAiMemoryDb;
    AiLifeLayer = lifeLayerModule.AiLifeLayer;
    realm = realmModule.REALM;

    pool = new Pool({ connectionString: databaseUrl, max: 2 });
    await pool.query(dbModule.AI_MEMORY_SCHEMA);
    await pool.query('DELETE FROM ai_memory_records WHERE realm = $1', [realm]);
    db = new PgAiMemoryDb(pool);
  }, 60_000);

  afterAll(async () => {
    try {
      if (pool && realm) await pool.query('DELETE FROM ai_memory_records WHERE realm = $1', [realm]);
    } finally {
      await pool?.end();
      pool = null;
      if (previousRealmName === undefined) delete process.env.REALM_NAME;
      else process.env.REALM_NAME = previousRealmName;
      await vi.resetModules();
    }
  }, 60_000);

  it('round-trips living-world memory across players, zones, restarts, pruning, clear, and disabled fallback', async () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const playerOne = sim.addPlayer('warrior', 'Ari');
    const playerTwo = sim.addPlayer('mage', 'Bryn');
    teleportNearTemplate(sim, playerOne, 'forest_wolf');
    teleport(sim, playerTwo, 0, 300);

    const beforePlayerOneQuestState = questState(sim, playerOne);
    const beforePlayerTwoQuestState = questState(sim, playerTwo);
    const disabled = new AiLifeLayer({ enabled: false, memoryDb: db });
    const disabledEvents: SimEvent[] = [];

    await discardAndFlush({
      layer: disabled,
      sim,
      pid: playerOne,
      itemId: 'roasted_boar',
      delivered: disabledEvents,
    });

    expect(disabledEvents).toEqual([]);
    expect(await realmRowCount()).toBe(0);

    const active = new AiLifeLayer({ enabled: true, memoryDb: db, memoryPersistBatchSize: 2 });
    const playerOneEvents: SimEvent[] = [];
    await discardAndFlush({
      layer: active,
      sim,
      pid: playerOne,
      itemId: 'roasted_boar',
      delivered: playerOneEvents,
    });
    expect(playerOneEvents.length).toBeGreaterThan(0);
    expect(aiSpeechLineIds(playerOneEvents)).toContain('hudChrome.aiSpeech.itemInterestApproach');
    advance(sim, 2);

    const playerTwoEvents: SimEvent[] = [];
    await discardAndFlush({
      layer: active,
      sim,
      pid: playerTwo,
      itemId: 'gravecaller_sigil',
      delivered: playerTwoEvents,
    });
    await active.flushMemoryWrites();
    advance(sim, 2);

    expect(await realmRowCount()).toBeGreaterThanOrEqual(4);
    expect(await realmRowCount('worldDirectorState')).toBeGreaterThanOrEqual(2);

    const playerOneEastbrook = await db.loadRecords({
      sourcePlayerEntityId: playerOne,
      nowSeconds: sim.time,
      sceneId: 'eastbrook_vale',
      zoneId: 'eastbrook_vale',
      limit: 20,
    });
    const playerTwoMirefen = await db.loadRecords({
      sourcePlayerEntityId: playerTwo,
      nowSeconds: sim.time,
      sceneId: 'fenbridge_bridge',
      zoneId: 'mirefen_marsh',
      limit: 20,
    });
    const playerTwoEastbrook = await db.loadRecords({
      sourcePlayerEntityId: playerTwo,
      nowSeconds: sim.time,
      sceneId: 'eastbrook_vale',
      zoneId: 'eastbrook_vale',
      limit: 20,
    });

    expect(playerOneEastbrook).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourcePlayerEntityId: playerOne, itemId: 'roasted_boar' }),
    ]));
    expect(playerTwoMirefen).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourcePlayerEntityId: playerTwo, itemId: 'gravecaller_sigil' }),
    ]));
    expect(playerTwoEastbrook.some((record) => record.sourcePlayerEntityId === playerOne)).toBe(false);
    expect(playerTwoEastbrook.some((record) => record.itemId === 'roasted_boar')).toBe(false);

    const expiredRecord: AiMemoryAuditRecord = {
      kind: 'rumor',
      refId: `expired-${realm}`,
      scope: 'region',
      sceneId: 'eastbrook_vale',
      zoneId: 'eastbrook_vale',
      sourcePlayerEntityId: playerOne,
      itemId: 'redbrook_blade',
      subjectKind: 'item',
      lineIds: ['hudChrome.aiSpeech.itemInterestInspect'],
      salience: 0.3,
      createdAt: sim.time - 4,
      expiresAt: sim.time - 1,
      reason: 'pgLongrunExpiredFixture',
    };
    await db.saveRecords([expiredRecord]);
    const rowsBeforePrune = await realmRowCount();
    const pruned = await db.pruneExpired(sim.time, 10);
    expect(pruned).toBeGreaterThanOrEqual(1);
    expect(await realmRowCount()).toBe(rowsBeforePrune - pruned);
    await expect(db.loadRecords({
      sourcePlayerEntityId: playerOne,
      nowSeconds: sim.time,
      zoneId: 'eastbrook_vale',
      kinds: ['rumor'],
      limit: 20,
    })).resolves.not.toEqual(expect.arrayContaining([
      expect.objectContaining({ refId: expiredRecord.refId }),
    ]));

    const restarted = new AiLifeLayer({ enabled: true, memoryDb: db });
    const restoredEvents: SimEvent[] = [];
    teleportNearTemplate(sim, playerOne, 'forest_wolf');
    await restarted.handleSceneInspection({
      sim,
      pid: playerOne,
      locale: 'en',
      deliver: (events) => restoredEvents.push(...events),
    });

    expect(aiSpeechLineIds(restoredEvents)).toContain('hudChrome.aiSpeech.worldDirectorHungry');
    expect(questState(sim, playerOne)).toBe(beforePlayerOneQuestState);
    expect(questState(sim, playerTwo)).toBe(beforePlayerTwoQuestState);

    const clearResult = await restarted.clearMemory(sim.time);
    expect(clearResult.persistedMemoryRecords).toBeGreaterThan(0);
    expect(await realmRowCount()).toBe(0);

    const clearedRestart = new AiLifeLayer({ enabled: true, memoryDb: db });
    const afterClearEvents: SimEvent[] = [];
    await clearedRestart.handleSceneInspection({
      sim,
      pid: playerOne,
      locale: 'en',
      deliver: (events) => afterClearEvents.push(...events),
    });

    expect(aiSpeechLineIds(afterClearEvents)).not.toContain('hudChrome.aiSpeech.worldDirectorHungry');
    expect(questState(sim, playerOne)).toBe(beforePlayerOneQuestState);
    expect(questState(sim, playerTwo)).toBe(beforePlayerTwoQuestState);
  }, 120_000);
});
