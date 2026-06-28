import { audio } from '../game/audio';
import { esc } from './esc';
import { formatNumber, t } from './i18n';
import { svgIcon } from './ui_icons';

export type HostedPlayPartyModeView =
  | 'solo'
  | 'follow_leader';

export type HostedPlayGroupModeView =
  | ''
  | 'brain'
  | 'follow_leader'
  | 'hold_regroup';

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

  let pending = false;
  let currentStatus: HostedPlayStatusView | null = null;

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

    const resumeOnLogin = currentStatus?.resumeOnLogin ?? false;
    resumeBtn.disabled = pending || !currentStatus;
    resumeBtn.textContent = resumeOnLogin ? t('hud.options.on') : t('hud.options.off');
    resumeBtn.classList.toggle('off', !resumeOnLogin);
    resumeBtn.setAttribute('aria-pressed', String(resumeOnLogin));
    resumeBtn.setAttribute('aria-label', t('hudChrome.hostedPlay.resumeOnLogin'));

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

  const renderStatus = (status: HostedPlayStatusView) => {
    currentStatus = status;
    statusBox.replaceChildren();
    appendRow(t('hudChrome.hostedPlay.statusLabel'), statusText(status));
    appendRow(
      t('hudChrome.hostedPlay.objectiveLabel'),
      status.objectiveLabel || t('hudChrome.hostedPlay.objectiveNone'),
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
      message.textContent = t(failureKey);
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
  resumeBtn.addEventListener('click', () => {
    audio.click();
    updateSettings({ resumeOnLogin: !currentStatus?.resumeOnLogin });
  });
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
    case 'brain':
      return t('hudChrome.hostedPlay.groupMode.brain');
    case 'follow_leader':
      return t('hudChrome.hostedPlay.groupMode.followLeader');
    case 'hold_regroup':
      return t('hudChrome.hostedPlay.groupMode.holdRegroup');
    default:
      return t('hudChrome.hostedPlay.groupMode.none');
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
