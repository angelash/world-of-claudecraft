// Gateway validation shared by hosts. The sender never trusts a renderer reservation.

import type { Cost } from '../budget';
import type { LlmCallSpec } from '../contracts';
import { capsReady, isCloudConnection, type LlmSettings } from '../llm_config/settings';
import { costWithCard, estimateTokens, fallbackCardOf, maxCard } from '../pricing';
import { checkBaseUrl } from '../providers/address';
import type { ConnectionPublic, ModelProfile } from '../providers/types';

export type GatewayGuard =
  | { ok: true; connection: ConnectionPublic; profile: ModelProfile; reserve: Cost }
  | { ok: false; message: string };

/** A stored credential belongs to this exact service route and authentication target. */
export function connectionFingerprint(
  connection: Pick<ConnectionPublic, 'kind' | 'flavor' | 'baseUrl' | 'auth' | 'extraHeaderNames'>,
): string {
  const address = checkBaseUrl(connection.baseUrl, connection.kind, { flavor: connection.flavor });
  if (!address.ok) return '';
  return JSON.stringify({
    provider: connection.kind,
    flavor: connection.flavor ?? '',
    endpoint: address.url,
    auth: connection.auth.scheme,
    header: connection.auth.headerName?.toLowerCase() ?? '',
    headers: [...connection.extraHeaderNames].map((h) => h.toLowerCase()).sort(),
  });
}

/** Validate the configured route and compute a pessimistic reservation from the prompt. */
export function checkGatewayRoute(settings: LlmSettings, spec: LlmCallSpec): GatewayGuard {
  const connection = settings.connections.find((c) => c.id === spec.connectionId);
  if (!connection || connection.kind !== spec.provider || settings.preset === 'off') {
    return { ok: false, message: 'connection not configured' };
  }
  if (!checkBaseUrl(connection.baseUrl, connection.kind, { flavor: connection.flavor }).ok) {
    return { ok: false, message: 'connection address is invalid' };
  }
  const profile = connection.models.find((p) => p.model === spec.model);
  if (!profile || spec.output.maxTokens > profile.capability.maxOutputTokens) {
    return { ok: false, message: 'model or output limit is not configured' };
  }
  if (
    isCloudConnection(connection) &&
    (!capsReady(settings) || !settings.consentedConnectionIds.includes(connection.id))
  ) {
    return { ok: false, message: 'cloud consent and spending limits are required' };
  }
  const input = Math.ceil(
    estimateTokens(JSON.stringify({ segments: spec.segments, schema: spec.output.schema })) * 1.15,
  );
  const tokens = Math.max(spec.reserve.tokens, input + spec.output.maxTokens);
  const card = profile.price;
  const worstCard =
    card && connection.kind === 'anthropic' && connection.serverFallback
      ? maxCard(card, fallbackCardOf(profile.model))
      : card;
  const usd = worstCard
    ? Math.max(
        spec.reserve.usd,
        costWithCard(
          {
            ...worstCard,
            input: Math.max(
              worstCard.input,
              worstCard.cacheWrite5m ?? 0,
              worstCard.cacheWrite1h ?? 0,
            ),
          },
          {
            inputTokens: input,
            outputTokens: spec.output.maxTokens,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
          },
          settings.caps.fxCnyPerUsd,
        ),
      )
    : undefined;
  return {
    ok: true,
    connection,
    profile,
    reserve: { tokens, ...(usd !== undefined ? { usd } : {}) },
  };
}
