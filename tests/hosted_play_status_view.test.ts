import { describe, expect, it } from 'vitest';

import type { HostedPlayStatus } from '../src/net/online';
import {
  HostedPlayCompatibilityError,
  hostedPlayStatusView,
} from '../src/ui/hosted_play_status_view';

function hostedPlayStatus(
  overrides: Partial<HostedPlayStatus> = {},
): HostedPlayStatus {
  return {
    characterId: 7,
    characterName: 'Hero',
    playerClass: 'warrior',
    online: true,
    enabled: false,
    active: false,
    paused: false,
    mode: 'disabled',
    objectiveId: '',
    objectiveLabel: '',
    pauseReason: '',
    pauseUntilMs: null,
    pauseSecondsRemaining: 0,
    lastError: '',
    lastAutomationAtMs: null,
    resumeOnLogin: false,
    partyMode: 'solo',
    actionLogEnabled: true,
    autoInviteNearbyPlayers: false,
    autoInviteNearbyTargetPartySize: 2,
    groupMode: '',
    groupLeaderName: '',
    groupLeaderDistance: 0,
    socialPendingReplies: 0,
    socialFriends: 0,
    socialBlocks: 0,
    lastWhisperFrom: '',
    lastSocialAction: '',
    llmEnabled: false,
    llmPlanPending: false,
    llmPlanMode: '',
    llmPlanFocus: '',
    llmPlanStatus: '',
    llmPlanReason: '',
    llmSocialStatus: '',
    llmSocialReason: '',
    llmSocialTarget: '',
    debug: {
      lastBrainAtMs: null,
      lastBrainAgeMs: null,
      lastAutomationAtMs: null,
      lastAutomationAgeMs: null,
      brainDrivePaused: false,
      objectiveId: '',
      objectiveLabel: '',
      objectiveQuestId: '',
      objectiveDungeonId: '',
      objectiveSuggestedPartySize: 0,
      moveInput: {},
      facing: null,
      commands: [],
      travelGoal: null,
      brainState: {
        objectiveSinceMs: null,
        lastProgressAtMs: null,
        pathGoalKey: '',
        pathLength: 0,
        nextPathPoint: null,
        campIndex: 0,
        noTargetSinceMs: null,
        stuckResets: 0,
        lastCommandAtMs: [],
      },
      party: {
        groupMode: '',
        groupLeaderName: '',
        groupLeaderDistance: 0,
        brainDrivePaused: false,
        partyRole: '',
        partyDuty: '',
        intentKind: '',
        intentBehavior: '',
        intentSummary: '',
        intentTargetName: '',
        lastPartyChatAction: '',
      },
      social: {
        pendingReplies: [],
      },
      llm: {
        enabled: false,
        planPending: false,
        planStatus: '',
        planReason: '',
        planProvider: '',
        planLatencyMs: null,
        planPrompt: '',
        planRawOutput: '',
        planPromptChars: 0,
        planRawOutputChars: 0,
        planCacheHit: false,
        planMode: '',
        planFocus: '',
        socialStatus: '',
        socialReason: '',
        socialTarget: '',
        socialProvider: '',
        socialLatencyMs: null,
        socialPrompt: '',
        socialRawOutput: '',
        socialPromptChars: 0,
        socialRawOutputChars: 0,
        socialCacheHit: false,
      },
      lastError: '',
    },
    ...overrides,
  };
}

describe('hostedPlayStatusView', () => {
  it('maps the auto-invite setting from hosted-play responses', () => {
    expect(hostedPlayStatusView(hostedPlayStatus({
      autoInviteNearbyPlayers: true,
      autoInviteNearbyTargetPartySize: 4,
    }))).toMatchObject({
      autoInviteNearbyPlayers: true,
      autoInviteNearbyTargetPartySize: 4,
      actionLogEnabled: true,
      partyMode: 'solo',
    });
  });

  it('throws a compatibility error when the backend response is missing the new auto-invite target size', () => {
    const status = hostedPlayStatus();
    delete (status as Partial<HostedPlayStatus>).autoInviteNearbyTargetPartySize;

    expect(() => hostedPlayStatusView(status)).toThrow(HostedPlayCompatibilityError);
  });
});
