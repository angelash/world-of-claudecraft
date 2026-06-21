import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AiDecisionV1, AiJobContextV1, AiProvider } from './ai_types';

export interface CodexCliProviderOptions {
  codexBin?: string;
  codexArgsPrefix?: string[];
  timeoutMs?: number;
}

const AI_DECISION_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schemaVersion: { const: 1 },
    jobId: { type: 'string' },
    entityRef: {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { enum: ['npc', 'mob', 'object'] },
        entityId: { type: 'number' },
        templateId: { type: 'string' },
      },
      required: ['kind', 'entityId', 'templateId'],
    },
    ttlMs: { type: 'number', minimum: 1, maximum: 60000 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    speech: {
      type: 'array',
      items: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              mode: { const: 'lineId' },
              lineId: { type: 'string' },
              values: {
                type: 'object',
                additionalProperties: { type: ['string', 'number'] },
              },
            },
            required: ['mode', 'lineId'],
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              mode: { const: 'dynamicText' },
              language: { type: 'string' },
              text: { type: 'string', minLength: 1, maxLength: 280 },
            },
            required: ['mode', 'language', 'text'],
          },
        ],
      },
    },
    intents: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: {
            enum: [
              'lookAt',
              'faceEntity',
              'emote',
              'pause',
              'commentOnScene',
              'approachObject',
              'avoidObject',
              'inspectObject',
              'seekShelter',
              'showGossipOptions',
              'questHint',
            ],
          },
          lineId: { type: 'string' },
        },
        required: ['type'],
      },
    },
    audit: {
      type: 'object',
      additionalProperties: false,
      properties: {
        shortReason: { type: 'string' },
        usedPlayerInput: { type: 'boolean' },
        safetyNotes: { type: 'array', items: { type: 'string' } },
      },
      required: ['shortReason', 'usedPlayerInput', 'safetyNotes'],
    },
  },
  required: ['schemaVersion', 'jobId', 'entityRef', 'ttlMs', 'confidence', 'speech', 'intents', 'audit'],
};

export class CodexCliProvider implements AiProvider {
  private readonly codexBin: string;
  private readonly codexArgsPrefix: string[];
  private readonly timeoutMs: number;

  constructor(options: CodexCliProviderOptions = {}) {
    this.codexBin = options.codexBin ?? process.env.CODEX_BIN ?? 'codex';
    this.codexArgsPrefix = options.codexArgsPrefix ?? [];
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async decide(context: AiJobContextV1): Promise<AiDecisionV1> {
    const dir = await mkdtemp(join(tmpdir(), 'woc-ai-'));
    const inputPath = join(dir, 'job.json');
    const outputPath = join(dir, 'decision.json');
    const schemaPath = join(dir, 'decision.schema.json');
    await writeFile(inputPath, JSON.stringify(context, null, 2), 'utf8');
    await writeFile(schemaPath, JSON.stringify(AI_DECISION_OUTPUT_SCHEMA, null, 2), 'utf8');
    try {
      await this.execCodex(dir);
      return JSON.parse(await readFile(outputPath, 'utf8')) as AiDecisionV1;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private execCodex(cwd: string): Promise<void> {
    const prompt = [
      'Read the AI job JSON file and return exactly one AiDecisionV1 JSON object.',
      'Use only facts present in job.json. Prefer lineId speech unless outputMode explicitly allows dynamic text.',
      'Do not change quest state, rewards, combat, economy, or hidden canon.',
      'Input: job.json',
    ].join('\n');
    const args = [
      ...this.codexArgsPrefix,
      'exec',
      '--ephemeral',
      '--sandbox',
      'read-only',
      '--ask-for-approval',
      'never',
      '--output-schema',
      'decision.schema.json',
      '-o',
      'decision.json',
      prompt,
    ];
    return new Promise((resolve, reject) => {
      const child = spawn(this.codexBin, args, {
        cwd,
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      });
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('codex worker timed out'));
      }, this.timeoutMs);
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `codex worker exited with code ${code ?? 'null'}`));
      });
    });
  }
}
