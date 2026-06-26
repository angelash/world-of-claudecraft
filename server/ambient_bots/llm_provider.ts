import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import type { AiProviderTimingStep } from '../ai/ai_types';
import { envPositiveInt, resolveCodexBinary } from '../ai/codex_worker';
import type { AmbientBotLlmProvider, AmbientBotLlmProviderResult } from './llm_types';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_STDERR_BYTES = 8_192;

export interface AmbientBotCodexCliProviderOptions {
  codexBin?: string;
  timeoutMs?: number;
  maxStderrBytes?: number;
  repoRoot?: string;
}

export class AmbientBotCodexCliProvider implements AmbientBotLlmProvider {
  private readonly codexBin: string;
  private readonly timeoutMs: number;
  private readonly maxStderrBytes: number;
  private readonly repoRoot: string;

  constructor(options: AmbientBotCodexCliProviderOptions = {}) {
    this.codexBin = options.codexBin ?? process.env.CODEX_BIN ?? resolveCodexBinary();
    this.timeoutMs = options.timeoutMs ?? envPositiveInt('AMBIENT_PLAYER_BOTS_LLM_TIMEOUT_MS', envPositiveInt('AI_CODEX_TIMEOUT_MS', DEFAULT_TIMEOUT_MS));
    this.maxStderrBytes = Math.max(0, Math.floor(options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES));
    this.repoRoot = options.repoRoot ?? process.cwd();
  }

  async decide(input: {
    promptText: string;
    outputSchema: Record<string, unknown>;
  }): Promise<AmbientBotLlmProviderResult> {
    const totalStartedAt = performance.now();
    const steps: AiProviderTimingStep[] = [];
    const recordStep = (key: string, label: string, startedAt: number): void => {
      steps.push({ key, label, ms: performance.now() - startedAt });
    };

    let stepStartedAt = performance.now();
    const dir = await mkdtemp(join(tmpdir(), 'woc-ambient-bot-'));
    recordStep('tempDirMs', 'create temp dir', stepStartedAt);
    const schemaPath = join(dir, 'decision.schema.json');
    const outputPath = join(dir, 'decision.json');
    try {
      stepStartedAt = performance.now();
      await writeFile(schemaPath, JSON.stringify(input.outputSchema, null, 2), 'utf8');
      recordStep('writeSchemaMs', 'write output schema', stepStartedAt);

      stepStartedAt = performance.now();
      const result = await this.execCodex(input.promptText, schemaPath, outputPath);
      recordStep('codexExecMs', 'codex exec subprocess', stepStartedAt);

      let rawOutput = '';
      stepStartedAt = performance.now();
      try {
        rawOutput = await readFile(outputPath, 'utf8');
      } catch (error) {
        if (result.lastAgentMessage) rawOutput = result.lastAgentMessage;
        else throw new Error(`ambient bot codex output missing: ${errorMessage(error)}`);
      }
      recordStep('readOutputMs', 'read structured output', stepStartedAt);

      stepStartedAt = performance.now();
      const value = JSON.parse(rawOutput) as unknown;
      recordStep('parseOutputMs', 'parse structured output', stepStartedAt);
      return {
        value,
        promptText: input.promptText,
        rawOutput,
        providerTimings: {
          provider: 'ambient-bot-codex-exec',
          totalMs: performance.now() - totalStartedAt,
          steps,
        },
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private execCodex(
    promptText: string,
    schemaPath: string,
    outputPath: string,
  ): Promise<{ lastAgentMessage: string | null }> {
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
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve({ lastAgentMessage: state.lastAgentMessage });
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new Error(`ambient bot Codex CLI timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      child.stdin?.write(promptText, 'utf8');
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
      child.on('error', (error) => {
        finish(new Error(`ambient bot Codex CLI could not start (${this.codexBin}): ${errorMessage(error)}`));
      });
      child.on('close', (code, signal) => {
        if (code === 0) finish();
        else finish(new Error(codexExitMessage({
          code,
          signal,
          stderr,
          stderrTruncated,
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
    const item = record.item && typeof record.item === 'object'
      ? record.item as Record<string, unknown>
      : null;
    if (item?.type === 'agent_message' && typeof item.text === 'string' && item.text.trim()) {
      state.lastAgentMessage = item.text.trim();
    }
    return;
  }
  if (type === 'error' || type === 'turn.failed') {
    state.structuredErrorSummary = summarizeStructuredError(record) ?? state.structuredErrorSummary;
  }
}

function summarizeStructuredError(record: Record<string, unknown>): string | null {
  const direct = firstString(record.message, record.detail, record.reason);
  if (direct) return summarizeStructuredErrorText(direct) ?? direct;
  const error = record.error;
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (!error || typeof error !== 'object') return null;
  const nested = error as Record<string, unknown>;
  const message = firstString(nested.message, nested.detail, nested.reason);
  const code = firstString(nested.code, nested.type);
  if (message && code) return `${code}: ${message}`;
  return message ?? code;
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
  const nested = record.error;
  if (nested && typeof nested === 'object') {
    const nestedRecord = nested as Record<string, unknown>;
    const message = firstString(nestedRecord.message, nestedRecord.detail, nestedRecord.reason);
    const code = firstString(nestedRecord.code, nestedRecord.type);
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

function codexExitMessage(input: {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  stderrTruncated: boolean;
  structuredErrorSummary: string | null;
}): string {
  const status = input.code === null
    ? `signal ${input.signal ?? 'unknown'}`
    : `code ${input.code}`;
  const details = [
    input.structuredErrorSummary,
    input.stderr.trim(),
    input.stderrTruncated ? 'ambient bot Codex CLI stderr truncated' : null,
  ].filter((entry): entry is string => Boolean(entry && entry.trim()));
  return details.length > 0
    ? `ambient bot Codex CLI exited with ${status}: ${details.join('\n')}`
    : `ambient bot Codex CLI exited with ${status}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
