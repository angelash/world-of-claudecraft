// MockProvider: scripted answers for tests; never touches a network.

import type {
  LlmErrorCode,
  LlmFailure,
  LlmOutcome,
  LlmProvider,
  LlmRequest,
  LlmResult,
  LlmUsage,
  ModelTier,
} from '../contracts';
import { EMPTY_USAGE } from '../contracts';

export type MockAnswer =
  | LlmOutcome
  /** shorthand for a successful answer with this JSON */
  | { json: unknown; costUsd?: number; usage?: Partial<LlmUsage>; model?: string };

export type MockStep =
  | MockAnswer
  | ((req: LlmRequest, call: number) => MockAnswer | Promise<MockAnswer>);

export interface MockProviderOptions {
  available?: boolean;
  /** Keep answering with the last step when the script runs out (default false). */
  repeatLast?: boolean;
  tiers?: Partial<Record<ModelTier, string>>;
}

/** Scripted provider for tests: answers in order, records every request it receives. */
export class MockProvider implements LlmProvider {
  readonly id = 'mock';
  readonly calls: LlmRequest[] = [];
  private readonly script: MockStep[];
  private readonly opts: MockProviderOptions;
  isAvailable: boolean;

  constructor(script: MockStep[] | MockStep = [], opts: MockProviderOptions = {}) {
    this.script = Array.isArray(script) ? [...script] : [script];
    this.opts = opts;
    this.isAvailable = opts.available ?? true;
  }

  /** A successful answer carrying `json` (and the same object as text). */
  static ok(json: unknown, extra: Partial<LlmResult> = {}): LlmResult {
    return {
      ok: true,
      json,
      text: JSON.stringify(json),
      usage: { ...EMPTY_USAGE },
      model: 'mock',
      stopReason: 'end_turn',
      costUsd: 0,
      latencyMs: 0,
      ...extra,
    };
  }

  static fail(error: LlmErrorCode, message: string = error): LlmFailure {
    return { ok: false, error, message };
  }

  available(): boolean {
    return this.isAvailable;
  }

  tierModels(): Partial<Record<ModelTier, string>> {
    return this.opts.tiers ?? {};
  }

  async complete(req: LlmRequest): Promise<LlmOutcome> {
    const n = this.calls.length;
    this.calls.push(req);
    let step = this.script[n];
    if (step === undefined && this.opts.repeatLast) step = this.script[this.script.length - 1];
    if (step === undefined) return MockProvider.fail('mock_exhausted', '脚本已用完');
    const answer = typeof step === 'function' ? await step(req, n) : step;
    if ('ok' in answer) return answer;
    return MockProvider.ok(answer.json, {
      costUsd: answer.costUsd ?? 0,
      usage: { ...EMPTY_USAGE, ...answer.usage },
      model: answer.model ?? 'mock',
    });
  }
}
