import { audio } from '../game/audio';
import {
  HOSTED_PLAY_AUTO_INVITE_MIN_PARTY_SIZE,
  HOSTED_PLAY_AUTO_INVITE_TARGET_PARTY_SIZES,
} from '../hosted_play_settings';
import { esc } from './esc';
import { HostedPlayCompatibilityError } from './hosted_play_status_view';
import { formatDateTime, formatNumber, t } from './i18n';
import { svgIcon } from './ui_icons';

export type HostedPlayPartyModeView =
  | 'solo'
  | 'follow_leader';

export type HostedPlayGroupModeView =
  | ''
  | 'accept_invite'
  | 'assist_party'
  | 'brain'
  | 'follow_leader'
  | 'hold_regroup'
  | 'invite_nearby'
  | 'prepare_party';

export type HostedPlayLlmDecisionStatusView =
  | ''
  | 'accepted'
  | 'cache_hit'
  | 'rejected'
  | 'error'
  | 'budget_denied'
  | 'disabled';

export interface HostedPlaySettingsView {
  resumeOnLogin: boolean;
  partyMode: HostedPlayPartyModeView;
  actionLogEnabled: boolean;
  autoInviteNearbyPlayers: boolean;
  autoInviteNearbyTargetPartySize: number;
}

export interface HostedPlayDebugPointView {
  x: number;
  z: number;
}

export interface HostedPlayDebugTravelGoalView {
  target: HostedPlayDebugPointView;
  arrivalRange: number;
  goalKey: string;
}

export interface HostedPlayDebugCommandView {
  summary: string;
  payloadJson: string;
}

export interface HostedPlayDebugCommandAgeView {
  key: string;
  atMs: number;
  ageMs: number;
}

export interface HostedPlayDebugBrainStateView {
  objectiveSinceMs: number | null;
  lastProgressAtMs: number | null;
  pathGoalKey: string;
  pathLength: number;
  nextPathPoint: HostedPlayDebugPointView | null;
  campIndex: number;
  noTargetSinceMs: number | null;
  stuckResets: number;
  lastCommandAtMs: HostedPlayDebugCommandAgeView[];
}

export interface HostedPlayDebugPartyView {
  groupMode: HostedPlayGroupModeView;
  groupLeaderName: string;
  groupLeaderDistance: number;
  brainDrivePaused: boolean;
  partyRole: string;
  partyDuty: string;
  intentKind: string;
  intentBehavior: string;
  intentSummary: string;
  intentTargetName: string;
  lastPartyChatAction: string;
}

export interface HostedPlayDebugPendingReplyView {
  toName: string;
  incomingText: string;
  fallbackText: string;
  dueInMs: number;
  askedForFriend: boolean;
  revision: number;
  llmStatus: string;
  llmReplyText: string;
  llmFriendAction: string;
  llmPresenceEmote: string;
  llmRequestedAgoMs: number | null;
}

export interface HostedPlayDebugSocialView {
  pendingReplies: HostedPlayDebugPendingReplyView[];
}

export interface HostedPlayDebugLlmView {
  enabled: boolean;
  planPending: boolean;
  planStatus: HostedPlayLlmDecisionStatusView;
  planReason: string;
  planProvider: string;
  planLatencyMs: number | null;
  planPrompt: string;
  planRawOutput: string;
  planPromptChars: number;
  planRawOutputChars: number;
  planCacheHit: boolean;
  planMode: string;
  planFocus: string;
  socialStatus: HostedPlayLlmDecisionStatusView;
  socialReason: string;
  socialTarget: string;
  socialProvider: string;
  socialLatencyMs: number | null;
  socialPrompt: string;
  socialRawOutput: string;
  socialPromptChars: number;
  socialRawOutputChars: number;
  socialCacheHit: boolean;
}

export interface HostedPlayDebugStatusView {
  lastBrainAtMs: number | null;
  lastBrainAgeMs: number | null;
  lastAutomationAtMs: number | null;
  lastAutomationAgeMs: number | null;
  brainDrivePaused: boolean;
  objectiveId: string;
  objectiveLabel: string;
  objectiveQuestId: string;
  objectiveDungeonId: string;
  objectiveSuggestedPartySize: number;
  moveInput: Record<string, unknown>;
  facing: number | null;
  commands: HostedPlayDebugCommandView[];
  travelGoal: HostedPlayDebugTravelGoalView | null;
  brainState: HostedPlayDebugBrainStateView;
  party: HostedPlayDebugPartyView;
  social: HostedPlayDebugSocialView;
  llm: HostedPlayDebugLlmView;
  lastError: string;
}

export interface HostedPlayStatusView extends HostedPlaySettingsView {
  online: boolean;
  enabled: boolean;
  active: boolean;
  paused: boolean;
  mode: 'offline' | 'disabled' | 'active' | 'paused';
  objectiveLabel: string;
  pauseReason: '' | 'runtime_error';
  pauseSecondsRemaining: number;
  lastError: string;
  groupMode: HostedPlayGroupModeView;
  groupLeaderName: string;
  groupLeaderDistance: number;
  socialPendingReplies: number;
  socialFriends: number;
  socialBlocks: number;
  lastWhisperFrom: string;
  lastSocialAction: string;
  llmEnabled: boolean;
  llmPlanPending: boolean;
  llmPlanMode: string;
  llmPlanFocus: string;
  llmPlanStatus: HostedPlayLlmDecisionStatusView;
  llmPlanReason: string;
  llmSocialStatus: HostedPlayLlmDecisionStatusView;
  llmSocialReason: string;
  llmSocialTarget: string;
  debug?: HostedPlayDebugStatusView;
}

export interface HostedPlayHooks {
  status(): Promise<HostedPlayStatusView>;
  setEnabled(enabled: boolean): Promise<HostedPlayStatusView>;
  updateSettings(settings: HostedPlaySettingsView): Promise<HostedPlayStatusView>;
}

interface RenderHostedPlayPanelOptions {
  onClose(): void;
}

type HostedPlayActionFailureKey =
  | 'hudChrome.hostedPlay.statusLoadFailed'
  | 'hudChrome.hostedPlay.updateFailed'
  | 'hudChrome.hostedPlay.settingsSaveFailed';

export function renderHostedPlayPanel(
  el: HTMLElement,
  hooks: HostedPlayHooks,
  options: RenderHostedPlayPanelOptions,
): void {
  const body = panelViewShell(el, t('hudChrome.hostedPlay.title'));
  body.classList.add('hosted-play-body');

  const statusBox = document.createElement('div');
  statusBox.className = 'bug-info';
  body.appendChild(statusBox);

  const message = document.createElement('div');
  message.className = 'set-note';
  body.appendChild(message);

  const actions = document.createElement('div');
  actions.className = 'set-choice';
  body.appendChild(actions);

  const settings = document.createElement('div');
  settings.className = 'set-rows';
  body.appendChild(settings);

  const enableBtn = document.createElement('button');
  enableBtn.type = 'button';
  enableBtn.className = 'btn set-choice-btn';
  enableBtn.textContent = t('hudChrome.hostedPlay.enable');
  actions.appendChild(enableBtn);

  const disableBtn = document.createElement('button');
  disableBtn.type = 'button';
  disableBtn.className = 'btn set-choice-btn';
  disableBtn.textContent = t('hudChrome.hostedPlay.disable');
  actions.appendChild(disableBtn);

  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'btn set-choice-btn';
  refreshBtn.textContent = t('hudChrome.hostedPlay.refresh');
  actions.appendChild(refreshBtn);

  const detailsBtn = document.createElement('button');
  detailsBtn.type = 'button';
  detailsBtn.className = 'btn set-choice-btn hosted-play-details-toggle';
  detailsBtn.textContent = t('hudChrome.hostedPlay.details.show');
  detailsBtn.setAttribute('aria-expanded', 'false');
  actions.appendChild(detailsBtn);

  const resumeRow = document.createElement('div');
  resumeRow.className = 'set-row';
  const resumeLabel = document.createElement('span');
  resumeLabel.className = 'set-name';
  resumeLabel.textContent = t('hudChrome.hostedPlay.resumeOnLogin');
  const resumeBtn = document.createElement('button');
  resumeBtn.type = 'button';
  resumeBtn.className = 'btn set-toggle';
  resumeRow.append(resumeLabel, resumeBtn);
  settings.appendChild(resumeRow);

  const actionLogRow = document.createElement('div');
  actionLogRow.className = 'set-row';
  const actionLogLabel = document.createElement('span');
  actionLogLabel.className = 'set-name';
  actionLogLabel.textContent = t('hudChrome.hostedPlay.actionLogLabel');
  const actionLogBtn = document.createElement('button');
  actionLogBtn.type = 'button';
  actionLogBtn.className = 'btn set-toggle';
  actionLogRow.append(actionLogLabel, actionLogBtn);
  settings.appendChild(actionLogRow);

  const autoInviteRow = document.createElement('div');
  autoInviteRow.className = 'set-row';
  const autoInviteLabel = document.createElement('span');
  autoInviteLabel.className = 'set-name';
  autoInviteLabel.textContent = t('hudChrome.hostedPlay.autoInviteNearbyLabel');
  const autoInviteBtn = document.createElement('button');
  autoInviteBtn.type = 'button';
  autoInviteBtn.className = 'btn set-toggle';
  autoInviteRow.append(autoInviteLabel, autoInviteBtn);
  settings.appendChild(autoInviteRow);

  const autoInviteTargetRow = document.createElement('div');
  autoInviteTargetRow.className = 'set-row';
  const autoInviteTargetLabel = document.createElement('span');
  autoInviteTargetLabel.className = 'set-name';
  autoInviteTargetLabel.textContent = t('hudChrome.hostedPlay.autoInviteTargetPartySizeLabel');
  const autoInviteTargetChoices = document.createElement('div');
  autoInviteTargetChoices.className = 'set-choice';
  const autoInviteTargetButtons = HOSTED_PLAY_AUTO_INVITE_TARGET_PARTY_SIZES.map((size) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn set-choice-btn';
    button.textContent = formatNumber(size, { maximumFractionDigits: 0 });
    button.setAttribute(
      'aria-label',
      t('hudChrome.hostedPlay.autoInviteTargetPartySizeAria', {
        count: formatNumber(size, { maximumFractionDigits: 0 }),
      }),
    );
    autoInviteTargetChoices.appendChild(button);
    return { button, size };
  });
  autoInviteTargetRow.append(autoInviteTargetLabel, autoInviteTargetChoices);
  settings.appendChild(autoInviteTargetRow);

  const partyRow = document.createElement('div');
  partyRow.className = 'set-row';
  const partyLabel = document.createElement('span');
  partyLabel.className = 'set-name';
  partyLabel.textContent = t('hudChrome.hostedPlay.partyModeLabel');
  const partyChoices = document.createElement('div');
  partyChoices.className = 'set-choice';
  const partySoloBtn = document.createElement('button');
  partySoloBtn.type = 'button';
  partySoloBtn.className = 'btn set-choice-btn';
  partySoloBtn.textContent = t('hudChrome.hostedPlay.partyMode.solo');
  const partyFollowBtn = document.createElement('button');
  partyFollowBtn.type = 'button';
  partyFollowBtn.className = 'btn set-choice-btn';
  partyFollowBtn.textContent = t('hudChrome.hostedPlay.partyMode.followLeader');
  partyChoices.append(partySoloBtn, partyFollowBtn);
  partyRow.append(partyLabel, partyChoices);
  settings.appendChild(partyRow);

  const detailsBox = document.createElement('div');
  detailsBox.className = 'hosted-play-details';
  detailsBox.hidden = true;
  body.appendChild(detailsBox);

  let pending = false;
  let currentStatus: HostedPlayStatusView | null = null;
  let detailsOpen = false;

  const appendRow = (label: string, value: string) => {
    const row = document.createElement('div');
    row.className = 'bug-info-row';
    const labelEl = document.createElement('span');
    labelEl.className = 'bug-info-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'bug-info-val';
    valueEl.textContent = value;
    row.append(labelEl, valueEl);
    statusBox.appendChild(row);
  };

  const syncControls = () => {
    const online = currentStatus?.online ?? false;
    const enabled = currentStatus?.enabled ?? false;
    enableBtn.disabled = pending || !online || enabled;
    disableBtn.disabled = pending || !enabled;
    refreshBtn.disabled = pending;
    detailsBtn.disabled = !currentStatus;
    detailsBtn.textContent = detailsOpen
      ? t('hudChrome.hostedPlay.details.hide')
      : t('hudChrome.hostedPlay.details.show');
    detailsBtn.setAttribute('aria-expanded', String(detailsOpen));

    const resumeOnLogin = currentStatus?.resumeOnLogin ?? false;
    resumeBtn.disabled = pending || !currentStatus;
    resumeBtn.textContent = resumeOnLogin ? t('hud.options.on') : t('hud.options.off');
    resumeBtn.classList.toggle('off', !resumeOnLogin);
    resumeBtn.setAttribute('aria-pressed', String(resumeOnLogin));
    resumeBtn.setAttribute('aria-label', t('hudChrome.hostedPlay.resumeOnLogin'));

    const actionLogEnabled = currentStatus?.actionLogEnabled ?? true;
    actionLogBtn.disabled = pending || !currentStatus;
    actionLogBtn.textContent = actionLogEnabled ? t('hud.options.on') : t('hud.options.off');
    actionLogBtn.classList.toggle('off', !actionLogEnabled);
    actionLogBtn.setAttribute('aria-pressed', String(actionLogEnabled));
    actionLogBtn.setAttribute('aria-label', t('hudChrome.hostedPlay.actionLogLabel'));

    const autoInviteNearbyPlayers = currentStatus?.autoInviteNearbyPlayers ?? false;
    autoInviteBtn.disabled = pending || !currentStatus;
    autoInviteBtn.textContent = autoInviteNearbyPlayers ? t('hud.options.on') : t('hud.options.off');
    autoInviteBtn.classList.toggle('off', !autoInviteNearbyPlayers);
    autoInviteBtn.setAttribute('aria-pressed', String(autoInviteNearbyPlayers));
    autoInviteBtn.setAttribute('aria-label', t('hudChrome.hostedPlay.autoInviteNearbyLabel'));

    const autoInviteNearbyTargetPartySize =
      currentStatus?.autoInviteNearbyTargetPartySize ?? HOSTED_PLAY_AUTO_INVITE_MIN_PARTY_SIZE;
    for (const { button, size } of autoInviteTargetButtons) {
      const selected = autoInviteNearbyTargetPartySize === size;
      button.disabled = pending || !currentStatus;
      button.classList.toggle('sel', selected);
      button.setAttribute('aria-pressed', String(selected));
    }

    const partyMode = currentStatus?.partyMode ?? 'solo';
    for (const [button, mode] of [
      [partySoloBtn, 'solo'],
      [partyFollowBtn, 'follow_leader'],
    ] as const) {
      const selected = partyMode === mode;
      button.disabled = pending || !currentStatus;
      button.classList.toggle('sel', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  };

  function renderDebugDetails(status: HostedPlayStatusView): void {
    detailsBox.replaceChildren();
    detailsBox.hidden = !detailsOpen;
    if (!detailsOpen) return;
    const debug = status.debug;
    if (!debug) {
      appendDebugNote(detailsBox, t('hudChrome.hostedPlay.details.empty'));
      return;
    }

    appendDebugGroup(detailsBox, t('hudChrome.hostedPlay.details.sectionBrain'), [
      [t('hudChrome.hostedPlay.details.lastBrain'), formatTimeWithAge(debug.lastBrainAtMs, debug.lastBrainAgeMs)],
      [t('hudChrome.hostedPlay.details.lastAutomation'), formatTimeWithAge(debug.lastAutomationAtMs, debug.lastAutomationAgeMs)],
      [t('hudChrome.hostedPlay.details.objectiveId'), valueOrNone(debug.objectiveId)],
      [t('hudChrome.hostedPlay.details.objectiveLabel'), valueOrNone(debug.objectiveLabel)],
      [t('hudChrome.hostedPlay.details.objectiveQuest'), valueOrNone(debug.objectiveQuestId)],
      [t('hudChrome.hostedPlay.details.objectiveDungeon'), valueOrNone(debug.objectiveDungeonId)],
      [
        t('hudChrome.hostedPlay.details.partySize'),
        debug.objectiveSuggestedPartySize > 0
          ? formatNumber(debug.objectiveSuggestedPartySize, { maximumFractionDigits: 0 })
          : t('hudChrome.hostedPlay.details.none'),
      ],
      [t('hudChrome.hostedPlay.details.objectiveSince'), formatTimeWithAge(debug.brainState.objectiveSinceMs)],
      [t('hudChrome.hostedPlay.details.lastProgress'), formatTimeWithAge(debug.brainState.lastProgressAtMs)],
      [t('hudChrome.hostedPlay.details.lastError'), valueOrNone(debug.lastError)],
    ]);

    appendDebugGroup(detailsBox, t('hudChrome.hostedPlay.details.sectionMovement'), [
      [t('hudChrome.hostedPlay.details.brainDrivePaused'), onOffText(debug.brainDrivePaused)],
      [t('hudChrome.hostedPlay.details.facing'), formatNullableNumber(debug.facing, 2)],
      [t('hudChrome.hostedPlay.details.pathGoal'), valueOrNone(debug.brainState.pathGoalKey)],
      [t('hudChrome.hostedPlay.details.pathLength'), formatNumber(debug.brainState.pathLength, { maximumFractionDigits: 0 })],
      [t('hudChrome.hostedPlay.details.nextPathPoint'), formatPoint(debug.brainState.nextPathPoint)],
      [t('hudChrome.hostedPlay.details.campIndex'), formatNumber(debug.brainState.campIndex, { maximumFractionDigits: 0 })],
      [t('hudChrome.hostedPlay.details.noTargetSince'), formatTimeWithAge(debug.brainState.noTargetSinceMs)],
      [t('hudChrome.hostedPlay.details.stuckResets'), formatNumber(debug.brainState.stuckResets, { maximumFractionDigits: 0 })],
      [t('hudChrome.hostedPlay.details.travelGoal'), formatTravelGoal(debug.travelGoal)],
    ]);
    appendDebugBlock(
      detailsBox,
      t('hudChrome.hostedPlay.details.moveInput'),
      formatDebugJson(debug.moveInput),
    );
    appendDebugBlock(
      detailsBox,
      t('hudChrome.hostedPlay.details.commands'),
      formatDebugCommands(debug.commands),
    );
    appendDebugBlock(
      detailsBox,
      t('hudChrome.hostedPlay.details.lastCommandAges'),
      formatCommandAges(debug.brainState.lastCommandAtMs),
    );

    appendDebugGroup(detailsBox, t('hudChrome.hostedPlay.details.sectionParty'), [
      [t('hudChrome.hostedPlay.details.groupMode'), groupModeText(status)],
      [t('hudChrome.hostedPlay.details.groupLeader'), valueOrNone(debug.party.groupLeaderName)],
      [t('hudChrome.hostedPlay.details.groupDistance'), formatNullableNumber(debug.party.groupLeaderDistance, 0)],
      [t('hudChrome.hostedPlay.details.partyPaused'), onOffText(debug.party.brainDrivePaused)],
      [t('hudChrome.hostedPlay.details.partyRole'), partyRoleText(debug.party.partyRole)],
      [t('hudChrome.hostedPlay.details.partyIntent'), partyIntentText(debug.party.intentKind, debug.party.intentBehavior)],
      [t('hudChrome.hostedPlay.details.partyIntentTarget'), valueOrNone(debug.party.intentTargetName)],
      [t('hudChrome.hostedPlay.details.lastPartyChat'), valueOrNone(debug.party.lastPartyChatAction)],
    ]);

    appendDebugBlock(
      detailsBox,
      t('hudChrome.hostedPlay.details.sectionSocial'),
      formatPendingReplies(debug.social.pendingReplies),
    );

    appendDebugGroup(detailsBox, t('hudChrome.hostedPlay.details.sectionLlmPlan'), [
      [t('hudChrome.hostedPlay.details.llmEnabled'), onOffText(debug.llm.enabled)],
      [t('hudChrome.hostedPlay.details.llmPending'), onOffText(debug.llm.planPending)],
      [t('hudChrome.hostedPlay.details.llmStatus'), llmDecisionStatusText(debug.llm.planStatus) || t('hudChrome.hostedPlay.details.none')],
      [t('hudChrome.hostedPlay.details.llmProvider'), valueOrNone(debug.llm.planProvider)],
      [t('hudChrome.hostedPlay.details.llmLatency'), formatMilliseconds(debug.llm.planLatencyMs)],
      [t('hudChrome.hostedPlay.details.llmCacheHit'), onOffText(debug.llm.planCacheHit)],
      [t('hudChrome.hostedPlay.details.llmReason'), valueOrNone(debug.llm.planReason)],
      [t('hudChrome.hostedPlay.details.llmMode'), llmModeText(debug.llm.planMode) || valueOrNone(debug.llm.planMode)],
      [t('hudChrome.hostedPlay.details.llmFocus'), valueOrNone(debug.llm.planFocus)],
      [t('hudChrome.hostedPlay.details.promptChars'), formatNumber(debug.llm.planPromptChars, { maximumFractionDigits: 0 })],
      [t('hudChrome.hostedPlay.details.rawOutputChars'), formatNumber(debug.llm.planRawOutputChars, { maximumFractionDigits: 0 })],
    ]);
    appendDebugBlock(detailsBox, t('hudChrome.hostedPlay.details.planPrompt'), debug.llm.planPrompt);
    appendDebugBlock(detailsBox, t('hudChrome.hostedPlay.details.planRawOutput'), debug.llm.planRawOutput);

    appendDebugGroup(detailsBox, t('hudChrome.hostedPlay.details.sectionLlmSocial'), [
      [t('hudChrome.hostedPlay.details.llmStatus'), llmDecisionStatusText(debug.llm.socialStatus) || t('hudChrome.hostedPlay.details.none')],
      [t('hudChrome.hostedPlay.details.llmTarget'), valueOrNone(debug.llm.socialTarget)],
      [t('hudChrome.hostedPlay.details.llmProvider'), valueOrNone(debug.llm.socialProvider)],
      [t('hudChrome.hostedPlay.details.llmLatency'), formatMilliseconds(debug.llm.socialLatencyMs)],
      [t('hudChrome.hostedPlay.details.llmCacheHit'), onOffText(debug.llm.socialCacheHit)],
      [t('hudChrome.hostedPlay.details.llmReason'), valueOrNone(debug.llm.socialReason)],
      [t('hudChrome.hostedPlay.details.promptChars'), formatNumber(debug.llm.socialPromptChars, { maximumFractionDigits: 0 })],
      [t('hudChrome.hostedPlay.details.rawOutputChars'), formatNumber(debug.llm.socialRawOutputChars, { maximumFractionDigits: 0 })],
    ]);
    appendDebugBlock(detailsBox, t('hudChrome.hostedPlay.details.socialPrompt'), debug.llm.socialPrompt);
    appendDebugBlock(detailsBox, t('hudChrome.hostedPlay.details.socialRawOutput'), debug.llm.socialRawOutput);
  }

  const renderStatus = (status: HostedPlayStatusView) => {
    currentStatus = status;
    statusBox.replaceChildren();
    appendRow(t('hudChrome.hostedPlay.statusLabel'), statusText(status));
    appendRow(
      t('hudChrome.hostedPlay.objectiveLabel'),
      status.objectiveLabel || t('hudChrome.hostedPlay.objectiveNone'),
    );
    appendRow(
      t('hudChrome.hostedPlay.actionLogLabel'),
      status.actionLogEnabled ? t('hud.options.on') : t('hud.options.off'),
    );
    appendRow(
      t('hudChrome.hostedPlay.autoInviteNearbyLabel'),
      status.autoInviteNearbyPlayers ? t('hud.options.on') : t('hud.options.off'),
    );
    appendRow(
      t('hudChrome.hostedPlay.autoInviteTargetPartySizeLabel'),
      formatNumber(status.autoInviteNearbyTargetPartySize, { maximumFractionDigits: 0 }),
    );
    appendRow(t('hudChrome.hostedPlay.partyModeStatusLabel'), partyModeText(status));
    appendRow(t('hudChrome.hostedPlay.groupModeLabel'), groupModeText(status));
    if (status.groupLeaderName) {
      appendRow(t('hudChrome.hostedPlay.groupLeaderLabel'), status.groupLeaderName);
    }
    if (status.groupLeaderDistance > 0) {
      appendRow(
        t('hudChrome.hostedPlay.groupLeaderDistanceLabel'),
        formatNumber(status.groupLeaderDistance, { maximumFractionDigits: 0 }),
      );
    }
    appendRow(
      t('hudChrome.hostedPlay.socialPendingRepliesLabel'),
      formatNumber(status.socialPendingReplies, { maximumFractionDigits: 0 }),
    );
    appendRow(
      t('hudChrome.hostedPlay.socialFriendsLabel'),
      formatNumber(status.socialFriends, { maximumFractionDigits: 0 }),
    );
    appendRow(
      t('hudChrome.hostedPlay.socialBlocksLabel'),
      formatNumber(status.socialBlocks, { maximumFractionDigits: 0 }),
    );
    if (status.lastWhisperFrom) {
      appendRow(t('hudChrome.hostedPlay.lastWhisperFromLabel'), status.lastWhisperFrom);
    }
    if (status.lastSocialAction) {
      appendRow(
        t('hudChrome.hostedPlay.lastSocialActionLabel'),
        lastSocialActionText(status.lastSocialAction),
      );
    }
    appendRow(
      t('hudChrome.hostedPlay.llmEnabledLabel'),
      status.llmEnabled ? t('hud.options.on') : t('hud.options.off'),
    );
    const llmPlan = llmPlanText(status);
    if (llmPlan) appendRow(t('hudChrome.hostedPlay.llmPlanLabel'), llmPlan);
    const llmMode = llmModeText(status.llmPlanMode);
    if (llmMode) appendRow(t('hudChrome.hostedPlay.llmPlanModeLabel'), llmMode);
    if (status.llmPlanFocus) {
      appendRow(t('hudChrome.hostedPlay.llmPlanFocusLabel'), status.llmPlanFocus);
    }
    const llmSocial = llmDecisionStatusText(status.llmSocialStatus);
    if (llmSocial) appendRow(t('hudChrome.hostedPlay.llmReplyLabel'), llmSocial);
    if (status.llmSocialTarget) {
      appendRow(t('hudChrome.hostedPlay.llmReplyTargetLabel'), status.llmSocialTarget);
    }
    const pauseReason = pauseReasonText(status);
    if (pauseReason) appendRow(t('hudChrome.hostedPlay.pauseLabel'), pauseReason);
    if (status.lastError) appendRow(t('hudChrome.hostedPlay.errorLabel'), t('hudChrome.hostedPlay.runtimeIssue'));
    renderDebugDetails(status);
    syncControls();
  };

  const runAction = async (
    action: () => Promise<HostedPlayStatusView>,
    failureKey: HostedPlayActionFailureKey,
  ) => {
    pending = true;
    message.textContent = '';
    syncControls();
    try {
      renderStatus(await action());
    } catch (err) {
      console.error('hosted play panel request failed:', err);
      message.textContent = err instanceof HostedPlayCompatibilityError
        ? t('hudChrome.hostedPlay.serverRestartRequired')
        : t(failureKey);
    } finally {
      pending = false;
      syncControls();
    }
  };

  const updateSettings = (patch: Partial<HostedPlaySettingsView>) => {
    const status = currentStatus;
    if (!status) return;
    void runAction(
      () =>
        hooks.updateSettings({
          resumeOnLogin: patch.resumeOnLogin ?? status.resumeOnLogin,
          partyMode: patch.partyMode ?? status.partyMode,
          actionLogEnabled: patch.actionLogEnabled ?? status.actionLogEnabled,
          autoInviteNearbyPlayers:
            patch.autoInviteNearbyPlayers ?? status.autoInviteNearbyPlayers,
          autoInviteNearbyTargetPartySize:
            patch.autoInviteNearbyTargetPartySize ?? status.autoInviteNearbyTargetPartySize,
        }),
      'hudChrome.hostedPlay.settingsSaveFailed',
    );
  };

  enableBtn.addEventListener('click', () => {
    audio.click();
    void runAction(() => hooks.setEnabled(true), 'hudChrome.hostedPlay.updateFailed');
  });
  disableBtn.addEventListener('click', () => {
    audio.click();
    void runAction(() => hooks.setEnabled(false), 'hudChrome.hostedPlay.updateFailed');
  });
  refreshBtn.addEventListener('click', () => {
    audio.click();
    void runAction(() => hooks.status(), 'hudChrome.hostedPlay.statusLoadFailed');
  });
  detailsBtn.addEventListener('click', () => {
    audio.click();
    detailsOpen = !detailsOpen;
    if (currentStatus) renderDebugDetails(currentStatus);
    syncControls();
  });
  resumeBtn.addEventListener('click', () => {
    audio.click();
    updateSettings({ resumeOnLogin: !currentStatus?.resumeOnLogin });
  });
  actionLogBtn.addEventListener('click', () => {
    audio.click();
    updateSettings({ actionLogEnabled: !currentStatus?.actionLogEnabled });
  });
  autoInviteBtn.addEventListener('click', () => {
    audio.click();
    updateSettings({ autoInviteNearbyPlayers: !currentStatus?.autoInviteNearbyPlayers });
  });
  for (const { button, size } of autoInviteTargetButtons) {
    button.addEventListener('click', () => {
      audio.click();
      updateSettings({ autoInviteNearbyTargetPartySize: size });
    });
  }
  partySoloBtn.addEventListener('click', () => {
    audio.click();
    updateSettings({ partyMode: 'solo' });
  });
  partyFollowBtn.addEventListener('click', () => {
    audio.click();
    updateSettings({ partyMode: 'follow_leader' });
  });

  message.textContent = t('hudChrome.hostedPlay.loadingStatus');
  syncControls();
  void runAction(() => hooks.status(), 'hudChrome.hostedPlay.statusLoadFailed');

  el.querySelector('[data-close]')?.addEventListener('click', options.onClose);
}

function panelViewShell(target: HTMLElement, title: string): HTMLElement {
  target.innerHTML = `<div class="panel-title"><span>${esc(title)}</span><button type="button" class="x-btn" data-close aria-label="${esc(t('hud.options.returnToGame'))}">${svgIcon('close')}</button></div>`;
  const body = document.createElement('div');
  body.className = 'set-rows';
  target.appendChild(body);
  return body;
}

function appendDebugNote(parent: HTMLElement, text: string): void {
  const note = document.createElement('div');
  note.className = 'set-note hosted-play-debug-note';
  note.textContent = text;
  parent.appendChild(note);
}

function appendDebugGroup(parent: HTMLElement, title: string, rows: Array<readonly [string, string]>): void {
  const section = document.createElement('section');
  section.className = 'hosted-play-debug-group';
  const heading = document.createElement('div');
  heading.className = 'hosted-play-debug-heading';
  heading.textContent = title;
  const box = document.createElement('div');
  box.className = 'bug-info hosted-play-debug-rows';
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'bug-info-row';
    const labelEl = document.createElement('span');
    labelEl.className = 'bug-info-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'bug-info-val';
    valueEl.textContent = value;
    row.append(labelEl, valueEl);
    box.appendChild(row);
  }
  section.append(heading, box);
  parent.appendChild(section);
}

function appendDebugBlock(parent: HTMLElement, title: string, text: string): void {
  const section = document.createElement('section');
  section.className = 'hosted-play-debug-group';
  const heading = document.createElement('div');
  heading.className = 'hosted-play-debug-heading';
  heading.textContent = title;
  const pre = document.createElement('pre');
  pre.className = 'hosted-play-debug-block';
  pre.textContent = text.trim() ? text : t('hudChrome.hostedPlay.details.none');
  section.append(heading, pre);
  parent.appendChild(section);
}

function valueOrNone(value: string): string {
  return value.trim() ? value : t('hudChrome.hostedPlay.details.none');
}

function onOffText(value: boolean): string {
  return value ? t('hud.options.on') : t('hud.options.off');
}

function formatMilliseconds(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? t('hudChrome.hostedPlay.details.none')
    : t('hudChrome.hostedPlay.details.valueMs', {
        value: formatNumber(value, { maximumFractionDigits: 0 }),
      });
}

function formatNullableNumber(value: number | null, maximumFractionDigits: number): string {
  return value === null || !Number.isFinite(value)
    ? t('hudChrome.hostedPlay.details.none')
    : formatNumber(value, { maximumFractionDigits });
}

function formatTimeWithAge(atMs: number | null, ageMs?: number | null): string {
  if (atMs === null || !Number.isFinite(atMs)) return t('hudChrome.hostedPlay.details.none');
  const age = ageMs ?? Math.max(0, Date.now() - atMs);
  return t('hudChrome.hostedPlay.details.timeWithAge', {
    time: formatDateTime(atMs, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    age: formatMilliseconds(age),
  });
}

function formatPoint(point: HostedPlayDebugPointView | null): string {
  if (!point) return t('hudChrome.hostedPlay.details.none');
  return t('hudChrome.hostedPlay.details.pointValue', {
    x: formatNumber(point.x, { maximumFractionDigits: 1 }),
    z: formatNumber(point.z, { maximumFractionDigits: 1 }),
  });
}

function formatTravelGoal(goal: HostedPlayDebugTravelGoalView | null): string {
  if (!goal) return t('hudChrome.hostedPlay.details.none');
  return t('hudChrome.hostedPlay.details.travelGoalValue', {
    target: formatPoint(goal.target),
    range: formatNumber(goal.arrivalRange, { maximumFractionDigits: 1 }),
    key: goal.goalKey,
  });
}

function formatDebugJson(value: Record<string, unknown>): string {
  if (Object.keys(value).length === 0) return t('hudChrome.hostedPlay.details.none');
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return t('hudChrome.hostedPlay.details.unavailable');
  }
}

function formatDebugCommands(commands: HostedPlayDebugCommandView[]): string {
  if (commands.length === 0) return t('hudChrome.hostedPlay.details.none');
  return commands
    .map((command, index) => [
      t('hudChrome.hostedPlay.details.commandHeader', {
        index: formatNumber(index + 1, { maximumFractionDigits: 0 }),
        summary: command.summary,
      }),
      command.payloadJson,
    ].join('\n'))
    .join('\n\n');
}

function formatCommandAges(commands: HostedPlayDebugCommandAgeView[]): string {
  if (commands.length === 0) return t('hudChrome.hostedPlay.details.none');
  return commands
    .map((command) => t('hudChrome.hostedPlay.details.commandAgeValue', {
      key: command.key,
      age: formatMilliseconds(command.ageMs),
    }))
    .join('\n');
}

function formatPendingReplies(replies: HostedPlayDebugPendingReplyView[]): string {
  if (replies.length === 0) return t('hudChrome.hostedPlay.details.none');
  return replies
    .map((reply) => [
      t('hudChrome.hostedPlay.details.pendingReplyHeader', {
        name: reply.toName,
        revision: formatNumber(reply.revision, { maximumFractionDigits: 0 }),
      }),
      `${t('hudChrome.hostedPlay.details.pendingReplyIncoming')}: ${valueOrNone(reply.incomingText)}`,
      `${t('hudChrome.hostedPlay.details.pendingReplyFallback')}: ${valueOrNone(reply.fallbackText)}`,
      `${t('hudChrome.hostedPlay.details.pendingReplyDue')}: ${formatMilliseconds(reply.dueInMs)}`,
      `${t('hudChrome.hostedPlay.details.pendingReplyAskedFriend')}: ${onOffText(reply.askedForFriend)}`,
      `${t('hudChrome.hostedPlay.details.pendingReplyLlmStatus')}: ${valueOrNone(reply.llmStatus)}`,
      `${t('hudChrome.hostedPlay.details.pendingReplyLlmReply')}: ${valueOrNone(reply.llmReplyText)}`,
      `${t('hudChrome.hostedPlay.details.pendingReplyLlmFriend')}: ${valueOrNone(reply.llmFriendAction)}`,
      `${t('hudChrome.hostedPlay.details.pendingReplyPresence')}: ${valueOrNone(reply.llmPresenceEmote)}`,
      `${t('hudChrome.hostedPlay.details.pendingReplyRequested')}: ${formatMilliseconds(reply.llmRequestedAgoMs)}`,
    ].join('\n'))
    .join('\n\n');
}

function statusText(status: HostedPlayStatusView): string {
  switch (status.mode) {
    case 'offline':
      return t('hudChrome.hostedPlay.state.offline');
    case 'disabled':
      return t('hudChrome.hostedPlay.state.disabled');
    case 'paused':
      return t('hudChrome.hostedPlay.state.paused');
    case 'active':
    default:
      return t('hudChrome.hostedPlay.state.active');
  }
}

function pauseReasonText(status: HostedPlayStatusView): string {
  switch (status.pauseReason) {
    case 'runtime_error':
      return t('hudChrome.hostedPlay.pause.runtimeError');
    default:
      return '';
  }
}

function partyModeText(status: HostedPlayStatusView): string {
  return status.partyMode === 'follow_leader'
    ? t('hudChrome.hostedPlay.partyMode.followLeader')
    : t('hudChrome.hostedPlay.partyMode.solo');
}

function groupModeText(status: HostedPlayStatusView): string {
  switch (status.groupMode) {
    case 'accept_invite':
      return t('hudChrome.hostedPlay.groupMode.acceptInvite');
    case 'assist_party':
      return t('hudChrome.hostedPlay.groupMode.assistParty');
    case 'brain':
      return t('hudChrome.hostedPlay.groupMode.brain');
    case 'follow_leader':
      return t('hudChrome.hostedPlay.groupMode.followLeader');
    case 'hold_regroup':
      return t('hudChrome.hostedPlay.groupMode.holdRegroup');
    case 'invite_nearby':
      return t('hudChrome.hostedPlay.groupMode.inviteNearby');
    case 'prepare_party':
      return t('hudChrome.hostedPlay.groupMode.prepareParty');
    default:
      return t('hudChrome.hostedPlay.groupMode.none');
  }
}

function partyIntentText(kind: string, behavior: string): string {
  const kindText = partyIntentKindText(kind);
  const behaviorText = partyIntentBehaviorText(behavior);
  if (kindText && behaviorText) {
    return t('hudChrome.hostedPlay.details.partyIntentValue', {
      kind: kindText,
      behavior: behaviorText,
    });
  }
  return kindText || behaviorText || t('hudChrome.hostedPlay.details.none');
}

function partyRoleText(role: string): string {
  switch (role) {
    case 'tank':
      return t('hudChrome.hostedPlay.partyRole.tank');
    case 'healer':
      return t('hudChrome.hostedPlay.partyRole.healer');
    case 'dps':
      return t('hudChrome.hostedPlay.partyRole.dps');
    default:
      return t('hudChrome.hostedPlay.details.none');
  }
}

function partyIntentKindText(kind: string): string {
  switch (kind) {
    case 'route_plan':
      return t('hudChrome.hostedPlay.partyIntent.routePlan');
    case 'buffs':
      return t('hudChrome.hostedPlay.partyIntent.buffs');
    case 'focus':
      return t('hudChrome.hostedPlay.partyIntent.focus');
    case 'praise':
      return t('hudChrome.hostedPlay.partyIntent.praise');
    case 'correction':
      return t('hudChrome.hostedPlay.partyIntent.correction');
    case 'recovery':
      return t('hudChrome.hostedPlay.partyIntent.recovery');
    default:
      return '';
  }
}

function partyIntentBehaviorText(behavior: string): string {
  switch (behavior) {
    case 'advance':
      return t('hudChrome.hostedPlay.partyBehavior.advance');
    case 'prepare':
      return t('hudChrome.hostedPlay.partyBehavior.prepare');
    case 'assist':
      return t('hudChrome.hostedPlay.partyBehavior.assist');
    case 'celebrate':
      return t('hudChrome.hostedPlay.partyBehavior.celebrate');
    case 'regroup':
      return t('hudChrome.hostedPlay.partyBehavior.regroup');
    case 'recover':
      return t('hudChrome.hostedPlay.partyBehavior.recover');
    default:
      return '';
  }
}

function llmDecisionStatusText(value: HostedPlayLlmDecisionStatusView): string {
  switch (value) {
    case 'accepted':
      return t('hudChrome.hostedPlay.llmStatus.accepted');
    case 'cache_hit':
      return t('hudChrome.hostedPlay.llmStatus.cacheHit');
    case 'rejected':
      return t('hudChrome.hostedPlay.llmStatus.rejected');
    case 'error':
      return t('hudChrome.hostedPlay.llmStatus.error');
    case 'budget_denied':
      return t('hudChrome.hostedPlay.llmStatus.budgetDenied');
    case 'disabled':
      return t('hudChrome.hostedPlay.llmStatus.disabled');
    default:
      return '';
  }
}

function llmPlanText(status: HostedPlayStatusView): string {
  if (status.llmPlanPending) return t('hudChrome.hostedPlay.llmStatus.pending');
  return llmDecisionStatusText(status.llmPlanStatus);
}

function llmModeText(value: string): string {
  switch (value) {
    case 'quiet':
      return t('hudChrome.hostedPlay.llmMode.quiet');
    case 'brief':
      return t('hudChrome.hostedPlay.llmMode.brief');
    case 'friendly':
      return t('hudChrome.hostedPlay.llmMode.friendly');
    case 'helpful':
      return t('hudChrome.hostedPlay.llmMode.helpful');
    default:
      return '';
  }
}

function lastSocialActionText(value: string): string {
  if (!value) return '';
  if (value.startsWith('friend_add:')) {
    return t('hudChrome.hostedPlay.socialAction.friendAdd', { name: value.slice('friend_add:'.length) });
  }
  if (value.startsWith('reply:')) {
    return t('hudChrome.hostedPlay.socialAction.reply', { name: value.slice('reply:'.length) });
  }
  if (value.startsWith('/wave ')) {
    return t('hudChrome.hostedPlay.socialAction.wave', { name: value.slice('/wave '.length) });
  }
  if (value.startsWith('/cheer ')) {
    return t('hudChrome.hostedPlay.socialAction.cheer', { name: value.slice('/cheer '.length) });
  }
  return t('hudChrome.hostedPlay.socialAction.sentChat');
}
