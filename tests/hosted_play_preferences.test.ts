import { describe, expect, it } from 'vitest';
import { hostedPlayPreferencesFromRow } from '../server/hosted_play/preferences';

describe('hosted-play preference row normalization', () => {
  it('preserves the legacy default migration without a second database read', () => {
    expect(hostedPlayPreferencesFromRow({ hosted_play_preferences_version: 0 })).toEqual({
      resumeOnLogin: false,
      partyMode: 'follow_leader',
      actionLogEnabled: true,
      autoInviteNearbyPlayers: true,
      autoInviteNearbyTargetPartySize: 5,
    });
  });
  it('preserves explicit current-version choices and normalizes malformed values', () => {
    expect(
      hostedPlayPreferencesFromRow({
        hosted_play_preferences_version: '1',
        hosted_play_resume_on_login: true,
        hosted_play_party_mode: 'unknown',
        hosted_play_action_log_enabled: false,
        hosted_play_auto_invite_nearby: false,
        hosted_play_auto_invite_target_party_size: '3',
      }),
    ).toEqual({
      resumeOnLogin: true,
      partyMode: 'solo',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 5,
    });
  });
});
