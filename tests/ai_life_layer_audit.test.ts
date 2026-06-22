import { describe, expect, it, vi } from 'vitest';
import { AiLifeLayer } from '../server/ai/life_layer';
import type { AiAuditRecord, AiAuditSink } from '../server/ai_audit';
import type { AiDecisionV1, AiJobContextV1, AiProvider } from '../server/ai/ai_types';
import { Sim } from '../src/sim/sim';
import { groundHeight } from '../src/sim/world';

class CaptureAuditSink implements AiAuditSink {
  records: AiAuditRecord[] = [];
  fail = false;

  record(record: AiAuditRecord): void {
    if (this.fail) throw new Error('audit sink offline');
    this.records.push(record);
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

function acceptedProvider(lineId = 'hudChrome.aiSpeech.brotherAldricAwake'): AiProvider {
  return {
    async decide(context: AiJobContextV1): Promise<AiDecisionV1> {
      return {
        schemaVersion: 1,
        jobId: context.jobId,
        entityRef: { kind: context.entity.kind, entityId: context.entity.entityId, templateId: context.entity.templateId },
        ttlMs: 5000,
        confidence: 1,
        speech: [{ mode: 'lineId', lineId }],
        intents: [{ type: 'commentOnScene', lineId }],
        audit: { shortReason: 'audit test decision', usedPlayerInput: false, safetyNotes: [] },
      };
    },
  };
}

describe('AI life layer audit recording', () => {
  it('records provider successes with token estimates and context counts', async () => {
    const { sim, pid, npcId } = makeSim();
    const sink = new CaptureAuditSink();
    const layer = new AiLifeLayer({ enabled: true, provider: acceptedProvider(), auditSink: sink, auditProviderSource: 'codex' });
    const delivered: unknown[] = [];

    await layer.handleNpcInteraction({ sim, pid, npcId, locale: 'en', deliver: (events) => delivered.push(...events) });

    expect(delivered).toContainEqual(expect.objectContaining({ type: 'aiSpeech', source: 'codex' }));
    expect(sink.records).toEqual([expect.objectContaining({
      trigger: 'npc_gossip_opened',
      entityKind: 'npc',
      templateId: 'brother_aldric',
      playerEntityId: pid,
      providerSource: 'codex',
      status: 'accepted',
      tokenEstimate: true,
      outputMode: 'line_id_only',
      lineIds: ['hudChrome.aiSpeech.brotherAldricAwake'],
      intents: ['commentOnScene'],
      memoryWriteRefs: [expect.stringMatching(/^npcInteraction:npc:\d+:brother_aldric$/)],
      error: '',
    })]);
    expect(sink.records[0].inputTokens).toBeGreaterThan(0);
    expect(sink.records[0].outputTokens).toBeGreaterThan(0);
    expect(sink.records[0].totalTokens).toBe(sink.records[0].inputTokens + sink.records[0].outputTokens);
    expect(sink.records[0].allowedIntentCount).toBeGreaterThan(0);
    expect(sink.records[0].allowedLineIdCount).toBeGreaterThan(0);
    expect(sink.records[0].sceneObjectCount).toBeGreaterThanOrEqual(0);
  });

  it('records provider errors without synthesizing fallback output', async () => {
    const provider: AiProvider = {
      async decide(): Promise<AiDecisionV1> {
        throw new Error('codex worker timed out');
      },
    };
    const { sim, pid, npcId } = makeSim();
    const sink = new CaptureAuditSink();
    const layer = new AiLifeLayer({ enabled: true, provider, auditSink: sink, auditProviderSource: 'codex' });
    const delivered: unknown[] = [];

    await expect(layer.handleNpcInteraction({ sim, pid, npcId, locale: 'en', deliver: (events) => delivered.push(...events) })).resolves.toBeUndefined();

    expect(delivered).toContainEqual(expect.objectContaining({
      type: 'error',
      text: 'AI response failed: codex worker timed out',
    }));
    expect(sink.records).toEqual([expect.objectContaining({
      status: 'provider_error',
      providerSource: 'codex',
      outputTokens: 0,
      error: 'codex worker timed out',
      reason: 'providerError:codex worker timed out',
      lineIds: [],
    })]);
    expect(sink.records[0].inputTokens).toBeGreaterThan(0);
    expect(sink.records[0].totalTokens).toBe(sink.records[0].inputTokens);
  });

  it('records rejected provider decisions and delivers a clear rejection event', async () => {
    const provider = acceptedProvider('hudChrome.aiSpeech.merchantMarketPulse');
    const { sim, pid, npcId } = makeSim();
    const sink = new CaptureAuditSink();
    const layer = new AiLifeLayer({ enabled: true, provider, auditSink: sink });
    const delivered: unknown[] = [];

    await layer.handleNpcInteraction({ sim, pid, npcId, locale: 'en', deliver: (events) => delivered.push(...events) });

    expect(delivered).toContainEqual(expect.objectContaining({
      type: 'error',
      text: expect.stringContaining('AI response rejected: line id hudChrome.aiSpeech.merchantMarketPulse not allowed'),
      pid,
    }));
    expect(sink.records).toEqual([expect.objectContaining({
      status: 'rejected',
      providerSource: 'provider',
      reason: expect.stringContaining('line id hudChrome.aiSpeech.merchantMarketPulse not allowed'),
      lineIds: ['hudChrome.aiSpeech.merchantMarketPulse'],
      intents: ['commentOnScene'],
    })]);
  });

  it('records local item-discard reactions with zero provider tokens', async () => {
    const { sim, pid, wolfId } = makeSim();
    teleportNear(sim, pid, wolfId);
    const sink = new CaptureAuditSink();
    const layer = new AiLifeLayer({ enabled: true, auditSink: sink });
    const delivered: unknown[] = [];

    await layer.handleItemDiscarded({ sim, pid, itemId: 'roasted_boar', count: 1, deliver: (events) => delivered.push(...events) });

    expect(delivered).toContainEqual(expect.objectContaining({ type: 'aiSpeech' }));
    expect(sink.records).toContainEqual(expect.objectContaining({
      trigger: 'item_discarded',
      providerSource: 'local',
      status: 'local_reaction',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      memoryWriteRefs: expect.arrayContaining([
        expect.stringContaining('worldTrace:'),
        expect.stringContaining('worldDirectorState:'),
        expect.stringContaining('rumor:'),
      ]),
    }));
  });

  it('does not block player-facing AI speech when audit writing fails', async () => {
    const { sim, pid, npcId } = makeSim();
    const sink = new CaptureAuditSink();
    sink.fail = true;
    const layer = new AiLifeLayer({ enabled: true, provider: acceptedProvider(), auditSink: sink });
    const delivered: unknown[] = [];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(layer.handleNpcInteraction({ sim, pid, npcId, locale: 'en', deliver: (events) => delivered.push(...events) })).resolves.toBeUndefined();

    expect(delivered).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speech: expect.objectContaining({ lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }),
    }));
    expect(layer.runtimeMetrics()).toMatchObject({
      providerCalls: 1,
      providerSuccesses: 1,
      acceptedDecisions: 1,
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
