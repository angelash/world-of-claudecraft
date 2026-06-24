import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexAppServerProvider } from '../server/ai/codex_app_server_provider';
import {
  CodexCliProvider,
  parseCodexDecisionOutput,
  resolveCodexBinary,
} from '../server/ai/codex_worker';
import { buildCodexDecisionPrompt } from '../server/ai/prompt_builder';
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

async function makeFakeCodexAppServer(): Promise<{ dir: string; entry: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'woc-fake-codex-app-server-'));
  const entry = join(dir, 'app-server');
  await writeFile(entry, `
const readline = require('node:readline');
let nextThreadId = 1;
const send = (payload) => process.stdout.write(JSON.stringify(payload) + '\\n');
const decisionForPrompt = (prompt) => {
  const jobId = /"jobId"\\s*:\\s*"([^"]+)"/.exec(prompt)?.[1] || 'job-codex-worker';
  return JSON.stringify({
    schemaVersion: 1,
    jobId,
    entityRef: { kind: 'npc', entityId: 7, templateId: 'brother_aldric' },
    ttlMs: 5000,
    confidence: 0.9,
    speech: [{ mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }],
    intents: [{ type: 'commentOnScene', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }],
    audit: { shortReason: 'fake app-server decision', usedPlayerInput: false, safetyNotes: [] },
  });
};
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);
  const params = message.params || {};
  if (message.method === 'initialize') {
    send({ id: message.id, result: {} });
    return;
  }
  if (message.method === 'initialized') return;
  if (message.method === 'thread/start') {
    send({ id: message.id, result: { thread: { id: 'thread-' + nextThreadId++ } } });
    return;
  }
  if (message.method === 'turn/start') {
    const threadId = params.threadId;
    const prompt = Array.isArray(params.input) && params.input[0] ? String(params.input[0].text || '') : '';
    const output = decisionForPrompt(prompt);
    send({ id: message.id, result: {} });
    send({ method: 'turn/started', params: { threadId } });
    send({ method: 'item/agentMessage/delta', params: { threadId, delta: output.slice(0, 12) } });
    send({ method: 'item/agentMessage/delta', params: { threadId, delta: output.slice(12) } });
    send({ method: 'item/completed', params: { threadId, item: { type: 'agentMessage', text: output } } });
    send({ method: 'turn/completed', params: { threadId, turn: { status: { type: 'completed' } } } });
    return;
  }
  if (message.method === 'thread/rollback') {
    send({ id: message.id, result: {} });
    return;
  }
  send({ id: message.id, error: { message: 'unexpected method ' + message.method } });
});
`, 'utf8');
  return { dir, entry };
}

async function removeFakeCodexAppServerDir(dir: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

describe('Codex CLI AI provider', () => {
  it('parses a structured AiDecisionV1 result', () => {
    expect(parseCodexDecisionOutput(JSON.stringify(validDecision()))).toMatchObject({
      schemaVersion: 1,
      jobId: 'job-codex-worker',
      speech: [{ mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }],
    });
  });

  it('accepts up to three speech entries for sequence-capable provider output', () => {
    expect(parseCodexDecisionOutput(JSON.stringify(validDecision({
      speech: [
        { mode: 'dynamicText', language: 'en', text: 'The stall rope smells of rain.' },
        { mode: 'dynamicText', language: 'en', text: 'Keep the coins under the dry plank.' },
        { mode: 'dynamicText', language: 'en', text: 'The west road sounds busy already.' },
      ],
    })))).toMatchObject({
      speech: [
        { mode: 'dynamicText', language: 'en', text: 'The stall rope smells of rain.' },
        { mode: 'dynamicText', language: 'en', text: 'Keep the coins under the dry plank.' },
        { mode: 'dynamicText', language: 'en', text: 'The west road sounds busy already.' },
      ],
    });
  });

  it('rejects provider output with more than three speech entries', () => {
    expect(() => parseCodexDecisionOutput(JSON.stringify(validDecision({
      speech: [
        { mode: 'dynamicText', language: 'en', text: 'The stall rope smells of rain.' },
        { mode: 'dynamicText', language: 'en', text: 'Keep the coins under the dry plank.' },
        { mode: 'dynamicText', language: 'en', text: 'The west road sounds busy already.' },
        { mode: 'dynamicText', language: 'en', text: 'Someone should mend that awning.' },
      ],
    })))).toThrow('codex worker output speech has too many entries');
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

  it('builds a compact prompt with spoken-style guidance', () => {
    const prompt = buildCodexDecisionPrompt({ ...context, locale: 'zh_CN', outputMode: 'mixed_living_world' });

    expect(prompt).toContain('Compact job JSON (source of truth):');
    expect(prompt).not.toContain('Full job context JSON');
    expect(prompt).toContain('Avoid assistant-style transitions');
    expect(prompt).toContain('Do not start with 首先, 其次, 最后, 不过');
    expect(prompt).toContain('"jobId":"job-codex-worker"');
  });

  it('prompts social sequence jobs for paced multi-line speech', () => {
    const prompt = buildCodexDecisionPrompt({
      ...context,
      trigger: 'active_poll',
      outputMode: 'dynamic_text_experiment',
      recentObservations: ['sequence:social', 'partner:marshal_redbrook', 'partnerName:Marshal Redbrook'],
      sequenceParticipants: [
        { slot: 0, kind: 'npc', entityId: 7, templateId: 'brother_aldric', name: 'Brother Aldric' },
        { slot: 1, kind: 'npc', entityId: 8, templateId: 'marshal_redbrook', name: 'Marshal Redbrook' },
      ],
    });

    expect(prompt).toContain('This is a paced social sequence');
    expect(prompt).toContain('speech[0] is the acting entity');
    expect(prompt).toContain('Sequence participants: 0:npc:brother_aldric:Brother Aldric, 1:npc:marshal_redbrook:Marshal Redbrook');
    expect(prompt).toContain('"sequenceParticipants":[{"slot":0,"kind":"npc","entityId":7,"templateId":"brother_aldric","name":"Brother Aldric"},{"slot":1,"kind":"npc","entityId":8,"templateId":"marshal_redbrook","name":"Marshal Redbrook"}]');
    expect(prompt).not.toContain('Return at most one speech entry and at most two intents.');
  });

  it('uses a warm app-server worker and reports provider timing steps', async () => {
    const fake = await makeFakeCodexAppServer();
    const provider = new CodexAppServerProvider({
      codexBin: process.execPath,
      repoRoot: fake.dir,
      poolSize: 1,
      startImmediately: false,
      startupTimeoutMs: 1000,
      requestTimeoutMs: 1000,
      timeoutMs: 3000,
      model: null,
      effort: null,
    });
    try {
      const result = await provider.decide(context);

      expect(result.decision).toMatchObject({
        schemaVersion: 1,
        jobId: context.jobId,
        entityRef: {
          kind: context.entity.kind,
          entityId: context.entity.entityId,
          templateId: context.entity.templateId,
        },
      });
      expect(result.providerTimings).toEqual(expect.objectContaining({
        provider: 'codex-app-server',
        totalMs: expect.any(Number),
      }));
      expect(result.providerTimings?.steps.map((step) => step.key)).toEqual(expect.arrayContaining([
        'buildPromptMs',
        'startupWaitMs',
        'queueWaitMs',
        'turnStartAckMs',
        'turnCompleteMs',
        'firstDeltaMs',
        'firstAgentMessageMs',
        'threadResetMs',
        'parseOutputMs',
      ]));
    } finally {
      provider.close();
      await removeFakeCodexAppServerDir(fake.dir);
    }
  });

  const realCodexIt = process.env.RUN_REAL_CODEX_CLI === '1' ? it : it.skip;
  realCodexIt('runs the real Codex CLI path and returns a validated decision', async () => {
    const provider = new CodexCliProvider({ timeoutMs: 120_000 });

    const result = await provider.decide(context);
    if (process.env.PRINT_REAL_CODEX_TIMINGS === '1') {
      console.info('REAL_CODEX_EXEC_TIMINGS', JSON.stringify(result.providerTimings));
    }
    expect(result).toMatchObject({
      decision: {
        schemaVersion: 1,
        jobId: context.jobId,
        entityRef: {
          kind: context.entity.kind,
          entityId: context.entity.entityId,
          templateId: context.entity.templateId,
        },
      },
      providerTimings: expect.objectContaining({ provider: 'codex-exec' }),
    });
  }, 150_000);

  const realCodexAppServerIt = process.env.RUN_REAL_CODEX_APP_SERVER === '1' ? it : it.skip;
  realCodexAppServerIt('runs the real Codex app-server path and returns timing metadata', async () => {
    const provider = new CodexAppServerProvider({
      timeoutMs: 120_000,
      startupTimeoutMs: 30_000,
      requestTimeoutMs: 30_000,
      poolSize: 1,
      startImmediately: false,
    });
    try {
      const result = await provider.decide(context);
      if (process.env.PRINT_REAL_CODEX_TIMINGS === '1') {
        console.info('REAL_CODEX_APP_SERVER_TIMINGS', JSON.stringify(result.providerTimings));
        const warmResult = await provider.decide(context);
        console.info('REAL_CODEX_APP_SERVER_WARM_TIMINGS', JSON.stringify(warmResult.providerTimings));
      }
      expect(result.decision).toMatchObject({
        schemaVersion: 1,
        jobId: context.jobId,
      });
      expect(result.providerTimings?.provider).toBe('codex-app-server');
      expect(result.providerTimings?.steps.map((step) => step.key)).toContain('turnCompleteMs');
    } finally {
      provider.close();
    }
  }, 150_000);
});
