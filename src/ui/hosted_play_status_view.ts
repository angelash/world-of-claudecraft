import type { HostedPlayStatus } from '../net/online';
import { isHostedPlayAutoInviteTargetPartySize } from '../hosted_play_settings';
import type { HostedPlayStatusView } from './hosted_play_panel';

export class HostedPlayCompatibilityError extends Error {
  constructor() {
    super('hosted-play response missing auto-invite settings');
    this.name = 'HostedPlayCompatibilityError';
  }
}

function requireHostedPlayAutoInviteSetting(status: HostedPlayStatus): boolean {
  if (typeof status.autoInviteNearbyPlayers === 'boolean') return status.autoInviteNearbyPlayers;
  throw new HostedPlayCompatibilityError();
}

function requireHostedPlayAutoInviteTargetPartySize(status: HostedPlayStatus): number {
  if (isHostedPlayAutoInviteTargetPartySize(status.autoInviteNearbyTargetPartySize)) {
    return status.autoInviteNearbyTargetPartySize;
  }
  throw new HostedPlayCompatibilityError();
}

export function hostedPlayStatusView(status: HostedPlayStatus): HostedPlayStatusView {
  return {
    online: status.online,
    enabled: status.enabled,
    active: status.active,
    paused: status.paused,
    mode: status.mode,
    objectiveLabel: status.objectiveLabel,
    pauseReason: status.pauseReason,
    pauseSecondsRemaining: status.pauseSecondsRemaining,
    lastError: status.lastError,
    resumeOnLogin: status.resumeOnLogin,
    partyMode: status.partyMode,
    actionLogEnabled: status.actionLogEnabled,
    autoInviteNearbyPlayers: requireHostedPlayAutoInviteSetting(status),
    autoInviteNearbyTargetPartySize: requireHostedPlayAutoInviteTargetPartySize(status),
    groupMode: status.groupMode,
    groupLeaderName: status.groupLeaderName,
    groupLeaderDistance: status.groupLeaderDistance,
    socialPendingReplies: status.socialPendingReplies,
    socialFriends: status.socialFriends,
    socialBlocks: status.socialBlocks,
    lastWhisperFrom: status.lastWhisperFrom,
    lastSocialAction: status.lastSocialAction,
    llmEnabled: status.llmEnabled,
    llmPlanPending: status.llmPlanPending,
    llmPlanMode: status.llmPlanMode,
    llmPlanFocus: status.llmPlanFocus,
    llmPlanStatus: status.llmPlanStatus,
    llmPlanReason: status.llmPlanReason,
    llmSocialStatus: status.llmSocialStatus,
    llmSocialReason: status.llmSocialReason,
    llmSocialTarget: status.llmSocialTarget,
    debug: status.debug,
  };
}
