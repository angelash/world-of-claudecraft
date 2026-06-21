import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AiDecisionV1, AiEntityKind, AiIntentType, AiJobContextV1, AiProvider, AiSpeech } from './ai_types';
import { buildCodexDecisionPrompt } from './prompt_builder';

export interface CodexCliProviderOptions {
  codexBin?: string;
  codexArgsPrefix?: string[];
  timeoutMs?: number;
  maxStderrBytes?: number;
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
              'commandPetPassive',
              'commandPetDefensive',
              'commandPetAggressive',
              'commandPetAttack',
              'commandPetTaunt',
              'commandPetIgnore',
            ],
          },
          lineId: { type: 'string' },
          targetEntityId: { type: 'number' },
          targetObjectId: { type: 'number' },
          targetItemId: { type: 'string' },
          seconds: { type: 'number', minimum: 0.1, maximum: 10 },
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

const ENTITY_KINDS = new Set<AiEntityKind>(['npc', 'mob', 'object']);
const INTENT_TYPES = new Set<AiIntentType>([
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
  'commandPetPassive',
  'commandPetDefensive',
  'commandPetAggressive',
  'commandPetAttack',
  'commandPetTaunt',
  'commandPetIgnore',
]);
const DEFAULT_MAX_STDERR_BYTES = 8_192;

export class CodexCliProvider implements AiProvider {
  private readonly codexBin: string;
  private readonly codexArgsPrefix: string[];
  private readonly timeoutMs: number;
  private readonly maxStderrBytes: number;

  constructor(options: CodexCliProviderOptions = {}) {
    this.codexBin = options.codexBin ?? process.env.CODEX_BIN ?? 'codex';
    this.codexArgsPrefix = options.codexArgsPrefix ?? [];
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxStderrBytes = Math.max(0, Math.floor(options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES));
  }

  async decide(context: AiJobContextV1): Promise<AiDecisionV1> {
    const dir = await mkdtemp(join(tmpdir(), 'woc-ai-'));
    const inputPath = join(dir, 'job.json');
    const outputPath = join(dir, 'decision.json');
    const schemaPath = join(dir, 'decision.schema.json');
    await writeFile(inputPath, JSON.stringify(context, null, 2), 'utf8');
    await writeFile(schemaPath, JSON.stringify(AI_DECISION_OUTPUT_SCHEMA, null, 2), 'utf8');
    try {
      await this.execCodex(context, dir);
      return parseCodexDecisionOutput(await readFile(outputPath, 'utf8'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private execCodex(context: AiJobContextV1, cwd: string): Promise<void> {
    const prompt = buildCodexDecisionPrompt(context);
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
      let stderrTruncated = false;
      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new Error('codex worker timed out'));
      }, this.timeoutMs);
      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        const remaining = this.maxStderrBytes - stderr.length;
        if (remaining > 0) stderr += text.slice(0, remaining);
        if (text.length > remaining) stderrTruncated = true;
      });
      child.on('error', (err) => {
        finish(err);
      });
      child.on('exit', (code) => {
        if (code === 0) finish();
        else finish(new Error(codexWorkerExitMessage(stderr, stderrTruncated, code)));
      });
    });
  }
}

function codexWorkerExitMessage(stderr: string, stderrTruncated: boolean, code: number | null): string {
  const trimmed = stderr.trim();
  const base = trimmed || `codex worker exited with code ${code ?? 'null'}`;
  return stderrTruncated ? `${base}\ncodex worker stderr truncated` : base;
}

export function parseCodexDecisionOutput(raw: string): AiDecisionV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('codex worker wrote invalid JSON');
  }
  return parseDecision(parsed);
}

function parseDecision(value: unknown): AiDecisionV1 {
  const record = requireRecord(value, 'decision');
  rejectUnexpectedKeys(record, ['schemaVersion', 'jobId', 'entityRef', 'ttlMs', 'confidence', 'speech', 'intents', 'audit'], 'decision');
  const schemaVersion = requireLiteral(record.schemaVersion, 1, 'schemaVersion');
  const jobId = requireString(record.jobId, 'jobId');
  const entityRef = parseEntityRef(record.entityRef);
  const ttlMs = requireNumberInRange(record.ttlMs, 'ttlMs', 1, 60_000);
  const confidence = requireNumberInRange(record.confidence, 'confidence', 0, 1);
  const speech = requireArray(record.speech, 'speech').map(parseSpeech);
  const intents = requireArray(record.intents, 'intents').map(parseIntent);
  const audit = parseAudit(record.audit);
  return { schemaVersion, jobId, entityRef, ttlMs, confidence, speech, intents, audit };
}

function parseEntityRef(value: unknown): AiDecisionV1['entityRef'] {
  const record = requireRecord(value, 'entityRef');
  rejectUnexpectedKeys(record, ['kind', 'entityId', 'templateId'], 'entityRef');
  const kind = requireEntityKind(record.kind, 'entityRef.kind');
  const entityId = requireNumber(record.entityId, 'entityRef.entityId');
  const templateId = requireString(record.templateId, 'entityRef.templateId');
  return { kind, entityId, templateId };
}

function parseSpeech(value: unknown): AiSpeech {
  const record = requireRecord(value, 'speech');
  if (record.mode === 'lineId') {
    rejectUnexpectedKeys(record, ['mode', 'lineId', 'values'], 'speech');
    const lineId = requireString(record.lineId, 'speech.lineId');
    const values = record.values === undefined ? undefined : parseSpeechValues(record.values);
    return values ? { mode: 'lineId', lineId, values } : { mode: 'lineId', lineId };
  }
  if (record.mode === 'dynamicText') {
    rejectUnexpectedKeys(record, ['mode', 'language', 'text'], 'speech');
    const language = requireString(record.language, 'speech.language');
    const text = requireString(record.text, 'speech.text');
    if (text.length === 0 || text.length > 280) throw new Error('codex worker output speech.text is out of range');
    return { mode: 'dynamicText', language, text };
  }
  throw new Error('codex worker output speech.mode is invalid');
}

function parseSpeechValues(value: unknown): Record<string, string | number> {
  const record = requireRecord(value, 'speech.values');
  const result: Record<string, string | number> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry !== 'string' && typeof entry !== 'number') {
      throw new Error(`codex worker output speech.values.${key} must be string or number`);
    }
    result[key] = entry;
  }
  return result;
}

function parseIntent(value: unknown): AiDecisionV1['intents'][number] {
  const record = requireRecord(value, 'intent');
  rejectUnexpectedKeys(record, ['type', 'lineId', 'targetEntityId', 'targetObjectId', 'targetItemId', 'seconds'], 'intent');
  const type = requireIntentType(record.type, 'intent.type');
  const lineId = record.lineId === undefined ? undefined : requireString(record.lineId, 'intent.lineId');
  const targetEntityId = record.targetEntityId === undefined ? undefined : requireNumber(record.targetEntityId, 'intent.targetEntityId');
  const targetObjectId = record.targetObjectId === undefined ? undefined : requireNumber(record.targetObjectId, 'intent.targetObjectId');
  const targetItemId = record.targetItemId === undefined ? undefined : requireString(record.targetItemId, 'intent.targetItemId');
  const seconds = record.seconds === undefined ? undefined : requireNumberInRange(record.seconds, 'intent.seconds', 0.1, 10);
  return {
    type,
    ...(lineId ? { lineId } : {}),
    ...(targetEntityId === undefined ? {} : { targetEntityId }),
    ...(targetObjectId === undefined ? {} : { targetObjectId }),
    ...(targetItemId === undefined ? {} : { targetItemId }),
    ...(seconds === undefined ? {} : { seconds }),
  };
}

function parseAudit(value: unknown): AiDecisionV1['audit'] {
  const record = requireRecord(value, 'audit');
  rejectUnexpectedKeys(record, ['shortReason', 'usedPlayerInput', 'safetyNotes'], 'audit');
  const shortReason = requireString(record.shortReason, 'audit.shortReason');
  const usedPlayerInput = requireBoolean(record.usedPlayerInput, 'audit.usedPlayerInput');
  const safetyNotes = requireArray(record.safetyNotes, 'audit.safetyNotes').map((entry, index) => requireString(entry, `audit.safetyNotes[${index}]`));
  return { shortReason, usedPlayerInput, safetyNotes };
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`codex worker output ${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function rejectUnexpectedKeys(record: Record<string, unknown>, allowedKeys: string[], path: string): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`codex worker output ${path}.${key} is not allowed`);
  }
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`codex worker output ${path} must be an array`);
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`codex worker output ${path} must be a string`);
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`codex worker output ${path} must be a boolean`);
  return value;
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`codex worker output ${path} must be a finite number`);
  return value;
}

function requireNumberInRange(value: unknown, path: string, min: number, max: number): number {
  const numberValue = requireNumber(value, path);
  if (numberValue < min || numberValue > max) throw new Error(`codex worker output ${path} is out of range`);
  return numberValue;
}

function requireLiteral<T extends string | number>(value: unknown, expected: T, path: string): T {
  if (value !== expected) throw new Error(`codex worker output ${path} must be ${String(expected)}`);
  return expected;
}

function requireEntityKind(value: unknown, path: string): AiEntityKind {
  if (typeof value !== 'string' || !ENTITY_KINDS.has(value as AiEntityKind)) {
    throw new Error(`codex worker output ${path} is invalid`);
  }
  return value as AiEntityKind;
}

function requireIntentType(value: unknown, path: string): AiIntentType {
  if (typeof value !== 'string' || !INTENT_TYPES.has(value as AiIntentType)) {
    throw new Error(`codex worker output ${path} is invalid`);
  }
  return value as AiIntentType;
}
