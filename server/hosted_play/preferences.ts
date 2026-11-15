import { normalizeHostedPlayAutoInviteTargetPartySize } from '../../src/hosted_play_settings';
import {
  defaultHostedPlayPreferences,
  type HostedPlayPartyMode,
  type HostedPlayPreferences,
} from './types';

export const HOSTED_PLAY_PREFERENCES_VERSION = 1;

export interface HostedPlayPreferenceRow {
  hosted_play_resume_on_login?: unknown;
  hosted_play_party_mode?: unknown;
  hosted_play_action_log_enabled?: unknown;
  hosted_play_auto_invite_nearby?: unknown;
  hosted_play_auto_invite_target_party_size?: unknown;
  hosted_play_preferences_version?: unknown;
}

function normalizeHostedPlayPartyMode(value: unknown): HostedPlayPartyMode {
  return value === 'follow_leader' ? 'follow_leader' : 'solo';
}

export function hostedPlayPreferencesFromRow(
  row: HostedPlayPreferenceRow | null | undefined,
): HostedPlayPreferences {
  const defaults = defaultHostedPlayPreferences();
  if (!row) return defaults;
  const version = readHostedPlayPreferenceVersion(row.hosted_play_preferences_version);
  if (version < HOSTED_PLAY_PREFERENCES_VERSION && isLegacyHostedPlayDefaultRow(row)) {
    return defaults;
  }
  return {
    resumeOnLogin: row?.hosted_play_resume_on_login === true,
    partyMode: normalizeHostedPlayPartyMode(row?.hosted_play_party_mode),
    actionLogEnabled: row?.hosted_play_action_log_enabled !== false,
    autoInviteNearbyPlayers: row?.hosted_play_auto_invite_nearby === true,
    autoInviteNearbyTargetPartySize: normalizeHostedPlayAutoInviteTargetPartySize(
      row?.hosted_play_auto_invite_target_party_size,
    ),
  };
}

function readHostedPlayPreferenceVersion(value: unknown): number {
  const version = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(version) ? Math.max(0, Math.floor(version)) : 0;
}

function isLegacyHostedPlayDefaultRow(row: HostedPlayPreferenceRow): boolean {
  const targetSize =
    typeof row.hosted_play_auto_invite_target_party_size === 'number'
      ? row.hosted_play_auto_invite_target_party_size
      : Number(row.hosted_play_auto_invite_target_party_size ?? 2);
  return (
    row.hosted_play_resume_on_login !== true &&
    normalizeHostedPlayPartyMode(row.hosted_play_party_mode) === 'solo' &&
    row.hosted_play_action_log_enabled !== false &&
    row.hosted_play_auto_invite_nearby !== true &&
    Number.isFinite(targetSize) &&
    Math.floor(targetSize) === 2
  );
}
