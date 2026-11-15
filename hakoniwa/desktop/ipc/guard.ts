// The main-process guard every hk:* call passes before its handler runs (the first of the
// two guard levels; docs/50_tech/release_engineering.md 2.3 general rules and
// llm_providers.md 7.4 items 1 and 2): the sender must be the top frame of the expected
// origin, the call must be within its rate, carry at most one argument, stay under the
// channel's size cap and pass the channel's payload check. Pure; the shell logs refusals.

import type { RateLimiter } from '../rate_limit';
import { isTrustedSender, type SenderFrameLike } from '../security';
import type { ChannelDef, HkReason } from './channels';
import { payloadBytes } from './validate';

export type GuardResult<P> =
  | { ok: true; payload: P }
  | {
      ok: false;
      reason: Extract<HkReason, 'forbidden' | 'bad_request' | 'too_large' | 'rate_limited'>;
      detail: string;
    };

export function guardCall<P>(
  channel: ChannelDef<P>,
  frame: SenderFrameLike | null | undefined,
  args: readonly unknown[],
  ctx: { origin: string; limiter: RateLimiter },
): GuardResult<P> {
  if (!isTrustedSender(frame, ctx.origin)) {
    return { ok: false, reason: 'forbidden', detail: 'untrusted sender' };
  }
  const rate = channel.rate;
  if (rate && !ctx.limiter.allow(rate.bucket, rate.max, rate.windowMs)) {
    return { ok: false, reason: 'rate_limited', detail: rate.bucket };
  }
  if (args.length > 1) return { ok: false, reason: 'bad_request', detail: 'too many arguments' };
  const raw = args[0];
  if (payloadBytes(raw, channel.maxBytes) > channel.maxBytes) {
    return { ok: false, reason: 'too_large', detail: 'payload over the channel cap' };
  }
  const checked = channel.payload(raw, channel.name);
  if (!checked.ok) return { ok: false, reason: 'bad_request', detail: checked.error };
  return { ok: true, payload: checked.value };
}
