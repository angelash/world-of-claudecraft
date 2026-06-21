import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexCliProvider } from '../server/ai/codex_worker';
import type { AiJobContextV1 } from '../server/ai/ai_types';

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
    const dir = await mkdtemp(join(tmpdir(), 'woc-ai-provider-test-'));
    const fakeCodexPath = join(dir, 'fake-codex.mjs');
    await writeFile(fakeCodexPath, `
import { readFile, writeFile } from 'node:fs/promises';
const args = process.argv.slice(2);
const outputPath = args[args.indexOf('-o') + 1];
const schemaPath = args[args.indexOf('--output-schema') + 1];
const context = JSON.parse(await readFile('job.json', 'utf8'));
await readFile(schemaPath, 'utf8');
await writeFile(outputPath, JSON.stringify({
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
}));
`, 'utf8');

    const provider = new CodexCliProvider({
      codexBin: process.execPath,
      codexArgsPrefix: [fakeCodexPath],
      timeoutMs: 5_000,
    });

    await expect(provider.decide(context)).resolves.toMatchObject({
      schemaVersion: 1,
      jobId: 'job-codex-worker',
      speech: [{ mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }],
    });
  });
});
