// Consent and remembered key status belong to the configured route, never just its id.

import { connectionFingerprint } from '../gateway/guard';
import { type LlmSettings, validateSettings } from './settings';

/** A route edit cannot carry an old endpoint's consent or key status along with it. */
export function clearChangedRouteConsent(previous: unknown, next: unknown): LlmSettings {
  const before = validateSettings(previous).settings;
  const after = validateSettings(next).settings;
  const changed = new Set(
    after.connections
      .filter((c) => {
        const old = before.connections.find((v) => v.id === c.id);
        return !!old && connectionFingerprint(old) !== connectionFingerprint(c);
      })
      .map((c) => c.id),
  );
  return {
    ...after,
    connections: after.connections.map((c) =>
      changed.has(c.id) ? { ...c, keyState: 'none', keyLast4: undefined } : c,
    ),
    consentedConnectionIds: after.consentedConnectionIds.filter((id) => !changed.has(id)),
  };
}
