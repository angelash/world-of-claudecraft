// IpcTransport (docs/50_tech/llm_providers.md 7.2, 7.3; release_engineering.md 13.9): the
// desktop transport. It hands the spec to the preload bridge's model channel (window.hk.llm,
// reached through PlatformHost.llm), which posts it with a MessagePort to the main process
// and resolves with the gateway's receipt; deltas stream to onDelta; aborting the call sends
// hk:llm.abort. The channel is injected, so this module never touches the DOM or Electron.

import type { AbortSignalLike, LlmCallResult, LlmCallSpec, LlmTransport } from '../contracts';

/**
 * The part of the preload bridge this transport uses; desktop/bridge.ts HkBridge['llm']
 * satisfies it (pinned in tests/llm_transports.test.ts).
 */
export interface IpcLlmChannel {
  /** Streams body deltas to onDelta; resolves with the receipt (never rejects). */
  request(spec: LlmCallSpec, onDelta?: (text: string) => void): Promise<LlmCallResult>;
  abort(requestId: string): void;
}

function abortedResult(): LlmCallResult {
  return { ok: false, error: { cls: 'network', message: 'aborted' }, latencyMs: 0 };
}

function isReceipt(v: unknown): v is LlmCallResult {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { ok?: unknown }).ok === 'boolean' &&
    typeof (v as { latencyMs?: unknown }).latencyMs === 'number'
  );
}

export class IpcTransport implements LlmTransport {
  constructor(private readonly channel: IpcLlmChannel) {}

  async send(
    spec: LlmCallSpec,
    opts: { signal?: AbortSignalLike; onDelta?: (text: string) => void } = {},
  ): Promise<LlmCallResult> {
    if (opts.signal?.aborted) return abortedResult();
    let aborted = false;
    opts.signal?.addEventListener('abort', () => {
      aborted = true;
      this.channel.abort(spec.requestId);
    });
    try {
      const r = await this.channel.request(spec, (text) => {
        if (!aborted) opts.onDelta?.(text);
      });
      // After an abort the gateway still answers for what was sent (7.3): keep its usage so
      // the late receipt corrects the kept estimate; only the deltas stop.
      if (aborted && !isReceipt(r)) return abortedResult();
      return isReceipt(r)
        ? r
        : {
            ok: false,
            error: { cls: 'bad_request', message: 'malformed receipt from the shell' },
            latencyMs: 0,
          };
    } catch {
      return aborted
        ? abortedResult()
        : {
            ok: false,
            error: { cls: 'network', message: 'the shell channel failed' },
            problem: 'network',
            latencyMs: 0,
          };
    }
  }
}
