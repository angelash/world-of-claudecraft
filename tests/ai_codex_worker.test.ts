import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexCliProvider, type CodexCliProviderOptions } from '../server/ai/codex_worker';
import { AiLifeLayer } from '../server/ai/life_layer';
import type { AiJobContextV1 } from '../server/ai/ai_types';
import { individualProfileFor } from '../server/ai/singularity';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';

const context: AiJobContextV1 = {
  schemaVersion: 1,
  jobId: 'job-codex-worker',
  trigger: 'npc_gossip_opened',
  entity: {
    kind: 'npc',
    entityId: 7,
    templateId: 'brother_aldric',
    name: 'Brother Aldric',
    level: 1,
    questIds: ['q_bones'],
    dead: false,
  },
  player: {
    entityId: 1,
    name: 'Ari',
    level: 1,
    classId: 'warrior',
    activeQuestIds: ['q_bones'],
    completedQuestIds: [],
  },
  locale: 'en',
  questFacts: [{ questId: 'q_bones', visibility: 'knownToPlayer', summary: 'The dead are restless.', source: 'quest-log' }],
  recentObservations: [],
  allowedIntents: ['commentOnScene'],
  outputMode: 'line_id_only',
};

describe('Codex CLI AI provider', () => {
  it('invokes codex exec in the job directory and reads the structured output file', async () => {
    const provider = await providerWithFakeCodex(`{
      schemaVersion: 1,
      jobId: context.jobId,
      entityRef: {
        kind: context.entity.kind,
        entityId: context.entity.entityId,
        templateId: context.entity.templateId
      },
      ttlMs: 5000,
      confidence: 1,
      speech: [{
        mode: 'lineId',
        lineId: 'hudChrome.aiSpeech.brotherAldricAwake',
        values: { playerName: context.player.name }
      }],
      intents: [{ type: 'commentOnScene', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }],
      audit: { shortReason: 'fake codex worker', usedPlayerInput: false, safetyNotes: [] }
    }`);

    await expect(provider.decide(context)).resolves.toMatchObject({
      schemaVersion: 1,
      jobId: 'job-codex-worker',
      speech: [{ mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }],
    });
  });

  it('rejects invalid JSON written by codex before it reaches the intent validator', async () => {
    const provider = await providerWithFakeCodex(`'{ invalid json'`);

    await expect(provider.decide(context)).rejects.toThrow('codex worker wrote invalid JSON');
  });

  it('rejects structurally incomplete codex decisions', async () => {
    const provider = await providerWithFakeCodex(`{
      schemaVersion: 1,
      jobId: context.jobId,
      entityRef: {
        kind: context.entity.kind,
        entityId: context.entity.entityId,
        templateId: context.entity.templateId
      },
      ttlMs: 5000,
      confidence: 1,
      speech: [],
      intents: []
    }`);

    await expect(provider.decide(context)).rejects.toThrow('codex worker output audit must be an object');
  });

  it('rejects extra fields that are outside the Codex output schema', async () => {
    const provider = await providerWithFakeCodex(`{
      schemaVersion: 1,
      jobId: context.jobId,
      entityRef: {
        kind: context.entity.kind,
        entityId: context.entity.entityId,
        templateId: context.entity.templateId
      },
      ttlMs: 5000,
      confidence: 1,
      speech: [],
      intents: [],
      audit: { shortReason: 'extra field', usedPlayerInput: false, safetyNotes: [] },
      hiddenQuestReward: 'gold'
    }`);

    await expect(provider.decide(context)).rejects.toThrow('codex worker output decision.hiddenQuestReward is not allowed');
  });

  it('rejects intent names outside the local AiIntentType allowlist', async () => {
    const provider = await providerWithFakeCodex(`{
      schemaVersion: 1,
      jobId: context.jobId,
      entityRef: {
        kind: context.entity.kind,
        entityId: context.entity.entityId,
        templateId: context.entity.templateId
      },
      ttlMs: 5000,
      confidence: 1,
      speech: [],
      intents: [{ type: 'rewriteQuestReward' }],
      audit: { shortReason: 'bad intent', usedPlayerInput: false, safetyNotes: [] }
    }`);

    await expect(provider.decide(context)).rejects.toThrow('codex worker output intent.type is invalid');
  });

  it('accepts bounded presentation intent targets from the Codex CLI worker', async () => {
    const provider = await providerWithFakeCodex(`{
      schemaVersion: 1,
      jobId: context.jobId,
      entityRef: {
        kind: context.entity.kind,
        entityId: context.entity.entityId,
        templateId: context.entity.templateId
      },
      ttlMs: 5000,
      confidence: 1,
      speech: [],
      intents: [{ type: 'lookAt', targetEntityId: context.player.entityId, seconds: 1.5 }],
      audit: { shortReason: 'targeted presentation intent', usedPlayerInput: false, safetyNotes: [] }
    }`);

    await expect(provider.decide(context)).resolves.toMatchObject({
      intents: [{ type: 'lookAt', targetEntityId: 1, seconds: 1.5 }],
    });
  });

  it('bounds stderr captured from a failing codex process', async () => {
    const provider = await providerWithFakeCodexScript(`
process.stderr.write('x'.repeat(40));
process.exit(3);
`, { maxStderrBytes: 12 });

    await expect(provider.decide(context)).rejects.toThrow(/xxxxxxxxxxxx\ncodex worker stderr truncated/);
  });

  it('accepts bounded pet command intents from the Codex CLI worker', async () => {
    const petContext: AiJobContextV1 = {
      ...context,
      jobId: 'job-pet-command',
      trigger: 'pet_command',
      entity: {
        kind: 'mob',
        entityId: 22,
        templateId: 'forest_wolf',
        name: 'Forest Wolf',
        level: 5,
        questIds: [],
        dead: false,
      },
      questFacts: [],
      recentObservations: ['playerPetCommand:stay close'],
      allowedIntents: ['commandPetPassive'],
      allowedLineIds: [],
    };
    const provider = await providerWithFakeCodex(`{
      schemaVersion: 1,
      jobId: context.jobId,
      entityRef: {
        kind: context.entity.kind,
        entityId: context.entity.entityId,
        templateId: context.entity.templateId
      },
      ttlMs: 5000,
      confidence: 0.9,
      speech: [],
      intents: [{ type: 'commandPetPassive' }],
      audit: { shortReason: 'bounded pet command', usedPlayerInput: true, safetyNotes: [] }
    }`);

    await expect(provider.decide(petContext)).resolves.toMatchObject({
      schemaVersion: 1,
      jobId: 'job-pet-command',
      intents: [{ type: 'commandPetPassive' }],
      speech: [],
    });
  });

  it('drives a real AI life layer interaction through the Codex CLI provider without changing quests', async () => {
    const provider = await providerWithFakeCodex(`{
      schemaVersion: 1,
      jobId: context.jobId,
      entityRef: {
        kind: context.entity.kind,
        entityId: context.entity.entityId,
        templateId: context.entity.templateId
      },
      ttlMs: 5000,
      confidence: 0.9,
      speech: [{
        mode: 'lineId',
        lineId: 'hudChrome.aiSpeech.brotherAldricAwake',
        values: { playerName: context.player.name, speakerName: context.entity.name }
      }],
      intents: [{ type: 'commentOnScene', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }],
      audit: { shortReason: 'fake codex life layer path', usedPlayerInput: false, safetyNotes: [] }
    }`);
    const { sim, pid, npcId } = makeSim();
    const layer = new AiLifeLayer({ enabled: true, provider });
    const delivered: unknown[] = [];
    const beforeQuestLog = JSON.stringify([...sim.meta(pid)!.questLog]);
    const beforeDone = JSON.stringify([...sim.meta(pid)!.questsDone]);

    await layer.handleNpcInteraction({ sim, pid, npcId, locale: 'en', deliver: (events) => delivered.push(...events) });

    expect(delivered).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speakerId: npcId,
      speech: expect.objectContaining({ mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }),
      source: 'codex',
      pid,
    }));
    expect(layer.diagnostics()).toEqual([expect.objectContaining({
      status: 'accepted',
      trigger: 'npc_gossip_opened',
      templateId: 'brother_aldric',
      lineIds: ['hudChrome.aiSpeech.brotherAldricAwake'],
    })]);
    expect(layer.runtimeMetrics()).toMatchObject({
      providerCalls: 1,
      providerSuccesses: 1,
      providerErrors: 0,
      acceptedDecisions: 1,
    });
    expect(JSON.stringify([...sim.meta(pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...sim.meta(pid)!.questsDone])).toBe(beforeDone);
  });

  it('drives object inspection through the Codex CLI provider while keeping local object metadata', async () => {
    const provider = await providerWithFakeCodex(`{
      schemaVersion: 1,
      jobId: context.jobId,
      entityRef: {
        kind: context.entity.kind,
        entityId: context.entity.entityId,
        templateId: context.entity.templateId
      },
      ttlMs: 5000,
      confidence: 0.9,
      speech: [{
        mode: 'lineId',
        lineId: 'hudChrome.aiSpeech.objectInspectGrave',
        values: { playerName: context.player.name }
      }],
      intents: [{ type: 'inspectObject', lineId: 'hudChrome.aiSpeech.objectInspectGrave' }],
      audit: { shortReason: 'fake codex object inspection path', usedPlayerInput: false, safetyNotes: [] }
    }`);
    const { sim, pid } = makeSim();
    const object = [...sim.entities.values()].find((entity) => entity.kind === 'object' && entity.objectItemId === 'gravecaller_sigil')!;
    teleportNear(sim, pid, object.id);
    const layer = new AiLifeLayer({ enabled: true, provider });
    const delivered: unknown[] = [];
    const beforeQuestLog = JSON.stringify([...sim.meta(pid)!.questLog]);
    const beforeDone = JSON.stringify([...sim.meta(pid)!.questsDone]);

    await layer.handleObjectInspection({ sim, pid, objectId: object.id, locale: 'en', deliver: (events) => delivered.push(...events) });

    expect(delivered).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speakerId: object.id,
      speech: expect.objectContaining({
        mode: 'lineId',
        lineId: 'hudChrome.aiSpeech.objectInspectGrave',
        values: expect.objectContaining({ itemId: 'gravecaller_sigil', objectName: object.name }),
      }),
      source: 'codex',
      reaction: expect.objectContaining({ targetObjectId: object.id, targetItemId: 'gravecaller_sigil' }),
      pid,
    }));
    expect(layer.diagnostics()).toEqual([expect.objectContaining({
      status: 'accepted',
      trigger: 'object_inspected',
      templateId: object.templateId,
      lineIds: ['hudChrome.aiSpeech.objectInspectGrave'],
    })]);
    expect(layer.runtimeMetrics()).toMatchObject({
      providerCalls: 1,
      providerSuccesses: 1,
      providerErrors: 0,
      acceptedDecisions: 1,
    });
    expect(JSON.stringify([...sim.meta(pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...sim.meta(pid)!.questsDone])).toBe(beforeDone);
  });

  it('drives a singularity item reaction through the Codex CLI provider while keeping creature metadata', async () => {
    const provider = await providerWithFakeCodex(`(() => {
      const suggestedLineId = context.recentObservations
        .find((observation) => observation.startsWith('suggestedLineId:'))
        ?.slice('suggestedLineId:'.length) ?? 'hudChrome.aiSpeech.itemInterestInspect';
      return {
        schemaVersion: 1,
        jobId: context.jobId,
        entityRef: {
          kind: context.entity.kind,
          entityId: context.entity.entityId,
          templateId: context.entity.templateId
        },
        ttlMs: 5000,
        confidence: 0.88,
        speech: [{
          mode: 'lineId',
          lineId: suggestedLineId,
          values: { playerName: context.player.name }
        }],
        intents: [{ type: 'inspectObject', lineId: suggestedLineId }],
        audit: { shortReason: 'fake codex singularity item path', usedPlayerInput: false, safetyNotes: [] }
      };
    })()`);
    const { sim, pid } = makeSim();
    const player = sim.entities.get(pid)!;
    const wolf = [...sim.entities.values()].find((entity) => entity.templateId === 'forest_wolf')!;
    sim.cfg.seed = seedThatMakesSingularity(wolf);
    moveEntity(sim, player, 900, 900);
    moveEntity(sim, wolf, 902, 900);
    const layer = new AiLifeLayer({ enabled: true, provider });
    const delivered: unknown[] = [];
    const beforeQuestLog = JSON.stringify([...sim.meta(pid)!.questLog]);
    const beforeDone = JSON.stringify([...sim.meta(pid)!.questsDone]);

    await layer.handleItemDiscarded({ sim, pid, itemId: 'roasted_boar', count: 1, deliver: (events) => delivered.push(...events) });

    expect(delivered).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      speakerId: wolf.id,
      source: 'codex',
      speech: expect.objectContaining({
        mode: 'lineId',
        values: expect.objectContaining({
          itemId: 'roasted_boar',
          speakerTemplateId: 'forest_wolf',
          individualAlias: expect.any(String),
          playerName: 'Ari',
        }),
      }),
      reaction: expect.objectContaining({
        targetItemId: 'roasted_boar',
        individualTier: 'singularity',
        individualTraits: expect.any(Array),
      }),
      pid,
    }));
    expect(layer.diagnostics()).toContainEqual(expect.objectContaining({
      status: 'accepted',
      trigger: 'singularity_candidate',
      templateId: 'forest_wolf',
    }));
    expect(layer.runtimeMetrics()).toMatchObject({
      providerCalls: 1,
      providerSuccesses: 1,
      providerErrors: 0,
      acceptedDecisions: 1,
    });
    expect(JSON.stringify([...sim.meta(pid)!.questLog])).toBe(beforeQuestLog);
    expect(JSON.stringify([...sim.meta(pid)!.questsDone])).toBe(beforeDone);
  });
});

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

function moveEntity(sim: Sim, entity: Entity, x: number, z: number): void {
  entity.pos.x = x;
  entity.pos.z = z;
  entity.pos.y = groundHeight(x, z, sim.cfg.seed);
  entity.prevPos = { ...entity.pos };
  sim.grid.update(entity);
  if (entity.kind === 'player') sim.playerGrid.update(entity);
}

function makeSim(): { sim: Sim; pid: number; npcId: number } {
  const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
  const pid = sim.addPlayer('warrior', 'Ari');
  const npc = [...sim.entities.values()].find((entity) => entity.templateId === 'brother_aldric')!;
  teleportNear(sim, pid, npc.id);
  return { sim, pid, npcId: npc.id };
}

function seedThatMakesSingularity(entity: Entity): number {
  for (let seed = 1; seed < 10000; seed++) {
    if (individualProfileFor(entity, seed).tier === 'singularity') return seed;
  }
  throw new Error(`No singularity seed found for ${entity.templateId}`);
}

async function providerWithFakeCodex(
  outputExpression: string,
  options: Partial<CodexCliProviderOptions> = {},
): Promise<CodexCliProvider> {
  return providerWithFakeCodexScript(`
import { readFile, writeFile } from 'node:fs/promises';
const args = process.argv.slice(2);
const outputPath = args[args.indexOf('-o') + 1];
const schemaPath = args[args.indexOf('--output-schema') + 1];
const context = JSON.parse(await readFile('job.json', 'utf8'));
await readFile(schemaPath, 'utf8');
const output = ${outputExpression};
await writeFile(outputPath, typeof output === 'string' ? output : JSON.stringify(output));
`, options);
}

async function providerWithFakeCodexScript(
  script: string,
  options: Partial<CodexCliProviderOptions> = {},
): Promise<CodexCliProvider> {
  const dir = await mkdtemp(join(tmpdir(), 'woc-ai-provider-test-'));
  const fakeCodexPath = join(dir, 'fake-codex.mjs');
  await writeFile(fakeCodexPath, script, 'utf8');

  return new CodexCliProvider({
    codexBin: process.execPath,
    codexArgsPrefix: [fakeCodexPath],
    timeoutMs: 5_000,
    ...options,
  });
}
