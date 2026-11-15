// EchoTransport (docs/50_tech/llm_providers.md 16.1; ai_architecture.md 13): answers every
// call with the request's own deterministic fallback, wrapped as a proposal, at zero cost.
// The whole model path runs (routing, budget, prompt, validation) while the world evolves as
// the built-in AI would make it, which is what switching and replay tests compare against.
// echoHost wraps the kernel host so the transport can find each request's fallback. Pure.

import type { AiRequest } from '../../core/ai_port';
import type { AbortSignalLike, LlmCallResult, LlmCallSpec, LlmTransport } from '../contracts';
import { EMPTY_USAGE } from '../contracts';

type FallbackOf = (requestId: string) => readonly { kind: string; data: unknown }[] | undefined;

/** The kernel request id of a spec ('ai12#1' is attempt one of 'ai12'). */
export function baseRequestId(spec: Pick<LlmCallSpec, 'requestId'>): string {
  return spec.requestId.replace(/#\d+$/, '');
}

export class EchoTransport implements LlmTransport {
  readonly calls: LlmCallSpec[] = [];

  constructor(private readonly fallbackOf: FallbackOf) {}

  async send(spec: LlmCallSpec, _opts?: { signal?: AbortSignalLike }): Promise<LlmCallResult> {
    this.calls.push(spec);
    const commands = (this.fallbackOf(baseRequestId(spec)) ?? []).map((c) => ({
      kind: c.kind,
      data: JSON.stringify(c.data ?? {}),
    }));
    const json = { commands };
    return {
      ok: true,
      json,
      text: JSON.stringify(json),
      stopReason: 'end',
      usage: { ...EMPTY_USAGE },
      servedModel: spec.model,
      costUsd: 0,
      latencyMs: 0,
    };
  }
}

/** A host wrapper that remembers the fallback of every request the runner takes. */
export function echoHost<H extends { takeAiRequests(limit?: number): AiRequest[] }>(
  host: H,
): { host: H; fallbackOf: FallbackOf } {
  const seen = new Map<string, AiRequest['fallback']>();
  const take = host.takeAiRequests.bind(host);
  const wrapped = Object.create(host) as H;
  wrapped.takeAiRequests = (limit?: number) => {
    const batch = take(limit);
    for (const r of batch) seen.set(r.id, r.fallback);
    return batch;
  };
  return {
    host: wrapped,
    fallbackOf: (id) =>
      seen.get(id)?.map((c) => ({ kind: c.kind as string, data: c.data as unknown })),
  };
}
