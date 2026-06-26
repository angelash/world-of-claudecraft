import { describe, expect, it } from 'vitest';
import { isAmbientBotConnectionRefused } from '../server/ambient_bots/connection_gate';

describe('ambient bot connection gate', () => {
  it('lets ambient bots bypass the hard per-ip limit without bypassing blocklists', () => {
    expect(isAmbientBotConnectionRefused({
      blocked: false,
      isAdmin: false,
      isAmbientBot: true,
      ipSessions: 999,
      hardLimit: 20,
    })).toBe(false);

    expect(isAmbientBotConnectionRefused({
      blocked: true,
      isAdmin: false,
      isAmbientBot: true,
      ipSessions: 999,
      hardLimit: 20,
    })).toBe(true);
  });

  it('preserves the existing admin bypass and human hard-limit behavior', () => {
    expect(isAmbientBotConnectionRefused({
      blocked: true,
      isAdmin: true,
      isAmbientBot: false,
      ipSessions: 999,
      hardLimit: 20,
    })).toBe(false);

    expect(isAmbientBotConnectionRefused({
      blocked: false,
      isAdmin: false,
      isAmbientBot: false,
      ipSessions: 20,
      hardLimit: 20,
    })).toBe(true);
  });
});
