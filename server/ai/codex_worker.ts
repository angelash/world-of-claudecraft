import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { AiDecisionV1, AiEntityKind, AiIntentType, AiJobContextV1, AiProvider, AiSpeech } from './ai_types';
import { buildCodexDecisionPrompt } from './prompt_builder';

export interface CodexCliProviderOptions {
  codexBin?: string;
  timeoutMs?: number;
  maxStderrBytes?: number;
  repoRoot?: string;
}

const AI_DECISION_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schemaVersion: { type: 'number', enum: [1] },
    jobId: { type: 'string' },
    entityRef: {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['npc', 'mob', 'object'] },
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
        anyOf: [
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              mode: { type: 'string', enum: ['lineId'] },
              lineId: { type: 'string' },
              values: {
                type: ['object', 'null'],
                additionalProperties: { type: ['string', 'number'] },
              },
            },
            required: ['mode', 'lineId', 'values'],
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              mode: { type: 'string', enum: ['dynamicText'] },
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
            type: 'string',
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
          lineId: { type: ['string', 'null'] },
          targetEntityId: { type: ['number', 'null'] },
          targetObjectId: { type: ['number', 'null'] },
          targetItemId: { type: ['string', 'null'] },
          seconds: { type: ['number', 'null'], minimum: 0.1, maximum: 10 },
        },
        required: ['type', 'lineId', 'targetEntityId', 'targetObjectId', 'targetItemId', 'seconds'],
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
const DEFAULT_TIMEOUT_MS = 45_000;

export class CodexCliProvider implements AiProvider {
  private readonly codexBin: string;
  private readonly timeoutMs: number;
  private readonly maxStderrBytes: number;
  private readonly repoRoot: string;

  constructor(options: CodexCliProviderOptions = {}) {
    this.codexBin = options.codexBin ?? process.env.CODEX_BIN ?? resolveCodexBinary();
    this.timeoutMs = options.timeoutMs ?? envPositiveInt('AI_CODEX_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
    this.maxStderrBytes = Math.max(0, Math.floor(options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES));
    this.repoRoot = options.repoRoot ?? process.cwd();
  }

  async decide(context: AiJobContextV1): Promise<AiDecisionV1> {
    const dir = await mkdtemp(join(tmpdir(), 'woc-ai-'));
    const inputPath = join(dir, 'job.json');
    const outputPath = join(dir, 'decision.json');
    const schemaPath = join(dir, 'decision.schema.json');
    await writeFile(inputPath, JSON.stringify(context, null, 2), 'utf8');
    await writeFile(schemaPath, JSON.stringify(AI_DECISION_OUTPUT_SCHEMA, null, 2), 'utf8');
    try {
      const result = await this.execCodex(context, schemaPath, outputPath);
      let raw: string;
      try {
        raw = await readFile(outputPath, 'utf8');
      } catch (err) {
        if (result.lastAgentMessage) raw = result.lastAgentMessage;
        else throw new Error(`Codex CLI completed but did not write a structured decision: ${errorMessage(err)}`);
      }
      return parseCodexDecisionOutput(raw);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private execCodex(
    context: AiJobContextV1,
    schemaPath: string,
    outputPath: string,
  ): Promise<{ lastAgentMessage: string | null }> {
    const prompt = buildCodexDecisionPrompt(context);
    const args = [
      '--ask-for-approval',
      'never',
      'exec',
      '--disable',
      'plugins',
      '--ephemeral',
      '--json',
      '--color',
      'never',
      '--sandbox',
      'read-only',
      '-C',
      this.repoRoot,
      '--output-schema',
      schemaPath,
      '-o',
      outputPath,
      '-',
    ];
    return new Promise((resolve, reject) => {
      const child = spawn(this.codexBin, args, {
        cwd: this.repoRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stderr = '';
      let stderrTruncated = false;
      let settled = false;
      const state: CodexJsonEventState = {
        lastAgentMessage: null,
        structuredErrorSummary: null,
      };
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve({ lastAgentMessage: state.lastAgentMessage });
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new Error(`Codex CLI timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      child.stdin?.write(prompt, 'utf8');
      child.stdin?.end();
      if (child.stdout) {
        const stdout = createInterface({ input: child.stdout });
        stdout.on('line', (line) => {
          parseCodexJsonEvent(line, state);
        });
      }
      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        const remaining = this.maxStderrBytes - stderr.length;
        if (remaining > 0) stderr += text.slice(0, remaining);
        if (text.length > remaining) stderrTruncated = true;
      });
      child.on('error', (err) => {
        finish(new Error(`Codex CLI could not start (${this.codexBin}): ${errorMessage(err)}. Set CODEX_BIN to a working Codex executable.`));
      });
      child.on('close', (code, signal) => {
        if (code === 0) finish();
        else finish(new Error(codexWorkerExitMessage({
          stderr,
          stderrTruncated,
          code,
          signal,
          structuredErrorSummary: state.structuredErrorSummary,
        })));
      });
    });
  }
}

interface CodexJsonEventState {
  lastAgentMessage: string | null;
  structuredErrorSummary: string | null;
}

function parseCodexJsonEvent(line: string, state: CodexJsonEventState): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (!payload || typeof payload !== 'object') return;
  const record = payload as Record<string, unknown>;
  const type = typeof record.type === 'string' ? record.type : '';
  if (type === 'item.completed') {
    const item = record.item && typeof record.item === 'object' ? record.item as Record<string, unknown> : null;
    if (item?.type === 'agent_message' && typeof item.text === 'string' && item.text.trim()) {
      state.lastAgentMessage = item.text.trim();
    }
    return;
  }
  if (type === 'error' || type === 'turn.failed') {
    state.structuredErrorSummary = summarizeCodexStructuredError(record) ?? state.structuredErrorSummary;
  }
}

function summarizeCodexStructuredError(record: Record<string, unknown>): string | null {
  const direct = firstString(record.message, record.detail, record.reason);
  if (direct) return summarizeStructuredErrorText(direct) ?? direct;
  const error = record.error;
  if (typeof error === 'string' && error.trim()) {
    const trimmed = error.trim();
    return summarizeStructuredErrorText(trimmed) ?? trimmed;
  }
  if (error && typeof error === 'object') {
    const errRecord = error as Record<string, unknown>;
    const message = firstString(errRecord.message, errRecord.detail, errRecord.reason);
    const code = firstString(errRecord.code, errRecord.type);
    const summary = message ? summarizeStructuredErrorText(message) : null;
    if (summary) return code && !summary.startsWith(`${code}:`) ? `${code}: ${summary}` : summary;
    if (message && code) return `${code}: ${message}`;
    return message ?? code;
  }
  return null;
}

function summarizeStructuredErrorText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  const nestedError = record.error;
  if (nestedError && typeof nestedError === 'object') {
    const errRecord = nestedError as Record<string, unknown>;
    const message = firstString(errRecord.message, errRecord.detail, errRecord.reason);
    const code = firstString(errRecord.code, errRecord.type);
    if (message && code) return `${code}: ${message}`;
    return message ?? code;
  }
  const message = firstString(record.message, record.detail, record.reason);
  const code = firstString(record.code, record.type);
  if (message && code) return `${code}: ${message}`;
  return message ?? code;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function codexWorkerExitMessage(input: {
  stderr: string;
  stderrTruncated: boolean;
  code: number | null;
  signal: NodeJS.Signals | null;
  structuredErrorSummary: string | null;
}): string {
  const status = input.code === null
    ? `signal ${input.signal ?? 'unknown'}`
    : `code ${input.code}`;
  const details = [
    input.structuredErrorSummary,
    input.stderr.trim(),
    input.stderrTruncated ? 'Codex CLI stderr truncated' : null,
  ].filter((entry): entry is string => Boolean(entry && entry.trim()));
  return details.length > 0
    ? `Codex CLI exited with ${status}: ${details.join('\n')}`
    : `Codex CLI exited with ${status}`;
}

export function resolveCodexBinary(env: NodeJS.ProcessEnv = process.env): string {
  const localAppData = env.LOCALAPPDATA;
  if (localAppData) {
    const windowsUserInstall = join(localAppData, 'OpenAI', 'Codex', 'bin', 'codex.exe');
    if (existsSync(windowsUserInstall)) return windowsUserInstall;
  }
  return process.platform === 'win32' ? 'codex.exe' : 'codex';
}

function envPositiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
    const values = record.values === undefined || record.values === null ? undefined : parseSpeechValues(record.values);
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
  const lineId = record.lineId === undefined || record.lineId === null ? undefined : requireString(record.lineId, 'intent.lineId');
  const targetEntityId = record.targetEntityId === undefined || record.targetEntityId === null ? undefined : requireNumber(record.targetEntityId, 'intent.targetEntityId');
  const targetObjectId = record.targetObjectId === undefined || record.targetObjectId === null ? undefined : requireNumber(record.targetObjectId, 'intent.targetObjectId');
  const targetItemId = record.targetItemId === undefined || record.targetItemId === null ? undefined : requireString(record.targetItemId, 'intent.targetItemId');
  const seconds = record.seconds === undefined || record.seconds === null ? undefined : requireNumberInRange(record.seconds, 'intent.seconds', 0.1, 10);
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
