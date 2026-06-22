import { describe, expect, it } from 'vitest';
import {
  CodexCliProvider,
  parseCodexDecisionOutput,
  resolveCodexBinary,
} from '../server/ai/codex_worker';
import type { AiDecisionV1, AiJobContextV1 } from '../server/ai/ai_types';

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
  recentObservations: ['scene:fallen_chapel'],
  allowedIntents: ['commentOnScene'],
  allowedLineIds: ['hudChrome.aiSpeech.brotherAldricAwake'],
  outputMode: 'line_id_only',
};

function validDecision(overrides: Partial<AiDecisionV1> = {}): AiDecisionV1 {
  return {
    schemaVersion: 1,
    jobId: context.jobId,
    entityRef: {
      kind: context.entity.kind,
      entityId: context.entity.entityId,
      templateId: context.entity.templateId,
    },
    ttlMs: 5000,
    confidence: 0.9,
    speech: [{
      mode: 'lineId',
      lineId: 'hudChrome.aiSpeech.brotherAldricAwake',
      values: { playerName: context.player.name },
    }],
    intents: [{ type: 'commentOnScene', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }],
    audit: { shortReason: 'bounded codex decision', usedPlayerInput: false, safetyNotes: [] },
    ...overrides,
  };
}

describe('Codex CLI AI provider', () => {
  it('parses a structured AiDecisionV1 result', () => {
    expect(parseCodexDecisionOutput(JSON.stringify(validDecision()))).toMatchObject({
      schemaVersion: 1,
      jobId: 'job-codex-worker',
      speech: [{ mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }],
    });
  });

  it('rejects invalid JSON before the intent validator', () => {
    expect(() => parseCodexDecisionOutput("'{ invalid json'"))
      .toThrow('codex worker wrote invalid JSON');
  });

  it('rejects structurally incomplete decisions', () => {
    const withoutAudit = { ...validDecision(), audit: undefined };
    expect(() => parseCodexDecisionOutput(JSON.stringify(withoutAudit)))
      .toThrow('codex worker output audit must be an object');
  });

  it('rejects extra fields outside the output schema', () => {
    expect(() => parseCodexDecisionOutput(JSON.stringify({
      ...validDecision(),
      hiddenQuestReward: 'gold',
    }))).toThrow('codex worker output decision.hiddenQuestReward is not allowed');
  });

  it('rejects intent names outside the local AiIntentType allowlist', () => {
    expect(() => parseCodexDecisionOutput(JSON.stringify({
      ...validDecision(),
      intents: [{ type: 'rewriteQuestReward' }],
    }))).toThrow('codex worker output intent.type is invalid');
  });

  it('accepts bounded presentation intent targets', () => {
    expect(parseCodexDecisionOutput(JSON.stringify(validDecision({
      speech: [],
      intents: [{ type: 'lookAt', targetEntityId: context.player.entityId, seconds: 1.5 }],
    })))).toMatchObject({
      intents: [{ type: 'lookAt', targetEntityId: 1, seconds: 1.5 }],
    });
  });

  it('treats strict-schema null optional fields as absent', () => {
    expect(parseCodexDecisionOutput(JSON.stringify(validDecision({
      speech: [{
        mode: 'lineId',
        lineId: 'hudChrome.aiSpeech.brotherAldricAwake',
        values: null as unknown as Record<string, string | number>,
      }],
      intents: [{
        type: 'commentOnScene',
        lineId: null as unknown as string,
        targetEntityId: null as unknown as number,
        targetObjectId: null as unknown as number,
        targetItemId: null as unknown as string,
        seconds: null as unknown as number,
      }],
    })))).toMatchObject({
      speech: [{ mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }],
      intents: [{ type: 'commentOnScene' }],
    });
  });

  it('accepts bounded pet command intents', () => {
    const petDecision = validDecision({
      entityRef: {
        kind: 'mob',
        entityId: 22,
        templateId: 'forest_wolf',
      },
      speech: [],
      intents: [{ type: 'commandPetPassive' }],
      audit: { shortReason: 'bounded pet command', usedPlayerInput: true, safetyNotes: [] },
    });
    expect(parseCodexDecisionOutput(JSON.stringify(petDecision))).toMatchObject({
      intents: [{ type: 'commandPetPassive' }],
      speech: [],
    });
  });

  it('reports a clear start error when the Codex executable is unavailable', async () => {
    const provider = new CodexCliProvider({
      codexBin: 'woc-codex-cli-that-should-not-exist',
      timeoutMs: 1000,
    });

    await expect(provider.decide(context)).rejects.toThrow(/Codex CLI could not start/);
  });

  it('prefers the Windows user install path when it is present', () => {
    const resolved = resolveCodexBinary();
    expect(resolved.length).toBeGreaterThan(0);
  });

  const realCodexIt = process.env.RUN_REAL_CODEX_CLI === '1' ? it : it.skip;
  realCodexIt('runs the real Codex CLI path and returns a validated decision', async () => {
    const provider = new CodexCliProvider({ timeoutMs: 120_000 });

    await expect(provider.decide(context)).resolves.toMatchObject({
      schemaVersion: 1,
      jobId: context.jobId,
      entityRef: {
        kind: context.entity.kind,
        entityId: context.entity.entityId,
        templateId: context.entity.templateId,
      },
    });
  }, 150_000);
});
