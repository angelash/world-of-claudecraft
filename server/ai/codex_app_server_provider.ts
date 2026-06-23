import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import type {
  AiJobContextV1,
  AiProvider,
  AiProviderDecisionResult,
  AiProviderTimingStep,
} from './ai_types';
import {
  AI_DECISION_OUTPUT_SCHEMA,
  envPositiveInt,
  parseCodexDecisionOutput,
  resolveCodexBinary,
} from './codex_worker';
import { buildCodexDecisionPrompt } from './prompt_builder';

export interface CodexAppServerProviderOptions {
  codexBin?: string;
  timeoutMs?: number;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  poolSize?: number;
  repoRoot?: string;
  model?: string | null;
  effort?: string | null;
  startImmediately?: boolean;
}

interface JsonRpcPending {
  method: string;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

interface CodexAppWorker {
  threadId: string;
  queue: Promise<void>;
}

interface ActiveTurn {
  threadId: string;
  agentMessage: string;
  completedAgentMessage: string;
  firstDeltaMs: number | null;
  firstAgentMessageMs: number | null;
  resolve: () => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  startedAt: number;
}

interface JsonRpcErrorShape {
  code?: number;
  message?: string;
}

const DEFAULT_POOL_SIZE = 2;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_STARTUP_TIMEOUT_MS = 20_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_EFFORT = 'low';
const MAX_STDERR_BYTES = 12_000;

const BASE_INSTRUCTIONS = [
  'You are the World of ClaudeCraft AI life layer worker for one game interaction.',
  'Do not run tools, inspect files, edit files, or describe your reasoning.',
  'Use only the job context in the user message.',
  'Return exactly one JSON object matching the output schema.',
  'No Markdown, no commentary, no code fences.',
].join('\n');

export class CodexAppServerProvider implements AiProvider {
  private readonly codexBin: string;
  private readonly timeoutMs: number;
  private readonly startupTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly poolSize: number;
  private readonly repoRoot: string;
  private readonly model: string | null;
  private readonly effort: string | null;
  private child: ChildProcessWithoutNullStreams | null = null;
  private readline: ReadlineInterface | null = null;
  private nextRequestId = 1;
  private readonly pending = new Map<number, JsonRpcPending>();
  private readonly activeTurns = new Map<string, ActiveTurn>();
  private workers: CodexAppWorker[] = [];
  private nextWorkerIndex = 0;
  private startPromise: Promise<void> | null = null;
  private stderr = '';
  private stderrTruncated = false;
  private closed = false;

  constructor(options: CodexAppServerProviderOptions = {}) {
    this.codexBin = options.codexBin ?? process.env.CODEX_BIN ?? resolveCodexBinary();
    this.timeoutMs = options.timeoutMs ?? envPositiveInt('AI_CODEX_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
    this.startupTimeoutMs = options.startupTimeoutMs ?? envPositiveInt('AI_CODEX_APP_SERVER_STARTUP_TIMEOUT_MS', DEFAULT_STARTUP_TIMEOUT_MS);
    this.requestTimeoutMs = options.requestTimeoutMs ?? envPositiveInt('AI_CODEX_APP_SERVER_REQUEST_TIMEOUT_MS', DEFAULT_REQUEST_TIMEOUT_MS);
    this.poolSize = Math.max(1, Math.min(8, Math.floor(options.poolSize ?? envPositiveInt('AI_CODEX_APP_SERVER_POOL_SIZE', DEFAULT_POOL_SIZE))));
    this.repoRoot = options.repoRoot ?? process.cwd();
    this.model = options.model ?? optionalEnv('AI_CODEX_MODEL');
    this.effort = options.effort ?? optionalEnv('AI_CODEX_APP_SERVER_EFFORT') ?? DEFAULT_EFFORT;
    if (options.startImmediately ?? true) this.warmup();
  }

  warmup(): void {
    void this.ensureReady().catch((err) => {
      console.warn('Codex app-server warmup failed:', errorMessage(err));
    });
  }

  close(): void {
    this.closed = true;
    this.failPending(new Error('Codex app-server provider closed'));
    this.readline?.close();
    this.readline = null;
    this.child?.kill();
    this.child = null;
    this.workers = [];
    this.startPromise = null;
  }

  async decide(context: AiJobContextV1): Promise<AiProviderDecisionResult> {
    const totalStartedAt = performance.now();
    const steps: AiProviderTimingStep[] = [];
    const recordStep = (key: string, label: string, startedAt: number): void => {
      steps.push({ key, label, ms: performance.now() - startedAt });
    };

    let stepStartedAt = performance.now();
    const promptText = buildCodexDecisionPrompt(context);
    recordStep('buildPromptMs', 'build prompt', stepStartedAt);

    stepStartedAt = performance.now();
    await this.ensureReady();
    recordStep('startupWaitMs', 'wait for app-server warmup', stepStartedAt);

    return this.runWithWorker(async (worker, queueWaitMs) => {
      steps.push({ key: 'queueWaitMs', label: 'wait for app-server worker', ms: queueWaitMs });
      const rawOutput = await this.runTurn(worker, promptText, steps);
      stepStartedAt = performance.now();
      const decision = parseCodexDecisionOutput(rawOutput);
      recordStep('parseOutputMs', 'parse structured output', stepStartedAt);
      return {
        decision,
        promptText,
        rawOutput,
        providerTimings: {
          provider: 'codex-app-server',
          totalMs: performance.now() - totalStartedAt,
          steps,
        },
      };
    });
  }

  private async ensureReady(): Promise<void> {
    if (this.closed) throw new Error('Codex app-server provider is closed');
    if (this.child && this.workers.length === this.poolSize) return;
    if (!this.startPromise) {
      this.startPromise = this.startAppServer().finally(() => {
        this.startPromise = null;
      });
    }
    await this.startPromise;
  }

  private async startAppServer(): Promise<void> {
    this.failPending(new Error('Codex app-server restarting'));
    this.readline?.close();
    this.child?.kill();
    this.readline = null;
    this.child = null;
    this.workers = [];
    this.stderr = '';
    this.stderrTruncated = false;

    const args = ['app-server', '--listen', 'stdio://', '--disable', 'plugins'];
    const child = spawn(this.codexBin, args, {
      cwd: this.repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;
    this.readline = createInterface({ input: child.stdout });
    this.readline.on('line', (line) => this.handleLine(line));
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      const remaining = MAX_STDERR_BYTES - this.stderr.length;
      if (remaining > 0) this.stderr += text.slice(0, remaining);
      if (text.length > remaining) this.stderrTruncated = true;
    });
    child.on('error', (err) => {
      this.failPending(new Error(`Codex app-server could not start (${this.codexBin}): ${errorMessage(err)}`));
    });
    child.on('close', (code, signal) => {
      const reason = code === null ? `signal ${signal ?? 'unknown'}` : `code ${code}`;
      this.child = null;
      this.readline?.close();
      this.readline = null;
      this.workers = [];
      this.failPending(new Error(`Codex app-server exited with ${reason}${this.stderrSummary()}`));
    });

    await this.sendRequest('initialize', {
      clientInfo: {
        name: 'world_of_claudecraft',
        title: 'World of ClaudeCraft',
        version: '0.10.0',
      },
      capabilities: {
        experimentalApi: true,
        optOutNotificationMethods: [
          'mcpServer/startupStatus/updated',
          'remoteControl/status/changed',
          'account/rateLimits/updated',
          'thread/tokenUsage/updated',
        ],
      },
    }, this.startupTimeoutMs);
    this.sendNotification('initialized', {});
    this.workers = await Promise.all(Array.from({ length: this.poolSize }, async () => ({
      threadId: await this.createThread(),
      queue: Promise.resolve(),
    })));
  }

  private async createThread(): Promise<string> {
    const params: Record<string, unknown> = {
      cwd: this.repoRoot,
      ephemeral: true,
      approvalPolicy: 'never',
      sandbox: 'read-only',
      baseInstructions: BASE_INSTRUCTIONS,
    };
    if (this.model) params.model = this.model;
    const result = await this.sendRequest('thread/start', params, this.startupTimeoutMs);
    const thread = recordField(result, 'thread');
    const threadId = stringField(thread, 'id');
    if (!threadId) throw new Error('Codex app-server thread/start did not return a thread id');
    return threadId;
  }

  private async runWithWorker<T>(fn: (worker: CodexAppWorker, queueWaitMs: number) => Promise<T>): Promise<T> {
    const worker = this.nextWorker();
    const queuedAt = performance.now();
    const run = worker.queue
      .catch(() => undefined)
      .then(() => fn(worker, performance.now() - queuedAt));
    worker.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  private nextWorker(): CodexAppWorker {
    if (this.workers.length === 0) throw new Error('Codex app-server has no ready workers');
    const worker = this.workers[this.nextWorkerIndex % this.workers.length];
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
    return worker;
  }

  private async runTurn(worker: CodexAppWorker, promptText: string, steps: AiProviderTimingStep[]): Promise<string> {
    const turnStartedAt = performance.now();
    const turn = await this.startTurn(worker.threadId);
    let stepStartedAt = performance.now();
    const params: Record<string, unknown> = {
      threadId: worker.threadId,
      cwd: this.repoRoot,
      approvalPolicy: 'never',
      sandboxPolicy: { type: 'readOnly', networkAccess: false },
      input: [{ type: 'text', text: promptText }],
      outputSchema: AI_DECISION_OUTPUT_SCHEMA,
    };
    if (this.effort) params.effort = this.effort;
    if (this.model) params.model = this.model;
    try {
      await this.sendRequest('turn/start', params, this.requestTimeoutMs);
    } catch (err) {
      this.cancelActiveTurn(worker.threadId, new Error(`Codex app-server turn/start failed: ${errorMessage(err)}`));
      turn.done.catch(() => undefined);
      throw err;
    }
    steps.push({ key: 'turnStartAckMs', label: 'turn/start acknowledgement', ms: performance.now() - stepStartedAt });
    await turn.done;
    steps.push({ key: 'turnCompleteMs', label: 'model turn completed', ms: performance.now() - turnStartedAt });
    if (turn.firstDeltaMs !== null) {
      steps.push({ key: 'firstDeltaMs', label: 'first streamed token', ms: turn.firstDeltaMs });
    }
    if (turn.firstAgentMessageMs !== null) {
      steps.push({ key: 'firstAgentMessageMs', label: 'first completed message', ms: turn.firstAgentMessageMs });
    }
    const rawOutput = turn.completedAgentMessage || turn.agentMessage;
    if (!rawOutput.trim()) throw new Error('Codex app-server completed without an agent message');

    stepStartedAt = performance.now();
    try {
      worker.threadId = await this.createThread();
    } catch (err) {
      console.warn(`Codex app-server worker thread reset failed: ${errorMessage(err)}`);
      this.restartAfterFailure(new Error(`Codex app-server worker thread reset failed: ${errorMessage(err)}`));
    } finally {
      steps.push({ key: 'threadResetMs', label: 'reset app-server worker thread', ms: performance.now() - stepStartedAt });
    }
    return rawOutput.trim();
  }

  private startTurn(threadId: string): ActiveTurn & { done: Promise<void> } {
    let resolveDone: () => void = () => {};
    let rejectDone: (err: Error) => void = () => {};
    const done = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });
    const turn: ActiveTurn = {
      threadId,
      agentMessage: '',
      completedAgentMessage: '',
      firstDeltaMs: null,
      firstAgentMessageMs: null,
      resolve: resolveDone,
      reject: rejectDone,
      startedAt: performance.now(),
      timer: setTimeout(() => {
        this.activeTurns.delete(threadId);
        this.restartAfterFailure(new Error(`Codex app-server timed out after ${this.timeoutMs}ms`));
        rejectDone(new Error(`Codex app-server timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs),
    };
    this.activeTurns.set(threadId, turn);
    return Object.assign(turn, { done });
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let payload: unknown;
    try {
      payload = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (!payload || typeof payload !== 'object') return;
    const message = payload as Record<string, unknown>;
    if (typeof message.id === 'number') {
      this.handleResponse(message.id, message);
      return;
    }
    const method = stringField(message, 'method');
    if (!method) return;
    const params = recordField(message, 'params');
    this.handleNotification(method, params);
  }

  private handleResponse(id: number, message: Record<string, unknown>): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    const error = recordField(message, 'error') as JsonRpcErrorShape;
    if (error.message) {
      pending.reject(new Error(`Codex app-server ${pending.method} failed: ${error.message}`));
      return;
    }
    pending.resolve(message.result);
  }

  private handleNotification(method: string, params: Record<string, unknown>): void {
    if (method === 'item/agentMessage/delta') {
      const turn = this.activeTurns.get(stringField(params, 'threadId'));
      if (!turn) return;
      const delta = stringField(params, 'delta');
      if (delta && turn.firstDeltaMs === null) turn.firstDeltaMs = performance.now() - turn.startedAt;
      turn.agentMessage += delta;
      return;
    }
    if (method === 'item/completed') {
      const turn = this.activeTurns.get(stringField(params, 'threadId'));
      if (!turn) return;
      const item = recordField(params, 'item');
      if (stringField(item, 'type') === 'agentMessage') {
        const text = stringField(item, 'text');
        if (text && turn.firstAgentMessageMs === null) turn.firstAgentMessageMs = performance.now() - turn.startedAt;
        turn.completedAgentMessage = text;
      }
      return;
    }
    if (method === 'turn/completed') {
      const threadId = stringField(params, 'threadId');
      const turn = this.activeTurns.get(threadId);
      if (!turn) return;
      this.activeTurns.delete(threadId);
      clearTimeout(turn.timer);
      const completed = recordField(params, 'turn');
      const status = recordField(completed, 'status');
      const statusType = stringField(status, 'type');
      if (statusType && statusType !== 'completed' && statusType !== 'idle') {
        turn.reject(new Error(`Codex app-server turn completed with status ${statusType}`));
      } else {
        turn.resolve();
      }
    }
  }

  private sendRequest(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const child = this.child;
    if (!child || child.killed || !child.stdin.writable) {
      return Promise.reject(new Error('Codex app-server is not running'));
    }
    const id = this.nextRequestId++;
    const message = { method, id, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server ${method} request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      child.stdin.write(`${JSON.stringify(message)}\n`, 'utf8');
    });
  }

  private sendNotification(method: string, params: Record<string, unknown>): void {
    const child = this.child;
    if (!child || child.killed || !child.stdin.writable) return;
    child.stdin.write(`${JSON.stringify({ method, params })}\n`, 'utf8');
  }

  private restartAfterFailure(err: Error): void {
    this.child?.kill();
    this.child = null;
    this.readline?.close();
    this.readline = null;
    this.workers = [];
    this.failPending(err);
  }

  private cancelActiveTurn(threadId: string, err: Error): void {
    const turn = this.activeTurns.get(threadId);
    if (!turn) return;
    this.activeTurns.delete(threadId);
    clearTimeout(turn.timer);
    turn.reject(err);
  }

  private failPending(err: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pending.clear();
    for (const turn of this.activeTurns.values()) {
      clearTimeout(turn.timer);
      turn.reject(err);
    }
    this.activeTurns.clear();
  }

  private stderrSummary(): string {
    const details = [
      this.stderr.trim(),
      this.stderrTruncated ? 'Codex app-server stderr truncated' : '',
    ].filter((entry) => entry.length > 0);
    return details.length > 0 ? `: ${details.join('\n')}` : '';
  }
}

function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function recordField(record: unknown, key: string): Record<string, unknown> {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {};
  const value = (record as Record<string, unknown>)[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringField(record: unknown, key: string): string {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return '';
  const value = (record as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
