// ScriptedTransport (docs/50_tech/llm_providers.md 16.1; release_engineering.md 10.8): answers
// by script, keyed by connection, model, decision kind and turn (the n-th call with the same
// key), and records every spec it receives. Used to test routing, bindings, presets,
// lowering and rerouting without a model. Pure.

import type {
  AbortSignalLike,
  LlmCallResult,
  LlmCallSpec,
  LlmTransport,
  LlmUsage,
} from '../contracts';
import { EMPTY_USAGE } from '../contracts';

/** A full receipt, or the shorthand of a successful answer carrying `json`. */
export type ScriptAnswer =
  | LlmCallResult
  | {
      json: unknown;
      text?: string;
      usage?: Partial<LlmUsage>;
      costUsd?: number;
      servedModel?: string;
      /** Body deltas streamed to onDelta before the receipt. */
      deltas?: string[];
    };

export type ScriptStep =
  | ScriptAnswer
  | ((spec: LlmCallSpec, turn: number) => ScriptAnswer | Promise<ScriptAnswer>);

export interface ScriptRule {
  connectionId?: string;
  model?: string;
  /** Decision kind: the part of the spec's purpose before the first '/'. */
  kind?: string;
  /** Only this turn (0-based) of the key; any turn when absent. */
  turn?: number;
  /** One step for every matching call, or one step per turn (the last one repeats). */
  answer: ScriptStep | ScriptStep[];
}

export function kindOfSpec(spec: LlmCallSpec): string {
  return (spec.purpose ?? '').split('/')[0] ?? '';
}

function isReceipt(a: ScriptAnswer): a is LlmCallResult {
  return 'ok' in a && 'latencyMs' in a;
}

/** The receipt of a script answer for this spec. */
export function receiptOf(a: ScriptAnswer, spec: LlmCallSpec): LlmCallResult {
  if (isReceipt(a)) return a;
  const out: LlmCallResult = {
    ok: true,
    json: a.json,
    text: a.text ?? JSON.stringify(a.json),
    stopReason: 'end',
    rawStopReason: 'end_turn',
    usage: { ...EMPTY_USAGE, ...a.usage },
    servedModel: a.servedModel ?? spec.model,
    latencyMs: 0,
  };
  if (a.costUsd !== undefined) out.costUsd = a.costUsd;
  return out;
}

export class ScriptedTransport implements LlmTransport {
  readonly calls: LlmCallSpec[] = [];
  private readonly turns = new Map<string, number>();

  constructor(
    private readonly rules: readonly ScriptRule[],
    private readonly fallback?: ScriptStep,
  ) {}

  /** A transport that answers every call with the same step. */
  static always(step: ScriptStep): ScriptedTransport {
    return new ScriptedTransport([{ answer: step }]);
  }

  async send(
    spec: LlmCallSpec,
    opts: { signal?: AbortSignalLike; onDelta?: (text: string) => void } = {},
  ): Promise<LlmCallResult> {
    this.calls.push(spec);
    const kind = kindOfSpec(spec);
    const key = `${spec.connectionId}|${spec.model}|${kind}`;
    const turn = this.turns.get(key) ?? 0;
    this.turns.set(key, turn + 1);
    const rule = this.rules.find(
      (r) =>
        (r.connectionId === undefined || r.connectionId === spec.connectionId) &&
        (r.model === undefined || r.model === spec.model) &&
        (r.kind === undefined || r.kind === kind) &&
        (r.turn === undefined || r.turn === turn),
    );
    let step: ScriptStep | undefined = this.fallback;
    if (rule) {
      step = Array.isArray(rule.answer)
        ? (rule.answer[Math.min(turn, rule.answer.length - 1)] as ScriptStep)
        : rule.answer;
    }
    if (step === undefined) {
      return {
        ok: false,
        error: { cls: 'bad_request', message: 'script exhausted' },
        latencyMs: 0,
      };
    }
    const answer = typeof step === 'function' ? await step(spec, turn) : step;
    if (!isReceipt(answer)) for (const d of answer.deltas ?? []) opts.onDelta?.(d);
    return receiptOf(answer, spec);
  }
}
